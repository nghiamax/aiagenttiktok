/**
 * Mã video TikTok từ thứ người dùng dán vào: mã số (15–21 chữ số) hoặc link
 * (tiktok.com/@user/video/<id>, ?item_id=<id>, ...). Không nhận ra → null. Dùng chung web + server.
 */
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (/^\d{15,21}$/.test(s)) return s;
  const fromPath = s.match(/\/video\/(\d{15,21})/);
  if (fromPath) return fromPath[1];
  const fromQuery = s.match(/[?&](?:item_id|video_id|aweme_id)=(\d{15,21})/);
  if (fromQuery) return fromQuery[1];
  return null;
}
