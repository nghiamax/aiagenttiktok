import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/* Tách dữ liệu giữa các khách / shop: thiết lập, Agent, đề xuất, nhật ký theo shop; requireShop chặn shop người khác */
const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'iso-'));
  return { config: { dataDir: dir.path, secretsDir: dir.path, cookieSecure: false, root: process.cwd() } };
});
const db = await import('../server/db/index');
const store = await import('../server/store');
const users = await import('../server/auth/users');
const sessions = await import('../server/auth/sessions');
const mw = await import('../server/auth/middleware');
const { withShop, currentShopId } = await import('../server/shopContext');
afterAll(() => {
  db.closeDb();
  fs.rmSync(dir.path, { recursive: true, force: true });
});
beforeEach(() => db.clearAllForTests());

/** Tạo khách (Người dùng) + 1 shop của khách đó → { user, shopId, token } (phiên đang mở shop đó) */
function customerWithShop(username: string) {
  const user = users.createUser({ username, role: 'user', password: 'matkhau123' });
  const shopId = `shop-${username}`;
  db.getDb().prepare('INSERT INTO shops (id, account_id, name, created_at) VALUES (?, ?, ?, ?)').run(shopId, user.accountId, username, new Date().toISOString());
  const token = sessions.createSession(user.id);
  return { user, shopId, token };
}

function runShop(token: string, user: ReturnType<typeof users.publicUser>) {
  const req = { get: (h: string) => (h.toLowerCase() === 'cookie' ? `sid=${token}` : undefined), user } as unknown as Request;
  const res = { statusCode: 200, body: null as unknown, status(c: number) { res.statusCode = c; return res; }, json(b: unknown) { res.body = b; return res; } };
  let inside: string | null = null;
  mw.requireShop(req, res as unknown as Response, (() => {
    inside = currentShopId();
  }) as NextFunction);
  return { res, inside, req };
}

describe('dữ liệu theo shop', () => {
  it('thiết lập, quy tắc, đề xuất, nhật ký của shop A không lẫn sang shop B', () => {
    const a = customerWithShop('khacha');
    const b = customerWithShop('khachb');
    withShop(a.shopId, () => {
      store.saveSettings({ ...store.getSettings(), breakEvenRoi: { p1: 3 } });
      store.saveAgentConfig({ paused: true });
      store.updateRuntime((rt) => {
        rt.proposals.unshift({ id: 'pA', status: 'pending', createdAt: '2026-11-23T00:00:00Z' } as never);
        rt.actions.unshift({ id: 'aA', status: 'success', executedAt: '2026-11-23T00:00:00Z' } as never);
      });
    });
    withShop(b.shopId, () => {
      expect(store.getSettings().breakEvenRoi).toEqual({});
      expect(store.settingsStored()).toBe(false);
      expect(store.getAgentConfig().paused).not.toBe(true);
      expect(store.getRuntime()).toMatchObject({ proposals: [], actions: [] });
    });
    withShop(a.shopId, () => {
      expect(store.getSettings().breakEvenRoi).toEqual({ p1: 3 });
      expect(store.getRuntime().proposals.map((p) => p.id)).toEqual(['pA']);
    });
  });

  it('giữ đúng thứ tự danh sách (mới nhất đầu) qua nhiều lần ghi', () => {
    const a = customerWithShop('khacha');
    withShop(a.shopId, () => {
      for (const id of ['p1', 'p2', 'p3']) store.updateRuntime((rt) => void rt.proposals.unshift({ id, status: 'pending', createdAt: '2026-11-23T00:00:00Z' } as never));
      store.updateRuntime((rt) => void (rt.proposals = rt.proposals.slice(0, 2)));
      expect(store.getRuntime().proposals.map((p) => p.id)).toEqual(['p3', 'p2']);
    });
  });

  it('ngoài shop (không có currentShopId) → lỗi, không rơi về shop nào', () => {
    customerWithShop('khacha');
    expect(() => store.getSettings()).toThrow('Chưa chọn shop');
    expect(() => store.updateRuntime(() => undefined)).toThrow('Chưa chọn shop');
  });
});

describe('requireShop', () => {
  it('phiên mở đúng shop của mình → chạy trong shop đó; khách chưa có shop → 409 SHOP_REQUIRED', () => {
    const a = customerWithShop('khacha');
    const ok = runShop(a.token, users.publicUser(a.user));
    expect(ok.inside).toBe(a.shopId);
    expect(ok.req.shopId).toBe(a.shopId);

    const lone = users.createUser({ username: 'khachmoi', role: 'user', password: 'matkhau123' });
    const t = sessions.createSession(lone.id);
    const r = runShop(t, users.publicUser(lone));
    expect(r.inside).toBeNull();
    expect(r.res).toMatchObject({ statusCode: 409, body: { code: 'SHOP_REQUIRED' } });
  });

  it('phiên bị đặt sang shop của khách khác (vd sửa DB / lỗi) → 409, không vào được', () => {
    const a = customerWithShop('khacha');
    const b = customerWithShop('khachb');
    sessions.setSessionShop(a.token, b.shopId);
    const r = runShop(a.token, users.publicUser(a.user));
    expect(r.inside).toBeNull();
    expect(r.res.statusCode).toBe(409);
  });

  it('tài khoản bị khoá → không vào shop', () => {
    const a = customerWithShop('khacha');
    users.setDisabled(a.user.id, true);
    expect(runShop(a.token, users.publicUser(a.user)).inside).toBeNull();
  });
});

describe('Thêm tài khoản quảng cáo (POST /api/shops)', () => {
  async function post(token: string, user: ReturnType<typeof users.publicUser>) {
    const { shopsRouter } = await import('../server/routes/shops');
    const layer = (shopsRouter.stack as { route?: { path: string; methods: Record<string, boolean>; stack: { handle: (...a: unknown[]) => unknown }[] } }[]).find(
      (l) => l.route?.path === '/' && l.route.methods.post,
    )!;
    const handler = layer.route!.stack[layer.route!.stack.length - 1].handle;
    const res = { statusCode: 200, body: null as unknown, status(c: number) { res.statusCode = c; return res; }, json(b: unknown) { res.body = b; return res; } };
    handler({ body: {}, user, get: (h: string) => (h.toLowerCase() === 'cookie' ? `sid=${token}` : undefined) }, res, () => {});
    return res.body as { currentShopId: string; shops: { id: string; name: string }[] };
  }

  it('không cần tên (tên tạm), mở luôn shop mới; bấm lại khi shop đó chưa kết nối → dùng lại, không tạo thêm', async () => {
    const lone = users.createUser({ username: 'khachmoi', role: 'user', password: 'matkhau123' });
    const t = sessions.createSession(lone.id);
    const first = await post(t, users.publicUser(lone));
    expect(first.shops).toHaveLength(1);
    expect(first.shops[0].name).toBe('Tài khoản quảng cáo mới');
    expect(sessions.sessionShopId(t)).toBe(first.currentShopId);
    const again = await post(t, users.publicUser(lone));
    expect(again.shops).toHaveLength(1);
    expect(again.currentShopId).toBe(first.currentShopId);
  });
});
