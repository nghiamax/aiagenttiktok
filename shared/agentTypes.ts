/** Kiểu dữ liệu AI Agent (quy tắc, đề xuất, nhật ký). Dùng chung web + server. */
import type { ConditionSet, GroupLevel } from './groups.js';
import type { ActorRef } from './permissions.js';
import type { WindowStat } from './trend.js';

/** ID nhóm */
type VideoAction = string;

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
  /** BOT chỉnh ROI & ngân sách: mã tình huống, bước thử, lùi lại thao tác nào */
  tune?: { code: string; step?: number; revertOf?: string };
  /** Giá trị trên TikTok trước / sau thao tác (ghi lúc thực thi, dùng để hoàn tác) */
  prev?: ExecutedValues;
  next?: ExecutedValues;
}

/** Giá trị thật đã đọc / gửi lên TikTok */
export interface ExecutedValues {
  /** Ngân sách ngày (VND) */
  budget?: number;
  /** ROI mục tiêu */
  roasBid?: number;
  /** Danh sách sản phẩm của chiến dịch (CUSTOMIZED_PRODUCTS) */
  itemGroupIds?: string[];
  /** Sản phẩm gắn với video (gỡ / thêm video) */
  spuIds?: string[];
  /** Hết hạn tăng cường (ISO) */
  boostEndsAt?: string;
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
  /** Chỉ ở "Sau thao tác": số liệu từng ngày đủ sau thao tác (Ngày 1, Ngày 2…), tối đa 7 */
  days?: DayMetric[];
}

/** Số liệu 1 khối 24h sau thao tác của đối tượng */
export interface DayMetric {
  /** yyyy-MM-dd (giờ VN) ngày bắt đầu khối */
  date: string;
  /** ISO — khối 24h [from, to) */
  from?: string;
  to?: string;
  cost: number;
  revenue: number;
  orders: number;
  roi: number | null;
}

/** Đối tượng thao tác. Cấp chiến dịch: productId/videoId rỗng; cấp sản phẩm: videoId rỗng */
export interface AgentTarget {
  campaignId: string;
  productId: string;
  videoId: string;
}

/** outdated = số liệu mới không còn khớp quy tắc (hoặc quy tắc đã tắt) → tự huỷ, không chạy */
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'outdated';

/** Đề xuất của Agent chờ Sếp duyệt */
/**
 * Video lỗ ở dòng đang xét nhưng có "đơn bù" ở dòng sản phẩm khác trong CÙNG chiến dịch (chiến dịch nhiều sản phẩm).
 * Gỡ video = mất cả phần đơn bù → hiện để Sếp tự quyết. Dòng ở chiến dịch khác không tính.
 */
export interface VideoOffset {
  /** Phần đơn bù (các dòng sản phẩm khác của video trong chiến dịch) */
  cost: number;
  revenue: number;
  orders: number;
  /** Tổng mọi dòng của video trong chiến dịch */
  total: { cost: number; revenue: number; orders: number; roi: number | null; breakEven: number | null };
  /** Tổng ROI ≥ hoà vốn tổng? null = thiếu hoà vốn để kết luận */
  profitable: boolean | null;
}

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
  /** approved = Sếp đã duyệt; chưa có thực thi trên TikTok thì chờ giai đoạn sau */
  status: ProposalStatus;
  /** Chế độ của quy tắc lúc tạo đề xuất */
  ruleMode?: RuleMode;
  /** Thời điểm Sếp duyệt / bỏ qua */
  decidedAt?: string;
  /** Người Duyệt / Bỏ qua trên web */
  decidedBy?: ActorRef;
  /** Ghi chú cho Sếp (vd quy tắc Tự chạy nhưng chưa bật thực thi) */
  note?: string;
  /** Dòng nhật ký của lần thực thi sau khi duyệt */
  actionId?: string;
  /** Có đơn bù ở sản phẩm khác (cấp video) — cập nhật mỗi lượt quét */
  offset?: VideoOffset;
  /** Số liệu khung 14 / 30 ngày (tính cả hôm nay) lúc đề xuất — cập nhật mỗi lượt quét */
  windows?: { d14: WindowStat | null; d30: WindowStat | null };
  /** 30 ngày cũng thuộc nhóm này ("kéo dài"); false = mới 2 tuần gần đây */
  long?: boolean;
  /** Lỗ âm thầm: 7 ngày chi ít chưa tới ngưỡng nhưng 14 + 30 ngày đều thuộc nhóm */
  slowLoss?: boolean;
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
  /** Dòng này là lần Gửi lại của dòng gỡ / thêm lại bị lỗi (ID dòng lỗi đầu tiên) */
  retryOf?: string;
  /** Gỡ / thêm video đã báo lỗi sau 2 phút: vẫn đọc trạng thái ở nền tới lúc này (TikTok ghi nhận muộn → Thành công) */
  lateCheckUntil?: string;
  /** Gỡ / thêm video: thời điểm kiểm tra lại trạng thái trên TikTok (ISO) */
  verifyAfter?: string;
  /** Ghi chú trạng thái (vd "Chờ TikTok xác nhận") */
  note?: string;
  /** Đề xuất gốc */
  proposalId?: string;
  /**
   * Video / đối tượng thay đổi sau thao tác (thao tác mới trong Nhật ký, hoặc trạng thái video đổi) →
   * "Sau thao tác" chỉ tính các ngày TRƯỚC `date` (ngày VN), không đo thêm.
   */
  measureStop?: { date: string; reason: string };
  /** Người bấm trên web (Duyệt / Thủ công / Hoàn tác); thiếu = dòng cũ trước khi có đăng nhập, hoặc Agent tự chạy */
  by?: ActorRef;
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
  /** Số ngày số liệu Agent xét mỗi lượt (thiếu = 7) */
  lookbackDays?: number;
  /** Xác nhận bằng khung 14 ngày: chỉ đề xuất khi 14 ngày cùng nhóm (thiếu = bật; false = chỉ xét 1 khung như cũ) */
  confirmWindow?: boolean;
}

/** Phần Sếp chỉnh trên giao diện (server lưu server-data/agent-config.json) */
export interface AgentConfig {
  paused: boolean;
  rules: AgentRule[];
  guardrails: AgentGuardrails;
}

/** Phần Agent tự ghi (server lưu server-data/agent-state.json) */
export interface AgentRuntime {
  lastRunAt: string | null;
  /** Lỗi của lượt chạy gần nhất, null nếu ổn */
  lastRunError?: string | null;
  /** Lượt gần nhất: tự quét theo lịch hay Sếp bấm Quét ngay */
  lastRunTrigger?: 'schedule' | 'manual' | null;
  /** Commit code của tiến trình chạy lượt gần nhất (phát hiện tiến trình cũ còn quét — lỗi 27/11) */
  lastRunVersion?: string | null;
  proposals: AgentProposal[];
  actions: AgentActionLog[];
}

/** Toàn bộ dữ liệu Agent. Mặc định ở src/data/agent.json */
export type AgentState = AgentConfig & AgentRuntime;

