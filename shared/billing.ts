/**
 * Mua gói Pro bằng chuyển khoản ngân hàng (VietQR) + tự kích hoạt khi tiền về (webhook SePay).
 * Dùng chung web + server. Không có dữ liệu ngân hàng mặc định — Quản trị viên tự nhập ở trang Tài khoản.
 */

/** Ngân hàng phổ biến (mã BIN theo chuẩn VietQR / Napas) */
export const BANKS: { bin: string; code: string; name: string }[] = [
  { bin: '970436', code: 'VCB', name: 'Vietcombank' },
  { bin: '970407', code: 'TCB', name: 'Techcombank' },
  { bin: '970422', code: 'MB', name: 'MB Bank' },
  { bin: '970416', code: 'ACB', name: 'ACB' },
  { bin: '970418', code: 'BIDV', name: 'BIDV' },
  { bin: '970415', code: 'ICB', name: 'VietinBank' },
  { bin: '970405', code: 'VBA', name: 'Agribank' },
  { bin: '970432', code: 'VPB', name: 'VPBank' },
  { bin: '970423', code: 'TPB', name: 'TPBank' },
  { bin: '970403', code: 'STB', name: 'Sacombank' },
  { bin: '970441', code: 'VIB', name: 'VIB' },
  { bin: '970443', code: 'SHB', name: 'SHB' },
  { bin: '970437', code: 'HDB', name: 'HDBank' },
  { bin: '970448', code: 'OCB', name: 'OCB' },
  { bin: '970426', code: 'MSB', name: 'MSB' },
  { bin: '970431', code: 'EIB', name: 'Eximbank' },
  { bin: '970440', code: 'SEAB', name: 'SeABank' },
  { bin: '970449', code: 'LPB', name: 'LPBank' },
];

export const bankName = (bin: string) => BANKS.find((b) => b.bin === bin)?.name ?? bin;

/** Lựa chọn thời hạn gói Pro; price = 0 → chưa bán */
export interface ProOption {
  months: number;
  price: number;
}

export const DEFAULT_PRO_MONTHS = [1, 3, 12];
export const DAYS_PER_MONTH = 30;

export const monthsLabel = (m: number) => (m % 12 === 0 ? `${m / 12} năm` : `${m} tháng`);

/** Thông tin thanh toán hiện cho khách (không có khoá webhook) */
export interface BillingPublic {
  bankBin: string;
  accountNo: string;
  accountName: string;
  options: ProOption[];
  /** Đã nhập đủ ngân hàng + ít nhất 1 giá */
  ready: boolean;
}

export type OrderStatus = 'pending' | 'paid' | 'cancelled';

export interface BillingOrder {
  id: string;
  /** Nội dung chuyển khoản, vd SA7K2M9QXR */
  code: string;
  userId: string;
  username: string;
  months: number;
  amount: number;
  status: OrderStatus;
  createdAt: string;
  /** Hết hạn hiển thị QR (vẫn nhận nếu khách chuyển muộn) */
  expiresAt: string;
  paidAt: string | null;
  /** Mã giao dịch ngân hàng (SePay id) đã kích hoạt đơn */
  txId: string | null;
  paidAmount: number | null;
  /** manual = Quản trị viên xác nhận tay */
  paidBy: 'webhook' | 'manual' | null;
  proUntil: string | null;
}

/** QR hiện trong ORDER_TTL_MS; quá hạn khách tạo đơn mới (đơn cũ vẫn nhận tiền nếu chuyển) */
export const ORDER_TTL_MS = 2 * 60 * 60_000;
export const ORDER_PREFIX = 'SA';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newOrderCode(rand: () => number = Math.random): string {
  let s = ORDER_PREFIX;
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

/** Nội dung CK sau khi ngân hàng xử lý (bỏ dấu cách, ký tự lạ, chữ hoa) */
export const normalizeContent = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Nội dung chuyển khoản có chứa mã đơn không (ngân hàng hay thêm chữ trước / sau) */
export const contentHasCode = (content: string, code: string) => normalizeContent(content).includes(code);

/** Hạn Pro mới: đang còn Pro thì cộng nối tiếp, hết / chưa có thì tính từ bây giờ. Pro không hạn giữ không hạn. */
export function extendProUntil(
  current: { plan?: string; proUntil?: string | null },
  months: number,
  now = Date.now(),
): string | null {
  if (current.plan === 'pro' && !current.proUntil) return null;
  const base = current.plan === 'pro' && current.proUntil ? Math.max(Date.parse(current.proUntil), now) : now;
  return new Date(base + months * DAYS_PER_MONTH * 86_400_000).toISOString();
}

/** Ảnh QR VietQR (img.vietqr.io) — có sẵn số tiền + nội dung, khách quét bằng app ngân hàng */
export function vietQrUrl(
  b: Pick<BillingPublic, 'bankBin' | 'accountNo' | 'accountName'>,
  amount: number,
  code: string,
) {
  const q = new URLSearchParams({ amount: String(amount), addInfo: code, accountName: b.accountName });
  return `https://img.vietqr.io/image/${encodeURIComponent(b.bankBin)}-${encodeURIComponent(b.accountNo)}-compact2.png?${q}`;
}
