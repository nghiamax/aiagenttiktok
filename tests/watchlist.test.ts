import fs from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseVideoId } from '../shared/videoId';

/* Ô "Đang theo dõi": tách mã video từ link, thêm / bỏ / trùng — dữ liệu ở thư mục tạm */
const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'watch-'));
  return { config: { dataDir: dir.path } };
});
const w = await import('../server/watchlist');
afterAll(() => fs.rmSync(dir.path, { recursive: true, force: true }));
beforeEach(() => fs.rmSync(`${dir.path}/watchlist.json`, { force: true }));

describe('parseVideoId', () => {
  it('nhận mã số, link tiktok.com/@user/video/<id>, link có item_id', () => {
    expect(parseVideoId(' 7577366150904843541 ')).toBe('7577366150904843541');
    expect(parseVideoId('https://www.tiktok.com/@neco_tech/video/7600254603350838549?is_from_webapp=1')).toBe('7600254603350838549');
    expect(parseVideoId('https://ads.tiktok.com/x?item_id=7649048012542577940&a=1')).toBe('7649048012542577940');
  });
  it('không phải mã video → null', () => {
    expect(parseVideoId('abc')).toBeNull();
    expect(parseVideoId('12345')).toBeNull();
    expect(parseVideoId('')).toBeNull();
  });
});

describe('watchlist', () => {
  it('thêm (mới nhất lên đầu), thêm trùng → chỉ cập nhật ghi chú, bỏ', () => {
    w.addWatch('111111111111111111', 'video A', { id: 'u1', name: 'Sếp' });
    w.addWatch('222222222222222222', undefined);
    expect(w.getWatchlist().map((x) => x.videoId)).toEqual(['222222222222222222', '111111111111111111']);
    w.addWatch('111111111111111111', 'đổi ghi chú');
    expect(w.getWatchlist()).toHaveLength(2);
    expect(w.getWatchlist().find((x) => x.videoId === '111111111111111111')).toMatchObject({ note: 'đổi ghi chú', addedBy: { name: 'Sếp' } });
    w.removeWatch('111111111111111111');
    expect(w.getWatchlist().map((x) => x.videoId)).toEqual(['222222222222222222']);
  });
});
