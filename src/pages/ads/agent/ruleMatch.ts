import snapshotJson from '../../../data/ads-snapshot.json';
import { classifyVideo } from '../classify';
import { matchSet, type EvalContext } from '../groups';
import { breakEvenOf, type AdsSettings } from '../settings';
import type { AdsProduct, AdsSnapshot, Campaign } from '../types';
import { ruleLevel } from './meta';
import type { AgentRule } from './types';

const snapshot = snapshotJson as AdsSnapshot;
const campaignById = new Map(snapshot.campaigns.map((c) => [c.id, c]));

/** Số ngày của bản số liệu (tính cả 2 đầu), dùng để ra chi phí trung bình mỗi ngày */
export const SNAPSHOT_DAYS = snapshot.range
  ? Math.round((Date.parse(snapshot.range.to) - Date.parse(snapshot.range.from)) / 86_400_000) + 1
  : 7;

/** Bối cảnh so điều kiện cho một chiến dịch (có mức tiêu ngân sách) */
export function contextForCampaign(c: Campaign): EvalContext {
  const cost = c.cost ?? 0;
  const orders = c.orders ?? 0;
  return {
    cost,
    revenue: c.revenue ?? 0,
    orders,
    roi: c.roi,
    cpa: orders > 0 ? cost / orders : null,
    // Chiến dịch gồm nhiều sản phẩm nên không so với một mức hoà vốn
    breakEven: null,
    target: c.targetRoi,
    budgetUse: c.budget && c.cost != null ? (c.cost / SNAPSHOT_DAYS / c.budget) * 100 : null,
  };
}

/** Bối cảnh so điều kiện cho một sản phẩm trong chiến dịch */
export function contextForProduct(p: AdsProduct, settings: AdsSettings): EvalContext {
  const cost = p.cost ?? 0;
  const orders = p.orders ?? 0;
  return {
    cost,
    revenue: p.revenue ?? 0,
    orders,
    roi: p.roi,
    cpa: orders > 0 ? cost / orders : null,
    breakEven: breakEvenOf(settings, p.id),
    target: campaignById.get(p.campaignId)?.targetRoi ?? null,
    budgetUse: null,
  };
}

const inScope = (rule: AgentRule, campaignId: string, productId?: string) =>
  (!rule.campaignIds || rule.campaignIds.includes(campaignId)) &&
  (!productId || !rule.productIds || rule.productIds.includes(productId));

export interface RuleMatches {
  /** Đơn vị đếm: "chiến dịch" / "sản phẩm" / "video" */
  unit: string;
  names: string[];
}

/** Đối tượng đang khớp quy tắc theo số liệu hiện tại (có tính phạm vi) */
export function matchRuleTargets(rule: AgentRule, settings: AdsSettings): RuleMatches {
  const level = ruleLevel(rule);
  const sets = rule.conditionSets ?? [];

  if (level === 'campaign') {
    return {
      unit: 'chiến dịch',
      names: snapshot.campaigns
        .filter((c) => inScope(rule, c.id) && sets.some((s) => matchSet(s, contextForCampaign(c))))
        .map((c) => c.name),
    };
  }

  if (level === 'product') {
    return {
      unit: 'sản phẩm',
      names: snapshot.products
        .filter((p) => inScope(rule, p.campaignId, p.id) && sets.some((s) => matchSet(s, contextForProduct(p, settings))))
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
  return { unit: 'video', names };
}
