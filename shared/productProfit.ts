/**
 * Lợi nhuận 1 đơn của từng sản phẩm (Sếp chốt 26/11) = giá trị đơn trung bình ÷ ROI hoà vốn
 * (ROI hoà vốn = giá bán ÷ lợi nhuận gộp trước quảng cáo → lợi nhuận = giá bán ÷ ROI hoà vốn).
 * = số tiền quảng cáo tối đa cho 1 đơn mà vẫn hoà vốn — dùng cho điều kiện "Chi phí ≥ k lần lợi nhuận 1 đơn".
 * Giá trị đơn lấy theo 30 ngày (thiếu thì 14, rồi 7) để cả 3 khung xét nhóm dùng cùng một mức.
 */
import type { AdsSnapshot } from './adsSnapshot.js';
import type { AdsSettings } from './settings.js';
import { cpaBreakEvenMap } from './suggestRules.js';

/** ID sản phẩm → lợi nhuận 1 đơn (VND). Thiếu hoà vốn / chưa có đơn → không có trong map */
export type ProfitMap = Map<string, number>;

export function profitPerOrderMap(
  snaps: { d7: AdsSnapshot | null; d14: AdsSnapshot | null; d30: AdsSnapshot | null },
  settings: AdsSettings,
): ProfitMap {
  const out: ProfitMap = new Map();
  for (const s of [snaps.d30, snaps.d14, snaps.d7]) {
    if (!s) continue;
    for (const [id, v] of cpaBreakEvenMap(s, settings)) if (!out.has(id)) out.set(id, v);
  }
  return out;
}
