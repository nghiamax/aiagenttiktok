import { useMemo } from 'react';
import { ineligibleReason, matchRuleTrend, metricsOf, ruleLevel, type RuleTarget } from '../../../../shared/agentMatch';
import type { WindowStat } from '../../../../shared/trend';
import { findGroup, useAdsSettings } from '../settings';
import { useTrend } from '../trend';
import { useAgentStore } from './agentStore';
import type { AgentRule, MetricWindow } from './types';

/** Một đối tượng có "dấu hiệu": quy tắc đang bật nhắm tới, 7 ngày thuộc nhóm nhưng 14 ngày chưa */
export interface SignalItem {
  key: string;
  rule: AgentRule;
  target: RuleTarget;
  /** Số 7 ngày (đến hôm qua) dạng MetricWindow để dùng chung WindowsTable */
  before: MetricWindow;
  windows: { d14: WindowStat | null; d30: WindowStat | null };
  /** Tên nhóm của quy tắc / nhóm ở khung 14 ngày (để giải thích) */
  groupName: string;
  group14Name: string;
  /** dấu hiệu (7 ngày thuộc nhóm, 14 chưa) / đang hồi phục (14 + 30 ngày thuộc nhóm, 7 ngày đã tốt lên) */
  kind: 'signal' | 'recovering';
}

/**
 * Dấu hiệu theo đúng cách Agent xét (Sếp chốt 22/11): KHÔNG thành đề xuất Duyệt / Gỡ, chỉ báo để người dùng để ý.
 * Tính trên web từ quy tắc đang bật + 7 / 14 / 30 ngày đến hôm qua — không lưu gì trên server.
 */
export function useSignals(): SignalItem[] {
  const trends = useTrend();
  const { settings } = useAdsSettings();
  const { state } = useAgentStore();

  return useMemo(() => {
    if (!trends.confirmOn || !trends.confirm.d14) return [];
    const d7 = trends.snaps.d7;
    const range = d7.range;
    const pendingKeys = new Set(
      state.proposals.filter((p) => p.status === 'pending').map((p) => `${p.actionType}|${p.target.campaignId}|${p.target.productId}|${p.target.videoId}`),
    );
    const seen = new Set<string>();
    const out: SignalItem[] = [];
    for (const rule of state.rules) {
      if (rule.mode === 'off' || !rule.trigger || rule.actionType === 'remind') continue;
      const level = ruleLevel(rule);
      const { unconfirmed, recovering } = matchRuleTrend(rule, settings, d7, trends.confirm);
      const list = [...unconfirmed.map((t) => ({ t, kind: 'signal' as const })), ...recovering.map((t) => ({ t, kind: 'recovering' as const }))];
      for (const { t, kind } of list) {
        if (ineligibleReason(rule.actionType, rule.params, t)) continue;
        const key = `${rule.actionType}|${t.target.campaignId}|${t.target.productId}|${t.target.videoId}`;
        // Đề xuất cũ cùng đối tượng còn chờ (sẽ tự đóng ở lượt quét tới) → không hiện trùng
        if (seen.has(key) || pendingKeys.has(key)) continue;
        seen.add(key);
        const info =
          level === 'video'
            ? trends.video({ campaignId: t.target.campaignId, productId: t.target.productId, id: t.target.videoId })
            : level === 'product'
              ? trends.product({ campaignId: t.target.campaignId, id: t.target.productId })
              : trends.campaign({ id: t.target.campaignId });
        const nameOf = (id: string | null | undefined) => (id ? (findGroup(settings, id, level)?.name ?? '--') : 'không có số');
        out.push({
          key,
          rule,
          target: t,
          before: {
            from: range ? `${range.from}T00:00:00+07:00` : '',
            to: range ? `${range.to}T23:59:59+07:00` : '',
            cost: t.cost,
            revenue: t.revenue,
            orders: t.orders,
            roi: t.roi,
            breakEven: t.breakEven,
          },
          windows: {
            d14: trends.confirm.d14 ? metricsOf(t.target, trends.confirm.d14) : null,
            d30: trends.confirm.d30 ? metricsOf(t.target, trends.confirm.d30) : null,
          },
          groupName: nameOf(rule.trigger),
          group14Name: nameOf(info?.g14),
          kind,
        });
      }
    }
    // Tốn tiền nhiều lên trước
    return out.sort((a, b) => (b.target.cost ?? 0) - (a.target.cost ?? 0));
  }, [trends, settings, state.rules, state.proposals]);
}
