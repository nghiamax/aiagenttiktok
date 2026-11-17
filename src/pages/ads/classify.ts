import { formatNumber, shortVnd } from '../../lib/format';
import { matchesPlatform, matchSet, reasonFor, type EvalContext } from './groups';
import { breakEvenOf, type AdsSettings } from './settings';
import type { AdsProduct, AdsVideo, Campaign, ProductMargin, VideoAction } from './types';

export { shortVnd };

export interface VideoClassification {
  /** ID nhóm video (settings.groups) */
  action: VideoAction;
  /** Lý do ngắn gọn, hiện trong tooltip */
  reason: string;
}

/** Biên "Sát hoà vốn": ROI dưới hoà vốn × 1,2 */
const NEAR_FACTOR = 1.2;

/**
 * Xếp video vào đúng 1 nhóm, xét lần lượt settings.groups từ trên xuống (Sếp tự định nghĩa).
 * Trả null cho thẻ sản phẩm và video không chi tiêu, không có đơn.
 */
export function classifyVideo(
  video: AdsVideo,
  campaign: Campaign | undefined,
  settings: AdsSettings,
): VideoClassification | null {
  if (video.contentType !== 'video') return null;

  const cost = video.cost ?? 0;
  const orders = video.orders ?? 0;
  const revenue = video.revenue ?? 0;
  if (cost <= 0 && orders <= 0 && revenue <= 0) return null;

  const ctx: EvalContext = {
    cost,
    revenue,
    orders,
    roi: video.roi,
    cpa: orders > 0 ? cost / orders : null,
    breakEven: breakEvenOf(settings, video.productId),
    target: campaign?.targetRoi ?? null,
    budgetUse: null,
  };

  for (const group of settings.groups) {
    if (group.kind === 'platform') {
      if (matchesPlatform(video, ctx)) {
        return {
          action: group.id,
          reason: `Cần ủy quyền · ${formatNumber(orders)} đơn · doanh thu ${shortVnd(revenue)}`,
        };
      }
      continue;
    }

    if (group.kind === 'fallback') {
      const roiText = ctx.roi == null ? '--' : formatNumber(ctx.roi, 2);
      return {
        action: group.id,
        reason:
          cost <= 0
            ? `Có ${formatNumber(orders)} đơn tự nhiên, chưa tốn chi phí`
            : `Không thuộc nhóm nào ở trên · ROI ${roiText}${ctx.breakEven == null ? ' · chưa nhập ROI hoà vốn' : ''}`,
      };
    }

    const set = group.conditionSets.find((s) => matchSet(s, ctx));
    if (set) return { action: group.id, reason: reasonFor(set, ctx) };
  }

  return null;
}

/** Lời/lỗ của sản phẩm so với ROI hoà vốn; null nếu chưa nhập hoà vốn */
export function productMargin(product: AdsProduct, settings: AdsSettings): ProductMargin | null {
  const be = breakEvenOf(settings, product.id);
  if (be == null || product.roi == null) return null;
  if (product.roi < be) return 'loss';
  if (product.roi < be * NEAR_FACTOR) return 'near';
  return 'profit';
}
