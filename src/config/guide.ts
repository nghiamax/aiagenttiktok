/**
 * Video hướng dẫn sử dụng — hiện dưới thẻ "Thêm tài khoản quảng cáo / Kết nối TikTok / Chọn tài khoản"
 * ở Quản lí chiến dịch + Care Ads 24/7 (cả khi chưa đăng nhập).
 *
 * Dán link vào đây rồi build lại:
 *  - YouTube: https://www.youtube.com/watch?v=… · https://youtu.be/… · /shorts/… · /embed/…
 *  - File video: link trực tiếp tới .mp4 / .webm (vd đặt file trong thư mục public/ → "/huong-dan.mp4")
 * Để trống = khung hiện "Video hướng dẫn đang được cập nhật".
 */
export const GUIDE_VIDEO_URL = 'https://www.youtube.com/watch?v=2kXtUnsjuVw';

export type GuideVideo = { kind: 'youtube'; embedUrl: string } | { kind: 'file'; src: string };

/** Đổi link thành cách nhúng; null = trống / link không nhận ra */
export function parseGuideVideo(url: string): GuideVideo | null {
  const u = url.trim();
  if (!u) return null;
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(u)) return { kind: 'file', src: u };
  const m =
    u.match(/youtu\.be\/([\w-]{6,})/) ??
    u.match(/youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)([\w-]{6,})/);
  return m ? { kind: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0` } : null;
}

/* ───────── Trang Hướng dẫn sử dụng (/guide) — mỗi phần 1 video, dạng checklist ───────── */

export interface GuideSection {
  /** Khoá cố định (lưu "đã xem" trên trình duyệt) — đổi id = mất dấu đã xem của phần đó */
  id: string;
  title: string;
  description: string;
  /** YouTube hoặc file .mp4 / .webm; trống = "đang cập nhật" */
  videoUrl: string;
}

/** Nội dung tạm (Sếp sẽ thay tên + video thật). Thêm / bớt phần = sửa danh sách này. */
export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'a',
    title: 'Hướng dẫn sử dụng A',
    description: 'Mô tả ngắn nội dung phần A.',
    videoUrl: 'https://www.youtube.com/watch?v=2kXtUnsjuVw',
  },
  {
    id: 'b',
    title: 'Hướng dẫn sử dụng B',
    description: 'Mô tả ngắn nội dung phần B.',
    videoUrl: 'https://www.youtube.com/watch?v=2kXtUnsjuVw',
  },
  {
    id: 'c',
    title: 'Hướng dẫn sử dụng C',
    description: 'Mô tả ngắn nội dung phần C.',
    videoUrl: 'https://www.youtube.com/watch?v=2kXtUnsjuVw',
  },
];
