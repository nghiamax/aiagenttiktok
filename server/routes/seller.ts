import fs from 'node:fs';
import { Router, type Response } from 'express';
import { requirePermission } from '../auth/middleware.js';
import {
  closeSeller,
  downloadPath,
  isSellerPlatform,
  listDownloads,
  logoutSeller,
  openSeller,
  removeDownload,
  SELLER_PLATFORMS,
  SellerError,
  sellerState,
  type SellerPlatform,
} from '../sellerBrowser/session.js';
import { fetchJobOf, startTikTokFetch } from '../sellerBrowser/tiktokFetch.js';

/** /api/seller — đăng nhập Seller Center bằng trình duyệt trên máy chạy server + file tải về (mỗi tài khoản riêng) */
export const sellerRouter = Router();

/** Tắt hẳn tính năng (vd trên hosting không có màn hình): SELLER_BROWSER=off */
const enabled = () => process.env.SELLER_BROWSER !== 'off';

function platformOf(raw: string, res: Response): SellerPlatform | null {
  if (isSellerPlatform(raw)) return raw;
  res.status(400).json({ code: 'BAD_REQUEST', error: 'Sàn không hợp lệ' });
  return null;
}

sellerRouter.get('/status', requirePermission('finance'), (req, res) => {
  res.json({ enabled: enabled(), platforms: SELLER_PLATFORMS.map((p) => sellerState(req.user!.id, p)) });
});

/** Mở cửa sổ Seller Center (chưa đăng nhập → trang đăng nhập; đã đăng nhập → trang người bán để xuất file) */
sellerRouter.post('/:platform/open', requirePermission('finance'), async (req, res) => {
  const p = platformOf(req.params.platform, res);
  if (!p) return;
  if (!enabled()) return res.status(503).json({ code: 'DISABLED', error: 'Máy chủ này không mở được trình duyệt' });
  if (p === 'tiktok' && fetchJobOf(req.user!.id)?.running) {
    return res.status(409).json({ code: 'BUSY', error: 'Đang lấy file tự động — đợi xong rồi mở lại' });
  }
  try {
    res.json({ state: await openSeller(req.user!.id, p) });
  } catch (e) {
    if (e instanceof SellerError) return res.status(409).json({ code: 'BROWSER', error: e.message });
    throw e;
  }
});

sellerRouter.post('/:platform/close', requirePermission('finance'), async (req, res) => {
  const p = platformOf(req.params.platform, res);
  if (!p) return;
  await closeSeller(req.user!.id, p);
  res.json({ state: sellerState(req.user!.id, p) });
});

/** Đăng xuất: xoá phiên đăng nhập đã lưu (bắt buộc confirm) */
sellerRouter.post('/:platform/logout', requirePermission('finance'), async (req, res) => {
  const p = platformOf(req.params.platform, res);
  if (!p) return;
  if (req.body?.confirm !== true) return res.status(400).json({ code: 'CONFIRM_REQUIRED', error: 'Cần xác nhận' });
  await logoutSeller(req.user!.id, p);
  res.json({ state: sellerState(req.user!.id, p) });
});

sellerRouter.get('/:platform/downloads', requirePermission('finance'), (req, res) => {
  const p = platformOf(req.params.platform, res);
  if (!p) return;
  res.json({ downloads: listDownloads(req.user!.id, p) });
});

sellerRouter.get('/:platform/downloads/:id', requirePermission('finance'), (req, res) => {
  const p = platformOf(req.params.platform, res);
  if (!p) return;
  const f = downloadPath(req.user!.id, p, req.params.id);
  if (!f) return res.status(404).json({ code: 'NOT_FOUND', error: 'Không có file' });
  res.setHeader('Content-Type', 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});

sellerRouter.delete('/:platform/downloads/:id', requirePermission('finance'), (req, res) => {
  const p = platformOf(req.params.platform, res);
  if (!p) return;
  removeDownload(req.user!.id, p, req.params.id);
  res.json({ ok: true });
});

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Lấy file TikTok tự động (chạy ẩn bằng phiên đã đăng nhập) cho kỳ { from, to } (ngày đặt đơn) */
sellerRouter.post('/tiktok/fetch', requirePermission('finance'), (req, res) => {
  if (!enabled()) return res.status(503).json({ code: 'DISABLED', error: 'Máy chủ này không mở được trình duyệt' });
  const from = String(req.body?.from ?? '');
  const to = String(req.body?.to ?? '');
  if (!ISO.test(from) || !ISO.test(to) || from > to) {
    return res.status(400).json({ code: 'BAD_RANGE', error: 'Khoảng ngày không hợp lệ' });
  }
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 89) {
    return res.status(400).json({ code: 'BAD_RANGE', error: 'Mỗi lần lấy tối đa 90 ngày' });
  }
  if (sellerState(req.user!.id, 'tiktok').status !== 'logged_in') {
    return res
      .status(409)
      .json({ code: 'NOT_LOGGED_IN', error: 'Chưa đăng nhập TikTok Seller — vào Quản lý shop → TikTok' });
  }
  res.json({ job: startTikTokFetch(req.user!.id, from, to) });
});

sellerRouter.get('/tiktok/fetch', requirePermission('finance'), (req, res) => {
  res.json({ job: fetchJobOf(req.user!.id) });
});
