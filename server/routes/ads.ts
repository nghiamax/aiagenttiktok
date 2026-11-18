import { Router, type Response } from 'express';
import { config } from '../config.js';
import { getSnapshot, todayVN } from '../ads/cache.js';
import { expiresAt, readToken, TikTokLoginRequired } from '../tiktok/auth.js';
import { TikTokApiError } from '../tiktok/mcpClient.js';

export const adsRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 90;

function isValidDate(s: string) {
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);
}

function sendError(res: Response, status: number, code: string, error: string) {
  res.status(status).json({ code, error });
}

/** Trạng thái kết nối TikTok (không bao giờ trả token) */
adsRouter.get('/status', (_req, res) => {
  const token = readToken();
  const exp = token ? expiresAt(token) : null;
  res.json({
    connected: Boolean(token?.access_token),
    expiresAt: exp ? new Date(exp).toISOString() : null,
    canRefresh: Boolean(token?.refresh_token),
    advertiser: { id: config.tiktok.advertiserId, name: config.tiktok.advertiserName },
  });
});

/** Số liệu GMV Max sản phẩm theo khoảng ngày: ?from=yyyy-MM-dd&to=yyyy-MM-dd[&refresh=1] */
adsRouter.get('/snapshot', async (req, res) => {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');
  if (!isValidDate(from) || !isValidDate(to)) {
    return sendError(res, 400, 'BAD_DATE', 'Ngày không hợp lệ, cần dạng yyyy-MM-dd');
  }
  if (from > to) return sendError(res, 400, 'BAD_RANGE', 'Ngày bắt đầu phải trước ngày kết thúc');
  if (to > todayVN()) return sendError(res, 400, 'FUTURE_DATE', 'Không chọn được ngày trong tương lai');
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > MAX_DAYS) return sendError(res, 400, 'RANGE_TOO_LONG', `Tối đa ${MAX_DAYS} ngày mỗi lần`);

  try {
    const { snapshot, cached } = await getSnapshot({ from, to }, req.query.refresh === '1');
    res.json({ snapshot, cached });
  } catch (e) {
    if (e instanceof TikTokLoginRequired) return sendError(res, 401, 'TIKTOK_LOGIN_REQUIRED', e.message);
    if (e instanceof TikTokApiError) return sendError(res, 502, 'TIKTOK_ERROR', e.message);
    console.error('[ads/snapshot]', e);
    sendError(res, 500, 'SERVER_ERROR', 'Lỗi server khi lấy số liệu');
  }
});
