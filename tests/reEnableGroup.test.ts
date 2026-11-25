/** Nhóm hệ thống cấp sản phẩm "Cân nhắc bật lại" (Sếp chốt 25/11): hệ thống tự đánh giá, quy tắc chọn làm gì */
import { describe, expect, it } from 'vitest';
import { matchRuleTrend } from '../shared/agentMatch';
import type { AgentRule } from '../shared/agentTypes';
import { groupDescription } from '../shared/groups';
import { REENABLE_GROUP_ID, reEnableCandidates } from '../shared/reEnable';
import { normalizeSettings } from '../shared/settings';
import { campaign, DEFAULT_SETTINGS, product, settingsWith, snapshot } from './fixtures';

const S = settingsWith({ pA: 4, pB: 4, pC: 4, pD: 4 });
// 7 ngày: không có số của sản phẩm đã tắt
const d7 = snapshot({
  campaigns: [campaign({ id: 'c1', status: 'running' }), campaign({ id: 'c2', status: 'paused' })],
  products: [product({ id: 'pC', campaignId: 'c1', cost: 100_000, revenue: 600_000, orders: 4, roi: 6 })],
});
// 30 ngày: pA loại trừ, có lời 5 đơn · pB loại trừ, lỗ · pC đang chạy · pD thuộc chiến dịch đã tắt, có lời
const d30 = snapshot({
  campaigns: [campaign({ id: 'c1', status: 'running' }), campaign({ id: 'c2', status: 'paused' })],
  products: [
    product({ id: 'pA', campaignId: 'c1', excluded: true, cost: 1_000_000, revenue: 6_000_000, orders: 5, roi: 6 }),
    product({ id: 'pB', campaignId: 'c1', excluded: true, cost: 1_000_000, revenue: 2_000_000, orders: 5, roi: 2 }),
    product({ id: 'pC', campaignId: 'c1', cost: 1_000_000, revenue: 6_000_000, orders: 20, roi: 6 }),
    product({ id: 'pD', campaignId: 'c2', cost: 500_000, revenue: 3_000_000, orders: 3, roi: 6 }),
  ],
});
const snaps = { d7, d14: null, d30 };

describe('Nhóm "Cân nhắc bật lại"', () => {
  it('có trong nhóm sản phẩm mặc định; bản lưu cũ chưa có → tự thêm lên đầu', () => {
    expect(DEFAULT_SETTINGS.productGroups[0]).toMatchObject({ id: REENABLE_GROUP_ID, kind: 'platform' });
    const old = { productGroups: DEFAULT_SETTINGS.productGroups.filter((g) => g.id !== REENABLE_GROUP_ID) };
    expect(normalizeSettings(old, DEFAULT_SETTINGS).productGroups[0].id).toBe(REENABLE_GROUP_ID);
    expect(groupDescription(DEFAULT_SETTINGS.productGroups[0], 'product')).toMatch(/Hệ thống tự đánh giá/);
  });

  it('chỉ sản phẩm đang tắt / loại trừ / chiến dịch tắt mà 30 ngày có lời ≥ 3 đơn', () => {
    const list = reEnableCandidates(snaps, S);
    expect(list.map((c) => c.productId).sort()).toEqual(['pA', 'pD']);
    expect(list.find((c) => c.productId === 'pA')).toMatchObject({ excluded: true, campaignRunning: true, days: 30 });
    expect(list.find((c) => c.productId === 'pD')).toMatchObject({ excluded: false, campaignRunning: false });
  });

  it('thiếu ROI hoà vốn → không vào nhóm', () => {
    expect(reEnableCandidates(snaps, settingsWith({})).length).toBe(0);
  });

  it('quy tắc cấp sản phẩm chọn nhóm này → đối tượng theo đánh giá (không dùng luật 7 = 14 ngày), có tính phạm vi', () => {
    const rule = { id: 'r', name: 'r', level: 'product', trigger: REENABLE_GROUP_ID, actionType: 'enable_product', params: {}, mode: 'approve', cooldownHours: 24, campaignIds: null } as AgentRule;
    const { kept, unconfirmed } = matchRuleTrend(rule, S, d7, { d14: null, d30 });
    expect(unconfirmed).toEqual([]);
    expect(kept.map((t) => t.target.productId).sort()).toEqual(['pA', 'pD']);
    const a = kept.find((t) => t.target.productId === 'pA')!;
    expect(a).toMatchObject({ productExcluded: true, campaignRunning: true, cost: 0 });
    expect(a.reason).toMatch(/30 ngày qua: 5 đơn · ROI 6,00 ≥ hoà vốn 4,00/);
    expect(a.windows?.d30?.orders).toBe(5);
    expect(matchRuleTrend({ ...rule, productIds: ['pD'] }, S, d7, { d14: null, d30 }).kept.map((t) => t.target.productId)).toEqual(['pD']);
  });
});
