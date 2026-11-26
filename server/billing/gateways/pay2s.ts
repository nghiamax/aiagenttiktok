import { gatewayMeta } from '../../../shared/billing.js';
import { bankPayment, bankReady, normalizeBank, secretOk } from './bankAccount.js';
import type { Gateway } from './types.js';

/**
 * Pay2S (pay2s.vn): đọc biến động số dư, gửi webhook kèm "Authorization: Bearer <token>":
 * { transactions: [{ id, gateway, transactionDate, transactionNumber, accountNumber, content,
 *   transferType: 'IN' | 'OUT', transferAmount, checksum }] }. Trả { success: true } để Pay2S không gửi lại.
 * Tài liệu: https://docs.pay2s.vn/webhook/tai-lieu-ky-thuat.html
 */
export const pay2sGateway: Gateway = {
  meta: gatewayMeta('pay2s')!,
  normalize: (s) => ({ ...normalizeBank(s), token: (s.token ?? '').trim() }),
  ready: bankReady,
  createPayment: bankPayment,

  webhook: ({ header, body }, s) => {
    if (!s.token) return { status: 503, body: { success: false, error: 'Chưa cấu hình token webhook' } };
    if (!secretOk(header('authorization'), s.token))
      return { status: 401, body: { success: false, error: 'Sai token' } };
    const list = ((body ?? {}) as { transactions?: unknown }).transactions;
    const txs = (Array.isArray(list) ? list : []).map((raw) => {
      const t = (raw ?? {}) as Record<string, unknown>;
      return {
        txId: `pay2s:${String(t.id ?? t.transactionNumber ?? '')}`,
        amount: Number(t.transferAmount) || 0,
        content: String(t.content ?? ''),
        incoming: String(t.transferType ?? '').toUpperCase() === 'IN',
      };
    });
    return { status: 200, body: { success: true }, txs };
  },
};
