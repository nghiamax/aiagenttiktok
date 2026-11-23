import crypto from 'node:crypto';
import { isRole, MIN_PASSWORD_LENGTH, type PublicUser, type Role } from '../../shared/permissions.js';
import { isPlan, type Plan } from '../../shared/plans.js';
import { getDb, tx } from '../db/index.js';

/**
 * Tài khoản web — bảng `users` (+ `accounts`) trong database (server-data/app.db). Mật khẩu băm scrypt + muối riêng.
 *
 * Vai trò trả ra ngoài (`Role`) giữ như cũ để web / trang Tài khoản không đổi:
 *  - owner = Quản trị viên  → users.is_admin = 1 (Quản trị nền tảng), thuộc tài khoản chính (shop đang chạy)
 *  - staff = Nhân viên      → nhân viên tài khoản chính
 *  - user  = Người dùng     → chủ 1 tài khoản khách riêng; gói / hạn Pro nằm ở tài khoản (accounts.plan / pro_until)
 */

export interface StoredUser extends Omit<PublicUser, 'plan' | 'proUntil'> {
  plan?: Plan;
  proUntil?: string | null;
  /** "scrypt$N$r$p$saltB64$hashB64" */
  passwordHash: string;
  disabled: boolean;
  createdAt: string;
  passwordChangedAt: string;
  /** Tài khoản (khách) chứa người này */
  accountId: string | null;
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export class UserError extends Error {}

interface UserRow {
  id: string;
  account_id: string | null;
  username: string;
  name: string;
  role: string;
  is_admin: number;
  password_hash: string;
  disabled: number;
  created_at: string;
  password_changed_at: string;
  plan: string | null;
  pro_until: string | null;
}

const SELECT = `SELECT u.*, a.plan AS plan, a.pro_until AS pro_until FROM users u LEFT JOIN accounts a ON a.id = u.account_id`;

/** Vai trò cũ (web) từ cột is_admin + vai trò trong tài khoản */
function roleOf(r: Pick<UserRow, 'is_admin' | 'role' | 'account_id'>, main: string | null): Role {
  if (r.is_admin) return 'owner';
  return r.role === 'staff' && r.account_id === main ? 'staff' : 'user';
}

function toUser(r: UserRow, main: string | null): StoredUser {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    role: roleOf(r, main),
    plan: isPlan(r.plan) ? r.plan : 'free',
    proUntil: r.pro_until ?? null,
    passwordHash: r.password_hash,
    disabled: !!r.disabled,
    createdAt: r.created_at,
    passwordChangedAt: r.password_changed_at,
    accountId: r.account_id,
  };
}

/** Tài khoản chính = tài khoản của Quản trị viên đầu tiên (shop đang chạy trước khi có nhiều shop) */
export function mainAccountId(): string | null {
  const r = getDb().prepare('SELECT account_id FROM users WHERE is_admin = 1 AND account_id IS NOT NULL ORDER BY created_at LIMIT 1').get() as
    | { account_id: string }
    | undefined;
  if (r) return r.account_id;
  const a = getDb().prepare('SELECT id FROM accounts ORDER BY created_at LIMIT 1').get() as { id: string } | undefined;
  return a?.id ?? null;
}

const norm = (username: string) => username.trim().toLowerCase();

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export function checkPassword(password: string, stored: string): boolean {
  const [kind, n, r, p, saltB64, hashB64] = stored.split('$');
  if (kind !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

/** Băm giả để thời gian trả lời giống nhau dù tên đăng nhập không tồn tại */
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

export const publicUser = (u: StoredUser): PublicUser => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
  plan: isPlan(u.plan) ? u.plan : 'free',
  proUntil: u.proUntil ?? null,
});

export function listUsers(): StoredUser[] {
  const main = mainAccountId();
  return (getDb().prepare(`${SELECT} ORDER BY u.created_at`).all() as unknown as UserRow[]).map((r) => toUser(r, main));
}

export function hasUsers(): boolean {
  return !!getDb().prepare('SELECT 1 FROM users LIMIT 1').get();
}

export function findUserById(id: string): StoredUser | null {
  const r = getDb().prepare(`${SELECT} WHERE u.id = ?`).get(id) as UserRow | undefined;
  return r ? toUser(r, mainAccountId()) : null;
}

export function findUser(username: string): StoredUser | null {
  const r = getDb().prepare(`${SELECT} WHERE u.username = ?`).get(norm(username)) as UserRow | undefined;
  return r ? toUser(r, mainAccountId()) : null;
}

/** Kiểm đăng nhập → user (đang hoạt động) hoặc null. Luôn chạy scrypt để không lộ tên nào tồn tại. */
export function verifyLogin(username: string, password: string): StoredUser | null {
  const u = findUser(username);
  const ok = checkPassword(password, u?.passwordHash ?? DUMMY_HASH);
  return u && ok && !u.disabled ? u : null;
}

function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new UserError(`Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
}

const newId = () => crypto.randomUUID();

/** Tài khoản chính; chưa có (cài mới) → tạo tài khoản + 1 shop "Shop chính" */
function ensureMainAccount(now: string): string {
  const existing = mainAccountId();
  if (existing) return existing;
  const db = getDb();
  const id = newId();
  db.prepare("INSERT INTO accounts (id, name, plan, pro_until, created_at) VALUES (?, 'Shop chính', 'free', NULL, ?)").run(id, now);
  db.prepare("INSERT INTO shops (id, account_id, name, created_at) VALUES (?, ?, 'Shop chính', ?)").run(newId(), id, now);
  return id;
}

/** Tài khoản khách mới (gói đi theo tài khoản) */
function newCustomerAccount(name: string, plan: Plan, proUntil: string | null, now: string): string {
  const id = newId();
  getDb()
    .prepare('INSERT INTO accounts (id, name, plan, pro_until, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, plan, plan === 'pro' ? proUntil : null, now);
  return id;
}

export function createUser(input: {
  username: string;
  name?: string;
  role?: Role;
  plan?: Plan;
  proUntil?: string | null;
  password: string;
}): StoredUser {
  const username = norm(input.username);
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new UserError('Tên đăng nhập 3–32 ký tự: chữ thường, số, . _ -');
  const role = input.role ?? 'owner';
  if (!isRole(role)) throw new UserError('Vai trò không hợp lệ');
  const plan = input.plan ?? 'free';
  if (!isPlan(plan)) throw new UserError('Gói không hợp lệ');
  validatePassword(input.password);
  const db = getDb();
  const id = newId();
  const name = input.name?.trim() || username;
  tx(db, () => {
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new UserError('Tên đăng nhập đã có');
    const now = new Date().toISOString();
    const accountId = role === 'user' ? newCustomerAccount(name, plan, input.proUntil ?? null, now) : ensureMainAccount(now);
    db.prepare(
      `INSERT INTO users (id, account_id, username, name, role, is_admin, password_hash, disabled, created_at, password_changed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ).run(id, accountId, username, name, role === 'staff' ? 'staff' : 'owner', role === 'owner' ? 1 : 0, hashPassword(input.password), now, now);
  });
  return findUserById(id)!;
}

function mustFind(id: string): StoredUser {
  const u = findUserById(id);
  if (!u) throw new UserError('Không tìm thấy tài khoản');
  return u;
}

export function setPassword(id: string, password: string): StoredUser {
  validatePassword(password);
  mustFind(id);
  getDb().prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(hashPassword(password), new Date().toISOString(), id);
  return mustFind(id);
}

export function setDisabled(id: string, disabled: boolean): StoredUser {
  mustFind(id);
  getDb().prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, id);
  return mustFind(id);
}

/** Đổi gói (của tài khoản chứa người này): Pro kèm hạn (null = không hạn); Miễn phí xoá hạn */
export function setPlan(id: string, plan: Plan, proUntil: string | null = null): StoredUser {
  if (!isPlan(plan)) throw new UserError('Gói không hợp lệ');
  if (proUntil && Number.isNaN(Date.parse(proUntil))) throw new UserError('Hạn gói không hợp lệ');
  const u = mustFind(id);
  if (!u.accountId) throw new UserError('Tài khoản chưa gắn với khách nào');
  getDb().prepare('UPDATE accounts SET plan = ?, pro_until = ? WHERE id = ?').run(plan, plan === 'pro' ? proUntil : null, u.accountId);
  return mustFind(id);
}

/**
 * Đổi vai trò: Quản trị viên / Nhân viên → thuộc tài khoản chính; Người dùng → tách ra tài khoản khách riêng
 * (gói mặc định Miễn phí). Không xoá dữ liệu.
 */
export function setRole(id: string, role: Role): StoredUser {
  if (!isRole(role)) throw new UserError('Vai trò không hợp lệ');
  const u = mustFind(id);
  if (u.role === role) return u;
  const db = getDb();
  tx(db, () => {
    const now = new Date().toISOString();
    if (role === 'user') {
      const acc = newCustomerAccount(u.name, 'free', null, now);
      db.prepare("UPDATE users SET account_id = ?, role = 'owner', is_admin = 0 WHERE id = ?").run(acc, id);
    } else {
      const main = ensureMainAccount(now);
      db.prepare('UPDATE users SET account_id = ?, role = ?, is_admin = ? WHERE id = ?').run(main, role === 'staff' ? 'staff' : 'owner', role === 'owner' ? 1 : 0, id);
    }
  });
  return mustFind(id);
}

export function setName(id: string, name: string): StoredUser {
  const n = name.trim();
  if (!n) throw new UserError('Nhập tên hiển thị');
  mustFind(id);
  getDb().prepare('UPDATE users SET name = ? WHERE id = ?').run(n.slice(0, 60), id);
  return mustFind(id);
}

/** Xoá hẳn người dùng (phiên xoá theo khoá ngoại; số lượt do nơi gọi dọn). Tài khoản khách không còn ai + không có shop → xoá luôn. */
export function deleteUser(id: string): StoredUser {
  const u = mustFind(id);
  const db = getDb();
  tx(db, () => {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (u.accountId && u.accountId !== mainAccountId()) {
      const left = db.prepare('SELECT (SELECT count(*) FROM users WHERE account_id = ?) + (SELECT count(*) FROM shops WHERE account_id = ?) AS n').get(u.accountId, u.accountId) as { n: number };
      if (left.n === 0) db.prepare('DELETE FROM accounts WHERE id = ?').run(u.accountId);
    }
  });
  return u;
}

