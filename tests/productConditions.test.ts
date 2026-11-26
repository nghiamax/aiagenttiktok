/** Điều kiện riêng theo sản phẩm trong nhóm (Sếp chốt 25/11): SP có điều kiện riêng chỉ xét bộ riêng, bỏ điều kiện chung */
import { describe, expect, it } from 'vitest';
import { classifyProduct, classifyVideo } from '../shared/classify';
import { groupDescription, migrateVideoGeneral, setsFor, type ConditionSet, type GroupDef } from '../shared/groups';
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

  it('tắt điều kiện chung (rỗng) → chỉ sản phẩm có điều kiện riêng vào nhóm', () => {
    const base = withOverrides({ pA: [costAtLeast(300_000)] });
    const s: AdsSettings = { ...base, groups: base.groups.map((g) => (g.id === 'cut' ? { ...g, conditionSets: [] } : g)) };
    expect(classifyVideo(loss('pA', 320_000), C, s)?.action).toBe('cut');
    expect(classifyVideo(loss('pC', 5_000_000), C, s)?.action).not.toBe('cut');
    expect(groupDescription(s.groups.find((g) => g.id === 'cut')!)).toBe('Thiết lập cho 1 sản phẩm');
  });
});

describe('Cấp video bỏ điều kiện chung (Sếp chốt 26/11)', () => {
  it('bản cũ: điều kiện chung → chép cho mọi sản phẩm đang có; SP đã có bộ riêng giữ; SP "không xét" bỏ khỏi nhóm', () => {
    const next = migrateVideoGeneral(S.groups, ['pA', 'pB', 'pC', 'pD'])!;
    const cut = next.find((g) => g.id === 'cut')!;
    expect(cut.conditionSets).toEqual([]);
    expect(Object.keys(cut.productConditions!).sort()).toEqual(['pA', 'pC', 'pD']);
    expect(cut.productConditions!.pA).toEqual([costAtLeast(300_000)]);
    expect(cut.productConditions!.pC).toEqual(S.groups.find((g) => g.id === 'cut')!.conditionSets);
    const s2 = { ...S, groups: next };
    // Kết quả xếp nhóm như trước khi chuyển
    expect(classifyVideo(loss('pC', 150_000), C, s2)?.action).toBe('cut');
    expect(classifyVideo(loss('pB', 5_000_000), C, s2)?.action).not.toBe('cut');
    // Sản phẩm mới sau khi chuyển: chưa thiết lập → không vào nhóm
    expect(classifyVideo(loss('pE', 5_000_000), C, s2)?.action).not.toBe('cut');
    // Chạy lại: không còn gì để chuyển
    expect(migrateVideoGeneral(next, ['pA', 'pE'])).toBeNull();
  });

  it('nhóm chưa thiết lập sản phẩm nào: mô tả rõ, không video nào vào', () => {
    const empty: GroupDef = { id: 'x', name: 'x', tone: 'red', icon: 'scissors', kind: 'custom', builtin: false, showInInbox: true, conditionSets: [] };
    expect(groupDescription(empty, 'video')).toBe('Chưa thiết lập sản phẩm nào');
    expect(migrateVideoGeneral([empty], ['pA'])).toBeNull();
  });
});
