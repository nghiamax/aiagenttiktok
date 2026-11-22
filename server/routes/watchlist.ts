import { Router } from 'express';
import { parseVideoId } from '../../shared/videoId.js';
import { actorOf, requirePermission } from '../auth/middleware.js';
import { addWatch, getWatchlist, removeWatch, WatchError } from '../watchlist.js';

/** Ô "Đang theo dõi": video tự thêm (xem = view; thêm / bỏ = configure) */
export const watchlistRouter = Router();

watchlistRouter.get('/', requirePermission('view'), (_req, res) => {
  res.json({ items: getWatchlist() });
});

watchlistRouter.post('/', requirePermission('configure'), (req, res) => {
  const videoId = parseVideoId(String(req.body?.video ?? ''));
  if (!videoId) {
    res.status(400).json({ code: 'BAD_VIDEO', error: 'Không nhận ra mã video — dán mã số hoặc link TikTok của video' });
    return;
  }
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 200) : undefined;
  try {
    res.json({ items: addWatch(videoId, note, actorOf(req)), videoId });
  } catch (e) {
    if (e instanceof WatchError) res.status(400).json({ code: 'WATCH_FULL', error: e.message });
    else throw e;
  }
});

watchlistRouter.delete('/:videoId', requirePermission('configure'), (req, res) => {
  res.json({ items: removeWatch(String(req.params.videoId)) });
});
