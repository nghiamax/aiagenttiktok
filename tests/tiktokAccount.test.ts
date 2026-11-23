import fs from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/* Chọn tài khoản quảng cáo theo quyền đã cấp (sửa lỗi 23/11) + token / tài khoản tách theo shop — TikTok giả lập */
const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'ttacc-'));
  return { config: { dataDir: dir.path, secretsDir: dir.path, root: process.cwd(), tiktok: { mcpUrl: 'https://tt.invalid/mcp' } } };
});

/** TikTok giả: tài khoản quảng cáo token được quyền + shop GMV Max của từng tài khoản */
const tt = vi.hoisted(() => ({
  advertisers: [] as { advertiser_id: string; advertiser_name: string; currency?: string }[],
  stores: {} as Record<string, { store_id: string; store_name: string; exclusive_authorized_advertiser_info?: { advertiser_id: string } }[]>,
  calls: [] as string[],
}));
vi.mock('../server/tiktok/mcpClient', () => ({
  callReadTool: async (tool: string, params: { advertiser_id?: string }) => {
    tt.calls.push(tool);
    if (tool === 'auth_advertiser_get') return { list: tt.advertisers };
    if (tool === 'gmv_max_store_list_get') return { store_list: tt.stores[params.advertiser_id!] ?? [] };
    throw new Error(`tool lạ ${tool}`);
  },
}));

const db = await import('../server/db/index');
const store = await import('../server/store');
const link = await import('../server/tiktok/link');
const accounts = await import('../server/tiktok/accounts');
const tAuth = await import('../server/tiktok/auth');
const { withShop } = await import('../server/shopContext');
const { makeShop } = await import('./shopHelper');
afterAll(() => {
  db.closeDb();
  fs.rmSync(dir.path, { recursive: true, force: true });
});
beforeEach(() => {
  db.clearAllForTests();
  tt.calls.length = 0;
  tt.advertisers = [{ advertiser_id: 'A1', advertiser_name: 'TK 1', currency: 'VND' }];
  tt.stores = { A1: [{ store_id: 'S1', store_name: 'Shop 1', exclusive_authorized_advertiser_info: { advertiser_id: 'A1' } }] };
});

describe('tự chọn tài khoản sau khi kết nối', () => {
  it('đúng 1 tài khoản có 1 shop → tự chọn', async () => {
    await withShop(makeShop('s1'), async () => {
      expect(await accounts.autoSelectAccount()).toMatchObject({ advertiserId: 'A1', storeId: 'S1', storeName: 'Shop 1', currency: 'VND' });
      expect(link.getAccount()).toMatchObject({ advertiserId: 'A1', storeId: 'S1' });
    });
  });

  it('nhiều cặp có quyền độc quyền → chưa chọn (chờ chủ shop chọn); tài khoản đang chọn vẫn còn quyền → giữ', async () => {
    tt.advertisers.push({ advertiser_id: 'A2', advertiser_name: 'TK 2' });
    tt.stores.A2 = [{ store_id: 'S2', store_name: 'Shop 2', exclusive_authorized_advertiser_info: { advertiser_id: 'A2' } }];
    await withShop(makeShop('s1'), async () => {
      expect(await accounts.autoSelectAccount()).toBeNull();
      expect(link.getAccount()).toBeNull();
      link.setAccount({ advertiserId: 'A2', advertiserName: null, storeId: 'S2', storeName: null, currency: 'VND' });
      expect(await accounts.autoSelectAccount()).toMatchObject({ advertiserId: 'A2', storeId: 'S2', advertiserName: 'TK 2' });
    });
  });

  it('nhiều cặp nhưng đúng 1 cặp có quyền GMV Max độc quyền → tự chọn cặp đó; 2 cặp độc quyền → chờ chọn', async () => {
    // Cùng Business Center: shop S1 hiện dưới cả A1 và A2, nhưng chỉ cấp quyền độc quyền cho A1
    tt.advertisers.push({ advertiser_id: 'A2', advertiser_name: 'TK 2' });
    tt.stores.A2 = [{ store_id: 'S1', store_name: 'Shop 1', exclusive_authorized_advertiser_info: { advertiser_id: 'A1' } }];
    await withShop(makeShop('s1'), async () => {
      expect(await accounts.autoSelectAccount()).toMatchObject({ advertiserId: 'A1', storeId: 'S1' });
    });
    tt.stores.A2.push({ store_id: 'S2', store_name: 'Shop 2', exclusive_authorized_advertiser_info: { advertiser_id: 'A2' } });
    await withShop(makeShop('s2'), async () => {
      expect(await accounts.autoSelectAccount()).toBeNull();
    });
  });

  it('chủ shop chọn: chỉ nhận cặp (tài khoản, shop) TikTok cho phép', async () => {
    await withShop(makeShop('s1'), async () => {
      expect(await accounts.chooseAccount('A1', 'S9')).toBeNull();
      expect(await accounts.chooseAccount('A9', 'S1')).toBeNull();
      expect(link.getAccount()).toBeNull();
      expect(await accounts.chooseAccount('A1', 'S1')).toMatchObject({ advertiserId: 'A1' });
    });
  });

  it('đổi sang tài khoản khác → đề xuất đang chờ thành "không còn khớp" + Agent tạm dừng; chọn lại đúng tài khoản cũ → không đổi gì', async () => {
    tt.advertisers.push({ advertiser_id: 'A2', advertiser_name: 'TK 2' });
    tt.stores.A2 = [{ store_id: 'S2', store_name: 'Shop 2' }];
    await withShop(makeShop('s1'), async () => {
      await accounts.chooseAccount('A1', 'S1');
      store.saveAgentConfig({ paused: false });
      store.updateRuntime((rt) => void rt.proposals.unshift({ id: 'p1', status: 'pending', createdAt: '2026-11-23T00:00:00Z' } as never));

      await accounts.chooseAccount('A1', 'S1');
      expect(store.getRuntime().proposals[0].status).toBe('pending');
      expect(store.getAgentConfig().paused).toBe(false);

      await accounts.chooseAccount('A2', 'S2');
      expect(store.getRuntime().proposals[0]).toMatchObject({ status: 'outdated', note: 'Đã đổi tài khoản quảng cáo' });
      expect(store.getAgentConfig().paused).toBe(true);
    });
  });

  it('không đọc được danh sách → giữ nguyên tài khoản đang chọn', async () => {
    await withShop(makeShop('s1'), async () => {
      link.setAccount({ advertiserId: 'A1', advertiserName: null, storeId: 'S1', storeName: null, currency: 'VND' });
      tt.advertisers = null as never; // TikTok trả lạ → lỗi
      expect(await accounts.autoSelectAccount()).toMatchObject({ advertiserId: 'A1' });
    });
  });
});

describe('token + tài khoản theo shop', () => {
  it('token shop A không đọc được ở shop B; ngắt kết nối shop B không đụng shop A', () => {
    withShop(makeShop('sa'), () => tAuth.saveToken({ client_id: 'c', access_token: 'token-A' }));
    withShop(makeShop('sb'), () => {
      expect(tAuth.readToken()).toBeNull();
      tAuth.saveToken({ client_id: 'c', access_token: 'token-B' });
      tAuth.deleteToken();
      expect(tAuth.readToken()).toBeNull();
    });
    expect(withShop('sa', () => tAuth.readToken()?.access_token)).toBe('token-A');
    // không lưu bản rõ trong database
    expect(JSON.stringify(db.getDb().prepare('SELECT * FROM tiktok_links').all())).not.toContain('token-A');
  });

  it('chưa chọn tài khoản → requireAccount báo cần chọn (không gọi TikTok bằng tài khoản khác)', () => {
    withShop(makeShop('sa'), () => {
      expect(() => link.requireAccount()).toThrow(link.TikTokAccountRequired);
    });
  });
});
