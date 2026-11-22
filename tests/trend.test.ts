import { describe, expect, it } from 'vitest';
import { buildTrendIndex, trendLabel, trendOf, videoKey } from '../shared/trend';
import { campaign, product, settingsWith, snapshot, video } from './fixtures';

/* Đánh giá 3 khung 7 · 14 · 30 ngày: nhóm đã xác nhận = 7 ngày và 14 ngày cùng nhóm (Sếp chốt 22/11) */
const S = settingsWith({ p1: 3 });
const w = { w7: null, w14: null, w30: null };

describe('trendOf', () => {
  it('7 = 14 = 30 → đã xác nhận, kéo dài', () => {
    const t = trendOf('video', S, { g7: 'cut', g14: 'cut', g30: 'cut' }, w);
    expect(t).toMatchObject({ group: 'cut', unconfirmed: false, long: true });
    expect(trendLabel(t, (id) => id ?? '--')).toBe('kéo dài 30 ngày');
  });

  it('7 = 14, 30 khác → đã xác nhận, 2 tuần gần đây', () => {
    const t = trendOf('video', S, { g7: 'cut', g14: 'cut', g30: 'stable' }, w);
    expect(t).toMatchObject({ group: 'cut', long: false });
    expect(trendLabel(t, (id) => id ?? '--')).toBe('2 tuần gần đây · 30 ngày: stable');
  });

  it('7 ≠ 14 → chưa xác nhận, không thuộc nhóm nào', () => {
    const t = trendOf('video', S, { g7: 'cut', g14: 'stable', g30: 'stable' }, w);
    expect(t).toMatchObject({ group: null, unconfirmed: true });
    expect(trendLabel(t, (id) => id ?? '--')).toBe('chưa xác nhận · 14 ngày: stable');
  });

  it('nhóm Cần ủy quyền (theo trạng thái TikTok) không cần xác nhận', () => {
    expect(trendOf('video', S, { g7: 'authorize', g14: null, g30: null }, w).group).toBe('authorize');
  });

  it('chưa có khung 14 ngày (đang tải / tắt xác nhận) → giữ nhóm 7 ngày', () => {
    expect(trendOf('video', S, { g7: 'cut', g14: null, g30: null }, w, false)).toMatchObject({ group: 'cut', unconfirmed: false });
  });

  it('không có số 7 ngày → không nhóm, không "chưa xác nhận"', () => {
    expect(trendOf('video', S, { g7: null, g14: 'cut', g30: 'cut' }, w)).toMatchObject({ group: null, unconfirmed: false });
  });
});

describe('buildTrendIndex', () => {
  const c = campaign({ id: 'c1' });
  const p = product({ id: 'p1', campaignId: 'c1' });
  const snap = (cost: number, revenue: number, orders: number, from: string) =>
    snapshot({
      range: { from, to: '2026-11-17' },
      campaigns: [c],
      products: [p],
      videos: [video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost, revenue, orders })],
    });

  it('video lỗ 7 ngày (0 đơn) nhưng 14 ngày có lời → chưa xác nhận; kèm số từng khung', () => {
    const idx = buildTrendIndex(
      'video',
      { d7: snap(200_000, 0, 0, '2026-11-11'), d14: snap(400_000, 2_000_000, 4, '2026-11-04'), d30: snap(800_000, 4_000_000, 8, '2026-10-19') },
      S,
    );
    const t = idx.get(videoKey({ campaignId: 'c1', productId: 'p1', id: 'v1' }))!;
    expect(t.g7).toBe('cut');
    expect(t.unconfirmed).toBe(true);
    expect(t.w14).toMatchObject({ cost: 400_000, orders: 4 });
  });

  it('chưa có snapshot 14 ngày → nhóm 7 ngày được giữ', () => {
    const idx = buildTrendIndex('video', { d7: snap(200_000, 0, 0, '2026-11-11'), d14: null, d30: null }, S);
    expect([...idx.values()][0].group).toBe('cut');
  });
});
