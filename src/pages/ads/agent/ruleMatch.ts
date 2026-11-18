import { findRuleTargets, ruleLevel } from '../../../../shared/agentMatch';
import { LEVEL_UNIT } from '../groups';
import type { AdsSettings } from '../settings';
import type { AdsSnapshot } from '../types';
import type { AgentRule } from './types';

export interface RuleMatches {
  /** Đơn vị đếm: "chiến dịch" / "sản phẩm" / "video" */
  unit: string;
  names: string[];
}

/** Đối tượng đang thuộc nhóm của quy tắc theo số liệu đang xem (logic chung với Agent trên server) */
export function matchRuleTargets(rule: AgentRule, settings: AdsSettings, snapshot: AdsSnapshot): RuleMatches {
  return {
    unit: LEVEL_UNIT[ruleLevel(rule)],
    names: findRuleTargets(rule, settings, snapshot).map((t) => t.name),
  };
}
