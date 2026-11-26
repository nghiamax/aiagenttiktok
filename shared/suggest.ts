/**
 * Gợi ý cho shop: đọc số liệu thật → gợi ý bằng lời dễ hiểu + quy tắc nên bật (luôn ở chế độ Cần duyệt).
 * BỘ GỢI Ý CHUNG cho mọi shop (shared/suggestRules.ts): mỗi gợi ý tự mang điều kiện riêng, ngưỡng tính theo mốc
 * của từng shop (CPA hoà vốn, ROI hoà vốn / mục tiêu, % ngân sách) — KHÔNG phụ thuộc nhóm Sếp tự định nghĩa.
 * Nhóm chỉ dùng khi bấm "Bật quy tắc" (quy tắc Agent chạy theo nhóm).
 * Luật cố định, không dùng AI. Hàm thuần — web dùng bây giờ, Telegram / AI dùng lại sau.
 */
import type { AdsSnapshot, AdsVideo, Campaign } from './adsSnapshot.js';
import { MIN_BOOST_BUDGET_VND } from './agentPolicy.js';
import { collectVideoTargets, ineligibleReason, ruleLevel, snapshotDays, targetKey, type RuleTarget } from './agentMatch.js';
import type { AgentActionType, AgentGuardrails, AgentRule, AgentRuleParams, AgentTarget, RuleLevel } from './agentTypes.js';
import { contextForCampaign } from './classify.js';
import { formatNumber, shortVnd } from './format.js';
import { breakEvenOf, findGroup, type AdsSettings } from './settings.js';
import { TUNE_TRIGGER } from './campaignTune.js';
import { offsetChip } from './offsetText.js';
import { effectiveStatus } from './videoStatus.js';
import {
  cpaBreakEvenMap,
  FALLBACK_CPA_VND,
  isSuggestionOff,
  suggestParams,
  type SuggestionId,
} from './suggestRules.js';

/** urgent: đang mất tiền / cần làm ngay · opportunity: cơ hội tăng doanh thu · tidy: nên làm */
export type SuggestionSeverity = 'urgent' | 'opportunity' | 'tidy';

export interface SuggestionExample {
  target: AgentTarget;
  name: string;
  /** Số liệu ngắn: "Chi 677k · DT 1,11 tr · ROI 1,63" */
  metrics: string;
  /** Cảnh báo ngắn (vd gỡ video có đơn bù ở sản phẩm khác: "có đơn bù · tổng ROI 5,9") */
  warning?: string;
}

export type SuggestionAction =
  | {
      kind: 'rule';
      level: RuleLevel;
      /** ID nhóm mà quy tắc Agent sẽ dùng */
      trigger: string;
      actionType: AgentActionType;
      params: AgentRuleParams;
      /** Tên quy tắc khi tạo mới */
      name: string;
      /** Đổi giới hạn an toàn kèm theo (vd nâng trần tăng cường) */
      guardrailsPatch?: Partial<AgentGuardrails>;
      /** Câu mô tả việc sẽ làm khi bấm */
      effect: string;
      /** Shop đã xoá nhóm tương ứng → chưa bật quy tắc được (gợi ý vẫn hiện) */
      groupMissing?: boolean;
    }
  | { kind: 'breakEven' }
  /** Chỉ thông tin + lời khuyên, chưa có quy tắc Agent tương ứng */
  | { kind: 'info'; effect: string };

export interface Suggestion {
  id: SuggestionId;
  severity: SuggestionSeverity;
  title: string;
  /** Giải thích cho người mới */
  detail: string;
  /** Điều kiện nhận diện (bằng lời) */
  why: string;
  examples: SuggestionExample[];
  /** Tổng số đối tượng (để ẩn gợi ý tới khi số này tăng) */
  count: number;
  /** Số tiền liên quan (để sắp xếp) */
  amount: number;
  action: SuggestionAction;
  /** Đã có quy tắc tương ứng đang bật */
  done: boolean;
  /** Số đối tượng khớp 7 ngày nhưng khung 14 ngày không khớp (không tính vào gợi ý) */
  unconfirmed?: number;
}

/** Xác nhận bằng khung 14 ngày: collect = gom khoá đối tượng khớp; keep = chỉ giữ đối tượng có trong bộ đã gom */
interface ConfirmPass {
  collect?: Map<SuggestionId, Set<string>>;
  keep?: Map<SuggestionId, Set<string>>;
}
/** Gợi ý theo trạng thái TikTok (không phụ thuộc khung thời gian) → không cần xác nhận */
const NO_CONFIRM = new Set<SuggestionId>(['video-authorize']);

const SEVERITY_ORDER: Record<SuggestionSeverity, number> = { urgent: 0, opportunity: 1, tidy: 2 };
const MAX_EXAMPLES = 3;

const money = (n: number | null) => (n == null ? '--' : n > 0 && n < 1000 ? `${formatNumber(n)}đ` : shortVnd(n));
const roiText = (n: number | null) => (n == null ? '--' : formatNumber(n, 2));
const kText = (k: number) => formatNumber(k, 2);
/** Tên dài (tên sản phẩm TikTok) → rút gọn cho tiêu đề */
const shortName = (name: string, max = 48) => (name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name);
const sum = (xs: RuleTarget[], k: 'cost' | 'revenue') => xs.reduce((s, x) => s + (x[k] ?? 0), 0);
const RUNNING_STATUSES = new Set(['delivering', 'learning']);

/** Đã có quy tắc cùng cấp + nhóm + loại hành động */
export function findMatchingRule(
  rules: AgentRule[],
  a: { level: RuleLevel; trigger: string; actionType: AgentActionType },
): AgentRule | undefined {
  return rules.find((r) => ruleLevel(r) === a.level && r.trigger === a.trigger && r.actionType === a.actionType);
}

const isActive = (r: AgentRule | undefined) => !!r && r.mode !== 'off';

/**
 * Cấp chiến dịch chỉ còn "BOT chỉnh ROI & ngân sách" (Sếp chốt 26/11): gợi ý chiến dịch vẫn tự nhận diện,
 * nhưng nút "Bật quy tắc" bật quy tắc c-tune (BOT tự chọn tăng / giảm theo tình huống).
 */
export const TUNE_RULE_ACTION = { level: 'campaign' as const, trigger: TUNE_TRIGGER, actionType: 'update_roi_target' as const };
const TUNE_EFFECT =
  'Bật quy tắc BOT chỉnh ROI & ngân sách (Cần duyệt): BOT tự chọn tăng / giảm ngân sách hoặc ROI mục tiêu theo Chiến lược điều chỉnh, đo lại và trả về nếu xấu đi — Sếp duyệt mới làm.';

interface RuleSpec {
  id: SuggestionId;
  severity: SuggestionSeverity;
  level: RuleLevel;
  /** Nhóm mặc định mà quy tắc Agent dùng khi bấm "Bật quy tắc" */
  group: string;
  actionType: AgentActionType;
  params: AgentRuleParams;
  name: string;
  targets: RuleTarget[];
  /** Tiền dùng để sắp xếp: chi phí (mất tiền) hoặc doanh thu (cơ hội) */
  amountBy: 'cost' | 'revenue';
  why: string;
  title: (t: RuleTarget[]) => string;
  detail: string;
  effect: string;
  example?: (t: RuleTarget) => string;
}

const defaultExample = (t: RuleTarget) =>
  `Chi ${money(t.cost)} · DT ${money(t.revenue)} · ROI ${roiText(t.roi)}${t.breakEven != null ? ` (hoà vốn ${roiText(t.breakEven)})` : ''}`;

const CPA_WORD = 'mốc chi cho 1 đơn (= giá trị đơn TB ÷ ROI hoà vốn';

/**
 * Gợi ý cho shop. `confirm` = snapshot 14 ngày tính cả hôm nay: gợi ý về video / sản phẩm / chiến dịch chỉ tính đối tượng
 * đúng điều kiện ở CẢ khung chính (7 ngày) và 14 ngày — giống cách Agent xác nhận (Sếp chốt 22/11). Thiếu → chỉ xét 1 khung.
 */
export function buildSuggestions(
  snapshot: AdsSnapshot,
  settings: AdsSettings,
  rules: AgentRule[],
  guardrails: AgentGuardrails,
  confirm?: AdsSnapshot | null,
): Suggestion[] {
  if (!confirm) return buildCore(snapshot, settings, rules, guardrails);
  const collect = new Map<SuggestionId, Set<string>>();
  buildCore(confirm, settings, rules, guardrails, { collect });
  return buildCore(snapshot, settings, rules, guardrails, { keep: collect });
}

function buildCore(
  snapshot: AdsSnapshot,
  settings: AdsSettings,
  rules: AgentRule[],
  guardrails: AgentGuardrails,
  pass: ConfirmPass = {},
): Suggestion[] {
  const out: Suggestion[] = [];
  const days = snapshotDays(snapshot);
  const campaignById = new Map(snapshot.campaigns.map((c) => [c.id, c]));
  const running = (id: string) => campaignById.get(id)?.status === 'running';
  const cpaMap = cpaBreakEvenMap(snapshot, settings);
  /** Mốc chi cho 1 đơn của sản phẩm; chưa tính được → ngưỡng dự phòng */
  const cpaOf = (productId: string) => cpaMap.get(productId) ?? FALLBACK_CPA_VND;
  const fallbackText = `; chưa tính được thì ${money(FALLBACK_CPA_VND)})`;
  const on = (id: SuggestionId) => !isSuggestionOff(settings, id);

  /* 1. Thiếu ROI hoà vốn */
  if (on('break-even')) {
    const missing = [...new Map(snapshot.products.map((p) => [p.id, p])).values()].filter(
      (p) => ((p.cost ?? 0) > 0 || (p.orders ?? 0) > 0) && breakEvenOf(settings, p.id) == null,
    );
    if (missing.length > 0) {
      out.push({
        id: 'break-even',
        severity: 'urgent',
        title: `${missing.length} sản phẩm chưa có ROI hoà vốn`,
        detail:
          'ROI hoà vốn là mức ROI mà dưới đó bán ra vẫn lỗ (sau giá vốn, phí sàn, ship…). Thiếu số này hệ thống không biết sản phẩm / video đang lời hay lỗ, và không tính được mốc chi tối đa cho 1 đơn.',
        why: 'Sản phẩm có chi phí hoặc đơn hàng nhưng chưa nhập ROI hoà vốn',
        examples: missing.slice(0, MAX_EXAMPLES).map((p) => ({
          target: { campaignId: p.campaignId, productId: p.id, videoId: '' },
          name: p.name,
          metrics: `Chi ${money(p.cost)} · ROI ${roiText(p.roi)}`,
        })),
        count: missing.length,
        amount: missing.reduce((s, p) => s + (p.cost ?? 0), 0),
        action: { kind: 'breakEven' },
        done: false,
      });
    }
  }

  /* Dòng video còn xét được (không phải dòng không khả dụng / cần ủy quyền thật) */
  const isAuthorizeRow = (v: AdsVideo) =>
    v.status === 'authorization_needed' && !v.crossProduct && ((v.cost ?? 0) > 0 || (v.orders ?? 0) > 0 || (v.revenue ?? 0) > 0);
  const normalRow = (v: AdsVideo) => effectiveStatus(v) !== 'unavailable' && !isAuthorizeRow(v);
  const rowRoi = (v: AdsVideo) => ((v.cost ?? 0) > 0 ? (v.revenue ?? 0) / (v.cost ?? 0) : null);

  /* 2. Gỡ video lỗ */
  const cutP = suggestParams(settings, 'video-cut');
  const cutLimit = new Map<string, number>();
  const cutTargets = collectVideoTargets(snapshot, settings, (v) => {
    if (!normalRow(v)) return null;
    const cost = v.cost ?? 0;
    const orders = v.orders ?? 0;
    const limit = cpaOf(v.productId);
    const be = breakEvenOf(settings, v.productId);
    const roi = rowRoi(v);
    let reason: string | null = null;
    if (orders === 0 && cost > 0 && cost >= cutP.noOrderCpaX * limit) {
      reason = `Chi ${money(cost)} ≥ ${kText(cutP.noOrderCpaX)}× mốc ${money(limit)} · 0 đơn`;
    } else if (be != null && roi != null && roi < be && cost >= cutP.lossCpaX * limit) {
      reason = `Chi ${money(cost)} ≥ ${kText(cutP.lossCpaX)}× mốc ${money(limit)} · ROI ${roiText(roi)} < hoà vốn ${roiText(be)}`;
    }
    if (reason) {
      const key = `${v.campaignId}/${v.id}`;
      if (!cutLimit.has(key)) cutLimit.set(key, limit);
    }
    return reason;
  });

  /* 3. Sản phẩm lỗ */
  const lossP = suggestParams(settings, 'product-loss');
  const lossTargets: RuleTarget[] = snapshot.products.flatMap((p) => {
    if (p.excluded) return []; // đã tắt khỏi chiến dịch
    const cost = p.cost ?? 0;
    const be = breakEvenOf(settings, p.id);
    if (be == null || cost <= 0) return [];
    const roi = (p.revenue ?? 0) / cost;
    if (!(roi < be) || cost < lossP.minCpaX * cpaOf(p.id)) return [];
    return [
      {
        target: { campaignId: p.campaignId, productId: p.id, videoId: '' },
        name: p.name,
        reason: `ROI ${roiText(roi)} < hoà vốn ${roiText(be)}`,
        cost: p.cost,
        revenue: p.revenue,
        orders: p.orders,
        roi,
        breakEven: be,
        campaignRunning: running(p.campaignId),
      },
    ];
  });

  /* 4, 6, 7. Chiến dịch (đang chạy) — mỗi chiến dịch chỉ vào 1 loại, ưu tiên: tiêu hết NS ROI tốt → ROI thấp → tiêu chậm */
  const lowP = suggestParams(settings, 'campaign-low-roi');
  const scaleCP = suggestParams(settings, 'campaign-scale');
  const slowP = suggestParams(settings, 'campaign-slow');
  type CampaignKind = 'campaign-scale' | 'campaign-low-roi' | 'campaign-slow';
  const campaignKind = (c: Campaign): CampaignKind | null => {
    if (c.status !== 'running') return null;
    const ctx = contextForCampaign(c, days);
    if (!(ctx.cost > 0 || ctx.orders > 0 || ctx.revenue > 0)) return null;
    const t = ctx.target;
    if (on('campaign-scale') && ctx.budgetUse != null && ctx.budgetUse >= scaleCP.minBudgetUsePct && t != null && ctx.roi != null && ctx.roi >= scaleCP.roiTargetX * t)
      return 'campaign-scale';
    const enoughData = c.budget ? ctx.cost >= lowP.minBudgetDays * c.budget : ctx.cost > 0;
    if (on('campaign-low-roi') && t != null && ctx.roi != null && ctx.roi < lowP.roiTargetX * t && enoughData) return 'campaign-low-roi';
    if (on('campaign-slow') && ctx.budgetUse != null && ctx.budgetUse < slowP.maxBudgetUsePct) return 'campaign-slow';
    return null;
  };
  const campaignTargets = (kind: CampaignKind): RuleTarget[] =>
    snapshot.campaigns
      .filter((c) => campaignKind(c) === kind)
      .map((c) => ({
        target: { campaignId: c.id, productId: '', videoId: '' },
        name: c.name,
        reason: '',
        cost: c.cost,
        revenue: c.revenue,
        orders: c.orders,
        roi: c.roi,
        breakEven: null,
        campaignRunning: true,
      }));
  const useText = (c: Campaign | undefined) => {
    const use = c ? contextForCampaign(c, days).budgetUse : null;
    return `Tiêu ${use == null ? '--' : formatNumber(use)}% ngân sách`;
  };

  /* 5. Tăng cường video tốt — mức tối thiểu TikTok tính theo VND; tài khoản tiền khác → chưa hỗ trợ */
  const scaleVP = suggestParams(settings, 'video-scale');
  const currency = snapshot.advertiser?.currency;
  const boostSupported = !currency || currency === 'VND';
  const boostBudget = MIN_BOOST_BUDGET_VND;
  const scaleTargets = boostSupported
    ? collectVideoTargets(snapshot, settings, (v) => {
        if (!normalRow(v)) return null;
        const target = campaignById.get(v.campaignId)?.targetRoi ?? null;
        const roi = rowRoi(v);
        const orders = v.orders ?? 0;
        if (target == null || roi == null || orders < scaleVP.minOrders || roi < scaleVP.roiTargetX * target) return null;
        return `${formatNumber(orders)} đơn · ROI ${roiText(roi)} ≥ mục tiêu ${roiText(target)}`;
      })
    : [];

  /* 8. Video cần ủy quyền */
  const authTargets = collectVideoTargets(snapshot, settings, (v) =>
    isAuthorizeRow(v) ? `Cần ủy quyền · ${formatNumber(v.orders ?? 0)} đơn · DT ${money(v.revenue)}` : null,
  );

  const specs: RuleSpec[] = [
    {
      id: 'video-cut',
      severity: 'urgent',
      level: 'video',
      group: 'cut',
      actionType: 'remove_creative',
      params: {},
      name: 'Gỡ video lỗ',
      targets: cutTargets,
      amountBy: 'cost',
      why: `Chi ≥ ${kText(cutP.noOrderCpaX)}× ${CPA_WORD}${fallbackText} mà chưa có đơn; hoặc chi ≥ ${kText(cutP.lossCpaX)}× mốc đó và ROI < hoà vốn`,
      title: (t) => `${t.length} video đã tiêu ${money(sum(t, 'cost'))} nhưng lỗ hoặc chưa ra đơn`,
      detail:
        'Các video này đã tiêu quá số tiền shop chịu được cho 1 đơn mà không mang lại lời. Gỡ khỏi chiến dịch để TikTok dồn tiền sang video khác tốt hơn. Gỡ có thể thêm lại được.',
      effect: 'Agent sẽ đề xuất gỡ từng video — Sếp duyệt mới làm.',
      example: (t) => {
        const limit = cutLimit.get(`${t.target.campaignId}/${t.target.videoId}`);
        return `${defaultExample(t)}${limit != null ? ` · mốc ${money(limit)}` : ''}`;
      },
    },
    {
      id: 'product-loss',
      severity: 'urgent',
      level: 'product',
      group: 'p-loss',
      actionType: 'remind',
      params: {},
      name: 'Nhắc sản phẩm lỗ',
      targets: lossTargets,
      amountBy: 'cost',
      why: `ROI < ROI hoà vốn và đã chi ≥ ${kText(lossP.minCpaX)}× ${CPA_WORD}${fallbackText}`,
      title: (t) =>
        t.length === 1
          ? `Sản phẩm "${shortName(t[0].name)}" đang lỗ (ROI ${roiText(t[0].roi)} < hoà vốn ${roiText(t[0].breakEven)})`
          : `${t.length} sản phẩm đang lỗ, đã chi ${money(sum(t, 'cost'))}`,
      detail:
        'ROI của sản phẩm thấp hơn ROI hoà vốn: càng chạy càng lỗ. Nên xem lại giá bán, video đang chạy, hoặc nâng ROI mục tiêu của chiến dịch.',
      effect: 'Agent sẽ ghi nhắc việc vào Nhật ký mỗi khi sản phẩm còn lỗ.',
    },
    {
      id: 'campaign-low-roi',
      severity: 'urgent',
      level: 'campaign',
      group: 'c-low-roi',
      actionType: 'update_budget',
      params: { budgetChangePct: lowP.budgetChangePct },
      name: `Giảm ngân sách ${Math.abs(lowP.budgetChangePct)}% khi ROI thấp`,
      targets: campaignTargets('campaign-low-roi'),
      amountBy: 'cost',
      why: `Chiến dịch đang chạy, ROI < ${kText(lowP.roiTargetX)}× ROI mục tiêu, đã chi ≥ ${kText(lowP.minBudgetDays)} ngày ngân sách`,
      title: (t) =>
        t.length === 1
          ? `Chiến dịch có ROI ${roiText(t[0].roi)} — thấp hơn nhiều so với mục tiêu ${roiText(campaignById.get(t[0].target.campaignId)?.targetRoi ?? null)}`
          : `${t.length} chiến dịch có ROI thấp hơn ${formatNumber(lowP.roiTargetX * 100)}% mục tiêu`,
      detail:
        'Chiến dịch chạy kém xa mục tiêu đặt ra. Giảm bớt ngân sách để hạn chế tiền tiêu không hiệu quả trong lúc xem lại video / sản phẩm.',
      effect: `Agent sẽ đề xuất giảm ${Math.abs(lowP.budgetChangePct)}% ngân sách ngày của chiến dịch — Sếp duyệt mới làm.`,
      example: (t) => `Chi ${money(t.cost)} · ROI ${roiText(t.roi)} / mục tiêu ${roiText(campaignById.get(t.target.campaignId)?.targetRoi ?? null)}`,
    },
    {
      id: 'video-scale',
      severity: 'opportunity',
      level: 'video',
      group: 'scale',
      actionType: 'boost_creative',
      params: { boostBudget, boostDays: 1 },
      name: 'Tăng cường video tốt',
      targets: scaleTargets,
      amountBy: 'revenue',
      why: `Video có ≥ ${formatNumber(scaleVP.minOrders)} đơn và ROI ≥ ${kText(scaleVP.roiTargetX)}× ROI mục tiêu của chiến dịch`,
      title: (t) => `${t.length} video đang bán tốt — có thể đẩy thêm`,
      detail:
        'Các video này đã ra đủ đơn và ROI đạt mục tiêu. Tăng cường (thêm ngân sách riêng cho video) giúp video tiếp cận nhiều người mua hơn.',
      effect: `Agent sẽ đề xuất tăng cường ${shortVnd(boostBudget)}/ngày × 1 ngày cho từng video (mức tối thiểu TikTok cho phép) — Sếp duyệt mới làm.`,
    },
    {
      id: 'campaign-scale',
      severity: 'opportunity',
      level: 'campaign',
      group: 'c-scale',
      actionType: 'update_budget',
      params: { budgetChangePct: scaleCP.budgetChangePct },
      name: `Tăng ngân sách ${scaleCP.budgetChangePct}% khi tiêu hết, ROI tốt`,
      targets: campaignTargets('campaign-scale'),
      amountBy: 'revenue',
      why: `Chiến dịch đang chạy, tiêu ≥ ${formatNumber(scaleCP.minBudgetUsePct)}% ngân sách ngày và ROI ≥ ${kText(scaleCP.roiTargetX)}× ROI mục tiêu`,
      title: (t) =>
        t.length === 1 ? 'Chiến dịch đang bị giới hạn ngân sách dù ROI tốt' : `${t.length} chiến dịch tiêu hết ngân sách mà ROI vẫn tốt`,
      detail:
        'Chiến dịch tiêu gần hết ngân sách mỗi ngày và ROI vẫn đạt mục tiêu — tức là còn khách mà hết tiền. Tăng ngân sách để bán thêm.',
      effect: `Agent sẽ đề xuất tăng ${scaleCP.budgetChangePct}% ngân sách ngày (trong giới hạn an toàn) — Sếp duyệt mới làm.`,
      example: (t) => {
        const c = campaignById.get(t.target.campaignId);
        return `${useText(c)} · ROI ${roiText(t.roi)} / mục tiêu ${roiText(c?.targetRoi ?? null)}`;
      },
    },
    {
      id: 'campaign-slow',
      severity: 'opportunity',
      level: 'campaign',
      group: 'c-slow',
      actionType: 'update_roi_target',
      params: { roiTargetChangePct: slowP.roiTargetChangePct },
      name: `Giảm ROI mục tiêu ${Math.abs(slowP.roiTargetChangePct)}% khi tiêu chậm`,
      targets: campaignTargets('campaign-slow'),
      amountBy: 'cost',
      why: `Chiến dịch đang chạy, tiêu < ${formatNumber(slowP.maxBudgetUsePct)}% ngân sách ngày`,
      title: (t) =>
        t.length === 1
          ? `Chiến dịch tiêu chưa tới ${formatNumber(slowP.maxBudgetUsePct)}% ngân sách`
          : `${t.length} chiến dịch tiêu chưa tới ${formatNumber(slowP.maxBudgetUsePct)}% ngân sách`,
      detail:
        'TikTok đang phân phối ít vì ROI mục tiêu đặt cao so với khả năng. Giảm nhẹ ROI mục tiêu để TikTok mạnh tay phân phối hơn — đổi lại ROI có thể giảm chút.',
      effect: `Agent sẽ đề xuất giảm ${Math.abs(slowP.roiTargetChangePct)}% ROI mục tiêu của chiến dịch — Sếp duyệt mới làm.`,
      example: (t) => {
        const c = campaignById.get(t.target.campaignId);
        return `${useText(c)} · ROI mục tiêu ${roiText(c?.targetRoi ?? null)}`;
      },
    },
    {
      id: 'video-authorize',
      severity: 'tidy',
      level: 'video',
      group: 'authorize',
      actionType: 'remind',
      params: {},
      name: 'Nhắc ủy quyền',
      targets: authTargets,
      amountBy: 'revenue',
      why: 'TikTok báo video cần ủy quyền, và video đã có chi phí, đơn hoặc doanh thu',
      title: (t) => `${t.length} video cần ủy quyền đã mang về ${money(sum(t, 'revenue'))} doanh thu`,
      detail:
        'Video của KOC / affiliate cần được ủy quyền thì quảng cáo mới chạy ổn định. Liên hệ chủ video xin mã ủy quyền để không bị ngắt.',
      effect: 'Agent sẽ ghi nhắc việc vào Nhật ký cho từng video cần ủy quyền.',
    },
  ];

  for (const s of specs) {
    if (!on(s.id)) continue;
    // Bỏ đối tượng TikTok không cho làm (vd video đã bị gỡ, chiến dịch tắt) — giống bộ máy quét
    let targets = s.targets.filter((t) => ineligibleReason(s.actionType, s.params, t) == null);
    const keyOf = (t: RuleTarget) => targetKey(s.level, t.target);
    if (pass.collect) pass.collect.set(s.id, new Set(targets.map(keyOf)));
    let unconfirmed = 0;
    if (pass.keep && !NO_CONFIRM.has(s.id)) {
      const ok = pass.keep.get(s.id) ?? new Set<string>();
      const all = targets.length;
      targets = targets.filter((t) => ok.has(keyOf(t)));
      unconfirmed = all - targets.length;
    }
    if (targets.length === 0) continue;

    const guardrailsPatch: Partial<AgentGuardrails> | undefined =
      s.actionType === 'boost_creative' && guardrails.dailyBoostCap < boostBudget ? { dailyBoostCap: boostBudget } : undefined;
    // Gỡ video: video có đơn bù ở sản phẩm khác lên đầu để Sếp thấy cảnh báo
    const isCut = s.actionType === 'remove_creative';
    const sorted = [...targets].sort(
      (a, b) => (isCut ? Number(!!b.offset) - Number(!!a.offset) : 0) || (b[s.amountBy] ?? 0) - (a[s.amountBy] ?? 0),
    );
    const withOffset = isCut ? targets.filter((t) => t.offset).length : 0;
    const tuneRule = s.level === 'campaign';
    const groupMissing = !tuneRule && !findGroup(settings, s.group, s.level);

    out.push({
      id: s.id,
      severity: s.severity,
      title: withOffset > 0 ? `${s.title(sorted)} (${withOffset} video có đơn bù ở SP khác — xem kỹ trước khi gỡ)` : s.title(sorted),
      detail: s.detail,
      why: s.why,
      examples: sorted.slice(0, MAX_EXAMPLES).map((t) => ({
        target: t.target,
        name: t.name,
        metrics: (s.example ?? defaultExample)(t),
        ...(isCut && t.offset && { warning: offsetChip(t.offset) }),
      })),
      count: targets.length,
      amount: sum(targets, s.amountBy),
      action: tuneRule
        ? { kind: 'rule', ...TUNE_RULE_ACTION, params: {}, name: 'BOT chỉnh ROI & ngân sách', effect: TUNE_EFFECT }
        : {
            kind: 'rule',
            level: s.level,
            trigger: s.group,
            actionType: s.actionType,
            params: s.params,
            name: s.name,
            guardrailsPatch,
            effect: guardrailsPatch ? `${s.effect} Trần tăng cường/ngày sẽ được nâng lên ${shortVnd(boostBudget)}.` : s.effect,
            ...(groupMissing && { groupMissing: true }),
          },
      done: tuneRule
        ? isActive(findMatchingRule(rules, TUNE_RULE_ACTION))
        : !groupMissing && isActive(findMatchingRule(rules, { level: s.level, trigger: s.group, actionType: s.actionType })),
      ...(unconfirmed > 0 && { unconfirmed }),
    });
  }

  /* 12. Phụ thuộc vài video */
  if (on('video-concentration')) {
    const p = suggestParams(settings, 'video-concentration');
    const byVideo = new Map<string, { v: AdsVideo; revenue: number; cost: number; topRow: number }>();
    let total = 0;
    for (const v of snapshot.videos) {
      const rev = v.revenue ?? 0;
      total += rev;
      if (v.contentType === 'product_card' || rev <= 0) continue;
      const x = byVideo.get(v.id) ?? { v, revenue: 0, cost: 0, topRow: 0 };
      x.revenue += rev;
      x.cost += v.cost ?? 0;
      if (rev > x.topRow) Object.assign(x, { v, topRow: rev });
      byVideo.set(v.id, x);
    }
    const ranked = [...byVideo.values()].sort((a, b) => b.revenue - a.revenue);
    const top = ranked.slice(0, Math.max(1, Math.round(p.topN)));
    const topRevenue = top.reduce((s, x) => s + x.revenue, 0);
    const share = total > 0 ? (topRevenue / total) * 100 : 0;
    if (ranked.length >= p.minVideos && share >= p.minSharePct) {
      out.push({
        id: 'video-concentration',
        severity: 'tidy',
        title: `${top.length} video mang về ${formatNumber(share)}% doanh thu quảng cáo`,
        detail:
          'Doanh thu đang dồn vào vài video. Video nào hết trend hoặc bị TikTok ngừng chạy là doanh thu rơi mạnh — nên chuẩn bị thêm video mới (tự quay / xin KOC) cho các sản phẩm này.',
        why: `${formatNumber(p.topN)} video doanh thu cao nhất chiếm ≥ ${formatNumber(p.minSharePct)}% doanh thu quảng cáo cả shop (chỉ xét khi có ≥ ${formatNumber(p.minVideos)} video có doanh thu)`,
        examples: top.map((x) => ({
          target: { campaignId: x.v.campaignId, productId: x.v.productId, videoId: x.v.id },
          name: x.v.title || `Video ${x.v.id}`,
          metrics: `DT ${money(x.revenue)} · ${formatNumber(total > 0 ? (x.revenue / total) * 100 : 0)}% · ROI ${roiText(x.cost > 0 ? x.revenue / x.cost : null)}`,
        })),
        // Tỷ trọng tăng thêm thì hiện lại sau khi ẩn
        count: Math.round(share),
        amount: topRevenue,
        action: { kind: 'info', effect: 'Chuẩn bị 2–3 video mới cho các sản phẩm này để thay dần khi video cũ yếu đi.' },
        done: false,
      });
    }
  }

  /* 14. Sản phẩm thiếu video chạy được (chỉ xét chiến dịch đang chạy) */
  if (on('product-few-videos')) {
    const p = suggestParams(settings, 'product-few-videos');
    const byProduct = new Map<string, { name: string; campaignId: string; cost: number; videos: Set<string>; running: Set<string>; unavailable: Set<string> }>();
    for (const pr of snapshot.products) {
      if (!running(pr.campaignId) || pr.excluded) continue;
      const x = byProduct.get(pr.id) ?? { name: pr.name, campaignId: pr.campaignId, cost: 0, videos: new Set(), running: new Set(), unavailable: new Set() };
      x.cost += pr.cost ?? 0;
      byProduct.set(pr.id, x);
    }
    for (const v of snapshot.videos) {
      const x = byProduct.get(v.productId);
      if (!x || v.contentType === 'product_card' || !running(v.campaignId)) continue;
      x.videos.add(v.id);
      const st = effectiveStatus(v);
      if (RUNNING_STATUSES.has(st)) x.running.add(v.id);
      else if (st === 'unavailable') x.unavailable.add(v.id);
    }
    const hits = [...byProduct.entries()]
      .map(([id, x]) => ({ id, ...x, unavailableCount: [...x.unavailable].filter((v) => !x.running.has(v)).length }))
      .filter(
        (x) =>
          x.cost > 0 &&
          ((x.videos.size > 0 && (x.unavailableCount / x.videos.size) * 100 >= p.unavailableSharePct) || x.running.size <= p.maxRunningVideos),
      )
      .sort((a, b) => b.cost - a.cost);
    if (hits.length > 0) {
      out.push({
        id: 'product-few-videos',
        severity: 'tidy',
        title: hits.length === 1 ? `Sản phẩm "${shortName(hits[0].name)}" thiếu video chạy được` : `${hits.length} sản phẩm thiếu video chạy được`,
        detail:
          'Sản phẩm đang chạy quảng cáo nhưng còn rất ít video phân phối được (nhiều video bị TikTok ngừng chạy). Ít video thì TikTok khó tìm được video bán tốt — nên làm hoặc xin thêm video cho sản phẩm.',
        why: `Sản phẩm thuộc chiến dịch đang chạy, có chi tiêu, và ≥ ${formatNumber(p.unavailableSharePct)}% video bị TikTok báo không khả dụng hoặc chỉ còn ≤ ${formatNumber(p.maxRunningVideos)} video đang chạy`,
        examples: hits.slice(0, MAX_EXAMPLES).map((x) => ({
          target: { campaignId: x.campaignId, productId: x.id, videoId: '' },
          name: x.name,
          metrics: `${formatNumber(x.running.size)} video đang chạy · ${formatNumber(x.unavailableCount)} không khả dụng / ${formatNumber(x.videos.size)} · chi ${money(x.cost)}`,
        })),
        count: hits.length,
        amount: hits.reduce((s, x) => s + x.cost, 0),
        action: { kind: 'info', effect: 'Làm thêm hoặc xin KOC thêm video cho các sản phẩm này, rồi thêm vào chiến dịch.' },
        done: false,
      });
    }
  }

  // Thiếu hoà vốn luôn đứng đầu: thiếu số này thì các gợi ý lời / lỗ khác chưa chính xác
  const rank = (s: Suggestion) => (s.action.kind === 'breakEven' ? -1 : SEVERITY_ORDER[s.severity]);
  return out.sort((a, b) => Number(a.done) - Number(b.done) || rank(a) - rank(b) || b.amount - a.amount);
}
