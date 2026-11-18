import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { startScheduler } from './agent/scheduler.js';
import { adsRouter } from './routes/ads.js';
import { agentRouter, settingsRouter } from './routes/agent.js';

const app = express();
app.disable('x-powered-by');

/**
 * Chặn trang web lạ: có Origin/Referer mà không thuộc ALLOWED_ORIGINS → 403.
 * Không gửi header CORS nào, nên trình duyệt cũng không cho trang khác đọc phản hồi.
 */
function originGuard(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('origin') ?? (req.get('referer') ? new URL(req.get('referer')!).origin : null);
  if (origin && !config.allowedOrigins.includes(origin)) {
    res.status(403).json({ code: 'FORBIDDEN_ORIGIN', error: 'Không được phép' });
    return;
  }
  next();
}

app.use('/api', originGuard);
app.use('/api', express.json({ limit: '1mb' }));
app.use('/api/ads', adsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/agent', agentRouter);
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api', (_req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', error: 'Không có API này' });
});

app.listen(config.port, config.host, () => {
  console.log(`API chạy tại http://${config.host}:${config.port}`);
  startScheduler();
});
