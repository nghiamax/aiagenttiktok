import {
  Bell,
  Bot,
  CircleCheck,
  CircleX,
  Hand,
  Loader,
  PackageCheck,
  PackageX,
  RotateCcw,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { AUTO_MODE_ENABLED } from '../../../../shared/agentPolicy';
import { REENABLE_GROUP_ID } from '../../../../shared/reEnable';
import { formatNumber } from '../../../lib/format';
import { ENTITY_METRICS, type ClauseValue, type Metric } from '../groups';
import type {
  ActionActor,
  ActionStatus,
  AgentActionType,
  AgentRule,
  AgentRuleParams,
  RuleLevel,
  RuleMode,
} from './types';

interface Meta {
  label: string;
  icon: LucideIcon;
  className: string;
}

export const ACTION_TYPE_META: Record<AgentActionType, Meta> = {
  remove_creative: { label: 'Gỡ video', icon: Trash2, className: 'bg-rose-50 text-danger' },
  add_creative: { label: 'Thêm lại video', icon: RotateCcw, className: 'bg-blue-50 text-primary' },
  boost_creative: { label: 'Tăng cường', icon: Zap, className: 'bg-green-50 text-accent-green' },
  update_budget: { label: 'Đổi ngân sách', icon: Wallet, className: 'bg-violet-50 text-accent-violet' },
  update_roi_target: { label: 'Đổi ROI mục tiêu', icon: Target, className: 'bg-violet-50 text-accent-violet' },
  disable_product: { label: 'Tắt sản phẩm', icon: PackageX, className: 'bg-rose-50 text-danger' },
  enable_product: { label: 'Bật sản phẩm', icon: PackageCheck, className: 'bg-blue-50 text-primary' },
  remind: { label: 'Nhắc việc', icon: Bell, className: 'bg-amber-50 text-amber-600' },
};

/** Meta theo tham số: đổi ngân sách tăng (xanh) / giảm (cam) */
export function actionTypeMeta(actionType: AgentActionType, params: AgentRuleParams): Meta {
  if (actionType === 'update_budget' && params.budgetChangePct != null) {
    return params.budgetChangePct >= 0
      ? { label: 'Tăng ngân sách', icon: TrendingUp, className: 'bg-green-50 text-accent-green' }
      : { label: 'Giảm ngân sách', icon: TrendingDown, className: 'bg-amber-50 text-amber-600' };
  }
  return ACTION_TYPE_META[actionType];
}

export const ACTOR_META: Record<ActionActor, Meta> = {
  agent: { label: 'BOT tự chạy', icon: Bot, className: 'text-accent-violet' },
  approved: { label: 'Sếp duyệt', icon: UserCheck, className: 'text-primary' },
  manual: { label: 'Thủ công', icon: Hand, className: 'text-muted' },
};

export const STATUS_META: Record<ActionStatus, Meta> = {
  success: { label: 'Thành công', icon: CircleCheck, className: 'text-accent-green' },
  failed: { label: 'Lỗi', icon: CircleX, className: 'text-danger' },
  running: { label: 'Đang thực hiện', icon: Loader, className: 'text-primary' },
  undone: { label: 'Đã hoàn tác', icon: RotateCcw, className: 'text-muted' },
};

/** Chế độ quy tắc — "BOT chạy" theo AUTO_MODE_ENABLED (shared/agentPolicy.ts, Sếp mở 25/11) */
export const MODE_OPTIONS: { value: RuleMode; label: string }[] = [
  { value: 'off', label: 'Tắt' },
  { value: 'approve', label: 'Cần duyệt' },
  ...(AUTO_MODE_ENABLED ? [{ value: 'auto' as const, label: 'BOT chạy' }] : []),
];

export const MODE_LABEL: Record<RuleMode, string> = { off: 'Tắt', approve: 'Cần duyệt', auto: 'BOT chạy' };

/* ───────────── Cấp áp dụng ───────────── */

export const LEVEL_OPTIONS: { value: RuleLevel; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'product', label: 'Sản phẩm' },
  { value: 'campaign', label: 'Chiến dịch' },
];

export const LEVEL_LABEL: Record<RuleLevel, string> = { video: 'Video', product: 'Sản phẩm', campaign: 'Chiến dịch' };

/** Hành động hợp với từng cấp */
export const ACTIONS_BY_LEVEL: Record<RuleLevel, AgentActionType[]> = {
  video: ['remove_creative', 'boost_creative', 'remind'],
  product: ['disable_product', 'enable_product', 'remind'],
  campaign: ['update_budget', 'update_roi_target', 'remind'],
};

/** Hành động hợp với cấp + nhóm: nhóm hệ thống "Cân nhắc bật lại" (sản phẩm đang tắt) chỉ Bật sản phẩm / Nhắc việc */
export function actionsFor(level: RuleLevel, trigger: string): AgentActionType[] {
  return level === 'product' && trigger === REENABLE_GROUP_ID ? ['enable_product', 'remind'] : ACTIONS_BY_LEVEL[level];
}

/** Chỉ số dùng được trong điều kiện của từng cấp */
export const METRICS_BY_LEVEL: Record<RuleLevel, Metric[]> = {
  video: ENTITY_METRICS,
  product: ENTITY_METRICS,
  campaign: [...ENTITY_METRICS, 'budgetUse'],
};

/** Mốc so sánh ROI dùng được (chiến dịch có nhiều sản phẩm nên không so với hoà vốn) */
export const VALUE_TYPES_BY_LEVEL: Record<RuleLevel, ClauseValue['type'][]> = {
  video: ['number', 'breakEven', 'target', 'profit'],
  product: ['number', 'breakEven', 'target', 'profit'],
  campaign: ['number', 'target'],
};

export const ruleLevel = (rule: AgentRule): RuleLevel => rule.level ?? 'video';

/* ───────────── Mô tả bằng lời ───────────── */

function changeText(pct: number | undefined): string {
  const n = pct ?? 0;
  return `${n >= 0 ? 'Tăng' : 'Giảm'} ${formatNumber(Math.abs(n))}%`;
}

/** "50.000đ/ngày × 1 ngày", "Tăng 20%", "Giảm ROI mục tiêu 10%" */
export function paramsText(actionType: AgentActionType, params: AgentRuleParams): string | null {
  switch (actionType) {
    case 'boost_creative':
      return `${formatNumber(params.boostBudget ?? null)}đ/ngày × ${formatNumber(params.boostDays ?? null)} ngày`;
    case 'update_budget':
      return `${changeText(params.budgetChangePct)} ngân sách ngày`;
    case 'update_roi_target':
      return `${changeText(params.roiTargetChangePct)} ROI mục tiêu`;
    default:
      return null;
  }
}

/** Mô tả hành động của quy tắc */
export function actionText(rule: AgentRule): string {
  switch (rule.actionType) {
    case 'remove_creative':
      return 'Gỡ video khỏi chiến dịch GMV Max';
    case 'add_creative':
      return 'Thêm lại video vào chiến dịch';
    case 'boost_creative':
      return `Tăng cường video ${paramsText(rule.actionType, rule.params)}`;
    case 'update_budget':
    case 'update_roi_target':
      return `${paramsText(rule.actionType, rule.params)} của chiến dịch`;
    case 'disable_product':
      return 'Tắt sản phẩm khỏi chiến dịch GMV Max';
    case 'enable_product':
      return 'Bật lại sản phẩm trong chiến dịch';
    default:
      return 'Tạo việc nhắc Sếp (không thao tác trên TikTok)';
  }
}

/** Giá trị mặc định khi chọn một hành động */
export function defaultParams(actionType: AgentActionType): AgentRuleParams {
  switch (actionType) {
    case 'boost_creative':
      return { boostBudget: 50000, boostDays: 1 };
    case 'update_budget':
      return { budgetChangePct: 20 };
    case 'update_roi_target':
      return { roiTargetChangePct: -10 };
    default:
      return {};
  }
}

/** Cảnh báo khi % đổi ngân sách vượt giới hạn an toàn */
export function budgetLimitWarning(
  params: AgentRuleParams,
  limits: { maxBudgetIncreasePct: number; maxBudgetDecreasePct: number },
): string | null {
  const pct = params.budgetChangePct;
  if (pct == null) return null;
  if (pct > limits.maxBudgetIncreasePct) {
    return `Tăng ${pct}% vượt giới hạn ${limits.maxBudgetIncreasePct}%/ngày — BOT sẽ chỉ tăng tối đa ${limits.maxBudgetIncreasePct}%.`;
  }
  if (-pct > limits.maxBudgetDecreasePct) {
    return `Giảm ${-pct}% vượt giới hạn ${limits.maxBudgetDecreasePct}%/ngày — BOT sẽ chỉ giảm tối đa ${limits.maxBudgetDecreasePct}%.`;
  }
  return null;
}

export { MIN_BOOST_BUDGET_VND } from '../../../../shared/agentPolicy';
