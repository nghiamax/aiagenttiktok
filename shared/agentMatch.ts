import type { AdsSnapshot, AdsVideo, VideoStatus } from './adsSnapshot.js';
import type { AgentActionType, AgentRule, AgentRuleParams, AgentTarget, RuleLevel, VideoOffset } from './agentTypes.js';
import { classifyCampaign, classifyProduct, classifyVideo } from './classify.js';
import { breakEvenOf, type AdsSettings } from './settings.js';
import { effectiveStatus } from './videoStatus.js';

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
      if (t.videoStatus === 'unavailable') return 'Video không khả dụng — đã ngừng chạy';
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

/**
 * Đơn bù của video: các dòng sản phẩm khác (không thuộc `matched`) của cùng video trong cùng chiến dịch có DT / đơn.
 * Hoà vốn tổng = Σ DT ÷ Σ (DT_i ÷ hoà vốn_i) (thiếu hoà vốn ở dòng có DT → null). Không có đơn bù → undefined.
 */
export function offsetOf(
  snapshot: AdsSnapshot,
  settings: AdsSettings,
  campaignId: string,
  videoId: string,
  matched: ReadonlySet<AdsVideo>,
): VideoOffset | undefined {
  const rows = snapshot.videos.filter((v) => v.campaignId === campaignId && v.id === videoId && v.contentType !== 'product_card');
  const others = rows.filter((v) => !matched.has(v));
  const sum = (list: AdsVideo[], k: 'cost' | 'revenue' | 'orders') => list.reduce((s, v) => s + (v[k] ?? 0), 0);
  const revenue = sum(others, 'revenue');
  const orders = sum(others, 'orders');
  if (revenue <= 0 && orders <= 0) return undefined;

  const total = { cost: sum(rows, 'cost'), revenue: sum(rows, 'revenue'), orders: sum(rows, 'orders') };
  // Hoà vốn tổng theo tỷ trọng doanh thu; chưa có DT → hoà vốn của dòng chi nhiều nhất
  let weighted = 0;
  let missing = false;
  for (const v of rows) {
    if (!(v.revenue && v.revenue > 0)) continue;
    const be = breakEvenOf(settings, v.productId);
    if (be == null) missing = true;
    else weighted += v.revenue / be;
  }
  const main = [...rows].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))[0];
  const breakEven = missing ? null : total.revenue > 0 ? total.revenue / weighted : (main && breakEvenOf(settings, main.productId)) ?? null;
  const roi = total.cost > 0 ? total.revenue / total.cost : null;
  const profitable = breakEven == null ? null : roi == null ? total.revenue > 0 : roi >= breakEven;
  return { cost: sum(others, 'cost'), revenue, orders, total: { ...total, roi, breakEven }, profitable };
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
  /** Cấp video: có đơn bù ở sản phẩm khác trong cùng chiến dịch */
  offset?: VideoOffset;
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

  return collectVideoTargets(snapshot, settings, (v) => {
    if (!inScope(rule, v.campaignId, v.productId)) return null;
    const cls = classifyVideo(v, campaignById.get(v.campaignId), settings);
    return cls?.action === rule.trigger ? cls.reason : null;
  });
}

/**
 * Gom các dòng video khớp `match` (trả lý do, null = không khớp) thành đối tượng theo (chiến dịch, video):
 * một video gắn nhiều sản phẩm có nhiều dòng → 1 đối tượng, CỘNG số liệu các dòng khớp; dòng không khớp = "đơn bù".
 * Dùng chung: quy tắc Agent (khớp nhóm) và Gợi ý (khớp điều kiện riêng của gợi ý).
 */
export function collectVideoTargets(
  snapshot: AdsSnapshot,
  settings: AdsSettings,
  match: (v: AdsVideo) => string | null,
): RuleTarget[] {
  const campaignById = new Map(snapshot.campaigns.map((c) => [c.id, c]));
  const running = (id: string) => campaignById.get(id)?.status === 'running';
  const byKey = new Map<string, RuleTarget>();
  /** Các dòng khớp của từng (chiến dịch, video) — phần còn lại là "đơn bù" */
  const matchedRows = new Map<string, Set<AdsVideo>>();
  const out: RuleTarget[] = [];
  const add = (a: number | null, b: number | null) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
  for (const v of snapshot.videos) {
    if (v.contentType === 'product_card') continue;
    const reason = match(v);
    if (reason == null) continue;
    const key = `${v.campaignId}/${v.id}`;
    (matchedRows.get(key) ?? matchedRows.set(key, new Set()).get(key)!).add(v);
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
      reason,
      cost: v.cost,
      revenue: v.revenue,
      orders: v.orders,
      roi: v.roi,
      breakEven: breakEvenOf(settings, v.productId),
      videoStatus: effectiveStatus(v),
      campaignRunning: running(v.campaignId),
    };
    byKey.set(key, t);
    out.push(t);
  }
  for (const t of out) {
    const off = offsetOf(snapshot, settings, t.target.campaignId, t.target.videoId, matchedRows.get(`${t.target.campaignId}/${t.target.videoId}`)!);
    if (off) t.offset = off;
  }
  return out;
}
