/** Phân loại video / sản phẩm / chiến dịch vào nhóm. Dùng chung web + server. */
import { formatNumber, shortVnd } from './format.js';
import { matchesPlatform, matchSet, reasonFor, setsFor, usesProductConditions, type EvalContext, type GroupDef } from './groups.js';
import { breakEvenOf, type AdsSettings } from './settings.js';
import type { AdsProduct, AdsVideo, Campaign } from './adsSnapshot.js';
import { effectiveStatus } from './videoStatus.js';
import type { ProfitMap } from './productProfit.js';

/** ID nhóm */
export type VideoAction = string;


export interface VideoClassification {
  /** ID nhóm (settings.groups / productGroups / campaignGroups) */
  action: VideoAction;
  /** Lý do ngắn gọn, hiện trong tooltip */
  reason: string;
}

/* ───────────── Bối cảnh so điều kiện ───────────── */

/**
 * Bối cảnh so điều kiện cho một chiến dịch (có mức tiêu ngân sách, không so với hoà vốn).
 * days = số ngày của bản số liệu (useAdsData().days), để ra chi phí trung bình mỗi ngày.
 */
export function contextForCampaign(c: Campaign, days: number): EvalContext {
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
    budgetUse: c.budget && c.cost != null ? (c.cost / days / c.budget) * 100 : null,
  };
}

/** Bối cảnh so điều kiện cho một sản phẩm trong chiến dịch */
/** profit = lợi nhuận 1 đơn theo sản phẩm (productProfit.ts) — thiếu → điều kiện "lần lợi nhuận 1 đơn" không khớp */
export function contextForProduct(p: AdsProduct, campaign: Campaign | undefined, settings: AdsSettings, profit?: ProfitMap): EvalContext {
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
    productId: p.id,
    profitPerOrder: profit?.get(p.id) ?? null,
  };
}

/** Bối cảnh so điều kiện cho một dòng video (chiến dịch + sản phẩm) */
export function contextForVideo(video: AdsVideo, campaign: Campaign | undefined, settings: AdsSettings, profit?: ProfitMap): EvalContext {
  const cost = video.cost ?? 0;
  const orders = video.orders ?? 0;
  return {
    cost,
    revenue: video.revenue ?? 0,
    orders,
    roi: video.roi,
    cpa: orders > 0 ? cost / orders : null,
    breakEven: breakEvenOf(settings, video.productId),
    target: campaign?.targetRoi ?? null,
    budgetUse: null,
    productId: video.productId,
    profitPerOrder: profit?.get(video.productId) ?? null,
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
    const hit = matchGroup(group, ctx);
    if (hit) return hit;
  }
  return null;
}

/** Khớp 1 nhóm custom (điều kiện riêng sản phẩm nếu có) → kết quả kèm lý do */
function matchGroup(group: GroupDef, ctx: EvalContext): VideoClassification | null {
  const set = setsFor(group, ctx).find((s) => matchSet(s, ctx));
  if (!set) return null;
  return { action: group.id, reason: reasonFor(set, ctx) + (usesProductConditions(group, ctx) ? ' (riêng SP)' : '') };
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
  profit?: ProfitMap,
): VideoClassification | null {
  if (video.contentType !== 'video') return null;
  // Video không khả dụng (TikTok ngừng chạy): chưa có cách xử lý → không xếp nhóm, chỉ lọc riêng ở bảng Video
  if (effectiveStatus(video) === 'unavailable') return null;

  const ctx = contextForVideo(video, campaign, settings, profit);
  const { cost, orders, revenue } = ctx;
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

    const hit = matchGroup(group, ctx);
    if (hit) return hit;
  }
  return null;
}

/* ───────────── Sản phẩm / Chiến dịch ───────────── */

/** Xếp sản phẩm (trong một chiến dịch) vào nhóm sản phẩm. null nếu không chi tiêu, không có đơn */
export function classifyProduct(
  product: AdsProduct,
  campaign: Campaign | undefined,
  settings: AdsSettings,
  profit?: ProfitMap,
): VideoClassification | null {
  const ctx = contextForProduct(product, campaign, settings, profit);
  if (!hasActivity(ctx)) return null;
  return classifyByGroups(settings.productGroups, ctx, () =>
    ctx.breakEven == null
      ? `Chưa nhập ROI hoà vốn · ROI ${roiText(ctx)}`
      : `Không thuộc nhóm nào ở trên · ROI ${roiText(ctx)} · hoà vốn ${formatNumber(ctx.breakEven, 2)}`,
  );
}

/** Xếp chiến dịch vào nhóm chiến dịch. null nếu không chi tiêu, không có đơn */
export function classifyCampaign(
  campaign: Campaign,
  settings: AdsSettings,
  days: number,
): VideoClassification | null {
  const ctx = contextForCampaign(campaign, days);
  if (!hasActivity(ctx)) return null;
  return classifyByGroups(settings.campaignGroups, ctx, () => {
    const use = ctx.budgetUse == null ? '--' : `${formatNumber(ctx.budgetUse)}%`;
    return `Không thuộc nhóm nào ở trên · ROI ${roiText(ctx)} · tiêu ${use} ngân sách`;
  });
}
