/** BOT chỉnh ROI mục tiêu & ngân sách chiến dịch (Sếp chốt 26/11) — bảng tình huống A–E */
import { describe, expect, it } from 'vitest';
import { campaignEcon, decideCampaign, judgeStep, tuneDecisions, DEFAULT_TUNE, TUNE_TRIGGER } from '../shared/campaignTune';
import { matchRuleTrend } from '../shared/agentMatch';
import type { AgentActionLog, AgentRule } from '../shared/agentTypes';
import type { AdsSnapshot, Campaign } from '../shared/adsSnapshot';
import { campaign, product, settingsWith, snapshot } from './fixtures';

// Khung 11/11–17/11 (7 ngày đã xong) — "bây giờ" là 18/11 trưa
const NOW = Date.parse('2026-11-18T05:00:00Z');
const S = settingsWith({ pA: 3.5, pB: 4.5 });

/** Chiến dịch 2 sản phẩm: A doanh thu 10tr / chi 2tr (hoà vốn 3,5), B 4tr / 1,2tr (hoà vốn 4,5) */
function snap(c: Partial<Campaign> = {}, a = { revenue: 10e6, cost: 2e6 }, b = { revenue: 4e6, cost: 1.2e6 }): AdsSnapshot {
  const cost = a.cost + b.cost;
  const revenue = a.revenue + b.revenue;
  return snapshot({
    campaigns: [campaign({ id: 'c1', cost, revenue, orders: 40, roi: revenue / cost, budget: 1_000_000, targetRoi: 4, ...c })],
    products: [
      product({ id: 'pA', campaignId: 'c1', ...a, orders: 30 }),
      product({ id: 'pB', campaignId: 'c1', ...b, orders: 10 }),
    ],
  });
}

const action = (p: Partial<AgentActionLog> & { executedAt: string }): AgentActionLog => ({
  id: 'a1',
  actor: 'approved',
  ruleId: 'tune-campaign',
  actionType: 'update_roi_target',
  target: { campaignId: 'c1', productId: '', videoId: '' },
  params: { roiTargetChangePct: 5, prev: { roasBid: 4 }, next: { roasBid: 4.2 }, tune: { code: 'C2', step: 1 } },
  before: { from: '2026-11-04T00:00:00+07:00', to: '2026-11-11T00:00:00+07:00', cost: 7e6, revenue: 28e6, orders: 70, roi: 4, breakEven: 3.74 },
  after: null,
  status: 'success',
  ...p,
});

describe('Hoà vốn chiến dịch nhiều sản phẩm', () => {
  it('= tổng DT ÷ tổng lời gộp; lãi = Σ DT/hoà vốn − chi', () => {
    const s = snap();
    const e = campaignEcon(s.campaigns[0], s, S, NOW);
    expect(e.breakEven).toBeCloseTo(14e6 / (10e6 / 3.5 + 4e6 / 4.5), 6);
    expect(e.profit).toBeCloseTo(10e6 / 3.5 + 4e6 / 4.5 - 3.2e6, 0);
    expect(e.products.find((p) => p.id === 'pB')!.profit!).toBeLessThan(0);
    expect(e.budgetUse).toBeCloseTo((3.2e6 / 7 / 1e6) * 100, 6);
  });
});

describe('Tình huống', () => {
  it('C2 lời + tiêu vừa → nâng ROI mục tiêu 5% (không vượt ROI thực)', () => {
    const s = snap({ budget: 700_000 }); // tiêu 3,2tr/7 ÷ 700k ≈ 65%
    const d = decideCampaign(s.campaigns[0], s, S, [], NOW);
    expect(d.code).toBe('C2');
    expect(d.action).toMatchObject({ type: 'update_roi_target', from: 4, to: 4.2 });
  });

  it('C1 lời + tiêu hết ngân sách → tăng ngân sách 20%', () => {
    const s = snap({ budget: 480_000 }); // ≈ 95%
    const d = decideCampaign(s.campaigns[0], s, S, [], NOW);
    expect(d.code).toBe('C1');
    expect(d.action).toMatchObject({ type: 'update_budget', pct: 20, to: 576_000 });
  });

  it('C3 lời + tiêu chậm → hạ ROI mục tiêu, không dưới sàn hoà vốn × 1,1', () => {
    const s = snap({ budget: 2_000_000, targetRoi: 5 }); // ≈ 23%
    const d = decideCampaign(s.campaigns[0], s, S, [], NOW);
    expect(d.code).toBe('C3');
    expect(d.action).toMatchObject({ type: 'update_roi_target', from: 5, to: 4.8 });
    // ROI mục tiêu đã sát sàn → giữ
    const atFloor = snap({ budget: 2_000_000, targetRoi: 4.2 });
    const held = decideCampaign(atFloor.campaigns[0], atFloor, S, [], NOW);
    expect(held.code).toBe('C9');
    expect(held.action).toBeUndefined();
  });

  it('B1 lỗ + ROI mục tiêu dưới sàn → nâng tối đa 15% mỗi lần', () => {
    const s = snap({ targetRoi: 3 }, { revenue: 6e6, cost: 2e6 }, { revenue: 3e6, cost: 1.2e6 });
    const d = decideCampaign(s.campaigns[0], s, S, [], NOW);
    expect(d.code).toBe('B1');
    expect(d.action).toMatchObject({ type: 'update_roi_target', from: 3, to: 3.5 });
  });

  it('B3 lỗ dồn vào 1 sản phẩm → không đụng ROI chiến dịch', () => {
    const s = snap({}, { revenue: 3.6e6, cost: 1e6 }, { revenue: 2e6, cost: 2e6 });
    const d = decideCampaign(s.campaigns[0], s, S, [], NOW);
    expect(d.code).toBe('B3');
    expect(d.action).toBeUndefined();
  });

  it('A1 thiếu hoà vốn / A2 ít đơn / E3 chiến dịch tắt → không chỉnh', () => {
    const s = snap();
    expect(decideCampaign(s.campaigns[0], s, settingsWith({ pA: 3.5 }), [], NOW).code).toBe('A1');
    expect(decideCampaign({ ...s.campaigns[0], orders: 5 }, s, S, [], NOW).code).toBe('A2');
    expect(decideCampaign({ ...s.campaigns[0], status: 'paused' }, s, S, [], NOW).code).toBe('E3');
  });
});

describe('Thử – đo – giữ / lùi', () => {
  it('A3 trong thời gian chờ sau bước thử → không đổi tiếp', () => {
    const s = snap({ budget: 700_000 });
    const d = decideCampaign(s.campaigns[0], s, S, [action({ executedAt: '2026-11-17T00:00:00Z' })], NOW);
    expect(d).toMatchObject({ code: 'A3', kind: 'testing' });
    expect(d.action).toBeUndefined();
  });

  it('D2 sau 72h đơn giảm > 10% → đề xuất trả về số cũ', () => {
    const days = ['2026-11-12', '2026-11-13', '2026-11-14'].map((date) => ({ date, cost: 1e6, revenue: 4.2e6, orders: 7, roi: 4.2 }));
    const a = action({ executedAt: '2026-11-11T03:00:00Z', after: { from: '', to: '', cost: 3e6, revenue: 12.6e6, orders: 21, roi: 4.2, breakEven: null, days } });
    expect(judgeStep(a, DEFAULT_TUNE, 3.74)).toMatchObject({ keep: false, code: 'D2' });
    const s = snap({ budget: 700_000 });
    const d = decideCampaign(s.campaigns[0], s, S, [a], NOW);
    expect(d.code).toBe('D2');
    expect(d.action).toMatchObject({ type: 'update_roi_target', from: 4.2, to: 4, revertOf: 'a1' });
  });

  it('đơn giữ, lãi tăng → giữ và được thử bước tiếp (bước 2)', () => {
    const days = ['2026-11-12', '2026-11-13', '2026-11-14'].map((date) => ({ date, cost: 0.9e6, revenue: 4e6, orders: 10, roi: 4.4 }));
    const a = action({ executedAt: '2026-11-11T03:00:00Z', after: { from: '', to: '', cost: 2.7e6, revenue: 12e6, orders: 30, roi: 4.4, breakEven: null, days } });
    expect(judgeStep(a, DEFAULT_TUNE, 3.74)?.keep).toBe(true);
    const s = snap({ budget: 700_000 });
    const d = decideCampaign(s.campaigns[0], s, S, [a], NOW);
    expect(d.code).toBe('C2');
    expect(d.step).toBe(2);
  });
});

describe('Xác nhận 14 ngày + quy tắc Agent', () => {
  const rule: AgentRule = { id: 'tune-campaign', name: 'BOT chỉnh ROI & ngân sách', level: 'campaign', trigger: TUNE_TRIGGER, actionType: 'update_roi_target', params: {}, mode: 'approve', cooldownHours: 72, campaignIds: null };

  it('7 ngày và 14 ngày cùng hướng → đề xuất với hành động + % riêng của chiến dịch', () => {
    const d7 = snap({ budget: 700_000 });
    const { kept } = matchRuleTrend(rule, S, d7, { d14: d7, d30: null }, [], NOW);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ actionType: 'update_roi_target', params: { roiTargetChangePct: 5, tune: { code: 'C2', step: 1 } } });
  });

  it('14 ngày khác hướng → chỉ là dấu hiệu, chưa đề xuất', () => {
    const d7 = snap({ budget: 700_000 });
    const d14 = snap({ budget: 700_000 }, { revenue: 5e6, cost: 1e6 }, { revenue: 2e6, cost: 0.6e6 }); // 14 ngày tiêu chậm, ROI MT đã sát sàn → giữ
    const m = tuneDecisions(d7, d14, S, [], NOW).get('c1')!;
    expect(m.signal).toBe(true);
    const { kept, unconfirmed } = matchRuleTrend(rule, S, d7, { d14, d30: null }, [], NOW);
    expect(kept).toHaveLength(0);
    expect(unconfirmed).toHaveLength(1);
  });
});
