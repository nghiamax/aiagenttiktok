import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  contentHasCode,
  DEFAULT_PRO_MONTHS,
  extendProUntil,
  GATEWAYS,
  isGatewayId,
  isLifetime,
  LEGACY_PRO_MONTHS,
  MAX_PRO_MONTHS,
  MAX_PRO_OPTIONS,
  newOrderCode,
  ORDER_TTL_MS,
  type BillingOrder,
  type BillingPublic,
  type GatewayId,
  type GatewaySettings,
  type PayAccount,
  type ProOption,
} from '../../shared/billing.js';
import { config } from '../config.js';
import { findUserById, setPlan } from '../auth/users.js';
import { gatewayOf, type IncomingTx } from './gateways/index.js';

export type { IncomingTx } from './gateways/index.js';

/* Thanh toán gói Pro: server-data/billing.json (cấu hình) + billing-orders.json (đơn, giao dịch chưa khớp) */

export interface BillingConfig {
  /** Cổng thanh toán dùng cho đơn mới (webhook mọi cổng vẫn nhận — đơn cũ trả muộn vẫn kích hoạt) */
  provider: GatewayId;
  options: ProOption[];
  /** Cấu hình từng cổng theo `fields` khai báo trong GATEWAYS — không trả về cho khách */
  gateways: Record<GatewayId, GatewaySettings>;
}

/** Giao dịch tiền vào không khớp đơn nào (sai nội dung / thiếu tiền) — Quản trị viên xem + xác nhận tay */
export interface UnmatchedTx {
  txId: string;
  amount: number;
  content: string;
  at: string;
  note: string;
}

interface OrdersFile {
  orders: BillingOrder[];
  unmatched: UnmatchedTx[];
  /** Mã giao dịch đã xử lý (cổng có thể gửi lại) */
  seenTx: string[];
}

const MAX_KEEP = 2000;
const file = (n: string) => path.join(config.dataDir, n);

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(p: string, data: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, p);
}

/** Làm sạch mốc thời hạn: số nguyên 1…60 tháng, bỏ trùng (giữ dòng đầu), xếp tăng dần */
const cleanOptions = (list: unknown): ProOption[] => {
  const arr = Array.isArray(list) ? list : [];
  const seen = new Set<number>();
  const opts = arr
    .map((o) => ({ months: Math.round(Number(o?.months)), price: Math.max(0, Math.round(Number(o?.price) || 0)) }))
    .filter((o) => o.months >= 0 && o.months <= MAX_PRO_MONTHS && !seen.has(o.months) && seen.add(o.months))
    // Vĩnh viễn (0) xếp cuối
    .sort((a, b) => (isLifetime(a.months) ? 1e9 : a.months) - (isLifetime(b.months) ? 1e9 : b.months))
    .slice(0, MAX_PRO_OPTIONS);
  return opts.length ? opts : DEFAULT_PRO_MONTHS.map((months) => ({ months, price: 0 }));
};

/** Cấu hình lưu trước khi có mốc 3/6/9/12 mà vẫn đúng bộ mặc định cũ 1/3/12 → đổi sang mốc mới, giữ giá mốc trùng */
function migrateOptions(opts: ProOption[]): ProOption[] {
  const same =
    opts.length === LEGACY_PRO_MONTHS.length && opts.every((o, i) => o.months === LEGACY_PRO_MONTHS[i]);
  if (!same) return opts;
  return DEFAULT_PRO_MONTHS.map((months) => ({ months, price: opts.find((o) => o.months === months)?.price ?? 0 }));
}

/** Chỉ giữ các ô cổng khai báo (chuỗi), rồi để cổng tự làm sạch */
function cleanSettings(id: GatewayId, raw: unknown, cur: GatewaySettings = {}): GatewaySettings {
  const g = gatewayOf(id)!;
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const s: GatewaySettings = {};
  for (const f of g.meta.fields) s[f.key] = src[f.key] !== undefined ? String(src[f.key] ?? '') : (cur[f.key] ?? '');
  return g.normalize ? g.normalize(s) : s;
}

type StoredConfig = Partial<BillingConfig> & {
  // Bản cũ (chỉ SePay / payOS để riêng): bankBin, accountNo, accountName, webhookKey, payos
  bankBin?: string;
  accountNo?: string;
  accountName?: string;
  webhookKey?: string;
  payos?: GatewaySettings;
  optionsV?: number;
};

export function getBillingConfig(): BillingConfig {
  const c = readJson<StoredConfig>(file('billing.json')) ?? {};
  const legacy: Partial<Record<GatewayId, unknown>> = {
    sepay: { bankBin: c.bankBin, accountNo: c.accountNo, accountName: c.accountName, webhookKey: c.webhookKey },
    payos: c.payos,
  };
  const gateways = {} as Record<GatewayId, GatewaySettings>;
  for (const g of GATEWAYS) gateways[g.id] = cleanSettings(g.id, c.gateways?.[g.id] ?? legacy[g.id]);
  return {
    // File cũ chưa có provider = SePay (cách duy nhất trước đây)
    provider: isGatewayId(c.provider) ? c.provider : 'sepay',
    // optionsV 2 = đã có mốc do Quản trị viên tự đặt → không đổi nữa
    options: c.optionsV === 2 ? cleanOptions(c.options) : migrateOptions(cleanOptions(c.options)),
    gateways,
  };
}

export interface BillingConfigPatch {
  provider?: string;
  options?: unknown;
  gateways?: Partial<Record<string, Record<string, unknown>>>;
}

export function saveBillingConfig(next: BillingConfigPatch): BillingConfig {
  const cur = getBillingConfig();
  const gateways = { ...cur.gateways };
  for (const g of GATEWAYS) {
    const patch = next.gateways?.[g.id];
    if (patch) gateways[g.id] = cleanSettings(g.id, patch, cur.gateways[g.id]);
  }
  const merged: BillingConfig = {
    provider: isGatewayId(next.provider) ? next.provider : cur.provider,
    options: next.options !== undefined ? cleanOptions(next.options) : cur.options,
    gateways,
  };
  writeJson(file('billing.json'), { ...merged, optionsV: 2 });
  return merged;
}

export function publicBilling(c = getBillingConfig()): BillingPublic {
  const options = c.options.filter((o) => o.price > 0);
  const g = gatewayOf(c.provider)!;
  return { provider: c.provider, options, ready: g.ready(c.gateways[c.provider]) && options.length > 0 };
}

function readOrders(): OrdersFile {
  const f = readJson<Partial<OrdersFile>>(file('billing-orders.json'));
  return { orders: f?.orders ?? [], unmatched: f?.unmatched ?? [], seenTx: f?.seenTx ?? [] };
}

function writeOrders(f: OrdersFile) {
  writeJson(file('billing-orders.json'), {
    orders: f.orders.slice(-MAX_KEEP),
    unmatched: f.unmatched.slice(-200),
    seenTx: f.seenTx.slice(-MAX_KEEP),
  });
}

export const listOrders = () => readOrders();

export function findOrder(id: string): BillingOrder | null {
  return readOrders().orders.find((o) => o.id === id) ?? null;
}

export class BillingError extends Error {}

/** Tài khoản nhận tiền + nội dung CK của đơn (đơn cũ chưa chụp thông tin → tài khoản SePay hiện tại) */
export function payTarget(o: BillingOrder): { account: PayAccount; content: string } | null {
  if (o.payment) return { account: o.payment, content: o.payment.description };
  if ((o.provider ?? 'sepay') !== 'sepay') return null;
  const s = getBillingConfig().gateways.sepay;
  if (!s.bankBin || !s.accountNo) return null;
  return { account: { bankBin: s.bankBin, accountNo: s.accountNo, accountName: s.accountName }, content: o.code };
}

/**
 * Tạo đơn (dùng lại đơn đang chờ cùng thời hạn + cùng cổng còn hạn QR), rồi nhờ cổng đang chọn tạo thanh toán.
 * `origin` = địa chỉ web để cổng đưa khách quay lại. Cổng lỗi → ném GatewayError, không lưu đơn.
 */
export async function createOrder(
  userId: string,
  months: number,
  now = Date.now(),
  origin = config.publicUrl ?? 'http://localhost:5173',
): Promise<BillingOrder> {
  const user = findUserById(userId);
  if (!user) throw new BillingError('Không tìm thấy tài khoản');
  if (user.role === 'owner') throw new BillingError('Quản trị viên đã có đủ tính năng');
  const cfg = getBillingConfig();
  const pub = publicBilling(cfg);
  if (!pub.ready) throw new BillingError('Chưa mở bán gói Pro — liên hệ quản trị viên');
  const opt = pub.options.find((o) => o.months === months);
  if (!opt) throw new BillingError('Thời hạn không hợp lệ');
  const f = readOrders();
  const reuse = f.orders.find(
    (o) =>
      o.userId === userId &&
      o.status === 'pending' &&
      o.months === months &&
      o.amount === opt.price &&
      (o.provider ?? 'sepay') === pub.provider &&
      Date.parse(o.expiresAt) > now + 10 * 60_000,
  );
  if (reuse) return reuse;
  const used = new Set(f.orders.map((o) => o.code));
  let code = newOrderCode();
  while (used.has(code)) code = newOrderCode();
  const order: BillingOrder = {
    id: crypto.randomUUID(),
    code,
    userId,
    username: user.username,
    months,
    amount: opt.price,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ORDER_TTL_MS).toISOString(),
    paidAt: null,
    txId: null,
    paidAmount: null,
    paidBy: null,
    proUntil: null,
    provider: pub.provider,
    payment: null,
  };
  const usedRefs = new Set(f.orders.flatMap((o) => (o.payment?.ref ? [o.payment.ref] : [])));
  order.payment = await gatewayOf(pub.provider)!.createPayment(
    { order, origin, now, usedRefs },
    cfg.gateways[pub.provider],
  );
  // Đọc lại trước khi ghi (gọi cổng mất vài giây, có thể có đơn / webhook khác chen vào)
  const latest = readOrders();
  latest.orders.push(order);
  writeOrders(latest);
  return order;
}

export function cancelOrder(id: string, userId: string): BillingOrder | null {
  const f = readOrders();
  const o = f.orders.find((x) => x.id === id && x.userId === userId);
  if (!o) return null;
  if (o.status === 'pending') o.status = 'cancelled';
  writeOrders(f);
  return o;
}

/** Kích hoạt Pro cho đơn (cộng nối tiếp hạn đang có) */
function activate(o: BillingOrder, by: 'webhook' | 'manual', txId: string | null, amount: number | null, now: number) {
  const user = findUserById(o.userId);
  const until = extendProUntil(user ?? {}, o.months, now);
  if (user) setPlan(user.id, 'pro', until);
  o.status = 'paid';
  o.paidAt = new Date(now).toISOString();
  o.paidBy = by;
  o.txId = txId;
  o.paidAmount = amount;
  o.proUntil = until;
}

export type TxResult =
  | { kind: 'activated'; order: BillingOrder }
  | { kind: 'duplicate' }
  | { kind: 'ignored' }
  | { kind: 'unmatched'; note: string };

/**
 * Tiền vào từ cổng: tìm đơn (theo mã đơn bên cổng nếu có, không thì theo mã trong nội dung), đủ tiền → lên Pro.
 * Nhận cả đơn đã hết hạn QR / đã huỷ (khách vẫn chuyển tiền) — chỉ bỏ qua đơn đã thanh toán.
 * Có `orderRef` mà không có đơn nào (vd webhook mẫu khi đăng ký URL) → bỏ qua, không ghi "chưa khớp".
 */
export function applyTransaction(tx: IncomingTx, now = Date.now()): TxResult {
  if (!tx.incoming || !(tx.amount > 0)) return { kind: 'ignored' };
  const f = readOrders();
  if (tx.txId && f.seenTx.includes(tx.txId)) return { kind: 'duplicate' };
  const byRef = tx.orderRef !== undefined;
  const matches = (o: BillingOrder) => (byRef ? o.payment?.ref === tx.orderRef : contentHasCode(tx.content, o.code));
  const order = f.orders.find((o) => o.status !== 'paid' && matches(o));
  if (!order && byRef) return f.orders.some(matches) ? { kind: 'duplicate' } : { kind: 'ignored' };
  if (tx.txId) f.seenTx.push(tx.txId);
  let result: TxResult;
  if (!order) {
    result = { kind: 'unmatched', note: 'Nội dung không có mã đơn' };
  } else if (tx.amount < order.amount) {
    result = { kind: 'unmatched', note: `Thiếu tiền cho đơn ${order.code} (cần ${order.amount})` };
  } else {
    activate(order, 'webhook', tx.txId || null, tx.amount, now);
    result = { kind: 'activated', order };
  }
  if (result.kind === 'unmatched') {
    f.unmatched.push({
      txId: tx.txId,
      amount: tx.amount,
      content: tx.content.slice(0, 200),
      at: new Date(now).toISOString(),
      note: result.note,
    });
  }
  writeOrders(f);
  return result;
}

const lastSync = new Map<string, number>();
/** Hỏi cổng tối đa 1 lần / 10 giây mỗi đơn */
const SYNC_EVERY_MS = 10_000;

/**
 * Dự phòng khi webhook không tới (chạy trên máy / chưa đăng ký webhook): web hỏi trạng thái đơn
 * → server hỏi cổng của đơn (chỉ đọc, cổng có `sync`), đã trả đủ tiền → kích hoạt như webhook.
 */
export async function syncOrder(o: BillingOrder, now = Date.now()): Promise<BillingOrder> {
  if (o.status === 'paid' || !o.payment) return o;
  const g = gatewayOf(o.provider ?? 'sepay');
  if (!g?.sync) return o;
  if (now - (lastSync.get(o.id) ?? 0) < SYNC_EVERY_MS) return o;
  lastSync.set(o.id, now);
  const s = getBillingConfig().gateways[g.meta.id];
  if (!g.ready(s)) return o;
  try {
    const tx = await g.sync(o, s);
    if (tx) applyTransaction(tx, now);
  } catch {
    /* cổng lỗi tạm thời → lần hỏi sau */
  }
  return findOrder(o.id) ?? o;
}

/** Quản trị viên xác nhận tay (vd khách ghi sai nội dung) */
export function markPaidManually(id: string, now = Date.now()): BillingOrder | null {
  const f = readOrders();
  const o = f.orders.find((x) => x.id === id);
  if (!o) return null;
  if (o.status !== 'paid') activate(o, 'manual', null, null, now);
  writeOrders(f);
  return o;
}
