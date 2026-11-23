import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  contentHasCode,
  DEFAULT_PRO_MONTHS,
  extendProUntil,
  newOrderCode,
  ORDER_TTL_MS,
  type BillingOrder,
  type BillingPublic,
  type ProOption,
} from '../../shared/billing.js';
import { config } from '../config.js';
import { findUserById, setPlan } from '../auth/users.js';

/* Thanh toán gói Pro: server-data/billing.json (cấu hình) + billing-orders.json (đơn, giao dịch chưa khớp) */

export interface BillingConfig {
  bankBin: string;
  accountNo: string;
  accountName: string;
  options: ProOption[];
  /** Khoá API đặt ở SePay (header "Authorization: Apikey <khoá>") — không trả về cho khách */
  webhookKey: string;
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
  /** Mã giao dịch đã xử lý (SePay có thể gửi lại) */
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

const cleanOptions = (list: unknown): ProOption[] => {
  const arr = Array.isArray(list) ? list : [];
  const opts = arr
    .map((o) => ({ months: Math.round(Number(o?.months)), price: Math.max(0, Math.round(Number(o?.price) || 0)) }))
    .filter((o) => o.months > 0 && o.months <= 60);
  return opts.length ? opts : DEFAULT_PRO_MONTHS.map((months) => ({ months, price: 0 }));
};

export function getBillingConfig(): BillingConfig {
  const c = readJson<Partial<BillingConfig>>(file('billing.json')) ?? {};
  return {
    bankBin: String(c.bankBin ?? ''),
    accountNo: String(c.accountNo ?? ''),
    accountName: String(c.accountName ?? ''),
    options: cleanOptions(c.options),
    webhookKey: String(c.webhookKey ?? ''),
  };
}

export function saveBillingConfig(next: Partial<BillingConfig>): BillingConfig {
  const cur = getBillingConfig();
  const merged: BillingConfig = {
    bankBin: next.bankBin !== undefined ? String(next.bankBin).replace(/\D/g, '') : cur.bankBin,
    accountNo: next.accountNo !== undefined ? String(next.accountNo).replace(/\s/g, '') : cur.accountNo,
    // Tên chủ tài khoản: chữ hoa không dấu như trên app ngân hàng
    accountName:
      next.accountName !== undefined
        ? String(next.accountName)
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toUpperCase()
            .trim()
        : cur.accountName,
    options: next.options !== undefined ? cleanOptions(next.options) : cur.options,
    webhookKey: next.webhookKey !== undefined ? String(next.webhookKey).trim() : cur.webhookKey,
  };
  writeJson(file('billing.json'), merged);
  return merged;
}

export function publicBilling(c = getBillingConfig()): BillingPublic {
  const options = c.options.filter((o) => o.price > 0);
  return {
    bankBin: c.bankBin,
    accountNo: c.accountNo,
    accountName: c.accountName,
    options,
    ready: !!(c.bankBin && c.accountNo && c.accountName && options.length),
  };
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

/** Tạo đơn (dùng lại đơn đang chờ cùng thời hạn còn hạn QR) */
export function createOrder(userId: string, months: number, now = Date.now()): BillingOrder {
  const user = findUserById(userId);
  if (!user) throw new BillingError('Không tìm thấy tài khoản');
  if (user.role === 'owner') throw new BillingError('Quản trị viên đã có đủ tính năng');
  const pub = publicBilling();
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
  };
  f.orders.push(order);
  writeOrders(f);
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

export interface IncomingTx {
  txId: string;
  amount: number;
  content: string;
  /** Chỉ xử lý tiền vào */
  incoming: boolean;
}

export type TxResult =
  | { kind: 'activated'; order: BillingOrder }
  | { kind: 'duplicate' }
  | { kind: 'ignored' }
  | { kind: 'unmatched'; note: string };

/**
 * Giao dịch từ ngân hàng (webhook): tìm đơn theo mã trong nội dung, đủ tiền → lên Pro.
 * Nhận cả đơn đã hết hạn QR / đã huỷ (khách vẫn chuyển tiền) — chỉ bỏ qua đơn đã thanh toán.
 */
export function applyTransaction(tx: IncomingTx, now = Date.now()): TxResult {
  if (!tx.incoming || !(tx.amount > 0)) return { kind: 'ignored' };
  const f = readOrders();
  if (tx.txId && f.seenTx.includes(tx.txId)) return { kind: 'duplicate' };
  if (tx.txId) f.seenTx.push(tx.txId);
  const order = f.orders.find((o) => o.status !== 'paid' && contentHasCode(tx.content, o.code));
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

/** Quản trị viên xác nhận tay (vd khách ghi sai nội dung) */
export function markPaidManually(id: string, now = Date.now()): BillingOrder | null {
  const f = readOrders();
  const o = f.orders.find((x) => x.id === id);
  if (!o) return null;
  if (o.status !== 'paid') activate(o, 'manual', null, null, now);
  writeOrders(f);
  return o;
}

/** So khoá webhook (thời gian không đổi) */
export function webhookKeyOk(header: string | undefined, key: string): boolean {
  if (!key || !header) return false;
  const got = header.replace(/^(apikey|bearer)\s+/i, '').trim();
  const a = Buffer.from(got);
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
