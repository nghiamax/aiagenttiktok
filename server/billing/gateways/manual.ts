import { gatewayMeta } from '../../../shared/billing.js';
import { bankPayment, bankReady, normalizeBank } from './bankAccount.js';
import type { Gateway } from './types.js';

/**
 * Chuyển khoản thủ công: chỉ hiện QR vào tài khoản cấu hình, không có webhook — Quản trị viên kiểm tra app
 * ngân hàng rồi bấm "Đã nhận tiền" (markPaidManually). Miễn phí, không phụ thuộc dịch vụ nào.
 */
export const manualGateway: Gateway = {
  meta: gatewayMeta('manual')!,
  normalize: normalizeBank,
  ready: bankReady,
  createPayment: bankPayment,
  webhook: () => ({ status: 404, body: { success: false, error: 'Cổng thủ công không có webhook' } }),
};
