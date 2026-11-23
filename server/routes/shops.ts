import crypto from 'node:crypto';
import { Router } from 'express';
import { requirePermission } from '../auth/middleware.js';
import { readCookie, sessionShopId, setSessionShop } from '../auth/sessions.js';
import { findUserById } from '../auth/users.js';
import { getDb } from '../db/index.js';
import { listShopsOf, userCanAccessShop } from '../shops.js';

/** /api/shops — shop của tài khoản đang đăng nhập: danh sách, chọn shop đang mở, tạo shop mới */
export const shopsRouter = Router();

const MAX_NAME = 60;

shopsRouter.get('/', requirePermission('view'), (req, res) => {
  const shops = listShopsOf(req.user!.id);
  const current = sessionShopId(readCookie(req.get('cookie')));
  res.json({ shops, currentShopId: shops.some((s) => s.id === current) ? current : null });
});

/** Đổi shop đang mở — chỉ shop thuộc tài khoản của mình */
shopsRouter.post('/current', requirePermission('view'), (req, res) => {
  const shopId = String(req.body?.shopId ?? '');
  const token = readCookie(req.get('cookie'));
  if (!token || !userCanAccessShop(req.user!.id, shopId)) {
    return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy shop' });
  }
  setSessionShop(token, shopId);
  res.json({ currentShopId: shopId });
});

/** Tạo shop mới trong tài khoản (chưa kết nối TikTok) rồi mở luôn shop đó */
shopsRouter.post('/', requirePermission('configure'), (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, MAX_NAME);
  if (!name) return res.status(400).json({ code: 'BAD_REQUEST', error: 'Nhập tên shop' });
  const user = findUserById(req.user!.id);
  if (!user?.accountId) return res.status(400).json({ code: 'NO_ACCOUNT', error: 'Tài khoản chưa gắn với khách nào' });
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO shops (id, account_id, name, created_at) VALUES (?, ?, ?, ?)').run(id, user.accountId, name, new Date().toISOString());
  const token = readCookie(req.get('cookie'));
  if (token) setSessionShop(token, id);
  res.json({ shops: listShopsOf(req.user!.id), currentShopId: id });
});
