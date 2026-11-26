import type { AdsSnapshot, AdsVideo, VideoStatus } from './adsSnapshot.js';
import type { AgentActionLog, AgentActionType, AgentRule, AgentRuleParams, AgentTarget, RuleLevel, VideoOffset } from './agentTypes.js';
import { TUNE_CODES, TUNE_TRIGGER, tuneDecisions } from './campaignTune.js';
import { classifyCampaign, classifyProduct, classifyVideo } from './classify.js';
import { breakEvenOf, findGroup, type AdsSettings } from './settings.js';
import { isSpendGated, matchesIgnoringSpend, type WindowStat } from './trend.js';
import type { EvalContext } from './groups.js';
import { shortVnd } from './format.js';
import { effectiveStatus } from './videoStatus.js';
import { REENABLE_GROUP_ID, reEnableCandidates, reEnableReason } from './reEnable.js';
import { profitContext, profitPerOrderMap, type ProfitMap } from './productProfit.js';

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
    case 'disable_product':
      return t.productExcluded ? 'Sản phẩm đã tắt khỏi chiến dịch' : null;
    case 'enable_product':
      return t.productExcluded ? null : 'Sản phẩm đang bật';
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
  /** Cấp sản phẩm: đã tắt khỏi chiến dịch */
  productExcluded?: boolean;
  /** Hành động / tham số riêng của đối tượng (BOT chỉnh ROI & ngân sách) — thay hành động của quy tắc */
  actionType?: AgentActionType;
  params?: AgentRuleParams;
}

const inScope = (rule: AgentRule, campaignId: string, productId?: string) =>
  (!rule.campaignIds || rule.campaignIds.includes(campaignId)) &&
  (!productId || !rule.productIds || rule.productIds.includes(productId));

/** Đối tượng thuộc nhóm của quy tắc theo snapshot (có tính phạm vi). Cấp video gộp theo (chiến dịch, video). */
/** profit = lợi nhuận 1 đơn theo sản phẩm (điều kiện "lần lợi nhuận 1 đơn"); thiếu → tính từ chính snapshot */
export function findRuleTargets(rule: AgentRule, settings: AdsSettings, snapshot: AdsSnapshot, profit?: ProfitMap): RuleTarget[] {
  const pm = profit ?? profitPerOrderMap({ d7: snapshot, d14: null, d30: null }, settings);
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
      const cls = classifyProduct(p, campaignById.get(p.campaignId), settings, pm);
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
          productExcluded: !!p.excluded,
        },
      ];
    });
  }

  return collectVideoTargets(snapshot, settings, (v) => {
    if (!inScope(rule, v.campaignId, v.productId)) return null;
    const cls = classifyVideo(v, campaignById.get(v.campaignId), settings, pm);
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

/* ───────── Xác nhận bằng khung 14 ngày (+ 30 ngày để giải thích) — Sếp chốt 22/11/2026 ───────── */

export interface ConfirmSnaps {
  /** 14 ngày tính cả hôm nay; null = chưa có (đang tải / lỗi) → không lọc */
  d14: AdsSnapshot | null;
  /** 30 ngày tính cả hôm nay — chỉ để ghi độ tin + số liệu, không quyết định */
  d30: AdsSnapshot | null;
  /** Hôm nay — BOT chỉnh chiến dịch xét lỗ trong ngày (H3); thiếu = bỏ qua H3 */
  d1?: AdsSnapshot | null;
}

/** Đối tượng đã qua xác nhận, kèm số 14 / 30 ngày */
export interface ConfirmedTarget extends RuleTarget {
  windows?: { d14: WindowStat | null; d30: WindowStat | null };
  /** 30 ngày cũng thuộc nhóm này ("kéo dài") */
  long?: boolean;
  /** Vào từ cửa 14 + 30 ngày: 7 ngày chi ít chưa tới ngưỡng nhưng vẫn lỗ */
  slowLoss?: boolean;
}

/** Khoá đối tượng của quy tắc: video gộp theo (chiến dịch, video) như findRuleTargets */
export function targetKey(level: RuleLevel, t: AgentTarget): string {
  return level === 'video' ? `${t.campaignId}/${t.videoId}` : level === 'product' ? `${t.campaignId}/${t.productId}` : t.campaignId;
}

/** Số liệu của đối tượng trong snapshot (video = cộng mọi dòng sản phẩm của video trong chiến dịch); không có → null */
export function metricsOf(t: AgentTarget, snapshot: AdsSnapshot): WindowStat | null {
  const rows: { cost: number | null; revenue: number | null; orders: number | null }[] = t.videoId
    ? snapshot.videos.filter((v) => v.campaignId === t.campaignId && v.id === t.videoId && v.contentType !== 'product_card')
    : t.productId
      ? snapshot.products.filter((p) => p.campaignId === t.campaignId && p.id === t.productId)
      : snapshot.campaigns.filter((c) => c.id === t.campaignId);
  if (rows.length === 0) return null;
  const sum = (k: 'cost' | 'revenue' | 'orders') => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
  const cost = sum('cost');
  const revenue = sum('revenue');
  return { cost, revenue, orders: sum('orders'), roi: cost > 0 ? revenue / cost : null };
}

/**
 * Giữ đối tượng mà khung 14 ngày cũng thuộc nhóm của quy tắc; còn lại = "chưa xác nhận".
 * Nhóm theo trạng thái TikTok (Cần ủy quyền) hoặc chưa có snapshot 14 ngày → giữ hết (như cũ).
 */
export function confirmRuleTargets(
  rule: AgentRule,
  settings: AdsSettings,
  targets: RuleTarget[],
  snaps: ConfirmSnaps,
  profit?: ProfitMap,
): { kept: ConfirmedTarget[]; unconfirmed: RuleTarget[] } {
  const level = ruleLevel(rule);
  const withWindows = (t: RuleTarget, long?: boolean): ConfirmedTarget => ({
    ...t,
    windows: {
      d14: snaps.d14 ? metricsOf(t.target, snaps.d14) : null,
      d30: snaps.d30 ? metricsOf(t.target, snaps.d30) : null,
    },
    ...(long !== undefined && { long }),
  });
  const exempt = !snaps.d14 || !rule.trigger || findGroup(settings, rule.trigger, level)?.kind === 'platform';
  if (exempt) return { kept: targets.map((t) => withWindows(t)), unconfirmed: [] };
  const in14 = new Set(findRuleTargets(rule, settings, snaps.d14!, profit).map((t) => targetKey(level, t.target)));
  const in30 = snaps.d30 ? new Set(findRuleTargets(rule, settings, snaps.d30, profit).map((t) => targetKey(level, t.target))) : null;
  const kept: ConfirmedTarget[] = [];
  const unconfirmed: RuleTarget[] = [];
  for (const t of targets) {
    const k = targetKey(level, t.target);
    if (in14.has(k)) kept.push(withWindows(t, in30 ? in30.has(k) : undefined));
    else unconfirmed.push(t);
  }
  return { kept, unconfirmed };
}

/** Đối tượng của quy tắc cấp sản phẩm chọn nhóm "Cân nhắc bật lại" (có tính phạm vi) */
function reEnableRuleTargets(rule: AgentRule, settings: AdsSettings, d7: AdsSnapshot, snaps: ConfirmSnaps): ConfirmedTarget[] {
  return reEnableCandidates({ d7, d14: snaps.d14, d30: snaps.d30 }, settings)
    .filter((c) => inScope(rule, c.campaignId, c.productId))
    .map((c) => {
      const target = { campaignId: c.campaignId, productId: c.productId, videoId: '' };
      // Số 'lúc đề xuất' theo khung 7 ngày (thường = 0 vì đang tắt); số 30 / 14 ngày nằm ở windows + lý do
      const m7 = metricsOf(target, d7);
      return {
        target,
        name: c.name,
        reason: reEnableReason(c),
        cost: m7?.cost ?? 0,
        revenue: m7?.revenue ?? 0,
        orders: m7?.orders ?? 0,
        roi: m7?.roi ?? null,
        breakEven: c.breakEven,
        campaignRunning: c.campaignRunning,
        productExcluded: c.excluded,
        windows: { d14: snaps.d14 ? metricsOf(target, snaps.d14) : null, d30: snaps.d30 ? metricsOf(target, snaps.d30) : null },
      };
    });
}

/** Đối tượng của quy tắc "BOT chỉnh ROI & ngân sách": chiến dịch có hành động; khác hướng 7 / 14 ngày = dấu hiệu */
function tuneRuleTargets(
  rule: AgentRule,
  settings: AdsSettings,
  d7: AdsSnapshot,
  snaps: ConfirmSnaps,
  actions: AgentActionLog[],
  now: number,
): { kept: ConfirmedTarget[]; unconfirmed: RuleTarget[]; recovering: RuleTarget[] } {
  const kept: ConfirmedTarget[] = [];
  const unconfirmed: RuleTarget[] = [];
  for (const d of tuneDecisions(d7, snaps.d14, settings, actions, now, { d30: snaps.d30, d1: snaps.d1 }).values()) {
    if (!inScope(rule, d.campaignId)) continue;
    const c = d7.campaigns.find((x) => x.id === d.campaignId)!;
    const target = { campaignId: d.campaignId, productId: '', videoId: '' };
    const t: RuleTarget = {
      target,
      name: c.name,
      reason: `${TUNE_CODES[d.code]}: ${d.reason}`,
      cost: d.econ.cost,
      revenue: d.econ.revenue,
      orders: d.econ.orders,
      roi: d.econ.roi,
      breakEven: d.econ.breakEven,
      campaignRunning: c.status === 'running',
    };
    if (d.signal) {
      unconfirmed.push(t);
      continue;
    }
    if (!d.action) continue;
    const pct = d.action.pct;
    kept.push({
      ...t,
      actionType: d.action.type,
      params: {
        ...(d.action.type === 'update_budget' ? { budgetChangePct: pct } : { roiTargetChangePct: pct }),
        tune: { code: d.code, ...(d.step && { step: d.step }), ...(d.action.revertOf && { revertOf: d.action.revertOf }) },
      },
      windows: { d14: snaps.d14 ? metricsOf(target, snaps.d14) : null, d30: snaps.d30 ? metricsOf(target, snaps.d30) : null },
    });
  }
  return { kept, unconfirmed, recovering: [] };
}

/** Lý do bỏ qua khi khung 14 ngày không cùng nhóm */
export const UNCONFIRMED_REASON = 'Mới có dấu hiệu — 14 ngày chưa cùng nhóm';

/* ───────── Cửa vào thứ 2: "lỗ âm thầm" (Sếp chốt 22/11) ─────────
 * 14 + 30 ngày cùng nhóm có ngưỡng chi (vd Cắt lỗ) mà 7 ngày không thuộc nhóm vì chi ít chưa tới ngưỡng.
 * 7 ngày vẫn khớp nhóm khi bỏ ngưỡng chi (0 đơn / ROI < hoà vốn) → lỗ âm thầm (đề xuất như thường);
 * 7 ngày đã không còn khớp → đang hồi phục (chỉ báo, không đề xuất). */

/** Bối cảnh 7 ngày gộp của đối tượng (video = mọi dòng sản phẩm trong chiến dịch) */
function context7(level: RuleLevel, t: AgentTarget, d7: AdsSnapshot, settings: AdsSettings, profit?: ProfitMap): EvalContext | null {
  const m = metricsOf(t, d7);
  if (!m) return null;
  const campaign = d7.campaigns.find((c) => c.id === t.campaignId);
  const cost = m.cost ?? 0;
  const orders = m.orders ?? 0;
  return {
    cost,
    revenue: m.revenue ?? 0,
    orders,
    roi: m.roi,
    cpa: orders > 0 ? cost / orders : null,
    breakEven: level === 'campaign' ? null : breakEvenOf(settings, t.productId),
    target: campaign?.targetRoi ?? null,
    budgetUse: level === 'campaign' && campaign?.budget && campaign.cost != null ? (cost / snapshotDays(d7) / campaign.budget) * 100 : null,
    ...(level !== 'campaign' && { productId: t.productId, ...profitContext(profit, t.productId) }),
  };
}

export const RECOVERING_REASON = 'Đang hồi phục — 7 ngày gần nhất đã tốt lên';

/**
 * Đối tượng của quy tắc theo đủ 3 khung — dùng chung Agent (quét + xét lại lúc duyệt), thẻ quy tắc, phần Dấu hiệu:
 * kept = đã xác nhận (7 = 14 ngày) + lỗ âm thầm; unconfirmed = dấu hiệu (7 ngày thuộc nhóm, 14 chưa); recovering = đang hồi phục.
 */
export function matchRuleTrend(
  rule: AgentRule,
  settings: AdsSettings,
  d7: AdsSnapshot,
  snaps: ConfirmSnaps,
  /** Nhật ký thao tác — BOT chỉnh ROI & ngân sách cần lịch sử bước thử */
  actions: AgentActionLog[] = [],
  now = Date.now(),
): { kept: ConfirmedTarget[]; unconfirmed: RuleTarget[]; recovering: RuleTarget[] } {
  // BOT chỉnh ROI & ngân sách (Sếp chốt 26/11): bảng quyết định theo tình huống, mỗi chiến dịch 1 hành động riêng
  if (ruleLevel(rule) === 'campaign' && rule.trigger === TUNE_TRIGGER) return tuneRuleTargets(rule, settings, d7, snaps, actions, now);
  // Nhóm hệ thống "Cân nhắc bật lại": hệ thống tự đánh giá theo 30 / 14 ngày (không dùng luật 7 = 14 ngày)
  if (ruleLevel(rule) === 'product' && rule.trigger === REENABLE_GROUP_ID) {
    return { kept: reEnableRuleTargets(rule, settings, d7, snaps), unconfirmed: [], recovering: [] };
  }
  // Lợi nhuận 1 đơn: 1 mức cho cả 3 khung (giống buildTrendIndex)
  const profit = profitPerOrderMap({ d7, d14: snaps.d14, d30: snaps.d30 }, settings);
  const primary = findRuleTargets(rule, settings, d7, profit);
  const { kept, unconfirmed } = confirmRuleTargets(rule, settings, primary, snaps, profit);
  const recovering: RuleTarget[] = [];
  const level = ruleLevel(rule);
  const G = rule.trigger ? findGroup(settings, rule.trigger, level) : undefined;
  if (!snaps.d14 || !snaps.d30 || !isSpendGated(G)) return { kept, unconfirmed, recovering };

  const in7 = new Set(primary.map((t) => targetKey(level, t.target)));
  const in30 = new Set(findRuleTargets(rule, settings, snaps.d30, profit).map((t) => targetKey(level, t.target)));
  const campaign7 = new Map(d7.campaigns.map((c) => [c.id, c]));
  for (const t14 of findRuleTargets(rule, settings, snaps.d14, profit)) {
    const k = targetKey(level, t14.target);
    if (in7.has(k) || !in30.has(k)) continue;
    const ctx = context7(level, t14.target, d7, settings, profit);
    if (!ctx || ctx.cost <= 0) continue; // 7 ngày không còn chi → không cần làm gì
    if (!isSpendGated(G, ctx)) continue; // điều kiện riêng của sản phẩm này không có ngưỡng chi
    const main = t14.target.videoId
      ? d7.videos.find((v) => v.campaignId === t14.target.campaignId && v.id === t14.target.videoId && v.productId === t14.target.productId) ??
        d7.videos.find((v) => v.campaignId === t14.target.campaignId && v.id === t14.target.videoId)
      : undefined;
    const t: RuleTarget = {
      target: main ? { ...t14.target, productId: main.productId } : t14.target,
      name: t14.name,
      reason: '',
      cost: ctx.cost,
      revenue: ctx.revenue,
      orders: ctx.orders,
      roi: ctx.roi,
      breakEven: ctx.breakEven,
      ...(main && { videoStatus: effectiveStatus(main) }),
      campaignRunning: campaign7.get(t14.target.campaignId)?.status === 'running',
    };
    if (matchesIgnoringSpend(G!, ctx)) {
      const roi = ctx.roi == null ? '--' : ctx.roi.toFixed(2).replace('.', ',');
      t.reason = `Lỗ âm thầm: 7 ngày chi ${shortVnd(ctx.cost)} (chưa tới ngưỡng) · ${ctx.orders} đơn · ROI ${roi} — 14 và 30 ngày đều ${G!.name}`;
      kept.push({
        ...t,
        windows: { d14: metricsOf(t.target, snaps.d14), d30: metricsOf(t.target, snaps.d30) },
        long: true,
        slowLoss: true,
      });
    } else {
      t.reason = `${RECOVERING_REASON} (14 và 30 ngày ${G!.name})`;
      recovering.push(t);
    }
  }
  return { kept, unconfirmed, recovering };
}
