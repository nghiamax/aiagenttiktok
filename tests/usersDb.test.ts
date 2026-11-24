import fs from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/* Người dùng trong database: vai trò ↔ tài khoản khách, gói theo tài khoản, phiên mở sẵn shop của tài khoản */
const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'usersdb-'));
  return { config: { dataDir: dir.path, secretsDir: dir.path, cookieSecure: false } };
});
const db = await import('../server/db/index');
const users = await import('../server/auth/users');
const sessions = await import('../server/auth/sessions');
afterAll(() => {
  db.closeDb();
  fs.rmSync(dir.path, { recursive: true, force: true });
});
beforeEach(() => db.clearAllForTests());

describe('users (database)', () => {
  it('Quản trị viên đầu tiên tạo tài khoản chính + 1 shop; Nhân viên vào tài khoản chính; Người dùng có tài khoản riêng, không có shop', () => {
    const sep = users.createUser({ username: 'sep', password: 'matkhau123' });
    const nv = users.createUser({ username: 'nhanvien', role: 'staff', password: 'matkhau123' });
    const khach = users.createUser({ username: 'khach', role: 'user', plan: 'pro', proUntil: '2027-01-01T00:00:00Z', password: 'matkhau123' });
    expect(sep.role).toBe('owner');
    expect(nv).toMatchObject({ role: 'staff', accountId: sep.accountId });
    expect(khach).toMatchObject({ role: 'user', plan: 'pro', proUntil: '2027-01-01T00:00:00Z' });
    expect(khach.accountId).not.toBe(sep.accountId);
    const shops = db.getDb().prepare('SELECT account_id FROM shops').all() as { account_id: string }[];
    expect(shops).toEqual([{ account_id: sep.accountId }]);
  });

  it('gói lưu ở tài khoản: đổi gói khách A không ảnh hưởng khách B', () => {
    users.createUser({ username: 'sep', password: 'matkhau123' });
    const a = users.createUser({ username: 'khacha', role: 'user', password: 'matkhau123' });
    const b = users.createUser({ username: 'khachb', role: 'user', password: 'matkhau123' });
    users.setPlan(a.id, 'pro', null);
    expect(users.findUserById(a.id)?.plan).toBe('pro');
    expect(users.findUserById(b.id)?.plan).toBe('free');
  });

  it('đổi vai trò: Người dùng → Nhân viên chuyển vào tài khoản chính; Nhân viên → Người dùng tách tài khoản riêng', () => {
    const sep = users.createUser({ username: 'sep', password: 'matkhau123' });
    const u = users.createUser({ username: 'khach', role: 'user', password: 'matkhau123' });
    expect(users.setRole(u.id, 'staff')).toMatchObject({ role: 'staff', accountId: sep.accountId });
    const back = users.setRole(u.id, 'user');
    expect(back.role).toBe('user');
    expect(back.accountId).not.toBe(sep.accountId);
  });

  it('xoá khách → xoá luôn tài khoản khách (không còn ai, không có shop); phiên của người đó mất', () => {
    users.createUser({ username: 'sep', password: 'matkhau123' });
    const k = users.createUser({ username: 'khach', role: 'user', password: 'matkhau123' });
    const token = sessions.createSession(k.id);
    users.deleteUser(k.id);
    expect(sessions.resolveSession(token)).toBeNull();
    expect(db.getDb().prepare('SELECT count(*) n FROM accounts WHERE id = ?').get(k.accountId!)).toMatchObject({ n: 0 });
  });

  it('phiên mới mở sẵn shop của tài khoản (khách chưa có shop → null); đổi mật khẩu đăng xuất nơi khác', () => {
    const sep = users.createUser({ username: 'sep', password: 'matkhau123' });
    const k = users.createUser({ username: 'khach', role: 'user', password: 'matkhau123' });
    const t1 = sessions.createSession(sep.id);
    const t2 = sessions.createSession(sep.id);
    sessions.createSession(k.id);
    const rows = db.getDb().prepare('SELECT user_id, shop_id FROM sessions').all() as { user_id: string; shop_id: string | null }[];
    const shop = (db.getDb().prepare('SELECT id FROM shops').get() as { id: string }).id;
    expect(rows.filter((r) => r.user_id === sep.id).every((r) => r.shop_id === shop)).toBe(true);
    expect(rows.find((r) => r.user_id === k.id)?.shop_id).toBeNull();
    sessions.destroyUserSessions(sep.id, t1);
    expect(sessions.resolveSession(t1)).toBe(sep.id);
    expect(sessions.resolveSession(t2)).toBeNull();
  });
});
