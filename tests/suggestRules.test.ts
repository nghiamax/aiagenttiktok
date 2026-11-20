import { describe, expect, it } from 'vitest';
import { buildSuggestions } from '../shared/suggest';
import { cpaBreakEvenMap, FALLBACK_CPA_VND, suggestParams } from '../shared/suggestRules';
import type { AdsSettings } from '../shared/settings';
import type { AdsVideo } from '../shared/adsSnapshot';
import { campaign, GUARDRAILS, product, settingsWith, snapshot, video } from './fixtures';

/* Bộ gợi ý CHUNG: ngưỡng tự co giãn theo giá trị đơn / hoà vốn của từng shop, không phụ thuộc nhóm */

/** Shop có 1 sản phẩm: giá trị đơn TB = aov, hoà vốn 2 → mốc chi cho 1 đơn = aov ÷ 2 */
function shop(aov: number, videos: AdsVideo[]) {
  return snapshot({
    campaigns: [campaign({ id: 'c1', targetRoi: 3 })],
    products: [product({ id: 'p1', campaignId: 'c1', cost: 10 * aov, revenue: 10 * aov, orders: 10, roi: 1 })],
    videos,
  });
}
const S = settingsWith({ p1: 2 });
const ids = (list: ReturnType<typeof buildSuggestions>, id: string) =>
  list.find((s) => s.id === id)?.examples.map((e) => e.target.videoId) ?? [];

describe('CPA hoà vốn (mốc chi cho 1 đơn)', () => {
  it('= giá trị đơn TB ÷ ROI hoà vốn, cộng mọi chiến dịch của sản phẩm', () => {
    const s = snapshot({
      products: [
        product({ id: 'p1', campaignId: 'c1', revenue: 600_000, orders: 2 }),
        product({ id: 'p1', campaignId: 'c2', revenue: 300_000, orders: 1 }),
      ],
    });
    expect(cpaBreakEvenMap(s, settingsWith({ p1: 3 })).get('p1')).toBe(100_000);
  });

  it('thiếu hoà vốn hoặc chưa có đơn → không tính được', () => {
    const s = snapshot({ products: [product({ id: 'p1', campaignId: 'c1', revenue: 0, orders: 0 })] });
    expect(cpaBreakEvenMap(s, settingsWith({ p1: 3 })).has('p1')).toBe(false);
    const s2 = snapshot({ products: [product({ id: 'p1', campaignId: 'c1', revenue: 300_000, orders: 1 })] });
    expect(cpaBreakEvenMap(s2, settingsWith()).has('p1')).toBe(false);
  });
});

describe('Gỡ video lỗ — ngưỡng theo từng shop', () => {
  it('shop bán đồ rẻ (đơn 30k → mốc 15k): video chi 20k, 0 đơn đã đủ để gỡ', () => {
    const s = shop(30_000, [video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 20_000 })]);
    expect(ids(buildSuggestions(s, S, [], GUARDRAILS), 'video-cut')).toEqual(['v1']);
  });

  it('shop bán đồ đắt (đơn 2 tr → mốc 1 tr): video chi 500k, 0 đơn chưa đủ kết luận', () => {
    const s = shop(2_000_000, [
      video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 500_000 }),
      video({ id: 'v2', campaignId: 'c1', productId: 'p1', cost: 1_200_000 }),
    ]);
    expect(ids(buildSuggestions(s, S, [], GUARDRAILS), 'video-cut')).toEqual(['v2']);
  });

  it('có đơn nhưng ROI < hoà vốn: cần chi ≥ 2× mốc', () => {
    // đơn 300k, hoà vốn 2 → mốc 150k; ROI 1 < 2
    const s = shop(300_000, [
      video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 200_000, revenue: 200_000, orders: 1 }),
      video({ id: 'v2', campaignId: 'c1', productId: 'p1', cost: 400_000, revenue: 400_000, orders: 1 }),
    ]);
    expect(ids(buildSuggestions(s, S, [], GUARDRAILS), 'video-cut')).toEqual(['v2']);
  });

  it('chưa tính được mốc → dùng ngưỡng dự phòng', () => {
    const s = snapshot({
      campaigns: [campaign({ id: 'c1' })],
      products: [product({ id: 'p1', campaignId: 'c1' })],
      videos: [
        video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: FALLBACK_CPA_VND - 1 }),
        video({ id: 'v2', campaignId: 'c1', productId: 'p1', cost: FALLBACK_CPA_VND }),
      ],
    });
    expect(ids(buildSuggestions(s, settingsWith(), [], GUARDRAILS), 'video-cut')).toEqual(['v2']);
  });

  it('shop đã xoá nhóm Cắt lỗ → gợi ý vẫn hiện, nút Bật quy tắc bị khoá', () => {
    const noCut: AdsSettings = { ...S, groups: S.groups.filter((g) => g.id !== 'cut') };
    const s = shop(30_000, [video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 20_000 })]);
    const g = buildSuggestions(s, noCut, [], GUARDRAILS).find((x) => x.id === 'video-cut');
    expect(g?.count).toBe(1);
    expect(g?.action.kind === 'rule' && g.action.groupMissing).toBe(true);
    expect(g?.done).toBe(false);
  });

  it('shop chỉnh hệ số / tắt gợi ý', () => {
    const s = shop(30_000, [video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 20_000 })]);
    const stricter: AdsSettings = { ...S, suggestOverrides: { 'video-cut': { params: { noOrderCpaX: 2 } } } };
    expect(suggestParams(stricter, 'video-cut').noOrderCpaX).toBe(2);
    expect(ids(buildSuggestions(s, stricter, [], GUARDRAILS), 'video-cut')).toEqual([]);
    const off: AdsSettings = { ...S, suggestOverrides: { 'video-cut': { off: true } } };
    expect(buildSuggestions(s, off, [], GUARDRAILS).some((x) => x.id === 'video-cut')).toBe(false);
  });
});

describe('Sản phẩm lỗ', () => {
  it('ROI < hoà vốn và chi ≥ 2× mốc mới gợi ý', () => {
    // đơn 100k, hoà vốn 2 → mốc 50k → cần chi ≥ 100k
    const mk = (cost: number) =>
      snapshot({ campaigns: [campaign({ id: 'c1' })], products: [product({ id: 'p1', campaignId: 'c1', cost, revenue: 100_000, orders: 1 })] });
    expect(buildSuggestions(mk(90_000), S, [], GUARDRAILS).some((x) => x.id === 'product-loss')).toBe(false);
    expect(buildSuggestions(mk(120_000), S, [], GUARDRAILS).some((x) => x.id === 'product-loss')).toBe(true);
  });
});

describe('Chiến dịch', () => {
  it('ROI thấp chỉ gợi ý khi đã chi ≥ 1 ngày ngân sách', () => {
    const mk = (cost: number) =>
      snapshot({ campaigns: [campaign({ id: 'c1', budget: 1_000_000, targetRoi: 5, cost, revenue: cost * 2, orders: 3, roi: 2 })] });
    expect(buildSuggestions(mk(500_000), S, [], GUARDRAILS).some((x) => x.id === 'campaign-low-roi')).toBe(false);
    expect(buildSuggestions(mk(1_500_000), S, [], GUARDRAILS).some((x) => x.id === 'campaign-low-roi')).toBe(true);
  });

  it('mỗi chiến dịch chỉ vào 1 gợi ý (ROI thấp + tiêu chậm → chỉ ROI thấp)', () => {
    // 7 ngày, ngân sách 1 tr/ngày, chi 1,5 tr → tiêu ~21% và ROI 2 < 0,8 × 5
    const s = snapshot({ campaigns: [campaign({ id: 'c1', budget: 1_000_000, targetRoi: 5, cost: 1_500_000, revenue: 3_000_000, orders: 3, roi: 2 })] });
    const list = buildSuggestions(s, S, [], GUARDRAILS).map((x) => x.id);
    expect(list).toContain('campaign-low-roi');
    expect(list).not.toContain('campaign-slow');
  });
});

describe('Phụ thuộc vài video (#12)', () => {
  const mk = (revs: number[]) =>
    snapshot({
      campaigns: [campaign({ id: 'c1' })],
      products: [product({ id: 'p1', campaignId: 'c1' })],
      videos: revs.map((r, i) => video({ id: `v${i}`, campaignId: 'c1', productId: 'p1', cost: 10_000, revenue: r, orders: 1 })),
    });

  it('3 video chiếm ≥ 60% doanh thu → gợi ý, kể tên 3 video', () => {
    const g = buildSuggestions(mk([500, 300, 200, 50, 50]), S, [], GUARDRAILS).find((x) => x.id === 'video-concentration');
    expect(g?.examples.map((e) => e.target.videoId)).toEqual(['v0', 'v1', 'v2']);
    expect(g?.action.kind).toBe('info');
  });

  it('doanh thu dàn đều → không gợi ý', () => {
    expect(buildSuggestions(mk([100, 100, 100, 100, 100, 100]), S, [], GUARDRAILS).some((x) => x.id === 'video-concentration')).toBe(false);
  });

  it('dưới 5 video có doanh thu → chưa xét', () => {
    expect(buildSuggestions(mk([900, 50, 50, 0]), S, [], GUARDRAILS).some((x) => x.id === 'video-concentration')).toBe(false);
  });
});

describe('Sản phẩm thiếu video chạy được (#14)', () => {
  const vids = (statuses: AdsVideo['status'][], campaignId = 'c1') =>
    statuses.map((status, i) => video({ id: `v${i}`, campaignId, productId: 'p1', status }));
  const mk = (statuses: AdsVideo['status'][], campaignStatus: 'running' | 'paused' = 'running') =>
    snapshot({
      campaigns: [campaign({ id: 'c1', status: campaignStatus })],
      products: [product({ id: 'p1', campaignId: 'c1', cost: 100_000 })],
      videos: vids(statuses),
    });
  const has = (s: ReturnType<typeof mk>) => buildSuggestions(s, S, [], GUARDRAILS).some((x) => x.id === 'product-few-videos');

  it('≥ 50% video không khả dụng → gợi ý', () => {
    expect(has(mk(['delivering', 'delivering', 'delivering', 'unavailable', 'unavailable', 'unavailable']))).toBe(true);
  });

  it('chỉ còn ≤ 2 video đang chạy → gợi ý', () => {
    expect(has(mk(['delivering', 'learning', 'not_delivering']))).toBe(true);
  });

  it('đủ video chạy được → không gợi ý', () => {
    expect(has(mk(['delivering', 'delivering', 'learning', 'unavailable']))).toBe(false);
  });

  it('chiến dịch đang tắt → không xét', () => {
    expect(has(mk(['unavailable', 'unavailable'], 'paused'))).toBe(false);
  });
});
