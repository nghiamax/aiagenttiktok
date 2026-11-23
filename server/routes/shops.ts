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

/** Tên tạm của shop mới — đổi thành tên shop / tài khoản quảng cáo khi chọn tài khoản (applyAccount) */
export const NEW_SHOP_NAME = 'Tài khoản quảng cáo mới';

/**
 * "Thêm tài khoản quảng cáo": tạo shop mới (chưa kết nối TikTok) rồi mở luôn để Kết nối. Không bắt nhập tên.
 * Tài khoản đã có shop chưa kết nối (bấm thêm rồi bỏ dở) → mở lại shop đó, không tạo thêm shop trống.
 */
shopsRouter.post('/', requirePermission('configure'), (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, MAX_NAME) || NEW_SHOP_NAME;
  const user = findUserById(req.user!.id);
  if (!user?.accountId) return res.status(400).json({ code: 'NO_ACCOUNT', error: 'Tài khoản chưa gắn với khách nào' });
  const db = getDb();
  const empty = db
    .prepare(
      `SELECT s.id FROM shops s LEFT JOIN tiktok_links l ON l.shop_id = s.id
       WHERE s.account_id = ? AND l.token_enc IS NULL ORDER BY s.created_at LIMIT 1`,
    )
    .get(user.accountId) as { id: string } | undefined;
  const id = empty?.id ?? crypto.randomUUID();
  if (!empty) db.prepare('INSERT INTO shops (id, account_id, name, created_at) VALUES (?, ?, ?, ?)').run(id, user.accountId, name, new Date().toISOString());
  const token = readCookie(req.get('cookie'));
  if (token) setSessionShop(token, id);
  res.json({ shops: listShopsOf(req.user!.id), currentShopId: id });
});
