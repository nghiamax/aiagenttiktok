/**
 * Gợi ý cho shop: đọc số liệu thật → gợi ý bằng lời dễ hiểu + quy tắc nên bật (luôn ở chế độ Cần duyệt).
 * Luật cố định, không dùng AI. Hàm thuần — web dùng bây giờ, Telegram / AI dùng lại sau.
 */
import type { AdsSnapshot } from './adsSnapshot.js';
import { MIN_BOOST_BUDGET_VND } from './agentPolicy.js';
import { findRuleTargets, ruleLevel, snapshotDays, type RuleTarget } from './agentMatch.js';
import type { AgentActionType, AgentGuardrails, AgentRule, AgentRuleParams, AgentTarget, RuleLevel } from './agentTypes.js';
import { contextForCampaign } from './classify.js';
import { formatNumber, shortVnd } from './format.js';
import { groupDescription } from './groups.js';
import { breakEvenOf, findGroup, type AdsSettings } from './settings.js';

/** urgent: đang mất tiền / cần làm ngay · opportunity: cơ hội tăng doanh thu · tidy: nên làm */
export type SuggestionSeverity = 'urgent' | 'opportunity' | 'tidy';

export interface SuggestionExample {
  target: AgentTarget;
  name: string;
  /** Số liệu ngắn: "Chi 677k · DT 1,11 tr · ROI 1,63" */
  metrics: string;
}

export type SuggestionAction =
  | {
      kind: 'rule';
      level: RuleLevel;
      /** ID nhóm */
      trigger: string;
      actionType: AgentActionType;
      params: AgentRuleParams;
      /** Tên quy tắc khi tạo mới */
      name: string;
      /** Đổi giới hạn an toàn kèm theo (vd nâng trần tăng cường) */
      guardrailsPatch?: Partial<AgentGuardrails>;
      /** Câu mô tả việc sẽ làm khi bấm */
      effect: string;
    }
  | { kind: 'breakEven' };

export interface Suggestion {
  id: string;
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
}

const SEVERITY_ORDER: Record<SuggestionSeverity, number> = { urgent: 0, opportunity: 1, tidy: 2 };
const MAX_EXAMPLES = 3;

const money = (n: number | null) => (n == null ? '--' : n > 0 && n < 1000 ? `${formatNumber(n)}đ` : shortVnd(n));
const roiText = (n: number | null) => (n == null ? '--' : formatNumber(n, 2));
const sum = (xs: RuleTarget[], k: 'cost' | 'revenue') => xs.reduce((s, x) => s + (x[k] ?? 0), 0);

/** Quy tắc giả để dùng findRuleTargets (đếm giống hệt Agent) */
function probe(level: RuleLevel, trigger: string): AgentRule {
  return {
    id: `probe-${level}-${trigger}`,
    name: '',
    level,
    trigger,
    actionType: 'remind',
    params: {},
    mode: 'approve',
    cooldownHours: 0,
    campaignIds: null,
    productIds: null,
  };
}

/** Đã có quy tắc cùng cấp + nhóm + loại hành động đang bật */
export function findMatchingRule(
  rules: AgentRule[],
  a: { level: RuleLevel; trigger: string; actionType: AgentActionType },
): AgentRule | undefined {
  return rules.find((r) => ruleLevel(r) === a.level && r.trigger === a.trigger && r.actionType === a.actionType);
}

const isActive = (r: AgentRule | undefined) => !!r && r.mode !== 'off';

interface RuleSpec {
  id: string;
  severity: SuggestionSeverity;
  level: RuleLevel;
  group: string;
  actionType: AgentActionType;
  params: AgentRuleParams;
  name: string;
  /** Tiền dùng để sắp xếp: chi phí (mất tiền) hoặc doanh thu (cơ hội) */
  amountBy: 'cost' | 'revenue';
  title: (t: RuleTarget[]) => string;
  detail: (t: RuleTarget[]) => string;
  effect: string;
  example?: (t: RuleTarget) => string;
  /** Chỉ xét đối tượng thoả điều kiện này (lọc nhiễu) */
  filter?: (t: RuleTarget) => boolean;
}

/** Sản phẩm chi dưới mức này coi là nhiễu, chưa đủ để kết luận lỗ */
const MIN_PRODUCT_COST = 50_000;
/** Gợi ý cấp chiến dịch chỉ xét chiến dịch đang chạy */
const runningOnly = (t: RuleTarget) => t.campaignRunning;

const defaultExample = (t: RuleTarget) =>
  `Chi ${money(t.cost)} · DT ${money(t.revenue)} · ROI ${roiText(t.roi)}${t.breakEven != null ? ` (hoà vốn ${roiText(t.breakEven)})` : ''}`;

export function buildSuggestions(
  snapshot: AdsSnapshot,
  settings: AdsSettings,
  rules: AgentRule[],
  guardrails: AgentGuardrails,
): Suggestion[] {
  const out: Suggestion[] = [];
  const days = snapshotDays(snapshot);
  const campaignById = new Map(snapshot.campaigns.map((c) => [c.id, c]));

  /* 1. Thiếu ROI hoà vốn */
  const missing = [...new Map(snapshot.products.map((p) => [p.id, p])).values()].filter(
    (p) => ((p.cost ?? 0) > 0 || (p.orders ?? 0) > 0) && breakEvenOf(settings, p.id) == null,
  );
  if (missing.length > 0) {
    out.push({
      id: 'break-even',
      severity: 'urgent',
      title: `${missing.length} sản phẩm chưa có ROI hoà vốn`,
      detail:
        'ROI hoà vốn là mức ROI mà dưới đó bán ra vẫn lỗ (sau giá vốn, phí sàn, ship…). Thiếu số này Agent không biết sản phẩm / video đang lời hay lỗ, nên các nhóm "Cắt lỗ", "Lỗ" sẽ không bắt được.',
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

  const boostBudget = MIN_BOOST_BUDGET_VND;
  const specs: RuleSpec[] = [
    {
      id: 'video-cut',
      severity: 'urgent',
      level: 'video',
      group: 'cut',
      actionType: 'remove_creative',
      params: {},
      name: 'Gỡ video lỗ',
      amountBy: 'cost',
      title: (t) => `${t.length} video đã tiêu ${money(sum(t, 'cost'))} nhưng lỗ hoặc chưa ra đơn`,
      detail: () =>
        'Các video này đang ăn ngân sách mà không mang lại lời. Gỡ khỏi chiến dịch để TikTok dồn tiền sang video khác tốt hơn. Gỡ có thể thêm lại được.',
      effect: 'Agent sẽ đề xuất gỡ từng video này — Sếp duyệt mới làm.',
    },
    {
      id: 'product-loss',
      severity: 'urgent',
      level: 'product',
      group: 'p-loss',
      actionType: 'remind',
      params: {},
      name: 'Nhắc sản phẩm lỗ',
      amountBy: 'cost',
      filter: (t) => (t.cost ?? 0) >= MIN_PRODUCT_COST,
      title: (t) =>
        t.length === 1
          ? `Sản phẩm "${t[0].name}" đang lỗ (ROI ${roiText(t[0].roi)} < hoà vốn ${roiText(t[0].breakEven)})`
          : `${t.length} sản phẩm đang lỗ, đã chi ${money(sum(t, 'cost'))}`,
      detail: () =>
        'ROI của sản phẩm thấp hơn ROI hoà vốn: càng chạy càng lỗ. Nên xem lại giá bán, video đang chạy, hoặc nâng ROI mục tiêu của chiến dịch.',
      effect: 'Agent sẽ ghi nhắc việc vào Nhật ký mỗi khi sản phẩm còn lỗ.',
    },
    {
      id: 'campaign-low-roi',
      severity: 'urgent',
      level: 'campaign',
      group: 'c-low-roi',
      actionType: 'update_budget',
      params: { budgetChangePct: -20 },
      name: 'Giảm ngân sách 20% khi ROI thấp',
      amountBy: 'cost',
      filter: runningOnly,
      title: (t) =>
        t.length === 1
          ? `Chiến dịch có ROI ${roiText(t[0].roi)} — thấp hơn nhiều so với mục tiêu ${roiText(campaignById.get(t[0].target.campaignId)?.targetRoi ?? null)}`
          : `${t.length} chiến dịch có ROI thấp hơn 80% mục tiêu`,
      detail: () =>
        'Chiến dịch chạy kém xa mục tiêu đặt ra. Giảm bớt ngân sách để hạn chế tiền tiêu không hiệu quả trong lúc xem lại video / sản phẩm.',
      effect: 'Agent sẽ đề xuất giảm 20% ngân sách ngày của chiến dịch — Sếp duyệt mới làm.',
      example: (t) => {
        const c = campaignById.get(t.target.campaignId);
        return `Chi ${money(t.cost)} · ROI ${roiText(t.roi)} / mục tiêu ${roiText(c?.targetRoi ?? null)}`;
      },
    },
    {
      id: 'video-scale',
      severity: 'opportunity',
      level: 'video',
      group: 'scale',
      actionType: 'boost_creative',
      params: { boostBudget, boostDays: 1 },
      name: 'Tăng cường video tốt',
      amountBy: 'revenue',
      title: (t) => `${t.length} video đang bán tốt — có thể đẩy thêm`,
      detail: () =>
        'Các video này có ít nhất 3 đơn và ROI đạt mục tiêu. Tăng cường (thêm ngân sách riêng cho video) giúp video tiếp cận nhiều người mua hơn.',
      effect: `Agent sẽ đề xuất tăng cường ${shortVnd(boostBudget)}/ngày × 1 ngày cho từng video (mức tối thiểu TikTok cho phép) — Sếp duyệt mới làm.`,
    },
    {
      id: 'campaign-scale',
      severity: 'opportunity',
      level: 'campaign',
      group: 'c-scale',
      actionType: 'update_budget',
      params: { budgetChangePct: 20 },
      name: 'Tăng ngân sách 20% khi tiêu hết, ROI tốt',
      amountBy: 'revenue',
      filter: runningOnly,
      title: (t) =>
        t.length === 1 ? 'Chiến dịch đang bị giới hạn ngân sách dù ROI tốt' : `${t.length} chiến dịch tiêu hết ngân sách mà ROI vẫn tốt`,
      detail: () =>
        'Chiến dịch tiêu gần hết ngân sách mỗi ngày và ROI vẫn đạt mục tiêu — tức là còn khách mà hết tiền. Tăng ngân sách để bán thêm.',
      effect: 'Agent sẽ đề xuất tăng 20% ngân sách ngày (trong giới hạn an toàn) — Sếp duyệt mới làm.',
      example: (t) => {
        const c = campaignById.get(t.target.campaignId);
        const use = c ? contextForCampaign(c, days).budgetUse : null;
        return `Tiêu ${use == null ? '--' : formatNumber(use)}% ngân sách · ROI ${roiText(t.roi)} / mục tiêu ${roiText(c?.targetRoi ?? null)}`;
      },
    },
    {
      id: 'campaign-slow',
      severity: 'opportunity',
      level: 'campaign',
      group: 'c-slow',
      actionType: 'update_roi_target',
      params: { roiTargetChangePct: -10 },
      name: 'Giảm ROI mục tiêu 10% khi tiêu chậm',
      amountBy: 'cost',
      filter: runningOnly,
      title: (t) => (t.length === 1 ? 'Chiến dịch tiêu chưa tới nửa ngân sách' : `${t.length} chiến dịch tiêu chưa tới nửa ngân sách`),
      detail: () =>
        'TikTok đang phân phối ít vì ROI mục tiêu đặt cao so với khả năng. Giảm nhẹ ROI mục tiêu để TikTok mạnh tay phân phối hơn — đổi lại ROI có thể giảm chút.',
      effect: 'Agent sẽ đề xuất giảm 10% ROI mục tiêu của chiến dịch — Sếp duyệt mới làm.',
      example: (t) => {
        const c = campaignById.get(t.target.campaignId);
        const use = c ? contextForCampaign(c, days).budgetUse : null;
        return `Tiêu ${use == null ? '--' : formatNumber(use)}% ngân sách · ROI mục tiêu ${roiText(c?.targetRoi ?? null)}`;
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
      amountBy: 'revenue',
      title: (t) => `${t.length} video cần ủy quyền đã mang về ${money(sum(t, 'revenue'))} doanh thu`,
      detail: () =>
        'Video của KOC / affiliate cần được ủy quyền thì quảng cáo mới chạy ổn định. Liên hệ chủ video xin mã ủy quyền để không bị ngắt.',
      effect: 'Agent sẽ ghi nhắc việc vào Nhật ký cho từng video cần ủy quyền.',
    },
  ];

  for (const s of specs) {
    const group = findGroup(settings, s.group, s.level);
    if (!group) continue; // Sếp đã xoá nhóm mặc định → bỏ qua
    const targets = findRuleTargets(probe(s.level, s.group), settings, snapshot).filter(s.filter ?? (() => true));
    if (targets.length === 0) continue;

    const guardrailsPatch: Partial<AgentGuardrails> | undefined =
      s.actionType === 'boost_creative' && guardrails.dailyBoostCap < boostBudget ? { dailyBoostCap: boostBudget } : undefined;
    const sorted = [...targets].sort((a, b) => (b[s.amountBy] ?? 0) - (a[s.amountBy] ?? 0));

    out.push({
      id: s.id,
      severity: s.severity,
      title: s.title(sorted),
      detail: s.detail(sorted),
      why: groupDescription(group, s.level),
      examples: sorted.slice(0, MAX_EXAMPLES).map((t) => ({
        target: t.target,
        name: t.name,
        metrics: (s.example ?? defaultExample)(t),
      })),
      count: targets.length,
      amount: sum(targets, s.amountBy),
      action: {
        kind: 'rule',
        level: s.level,
        trigger: s.group,
        actionType: s.actionType,
        params: s.params,
        name: s.name,
        guardrailsPatch,
        effect: guardrailsPatch
          ? `${s.effect} Trần tăng cường/ngày sẽ được nâng lên ${shortVnd(boostBudget)}.`
          : s.effect,
      },
      done: isActive(findMatchingRule(rules, { level: s.level, trigger: s.group, actionType: s.actionType })),
    });
  }

  // Thiếu hoà vốn luôn đứng đầu: thiếu số này thì các gợi ý lời / lỗ khác chưa chính xác
  const rank = (s: Suggestion) => (s.action.kind === 'breakEven' ? -1 : SEVERITY_ORDER[s.severity]);
  return out.sort((a, b) => Number(a.done) - Number(b.done) || rank(a) - rank(b) || b.amount - a.amount);
}
