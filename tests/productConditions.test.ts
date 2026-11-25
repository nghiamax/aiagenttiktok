/** Điều kiện riêng theo sản phẩm trong nhóm (Sếp chốt 25/11): SP có điều kiện riêng chỉ xét bộ riêng, bỏ điều kiện chung */
import { describe, expect, it } from 'vitest';
import { classifyProduct, classifyVideo } from '../shared/classify';
import { groupDescription, setsFor, type ConditionSet, type GroupDef } from '../shared/groups';
import type { AdsSettings } from '../shared/settings';
import { trendOf } from '../shared/trend';
import { campaign, product, settingsWith, video } from './fixtures';

const C = campaign({ id: 'c1', targetRoi: 5 });
const costAtLeast = (n: number): ConditionSet => ({
  clauses: [
    { metric: 'cost', op: 'gte', value: { type: 'number', n } },
    { metric: 'orders', op: 'eq', value: { type: 'number', n: 0 } },
  ],
});

/** Cắt lỗ chung: chi ≥ 100k + 0 đơn; riêng pA: ≥ 300k; pB: không xét */
function withOverrides(over: Record<string, ConditionSet[]>): AdsSettings {
  const s = settingsWith({ pA: 4, pB: 4, pC: 4 });
  return { ...s, groups: s.groups.map((g) => (g.id === 'cut' ? { ...g, productConditions: over } : g)) };
}
const S = withOverrides({ pA: [costAtLeast(300_000)], pB: [] });
const loss = (productId: string, cost: number) => video({ id: `v-${productId}`, campaignId: 'c1', productId, cost, orders: 0 });

describe('Điều kiện riêng theo sản phẩm', () => {
  it('SP không có điều kiện riêng → dùng điều kiện chung', () => {
    expect(classifyVideo(loss('pC', 150_000), C, S)?.action).toBe('cut');
  });

  it('SP có điều kiện riêng → chỉ xét bộ riêng (150k chưa tới 300k → không Cắt lỗ)', () => {
    expect(classifyVideo(loss('pA', 150_000), C, S)?.action).not.toBe('cut');
    const hit = classifyVideo(loss('pA', 320_000), C, S);
    expect(hit?.action).toBe('cut');
    expect(hit?.reason).toContain('(riêng SP)');
  });

  it('điều kiện riêng rỗng = không xét SP vào nhóm', () => {
    expect(classifyVideo(loss('pB', 5_000_000), C, S)?.action).not.toBe('cut');
  });

  it('cấp sản phẩm cũng dùng điều kiện riêng', () => {
    const base = settingsWith({ pA: 4 });
    const lossGroup = base.productGroups.find((g) => g.kind === 'custom')!;
    const s: AdsSettings = {
      ...base,
      productGroups: base.productGroups.map((g) => (g.id === lossGroup.id ? { ...g, productConditions: { pA: [] } } : g)),
    };
    const p = product({ id: 'pA', campaignId: 'c1', cost: 1_000_000, revenue: 1_000_000, orders: 5, roi: 1 });
    expect(classifyProduct(p, C, base)?.action).toBe(lossGroup.id);
    expect(classifyProduct(p, C, s)?.action).not.toBe(lossGroup.id);
  });

  it('setsFor + mô tả nhóm', () => {
    const cut = S.groups.find((g) => g.id === 'cut') as GroupDef;
    expect(setsFor(cut, { productId: 'pA' })).toEqual([costAtLeast(300_000)]);
    expect(setsFor(cut, { productId: 'pC' })).toBe(cut.conditionSets);
    expect(setsFor(cut, {})).toBe(cut.conditionSets);
    expect(groupDescription(cut)).toContain('riêng 2 sản phẩm');
  });

  it('lỗ âm thầm xét theo điều kiện riêng của sản phẩm', () => {
    const ctx = (productId: string) => ({ cost: 42_000, revenue: 0, orders: 0, roi: null, cpa: null, breakEven: 4, target: 5, budgetUse: null, productId });
    const g = { g7: null, g14: 'cut', g30: 'cut' };
    const w = { w7: null, w14: null, w30: null };
    expect(trendOf('video', S, g, w, true, ctx('pC')).slowLoss).toBe(true);
    // pB không xét vào Cắt lỗ → bộ điều kiện rỗng, không có ngưỡng chi → không vào cửa lỗ âm thầm
    expect(trendOf('video', S, g, w, true, ctx('pB')).slowLoss).toBeUndefined();
  });
});
