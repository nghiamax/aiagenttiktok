import {
  Eye,
  Flame,
  Hourglass,
  KeyRound,
  Scissors,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { formatNumber, shortVnd } from '../../lib/format';
import type { AdsVideo } from './types';

/* ───────────── Kiểu dữ liệu ───────────── */

export type GroupTone = 'red' | 'green' | 'amber' | 'blue' | 'violet' | 'gray';
export type GroupIcon =
  | 'scissors'
  | 'trending'
  | 'key'
  | 'hourglass'
  | 'shield'
  | 'sparkles'
  | 'flame'
  | 'star'
  | 'eye'
  | 'tag';

/** budgetUse: mức tiêu ngân sách (%) = chi TB/ngày ÷ ngân sách ngày × 100 — chỉ có ở cấp chiến dịch */
export type Metric = 'cost' | 'revenue' | 'orders' | 'roi' | 'cpa' | 'budgetUse';
export type Op = 'gte' | 'gt' | 'lte' | 'lt' | 'eq';

export type ClauseValue =
  | { type: 'number'; n: number }
  /** ROI hoà vốn của sản phẩm × k */
  | { type: 'breakEven'; k: number }
  /** ROI mục tiêu của chiến dịch × k */
  | { type: 'target'; k: number };

export interface Clause {
  metric: Metric;
  op: Op;
  value: ClauseValue;
}

/** Một "cách" nhận diện: mọi điều kiện nối bằng VÀ */
export interface ConditionSet {
  clauses: Clause[];
}

/**
 * platform: theo trạng thái TikTok (khoá, không sửa điều kiện)
 * custom: điều kiện do shop tự định nghĩa
 * fallback: các video còn lại (luôn đứng cuối)
 */
export type GroupKind = 'platform' | 'custom' | 'fallback';

export interface GroupDef {
  id: string;
  name: string;
  tone: GroupTone;
  icon: GroupIcon;
  kind: GroupKind;
  /** Nhóm mẫu: không xoá được (vẫn sửa được tên, điều kiện) */
  builtin: boolean;
  /** Hiện thành một ô ở "Agent đang theo dõi" trên Tổng quan */
  showInInbox: boolean;
  /** Các cách nhận diện, nối bằng HOẶC */
  conditionSets: ConditionSet[];
}

/* ───────────── Hiển thị ───────────── */

export const GROUP_ICONS: Record<GroupIcon, LucideIcon> = {
  scissors: Scissors,
  trending: TrendingUp,
  key: KeyRound,
  hourglass: Hourglass,
  shield: ShieldCheck,
  sparkles: Sparkles,
  flame: Flame,
  star: Star,
  eye: Eye,
  tag: Tag,
};

/** Màu nền + chữ cho badge và ô icon */
export const GROUP_TONES: Record<GroupTone, string> = {
  red: 'bg-rose-50 text-danger',
  green: 'bg-green-50 text-accent-green',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-primary',
  violet: 'bg-violet-50 text-accent-violet',
  gray: 'bg-canvas text-muted',
};

/** Chấm màu đậm dùng trong bảng chọn màu */
export const GROUP_TONE_DOT: Record<GroupTone, string> = {
  red: 'bg-danger',
  green: 'bg-accent-green',
  amber: 'bg-amber-500',
  blue: 'bg-primary',
  violet: 'bg-accent-violet',
  gray: 'bg-muted',
};

export function groupMeta(group: GroupDef): { label: string; icon: LucideIcon; tone: string } {
  return { label: group.name, icon: GROUP_ICONS[group.icon] ?? Tag, tone: GROUP_TONES[group.tone] ?? GROUP_TONES.gray };
}

export const METRIC_LABEL: Record<Metric, string> = {
  cost: 'Chi phí',
  revenue: 'Doanh thu',
  orders: 'Đơn hàng',
  roi: 'ROI',
  cpa: 'CPA',
  budgetUse: 'Mức tiêu ngân sách',
};

/** Chỉ số dùng cho nhóm video và quy tắc cấp video/sản phẩm (không có mức tiêu ngân sách) */
export const ENTITY_METRICS: Metric[] = ['cost', 'revenue', 'orders', 'roi', 'cpa'];

const METRIC_SHORT: Record<Metric, string> = {
  cost: 'Chi',
  revenue: 'DT',
  orders: 'Đơn',
  roi: 'ROI',
  cpa: 'CPA',
  budgetUse: 'Tiêu NS',
};

export const OP_LABEL: Record<Op, string> = { gte: '≥', gt: '>', lte: '≤', lt: '<', eq: '=' };

/** Chỉ số tính bằng tiền (hiển thị dạng 100k / 1,2 tr) */
export const isMoneyMetric = (m: Metric) => m === 'cost' || m === 'revenue' || m === 'cpa';

function metricValueText(metric: Metric, n: number): string {
  if (isMoneyMetric(metric)) return n < 1000 ? `${formatNumber(n)}đ` : shortVnd(n);
  if (metric === 'roi') return formatNumber(n, 2);
  if (metric === 'budgetUse') return `${formatNumber(n)}%`;
  return formatNumber(n);
}

function refText(value: ClauseValue, metric: Metric): string {
  if (value.type === 'number') return metricValueText(metric, value.n);
  const base = value.type === 'breakEven' ? 'ROI hoà vốn' : 'ROI mục tiêu';
  return value.k === 1 ? base : `${formatNumber(value.k, 2)} lần ${base}`;
}

/** "Chi phí ≥ 100k", "ROI < ROI hoà vốn", "Đơn hàng = 0" */
export function clauseText(c: Clause): string {
  return `${METRIC_LABEL[c.metric]} ${OP_LABEL[c.op]} ${refText(c.value, c.metric)}`;
}

/** Mô tả cả nhóm bằng lời */
export function groupDescription(group: GroupDef): string {
  if (group.kind === 'platform') {
    return 'Theo trạng thái TikTok: video cần ủy quyền nhưng đã có chi phí, đơn hoặc doanh thu';
  }
  if (group.kind === 'fallback') return 'Video có chi phí hoặc đơn nhưng không thuộc nhóm nào ở trên';
  return conditionSetsText(group.conditionSets);
}

/** Mô tả các cách (HOẶC) gồm điều kiện (VÀ) bằng lời */
export function conditionSetsText(sets: ConditionSet[]): string {
  if (sets.length === 0) return 'Chưa có điều kiện';
  return sets.map((s) => s.clauses.map(clauseText).join(' và ')).join(' · hoặc ');
}

/* ───────────── Đánh giá ───────────── */

/** Số liệu của một video dùng để so điều kiện */
export interface EvalContext {
  cost: number;
  revenue: number;
  orders: number;
  roi: number | null;
  cpa: number | null;
  /** ROI hoà vốn của sản phẩm (null nếu chưa nhập) */
  breakEven: number | null;
  /** ROI mục tiêu của chiến dịch (null nếu không có) */
  target: number | null;
  /** Mức tiêu ngân sách (%) — chỉ cấp chiến dịch, còn lại null */
  budgetUse: number | null;
}

function metricOf(metric: Metric, ctx: EvalContext): number | null {
  return ctx[metric];
}

function resolveValue(value: ClauseValue, ctx: EvalContext): number | null {
  if (value.type === 'number') return value.n;
  const base = value.type === 'breakEven' ? ctx.breakEven : ctx.target;
  return base == null ? null : base * value.k;
}

function compare(a: number, op: Op, b: number): boolean {
  switch (op) {
    case 'gte':
      return a >= b;
    case 'gt':
      return a > b;
    case 'lte':
      return a <= b;
    case 'lt':
      return a < b;
    default:
      return Math.abs(a - b) < 1e-9;
  }
}

/** Thiếu số liệu hoặc thiếu hoà vốn/mục tiêu → điều kiện coi như không khớp */
export function clauseHolds(c: Clause, ctx: EvalContext): boolean {
  const a = metricOf(c.metric, ctx);
  const b = resolveValue(c.value, ctx);
  return a != null && b != null && compare(a, c.op, b);
}

export function matchSet(set: ConditionSet, ctx: EvalContext): boolean {
  return set.clauses.length > 0 && set.clauses.every((c) => clauseHolds(c, ctx));
}

export function matchesPlatform(video: AdsVideo, ctx: EvalContext): boolean {
  return video.status === 'authorization_needed' && (ctx.cost > 0 || ctx.orders > 0 || ctx.revenue > 0);
}

/** Lý do từ cách khớp: "Chi 1,81 tr ≥ 100k · ROI 4,08 < hoà vốn 5" */
export function reasonFor(set: ConditionSet, ctx: EvalContext): string {
  // Gom các điều kiện cùng chỉ số: "Chi 87k > 0đ, < 100k"
  const byMetric = new Map<Metric, string[]>();
  for (const c of set.clauses) {
    const actual = metricOf(c.metric, ctx);
    const ref = resolveValue(c.value, ctx);
    const refLabel =
      c.value.type === 'number'
        ? metricValueText(c.metric, c.value.n)
        : `${c.value.type === 'breakEven' ? 'hoà vốn' : 'mục tiêu'} ${ref == null ? '--' : formatNumber(ref, 2)}`;
    const part = c.op === 'eq' && actual != null ? '' : `${OP_LABEL[c.op]} ${refLabel}`;
    byMetric.set(c.metric, [...(byMetric.get(c.metric) ?? []), part]);
  }
  return [...byMetric]
    .map(([metric, parts]) => {
      const actual = metricOf(metric, ctx);
      const actualText = actual == null ? '--' : metricValueText(metric, actual);
      const cond = parts.filter(Boolean).join(', ');
      return cond ? `${METRIC_SHORT[metric]} ${actualText} ${cond}` : `${METRIC_SHORT[metric]} = ${actualText}`;
    })
    .join(' · ');
}

/** Sắp lại: nhóm fallback luôn ở cuối */
export function normalizeGroups(groups: GroupDef[]): GroupDef[] {
  return [...groups.filter((g) => g.kind !== 'fallback'), ...groups.filter((g) => g.kind === 'fallback')];
}

/** Điều kiện mặc định cho nhóm / cách mới */
export const newClause = (): Clause => ({ metric: 'cost', op: 'gte', value: { type: 'number', n: 100000 } });
