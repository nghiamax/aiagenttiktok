import { describe, expect, it } from 'vitest';
import { classifyCampaign, classifyProduct, classifyVideo, contextForCampaign } from '../shared/classify';
import { matchSet, normalizeGroups, reasonFor, type EvalContext } from '../shared/groups';
import { breakEvenOf } from '../shared/settings';
import { campaign, product, settingsWith, video } from './fixtures';

const C = campaign({ id: 'c1', targetRoi: 5 });

describe('Điều kiện nhóm (groups)', () => {
  const ctx: EvalContext = { cost: 200_000, revenue: 300_000, orders: 1, roi: 1.5, cpa: 200_000, breakEven: null, target: 5, budgetUse: null };

  it('so với ROI hoà vốn khi chưa nhập hoà vốn → không khớp', () => {
    expect(matchSet({ clauses: [{ metric: 'roi', op: 'lt', value: { type: 'breakEven', k: 1 } }] }, ctx)).toBe(false);
  });

  it('khớp khi đủ mọi điều kiện (VÀ)', () => {
    const set = {
      clauses: [
        { metric: 'cost' as const, op: 'gte' as const, value: { type: 'number' as const, n: 100_000 } },
        { metric: 'roi' as const, op: 'lt' as const, value: { type: 'target' as const, k: 1 } },
      ],
    };
    expect(matchSet(set, ctx)).toBe(true);
    expect(reasonFor(set, ctx)).toContain('ROI 1,5');
  });

  it('cách rỗng không bao giờ khớp', () => {
    expect(matchSet({ clauses: [] }, ctx)).toBe(false);
  });

  it('nhóm fallback luôn bị đưa xuống cuối', () => {
    const groups = settingsWith().groups;
    const shuffled = [groups[groups.length - 1], ...groups.slice(0, -1)];
    expect(normalizeGroups(shuffled).at(-1)?.kind).toBe('fallback');
  });

  it('ROI hoà vốn ≤ 0 hoặc thiếu → null', () => {
    expect(breakEvenOf(settingsWith({ p1: 0 }), 'p1')).toBeNull();
    expect(breakEvenOf(settingsWith({ p1: 4.5 }), 'p1')).toBe(4.5);
    expect(breakEvenOf(settingsWith(), 'p1')).toBeNull();
  });
});

describe('Phân loại video', () => {
  const S = settingsWith({ p1: 4 });

  it('thẻ sản phẩm và video không chi / không đơn → không phân loại', () => {
    expect(classifyVideo(video({ id: '-1', campaignId: 'c1', productId: 'p1', contentType: 'product_card', cost: 500_000 }), C, S)).toBeNull();
    expect(classifyVideo(video({ id: 'v1', campaignId: 'c1', productId: 'p1' }), C, S)).toBeNull();
  });

  it('cần ủy quyền + có doanh thu → nhóm Cần ủy quyền (ưu tiên trên cùng)', () => {
    const v = video({ id: 'v1', campaignId: 'c1', productId: 'p1', status: 'authorization_needed', revenue: 400_000 });
    expect(classifyVideo(v, C, S)?.action).toBe('authorize');
  });

  it('chi ≥ 100k mà 0 đơn → Cắt lỗ', () => {
    const v = video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 136_000, orders: 0 });
    expect(classifyVideo(v, C, S)?.action).toBe('cut');
  });

  it('chi ≥ 100k, ROI < hoà vốn → Cắt lỗ; chưa nhập hoà vốn thì KHÔNG bị cắt', () => {
    const v = video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 677_000, revenue: 1_110_000, orders: 3 });
    expect(classifyVideo(v, C, S)?.action).toBe('cut');
    expect(classifyVideo(v, C, settingsWith())?.action).not.toBe('cut');
  });

  it('≥ 3 đơn và ROI ≥ mục tiêu → Nhân rộng', () => {
    const v = video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 300_000, revenue: 6_000_000, orders: 10 });
    expect(classifyVideo(v, C, S)?.action).toBe('scale');
  });

  it('không khớp nhóm nào → fallback Ổn định, kèm lý do', () => {
    const v = video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 150_000, revenue: 700_000, orders: 1 });
    const cls = classifyVideo(v, C, S);
    expect(cls?.action).toBe('stable');
    expect(cls?.reason).toContain('Không thuộc nhóm nào');
  });
});

describe('Phân loại sản phẩm / chiến dịch', () => {
  it('sản phẩm ROI < hoà vốn → Lỗ; ≥ 1,2 × hoà vốn → Lời', () => {
    const S = settingsWith({ p1: 4 });
    expect(classifyProduct(product({ id: 'p1', campaignId: 'c1', cost: 1_000_000, revenue: 2_000_000, roi: 2 }), C, S)?.action).toBe('p-loss');
    expect(classifyProduct(product({ id: 'p1', campaignId: 'c1', cost: 1_000_000, revenue: 6_000_000, roi: 6 }), C, S)?.action).toBe('p-profit');
  });

  it('mức tiêu ngân sách = chi TB/ngày ÷ ngân sách ngày × 100', () => {
    const c = campaign({ id: 'c1', budget: 1_000_000, cost: 7_000_000 });
    expect(contextForCampaign(c, 7).budgetUse).toBeCloseTo(100);
    expect(contextForCampaign(c, 14).budgetUse).toBeCloseTo(50);
  });

  it('tiêu ≥ 90% NS và ROI ≥ mục tiêu → c-scale; ROI < 0,8 × mục tiêu → c-low-roi', () => {
    const S = settingsWith();
    const good = campaign({ id: 'c1', budget: 1_000_000, cost: 7_000_000, revenue: 42_000_000, orders: 50, roi: 6, targetRoi: 5 });
    const bad = campaign({ id: 'c2', budget: 1_000_000, cost: 7_000_000, revenue: 21_000_000, orders: 50, roi: 3, targetRoi: 5 });
    expect(classifyCampaign(good, S, 7)?.action).toBe('c-scale');
    expect(classifyCampaign(bad, S, 7)?.action).toBe('c-low-roi');
  });
});
