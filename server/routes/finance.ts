import { Router } from 'express';
import { FREE_PROFIT_ORDERS, grantOrders, quotaOf } from '../../shared/plans.js';
import { requirePermission } from '../auth/middleware.js';
import { findUserById, publicUser } from '../auth/users.js';
import { addPricingCalc, pricingUsed, profitOrdersUsed, setProfitOrders } from '../finance/usage.js';
import { getCosts, isCostPlatform, saveCosts } from '../finance/costs.js';
import { getSystemFees, saveSystemFees } from '../finance/platformFees.js';

/** /api/finance — lượt Tính giá bán theo gói (Miễn phí 100 lượt / Pro không giới hạn) */
export const financeRouter = Router();

const quotaFor = (userId: string) => {
  const u = findUserById(userId);
  return u ? quotaOf(publicUser(u), pricingUsed(userId), Date.now(), profitOrdersUsed(userId).length) : null;
};

financeRouter.get('/quota', requirePermission('finance'), (req, res) => {
  res.json({ quota: quotaFor(req.user!.id) });
});

/** Ghi 1 lượt tính (web gọi khi 1 kết quả mới hiện ra). Hết lượt → 402 QUOTA_EXCEEDED */
financeRouter.post('/calc', requirePermission('finance'), (req, res) => {
  const q = quotaFor(req.user!.id);
  if (!q) return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Cần đăng nhập' });
  if (q.unlimited) return res.json({ quota: q });
  if ((q.remaining ?? 0) <= 0) {
    return res
      .status(402)
      .json({ code: 'QUOTA_EXCEEDED', error: 'Đã hết lượt tính miễn phí — nâng cấp Pro để tính tiếp', quota: q });
  }
  addPricingCalc(req.user!.id);
  res.json({ quota: quotaFor(req.user!.id) });
});

/**
 * Tính lợi nhuận: web gửi mã đơn trong file → server trả mã đơn được tính.
 * Pro: tất cả. Miễn phí: đơn đã đếm + đơn mới tới khi đủ FREE_PROFIT_ORDERS (tải lại cùng file không trừ thêm).
 */
financeRouter.post('/profit-orders', requirePermission('finance'), (req, res) => {
  const raw: unknown[] = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
  if (raw.length > 50_000) return res.status(400).json({ code: 'BAD_REQUEST', error: 'Quá nhiều đơn trong 1 lần' });
  const ids = raw.map((x) => String(x).slice(0, 40)).filter(Boolean);
  const q = quotaFor(req.user!.id);
  if (!q) return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Cần đăng nhập' });
  if (q.unlimited) return res.json({ allowed: null, quota: q });
  const { allowed, counted } = grantOrders(profitOrdersUsed(req.user!.id), ids, FREE_PROFIT_ORDERS);
  if (counted.length !== q.profitUsed) setProfitOrders(req.user!.id, counted);
  res.json({ allowed, quota: quotaFor(req.user!.id) });
});

/** Giá vốn theo SKU đã nhớ của tài khoản (Tính lợi nhuận + Tính hàng loạt dùng chung) */
financeRouter.get('/costs', requirePermission('finance'), (req, res) => {
  // Gói Miễn phí không nhớ giá vốn (Sếp chốt 22/11) — giữ sổ cũ trên server, lên Pro là có lại
  if (!quotaFor(req.user!.id)?.rememberCosts) return res.json({ costs: { tiktok: {}, shopee: {} }, remember: false });
  res.json({ costs: getCosts(req.user!.id), remember: true });
});

/** Ghi giá vốn: { platform, costs: { [sku]: giá } } — giá 0 = xoá */
financeRouter.put('/costs', requirePermission('finance'), (req, res) => {
  const platform = req.body?.platform;
  const changes = req.body?.costs;
  if (!isCostPlatform(platform) || !changes || typeof changes !== 'object') {
    return res.status(400).json({ code: 'BAD_REQUEST', error: 'Dữ liệu giá vốn không hợp lệ' });
  }
  if (!quotaFor(req.user!.id)?.rememberCosts) {
    return res.status(402).json({ code: 'PRO_REQUIRED', error: 'Nhớ giá vốn chỉ có ở gói Pro' });
  }
  try {
    res.json({ costs: saveCosts(req.user!.id, platform, changes as Record<string, unknown>) });
  } catch (e) {
    res.status(400).json({ code: 'BAD_REQUEST', error: (e as Error).message });
  }
});

/* Biểu phí cố định của sàn (ngoài phí ngành): mọi người xem, chỉ Quản trị viên sửa */
financeRouter.get('/platform-fees', requirePermission('finance'), (_req, res) => {
  res.json(getSystemFees());
});

financeRouter.put('/platform-fees', requirePermission('manage_users'), (req, res) => {
  res.json(saveSystemFees(req.body));
});
