import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { startScheduler } from './agent/scheduler.js';
import { adsRouter } from './routes/ads.js';
import { agentRouter, settingsRouter } from './routes/agent.js';
import { authRouter } from './routes/auth.js';
import { CALLBACK_PATH, tiktokCallback, tiktokRouter } from './routes/tiktok.js';
import { requireAuth } from './auth/middleware.js';
import { hasUsers } from './auth/users.js';

const app = express();
app.disable('x-powered-by');

/**
 * Chặn trang web lạ: có Origin/Referer mà không thuộc ALLOWED_ORIGINS → 403.
 * Không gửi header CORS nào, nên trình duyệt cũng không cho trang khác đọc phản hồi.
 */
function originGuard(req: Request, res: Response, next: NextFunction) {
  // TikTok chuyển trình duyệt về (Referer = trang TikTok) — route tự kiểm tra đăng nhập + state dùng 1 lần
  if (req.method === 'GET' && req.originalUrl.split('?')[0] === CALLBACK_PATH) return next();
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
// Mọi API còn lại: phải đăng nhập (quyền từng route đặt trong router)
app.use('/api', requireAuth);
app.use('/api/ads', adsRouter);
app.use('/api/tiktok', tiktokRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/agent', agentRouter);
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
