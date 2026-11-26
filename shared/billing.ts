/**
 * Mua gói Pro bằng chuyển khoản ngân hàng (VietQR) + tự kích hoạt khi tiền về (webhook cổng thanh toán).
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

/**
 * Cổng thanh toán (payOS, SePay…). Mỗi cổng = 1 khai báo ở đây (tên, các ô cấu hình, hướng dẫn) + 1 file
 * server/billing/gateways/<id>.ts (tạo thanh toán, đọc webhook). Trang quản trị tự vẽ ô nhập theo `fields`,
 * webhook chung dạng /api/billing/webhook/<id> → thêm / đổi cổng không phải sửa trang hay route.
 */
export type GatewayId = 'payos' | 'sepay' | 'pay2s' | 'custom' | 'manual';
/** Tên cũ — giữ cho code đã có */
export type PaymentProvider = GatewayId;

export interface GatewayField {
  key: string;
  label: string;
  /** text (mặc định) · secret (khoá bí mật, ẩn được) · bank (chọn ngân hàng) · name (chữ hoa không dấu) · genkey (khoá tự tạo) */
  kind?: 'text' | 'secret' | 'bank' | 'name' | 'genkey';
  placeholder?: string;
  /** Dòng gợi ý dưới ô */
  help?: string;
  /** Có thể để trống */
  optional?: boolean;
  /** Ô nằm trong nhóm "Nâng cao" (thu gọn) */
  advanced?: boolean;
}

export interface GatewayMeta {
  id: GatewayId;
  name: string;
  site: string;
  hint: string;
  fields: GatewayField[];
  /** Các bước cài đặt hiện ở trang quản trị */
  steps: string[];
  /** Có nút "Đăng ký webhook" tự gọi cổng */
  registerWebhook?: boolean;
  /** Webhook không tới (chạy trên máy) thì trang thanh toán tự hỏi cổng */
  canSync?: boolean;
  /** Không có webhook — Quản trị viên tự xác nhận đơn */
  noWebhook?: boolean;
}

/** Ô tài khoản nhận tiền dùng chung cho các cổng QR chuyển khoản thẳng vào tài khoản */
const BANK_FIELDS: GatewayField[] = [
  { key: 'bankBin', label: 'Ngân hàng', kind: 'bank' },
  { key: 'accountNo', label: 'Số tài khoản' },
  { key: 'accountName', label: 'Tên chủ tài khoản', kind: 'name', placeholder: 'NGUYEN VAN A' },
];

export const GATEWAYS: GatewayMeta[] = [
  {
    id: 'payos',
    name: 'payOS',
    site: 'payos.vn',
    hint: 'payOS tạo mã QR riêng cho từng đơn + báo tiền về. Tiền vào tài khoản đã liên kết với payOS.',
    fields: [
      { key: 'clientId', label: 'Client ID' },
      { key: 'apiKey', label: 'Api Key', kind: 'secret' },
      { key: 'checksumKey', label: 'Checksum Key', kind: 'secret' },
    ],
    steps: [
      'my.payos.vn → Kênh thanh toán → chọn kênh → Thông tin tích hợp: chép Client ID, Api Key, Checksum Key vào dưới.',
      'Bấm Lưu, rồi bấm "Đăng ký webhook" (hoặc dán URL webhook vào mục Webhook url của payOS).',
      'Khách quét QR của payOS → tài khoản lên Pro trong vài giây.',
    ],
    registerWebhook: true,
    canSync: true,
  },
  {
    id: 'sepay',
    name: 'SePay',
    site: 'sepay.vn',
    hint: 'QR chuyển khoản vào tài khoản ngân hàng nhập dưới đây, SePay đọc biến động số dư và báo tiền về.',
    fields: [...BANK_FIELDS, { key: 'webhookKey', label: 'Khoá API (webhook)', kind: 'genkey' }],
    steps: [
      'Đăng ký sepay.vn, liên kết tài khoản ngân hàng nhận tiền ở trên.',
      'SePay → Tích hợp WebHooks → Thêm: sự kiện "Có tiền vào", URL webhook bên dưới, chứng thực API Key = khoá ở trên.',
      'Bấm Lưu. Khách chuyển khoản đúng nội dung → tài khoản lên Pro trong vài giây.',
    ],
  },
  {
    id: 'pay2s',
    name: 'Pay2S',
    site: 'pay2s.vn',
    hint: 'QR chuyển khoản vào tài khoản ngân hàng nhập dưới đây, Pay2S đọc biến động số dư và báo tiền về.',
    fields: [
      ...BANK_FIELDS,
      { key: 'token', label: 'Token webhook', kind: 'secret', help: 'Pay2S gửi kèm "Authorization: Bearer <token>"' },
    ],
    steps: [
      'Đăng ký pay2s.vn, liên kết tài khoản ngân hàng nhận tiền ở trên.',
      'Pay2S → Webhook → Tạo webhook: dán URL webhook bên dưới, chép Token webhook vào ô Token.',
      'Bấm Lưu. Khách chuyển khoản đúng nội dung → tài khoản lên Pro trong vài giây.',
    ],
  },
  {
    id: 'custom',
    name: 'Webhook tuỳ chỉnh',
    site: 'Casso, dịch vụ khác…',
    hint: 'Ghép bất kỳ dịch vụ báo biến động số dư nào có webhook (Casso…) — chỉ cần điền dịch vụ gửi số tiền, nội dung ở đâu.',
    fields: [
      ...BANK_FIELDS,
      {
        key: 'authHeader',
        label: 'Tên header chứa khoá',
        placeholder: 'secure-token',
        help: 'Casso: secure-token · đa số dịch vụ: Authorization',
      },
      {
        key: 'secret',
        label: 'Khoá bí mật',
        kind: 'secret',
        help: 'Đặt cùng 1 khoá ở dịch vụ (bỏ qua chữ "Bearer" / "Apikey" đầu)',
      },
      {
        key: 'listPath',
        label: 'Danh sách giao dịch',
        placeholder: 'data',
        optional: true,
        advanced: true,
        help: 'Ô chứa danh sách / 1 giao dịch. Casso: data · trống = cả nội dung gửi tới',
      },
      { key: 'amountPath', label: 'Ô số tiền', placeholder: 'amount', advanced: true, help: 'Casso: amount' },
      {
        key: 'contentPath',
        label: 'Ô nội dung chuyển khoản',
        placeholder: 'description',
        advanced: true,
        help: 'Casso: description',
      },
      {
        key: 'idPath',
        label: 'Ô mã giao dịch',
        placeholder: 'id',
        optional: true,
        advanced: true,
        help: 'Chống xử lý 2 lần. Casso: id',
      },
      {
        key: 'directionPath',
        label: 'Ô chiều tiền (vào / ra)',
        optional: true,
        advanced: true,
        help: 'Trống = coi số tiền âm là tiền ra',
      },
      { key: 'directionIn', label: 'Giá trị "tiền vào"', placeholder: 'in', optional: true, advanced: true },
    ],
    steps: [
      'Nhập tài khoản ngân hàng nhận tiền (mã QR khách quét).',
      'Ở dịch vụ báo biến động số dư: thêm webhook = URL bên dưới, đặt khoá bảo mật = Khoá bí mật ở đây.',
      'Mở "Nâng cao" để điền dịch vụ gửi số tiền / nội dung ở ô nào (dùng dấu chấm cho ô lồng nhau, vd data.amount). Mặc định đã đúng cho Casso (webhook thường, header secure-token).',
    ],
  },
  {
    id: 'manual',
    name: 'Chuyển khoản thủ công',
    site: 'không cần dịch vụ',
    hint: 'Chỉ hiện QR chuyển khoản; Quản trị viên thấy tiền về thì bấm "Đã nhận tiền" ở bảng Đơn mua. Miễn phí, luôn dùng được.',
    fields: BANK_FIELDS,
    steps: [
      'Nhập tài khoản ngân hàng nhận tiền.',
      'Khách quét QR chuyển khoản → bạn kiểm tra app ngân hàng, đối chiếu nội dung → bấm "Đã nhận tiền" ở bảng Đơn mua gói Pro bên dưới.',
    ],
    noWebhook: true,
  },
];

export const gatewayMeta = (id: string) => GATEWAYS.find((g) => g.id === id) ?? null;
export const isGatewayId = (v: unknown): v is GatewayId => GATEWAYS.some((g) => g.id === v);
export const providerName = (id: string) => gatewayMeta(id)?.name ?? id;

/** Giá trị các ô cấu hình của 1 cổng (theo `fields`) */
export type GatewaySettings = Record<string, string>;

/** Đường dẫn webhook của cổng */
export const webhookPath = (id: GatewayId) => `/api/billing/webhook/${id}`;

/** Thông tin thanh toán hiện cho khách (không có khoá bí mật) */
export interface BillingPublic {
  provider: GatewayId;
  options: ProOption[];
  /** Đã cấu hình xong cổng thanh toán + ít nhất 1 giá */
  ready: boolean;
}

/** Tài khoản nhận tiền của 1 đơn */
export interface PayAccount {
  bankBin: string;
  accountNo: string;
  accountName: string;
}

/** Thông tin thanh toán cổng trả về khi tạo đơn (chụp lại lúc tạo — đổi cấu hình sau không ảnh hưởng đơn cũ) */
export interface OrderPayment extends PayAccount {
  /** Mã đơn bên cổng (payOS orderCode) — webhook ghép đơn theo mã này */
  ref?: string;
  linkId?: string;
  /** Trang thanh toán của cổng */
  checkoutUrl?: string;
  /** Nội dung chuyển khoản */
  description: string;
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
  /** Đơn cũ (trước khi có nhiều cổng) không có = sepay */
  provider?: GatewayId;
  payment?: OrderPayment | null;
}

/** QR hiện trong ORDER_TTL_MS; quá hạn khách tạo đơn mới (đơn cũ vẫn nhận tiền nếu chuyển) */
export const ORDER_TTL_MS = 2 * 60 * 60_000;
export const ORDER_PREFIX = 'SA';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newOrderCode(rand: () => number = Math.random): string {
  let s = ORDER_PREFIX;
  // SA + 7 ký tự = 9 ký tự: payOS giới hạn nội dung 9 ký tự với tài khoản chưa liên kết
  for (let i = 0; i < 7; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
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
export function vietQrUrl(b: PayAccount, amount: number, code: string) {
  const q = new URLSearchParams({ amount: String(amount), addInfo: code, accountName: b.accountName });
  return `https://img.vietqr.io/image/${encodeURIComponent(b.bankBin)}-${encodeURIComponent(b.accountNo)}-compact2.png?${q}`;
}
