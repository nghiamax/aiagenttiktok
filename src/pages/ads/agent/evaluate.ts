import { formatNumber, shortVnd } from '../../../lib/format';
import {
  CUT_ACTIONS,
  STARTS_FROM_ZERO,
  compareWindows,
  cutWindows,
  dailyProfit,
  evaluateAction,
  MIN_SAMPLE,
  type ActionEvaluation,
  type Verdict,
  cutLateText,
  cutRoiText,
} from '../../../../shared/actionVerdict';
import type { AgentActionLog, AgentProposal, AgentRule, RuleMode } from './types';

// Phần chấm Đúng / Sai dùng chung web + server (BOT thêm lại video khi gỡ sai) → shared/actionVerdict.ts
export {
  LATE_CLOSE_RATIO,
  MIN_COST_DIFF,
  MIN_SAMPLE,
  compareWindows,
  cutWindows,
  evaluateAction,
  type ActionEvaluation,
  type Verdict,
} from '../../../../shared/actionVerdict';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

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
    // Chưa đủ số liệu = vẫn đang chờ thêm ngày
    // Sát hoà vốn (gỡ có đơn về muộn): đơn muộn còn có thể về → coi như còn chờ, không tính vào tỷ lệ đúng
    pending: count('pending') + count('insufficient') + count('close'),
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
        text: `Đúng ${pct(s.accuracy)} trên ${scored} thao tác — có thể chuyển sang BOT chạy.`,
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
/**
 * Mốc hiện Ngày 1 sau thao tác = thao tác + 24h (khớp server/agent/afterMetrics.ts).
 * Ngày 1 = ngày lịch kế sau ngày thao tác (giờ VN).
 */
export function firstAfterReadyAt(executedAt: string): number {
  return Date.parse(executedAt) + DAY;
}

/** Ngày lịch VN (yyyy-MM-dd) của mốc thời gian */
export const vnDateOf = (ms: number) => new Date(ms + 7 * HOUR).toISOString().slice(0, 10);

/** Ngày 1 sau thao tác (yyyy-MM-dd, giờ VN) */
export function firstAfterDate(executedAt: string): string {
  return vnDateOf(Date.parse(`${vnDateOf(Date.parse(executedAt))}T00:00:00+07:00`) + DAY);
}

/** "20/11" */
export const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/**
 * 1 câu kết luận: so trung bình / ngày SAU thao tác (after.days) với TRƯỚC (before) + lợi / lỗ ước tính từ evaluateAction.
 * null = không cần câu (nhắc việc, lệnh lỗi).
 */
export function summarizeAction(a: AgentActionLog, ev: ActionEvaluation, now = Date.now()): ActionSummaryLine | null {
  if (a.actionType === 'remind' || a.status === 'failed' || a.status === 'running') return null;
  const days = a.after?.days ?? [];
  // Chưa có khối nào → câu chờ đã nằm trong ô "Sau thao tác", không lặp ở đây
  if (days.length === 0) return null;
  if (a.status === 'undone') return { tone: 'muted', text: 'Đã hoàn tác — không chấm điểm' };

  const n = days.length;
  const { base, after, total } = compareWindows(a);
  // Ngày cuối là hôm nay → số còn tăng; video đổi sau đó → chỉ chấm các ngày trước mốc dừng
  const partial = days[n - 1].date >= vnDateOf(now);
  const head = `${n} ngày sau${partial ? ' (tạm tính)' : ''}${a.measureStop ? ` (dừng đo từ ${dayMonth(a.measureStop.date)})` : ''}`;
  const facts = `chi ${vndShort(total.cost)} · DT ${vndShort(total.revenue)} · ${formatNumber(total.orders)} đơn`;
  const fromZero = STARTS_FROM_ZERO.has(a.actionType);

  if (ev.verdict === 'unscorable') return { tone: 'muted', text: `${head}: ${facts} · chưa chấm được — thiếu ROI hoà vốn` };
  if (ev.verdict === 'insufficient') return { tone: 'muted', text: `Chưa đủ số liệu để chấm — ${head}: ${facts}` };
  if (ev.verdict === 'close') {
    const c = cutWindows(a);
    const verb = a.actionType === 'remove_creative' ? 'gỡ' : 'tắt';
    return {
      tone: 'muted',
      text: `≈ Sát hoà vốn — ${cutLateText(a, c)} → ${cutRoiText(a, c).replace('<', '≈')}: ${verb} gần như không lợi không hại · đơn về muộn còn về thì có thể thành ${verb === 'gỡ' ? 'Gỡ' : 'Tắt'} sai`,
    };
  }
  if (ev.verdict !== 'good' && ev.verdict !== 'bad') return { tone: 'muted', text: `${head}: ${facts}` };

  const be = a.before.breakEven!;
  const profit = ev.profitEffect ?? 0;
  const hint = UNDO_HINT[a.actionType];
  if (CUT_ACTIONS.has(a.actionType)) {
    const c = cutWindows(a);
    if (c.hasLate || c.full) {
      // Có đơn ngày gỡ / về sau, hoặc đã đủ ngày gỡ → chấm theo ROI lúc gỡ tính cả các đơn này, nói rõ khoảng đã tính
      if (ev.verdict === 'good') {
        return {
          tone: 'good',
          text: `✓ Đúng — ${cutLateText(a, c)} → vẫn ${cutRoiText(a, c)} · tránh lỗ ~${vndShort(-dailyProfit(c.base, be))}/ngày → lợi ~${vndShort(profit)}`,
        };
      }
      const verb = a.actionType === 'remove_creative' ? 'Gỡ sai' : 'Tắt sai';
      return {
        tone: 'bad',
        text: `✗ ${verb} — ${cutLateText(a, c)} → ${cutRoiText(a, c)}: thực ra lãi ${signed(dailyProfit(c.base, be))}/ngày → lỗ ~${vndShort(-profit)}${hint ? ` · cân nhắc ${hint}` : ''}`,
      };
    }
  }
  // Cùng 1 mẫu cho mọi thao tác: lãi/lỗ mỗi ngày sau vs trước
  const beforeText = fromZero ? '0đ — đang tắt' : signed(dailyProfit(base, be));
  const line = `${head}: lãi/lỗ ${signed(dailyProfit(after, be))}/ngày (trước ${beforeText}) · ${facts}`;
  if (ev.verdict === 'good') return { tone: 'good', text: `✓ Đúng — ${line} → lợi ~${vndShort(profit)}` };
  return { tone: 'bad', text: `✗ Sai — ${line} → lỗ ~${vndShort(-profit)}${hint ? ` · cân nhắc ${hint}` : ''}` };
}

/** "+43k" / "−64k" */
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${shortVnd(Math.abs(Math.round(n)))}`;

/** Gợi ý khi chấm Sai */
const UNDO_HINT: Partial<Record<AgentActionLog['actionType'], string>> = {
  remove_creative: 'Thêm lại',
  add_creative: 'Gỡ lại',
  disable_product: 'Bật lại',
  enable_product: 'Tắt lại',
  update_budget: 'đổi lại ngân sách',
  update_roi_target: 'đổi lại ROI mục tiêu',
};
