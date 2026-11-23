import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

/* Chép dữ liệu JSON cũ (1 shop NECOTECH) sang database nhiều shop — thư mục tạm, dữ liệu mẫu */
const dir = vi.hoisted(() => {
  // Tài khoản quảng cáo bản cũ dùng (biến môi trường) — chép sang shop chính
  process.env.TIKTOK_ADVERTISER_ID = 'ADV1';
  process.env.TIKTOK_STORE_ID = 'STORE1';
  process.env.TIKTOK_ADVERTISER_NAME = 'Shop Mẫu';
  return { path: '' };
});
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'import-'));
  return {
    config: {
      dataDir: pathMod.join(dir.path, 'data'),
      secretsDir: pathMod.join(dir.path, 'secrets'),
    },
  };
});

const NOW = new Date('2026-11-23T10:00:00Z');
const write = (sub: string, name: string, data: unknown) => {
  const p = path.join(dir.path, sub, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data));
};

const { getDb, closeDb } = await import('../server/db/index');
const { importLegacy } = await import('../server/db/importLegacy');
const { decrypt } = await import('../server/db/secret');
afterAll(() => {
  closeDb();
  fs.rmSync(dir.path, { recursive: true, force: true });
});

describe('importLegacy', () => {
  it('chép người dùng, phiên, token (mã hoá), thiết lập, quy tắc, đề xuất, nhật ký, theo dõi vào đúng shop; chạy lại không chép 2 lần', () => {
    write('data', 'users.json', [
      { id: 'u-owner', username: 'Sep', name: 'Sếp', role: 'owner', passwordHash: 'scrypt$x', disabled: false, createdAt: '2026-11-01T00:00:00Z', passwordChangedAt: '2026-11-01T00:00:00Z' },
      { id: 'u-staff', username: 'nv1', name: 'NV', role: 'staff', passwordHash: 'scrypt$y', disabled: true },
      { id: 'u-cus', username: 'khach', name: 'Khách A', role: 'user', plan: 'pro', proUntil: '2027-01-01T00:00:00Z', passwordHash: 'scrypt$z' },
    ]);
    write('data', 'sessions.json', [
      { idHash: 'h-live', userId: 'u-owner', createdAt: '2026-11-20T00:00:00Z', lastSeenAt: '2026-11-22T00:00:00Z' },
      { idHash: 'h-old', userId: 'u-owner', createdAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-02T00:00:00Z' },
      { idHash: 'h-cus', userId: 'u-cus', createdAt: '2026-11-20T00:00:00Z', lastSeenAt: '2026-11-22T00:00:00Z' },
    ]);
    write('data', 'settings.json', { breakEvenRoi: { p1: 2.5 } });
    write('data', 'agent-config.json', { paused: false, rules: [{ id: 'r1' }] });
    write('data', 'agent-state.json', {
      lastRunAt: '2026-11-23T09:00:00Z',
      lastRunError: null,
      proposals: [{ id: 'p1', status: 'pending', createdAt: '2026-11-23T09:00:00Z' }],
      actions: [{ id: 'a1', status: 'success', executedAt: '2026-11-22T09:00:00Z' }, { id: 'a2', status: 'failed', executedAt: '2026-11-21T09:00:00Z' }],
    });
    write('data', 'watchlist.json', [{ videoId: '7600254603350838549', note: 'xem', addedAt: '2026-11-22T00:00:00Z' }]);
    write('secrets', 'tiktok-mcp.json', { client_id: 'c', access_token: 'AT', refresh_token: 'RT', savedAt: '2026-11-23T08:00:00Z', connectedAt: '2026-11-21T00:00:00Z' });

    const db = getDb();
    const r = importLegacy(db, NOW);
    expect(r).toMatchObject({ imported: true, accounts: 2, users: 3, shops: 1, sessions: 2, proposals: 1, actions: 2, watch: 1, token: true });

    const shop = db.prepare('SELECT id, account_id, name FROM shops').get() as { id: string; account_id: string; name: string };
    expect(shop.name).toBe('Shop Mẫu');
    const users = db.prepare('SELECT id, account_id, username, role, is_admin, disabled FROM users ORDER BY id').all() as Record<string, unknown>[];
    expect(users.find((u) => u.id === 'u-owner')).toMatchObject({ account_id: shop.account_id, username: 'sep', role: 'owner', is_admin: 1 });
    expect(users.find((u) => u.id === 'u-staff')).toMatchObject({ account_id: shop.account_id, role: 'staff', is_admin: 0, disabled: 1 });
    const cus = users.find((u) => u.id === 'u-cus')!;
    expect(cus).toMatchObject({ role: 'owner', is_admin: 0 });
    expect(cus.account_id).not.toBe(shop.account_id);
    expect(db.prepare('SELECT plan, pro_until FROM accounts WHERE id = ?').get(cus.account_id as string)).toMatchObject({ plan: 'pro', pro_until: '2027-01-01T00:00:00Z' });
    // Khách cũ chưa có shop — không thấy shop chính
    expect(db.prepare('SELECT count(*) n FROM shops WHERE account_id = ?').get(cus.account_id as string)).toMatchObject({ n: 0 });

    // Phiên hết hạn bỏ; phiên khách không gắn shop chính
    const sessions = db.prepare('SELECT token_hash, shop_id FROM sessions ORDER BY token_hash').all() as { token_hash: string; shop_id: string | null }[];
    expect(sessions).toEqual([
      { token_hash: 'h-cus', shop_id: null },
      { token_hash: 'h-live', shop_id: shop.id },
    ]);

    const link = db.prepare('SELECT * FROM tiktok_links WHERE shop_id = ?').get(shop.id) as Record<string, string>;
    expect(link).toMatchObject({ advertiser_id: 'ADV1', store_id: 'STORE1', connected_at: '2026-11-21T00:00:00Z' });
    expect(link.token_enc).not.toContain('AT'); // không lưu bản rõ
    expect(JSON.parse(decrypt(link.token_enc)!)).toMatchObject({ access_token: 'AT', refresh_token: 'RT' });

    expect(db.prepare('SELECT status FROM proposals WHERE shop_id = ? AND id = ?').get(shop.id, 'p1')).toMatchObject({ status: 'pending' });
    expect(db.prepare('SELECT count(*) n FROM actions WHERE shop_id = ?').get(shop.id)).toMatchObject({ n: 2 });
    expect(JSON.parse((db.prepare('SELECT data FROM shop_settings WHERE shop_id = ?').get(shop.id) as { data: string }).data)).toEqual({ breakEvenRoi: { p1: 2.5 } });
    expect(db.prepare('SELECT note FROM watchlist WHERE shop_id = ?').get(shop.id)).toMatchObject({ note: 'xem' });

    // File cũ vẫn còn (quay lại bản cũ được)
    expect(fs.existsSync(path.join(dir.path, 'data', 'users.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir.path, 'secrets', 'tiktok-mcp.json'))).toBe(true);

    // Chạy lại: bỏ qua
    expect(importLegacy(db, NOW)).toMatchObject({ imported: false, skipped: 'đã chép trước đó' });
    expect(db.prepare('SELECT count(*) n FROM users').get()).toMatchObject({ n: 3 });
  });
});
