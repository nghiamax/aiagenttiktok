import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isRole, MIN_PASSWORD_LENGTH, type PublicUser, type Role } from '../../shared/permissions.js';
import { isPlan, type Plan } from '../../shared/plans.js';
import { config } from '../config.js';

/**
 * Tài khoản web: server-data/users.json (không commit). Mật khẩu băm scrypt + muối riêng, không lưu bản rõ.
 * Dạng danh sách để sau này thêm nhân viên; tạo / đổi mật khẩu bằng `npm run user`.
 */

export interface StoredUser extends Omit<PublicUser, 'plan' | 'proUntil'> {
  /** Thiếu ở tài khoản tạo trước khi có gói = Miễn phí */
  plan?: Plan;
  proUntil?: string | null;
  /** "scrypt$N$r$p$saltB64$hashB64" */
  passwordHash: string;
  disabled: boolean;
  createdAt: string;
  passwordChangedAt: string;
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const usersFile = () => path.join(config.dataDir, 'users.json');

export class UserError extends Error {}

function readUsers(): StoredUser[] {
  try {
    const list = JSON.parse(fs.readFileSync(usersFile(), 'utf8')) as StoredUser[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeUsers(list: StoredUser[]) {
  const p = usersFile();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, p);
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
  return readUsers();
}

export function hasUsers(): boolean {
  return readUsers().length > 0;
}

export function findUserById(id: string): StoredUser | null {
  return readUsers().find((u) => u.id === id) ?? null;
}

export function findUser(username: string): StoredUser | null {
  return readUsers().find((u) => u.username === norm(username)) ?? null;
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
  const list = readUsers();
  if (list.some((u) => u.username === username)) throw new UserError('Tên đăng nhập đã có');
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: crypto.randomUUID(),
    username,
    name: input.name?.trim() || username,
    role,
    plan,
    proUntil: plan === 'pro' ? (input.proUntil ?? null) : null,
    passwordHash: hashPassword(input.password),
    disabled: false,
    createdAt: now,
    passwordChangedAt: now,
  };
  writeUsers([...list, user]);
  return user;
}

function updateUser(id: string, fn: (u: StoredUser) => void): StoredUser {
  const list = readUsers();
  const u = list.find((x) => x.id === id);
  if (!u) throw new UserError('Không tìm thấy tài khoản');
  fn(u);
  writeUsers(list);
  return u;
}

export function setPassword(id: string, password: string): StoredUser {
  validatePassword(password);
  return updateUser(id, (u) => {
    u.passwordHash = hashPassword(password);
    u.passwordChangedAt = new Date().toISOString();
  });
}

export function setDisabled(id: string, disabled: boolean): StoredUser {
  return updateUser(id, (u) => {
    u.disabled = disabled;
  });
}

/** Đổi gói: Pro kèm hạn (null = không hạn); Miễn phí xoá hạn */
export function setPlan(id: string, plan: Plan, proUntil: string | null = null): StoredUser {
  if (!isPlan(plan)) throw new UserError('Gói không hợp lệ');
  if (proUntil && Number.isNaN(Date.parse(proUntil))) throw new UserError('Hạn gói không hợp lệ');
  return updateUser(id, (u) => {
    u.plan = plan;
    u.proUntil = plan === 'pro' ? proUntil : null;
  });
}

export function setRole(id: string, role: Role): StoredUser {
  if (!isRole(role)) throw new UserError('Vai trò không hợp lệ');
  return updateUser(id, (u) => {
    u.role = role;
  });
}

export function setName(id: string, name: string): StoredUser {
  const n = name.trim();
  if (!n) throw new UserError('Nhập tên hiển thị');
  return updateUser(id, (u) => {
    u.name = n.slice(0, 60);
  });
}

/** Xoá hẳn tài khoản khỏi users.json (phiên + số lượt do nơi gọi dọn) */
export function deleteUser(id: string): StoredUser {
  const list = readUsers();
  const u = list.find((x) => x.id === id);
  if (!u) throw new UserError('Không tìm thấy tài khoản');
  writeUsers(list.filter((x) => x.id !== id));
  return u;
}
