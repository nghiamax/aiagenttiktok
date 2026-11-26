import { gatewayMeta, ORDER_TTL_MS } from '../../../shared/billing.js';
import type { Gateway } from './types.js';
import { confirmPayosWebhook, createPayosLink, getPayosLink, payosVerify, type PayosKeys } from './payosApi.js';

/**
 * payOS (payos.vn): mỗi đơn 1 link / QR riêng (orderCode), webhook ký HMAC-SHA256 bằng Checksum Key.
 * Ghép đơn theo orderCode. Webhook không tới (chạy trên máy) → trang thanh toán hỏi payOS (`sync`).
 */

const keysOf = (s: Record<string, string>): PayosKeys => ({
  clientId: s.clientId ?? '',
  apiKey: s.apiKey ?? '',
  checksumKey: s.checksumKey ?? '',
});

/** orderCode: số nguyên dương duy nhất (giây hiện tại + 3 số ngẫu nhiên, ~13 chữ số) */
function newOrderCode(used: Set<string>, now: number): number {
  for (let sec = Math.floor(now / 1000); ; sec++) {
    const n = sec * 1000 + Math.floor(Math.random() * 1000);
    if (!used.has(String(n))) return n;
  }
}

export const payosGateway: Gateway = {
  meta: gatewayMeta('payos')!,

  normalize: (s) => ({
    clientId: (s.clientId ?? '').trim(),
    apiKey: (s.apiKey ?? '').trim(),
    checksumKey: (s.checksumKey ?? '').trim(),
  }),

  ready: (s) => !!(s.clientId && s.apiKey && s.checksumKey),

  createPayment: async ({ order, origin, now, usedRefs }, s) => {
    const orderCode = newOrderCode(usedRefs, now);
    const back = `${origin.replace(/\/+$/, '')}/upgrade`;
    const link = await createPayosLink(keysOf(s), {
      orderCode,
      amount: order.amount,
      // Mã đơn 9 ký tự — payOS giới hạn 9 ký tự với tài khoản chưa liên kết
      description: order.code,
      returnUrl: back,
      cancelUrl: back,
      expiredAt: Math.floor((now + ORDER_TTL_MS) / 1000),
    });
    return {
      ref: String(orderCode),
      linkId: link.paymentLinkId,
      checkoutUrl: link.checkoutUrl,
      description: link.description || order.code,
      bankBin: link.bin,
      accountNo: link.accountNumber,
      accountName: link.accountName,
    };
  },

  webhook: ({ body }, s) => {
    if (!s.checksumKey) return { status: 503, body: { success: false, error: 'Chưa cấu hình payOS' } };
    const b = (body ?? {}) as { code?: string; data?: Record<string, unknown>; signature?: string };
    if (!payosVerify(b.data, b.signature, s.checksumKey)) {
      return { status: 401, body: { success: false, error: 'Sai chữ ký' } };
    }
    const d = b.data!;
    const paid = (b.code ?? '00') === '00' && (d.code ?? '00') === '00';
    if (!paid) return { status: 200, body: { success: true, result: 'ignored' } };
    return {
      status: 200,
      body: { success: true },
      txs: [
        {
          txId: `payos:${d.orderCode}`,
          orderRef: String(d.orderCode),
          amount: Number(d.amount) || 0,
          content: String(d.description ?? ''),
          incoming: true,
        },
      ],
    };
  },

  sync: async (order, s) => {
    if (!order.payment?.ref) return null;
    const info = await getPayosLink(keysOf(s), Number(order.payment.ref));
    const paid = Number(info.amountPaid) || 0;
    if (info.status !== 'PAID' && paid < order.amount) return null;
    return {
      txId: `payos:${order.payment.ref}`,
      orderRef: order.payment.ref,
      amount: paid || order.amount,
      content: order.code,
      incoming: true,
    };
  },

  registerWebhook: async (s, url) => {
    const r = await confirmPayosWebhook(keysOf(s), url);
    return `Đã đăng ký webhook với payOS${r.name ? ` (${r.name})` : ''}.`;
  },
};
