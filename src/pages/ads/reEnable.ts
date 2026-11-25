import type { TrendInfo } from '../../../shared/trend';

/** Cần ít nhất ngần này đơn trong khung đánh giá mới khuyên bật lại (ít hơn → ROI chưa có ý nghĩa) */
export const MIN_ORDERS_TO_SUGGEST = 3;

export type ReEnableVerdict = 'suggest' | 'few' | 'keep_off' | 'no_break_even' | 'no_data';

/**
 * Chấm có nên bật lại (thuần, dùng chung ô đánh giá + ô lọc "Cần bật lại"): số khung 30 ngày (không có thì 14) so hoà vốn.
 * suggest = ROI ≥ hoà vốn và ≥ MIN_ORDERS_TO_SUGGEST đơn · few = có lời nhưng ít đơn · keep_off = lỗ (tắt là đúng)
 */
export function reEnableVerdict(trend: TrendInfo | undefined, breakEven: number | null): ReEnableVerdict {
  const s = trend?.w30 && (trend.w30.cost ?? 0) > 0 ? trend.w30 : trend?.w14 && (trend.w14.cost ?? 0) > 0 ? trend.w14 : null;
  if (!s) return 'no_data';
  if (breakEven == null || s.roi == null) return 'no_break_even';
  if (s.roi < breakEven) return 'keep_off';
  return (s.orders ?? 0) < MIN_ORDERS_TO_SUGGEST ? 'few' : 'suggest';
}
