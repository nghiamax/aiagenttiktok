import { describe, expect, it } from 'vitest';
import { emptySnapshot } from '../shared/adsSnapshot';
import staticSnapshot from '../src/data/ads-snapshot.json';

/* Chế độ khách (chưa đăng nhập web): trang ADS dùng snapshot rỗng — không lộ số liệu thật của shop */
describe('emptySnapshot (chế độ khách)', () => {
  it('không có số liệu nào', () => {
    const s = emptySnapshot();
    expect(Object.values(s.summary).every((v) => v === null)).toBe(true);
    expect(s.campaigns).toEqual([]);
    expect(s.products).toEqual([]);
    expect(s.videos).toEqual([]);
    expect(s.advertiser).toBeNull();
    expect(s.range).toBeNull();
    expect(s.previousSummary ?? null).toBeNull();
  });

  it('không dùng chung dữ liệu với file số liệu lưu sẵn (số thật của shop)', () => {
    const s = emptySnapshot();
    expect(s.campaigns.length).not.toBe((staticSnapshot as { campaigns: unknown[] }).campaigns.length || -1);
    expect(JSON.stringify(s)).not.toContain((staticSnapshot as { advertiser?: { name?: string } }).advertiser?.name ?? '§');
  });

  it('mỗi lần gọi trả bản mới (sửa bản này không ảnh hưởng bản khác)', () => {
    const a = emptySnapshot();
    a.campaigns.push({} as never);
    expect(emptySnapshot().campaigns).toEqual([]);
  });
});
