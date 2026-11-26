import { gatewayMeta, type GatewaySettings } from '../../../shared/billing.js';
import { bankPayment, bankReady, normalizeBank, secretOk } from './bankAccount.js';
import type { Gateway, IncomingTx } from './types.js';

/**
 * Webhook tuỳ chỉnh: ghép bất kỳ dịch vụ báo biến động số dư nào mà không cần viết code — Quản trị viên điền
 * header chứa khoá + ô số tiền / nội dung / mã giao dịch / chiều tiền trong nội dung dịch vụ gửi tới
 * (đường dẫn dấu chấm, vd "data.amount"). Mặc định khớp webhook thường của Casso:
 * header "secure-token", { error, data: [{ id, description, amount, ... }] }.
 */

/** Giá trị mặc định khi để trống (Casso) */
export const CUSTOM_DEFAULTS: GatewaySettings = {
  authHeader: 'secure-token',
  listPath: 'data',
  amountPath: 'amount',
  contentPath: 'description',
  idPath: 'id',
  directionPath: '',
  directionIn: 'in',
};

/** Lấy giá trị theo đường dẫn dấu chấm ("data.0.amount"); trống = chính nó */
export function pick(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Số tiền dạng số hoặc chuỗi "1.500.000" / "1,500,000" / "-20000" */
function toAmount(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  const neg = s.startsWith('-');
  const n = Number(s.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

const trimPath = (v: string | undefined) => (v ?? '').trim().replace(/^\.+|\.+$/g, '');

export const customGateway: Gateway = {
  meta: gatewayMeta('custom')!,

  normalize: (s) => ({
    ...normalizeBank(s),
    authHeader: (s.authHeader ?? '').trim(),
    secret: (s.secret ?? '').trim(),
    listPath: trimPath(s.listPath),
    amountPath: trimPath(s.amountPath),
    contentPath: trimPath(s.contentPath),
    idPath: trimPath(s.idPath),
    directionPath: trimPath(s.directionPath),
    directionIn: (s.directionIn ?? '').trim(),
  }),

  ready: (s) => bankReady(s) && !!s.secret,
  createPayment: bankPayment,

  webhook: ({ header, body }, raw) => {
    const s = { ...CUSTOM_DEFAULTS, ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v)) };
    if (!raw.secret) return { status: 503, body: { success: false, error: 'Chưa cấu hình khoá bí mật' } };
    if (!secretOk(header(s.authHeader), raw.secret))
      return { status: 401, body: { success: false, error: 'Sai khoá' } };
    // Để trống ô danh sách: có "data" (Casso) thì lấy, không thì coi cả nội dung là 1 giao dịch
    const found = pick(body, s.listPath) ?? (raw.listPath ? undefined : body);
    const items = Array.isArray(found) ? found : found && typeof found === 'object' ? [found] : [];
    const txs: IncomingTx[] = items.map((item) => {
      const amount = toAmount(pick(item, s.amountPath));
      const dir = s.directionPath ? pick(item, s.directionPath) : undefined;
      const incoming =
        dir !== undefined ? String(dir).trim().toLowerCase() === s.directionIn.toLowerCase() : amount > 0;
      const id = pick(item, s.idPath);
      return {
        txId: id != null && id !== '' ? `custom:${String(id)}` : '',
        amount: Math.abs(amount),
        content: String(pick(item, s.contentPath) ?? ''),
        incoming,
      };
    });
    // Casso chế độ chặt kiểm tra "success": true
    return { status: 200, body: { success: true }, txs };
  },
};
