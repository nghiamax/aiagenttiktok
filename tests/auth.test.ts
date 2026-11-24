import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can, ROLE_PERMISSIONS } from '../shared/permissions';

/* Đăng nhập web: mật khẩu, phiên, chống dò, kiểm tra quyền — dữ liệu ở thư mục tạm, không đụng server-data thật */
const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'auth-'));
  return {
    config: {
      dataDir: dir.path,
      secretsDir: dir.path,
      cookieSecure: false,
      root: process.cwd(),
      allowedOrigins: [],
      tiktok: { mcpUrl: 'https://example.invalid/mcp', advertiserId: 'adv', storeId: 'store', advertiserName: 'shop', currency: 'VND' },
    },
  };
});

const db = await import('../server/db/index');
const users = await import('../server/auth/users');
const sessions = await import('../server/auth/sessions');
const mw = await import('../server/auth/middleware');

function fakeRes() {
  const res = { statusCode: 200, body: null as unknown, status(c: number) { res.statusCode = c; return res; }, json(b: unknown) { res.body = b; return res; } };
  return res;
}
const fakeReq = (cookie?: string) => ({ get: (h: string) => (h.toLowerCase() === 'cookie' ? cookie : undefined) }) as unknown as Request;

function run(handler: (req: Request, res: Response, next: NextFunction) => void, req: Request) {
  const res = fakeRes();
  let nexted = false;
  handler(req, res as unknown as Response, () => {
    nexted = true;
  });
  return { res, nexted };
}

beforeEach(() => {
  db.clearAllForTests();
  mw.resetLoginLimits();
});

describe('Tài khoản + mật khẩu', () => {
  it('băm scrypt, không lưu mật khẩu rõ; đúng / sai mật khẩu; tên không phân biệt hoa thường', () => {
    const u = users.createUser({ username: 'Sep', password: 'matkhau123' });
    const raw = JSON.stringify(db.getDb().prepare('SELECT * FROM users').all());
    expect(raw).not.toContain('matkhau123');
    expect(u.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(users.verifyLogin('sep', 'matkhau123')?.id).toBe(u.id);
    expect(users.verifyLogin('SEP', 'sai-mat-khau')).toBeNull();
    expect(users.verifyLogin('khong-co', 'matkhau123')).toBeNull();
  });

  it('mật khẩu ngắn / tên trùng / tên sai dạng → lỗi; tài khoản khoá → không đăng nhập được', () => {
    expect(() => users.createUser({ username: 'sep', password: 'ngan' })).toThrow(/ít nhất 8/);
    const u = users.createUser({ username: 'sep', password: 'matkhau123' });
    expect(() => users.createUser({ username: 'SEP', password: 'matkhau123' })).toThrow(/đã có/);
    expect(() => users.createUser({ username: 'a b', password: 'matkhau123' })).toThrow(/Tên đăng nhập/);
    users.setDisabled(u.id, true);
    expect(users.verifyLogin('sep', 'matkhau123')).toBeNull();
  });
});

describe('Phiên đăng nhập', () => {
  it('chỉ lưu hash token; hết hạn sau 30 ngày không dùng; đăng xuất xoá phiên', () => {
    const u = users.createUser({ username: 'sep', password: 'matkhau123' });
    const now = Date.parse('2026-11-21T00:00:00Z');
    const token = sessions.createSession(u.id, 'test', now);
    expect(JSON.stringify(db.getDb().prepare('SELECT * FROM sessions').all())).not.toContain(token);
    expect(sessions.resolveSession(token, now + 1000)).toBe(u.id);
    expect(sessions.resolveSession(token, now + sessions.SESSION_TTL_MS + 1)).toBeNull();
    const t2 = sessions.createSession(u.id);
    sessions.destroySession(t2);
    expect(sessions.resolveSession(t2)).toBeNull();
  });

  it('đổi mật khẩu → xoá phiên khác, giữ phiên đang dùng', () => {
    const u = users.createUser({ username: 'sep', password: 'matkhau123' });
    const here = sessions.createSession(u.id);
    const other = sessions.createSession(u.id);
    sessions.destroyUserSessions(u.id, here);
    expect(sessions.resolveSession(here)).toBe(u.id);
    expect(sessions.resolveSession(other)).toBeNull();
  });

  it('cookie HttpOnly + SameSite, đọc lại được từ header', () => {
    const c = sessions.sessionCookie('abc');
    expect(c).toMatch(/^sid=abc; HttpOnly; SameSite=Lax; Path=\/; Max-Age=\d+$/);
    expect(sessions.readCookie('foo=1; sid=abc; bar=2')).toBe('abc');
  });
});

describe('requireAuth / requirePermission', () => {
  it('thiếu / sai cookie → 401 AUTH_REQUIRED; đúng → gắn req.user', () => {
    expect(run(mw.requireAuth, fakeReq()).res).toMatchObject({ statusCode: 401, body: { code: 'AUTH_REQUIRED' } });
    expect(run(mw.requireAuth, fakeReq('sid=gia')).res.statusCode).toBe(401);
    const u = users.createUser({ username: 'sep', name: 'Sếp', password: 'matkhau123' });
    const req = fakeReq(`sid=${sessions.createSession(u.id)}`);
    const r = run(mw.requireAuth, req);
    expect(r.nexted).toBe(true);
    expect(req.user).toEqual({ id: u.id, username: 'sep', name: 'Sếp', role: 'owner', plan: 'free', proUntil: null });
  });

  it('tài khoản bị khoá giữa chừng → phiên cũ hết dùng được', () => {
    const u = users.createUser({ username: 'sep', password: 'matkhau123' });
    const token = sessions.createSession(u.id);
    users.setDisabled(u.id, true);
    expect(run(mw.requireAuth, fakeReq(`sid=${token}`)).res.statusCode).toBe(401);
  });

  it('nhân viên gọi thao tác chạy thật / sửa thiết lập → 403; chủ shop → qua', () => {
    const staff = { user: { id: '1', username: 'nv', name: 'NV', role: 'staff' } } as unknown as Request;
    const owner = { user: { id: '2', username: 'sep', name: 'Sếp', role: 'owner' } } as unknown as Request;
    expect(run(mw.requirePermission('execute'), staff).res).toMatchObject({ statusCode: 403, body: { code: 'FORBIDDEN' } });
    expect(run(mw.requirePermission('configure'), staff).res.statusCode).toBe(403);
    expect(run(mw.requirePermission('view'), staff).nexted).toBe(true);
    expect(run(mw.requirePermission('execute'), owner).nexted).toBe(true);
  });

  it('bảng quyền: Quản trị viên có mọi quyền, Người dùng (chủ tài khoản khách) toàn quyền shop của mình, nhân viên chỉ xem', () => {
    expect(ROLE_PERMISSIONS.owner).toEqual(['view', 'execute', 'configure', 'manage_users', 'finance']);
    // Người dùng = chủ tài khoản khách: chạy / cấu hình CHỈ trên shop của mình (requireShop), không quản lý tài khoản người khác
    expect(ROLE_PERMISSIONS.user).toEqual(['view', 'execute', 'configure', 'finance']);
    expect(can('staff', 'view')).toBe(true);
    expect(can('staff', 'execute')).toBe(false);
    expect(can(null, 'view')).toBe(false);
  });
});

describe('Chống dò mật khẩu', () => {
  it(`sai ${5} lần → khoá 15 phút; hết khoá thì thử lại được`, () => {
    const now = Date.parse('2026-11-21T00:00:00Z');
    for (let i = 0; i < mw.MAX_FAILS - 1; i++) mw.recordFail('1.1.1.1', 'sep', now);
    expect(mw.lockedFor('1.1.1.1', 'sep', now)).toBe(0);
    mw.recordFail('1.1.1.1', 'sep', now);
    expect(mw.lockedFor('1.1.1.1', 'SEP', now)).toBe(mw.LOCK_MS);
    expect(mw.lockedFor('2.2.2.2', 'sep', now)).toBe(0); // IP khác không bị khoá
    expect(mw.lockedFor('1.1.1.1', 'sep', now + mw.LOCK_MS)).toBe(0);
  });
});

describe('Mọi route đều có kiểm tra quyền', () => {
  it('route ghi (POST/PUT) cần execute hoặc configure; route đọc cần view', async () => {
    const { agentRouter, settingsRouter } = await import('../server/routes/agent');
    const { adsRouter } = await import('../server/routes/ads');
    const { usersRouter } = await import('../server/routes/users');
    const { financeRouter } = await import('../server/routes/finance');
    const permsOf = (router: typeof adsRouter) =>
      (router.stack as { route?: { path: string; stack: { handle: { permission?: string } }[] } }[])
        .filter((l) => l.route)
        .map((l) => l.route!.stack.map((s) => s.handle.permission).find(Boolean));
    // Trang Tài khoản: mọi route cần manage_users · Tài chính: mọi route cần finance
    expect(permsOf(usersRouter).length).toBeGreaterThan(3);
    expect(new Set(permsOf(usersRouter))).toEqual(new Set(['manage_users']));
    expect(new Set(permsOf(financeRouter))).toEqual(new Set(['finance']));
    const { watchlistRouter } = await import('../server/routes/watchlist');
    const routes = [agentRouter, settingsRouter, adsRouter, watchlistRouter].flatMap((r) =>
      (r.stack as { route?: { path: string; methods: Record<string, boolean>; stack: { handle: { permission?: string } }[] } }[])
        .filter((l) => l.route)
        .map((l) => ({
          path: l.route!.path,
          write: !l.route!.methods.get,
          perm: l.route!.stack.map((s) => s.handle.permission).find(Boolean),
        })),
    );
    expect(routes.length).toBeGreaterThan(10);
    for (const r of routes) {
      if (r.write) expect(['execute', 'configure'], r.path).toContain(r.perm);
      else expect(r.perm, r.path).toBe('view');
    }
    // Thao tác chạy thật trên TikTok cần quyền execute
    for (const p of ['/proposals/:id/approve', '/actions/manual', '/actions/:id/undo']) {
      expect(routes.find((r) => r.path === p)?.perm).toBe('execute');
    }
  });

  it('mục theo shop đều đi qua requireShop; /api/shops có kiểm tra quyền ở mọi route', async () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'server', 'index.ts'), 'utf8');
    for (const m of ['ads', 'tiktok', 'settings', 'agent', 'watchlist']) {
      expect(src.includes(`app.use('/api/${m}', requireShop, `), m).toBe(true);
    }
    const { shopsRouter } = await import('../server/routes/shops');
    const perms = (shopsRouter.stack as { route?: { stack: { handle: { permission?: string } }[] } }[])
      .filter((l) => l.route)
      .map((l) => l.route!.stack.map((x) => x.handle.permission).find(Boolean));
    expect(perms.length).toBe(3);
    expect(perms.every(Boolean)).toBe(true);
  });
});

// Thư mục tạm dọn sau khi chạy
process.on('exit', () => db.closeDb());
process.on('exit', () => fs.rmSync(dir.path || path.join(os.tmpdir(), 'none'), { recursive: true, force: true }));
