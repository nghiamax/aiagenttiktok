/** Ngưỡng chi theo "lần lợi nhuận 1 đơn" của từng sản phẩm (Sếp chốt 26/11): lợi nhuận 1 đơn = giá khách trả TB ÷ ROI hoà vốn */
import { describe, expect, it } from 'vitest';
import { matchRuleTrend } from '../shared/agentMatch';
import type { AgentRule } from '../shared/agentTypes';
import { classifyVideo } from '../shared/classify';
import { clauseText, groupUsesBreakEven, type ConditionSet, type GroupDef } from '../shared/groups';
import { productPrices, profitPerOrderMap } from '../shared/productProfit';
import type { AdsSettings } from '../shared/settings';
import { buildTrendIndex, isSpendGated, videoKey } from '../shared/trend';
import { campaign, product, SHIPPED_SETTINGS, snapshot, video } from './fixtures';

const C = campaign({ id: 'c1', targetRoi: 5 });
/** Cắt lỗ kiểu "Chi ≥ 1 lần lợi nhuận 1 đơn và 0 đơn · hoặc … và ROI < hoà vốn" — Sếp đặt cho từng sản phẩm */
const CUT_SETS: ConditionSet[] = [
  { clauses: [{ metric: 'cost', op: 'gte', value: { type: 'profit', k: 1 } }, { metric: 'orders', op: 'eq', value: { type: 'number', n: 0 } }] },
  { clauses: [{ metric: 'cost', op: 'gte', value: { type: 'profit', k: 1 } }, { metric: 'roi', op: 'lt', value: { type: 'breakEven', k: 1 } }] },
];
const withBe = (be: Record<string, number>, ids = ['pA', 'pB', 'pN']): AdsSettings => ({
  ...SHIPPED_SETTINGS,
  breakEvenRoi: be,
  groups: SHIPPED_SETTINGS.groups.map((g) =>
    g.id === 'cut' ? { ...g, productConditions: Object.fromEntries(ids.map((id) => [id, CUT_SETS])) } : g,
  ),
});
// pA: đơn TB 300k → lợi nhuận/đơn 100k (hoà vốn 3) · pB: đơn TB 600k → 200k
const products = [
  product({ id: 'pA', campaignId: 'c1', revenue: 3_000_000, orders: 10 }),
  product({ id: 'pB', campaignId: 'c1', revenue: 6_000_000, orders: 10 }),
];
const S = withBe({ pA: 3, pB: 3 });
const snap = snapshot({ campaigns: [C], products });
const profit = profitPerOrderMap({ d7: snap, d14: null, d30: null }, S);
const idle = (productId: string, cost: number) => video({ id: `v-${productId}`, campaignId: 'c1', productId, cost, orders: 0 });
const cut = S.groups.find((g) => g.id === 'cut')!;

describe('Mặc định cấp video (Sếp chốt 26/11): không có điều kiện chung', () => {
  it('Cắt lỗ / Nhân rộng mặc định trống → không video nào vào cho tới khi thiết lập sản phẩm', () => {
    for (const id of ['cut', 'scale']) {
      const g = SHIPPED_SETTINGS.groups.find((x) => x.id === id) as GroupDef;
      expect(g.conditionSets).toEqual([]);
      expect(g.productConditions).toBeUndefined();
    }
    expect(classifyVideo(idle('pA', 5_000_000), C, SHIPPED_SETTINGS, profit)?.action).toBe('stable');
  });
});

describe('Ngưỡng "lần lợi nhuận 1 đơn"', () => {
  it('lợi nhuận 1 đơn = giá khách trả TB ÷ ROI hoà vốn', () => {
    expect(profit.get('pA')).toBe(100_000);
    expect(profit.get('pB')).toBe(200_000);
  });

  it('cùng chi 150k, 0 đơn → SP lợi nhuận 100k bị cắt, SP lợi nhuận 200k chưa', () => {
    expect(classifyVideo(idle('pA', 150_000), C, S, profit)?.action).toBe('cut');
    expect(classifyVideo(idle('pB', 150_000), C, S, profit)?.action).not.toBe('cut');
    expect(classifyVideo(idle('pB', 210_000), C, S, profit)?.action).toBe('cut');
    expect(classifyVideo(idle('pA', 150_000), C, S, profit)?.reason).toMatch(/Chi 150k ≥ lợi nhuận\/đơn 100k/);
  });

  it('thiếu ROI hoà vốn → không đoán (bỏ mức tạm 100k): điều kiện không khớp, không bị gỡ oan', () => {
    const noBe = withBe({});
    const pmNoBe = profitPerOrderMap({ d7: snap, d14: null, d30: null }, noBe);
    expect(pmNoBe.size).toBe(0);
    expect(classifyVideo(idle('pA', 5_000_000), C, noBe, pmNoBe)?.action).not.toBe('cut');
    expect(classifyVideo(idle('pA', 5_000_000), C, S)?.action).not.toBe('cut');
  });

  it('giá: khách trả TB > giá niêm yết (sản phẩm cả 30 ngày chưa có đơn vẫn tính được)', () => {
    const fresh = snapshot({ campaigns: [C], products: [product({ id: 'pN', campaignId: 'c1', listPrice: 600_000 }), ...products] });
    const snaps = { d7: fresh, d14: null, d30: null };
    const prices = productPrices(snaps);
    expect(prices.get('pB')).toEqual({ price: 600_000, source: 'aov' });
    expect(prices.get('pN')).toEqual({ price: 600_000, source: 'list' });
    const s = withBe({ pN: 3 });
    const pm = profitPerOrderMap(snaps, s);
    expect(pm.get('pN')).toBe(200_000);
    expect(classifyVideo(idle('pN', 150_000), C, s, pm)?.action).not.toBe('cut');
    expect(classifyVideo(idle('pN', 200_000), C, s, pm)?.action).toBe('cut');
  });

  it('mô tả + nhóm có ngưỡng chi + cần hoà vốn', () => {
    expect(clauseText(CUT_SETS[0].clauses[0])).toBe('Chi phí ≥ lợi nhuận 1 đơn');
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
