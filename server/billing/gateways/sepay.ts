import { gatewayMeta } from '../../../shared/billing.js';
import { bankPayment, bankReady, normalizeBank, secretOk } from './bankAccount.js';
import type { Gateway } from './types.js';

/**
 * SePay (sepay.vn): QR VietQR vào tài khoản ngân hàng cấu hình sẵn, SePay đọc biến động số dư và gửi webhook
 * { id, transferType: 'in'|'out', transferAmount, content, ... } kèm header "Authorization: Apikey <khoá>".
 * Ghép đơn theo mã trong nội dung chuyển khoản.
 */
export const sepayGateway: Gateway = {
  meta: gatewayMeta('sepay')!,
  normalize: (s) => ({ ...normalizeBank(s), webhookKey: (s.webhookKey ?? '').trim() }),
  ready: bankReady,
  createPayment: bankPayment,

  webhook: ({ header, body }, s) => {
    if (!s.webhookKey) return { status: 503, body: { success: false, error: 'Chưa cấu hình khoá webhook' } };
    if (!secretOk(header('authorization'), s.webhookKey)) {
      return { status: 401, body: { success: false, error: 'Sai khoá' } };
    }
    const b = (body ?? {}) as Record<string, unknown>;
    return {
      status: 200,
      body: { success: true },
      txs: [
        {
          txId: String(b.id ?? b.referenceCode ?? ''),
          amount: Number(b.transferAmount) || 0,
          content: String(b.content ?? b.description ?? ''),
          incoming: b.transferType === 'in',
        },
      ],
    };
  },
};
