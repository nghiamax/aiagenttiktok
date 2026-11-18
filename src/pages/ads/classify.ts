import snapshotJson from '../../data/ads-snapshot.json';
import { formatNumber, shortVnd } from '../../lib/format';
import { matchesPlatform, matchSet, reasonFor, type EvalContext, type GroupDef } from './groups';
import { breakEvenOf, type AdsSettings } from './settings';
import type { AdsProduct, AdsSnapshot, AdsVideo, Campaign, VideoAction } from './types';

export { shortVnd };

export interface VideoClassification {
  /** ID nhóm (settings.groups / productGroups / campaignGroups) */
  action: VideoAction;
  /** Lý do ngắn gọn, hiện trong tooltip */
  reason: string;
}

const snapshot = snapshotJson as AdsSnapshot;

/** Số ngày của bản số liệu (tính cả 2 đầu), dùng để ra chi phí trung bình mỗi ngày */
export const SNAPSHOT_DAYS = snapshot.range
  ? Math.round((Date.parse(snapshot.range.to) - Date.parse(snapshot.range.from)) / 86_400_000) + 1
  : 7;

/* ───────────── Bối cảnh so điều kiện ───────────── */

/** Bối cảnh so điều kiện cho một chiến dịch (có mức tiêu ngân sách, không so với hoà vốn) */
export function contextForCampaign(c: Campaign): EvalContext {
  const cost = c.cost ?? 0;
  const orders = c.orders ?? 0;
  return {
    cost,
    revenue: c.revenue ?? 0,
    orders,
    roi: c.roi,
    cpa: orders > 0 ? cost / orders : null,
    // Chiến dịch gồm nhiều sản phẩm nên không so với một mức hoà vốn
    breakEven: null,
    target: c.targetRoi,
    budgetUse: c.budget && c.cost != null ? (c.cost / SNAPSHOT_DAYS / c.budget) * 100 : null,
  };
}

/** Bối cảnh so điều kiện cho một sản phẩm trong chiến dịch */
export function contextForProduct(p: AdsProduct, campaign: Campaign | undefined, settings: AdsSettings): EvalContext {
  const cost = p.cost ?? 0;
  const orders = p.orders ?? 0;
  return {
    cost,
    revenue: p.revenue ?? 0,
    orders,
    roi: p.roi,
    cpa: orders > 0 ? cost / orders : null,
    breakEven: breakEvenOf(settings, p.id),
    target: campaign?.targetRoi ?? null,
    budgetUse: null,
  };
}

const hasActivity = (ctx: EvalContext) => ctx.cost > 0 || ctx.orders > 0 || ctx.revenue > 0;

/** Xét các nhóm custom từ trên xuống; không khớp nhóm nào → nhóm fallback */
function classifyByGroups(
  groups: GroupDef[],
  ctx: EvalContext,
  fallbackReason: () => string,
): VideoClassification | null {
  for (const group of groups) {
    if (group.kind === 'fallback') return { action: group.id, reason: fallbackReason() };
    if (group.kind !== 'custom') continue;
    const set = group.conditionSets.find((s) => matchSet(s, ctx));
    if (set) return { action: group.id, reason: reasonFor(set, ctx) };
  }
  return null;
}

const roiText = (ctx: EvalContext) => (ctx.roi == null ? '--' : formatNumber(ctx.roi, 2));

/* ───────────── Video ───────────── */

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
  if (!hasActivity(ctx)) return null;

  for (const group of settings.groups) {
    if (group.kind === 'platform') {
      if (matchesPlatform(video, ctx)) {
        return { action: group.id, reason: `Cần ủy quyền · ${formatNumber(orders)} đơn · doanh thu ${shortVnd(revenue)}` };
      }
      continue;
    }

    if (group.kind === 'fallback') {
      return {
        action: group.id,
        reason:
          cost <= 0
            ? `Có ${formatNumber(orders)} đơn tự nhiên, chưa tốn chi phí`
            : `Không thuộc nhóm nào ở trên · ROI ${roiText(ctx)}${ctx.breakEven == null ? ' · chưa nhập ROI hoà vốn' : ''}`,
      };
    }

    const set = group.conditionSets.find((s) => matchSet(s, ctx));
    if (set) return { action: group.id, reason: reasonFor(set, ctx) };
  }
  return null;
}

/* ───────────── Sản phẩm / Chiến dịch ───────────── */

/** Xếp sản phẩm (trong một chiến dịch) vào nhóm sản phẩm. null nếu không chi tiêu, không có đơn */
export function classifyProduct(
  product: AdsProduct,
  campaign: Campaign | undefined,
  settings: AdsSettings,
): VideoClassification | null {
  const ctx = contextForProduct(product, campaign, settings);
  if (!hasActivity(ctx)) return null;
  return classifyByGroups(settings.productGroups, ctx, () =>
    ctx.breakEven == null
      ? `Chưa nhập ROI hoà vốn · ROI ${roiText(ctx)}`
      : `Không thuộc nhóm nào ở trên · ROI ${roiText(ctx)} · hoà vốn ${formatNumber(ctx.breakEven, 2)}`,
  );
}

/** Xếp chiến dịch vào nhóm chiến dịch. null nếu không chi tiêu, không có đơn */
export function classifyCampaign(campaign: Campaign, settings: AdsSettings): VideoClassification | null {
  const ctx = contextForCampaign(campaign);
  if (!hasActivity(ctx)) return null;
  return classifyByGroups(settings.campaignGroups, ctx, () => {
    const use = ctx.budgetUse == null ? '--' : `${formatNumber(ctx.budgetUse)}%`;
    return `Không thuộc nhóm nào ở trên · ROI ${roiText(ctx)} · tiêu ${use} ngân sách`;
  });
}
