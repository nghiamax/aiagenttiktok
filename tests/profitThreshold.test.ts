/** Ngưỡng chi theo "lần lợi nhuận 1 đơn" của từng sản phẩm (Sếp chốt 26/11): lợi nhuận 1 đơn = giá trị đơn TB ÷ ROI hoà vốn */
import { describe, expect, it } from 'vitest';
import { matchRuleTrend } from '../shared/agentMatch';
import type { AgentRule } from '../shared/agentTypes';
import { classifyVideo } from '../shared/classify';
import { clauseText, groupUsesBreakEven } from '../shared/groups';
import { profitPerOrderMap } from '../shared/productProfit';
import type { AdsSettings } from '../shared/settings';
import { buildTrendIndex, isSpendGated, videoKey } from '../shared/trend';
import { campaign, product, SHIPPED_SETTINGS, snapshot, video } from './fixtures';

const C = campaign({ id: 'c1', targetRoi: 5 });
const withBe = (be: Record<string, number>): AdsSettings => ({ ...SHIPPED_SETTINGS, breakEvenRoi: be });
// pA: đơn TB 300k → lợi nhuận/đơn 100k (hoà vốn 3) · pB: đơn TB 600k → 200k
const products = [
  product({ id: 'pA', campaignId: 'c1', revenue: 3_000_000, orders: 10 }),
  product({ id: 'pB', campaignId: 'c1', revenue: 6_000_000, orders: 10 }),
];
const S = withBe({ pA: 3, pB: 3 });
const snap = snapshot({ campaigns: [C], products });
const profit = profitPerOrderMap({ d7: snap, d14: null, d30: null }, S);
const idle = (productId: string, cost: number) => video({ id: `v-${productId}`, campaignId: 'c1', productId, cost, orders: 0 });
const cut = SHIPPED_SETTINGS.groups.find((g) => g.id === 'cut')!;

describe('Ngưỡng "lần lợi nhuận 1 đơn"', () => {
  it('lợi nhuận 1 đơn = giá trị đơn TB ÷ ROI hoà vốn', () => {
    expect(profit.get('pA')).toBe(100_000);
    expect(profit.get('pB')).toBe(200_000);
  });

  it('Cắt lỗ mặc định: cùng chi 150k, 0 đơn → SP lợi nhuận 100k bị cắt, SP lợi nhuận 200k chưa', () => {
    expect(classifyVideo(idle('pA', 150_000), C, S, profit)?.action).toBe('cut');
    expect(classifyVideo(idle('pB', 150_000), C, S, profit)?.action).not.toBe('cut');
    expect(classifyVideo(idle('pB', 210_000), C, S, profit)?.action).toBe('cut');
    expect(classifyVideo(idle('pA', 150_000), C, S, profit)?.reason).toMatch(/Chi 150k ≥ lợi nhuận\/đơn 100k/);
  });

  it('thiếu ROI hoà vốn / chưa có đơn / không truyền bảng lợi nhuận → không khớp', () => {
    const noBe = withBe({});
    expect(classifyVideo(idle('pA', 5_000_000), C, noBe, profitPerOrderMap({ d7: snap, d14: null, d30: null }, noBe))?.action).not.toBe('cut');
    const noOrders = snapshot({ campaigns: [C], products: [product({ id: 'pA', campaignId: 'c1' })] });
    expect(classifyVideo(idle('pA', 5_000_000), C, S, profitPerOrderMap({ d7: noOrders, d14: null, d30: null }, S))?.action).not.toBe('cut');
    expect(classifyVideo(idle('pA', 5_000_000), C, S)?.action).not.toBe('cut');
  });

  it('mô tả + nhóm có ngưỡng chi + cần hoà vốn', () => {
    expect(clauseText(cut.conditionSets[0].clauses[0])).toBe('Chi phí ≥ lợi nhuận 1 đơn');
    expect(clauseText({ metric: 'cost', op: 'gte', value: { type: 'profit', k: 1.5 } })).toBe('Chi phí ≥ 1,5 lần lợi nhuận 1 đơn');
    expect(isSpendGated(cut)).toBe(true);
    expect(groupUsesBreakEven(cut)).toBe(true);
  });

  it('3 khung dùng chung lợi nhuận/đơn theo 30 ngày: 7 ngày SP chưa có đơn vẫn xếp được', () => {
    const v = idle('pA', 150_000);
    const d7 = snapshot({ campaigns: [C], products: [product({ id: 'pA', campaignId: 'c1', cost: 150_000 })], videos: [v] });
    const d30 = snapshot({ campaigns: [C], products: [products[0]], videos: [v] });
    const t = buildTrendIndex('video', { d7, d14: d7, d30 }, S).get(videoKey(v));
    expect(t?.g7).toBe('cut');
    expect(t?.group).toBe('cut');
  });

  it('Agent (matchRuleTrend) dùng cùng ngưỡng: chỉ video của SP lợi nhuận thấp bị đề xuất gỡ', () => {
    const vs = [idle('pA', 150_000), idle('pB', 150_000)];
    const d = snapshot({ campaigns: [C], products, videos: vs });
    const rule = { id: 'r', name: 'r', level: 'video', trigger: 'cut', actionType: 'remove_creative', params: {}, mode: 'approve', cooldownHours: 24, campaignIds: null } as AgentRule;
    const { kept } = matchRuleTrend(rule, S, d, { d14: d, d30: d });
    expect(kept.map((t) => t.target.productId)).toEqual(['pA']);
  });
});

describe('Mặc định Nhân rộng (Sếp chốt 26/11): ≥ 3 đơn và ROI ≥ 1,2 lần ROI mục tiêu', () => {
  const win = (roi: number) => video({ id: 'w', campaignId: 'c1', productId: 'pA', cost: 100_000, revenue: 100_000 * roi, orders: 5 });
  it('ROI bằng mục tiêu → chưa Nhân rộng; ≥ 1,2 lần → Nhân rộng', () => {
    expect(classifyVideo(win(5), C, S, profit)?.action).not.toBe('scale');
    expect(classifyVideo(win(6), C, S, profit)?.action).toBe('scale');
  });
});
