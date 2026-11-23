import { Router, type Request, type Response } from 'express';
import { vietQrUrl, type BillingOrder } from '../../shared/billing.js';
import { quotaOf } from '../../shared/plans.js';
import { requirePermission } from '../auth/middleware.js';
import { findUserById, publicUser } from '../auth/users.js';
import {
  applyTransaction,
  BillingError,
  cancelOrder,
  createOrder,
  findOrder,
  getBillingConfig,
  listOrders,
  markPaidManually,
  publicBilling,
  saveBillingConfig,
  webhookKeyOk,
} from '../billing/store.js';
import { pricingUsed } from '../finance/usage.js';

/** /api/billing — mua gói Pro bằng chuyển khoản (QR) */
export const billingRouter = Router();

/** Webhook SePay — mount TRƯỚC requireAuth, tự kiểm tra khoá API */
export const BILLING_WEBHOOK_PATH = '/api/billing/webhook/sepay';

const orderView = (o: BillingOrder) => {
  const pub = publicBilling();
  return { ...o, qrUrl: pub.ready && o.status === 'pending' ? vietQrUrl(pub, o.amount, o.code) : null };
};

billingRouter.get('/plans', requirePermission('finance'), (req, res) => {
  const u = findUserById(req.user!.id);
  res.json({
    billing: publicBilling(),
    quota: u ? quotaOf(publicUser(u), pricingUsed(u.id)) : null,
    isAdmin: req.user!.role === 'owner',
  });
});

billingRouter.post('/orders', requirePermission('finance'), (req, res) => {
  try {
    res.json({ order: orderView(createOrder(req.user!.id, Number(req.body?.months))) });
  } catch (e) {
    if (e instanceof BillingError) return res.status(400).json({ code: 'BAD_REQUEST', error: e.message });
    throw e;
  }
});

/** Web hỏi lại mỗi vài giây để biết đã thanh toán chưa */
billingRouter.get('/orders/:id', requirePermission('finance'), (req, res) => {
  const o = findOrder(req.params.id);
  if (!o || (o.userId !== req.user!.id && req.user!.role !== 'owner')) {
    return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy đơn' });
  }
  res.json({ order: orderView(o) });
});

billingRouter.post('/orders/:id/cancel', requirePermission('finance'), (req, res) => {
  const o = cancelOrder(req.params.id, req.user!.id);
  if (!o) return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy đơn' });
  res.json({ order: orderView(o) });
});

/* ───────── Quản trị viên ───────── */

billingRouter.get('/admin', requirePermission('manage_users'), (_req, res) => {
  const f = listOrders();
  res.json({
    config: getBillingConfig(),
    orders: [...f.orders].reverse().slice(0, 100),
    unmatched: [...f.unmatched].reverse().slice(0, 50),
  });
});

billingRouter.put('/admin/config', requirePermission('manage_users'), (req, res) => {
  res.json({ config: saveBillingConfig(req.body ?? {}) });
});

billingRouter.post('/admin/orders/:id/mark-paid', requirePermission('manage_users'), (req, res) => {
  const o = markPaidManually(req.params.id);
  if (!o) return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy đơn' });
  res.json({ order: o });
});

/**
 * SePay gửi mỗi giao dịch: { id, transferType: 'in'|'out', transferAmount, content, ... }
 * Header "Authorization: Apikey <khoá>". Trả { success: true } để SePay không gửi lại.
 */
export function billingWebhook(req: Request, res: Response) {
  const key = getBillingConfig().webhookKey;
  if (!key) return res.status(503).json({ success: false, error: 'Chưa cấu hình khoá webhook' });
  if (!webhookKeyOk(req.get('authorization'), key)) return res.status(401).json({ success: false, error: 'Sai khoá' });
  const b = req.body ?? {};
  const result = applyTransaction({
    txId: String(b.id ?? b.referenceCode ?? ''),
    amount: Number(b.transferAmount) || 0,
    content: String(b.content ?? b.description ?? ''),
    incoming: b.transferType === 'in',
  });
  if (result.kind === 'activated') console.log(`[billing] ${result.order.username} lên Pro (đơn ${result.order.code})`);
  res.json({ success: true, result: result.kind });
}
