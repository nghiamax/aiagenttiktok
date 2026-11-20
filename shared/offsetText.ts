import type { VideoOffset } from './agentTypes.js';
import { formatNumber, shortVnd } from './format.js';

/* Câu mô tả "đơn bù ở sản phẩm khác" dùng chung (Gợi ý, Chờ duyệt, hộp xác nhận, bảng Video) */

const money = (n: number) => shortVnd(Math.round(n));
const roi = (n: number | null) => (n == null ? '--' : formatNumber(n, 2));

/** "tổng vẫn có lời" / "tổng vẫn lỗ" / "chưa đủ hoà vốn để kết luận" */
export function offsetVerdict(o: VideoOffset): string {
  return o.profitable == null ? 'chưa đủ ROI hoà vốn để kết luận' : o.profitable ? 'tổng vẫn có lời' : 'tổng vẫn lỗ';
}

/** Nhãn ngắn: "có đơn bù · tổng ROI 5,9" */
export function offsetChip(o: VideoOffset): string {
  return `có đơn bù · tổng ROI ${roi(o.total.roi)}`;
}

/** Phần đơn bù: "DT 370k · 1 đơn" */
export function offsetPart(o: VideoOffset): string {
  return `DT ${money(o.revenue)} · ${formatNumber(o.orders)} đơn`;
}

/** Số tổng: "chi 63k · DT 370k · ROI 5,9 / hoà vốn 3,5" */
export function offsetTotal(o: VideoOffset): string {
  const be = o.total.breakEven == null ? '' : ` / hoà vốn ${roi(o.total.breakEven)}`;
  return `chi ${money(o.total.cost)} · DT ${money(o.total.revenue)} · ROI ${roi(o.total.roi)}${be}`;
}

/** Dòng dưới badge Cắt lỗ: "Tổng: ROI 5,88 ✓ có lời" / "Tổng: ROI 2,10 · vẫn lỗ" / "Tổng: chưa đủ hoà vốn" */
export function offsetTotalLine(o: VideoOffset): string {
  if (o.profitable == null) return 'Tổng: chưa đủ hoà vốn';
  return o.profitable ? `Tổng: ROI ${roi(o.total.roi)} ✓ có lời` : `Tổng: ROI ${roi(o.total.roi)} · vẫn lỗ`;
}

/** Nhãn cạnh hành động trong Chờ duyệt */
export function offsetBadge(o: VideoOffset): string {
  return o.profitable == null ? 'Chưa đủ hoà vốn' : o.profitable ? 'Tổng vẫn có lời' : 'Tổng vẫn lỗ';
}

/** Gỡ video mà tổng (gồm đơn bù) vẫn có lời → cần Sếp xem kỹ */
export const removeKeepsProfit = (p: { actionType: string; offset?: VideoOffset }) =>
  p.actionType === 'remove_creative' && p.offset?.profitable === true;

/** Đề xuất được "Chọn tất cả": bỏ qua gỡ video tổng vẫn có lời (tích tay từng cái vẫn được) */
export function bulkSelectable<T extends { actionType: string; offset?: VideoOffset }>(items: T[]): T[] {
  return items.filter((p) => !removeKeepsProfit(p));
}

/** Cảnh báo đầu hộp xác nhận */
export function profitWarning(n: number): string {
  return `${n} video tổng vẫn có lời (tính cả đơn bù ở SP khác) — gỡ sẽ mất cả phần đơn bù. Sếp xem kỹ trước khi xác nhận.`;
}

/** 1 dòng cho hộp xác nhận gỡ video */
export function offsetWarning(o: VideoOffset): string {
  return `⚠ Có đơn bù ở SP khác (${offsetPart(o)}) — tính tổng: ${offsetTotal(o)}, ${offsetVerdict(o)}. Gỡ sẽ mất cả phần đơn bù.`;
}
