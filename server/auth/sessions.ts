import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Phiên đăng nhập: server-data/sessions.json chỉ lưu SHA-256 của token (lộ file cũng không đăng nhập được).
 * Token gửi cho trình duyệt qua cookie HttpOnly. Hết hạn trượt: không dùng quá SESSION_TTL_MS thì hết.
 */

export const SESSION_TTL_MS = 30 * 24 * 3_600_000;
/** Gia hạn (ghi file) tối đa 1 lần / ngần này, tránh ghi file mỗi request */
const TOUCH_EVERY_MS = 10 * 60_000;
export const COOKIE_NAME = 'sid';

interface StoredSession {
  idHash: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent?: string;
}

const sessionsFile = () => path.join(config.dataDir, 'sessions.json');
const sha = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

function read(): StoredSession[] {
  try {
    const list = JSON.parse(fs.readFileSync(sessionsFile(), 'utf8')) as StoredSession[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: StoredSession[]) {
  const p = sessionsFile();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, p);
}

const alive = (s: StoredSession, now: number) => now - Date.parse(s.lastSeenAt) < SESSION_TTL_MS;

/** Tạo phiên → token (chỉ trả 1 lần, để đặt cookie) */
export function createSession(userId: string, userAgent?: string, now = Date.now()): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const iso = new Date(now).toISOString();
  write([...read().filter((s) => alive(s, now)), { idHash: sha(token), userId, createdAt: iso, lastSeenAt: iso, userAgent: userAgent?.slice(0, 200) }]);
  return token;
}

/** Token → userId (và gia hạn); hết hạn / không có → null */
export function resolveSession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const list = read();
  const idHash = sha(token);
  const s = list.find((x) => x.idHash === idHash);
  if (!s || !alive(s, now)) return null;
  if (now - Date.parse(s.lastSeenAt) > TOUCH_EVERY_MS) {
    s.lastSeenAt = new Date(now).toISOString();
    write(list.filter((x) => alive(x, now)));
  }
  return s.userId;
}

export function destroySession(token: string | undefined) {
  if (!token) return;
  const idHash = sha(token);
  write(read().filter((s) => s.idHash !== idHash));
}

/** Xoá mọi phiên của người dùng (trừ phiên đang dùng nếu truyền `keepToken`) — khi đổi mật khẩu / khoá tài khoản */
export function destroyUserSessions(userId: string, keepToken?: string) {
  const keep = keepToken ? sha(keepToken) : null;
  write(read().filter((s) => s.userId !== userId || s.idHash === keep));
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
