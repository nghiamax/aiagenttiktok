import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db/index.js';

/**
 * Phiên đăng nhập: bảng sessions (database) chỉ lưu SHA-256 của token (lộ file cũng không đăng nhập được).
 * Token gửi cho trình duyệt qua cookie HttpOnly. Hết hạn trượt: không dùng quá SESSION_TTL_MS thì hết.
 */

export const SESSION_TTL_MS = 30 * 24 * 3_600_000;
/** Gia hạn (ghi file) tối đa 1 lần / ngần này, tránh ghi file mỗi request */
const TOUCH_EVERY_MS = 10 * 60_000;
export const COOKIE_NAME = 'sid';

const sha = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

interface SessionRow {
  user_id: string;
  expires_at: string;
}

/** Shop mở sẵn khi đăng nhập: shop tạo sớm nhất của tài khoản chứa người này */
function defaultShopOf(userId: string): string | null {
  const r = getDb()
    .prepare('SELECT s.id FROM shops s JOIN users u ON u.account_id = s.account_id WHERE u.id = ? ORDER BY s.created_at LIMIT 1')
    .get(userId) as { id: string } | undefined;
  return r?.id ?? null;
}

/** Tạo phiên → token (chỉ trả 1 lần, để đặt cookie). Bảng sessions chỉ lưu SHA-256 của token. */
export function createSession(userId: string, _userAgent?: string, now = Date.now()): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date(now).toISOString());
  db.prepare('INSERT INTO sessions (token_hash, user_id, shop_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(
    sha(token),
    userId,
    defaultShopOf(userId),
    new Date(now).toISOString(),
    new Date(now + SESSION_TTL_MS).toISOString(),
  );
  return token;
}

/** Token → userId (và gia hạn trượt); hết hạn / không có → null */
export function resolveSession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const db = getDb();
  const idHash = sha(token);
  const s = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(idHash) as SessionRow | undefined;
  if (!s) return null;
  const expires = Date.parse(s.expires_at);
  if (expires <= now) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(idHash);
    return null;
  }
  // Gia hạn tối đa 1 lần / TOUCH_EVERY_MS (đỡ ghi DB mỗi request)
  if (now + SESSION_TTL_MS - expires > TOUCH_EVERY_MS) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(new Date(now + SESSION_TTL_MS).toISOString(), idHash);
  }
  return s.user_id;
}

export function destroySession(token: string | undefined) {
  if (!token) return;
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

/** Xoá mọi phiên của người dùng (trừ phiên đang dùng nếu truyền `keepToken`) — khi đổi mật khẩu / khoá tài khoản */
export function destroyUserSessions(userId: string, keepToken?: string) {
  getDb()
    .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
    .run(userId, keepToken ? sha(keepToken) : '');
}

/* ───────── Cookie ───────── */

export function readCookie(header: string | undefined, name = COOKIE_NAME): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** Bật Secure khi chạy sau HTTPS (COOKIE_SECURE=1) */
export function sessionCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ...(config.cookieSecure ? ['Secure'] : []),
  ].join('; ');
}

export function clearCookie(): string {
  return [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0', ...(config.cookieSecure ? ['Secure'] : [])].join('; ');
}

/* ───────── Shop đang mở trong phiên ───────── */

export function sessionShopId(token: string | undefined): string | null {
  if (!token) return null;
  const r = getDb().prepare('SELECT shop_id FROM sessions WHERE token_hash = ?').get(sha(token)) as { shop_id: string | null } | undefined;
  return r?.shop_id ?? null;
}

/** Đổi shop đang mở (nơi gọi đã kiểm tra quyền) */
export function setSessionShop(token: string, shopId: string | null) {
  getDb().prepare('UPDATE sessions SET shop_id = ? WHERE token_hash = ?').run(shopId, sha(token));
}
