import {
  ineligibleReason,
  matchRuleTrend,
  RECOVERING_REASON,
  ruleLevel,
  UNCONFIRMED_REASON,
  type ConfirmSnaps,
} from '../../../../shared/agentMatch';
import { LEVEL_UNIT } from '../groups';
import type { AdsSettings } from '../../../../shared/settings';
import type { AdsSnapshot } from '../types';
import type { AgentActionLog, AgentRule } from './types';

export interface RuleMatches {
  /** Đơn vị đếm: "chiến dịch" / "sản phẩm" / "video" */
  unit: string;
  /** Đối tượng Agent làm được (đúng như Agent sẽ đề xuất) */
  names: string[];
  /** Thuộc nhóm nhưng TikTok không cho làm (vd video đã bị gỡ, chiến dịch tắt) → lý do: số lượng */
  skipped: Record<string, number>;
}

/** Đối tượng đang thuộc nhóm của quy tắc theo số liệu đang xem (logic chung với Agent trên server) */
export function matchRuleTargets(
  rule: AgentRule,
  settings: AdsSettings,
  snapshot: AdsSnapshot,
  /** Khung 14 / 30 ngày: đối tượng 14 ngày không cùng nhóm → "chưa xác nhận" (giống Agent) */
  confirm: ConfirmSnaps = { d14: null, d30: null },
  /** Nhật ký (BOT chỉnh ROI & ngân sách cần lịch sử bước thử) */
  actions: AgentActionLog[] = [],
): RuleMatches {
  const names: string[] = [];
  const skipped: Record<string, number> = {};
  const { kept, unconfirmed, recovering } = matchRuleTrend(rule, settings, snapshot, confirm, actions);
  if (unconfirmed.length > 0) skipped[UNCONFIRMED_REASON] = unconfirmed.length;
  if (recovering.length > 0) skipped[RECOVERING_REASON] = recovering.length;
  for (const t of kept) {
    const why = ineligibleReason(t.actionType ?? rule.actionType, t.params ?? rule.params, t);
    if (why) skipped[why] = (skipped[why] ?? 0) + 1;
    else names.push(t.name);
  }
  return { unit: LEVEL_UNIT[ruleLevel(rule)], names, skipped };
}

/** Tên ngắn của lý do bỏ qua (để cộng lại khớp với số ở thẻ nhóm) */
const SHORT: Record<string, string> = {
  [UNCONFIRMED_REASON]: 'dấu hiệu',
  [RECOVERING_REASON]: 'đang hồi phục',
  'Video đã bị gỡ': 'đã gỡ',
  'Chiến dịch đang tắt': 'chiến dịch tắt',
  'Video không khả dụng — đã ngừng chạy': 'không khả dụng',
};

/** "+1 đã gỡ · +4 dấu hiệu"; không có → null */
export function skippedText(m: RuleMatches): string | null {
  const entries = Object.entries(m.skipped);
  if (entries.length === 0) return null;
  return entries.map(([why, n]) => `+${n} ${SHORT[why] ?? why.toLowerCase()}`).join(' · ');
}
