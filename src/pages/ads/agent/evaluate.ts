import { formatNumber, shortVnd } from '../../../lib/format';
import type { AgentActionLog, AgentProposal, AgentRule, MetricWindow, RuleMode } from './types';

/**
 * Chấm kết quả thao tác của Agent — mọi số là ƯỚC TÍNH, tính từ nhật ký thật:
 * - Mốc "nếu không làm gì" = chi phí / doanh thu mỗi ngày TRƯỚC thao tác × số ngày SAU thao tác.
 * - Lợi nhuận từ quảng cáo = doanh thu ÷ ROI hoà vốn − chi phí (hoà vốn ghi lúc quyết định).
 * - Gỡ video:  tác động = chi phí tránh được − doanh thu mất ÷ hoà vốn.
 * - Tăng cường / thêm lại / đổi ngân sách: tác động = DT thêm ÷ hoà vốn − chi thêm.
 */

export type Verdict = 'good' | 'bad' | 'pending' | 'unscorable' | 'excluded';

export interface ActionEvaluation {
  verdict: Verdict;
  /** Lợi nhuận tác động (VND, ước tính); null nếu chưa chấm được */
  profitEffect: number | null;
  /** Gỡ video: chi phí tránh được */
  avoidedCost: number | null;
  /** Gỡ video: doanh thu mất */
  lostRevenue: number | null;
  /** Tăng cường…: chi thêm so với mốc */
  extraCost: number | null;
  /** Tăng cường…: doanh thu thêm so với mốc */
  extraRevenue: number | null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Số thao tác đã chấm tối thiểu để đưa ra gợi ý */
export const MIN_SAMPLE = 5;

const EMPTY: Omit<ActionEvaluation, 'verdict'> = {
  profitEffect: null,
  avoidedCost: null,
  lostRevenue: null,
  extraCost: null,
  extraRevenue: null,
};

function windowDays(w: MetricWindow): number {
  // Tối thiểu 1 giờ để tránh chia cho 0
  return Math.max((new Date(w.to).getTime() - new Date(w.from).getTime()) / DAY, 1 / 24);
}

export function evaluateAction(a: AgentActionLog, evaluateAfterHours: number, now = Date.now()): ActionEvaluation {
  if (a.actionType === 'remind' || a.status !== 'success') return { verdict: 'excluded', ...EMPTY };
  if (!a.after || now - new Date(a.executedAt).getTime() < evaluateAfterHours * HOUR) {
    return { verdict: 'pending', ...EMPTY };
  }

  const before = a.before;
  const after = a.after;
  const ratio = windowDays(after) / windowDays(before);
  const baseCost = (before.cost ?? 0) * ratio;
  const baseRevenue = (before.revenue ?? 0) * ratio;
  const be = before.breakEven;

  // Thao tác "cắt" (gỡ video, tắt sản phẩm): đo bằng lỗ tránh được; còn lại đo bằng tác động thêm
  if (a.actionType === 'remove_creative' || a.actionType === 'disable_product') {
    const avoidedCost = Math.max(0, baseCost - (after.cost ?? 0));
    const lostRevenue = Math.max(0, baseRevenue - (after.revenue ?? 0));
    const profitEffect = be ? avoidedCost - lostRevenue / be : null;
    return {
      ...EMPTY,
      verdict: profitEffect == null ? 'unscorable' : profitEffect >= 0 ? 'good' : 'bad',
      profitEffect,
      avoidedCost,
      lostRevenue,
    };
  }

  const extraCost = (after.cost ?? 0) - baseCost;
  const extraRevenue = (after.revenue ?? 0) - baseRevenue;
  const profitEffect = be ? extraRevenue / be - extraCost : null;
  return {
    ...EMPTY,
    verdict: profitEffect == null ? 'unscorable' : profitEffect >= 0 ? 'good' : 'bad',
    profitEffect,
    extraCost,
    extraRevenue,
  };
}

export type Period = '7d' | '30d' | 'all';

export function inPeriod(iso: string, period: Period, now = Date.now()): boolean {
  if (period === 'all') return true;
  return now - new Date(iso).getTime() <= (period === '7d' ? 7 : 30) * DAY;
}

export interface ImpactSummary {
  /** Thao tác được tính (bỏ lỗi / hoàn tác / nhắc việc) */
  total: number;
  good: number;
  bad: number;
  pending: number;
  unscorable: number;
  /** đúng ÷ (đúng + sai); null nếu chưa có thao tác nào chấm được */
  accuracy: number | null;
  profitEffect: number | null;
  avoidedCost: number | null;
  extraRevenue: number | null;
}

export function summarize(list: { action: AgentActionLog; ev: ActionEvaluation }[]): ImpactSummary {
  const counted = list.filter((x) => x.ev.verdict !== 'excluded');
  const count = (v: Verdict) => counted.filter((x) => x.ev.verdict === v).length;
  const good = count('good');
  const bad = count('bad');
  const scored = counted.filter((x) => x.ev.profitEffect != null);
  const removes = counted.filter((x) => x.ev.avoidedCost != null);
  const boosts = counted.filter((x) => x.ev.extraRevenue != null);
  const sum = (xs: typeof counted, get: (e: ActionEvaluation) => number | null) =>
    xs.length === 0 ? null : xs.reduce((acc, x) => acc + (get(x.ev) ?? 0), 0);

  return {
    total: counted.length,
    good,
    bad,
    pending: count('pending'),
    unscorable: count('unscorable'),
    accuracy: good + bad > 0 ? good / (good + bad) : null,
    profitEffect: sum(scored, (e) => e.profitEffect),
    avoidedCost: sum(removes, (e) => e.avoidedCost),
    extraRevenue: sum(boosts, (e) => e.extraRevenue),
  };
}

export interface RuleImpact extends ImpactSummary {
  rule: AgentRule;
  proposals: number;
  rejected: number;
  /** Tỷ lệ đề xuất bị Sếp bỏ qua; null nếu chưa có đề xuất */
  rejectedRate: number | null;
}

export function ruleStats(
  rules: AgentRule[],
  list: { action: AgentActionLog; ev: ActionEvaluation }[],
  proposals: AgentProposal[],
): RuleImpact[] {
  return rules.map((rule) => {
    const own = proposals.filter((p) => p.ruleId === rule.id);
    const rejected = own.filter((p) => p.status === 'rejected').length;
    const decided = own.filter((p) => p.status === 'approved' || p.status === 'rejected').length;
    return {
      ...summarize(list.filter((x) => x.action.ruleId === rule.id)),
      rule,
      proposals: own.length,
      rejected,
      rejectedRate: decided > 0 ? rejected / decided : null,
    };
  });
}

export type LessonTarget = 'groups' | 'rules' | 'breakEven';

export interface Lesson {
  ruleId: string;
  tone: 'warn' | 'good' | 'info';
  text: string;
  target: LessonTarget;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Gợi ý chỉnh quy tắc theo luật rõ ràng (chỉ khi đủ mẫu) */
export function lessons(stats: RuleImpact[], groupName: (id: string) => string): Lesson[] {
  const out: Lesson[] = [];
  for (const s of stats) {
    const { rule } = s;
    const scored = s.good + s.bad;
    const errorRate = scored > 0 ? s.bad / scored : 0;
    const group = groupName(rule.trigger);

    if (s.unscorable > 0) {
      out.push({
        ruleId: rule.id,
        tone: 'info',
        target: 'breakEven',
        text: `${s.unscorable} thao tác chưa chấm được vì sản phẩm chưa có ROI hoà vốn — nhập hoà vốn để đánh giá.`,
      });
    }
    if (s.rejectedRate != null && s.rejectedRate >= 0.5 && s.rejected >= MIN_SAMPLE) {
      out.push({
        ruleId: rule.id,
        tone: 'warn',
        target: 'groups',
        text: `Sếp bỏ qua ${pct(s.rejectedRate)} đề xuất — định nghĩa nhóm “${group}” có thể chưa sát ý Sếp.`,
      });
    }
    if (scored < MIN_SAMPLE) continue;

    if (rule.actionType === 'remove_creative' && errorRate >= 0.3) {
      out.push({
        ruleId: rule.id,
        tone: 'warn',
        target: 'groups',
        text: `${pct(errorRate)} video bị gỡ vẫn có lời — cân nhắc nâng chi phí tối thiểu hoặc hạ hệ số hoà vốn của nhóm “${group}”.`,
      });
    } else if (rule.actionType === 'disable_product' && errorRate >= 0.3) {
      out.push({
        ruleId: rule.id,
        tone: 'warn',
        target: 'rules',
        text: `${pct(errorRate)} sản phẩm bị tắt vẫn có lời — siết điều kiện của quy tắc (vd ROI thấp hơn nữa, chi phí lớn hơn).`,
      });
    } else if (
      (rule.actionType === 'update_budget' || rule.actionType === 'update_roi_target') &&
      errorRate >= 0.4
    ) {
      out.push({
        ruleId: rule.id,
        tone: 'warn',
        target: 'rules',
        text: `${pct(errorRate)} lần đổi ${rule.actionType === 'update_budget' ? 'ngân sách' : 'ROI mục tiêu'} làm giảm lợi nhuận — nâng ngưỡng Mức tiêu ngân sách / ROI trong điều kiện, hoặc giảm % thay đổi.`,
      });
    } else if (rule.actionType === 'boost_creative' && errorRate >= 0.4) {
      out.push({
        ruleId: rule.id,
        tone: 'warn',
        target: 'groups',
        text: `${pct(errorRate)} lượt tăng cường bị lỗ — nâng số đơn tối thiểu, yêu cầu ROI ≥ 1,2 lần mục tiêu ở nhóm “${group}”, hoặc giảm ngân sách tăng cường.`,
      });
    }
    if ((rule.mode as RuleMode) === 'approve' && scored >= 10 && s.accuracy != null && s.accuracy >= 0.8) {
      out.push({
        ruleId: rule.id,
        tone: 'good',
        target: 'rules',
        text: `Đúng ${pct(s.accuracy)} trên ${scored} thao tác — có thể chuyển sang Tự chạy.`,
      });
    }
  }
  return out;
}

/** Tổng lợi nhuận tác động (ước tính) trong khoảng — null nếu chưa có thao tác chấm được */
export function impactTotal(actions: AgentActionLog[], evaluateAfterHours: number, period: Period): number | null {
  return summarize(
    actions.filter((a) => inPeriod(a.executedAt, period)).map((action) => ({ action, ev: evaluateAction(action, evaluateAfterHours) })),
  ).profitEffect;
}

/* ───────── Câu kết luận ngắn cho mỗi dòng Nhật ký ───────── */

export interface ActionSummaryLine {
  tone: 'good' | 'bad' | 'muted';
  text: string;
}

const vndShort = (n: number) => shortVnd(Math.max(0, Math.round(n)));
const roiText = (r: number | null) => (r == null ? '--' : formatNumber(r, 2));
const perDay = (n: number) => formatNumber(n, 1);
/**
 * Mốc có số "24h đầu" sau thao tác (khớp server/agent/afterMetrics.ts):
 * khối bắt đầu ở giờ tròn kế tiếp, dài 24h, TikTok trễ số ~1h.
 */
export function firstAfterReadyAt(executedAt: string): number {
  return Math.ceil(Date.parse(executedAt) / HOUR) * HOUR + DAY + HOUR;
}

/**
 * 1 câu kết luận: so trung bình / ngày SAU thao tác (after.days) với TRƯỚC (before) + lợi / lỗ ước tính từ evaluateAction.
 * null = không cần câu (nhắc việc, lệnh lỗi).
 */
export function summarizeAction(a: AgentActionLog, ev: ActionEvaluation): ActionSummaryLine | null {
  if (a.actionType === 'remind' || a.status === 'failed' || a.status === 'running') return null;
  const days = a.after?.days ?? [];
  // Chưa có khối nào → câu chờ đã nằm trong ô "Sau thao tác", không lặp ở đây
  if (days.length === 0) return null;
  if (a.status === 'undone') return { tone: 'muted', text: 'Đã hoàn tác — không chấm điểm' };

  const n = days.length;
  const bDays = Math.max(1, Math.round(windowDays(a.before)));
  const b = { cost: (a.before.cost ?? 0) / bDays, revenue: (a.before.revenue ?? 0) / bDays, orders: (a.before.orders ?? 0) / bDays };
  const after = a.after!;
  const x = { cost: (after.cost ?? 0) / n, orders: (after.orders ?? 0) / n };
  const head = n === 1 ? '24h sau' : `${n} ngày sau`;

  if (ev.verdict === 'unscorable') return { tone: 'muted', text: `${head}: ROI ${roiText(after.roi)} (trước ${roiText(a.before.roi)}) · chưa chấm được — thiếu ROI hoà vốn` };
  if (ev.verdict !== 'good' && ev.verdict !== 'bad') {
    return { tone: 'muted', text: `${head}: ROI ${roiText(after.roi)} (trước ${roiText(a.before.roi)}), ${perDay(x.orders)} đơn/ngày (trước ${perDay(b.orders)})` };
  }

  const profit = ev.profitEffect ?? 0;
  if (a.actionType === 'remove_creative' || a.actionType === 'disable_product') {
    const what = a.actionType === 'remove_creative' ? 'Gỡ' : 'Tắt sản phẩm';
    return ev.verdict === 'good'
      ? {
          tone: 'good',
          text: `✓ ${what} đúng — ${head}: chi ${vndShort(x.cost)}/ngày (trước ${vndShort(b.cost)}), ${perDay(x.orders)} đơn/ngày (trước ${perDay(b.orders)}) → lợi ~${vndShort(profit / n)}/ngày`,
        }
      : {
          tone: 'bad',
          text: `✗ ${what} chưa đúng — ${head} mất ~${vndShort(-profit)} lời (trước DT ${vndShort(b.revenue)}/ngày, ${perDay(b.orders)} đơn/ngày) → cân nhắc ${a.actionType === 'remove_creative' ? 'Thêm lại' : 'Bật lại'}`,
        };
  }
  const detail = `${head}: ROI ${roiText(after.roi)} (trước ${roiText(a.before.roi)}), ${perDay(x.orders)} đơn/ngày (trước ${perDay(b.orders)})`;
  return ev.verdict === 'good'
    ? { tone: 'good', text: `✓ Hiệu quả — ${detail} → lợi ~${vndShort(profit)}` }
    : { tone: 'bad', text: `✗ Chưa hiệu quả — ${detail} → lỗ ~${vndShort(-profit)}` };
}
