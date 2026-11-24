import type { NextFunction, Request, Response } from 'express';
import { can, type ActorRef, type Permission, type PublicUser } from '../../shared/permissions.js';
import { readCookie, resolveSession, sessionShopId } from './sessions.js';
import { withShop } from '../shopContext.js';
import { userCanAccessShop } from '../shops.js';
import { findUserById, publicUser } from './users.js';

/* Kiểm tra đăng nhập + quyền — MỌI route cần quyền đi qua đây (1 chỗ duy nhất) */

declare module 'express-serve-static-core' {
  interface Request {
    user?: PublicUser;
    /** Shop đang mở (đã kiểm tra quyền) — chỉ có sau requireShop */
    shopId?: string;
  }
}

export const PERMISSION_TEXT: Record<Permission, string> = {
  view: 'xem số liệu',
  execute: 'chạy thao tác trên TikTok',
  configure: 'sửa thiết lập / quy tắc',
  manage_users: 'quản lý tài khoản',
  finance: 'dùng mục Tài chính',
};

/** Phải đăng nhập (cookie phiên hợp lệ + tài khoản đang hoạt động) */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = resolveSession(readCookie(req.get('cookie')));
  const user = userId ? findUserById(userId) : null;
  if (!user || user.disabled) {
    res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Cần đăng nhập' });
    return;
  }
  req.user = publicUser(user);
  next();
}

/**
 * Mục theo shop (ADS, Agent, theo dõi, kết nối TikTok): lấy shop đang mở trong phiên, kiểm tra shop thuộc tài khoản
 * của người đang đăng nhập rồi chạy phần còn lại TRONG shop đó (currentShopId). Không tin shop do web gửi lên.
 */
export function requireShop(req: Request, res: Response, next: NextFunction) {
  const shopId = sessionShopId(readCookie(req.get('cookie')));
  if (!shopId || !req.user || !userCanAccessShop(req.user.id, shopId)) {
    res.status(409).json({ code: 'SHOP_REQUIRED', error: 'Chưa có shop — tạo hoặc chọn shop để dùng mục này' });
    return;
  }
  req.shopId = shopId;
  withShop(shopId, () => next());
}

/** Route cần quyền `p` (đặt sau requireAuth). Gắn cờ để test kiểm tra mọi route ghi đều có quyền. */
export function requirePermission(p: Permission) {
  const mw = (req: Request, res: Response, next: NextFunction) => {
    if (!can(req.user?.role, p)) {
      res.status(403).json({ code: 'FORBIDDEN', error: `Tài khoản không có quyền ${PERMISSION_TEXT[p]}` });
      return;
    }
    next();
  };
  return Object.assign(mw, { permission: p });
}

/** Người bấm để ghi Nhật ký */
export const actorOf = (req: Request): ActorRef | undefined => (req.user ? { id: req.user.id, name: req.user.name } : undefined);

/* ───────── Chống dò mật khẩu: sai MAX_FAILS lần (theo IP + tên) → khoá LOCK_MS ───────── */

export const MAX_FAILS = 5;
export const LOCK_MS = 15 * 60_000;
const fails = new Map<string, { count: number; until: number }>();

const keyOf = (ip: string, username: string) => `${ip}|${username.trim().toLowerCase()}`;

/** Còn bị khoá bao lâu (ms); 0 = không khoá */
export function lockedFor(ip: string, username: string, now = Date.now()): number {
  const f = fails.get(keyOf(ip, username));
  return f && f.until > now ? f.until - now : 0;
}

export function recordFail(ip: string, username: string, now = Date.now()) {
  const k = keyOf(ip, username);
  const f = fails.get(k);
  const count = (f && f.until <= now && f.count >= MAX_FAILS ? 0 : (f?.count ?? 0)) + 1;
  fails.set(k, { count, until: count >= MAX_FAILS ? now + LOCK_MS : 0 });
}

export function clearFails(ip: string, username: string) {
  fails.delete(keyOf(ip, username));
}

/** Chỉ dùng trong test */
export function resetLoginLimits() {
  fails.clear();
}
