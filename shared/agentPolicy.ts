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
 * Gỡ / thêm video: TikTok nhận lệnh là trả kết quả ngay; trạng thái video đọc ở nền
 * (3 · 8 · 15 giây sau khi gửi), rồi mỗi 20 giây trong 10 phút đầu, sau đó giãn dần tới tối đa 5 phút.
 * Báo cáo TikTok có thể trễ hơn Ads Manager vài phút.
 */
export const CREATIVE_INLINE_CHECKS_MS = [3_000, 5_000, 7_000];
export const CREATIVE_VERIFY_MIN_SEC = 20;
export const CREATIVE_VERIFY_FAST_MIN = 10;
export const CREATIVE_VERIFY_MAX_SEC = 300;
/** Quá thời gian này vẫn chưa đúng trạng thái → báo lỗi (Sếp chốt 27/11: 2 phút — trước là 90 phút, chờ lâu tưởng lệnh vẫn chạy) */
export const CREATIVE_VERIFY_TIMEOUT_MIN = 2;
/** Sau khi báo lỗi vẫn đọc trạng thái ở nền tới mốc này: TikTok ghi nhận muộn → tự chuyển Thành công */
export const CREATIVE_LATE_CHECK_MIN = 90;
/** Nút Gửi lại trên dòng Gỡ / Thêm lại bị lỗi: tối đa số lần cho mỗi dòng gốc */
export const CREATIVE_MAX_RETRIES = 2;
