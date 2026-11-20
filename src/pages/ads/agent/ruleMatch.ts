import { findRuleTargets, ineligibleReason, ruleLevel } from '../../../../shared/agentMatch';
import { LEVEL_UNIT } from '../groups';
import type { AdsSettings } from '../../../../shared/settings';
import type { AdsSnapshot } from '../types';
import type { AgentRule } from './types';

export interface RuleMatches {
  /** Đơn vị đếm: "chiến dịch" / "sản phẩm" / "video" */
  unit: string;
  /** Đối tượng Agent làm được (đúng như Agent sẽ đề xuất) */
  names: string[];
  /** Thuộc nhóm nhưng TikTok không cho làm (vd video đã bị gỡ, chiến dịch tắt) → lý do: số lượng */
  skipped: Record<string, number>;
}

/** Đối tượng đang thuộc nhóm của quy tắc theo số liệu đang xem (logic chung với Agent trên server) */
export function matchRuleTargets(rule: AgentRule, settings: AdsSettings, snapshot: AdsSnapshot): RuleMatches {
  const names: string[] = [];
  const skipped: Record<string, number> = {};
  for (const t of findRuleTargets(rule, settings, snapshot)) {
    const why = ineligibleReason(rule.actionType, rule.params, t);
    if (why) skipped[why] = (skipped[why] ?? 0) + 1;
    else names.push(t.name);
  }
  return { unit: LEVEL_UNIT[ruleLevel(rule)], names, skipped };
}

/** "+2 bỏ qua: video đã bị gỡ 1, chiến dịch đang tắt 1"; không có → null */
export function skippedText(m: RuleMatches): string | null {
  const entries = Object.entries(m.skipped);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const detail = entries.map(([why, n]) => (entries.length > 1 ? `${why.toLowerCase()} ${n}` : why.toLowerCase())).join(', ');
  return `+${total} bỏ qua: ${detail}`;
}
