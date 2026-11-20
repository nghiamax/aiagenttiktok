import { describe, expect, it } from 'vitest';
import { findRuleTargets } from '../shared/agentMatch';
import { classifyVideo } from '../shared/classify';
import { bulkSelectable, offsetTotalLine, offsetWarning } from '../shared/offsetText';
import { buildSuggestions } from '../shared/suggest';
import { campaign, GUARDRAILS, product, rule, settingsWith, snapshot, video } from './fixtures';

/* "Lỗ ở sản phẩm này nhưng có đơn bù ở sản phẩm khác" — vẫn đề xuất, kèm số tổng để Sếp tự quyết */
const S = settingsWith({ A: 3.5, B: 4.5 });
const snap = (extra: ReturnType<typeof video>[] = []) =>
  snapshot({
    campaigns: [campaign({ id: 'c1' }), campaign({ id: 'c2' })],
    products: [product({ id: 'A', campaignId: 'c1' }), product({ id: 'B', campaignId: 'c1' })],
    videos: [
      // Dòng chính lỗ: chi 150k, 0 đơn → Cắt lỗ
      video({ id: 'v1', campaignId: 'c1', productId: 'A', cost: 150_000, revenue: 0, orders: 0 }),
      ...extra,
    ],
  });
const cut = rule({ id: 'r', trigger: 'cut', actionType: 'remove_creative' });

describe('offsetOf qua findRuleTargets', () => {
  it('không có dòng khác → không có đơn bù', () => {
    expect(findRuleTargets(cut, S, snap())[0].offset).toBeUndefined();
  });

  it('đơn bù ở sản phẩm khác cùng chiến dịch → tổng có lời; hoà vốn theo tỷ trọng doanh thu', () => {
    const t = findRuleTargets(cut, S, snap([video({ id: 'v1', campaignId: 'c1', productId: 'B', cost: 0, revenue: 900_000, orders: 2 })]))[0];
    expect(t.offset).toMatchObject({
      revenue: 900_000,
      orders: 2,
      total: { cost: 150_000, revenue: 900_000, orders: 2, roi: 6, breakEven: 4.5 },
      profitable: true,
    });
    expect(offsetWarning(t.offset!)).toContain('tổng vẫn có lời');
  });

  it('đơn bù nhỏ → tổng vẫn lỗ', () => {
    const t = findRuleTargets(cut, S, snap([video({ id: 'v1', campaignId: 'c1', productId: 'B', revenue: 100_000, orders: 1 })]))[0];
    expect(t.offset?.profitable).toBe(false);
  });

  it('dòng ở chiến dịch khác không tính', () => {
    const t = findRuleTargets(cut, S, snap([video({ id: 'v1', campaignId: 'c2', productId: 'X', revenue: 900_000, orders: 2 })]))[0];
    expect(t.offset).toBeUndefined();
  });

  it('dòng có doanh thu mà thiếu hoà vốn → chưa kết luận được', () => {
    const t = findRuleTargets(cut, S, snap([video({ id: 'v1', campaignId: 'c1', productId: 'Z', revenue: 900_000, orders: 2 })]))[0];
    expect(t.offset).toMatchObject({ profitable: null, total: { breakEven: null } });
  });
});

describe('Video không khả dụng', () => {
  it('không xếp nhóm → Agent không đề xuất gỡ', () => {
    const s = snap();
    s.videos[0] = { ...s.videos[0], status: 'unavailable' };
    expect(findRuleTargets(cut, S, s)).toHaveLength(0);
    expect(classifyVideo(s.videos[0], s.campaigns[0], S)).toBeNull();
  });
});

describe('Hiển thị đơn bù', () => {
  const base = { revenue: 900_000, orders: 2 };
  const off = (profitable: boolean | null, roi = 6) =>
    ({ ...base, cost: 0, total: { cost: 150_000, revenue: 900_000, orders: 2, roi, breakEven: profitable == null ? null : 4.5 }, profitable }) as never;

  it('dòng tổng dưới badge: có lời / vẫn lỗ / thiếu hoà vốn', () => {
    expect(offsetTotalLine(off(true))).toBe('Tổng: ROI 6 ✓ có lời');
    expect(offsetTotalLine(off(false, 2.1))).toBe('Tổng: ROI 2,1 · vẫn lỗ');
    expect(offsetTotalLine(off(null))).toBe('Tổng: chưa đủ hoà vốn');
  });

  it('Chọn tất cả bỏ qua gỡ video tổng vẫn có lời, giữ các việc khác', () => {
    const items = [
      { id: 'a', actionType: 'remove_creative', offset: off(true) },
      { id: 'b', actionType: 'remove_creative', offset: off(false) },
      { id: 'c', actionType: 'remove_creative', offset: off(null) },
      { id: 'd', actionType: 'remove_creative' },
      { id: 'e', actionType: 'boost_creative', offset: off(true) },
    ];
    expect(bulkSelectable(items).map((p) => p.id)).toEqual(['b', 'c', 'd', 'e']);
  });
});

describe('Gợi ý Gỡ video', () => {
  it('video có đơn bù được nêu trong tiêu đề, lên đầu và có nhãn cảnh báo', () => {
    const s = snap([
      video({ id: 'v1', campaignId: 'c1', productId: 'B', revenue: 900_000, orders: 2 }),
      video({ id: 'v2', campaignId: 'c1', productId: 'A', cost: 400_000 }),
    ]);
    const g = buildSuggestions(s, S, [], GUARDRAILS).find((x) => x.id === 'video-cut')!;
    expect(g.title).toContain('1 video có đơn bù ở SP khác');
    expect(g.examples[0]).toMatchObject({ target: { videoId: 'v1' }, warning: expect.stringContaining('có đơn bù') });
    expect(g.examples[1].warning).toBeUndefined();
  });
});
