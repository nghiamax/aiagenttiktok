/** BOT chỉnh ROI mục tiêu & ngân sách chiến dịch — bộ quy tắc v3 (Sếp chốt 26/11 sau 8 vòng phản biện) */
import { describe, expect, it } from 'vitest';
import {
  campaignEcon,
  campaignPRef,
  decideCampaign,
  judgeStep,
  previousWindow,
  tuneDecisions,
  tuneSettingsOf,
  DEFAULT_TUNE,
  isLegacyCampaignRule,
  tuneRuleRows,
  TUNE_CODES,
  TUNE_TRIGGER,
  type CampaignTuneSettings,
  type TuneContext,
} from '../shared/campaignTune';
import { matchRuleTrend } from '../shared/agentMatch';
import type { AgentActionLog, AgentRule, DayMetric } from '../shared/agentTypes';
import type { AdsSnapshot, Campaign } from '../shared/adsSnapshot';
import type { AdsSettings } from '../shared/settings';
import { campaign, product, settingsWith, snapshot } from './fixtures';

// Khung 11/11–17/11 (7 ngày đã xong) — "bây giờ" là 18/11 trưa
const NOW = Date.parse('2026-11-18T05:00:00Z');
const DAY = 86_400_000;
const S = settingsWith({ pA: 3.5, pB: 4.5 });
const withTune = (s: AdsSettings, t: Partial<CampaignTuneSettings>): AdsSettings => ({ ...s, campaignTune: t });

/** Chiến dịch 2 sản phẩm: A doanh thu 10tr / chi 2tr (hoà vốn 3,5), B 4tr / 1,2tr (hoà vốn 4,5) — lời */
function snap(c: Partial<Campaign> = {}, a = { revenue: 10e6, cost: 2e6 }, b = { revenue: 4e6, cost: 1.2e6 }): AdsSnapshot {
  const cost = a.cost + b.cost;
  const revenue = a.revenue + b.revenue;
  return snapshot({
    campaigns: [campaign({ id: 'c1', cost, revenue, orders: 40, roi: revenue / cost, budget: 1_000_000, targetRoi: 4, ...c })],
    products: [product({ id: 'pA', campaignId: 'c1', ...a, orders: 30 }), product({ id: 'pB', campaignId: 'c1', ...b, orders: 10 })],
  });
}

/** Chiến dịch 1 sản phẩm pA (hoà vốn `be`) */
const S1 = (be = 4) => settingsWith({ pA: be });
function one(c: Partial<Campaign>, m: { revenue: number; cost: number; orders?: number }, range?: AdsSnapshot['range']): AdsSnapshot {
  const orders = m.orders ?? 40;
  return snapshot({
    ...(range && { range }),
    campaigns: [campaign({ id: 'c1', cost: m.cost, revenue: m.revenue, orders, roi: m.cost > 0 ? m.revenue / m.cost : null, budget: 1_000_000, targetRoi: 4, ...c })],
    products: [product({ id: 'pA', campaignId: 'c1', revenue: m.revenue, cost: m.cost, orders })],
  });
}

/** 14 ngày = 2 lần khung 7 ngày (khung B giống khung A) */
function double(s: AdsSnapshot): AdsSnapshot {
  const x2 = <T extends { cost: number | null; revenue: number | null; orders: number | null }>(r: T): T => ({
    ...r,
    cost: (r.cost ?? 0) * 2,
    revenue: (r.revenue ?? 0) * 2,
    orders: (r.orders ?? 0) * 2,
  });
  return { ...s, range: { from: '2026-11-04', to: s.range!.to }, campaigns: s.campaigns.map(x2), products: s.products.map(x2) };
}

const decide = (s: AdsSnapshot, settings: AdsSettings, actions: AgentActionLog[] = [], ctx: TuneContext = {}) =>
  decideCampaign(s.campaigns[0], s, settings, actions, NOW, ctx);

const day = (date: string, m: { cost: number; revenue: number; orders: number }): DayMetric => ({ date, ...m, roi: m.cost > 0 ? m.revenue / m.cost : null });
const days = (n: number, m: { cost: number; revenue: number; orders: number }) =>
  Array.from({ length: n }, (_, i) => day(`2026-11-${String(12 + i).padStart(2, '0')}`, m));

/** Bước thử đã chạy; trước: 7 ngày chi 7tr / DT 28tr / 70 đơn (10 đơn/ngày, lời/ngày 0 khi hoà vốn 4) */
const action = (p: Partial<AgentActionLog> & { executedAt: string }): AgentActionLog => ({
  id: 'a1',
  actor: 'approved',
  ruleId: 'tune-campaign',
  actionType: 'update_roi_target',
  target: { campaignId: 'c1', productId: '', videoId: '' },
  params: { roiTargetChangePct: -5, prev: { roasBid: 4.2 }, next: { roasBid: 4 }, tune: { code: 'C3', step: 1 } },
  before: { from: '2026-11-04T00:00:00+07:00', to: '2026-11-11T00:00:00+07:00', cost: 7e6, revenue: 35e6, orders: 70, roi: 5, breakEven: 4 },
  after: null,
  status: 'success',
  ...p,
});
const after = (d: DayMetric[]) => ({ from: '', to: '', cost: 0, revenue: 0, orders: 0, roi: null, breakEven: null, days: d });

describe('Số liệu nền', () => {
  it('hoà vốn chiến dịch = tổng DT ÷ tổng lời gộp; lãi = Σ DT/hoà vốn − chi', () => {
    const s = snap();
    const e = campaignEcon(s.campaigns[0], s, S, NOW);
    expect(e.breakEven).toBeCloseTo(14e6 / (10e6 / 3.5 + 4e6 / 4.5), 6);
    expect(e.profit).toBeCloseTo(10e6 / 3.5 + 4e6 / 4.5 - 3.2e6, 0);
    expect(e.budgetUse).toBeCloseTo((3.2e6 / 7 / 1e6) * 100, 6);
  });

  it('khung B = 14 ngày − 7 ngày, không chồng nhau', () => {
    const d7 = snap();
    const b = previousWindow(double(d7), d7);
    expect(b.range).toEqual({ from: '2026-11-04', to: '2026-11-10' });
    expect(b.campaigns[0]).toMatchObject({ cost: 3.2e6, revenue: 14e6, orders: 40 });
    expect(b.products.find((p) => p.id === 'pB')).toMatchObject({ cost: 1.2e6, orders: 10 });
  });

  it('P tham chiếu theo cơ cấu đơn của chiến dịch; chưa có đơn → P nhỏ nhất > 0; không có → null', () => {
    const s = snap();
    const profit = new Map([['pA', 100_000], ['pB', 200_000]]);
    expect(campaignPRef('c1', [s], profit)).toBeCloseTo((30 * 100_000 + 10 * 200_000) / 40, 6);
    const noOrders = snapshot({ products: [product({ id: 'pA', campaignId: 'c1', orders: 0 }), product({ id: 'pB', campaignId: 'c1', orders: 0 })] });
    expect(campaignPRef('c1', [noOrders], profit)).toBe(100_000);
    expect(campaignPRef('c1', [noOrders], new Map([['pA', -5], ['pB', 0]]))).toBeNull();
  });

  it('3 chế độ chỉ khác bộ số; bản lưu cũ (waitHours / floorK) bị bỏ qua', () => {
    expect(tuneSettingsOf(withTune(S, {}))).toMatchObject({ mode: 'balanced', budgetStepPct: 20, roiDownPct: 5, testLossP: 2, profitDropPct: 5 });
    expect(tuneSettingsOf(withTune(S, { mode: 'careful' }))).toMatchObject({ budgetStepPct: 10, roiDownPct: 3, testLossP: 1, profitDropPct: 3 });
    expect(tuneSettingsOf(withTune(S, { mode: 'growth' }))).toMatchObject({ budgetStepPct: 30, roiDownPct: 10, testLossP: 3, profitDropPct: 10 });
    const old = tuneSettingsOf(withTune(S, { waitHours: 72, floorK: 1.1, mode: 'x' } as unknown as Partial<CampaignTuneSettings>));
    expect(old.mode).toBe('balanced');
    expect('floorK' in old).toBe(false);
    expect(DEFAULT_TUNE).toMatchObject({ dayLossP: 2, weekLossP: 5, learningDays: 3, minWaitDays: 2, maxWaitDays: 7 });
  });
});

describe('Lời — mở rộng', () => {
  it('C1 tiêu hết ngân sách → tăng ngân sách theo chế độ (+10 / +20 / +30%)', () => {
    const s = snap({ budget: 480_000 }); // ≈ 95%
    expect(decide(s, S)).toMatchObject({ code: 'C1', action: { type: 'update_budget', pct: 20, to: 576_000 } });
    expect(decide(s, withTune(S, { mode: 'careful' })).action).toMatchObject({ to: 528_000 });
    expect(decide(s, withTune(S, { mode: 'growth' })).action).toMatchObject({ to: 624_000 });
  });

  it('C6 lời + tiêu vừa (50–90%) → thử nâng ROI mục tiêu theo chế độ', () => {
    const d = decide(snap({ budget: 700_000 }), S); // ≈ 65%, ROI thực 4,4 / MT 4
    expect(d).toMatchObject({ code: 'C6', action: { type: 'update_roi_target', from: 4, to: 4.4 } });
  });

  it('C3 tiêu chậm → hạ ROI mục tiêu theo chế độ, không có sàn hoà vốn', () => {
    expect(decide(snap({ budget: 2_000_000, targetRoi: 5 }), S).action).toMatchObject({ type: 'update_roi_target', from: 5, to: 4.8 });
    expect(decide(snap({ budget: 2_000_000, targetRoi: 5 }), withTune(S, { mode: 'growth' })).action).toMatchObject({ to: 4.5 });
  });

  it('C4 lời mỏng: tiêu ≥ 50% → nâng ROI MT 5% (≤ ROI thực); tiêu ít → giữ', () => {
    const thin = { revenue: 14.7e6, cost: 3.5e6 }; // ROI 4,2 < 4 × 1,1
    expect(decide(one({ budget: 800_000 }, thin), S1())).toMatchObject({ code: 'C4', action: { from: 4, to: 4.2 } });
    const slow = decide(one({ budget: 2_000_000 }, thin), S1());
    expect(slow).toMatchObject({ code: 'C4', kind: 'hold' });
    expect(slow.action).toBeUndefined();
  });
});

describe('Lỗ — cứu', () => {
  it('B1 ROI MT dưới hoà vốn → nâng tối đa 15% mỗi lần', () => {
    expect(decide(one({ targetRoi: 3 }, { revenue: 9e6, cost: 3e6 }), S1())).toMatchObject({ code: 'B1', action: { from: 3, to: 3.5 } });
  });

  it('B2a lỗ + tiêu hết ngân sách → hạ ngân sách 20% (không nâng ROI)', () => {
    const d = decide(one({ targetRoi: 4.5, budget: 450_000 }, { revenue: 9e6, cost: 3e6 }), S1());
    expect(d).toMatchObject({ code: 'B2a', action: { type: 'update_budget', pct: -20, to: 360_000 } });
  });

  it('B2b lỗ + tiêu ít + chênh < 30% → nâng ROI MT 5%; B6 chênh ≥ 30% → giữ, báo Sếp', () => {
    expect(decide(one({ targetRoi: 4, budget: 2_000_000 }, { revenue: 9.6e6, cost: 3e6 }), S1())).toMatchObject({ code: 'B2b', action: { to: 4.2 } });
    const b6 = decide(one({ targetRoi: 5, budget: 2_000_000 }, { revenue: 9e6, cost: 3e6 }), S1()); // (5 − 3) ÷ 5 = 40%
    expect(b6.code).toBe('B6');
    expect(b6.action).toBeUndefined();
  });

  it('B3 lỗ dồn vào 1 sản phẩm → không đụng chiến dịch', () => {
    const d = decide(snap({}, { revenue: 3.6e6, cost: 1e6 }, { revenue: 2e6, cost: 2e6 }), S);
    expect(d.code).toBe('B3');
    expect(d.action).toBeUndefined();
  });
});

describe('Kiểm tra trước', () => {
  it('A1 thiếu hoà vốn / A2 ít đơn / E3 chiến dịch tắt / F8 số lệch → không chỉnh', () => {
    const s = snap();
    expect(decideCampaign(s.campaigns[0], s, settingsWith({ pA: 3.5 }), [], NOW).code).toBe('A1');
    expect(decideCampaign({ ...s.campaigns[0], orders: 5 }, s, S, [], NOW).code).toBe('A2');
    expect(decideCampaign({ ...s.campaigns[0], status: 'paused' }, s, S, [], NOW).code).toBe('E3');
    expect(decideCampaign({ ...s.campaigns[0], cost: 6e6 }, s, S, [], NOW).code).toBe('F8');
  });

  it('A6 chiến dịch mới → chỉ bảo vệ, chưa mở rộng', () => {
    const d = decide(snap({ budget: 480_000 }), S, [], { isNew: true });
    expect(d.code).toBe('A6');
    expect(d.action).toBeUndefined();
  });
});

describe('Bảo vệ H1–H5', () => {
  const zero = (c: Partial<Campaign>, cost: number) => one(c, { revenue: 0, cost, orders: 0 });

  it('H1 / H2 chưa có đơn: 2P cảnh báo; 3P + tiêu hết → hạ ngân sách 30%; tiêu ít → nên tắt; thiếu P → chỉ theo dõi', () => {
    expect(decide(zero({}, 250_000), S1(), [], { pRef: 100_000 })).toMatchObject({ code: 'H1' });
    expect(decide(zero({ budget: 50_000 }, 350_000), S1(), [], { pRef: 100_000 })).toMatchObject({ code: 'H2', action: { type: 'update_budget', pct: -30 } });
    const low = decide(zero({}, 350_000), S1(), [], { pRef: 100_000 });
    expect(low).toMatchObject({ code: 'H2', suggestPause: true });
    expect(low.action).toBeUndefined();
    // Đang học: chỉ đề xuất, không tự hạ
    expect(decide(zero({ budget: 50_000 }, 350_000), S1(), [], { pRef: 100_000, isNew: true }).action).toBeUndefined();
    expect(decide(zero({}, 350_000), S1()).code).toBe('A2');
  });

  it('H3 lỗ hôm nay ≥ 2P → hạ ngân sách về gần mức đã chi (tối đa 30%)', () => {
    const today = one({}, { revenue: 1e6, cost: 500_000, orders: 3 }, { from: '2026-11-18', to: '2026-11-18' }); // lỗ 250k
    const d = decide(snap({ budget: 1_000_000 }), S, [], { pRef: 100_000, today });
    expect(d).toMatchObject({ code: 'H3', action: { type: 'update_budget', from: 1_000_000, to: 700_000 } });
    // Đã bảo vệ trong 24h → không hạ tiếp
    const done = action({ executedAt: '2026-11-18T01:00:00Z', actionType: 'update_budget', params: { prev: { budget: 1_000_000 }, next: { budget: 700_000 }, tune: { code: 'H3' } } });
    expect(decide(snap({ budget: 700_000 }), S, [done], { pRef: 100_000, today }).code).not.toBe('H3');
  });

  it('H4 lỗ 7 ngày ≥ 5P → nên tắt, vẫn kèm bước cứu lỗ', () => {
    const d = decide(one({ targetRoi: 4, budget: 2_000_000 }, { revenue: 9.6e6, cost: 3e6 }), S1(), [], { pRef: 100_000 }); // lỗ 600k = 6P
    expect(d).toMatchObject({ code: 'H4', suggestPause: true, action: { to: 4.2 } });
  });

  it('H5 bước thử làm mất thêm ≥ giới hạn chế độ → trả về ngay, không chờ đủ ngày', () => {
    // Trước: lời 250k/ngày (DT 5tr ÷ 4 − chi 1tr). Sau 1 ngày: chi 1,5tr, DT 5tr → lỗ 250k → mất thêm 500k
    const a = action({ executedAt: '2026-11-17T00:00:00Z', after: after([day('2026-11-17', { cost: 1.5e6, revenue: 5e6, orders: 10 })]) });
    const d = decide(snap({ budget: 700_000 }), S, [a], { pRef: 200_000 }); // giới hạn Cân bằng 2P = 400k
    expect(d).toMatchObject({ code: 'H5', action: { revertOf: 'a1', to: 4.2 } });
    // Tăng trưởng (3P = 600k) → chưa vượt, còn đang đo
    expect(decide(snap({ budget: 700_000 }), withTune(S, { mode: 'growth' }), [a], { pRef: 200_000 }).code).toBe('A3');
  });
});

describe('Đo bước thử', () => {
  it('A3 chưa đủ 2 ngày → chờ', () => {
    const d = decide(snap({ budget: 700_000 }), S, [action({ executedAt: '2026-11-17T00:00:00Z' })]);
    expect(d).toMatchObject({ code: 'A3', kind: 'testing' });
    expect(d.action).toBeUndefined();
  });

  it('D2 bước mở rộng làm đơn giảm > 10% → trả về số cũ', () => {
    const a = action({ executedAt: '2026-11-11T03:00:00Z', after: after(days(2, { cost: 1e6, revenue: 5e6, orders: 8 })) });
    expect(judgeStep(a, tuneSettingsOf(S), 4)).toMatchObject({ keep: false, code: 'D2' });
    expect(decide(snap({ budget: 700_000 }), S, [a])).toMatchObject({ code: 'D2', action: { from: 4, to: 4.2, revertOf: 'a1' } });
  });

  it('bước cứu lỗ (nâng ROI MT): đơn giảm là dự kiến — không áp D2, chấm bằng lời/ngày', () => {
    const raise = action({
      executedAt: '2026-11-11T03:00:00Z',
      params: { roiTargetChangePct: 5, prev: { roasBid: 4 }, next: { roasBid: 4.2 }, tune: { code: 'B2b', step: 1 } },
      before: { from: '2026-11-04T00:00:00+07:00', to: '2026-11-11T00:00:00+07:00', cost: 7e6, revenue: 21e6, orders: 70, roi: 3, breakEven: 4 },
      after: after(days(2, { cost: 0.6e6, revenue: 2.2e6, orders: 6 })), // đơn −40%, lỗ/ngày −250k → −50k
    });
    expect(judgeStep(raise, tuneSettingsOf(S), 4)).toMatchObject({ keep: true });
  });

  it('D3 lời/ngày giảm quá % của chế độ → trả về', () => {
    // Trước lời 250k/ngày (DT 5tr ÷ 4 − chi 1tr); sau 230k/ngày (−8%): Cân bằng (5%) lùi, Tăng trưởng (10%) giữ
    const a = action({ executedAt: '2026-11-11T03:00:00Z', after: after(days(2, { cost: 1e6, revenue: 4.92e6, orders: 10 })) });
    expect(judgeStep(a, tuneSettingsOf(S), 4)).toMatchObject({ keep: false, code: 'D3' });
    expect(judgeStep(a, tuneSettingsOf(withTune(S, { mode: 'growth' })), 4)).toMatchObject({ keep: true });
  });

  it('D4 hết 7 ngày vẫn thiếu đơn → không đủ cơ sở: giữ số mới, tạm không thử tiếp', () => {
    const a = action({ executedAt: '2026-11-10T03:00:00Z', after: after(days(7, { cost: 50_000, revenue: 250_000, orders: 1 })) });
    expect(judgeStep(a, tuneSettingsOf(S), 4)).toMatchObject({ keep: true, code: 'D4' });
    const d = decide(snap({ budget: 2_000_000, targetRoi: 5 }), S, [a]);
    expect(d.code).toBe('D4');
    expect(d.action).toBeUndefined();
  });

  it('vừa bảo vệ (hạ ngân sách) → khoá mở rộng 3 ngày', () => {
    const cut = action({
      executedAt: new Date(NOW - 2.5 * DAY).toISOString(),
      actionType: 'update_budget',
      params: { budgetChangePct: -20, prev: { budget: 600_000 }, next: { budget: 480_000 }, tune: { code: 'B2a', step: 1 } },
      after: after(days(2, { cost: 0.5e6, revenue: 3.5e6, orders: 10 })), // lời/ngày 250k → 375k: giữ
    });
    const d = decide(snap({ budget: 480_000 }), S, [cut]);
    expect(d.code).toBe('A6');
    expect(d.action).toBeUndefined();
  });
});

describe('Xác nhận 2 khung không chồng nhau + quy tắc Agent', () => {
  const rule: AgentRule = { id: 'tune-campaign', name: 'BOT chỉnh ROI & ngân sách', level: 'campaign', trigger: TUNE_TRIGGER, actionType: 'update_roi_target', params: {}, mode: 'approve', cooldownHours: 72, campaignIds: null };

  it('khung A và B cùng hướng → đề xuất với hành động + % riêng của chiến dịch', () => {
    const d7 = snap({ budget: 480_000 });
    const { kept } = matchRuleTrend(rule, S, d7, { d14: double(d7), d30: null }, [], NOW);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ actionType: 'update_budget', params: { budgetChangePct: 20, tune: { code: 'C1', step: 1 } } });
  });

  it('khung B khác hướng → dấu hiệu, chưa đề xuất', () => {
    const d7 = snap({ budget: 480_000 });
    const b = snap({ budget: 480_000 }, { revenue: 5e6, cost: 1e6 }, { revenue: 2e6, cost: 0.6e6 }); // B tiêu ít hơn → giữ
    const d14 = { ...double(d7), campaigns: [{ ...d7.campaigns[0], cost: 3.2e6 + 1.6e6, revenue: 14e6 + 7e6, orders: 80 }], products: d7.products.map((p, i) => ({ ...p, cost: (p.cost ?? 0) + b.products[i].cost!, revenue: (p.revenue ?? 0) + b.products[i].revenue!, orders: 2 * (p.orders ?? 0) })), range: { from: '2026-11-04', to: '2026-11-17' } };
    expect(tuneDecisions(d7, d14, S, [], NOW).get('c1')).toMatchObject({ signal: true });
    const { kept, unconfirmed } = matchRuleTrend(rule, S, d7, { d14, d30: null }, [], NOW);
    expect(kept).toHaveLength(0);
    expect(unconfirmed).toHaveLength(1);
  });

  it('lỗ ở khung A nhưng khung B lời → B7 chờ thêm bằng chứng', () => {
    // Khung A lỗ nhẹ (~1,4P, chưa tới H4): DT 11,6tr / chi 3tr. Khung B: DT 15tr / chi 3tr → lời
    const d7 = one({ targetRoi: 4, budget: 2_000_000 }, { revenue: 11.6e6, cost: 3e6 });
    const d14 = { ...double(d7), campaigns: [{ ...d7.campaigns[0], cost: 6e6, revenue: 26.6e6, orders: 80 }], products: [{ ...d7.products[0], cost: 6e6, revenue: 26.6e6, orders: 80 }] }; // khung B: DT 15tr / chi 3tr → lời
    const m = tuneDecisions(d7, d14, S1(), [], NOW).get('c1')!;
    expect(m).toMatchObject({ code: 'B7', signal: true });
    expect(m.action).toBeUndefined();
  });

  it('khung B trống (chiến dịch mới) → A6; bảo vệ không cần xác nhận', () => {
    const d7 = snap({ budget: 480_000 });
    expect(tuneDecisions(d7, d7, S, [], NOW).get('c1')!.code).toBe('A6');
  });
});

describe('Cấp chiến dịch chỉ còn BOT chỉnh (Sếp chốt 26/11)', () => {
  it('quy tắc chiến dịch theo nhóm cũ = kiểu cũ, không khớp gì; c-tune / cấp video không phải', () => {
    const legacy: AgentRule = { id: 'x', name: 'x', level: 'campaign', trigger: 'c-scale', actionType: 'update_budget', params: { budgetChangePct: 20 }, mode: 'approve', cooldownHours: 24, campaignIds: null };
    expect(isLegacyCampaignRule(legacy)).toBe(true);
    expect(isLegacyCampaignRule({ ...legacy, trigger: TUNE_TRIGGER })).toBe(false);
    expect(isLegacyCampaignRule({ ...legacy, level: 'video', trigger: 'cut' })).toBe(false);
    const d7 = snap({ budget: 480_000 });
    expect(matchRuleTrend(legacy, S, d7, { d14: double(d7), d30: null }, [], NOW).kept).toHaveLength(0);
  });

  it('c-tune Nhắc việc: chỉ chiến dịch cần Sếp quyết (B6), bỏ chiến dịch BOT tự chỉnh được', () => {
    const remind: AgentRule = { id: 'r', name: 'r', level: 'campaign', trigger: TUNE_TRIGGER, actionType: 'remind', params: {}, mode: 'approve', cooldownHours: 24, campaignIds: null };
    // ROI thực 3,5 ≪ ROI MT 5 (chênh 30%), lỗ 375k ≈ 1,4P (chưa tới H4)
    const b6 = one({ targetRoi: 5, budget: 2_000_000 }, { revenue: 10.5e6, cost: 3e6, orders: 10 });
    const { kept } = matchRuleTrend(remind, S1(), b6, { d14: double(b6), d30: null }, [], NOW);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ actionType: 'remind', params: { tune: { code: 'B6' } } });
    const c1 = snap({ budget: 480_000 });
    expect(matchRuleTrend(remind, S, c1, { d14: double(c1), d30: null }, [], NOW).kept).toHaveLength(0);
  });
});

describe('Vừa hạ ngân sách mà ngon lại (Sếp chốt 27/11)', () => {
  // H3 hôm qua 12:00 (VN 17/11): 1.000k → 700k
  const brake = (p: Partial<AgentActionLog> = {}) =>
    action({
      executedAt: '2026-11-17T05:00:00Z',
      actionType: 'update_budget',
      params: { budgetChangePct: -30, prev: { budget: 1_000_000 }, next: { budget: 700_000 }, tune: { code: 'H3' } },
      ...p,
    });
  /** Hôm nay: lời, 40 đơn, đã tiêu 650k / 700k */
  const goodToday = (c: Partial<Campaign> = {}) => ({
    ...snap({ budget: 700_000, ...c }, { revenue: 2.5e6, cost: 0.5e6 }, { revenue: 0.6e6, cost: 0.15e6 }),
    range: { from: '2026-11-18', to: '2026-11-18' },
  });

  it('D6 trong ngày hôm sau: đang lời + tiêu ≥ 90% + ≥ 3 đơn → trả thẳng ngân sách cũ', () => {
    const d = decide(snap({ budget: 700_000 }), S, [brake()], { pRef: 100_000, today: goodToday() });
    expect(d).toMatchObject({ code: 'D6', action: { type: 'update_budget', from: 700_000, to: 1_000_000, revertOf: 'a1' } });
    // Mới 2 đơn → chưa trả
    expect(decide(snap({ budget: 700_000 }), S, [brake()], { pRef: 100_000, today: goodToday({ orders: 2 }) }).code).not.toBe('D6');
  });

  it('D6 theo ngày trọn đã đo', () => {
    const cut = brake({
      executedAt: '2026-11-16T05:00:00Z',
      after: after([day('2026-11-17', { cost: 680_000, revenue: 3.4e6, orders: 10 })]),
    });
    expect(decide(snap({ budget: 700_000 }), S, [cut], { pRef: 100_000 })).toMatchObject({ code: 'D6', action: { to: 1_000_000 } });
  });

  it('không D6: quá 3 ngày, hoặc Sếp đã sửa tay ngân sách', () => {
    const old = brake({ executedAt: '2026-11-14T05:00:00Z' });
    expect(decide(snap({ budget: 700_000 }), S, [old], { pRef: 100_000, today: goodToday() }).code).not.toBe('D6');
    expect(decide(snap({ budget: 800_000 }), S, [brake()], { pRef: 100_000, today: goodToday({ budget: 800_000 }) }).code).not.toBe('D6');
  });

  it('H3 không khoá, không chờ đo: chưa ngon thì xét như thường', () => {
    const d = decide(snap({ budget: 700_000 }), S, [brake()], { pRef: 100_000 });
    expect(d.code).toBe('C6'); // tiêu ~65% ngân sách → xét như thường (không A3 / A6)
  });

  it('đã trả về (D6) mà lại lỗ hôm nay ≥ 2P → hạ lại ngay, không chờ 24 giờ', () => {
    const back = action({
      id: 'a2',
      executedAt: '2026-11-18T01:00:00Z',
      actionType: 'update_budget',
      params: { budgetChangePct: 42.9, prev: { budget: 700_000 }, next: { budget: 1_000_000 }, tune: { code: 'D6', revertOf: 'a1' } },
    });
    const lossToday = one({}, { revenue: 1e6, cost: 500_000, orders: 3 }, { from: '2026-11-18', to: '2026-11-18' });
    const d = decide(snap({ budget: 1_000_000 }), S, [brake(), back], { pRef: 100_000, today: lossToday });
    expect(d).toMatchObject({ code: 'H3', action: { to: 700_000 } });
  });

  it('C5: hạ vì lỗ kéo dài, 2 ngày sau lời rõ + tiêu hết ngân sách mới → mở khoá sớm, tăng lại theo bước', () => {
    const cut = action({
      executedAt: '2026-11-15T06:00:00Z', // VN 15/11 13:00 — còn trong khoá 3 ngày
      actionType: 'update_budget',
      params: { budgetChangePct: -20, prev: { budget: 600_000 }, next: { budget: 480_000 }, tune: { code: 'B2a', step: 1 } },
      before: { from: '2026-11-08T00:00:00+07:00', to: '2026-11-15T00:00:00+07:00', cost: 7e6, revenue: 21e6, orders: 70, roi: 3, breakEven: 4 },
      after: after([day('2026-11-16', { cost: 460_000, revenue: 2.3e6, orders: 10 }), day('2026-11-17', { cost: 460_000, revenue: 2.3e6, orders: 10 })]),
    });
    expect(decide(snap({ budget: 480_000 }), S, [cut])).toMatchObject({ code: 'C5', action: { type: 'update_budget', from: 480_000, to: 576_000 } });
    // Mới 1 ngày → chưa mở
    const early = { ...cut, after: after([day('2026-11-16', { cost: 460_000, revenue: 2.3e6, orders: 10 })]) };
    const d = decide(snap({ budget: 480_000 }), S, [early]);
    expect(d.code).not.toBe('C5');
    expect(d.action).toBeUndefined();
  });

  it('C5 không cần khung 7 ngày trước xác nhận', () => {
    const cut = action({
      executedAt: '2026-11-15T06:00:00Z', // VN 15/11 13:00 — còn trong khoá 3 ngày
      actionType: 'update_budget',
      params: { budgetChangePct: -20, prev: { budget: 600_000 }, next: { budget: 480_000 }, tune: { code: 'B2a', step: 1 } },
      before: { from: '2026-11-08T00:00:00+07:00', to: '2026-11-15T00:00:00+07:00', cost: 7e6, revenue: 21e6, orders: 70, roi: 3, breakEven: 4 },
      after: after([day('2026-11-16', { cost: 460_000, revenue: 2.3e6, orders: 10 }), day('2026-11-17', { cost: 460_000, revenue: 2.3e6, orders: 10 })]),
    });
    const d7 = snap({ budget: 480_000 });
    const d14 = { ...double(d7), campaigns: [{ ...d7.campaigns[0], cost: 3.2e6 + 3e6, revenue: 14e6 + 9e6, orders: 80 }] }; // khung B lỗ
    expect(tuneDecisions(d7, d14, S, [cut], NOW).get('c1')).toMatchObject({ code: 'C5' });
  });
});

describe('C6 — đang lời, thử nâng ROI mục tiêu mà đơn không giảm (Sếp chốt 27/11)', () => {
  it('ROI thực sát dưới ROI MT (MT 8, thực 7), tiêu 70% → nâng 8 → 8,8 (Cân bằng) / 8,4 (Thận trọng)', () => {
    const s7 = one({ targetRoi: 8, budget: 715_000 }, { revenue: 24.5e6, cost: 3.5e6 });
    expect(decide(s7, S1())).toMatchObject({ code: 'C6', action: { from: 8, to: 8.8 } });
    expect(decide(s7, withTune(S1(), { mode: 'careful' })).action).toMatchObject({ to: 8.4 });
  });

  it('ROI thực cao hơn hẳn ROI MT (thực 6, MT 4) → bắt buộc nâng, kể cả tiêu ít', () => {
    const s7 = one({ targetRoi: 4, budget: 1_430_000 }, { revenue: 18e6, cost: 3e6 }); // tiêu ~30%
    expect(decide(s7, S1())).toMatchObject({ code: 'C6', action: { from: 4, to: 4.4 } });
  });

  it('tiêu hết ngân sách → ưu tiên tăng ngân sách (C1), không nâng ROI', () => {
    expect(decide(snap({ budget: 480_000 }), S).code).toBe('C1');
  });

  const raise = (after_: ReturnType<typeof after>) =>
    action({
      executedAt: '2026-11-11T03:00:00Z',
      params: { roiTargetChangePct: 10, prev: { roasBid: 4 }, next: { roasBid: 4.4 }, tune: { code: 'C6', step: 1 } },
      after: after_,
    });

  it('chấm bước C6: đơn giảm > 10% → trả về (D2); đơn giảm 5%, lời giữ → giữ', () => {
    // Trước: 10 đơn/ngày, lời 250k/ngày (DT 5tr, chi 1tr, hoà vốn 4)
    expect(judgeStep(raise(after(days(2, { cost: 0.85e6, revenue: 4.6e6, orders: 8.5 }))), tuneSettingsOf(S), 4)).toMatchObject({ keep: false, code: 'D2' });
    expect(judgeStep(raise(after(days(2, { cost: 0.9e6, revenue: 4.8e6, orders: 9.5 }))), tuneSettingsOf(S), 4)).toMatchObject({ keep: true });
  });

  it('đã thử nâng mà bị trả về trong 14 ngày → giữ (C9), không nâng nữa', () => {
    const tried = raise(after(days(2, { cost: 0.85e6, revenue: 4.6e6, orders: 8.5 })));
    const back = action({
      id: 'a2',
      executedAt: '2026-11-14T03:00:00Z',
      params: { roiTargetChangePct: -9.1, prev: { roasBid: 4.4 }, next: { roasBid: 4 }, tune: { code: 'D2', revertOf: 'a1' } },
    });
    const d = decide(snap({ budget: 700_000 }), S, [tried, back]);
    expect(d.code).toBe('C9');
    expect(d.action).toBeUndefined();
  });
});

describe('Số chỉnh được ở Nâng cao (Sếp chốt 27/11)', () => {
  it('C6 trường hợp tiêu vừa chỉ khi ROI thực sát ROI MT (≥ 85%): MT 8, thực 5 → không nâng', () => {
    const far = one({ targetRoi: 8, budget: 715_000 }, { revenue: 17.5e6, cost: 3.5e6 }); // ROI 5, tiêu 70%
    const d = decide(far, S1());
    expect(d.code).toBe('C9');
    expect(d.action).toBeUndefined();
    // Hạ ngưỡng "sát" xuống 0,6 → được thử
    expect(decide(far, withTune(S1(), { nearK: 0.6 })).code).toBe('C6');
  });

  it('headroomK / protectCutPct / recoverMinOrders đổi thì kết quả đổi theo', () => {
    // ROI thực 6 / MT 4, tiêu 30%: headroom 1,2 → C6; nâng ngưỡng lên 2 → không còn dư địa → C3
    const s7 = one({ targetRoi: 4, budget: 1_430_000 }, { revenue: 18e6, cost: 3e6 });
    expect(decide(s7, withTune(S1(), { headroomK: 2 })).code).toBe('C3');
    // H2 hạ 20% thay vì 30%
    const zero = one({ budget: 50_000 }, { revenue: 0, cost: 350_000, orders: 0 });
    expect(decide(zero, withTune(S1(), { protectCutPct: 20 }), [], { pRef: 100_000 }).action).toMatchObject({ pct: -20 });
    // D6 cần 50 đơn → hôm nay 40 đơn chưa đủ
    const brake = action({
      executedAt: '2026-11-17T05:00:00Z',
      actionType: 'update_budget',
      params: { budgetChangePct: -30, prev: { budget: 1_000_000 }, next: { budget: 700_000 }, tune: { code: 'H3' } },
    });
    const today = { ...snap({ budget: 700_000 }, { revenue: 2.5e6, cost: 0.5e6 }, { revenue: 0.6e6, cost: 0.15e6 }), range: { from: '2026-11-18', to: '2026-11-18' } };
    expect(decide(snap({ budget: 700_000 }), S, [brake], { pRef: 100_000, today }).code).toBe('D6');
    expect(decide(snap({ budget: 700_000 }), withTune(S, { recoverMinOrders: 50 }), [brake], { pRef: 100_000, today }).code).not.toBe('D6');
  });
});

describe('Bảng quy tắc trên giao diện', () => {
  it('đủ mọi mã tình huống (trừ OFF), số theo cấu hình đang cài', () => {
    const rows = tuneRuleRows(tuneSettingsOf(S));
    const codes = new Set(rows.map((r) => r.code));
    for (const c of Object.keys(TUNE_CODES)) if (c !== 'OFF') expect(codes.has(c as keyof typeof TUNE_CODES)).toBe(true);
    expect(rows.find((r) => r.code === 'H3')!.when).toContain('2P');
    expect(tuneRuleRows(tuneSettingsOf(withTune(S, { dayLossP: 3 }))).find((r) => r.code === 'H3')!.when).toContain('3P');
    expect(tuneRuleRows(tuneSettingsOf(withTune(S, { mode: 'growth' }))).find((r) => r.code === 'C1')!.action).toContain('30%');
  });

  it('công tắc nhóm tắt → các dòng của nhóm đánh dấu "đang tắt"', () => {
    const rows = tuneRuleRows(tuneSettingsOf(withTune(S, { rescue: false })));
    expect(rows.filter((r) => r.group === 'loss').every((r) => r.off)).toBe(true);
    expect(rows.filter((r) => r.group === 'profit').some((r) => r.off)).toBe(false);
  });
});
