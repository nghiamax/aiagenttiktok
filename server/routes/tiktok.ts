import { Router, type Request, type Response } from 'express';
import { can } from '../../shared/permissions.js';
import { config } from '../config.js';
import { actorOf, requirePermission } from '../auth/middleware.js';
import { readCookie, resolveSession } from '../auth/sessions.js';
import { findUserById } from '../auth/users.js';
import { ConnectError, disconnect, finishConnect, startConnect } from '../tiktok/oauthFlow.js';

/* Nút "Kết nối TikTok" trên web: thay cho npm run login khi server chạy trên VPS (không có trình duyệt) */

export const CALLBACK_PATH = '/api/tiktok/callback';

/**
 * Địa chỉ trang web để TikTok trả về: PUBLIC_URL (VPS) → Origin của trang đang bấm (đã qua originGuard) → mặc định.
 * Dùng đúng origin trang đang mở để cookie đăng nhập đi kèm khi TikTok chuyển về.
 */
function siteOrigin(req: Request): string {
  if (config.publicUrl) return config.publicUrl;
  const origin = req.get('origin');
  if (origin && config.allowedOrigins.includes(origin)) return origin;
  return config.allowedOrigins[0];
}

export const tiktokRouter = Router();

/** Bước 1: tạo link đăng nhập TikTok → web chuyển trang sang đó */
tiktokRouter.post('/connect', requirePermission('configure'), async (req, res) => {
  try {
    const authUrl = await startConnect(siteOrigin(req) + CALLBACK_PATH, actorOf(req)!);
    res.json({ authUrl });
  } catch (e) {
    console.error('[tiktok/connect]', e);
    res.status(502).json({ code: 'TIKTOK_ERROR', error: `Không mở được đăng nhập TikTok: ${(e as Error).message.slice(0, 200)}` });
  }
});

/** Ngắt kết nối: thu hồi quyền ở TikTok + xoá token trên máy. Bắt buộc {confirm:true} (bấm xác nhận trên web). */
tiktokRouter.post('/disconnect', requirePermission('configure'), async (req, res) => {
  if (req.body?.confirm !== true) {
    res.status(400).json({ code: 'CONFIRM_REQUIRED', error: 'Cần xác nhận trước khi ngắt kết nối' });
    return;
  }
  const { revoked } = await disconnect(actorOf(req));
  res.json({ ok: true, revoked });
});

/**
 * Bước 2: TikTok chuyển trình duyệt về đây. Mount TRƯỚC requireAuth và bỏ qua originGuard (Referer là trang TikTok).
 * - Trình duyệt đang đăng nhập web: phải đúng người đã bấm Kết nối + có quyền configure → về /ads.
 * - Trình duyệt KHÁC chưa đăng nhập web (Sếp copy link sang trình duyệt đang đăng nhập TikTok Ads): chấp nhận nếu state
 *   hợp lệ — state 128 bit, chỉ người bấm thấy, dùng 1 lần, hết hạn 10 phút, đã gắn người bấm từ bước 1 → về /login.
 * Không bao giờ trả token.
 */
export async function tiktokCallback(req: Request, res: Response) {
  const sid = readCookie(req.get('cookie'));
  const sessionUserId = resolveSession(sid);
  const user = sessionUserId ? findUserById(sessionUserId) : null;
  const signedIn = !!user && !user.disabled;
  const back = (q: string) => res.redirect(303, `${signedIn ? '/ads' : '/login'}?${q}`);
  if (signedIn && !can(user!.role, 'configure')) {
    return back(`tiktok=error&reason=${encodeURIComponent('Tài khoản đang đăng nhập ở trình duyệt này không có quyền kết nối TikTok')}`);
  }
  const s = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : undefined);
  try {
    await finishConnect(
      { state: s('state'), code: s('code'), error: s('error'), error_description: s('error_description') },
      signedIn ? user!.id : null,
    );
    console.log(
      `[tiktok] Đã kết nối TikTok${signedIn ? ` — bởi ${user!.username}` : ' — từ trình duyệt khác (link do người bấm Kết nối mở)'} lúc ${new Date().toISOString()}`,
    );
    back('tiktok=connected');
  } catch (e) {
    const msg = e instanceof ConnectError ? e.message : 'Lỗi server khi kết nối TikTok';
    if (!(e instanceof ConnectError)) console.error('[tiktok/callback]', e);
    back(`tiktok=error&reason=${encodeURIComponent(msg)}`);
  }
}
