import type { BillingOrder, GatewayMeta, GatewaySettings, OrderPayment } from '../../../shared/billing.js';

/**
 * Khung chung của 1 cổng thanh toán. Thêm cổng mới:
 *   1. khai báo trong GATEWAYS (shared/billing.ts) — tên, ô cấu hình, hướng dẫn;
 *   2. tạo file server/billing/gateways/<id>.ts cài đặt `Gateway` dưới đây;
 *   3. thêm vào danh sách trong gateways/index.ts.
 * Trang quản trị, trang thanh toán, route webhook /api/billing/webhook/<id> tự dùng — không sửa chỗ khác.
 */

/** Tiền vào báo từ cổng — store ghép đơn + kích hoạt Pro */
export interface IncomingTx {
  /** Mã giao dịch (chống xử lý 2 lần khi cổng gửi lại) */
  txId: string;
  /** Mã đơn bên cổng (vd payOS orderCode): có thì ghép theo mã này, không thì theo nội dung chuyển khoản */
  orderRef?: string;
  amount: number;
  content: string;
  /** Chỉ xử lý tiền vào */
  incoming: boolean;
}

export interface CreatePaymentInput {
  order: BillingOrder;
  /** Địa chỉ web (để cổng đưa khách quay lại) */
  origin: string;
  now: number;
  /** Mã đơn bên cổng đã dùng (tránh trùng) */
  usedRefs: Set<string>;
}

export interface WebhookInput {
  header: (name: string) => string | undefined;
  body: unknown;
}

/** Kết quả đọc webhook: `txs` = các giao dịch cần xử lý (1 lần gửi có thể nhiều giao dịch); không có thì trả luôn `status` + `body` */
export interface WebhookOutcome {
  status: number;
  body: Record<string, unknown>;
  txs?: IncomingTx[];
}

export interface Gateway {
  meta: GatewayMeta;
  /** Làm sạch giá trị ô cấu hình (vd tên chủ tài khoản chữ hoa không dấu) */
  normalize?: (s: GatewaySettings) => GatewaySettings;
  /** Đã nhập đủ cấu hình để bán */
  ready: (s: GatewaySettings) => boolean;
  /** Tạo thanh toán cho đơn mới: tài khoản nhận tiền + nội dung (+ trang thanh toán của cổng) */
  createPayment: (input: CreatePaymentInput, s: GatewaySettings) => Promise<OrderPayment>;
  /** Kiểm tra + đọc webhook cổng gửi tới */
  webhook: (input: WebhookInput, s: GatewaySettings) => WebhookOutcome;
  /** Hỏi cổng trạng thái đơn (dự phòng khi webhook không tới) — chỉ đọc */
  sync?: (order: BillingOrder, s: GatewaySettings) => Promise<IncomingTx | null>;
  /** Đăng ký URL webhook với cổng; trả câu báo thành công */
  registerWebhook?: (s: GatewaySettings, url: string) => Promise<string>;
}

/** Lỗi do cổng (sai khoá, mạng…) — route trả 502 kèm câu báo */
export class GatewayError extends Error {}
