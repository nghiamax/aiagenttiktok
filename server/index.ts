import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config, unsafeDirReason } from './config.js';
import { startScheduler } from './agent/scheduler.js';
import { adsRouter } from './routes/ads.js';
import { agentRouter, settingsRouter } from './routes/agent.js';
import { watchlistRouter } from './routes/watchlist.js';
import { shopsRouter } from './routes/shops.js';
import { authRouter } from './routes/auth.js';
import { financeRouter } from './routes/finance.js';
import { usersRouter } from './routes/users.js';
import { sellerRouter } from './routes/seller.js';
import { BILLING_WEBHOOK_PREFIX, billingRouter, gatewayWebhook } from './routes/billing.js';
import { CALLBACK_PATH, tiktokCallback, tiktokRouter } from './routes/tiktok.js';
import { requireAuth, requireShop } from './auth/middleware.js';
import { hasUsers } from './auth/users.js';
import { bootDatabase } from './db/boot.js';

// Hàng rào: thư mục chìa khoá / dữ liệu nằm trong thư mục web công khai → không chạy
const unsafe = unsafeDirReason({ secretsDir: config.secretsDir, dataDir: config.dataDir });
if (unsafe) {
  console.error(`\n✖ KHÔNG KHỞI ĐỘNG: ${unsafe}\n`);
  process.exit(1);
}

// Database: tạo bảng + chép dữ liệu JSON cũ (1 lần) trước khi nhận request
bootDatabase();

const app = express();
app.disable('x-powered-by');

/**
 * Chặn trang web lạ: có Origin/Referer mà không thuộc ALLOWED_ORIGINS → 403.
 * Không gửi header CORS nào, nên trình duyệt cũng không cho trang khác đọc phản hồi.
 */
function originGuard(req: Request, res: Response, next: NextFunction) {
  // TikTok chuyển trình duyệt về (Referer = trang TikTok) — route tự kiểm tra đăng nhập + state dùng 1 lần
  if (req.method === 'GET' && req.originalUrl.split('?')[0] === CALLBACK_PATH) return next();
  // Webhook cổng thanh toán (SePay / payOS gọi từ server của họ) — tự kiểm tra khoá / chữ ký
  if (req.method === 'POST' && req.originalUrl.split('?')[0].startsWith(BILLING_WEBHOOK_PREFIX)) return next();
  const origin = req.get('origin') ?? (req.get('referer') ? new URL(req.get('referer')!).origin : null);
  if (origin && !config.allowedOrigins.includes(origin)) {
    res.status(403).json({ code: 'FORBIDDEN_ORIGIN', error: 'Không được phép' });
    return;
  }
  next();
}

if (config.trustProxy) app.set('trust proxy', 1);

app.use('/api', originGuard);
app.use('/api', express.json({ limit: '1mb' }));
// Không cần đăng nhập: kiểm tra server sống + đăng nhập / đăng xuất / thông tin phiên
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/auth', authRouter);
app.get(CALLBACK_PATH, tiktokCallback);
app.post(`${BILLING_WEBHOOK_PREFIX}:gateway`, gatewayWebhook);
// Mọi API còn lại: phải đăng nhập (quyền từng route đặt trong router)
app.use('/api', requireAuth);
// Mục theo shop: requireShop gắn shop đang mở (thuộc tài khoản người dùng) → mọi dữ liệu bên dưới chỉ của shop đó
app.use('/api/shops', shopsRouter);
app.use('/api/ads', requireShop, adsRouter);
app.use('/api/tiktok', requireShop, tiktokRouter);
app.use('/api/settings', requireShop, settingsRouter);
app.use('/api/agent', requireShop, agentRouter);
app.use('/api/finance', financeRouter);
app.use('/api/users', usersRouter);
app.use('/api/billing', billingRouter);
app.use('/api/seller', sellerRouter);
app.use('/api/watchlist', requireShop, watchlistRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', error: 'Không có API này' });
});

// Trên VPS: server phục vụ luôn trang web đã build (dist/) — cùng địa chỉ với API, không cần Vite
const DIST = path.join(config.root, 'dist');
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  // Mọi đường dẫn khác (/ads, /login…) → index.html để React Router xử lý
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.listen(config.port, config.host, () => {
  console.log(`API chạy tại http://${config.host}:${config.port}`);
  if (!hasUsers()) console.warn('[auth] Chưa có tài khoản đăng nhập web — chạy: npm run user -- add <tên đăng nhập>');
  startScheduler();
});
