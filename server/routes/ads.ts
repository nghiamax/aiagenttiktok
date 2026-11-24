import { Router, type Response } from 'express';
import { getSnapshot, todayVN } from '../ads/cache.js';
import { expiresAt, readToken, TikTokLoginRequired } from '../tiktok/auth.js';
import { TikTokApiError } from '../tiktok/mcpClient.js';
import { getAccount, TikTokAccountRequired } from '../tiktok/link.js';
import { requirePermission } from '../auth/middleware.js';

export const adsRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 90;

function isValidDate(s: string) {
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);
}

function sendError(res: Response, status: number, code: string, error: string) {
  res.status(status).json({ code, error });
}

/** never = chưa từng kết nối (lần đầu) · lost = TikTok từ chối gia hạn · connected */
export function tiktokState(token: ReturnType<typeof readToken>): 'never' | 'connected' | 'lost' {
  if (!token?.access_token) return 'never';
  return token.refreshFailedAt ? 'lost' : 'connected';
}

/** Trạng thái kết nối TikTok (không bao giờ trả token) */
adsRouter.get('/status', requirePermission('view'), (_req, res) => {
  const token = readToken();
  const exp = token ? expiresAt(token) : null;
  res.json({
    state: tiktokState(token),
    connected: Boolean(token?.access_token) && !token?.refreshFailedAt,
    expiresAt: exp ? new Date(exp).toISOString() : null,
    canRefresh: Boolean(token?.refresh_token),
    /** Lúc đăng nhập TikTok (token cũ trước 21/11 chưa có → null) */
    connectedAt: token?.connectedAt ?? null,
    connectedBy: token?.connectedBy?.name ?? null,
    /** Lần tự gia hạn / lưu gần nhất */
    refreshedAt: token?.savedAt ?? null,
    /** TikTok từ chối gia hạn → phải bấm Kết nối lại */
    refreshFailedAt: token?.refreshFailedAt ?? null,
    /** Tài khoản quảng cáo + shop TikTok shop này đang chạy; null = đã kết nối nhưng chưa chọn */
    account: getAccount(),
    advertiser: (() => {
      const a = getAccount();
      return a ? { id: a.advertiserId, name: a.storeName ?? a.advertiserName ?? a.advertiserId } : null;
    })(),
  });
});

/** Số liệu GMV Max sản phẩm theo khoảng ngày: ?from=yyyy-MM-dd&to=yyyy-MM-dd[&refresh=1] */
adsRouter.get('/snapshot', requirePermission('view'), async (req, res) => {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');
  if (!isValidDate(from) || !isValidDate(to)) {
    return sendError(res, 400, 'BAD_DATE', 'Ngày không hợp lệ, cần dạng yyyy-MM-dd');
  }
  if (from > to) return sendError(res, 400, 'BAD_RANGE', 'Ngày bắt đầu phải trước ngày kết thúc');
  if (to > todayVN()) return sendError(res, 400, 'FUTURE_DATE', 'Không chọn được ngày trong tương lai');
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > MAX_DAYS) return sendError(res, 400, 'RANGE_TOO_LONG', `Tối đa ${MAX_DAYS} ngày mỗi lần`);

  // Shop chưa kết nối → báo kết nối trước (chưa nói tới chọn tài khoản)
  if (!readToken()?.access_token) return sendError(res, 401, 'TIKTOK_LOGIN_REQUIRED', new TikTokLoginRequired().message);
  try {
    const { snapshot, cached } = await getSnapshot({ from, to }, req.query.refresh === '1');
    res.json({ snapshot, cached });
  } catch (e) {
    if (e instanceof TikTokLoginRequired) return sendError(res, 401, 'TIKTOK_LOGIN_REQUIRED', e.message);
    if (e instanceof TikTokAccountRequired) return sendError(res, 409, 'TIKTOK_ACCOUNT_REQUIRED', e.message);
    if (e instanceof TikTokApiError) return sendError(res, 502, 'TIKTOK_ERROR', e.message);
    console.error('[ads/snapshot]', e);
    sendError(res, 500, 'SERVER_ERROR', 'Lỗi server khi lấy số liệu');
  }
});
