import type { ConditionSet, GroupLevel } from '../groups';
import type { VideoAction } from '../types';

/** Cấp áp dụng của quy tắc (trùng cấp của nhóm) */
export type RuleLevel = GroupLevel;

/** Chế độ của quy tắc: Tắt / Cần Sếp duyệt / Agent tự chạy */
export type RuleMode = 'off' | 'approve' | 'auto';

/**
 * Loại hành động. Khớp tool MCP TikTok:
 * remove/add_creative → gmv_max_creative_update, boost_creative → campaign_gmv_max_session_create,
 * update_budget → campaign_gmv_max_update. remind: chỉ nhắc việc, không thao tác trên TikTok.
 */
export type AgentActionType =
  | 'remove_creative'
  | 'add_creative'
  | 'boost_creative'
  | 'update_budget'
  | 'update_roi_target'
  | 'disable_product'
  | 'enable_product'
  | 'remind';

export interface AgentRuleParams {
  /** Ngân sách tăng cường mỗi ngày (VND) */
  boostBudget?: number;
  /** Số ngày tăng cường */
  boostDays?: number;
  /** Đổi ngân sách ngày của chiến dịch (%): dương = tăng, âm = giảm */
  budgetChangePct?: number;
  /** Đổi ROI mục tiêu của chiến dịch (%): dương = tăng, âm = giảm */
  roiTargetChangePct?: number;
}

export interface AgentRule {
  id: string;
  name: string;
  /** Cấp áp dụng (thiếu = video, cho bản lưu cũ) */
  level?: RuleLevel;
  /** ID nhóm (cùng cấp với quy tắc) kích hoạt quy tắc. Rỗng = chưa chọn nhóm → quy tắc không chạy */
  trigger: VideoAction;
  /** @deprecated Bản cũ: điều kiện viết ngay trong quy tắc. Không còn dùng — mọi cấp chạy theo nhóm */
  conditionSets?: ConditionSet[];
  actionType: AgentActionType;
  params: AgentRuleParams;
  mode: RuleMode;
  /** Không thao tác lại trên cùng một video trong N giờ */
  cooldownHours: number;
  /** null = tất cả chiến dịch */
  campaignIds: string[] | null;
  /** null/không có = tất cả sản phẩm (trong phạm vi chiến dịch) */
  productIds?: string[] | null;
  /** Quy tắc Sếp tự thêm trên giao diện (xoá được); quy tắc mẫu trong agent.json thì không */
  custom?: boolean;
}

/** Số liệu của một video trong một khoảng thời gian */
export interface MetricWindow {
  /** ISO datetime */
  from: string;
  to: string;
  cost: number | null;
  revenue: number | null;
  orders: number | null;
  roi: number | null;
  /** ROI hoà vốn tại thời điểm đó */
  breakEven: number | null;
}

/** Đối tượng thao tác. Cấp chiến dịch: productId/videoId rỗng; cấp sản phẩm: videoId rỗng */
export interface AgentTarget {
  campaignId: string;
  productId: string;
  videoId: string;
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/** Đề xuất của Agent chờ Sếp duyệt */
export interface AgentProposal {
  id: string;
  createdAt: string;
  expiresAt: string;
  ruleId: string;
  actionType: AgentActionType;
  target: AgentTarget;
  params: AgentRuleParams;
  /** Lý do (từ classifyVideo) */
  reason: string;
  before: MetricWindow;
  status: ProposalStatus;
}

export type ActionActor = 'agent' | 'approved' | 'manual';
export type ActionStatus = 'success' | 'failed' | 'running' | 'undone';

/** Một dòng nhật ký: hành động đã thực hiện */
export interface AgentActionLog {
  id: string;
  executedAt: string;
  actor: ActionActor;
  ruleId: string | null;
  actionType: AgentActionType;
  target: AgentTarget;
  params: AgentRuleParams;
  /** Số liệu lúc quyết định */
  before: MetricWindow;
  /** Số liệu từ lúc thao tác đến nay; null nếu chưa lấy */
  after: MetricWindow | null;
  status: ActionStatus;
  error?: string;
  /** ID hành động được hoàn tác bởi dòng này */
  undoOf?: string;
}

export interface AgentGuardrails {
  /** Trần chi tăng cường mỗi ngày (VND) */
  dailyBoostCap: number;
  maxActionsPerDay: number;
  /** Thời gian chờ mặc định giữa 2 thao tác trên cùng video */
  cooldownHours: number;
  /** Chỉ đánh giá "Sau thao tác" khi đã qua N giờ */
  evaluateAfterHours: number;
  /** Tăng ngân sách tối đa mỗi ngày cho một chiến dịch (%) */
  maxBudgetIncreasePct: number;
  /** Giảm ngân sách tối đa mỗi ngày cho một chiến dịch (%) */
  maxBudgetDecreasePct: number;
}

/** Cấu trúc src/data/agent.json (backend/Claude ghi vào sau này) */
export interface AgentState {
  paused: boolean;
  lastRunAt: string | null;
  guardrails: AgentGuardrails;
  rules: AgentRule[];
  proposals: AgentProposal[];
  actions: AgentActionLog[];
}

export type AgentView = 'pending' | 'log' | 'impact' | 'rules' | 'groups';
