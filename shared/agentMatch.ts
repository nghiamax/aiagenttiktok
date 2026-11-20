import type { AdsSnapshot, VideoStatus } from './adsSnapshot.js';
import type { AgentActionType, AgentRule, AgentRuleParams, AgentTarget, RuleLevel } from './agentTypes.js';
import { classifyCampaign, classifyProduct, classifyVideo } from './classify.js';
import { breakEvenOf, type AdsSettings } from './settings.js';

/** Cấp của quy tắc (bản lưu cũ không có level = video) */
export const ruleLevel = (rule: Pick<AgentRule, 'level'>): RuleLevel => rule.level ?? 'video';

/** Số ngày của snapshot (tính cả 2 đầu) */
export function snapshotDays(snapshot: AdsSnapshot): number {
  if (!snapshot.range) return 7;
  return Math.round((Date.parse(snapshot.range.to) - Date.parse(snapshot.range.from)) / 86_400_000) + 1;
}

/** Video ở các trạng thái này TikTok không cho tăng cường */
const NO_BOOST_STATUSES = new Set<VideoStatus>(['authorization_needed', 'excluded', 'rejected', 'unavailable']);

/**
 * Lý do không làm được hành động với đối tượng (theo điều kiện của TikTok); null = làm được.
 * Dùng chung: bộ máy quét (engine), xét lại đề xuất và Gợi ý.
 */
export function ineligibleReason(actionType: AgentActionType, params: AgentRuleParams, t: RuleTarget): string | null {
  switch (actionType) {
    case 'remove_creative':
      if (!t.campaignRunning) return 'Chiến dịch đang tắt';
      if (t.videoStatus === 'excluded') return 'Video đã bị gỡ';
      return null;
    case 'add_creative':
      return t.videoStatus === 'excluded' ? null : 'Video chưa bị gỡ';
    case 'boost_creative':
      if (!t.campaignRunning) return 'Chiến dịch đang tắt';
      if (t.videoStatus && NO_BOOST_STATUSES.has(t.videoStatus)) return 'Video không đủ điều kiện tăng cường';
      if (!params.boostBudget) return 'Quy tắc chưa đặt ngân sách tăng cường';
      return null;
    case 'update_budget':
      return params.budgetChangePct ? null : 'Quy tắc chưa đặt % ngân sách';
    case 'update_roi_target':
      return params.roiTargetChangePct ? null : 'Quy tắc chưa đặt % ROI mục tiêu';
    default:
      return null;
  }
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

  // Một video gắn nhiều sản phẩm có nhiều dòng → gộp 1 đối tượng, CỘNG số liệu các dòng khớp nhóm
  const byKey = new Map<string, RuleTarget>();
  const out: RuleTarget[] = [];
  const add = (a: number | null, b: number | null) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
  for (const v of snapshot.videos) {
    if (!inScope(rule, v.campaignId, v.productId)) continue;
    const cls = classifyVideo(v, campaignById.get(v.campaignId), settings);
    if (cls?.action !== rule.trigger) continue;
    const key = `${v.campaignId}/${v.id}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.cost = add(prev.cost, v.cost);
      prev.revenue = add(prev.revenue, v.revenue);
      prev.orders = add(prev.orders, v.orders);
      prev.roi = prev.cost ? (prev.revenue ?? 0) / prev.cost : null;
      continue;
    }
    const t: RuleTarget = {
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
    };
    byKey.set(key, t);
    out.push(t);
  }
  return out;
}
