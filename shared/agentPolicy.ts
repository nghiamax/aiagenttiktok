/**
 * Chế độ "BOT chạy" (Sếp mở 25/11/2026 — trước đó 18/11: mọi việc cần Sếp duyệt).
 * true: quy tắc đặt "BOT chạy" được server thực thi ngay sau lượt quét (runAutoProposals), đi đúng đường Duyệt:
 * xét lại số liệu, giới hạn an toàn, điều kiện TikTok; không chạy được → nằm lại Chờ duyệt.
 * false: giao diện ẩn lựa chọn, server ép quy tắc 'auto' về 'approve'.
 */
export const AUTO_MODE_ENABLED = true;

/** Ngân sách tăng cường tối thiểu của TikTok: tương đương 10 USD/ngày (ước tính theo tỷ giá ~26.000đ) */
export const MIN_BOOST_BUDGET_VND = 260_000;

/**
 * Giai đoạn C (Sếp chốt 19/11/2026): Duyệt + Xác nhận trên web → server thao tác thật trên TikTok.
 * Đặt false để tắt nhanh mọi thao tác ghi (Duyệt sẽ báo lỗi, không gửi lệnh).
 */
export const EXECUTION_ENABLED = true;

/**
 * Gỡ / thêm video: TikTok nhận lệnh là trả kết quả ngay; trạng thái video đọc ở nền (Sếp chốt 28/11):
 * 3 phút đầu cách nhau tối đa 10 giây (3 giây/lần trong 30 giây đầu) → tới 30 phút 1 phút/lần → tới 90 phút 3 phút/lần.
 * API báo cáo (`creative_delivery_status`) trả trạng thái chậm hơn Ads Manager (ca 28/11: Ads Manager đã chạy,
 * 2 phút sau API vẫn "đã gỡ") → không báo Lỗi sớm: 0–3 phút "Đang chờ TikTok xác nhận", 3–90 phút "Chưa xác nhận" (vàng),
 * quá 90 phút mới Lỗi.
 */
/**
 * 3 phút đầu đọc ngay trong lệnh (Sếp chốt 28/11: 2 lần kiểm tra cách nhau tối đa 10 giây):
 * 30 giây đầu nghỉ 3 giây/lần, sau đó nghỉ 8 giây/lần (+ ~1–2 giây gọi TikTok ≈ 10 giây) tới hết phút 3.
 */
export const CREATIVE_INLINE_CHECKS_MS = [
  ...Array.from({ length: 10 }, () => 3_000),
  ...Array.from({ length: 19 }, () => 8_000),
];
/** Nhịp kiểm tra của bộ kiểm tra ngầm (giây) theo thời gian đã trôi qua (phút) — 3 phút đầu chỉ là dự phòng (tiến trình gửi lệnh tắt giữa chừng) */
export const CREATIVE_VERIFY_STEPS: { untilMin: number; everySec: number }[] = [
  { untilMin: 3, everySec: 10 },
  { untilMin: 30, everySec: 60 },
  { untilMin: Infinity, everySec: 180 },
];
/** Quá mốc này chưa thấy trạng thái mới → "Chưa xác nhận" (vàng), Gửi lại được */
export const CREATIVE_UNCONFIRMED_MIN = 3;
/** Quá mốc này vẫn chưa thấy → Lỗi (Sếp chốt 28/11 — trước là 2 phút, báo lỗi oan khi API trả chậm) */
export const CREATIVE_VERIFY_TIMEOUT_MIN = 90;
/** Dòng lỗi kiểu cũ (lỗi sau 2 phút) còn đọc ở nền tới mốc này: TikTok ghi nhận muộn → tự chuyển Thành công */
export const CREATIVE_LATE_CHECK_MIN = 90;
/** Nút "Kiểm tra ngay" trên dòng Lỗi: chỉ trong ngần này giờ */
export const CREATIVE_MANUAL_VERIFY_HOURS = 24;
/** Nút Gửi lại trên dòng Gỡ / Thêm lại bị lỗi: tối đa số lần cho mỗi dòng gốc */
export const CREATIVE_MAX_RETRIES = 2;
