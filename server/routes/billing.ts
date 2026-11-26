import { Router, type Request, type Response } from 'express';
import { GATEWAYS, vietQrUrl, type BillingOrder } from '../../shared/billing.js';
import { quotaOf } from '../../shared/plans.js';
import { config } from '../config.js';
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
  payTarget,
  publicBilling,
  saveBillingConfig,
  syncOrder,
} from '../billing/store.js';
import { GatewayError, gatewayOf } from '../billing/gateways/index.js';
import { pricingUsed } from '../finance/usage.js';

/** /api/billing — mua gói Pro bằng chuyển khoản (QR) qua cổng thanh toán đang chọn */
export const billingRouter = Router();

/** Webhook mọi cổng: /api/billing/webhook/<id cổng> — mount TRƯỚC requireAuth, cổng tự kiểm tra khoá / chữ ký */
export const BILLING_WEBHOOK_PREFIX = '/api/billing/webhook/';

const orderView = (o: BillingOrder) => {
  const t = payTarget(o);
  const live = o.status === 'pending' && Date.parse(o.expiresAt) > Date.now();
  return {
    ...o,
    account: t?.account ?? null,
    content: t?.content ?? o.code,
    qrUrl: t && live ? vietQrUrl(t.account, o.amount, t.content) : null,
    checkoutUrl: live ? (o.payment?.checkoutUrl ?? null) : null,
  };
};

/** Địa chỉ web để cổng đưa khách quay lại: PUBLIC_URL, không có thì trang đang mở */
const siteOrigin = (req: Request) =>
  config.publicUrl ?? req.get('origin') ?? `${req.protocol}://${req.get('host') ?? 'localhost:5173'}`;

const gatewayFail = (res: Response, e: unknown) => {
  if (e instanceof BillingError) return res.status(400).json({ code: 'BAD_REQUEST', error: e.message });
  if (e instanceof GatewayError) return res.status(502).json({ code: 'PAYMENT_GATEWAY', error: e.message });
  throw e;
};

billingRouter.get('/plans', requirePermission('finance'), (req, res) => {
  const u = findUserById(req.user!.id);
  res.json({
    billing: publicBilling(),
    quota: u ? quotaOf(publicUser(u), pricingUsed(u.id)) : null,
    isAdmin: req.user!.role === 'owner',
  });
});

billingRouter.post('/orders', requirePermission('finance'), async (req, res) => {
  try {
    const order = await createOrder(req.user!.id, Number(req.body?.months), Date.now(), siteOrigin(req));
    res.json({ order: orderView(order) });
  } catch (e) {
    gatewayFail(res, e);
  }
});

/** Web hỏi lại mỗi vài giây để biết đã thanh toán chưa (cổng có `sync` → hỏi thẳng cổng khi webhook chưa tới) */
billingRouter.get('/orders/:id', requirePermission('finance'), async (req, res) => {
  const o = findOrder(req.params.id);
  if (!o || (o.userId !== req.user!.id && req.user!.role !== 'owner')) {
    return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy đơn' });
  }
  res.json({ order: orderView(await syncOrder(o)) });
});

billingRouter.post('/orders/:id/cancel', requirePermission('finance'), (req, res) => {
  const o = cancelOrder(req.params.id, req.user!.id);
  if (!o) return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy đơn' });
  res.json({ order: orderView(o) });
});

/* ───────── Quản trị viên ───────── */

billingRouter.get('/admin', requirePermission('manage_users'), (_req, res) => {
  const f = listOrders();
  const cfg = getBillingConfig();
  res.json({
    config: cfg,
    ready: Object.fromEntries(GATEWAYS.map((g) => [g.id, gatewayOf(g.id)!.ready(cfg.gateways[g.id])])),
    orders: [...f.orders].reverse().slice(0, 100),
    unmatched: [...f.unmatched].reverse().slice(0, 50),
  });
});

billingRouter.put('/admin/config', requirePermission('manage_users'), (req, res) => {
  res.json({ config: saveBillingConfig(req.body ?? {}) });
});

/** Đăng ký URL webhook với cổng (cổng có `registerWebhook`) bằng cấu hình đã lưu */
billingRouter.post('/admin/gateways/:id/register-webhook', requirePermission('manage_users'), async (req, res) => {
  const g = gatewayOf(req.params.id);
  if (!g?.registerWebhook) return res.status(404).json({ code: 'NOT_FOUND', error: 'Cổng này không tự đăng ký được' });
  const s = getBillingConfig().gateways[g.meta.id];
  if (!g.ready(s)) {
    return res.status(400).json({ code: 'BAD_REQUEST', error: `Nhập và Lưu đủ cấu hình ${g.meta.name} trước` });
  }
  const url = String(req.body?.webhookUrl ?? '');
  if (!url.startsWith('https://') || /localhost|127\.0\.0\.1/.test(url)) {
    return res.status(400).json({ code: 'BAD_REQUEST', error: 'Cần địa chỉ https công khai (không dùng localhost)' });
  }
  try {
    res.json({ message: await g.registerWebhook(s, url) });
  } catch (e) {
    gatewayFail(res, e);
  }
});

billingRouter.post('/admin/orders/:id/mark-paid', requirePermission('manage_users'), (req, res) => {
  const o = markPaidManually(req.params.id);
  if (!o) return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy đơn' });
  res.json({ order: o });
});

/**
 * Webhook chung: cổng kiểm tra khoá / chữ ký + đọc giao dịch → store ghép đơn, đủ tiền → lên Pro.
 * Trả 2xx khi đã nhận để cổng không gửi lại.
 */
export function gatewayWebhook(req: Request, res: Response) {
  const g = gatewayOf(req.params.gateway ?? '');
  if (!g) return res.status(404).json({ success: false, error: 'Không có cổng này' });
  const out = g.webhook({ header: (n) => req.get(n), body: req.body }, getBillingConfig().gateways[g.meta.id]);
  if (!out.txs) return res.status(out.status).json(out.body);
  const results = out.txs.map((tx) => applyTransaction(tx));
  for (const r of results) {
    if (r.kind === 'activated')
      console.log(`[billing] ${r.order.username} lên Pro qua ${g.meta.name} (đơn ${r.order.code})`);
  }
  // 1 giao dịch → result; nhiều → results
  const kinds = results.map((r) => r.kind);
  res.status(out.status).json({ ...out.body, ...(kinds.length === 1 ? { result: kinds[0] } : { results: kinds }) });
}
