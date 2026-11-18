import snapshotJson from '../../../data/ads-snapshot.json';
import { classifyCampaign, classifyProduct, classifyVideo } from '../classify';
import { LEVEL_UNIT } from '../groups';
import type { AdsSettings } from '../settings';
import type { AdsSnapshot } from '../types';
import { ruleLevel } from './meta';
import type { AgentRule } from './types';

const snapshot = snapshotJson as AdsSnapshot;
const campaignById = new Map(snapshot.campaigns.map((c) => [c.id, c]));

const inScope = (rule: AgentRule, campaignId: string, productId?: string) =>
  (!rule.campaignIds || rule.campaignIds.includes(campaignId)) &&
  (!productId || !rule.productIds || rule.productIds.includes(productId));

export interface RuleMatches {
  /** Đơn vị đếm: "chiến dịch" / "sản phẩm" / "video" */
  unit: string;
  names: string[];
}

/** Đối tượng đang thuộc nhóm của quy tắc theo số liệu hiện tại (có tính phạm vi) */
export function matchRuleTargets(rule: AgentRule, settings: AdsSettings): RuleMatches {
  const level = ruleLevel(rule);
  const unit = LEVEL_UNIT[level];
  if (!rule.trigger) return { unit, names: [] };

  if (level === 'campaign') {
    return {
      unit,
      names: snapshot.campaigns
        .filter((c) => inScope(rule, c.id) && classifyCampaign(c, settings)?.action === rule.trigger)
        .map((c) => c.name),
    };
  }

  if (level === 'product') {
    return {
      unit,
      names: snapshot.products
        .filter(
          (p) =>
            inScope(rule, p.campaignId, p.id) &&
            classifyProduct(p, campaignById.get(p.campaignId), settings)?.action === rule.trigger,
        )
        .map((p) => p.name),
    };
  }

  // Cấp video: video thuộc nhóm của quy tắc (gộp các dòng cùng video)
  const ids = new Set<string>();
  const names: string[] = [];
  for (const v of snapshot.videos) {
    if (!inScope(rule, v.campaignId, v.productId) || ids.has(v.id)) continue;
    if (classifyVideo(v, campaignById.get(v.campaignId), settings)?.action === rule.trigger) {
      ids.add(v.id);
      names.push(v.title || `Video ${v.id}`);
    }
  }
  return { unit, names };
}
