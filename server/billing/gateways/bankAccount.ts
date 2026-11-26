import crypto from 'node:crypto';
import type { BillingOrder, GatewaySettings, OrderPayment } from '../../../shared/billing.js';

/** Dùng chung cho các cổng QR chuyển khoản thẳng vào tài khoản ngân hàng (SePay, Pay2S, tuỳ chỉnh, thủ công) */

const upperNoAccent = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase().trim();

/** Làm sạch 3 ô tài khoản: mã BIN chỉ số, số TK bỏ dấu cách, tên chủ TK chữ hoa không dấu như app ngân hàng */
export const normalizeBank = (s: GatewaySettings): GatewaySettings => ({
  bankBin: (s.bankBin ?? '').replace(/\D/g, ''),
  accountNo: (s.accountNo ?? '').replace(/\s/g, ''),
  accountName: upperNoAccent(s.accountName ?? ''),
});

export const bankReady = (s: GatewaySettings) => !!(s.bankBin && s.accountNo && s.accountName);

/** Thanh toán = QR vào tài khoản cấu hình, nội dung = mã đơn */
export const bankPayment = async ({ order }: { order: BillingOrder }, s: GatewaySettings): Promise<OrderPayment> => ({
  bankBin: s.bankBin,
  accountNo: s.accountNo,
  accountName: s.accountName,
  description: order.code,
});

/** So khoá trong header (bỏ "Bearer " / "Apikey " đầu), thời gian không đổi */
export function secretOk(header: string | undefined, key: string): boolean {
  if (!key || !header) return false;
  const got = header.replace(/^(apikey|bearer)\s+/i, '').trim();
  const a = Buffer.from(got);
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
