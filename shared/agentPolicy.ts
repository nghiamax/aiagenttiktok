/**
 * Chính sách Agent hiện tại (Sếp chốt 18/11/2026): MỌI VIỆC CẦN SẾP DUYỆT.
 * Chế độ "Tự chạy" bị khoá: giao diện không cho chọn, server ép quy tắc 'auto' về 'approve'.
 * Chỉ mở lại khi Sếp yêu cầu rõ ràng.
 */
export const AUTO_MODE_ENABLED = false;

/** Ngân sách tăng cường tối thiểu của TikTok: tương đương 10 USD/ngày (ước tính theo tỷ giá ~26.000đ) */
export const MIN_BOOST_BUDGET_VND = 260_000;

/**
 * Giai đoạn C (Sếp chốt 19/11/2026): Duyệt + Xác nhận trên web → server thao tác thật trên TikTok.
 * Đặt false để tắt nhanh mọi thao tác ghi (Duyệt sẽ báo lỗi, không gửi lệnh).
 */
export const EXECUTION_ENABLED = true;

/**
 * Gỡ / thêm video: TikTok nhận lệnh là trả kết quả ngay; trạng thái video đọc ở nền
 * (3 · 8 · 15 giây sau khi gửi), rồi mỗi 20 giây trong 10 phút đầu, sau đó giãn dần tới tối đa 5 phút.
 * Báo cáo TikTok có thể trễ hơn Ads Manager vài phút.
 */
export const CREATIVE_INLINE_CHECKS_MS = [3_000, 5_000, 7_000];
export const CREATIVE_VERIFY_MIN_SEC = 20;
export const CREATIVE_VERIFY_FAST_MIN = 10;
export const CREATIVE_VERIFY_MAX_SEC = 300;
/** Quá thời gian này vẫn chưa đúng trạng thái → báo lỗi */
export const CREATIVE_VERIFY_TIMEOUT_MIN = 90;
