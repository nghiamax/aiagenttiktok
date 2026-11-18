import type { AdsSnapshot, VideoStatus } from './adsSnapshot.js';
import type { AgentRule, AgentTarget, RuleLevel } from './agentTypes.js';
import { classifyCampaign, classifyProduct, classifyVideo } from './classify.js';
import { breakEvenOf, type AdsSettings } from './settings.js';

/** Cấp của quy tắc (bản lưu cũ không có level = video) */
export const ruleLevel = (rule: Pick<AgentRule, 'level'>): RuleLevel => rule.level ?? 'video';

/** Số ngày của snapshot (tính cả 2 đầu) */
export function snapshotDays(snapshot: AdsSnapshot): number {
  if (!snapshot.range) return 7;
  return Math.round((Date.parse(snapshot.range.to) - Date.parse(snapshot.range.from)) / 86_400_000) + 1;
}

/** Một đối tượng đang khớp quy tắc */
export interface RuleTarget {
  target: AgentTarget;
  name: string;
  /** Lý do khớp nhóm (từ classify*) */
  reason: string;
  cost: number | null;
  revenue: number | null;
  orders: number | null;
  roi: number | null;
  /** ROI hoà vốn lúc xét (chỉ cấp video / sản phẩm) */
  breakEven: number | null;
  /** Trạng thái phân phối (chỉ cấp video) */
  videoStatus?: VideoStatus;
  /** Chiến dịch đang chạy? */
  campaignRunning: boolean;
}

const inScope = (rule: AgentRule, campaignId: string, productId?: string) =>
  (!rule.campaignIds || rule.campaignIds.includes(campaignId)) &&
  (!productId || !rule.productIds || rule.productIds.includes(productId));

/** Đối tượng thuộc nhóm của quy tắc theo snapshot (có tính phạm vi). Cấp video gộp theo (chiến dịch, video). */
export function findRuleTargets(rule: AgentRule, settings: AdsSettings, snapshot: AdsSnapshot): RuleTarget[] {
  if (!rule.trigger) return [];
  const level = ruleLevel(rule);
  const campaignById = new Map(snapshot.campaigns.map((c) => [c.id, c]));
  const running = (id: string) => campaignById.get(id)?.status === 'running';

  if (level === 'campaign') {
    const days = snapshotDays(snapshot);
    return snapshot.campaigns.flatMap((c) => {
      if (!inScope(rule, c.id)) return [];
      const cls = classifyCampaign(c, settings, days);
      if (cls?.action !== rule.trigger) return [];
      return [
        {
          target: { campaignId: c.id, productId: '', videoId: '' },
          name: c.name,
          reason: cls.reason,
          cost: c.cost,
          revenue: c.revenue,
          orders: c.orders,
          roi: c.roi,
          breakEven: null,
          campaignRunning: c.status === 'running',
        },
      ];
    });
  }

  if (level === 'product') {
    return snapshot.products.flatMap((p) => {
      if (!inScope(rule, p.campaignId, p.id)) return [];
      const cls = classifyProduct(p, campaignById.get(p.campaignId), settings);
      if (cls?.action !== rule.trigger) return [];
      return [
        {
          target: { campaignId: p.campaignId, productId: p.id, videoId: '' },
          name: p.name,
          reason: cls.reason,
          cost: p.cost,
          revenue: p.revenue,
          orders: p.orders,
          roi: p.roi,
          breakEven: breakEvenOf(settings, p.id),
          campaignRunning: running(p.campaignId),
        },
      ];
    });
  }

  const seen = new Set<string>();
  const out: RuleTarget[] = [];
  for (const v of snapshot.videos) {
    const key = `${v.campaignId}/${v.id}`;
    if (seen.has(key) || !inScope(rule, v.campaignId, v.productId)) continue;
    const cls = classifyVideo(v, campaignById.get(v.campaignId), settings);
    if (cls?.action !== rule.trigger) continue;
    seen.add(key);
    out.push({
      target: { campaignId: v.campaignId, productId: v.productId, videoId: v.id },
      name: v.title || `Video ${v.id}`,
      reason: cls.reason,
      cost: v.cost,
      revenue: v.revenue,
      orders: v.orders,
      roi: v.roi,
      breakEven: breakEvenOf(settings, v.productId),
      videoStatus: v.status,
      campaignRunning: running(v.campaignId),
    });
  }
  return out;
}
