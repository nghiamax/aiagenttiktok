import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/* Cache snapshot: cache dựng bằng code cũ (khác SNAPSHOT_BUILD) phải dựng lại, kể cả khoảng ngày "giữ mãi" */
const dir = vi.hoisted(() => ({ path: '' }));
const built = vi.hoisted(() => ({ n: 0 }));
/** Tài khoản quảng cáo đang chọn theo shop (bình thường lấy từ database) */
const accounts = vi.hoisted(() => ({ map: {} as Record<string, { advertiserId: string; storeId: string }> }));
vi.mock('../server/tiktok/link', async () => {
  const { currentShopId } = await import('../server/shopContext');
  return { requireAccount: () => accounts.map[currentShopId()] };
});
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'cache-'));
  return { config: { dataDir: dir.path } };
});
vi.mock('../server/ads/buildSnapshot', () => ({
  SNAPSHOT_BUILD: 2,
  buildSnapshot: async (r: { from: string; to: string }) => {
    built.n++;
    return { build: 2, updatedAt: new Date().toISOString(), range: r, videos: [], campaigns: [], products: [] };
  },
}));

const { getSnapshot: rawGet } = await import('../server/ads/cache');
const { withShop } = await import('../server/shopContext');
const getSnapshot = (r: { from: string; to: string }, shop = 's1') => withShop(shop, () => rawGet(r));
const OLD = { from: '2026-10-01', to: '2026-10-07' }; // khoảng cũ → cache giữ mãi
const file = path.join(dir.path, 'cache', 's1', 'ADV1_STORE1', `${OLD.from}_${OLD.to}.json`);
const writeCached = (snap: object) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ updatedAt: '2026-10-08T00:00:00Z', range: OLD, videos: [], campaigns: [], products: [], ...snap }));
};

beforeEach(() => {
  built.n = 0;
  accounts.map = { s1: { advertiserId: 'ADV1', storeId: 'STORE1' }, s2: { advertiserId: 'ADV2', storeId: 'STORE2' } };
  fs.rmSync(path.join(dir.path, 'cache'), { recursive: true, force: true });
});
afterAll(() => fs.rmSync(dir.path, { recursive: true, force: true }));

describe('getSnapshot — phiên bản cache', () => {
  it('cache không có build (code cũ) → dựng lại và ghi build mới', async () => {
    writeCached({});
    const r = await getSnapshot(OLD);
    expect(r.cached).toBe(false);
    expect(built.n).toBe(1);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).build).toBe(2);
  });

  it('cache đúng build → dùng cache, không gọi TikTok', async () => {
    writeCached({ build: 2 });
    const r = await getSnapshot(OLD);
    expect(r.cached).toBe(true);
    expect(built.n).toBe(0);
  });

  it('cache theo shop + tài khoản: shop khác không đọc file của shop này; đổi tài khoản quảng cáo → dựng lại', async () => {
    writeCached({ build: 2 });
    expect((await getSnapshot(OLD, 's1')).cached).toBe(true);
    expect((await getSnapshot(OLD, 's2')).cached).toBe(false);
    accounts.map.s1 = { advertiserId: 'ADV9', storeId: 'STORE1' };
    expect((await getSnapshot(OLD, 's1')).cached).toBe(false);
    expect(built.n).toBe(2);
    expect(fs.existsSync(path.join(dir.path, 'cache', 's2', 'ADV2_STORE2', `${OLD.from}_${OLD.to}.json`))).toBe(true);
  });
});
