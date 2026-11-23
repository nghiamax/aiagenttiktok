import type { ActorRef } from '../shared/permissions.js';
import { getDb, parseJson, tx } from './db/index.js';
import { currentShopId } from './shopContext.js';

/* Video tự thêm vào ô "Đang theo dõi" (Sếp chốt 22/11) — theo shop (bảng watchlist), dùng chung mọi người của shop. */

export interface WatchItem {
  videoId: string;
  note?: string;
  addedAt: string;
  addedBy?: ActorRef;
}

export const MAX_WATCH = 200;

interface Row {
  video_id: string;
  note: string | null;
  added_at: string;
  added_by: string | null;
}

/** Mới nhất lên đầu */
export function getWatchlist(): WatchItem[] {
  const rows = getDb()
    .prepare('SELECT video_id, note, added_at, added_by FROM watchlist WHERE shop_id = ? ORDER BY added_at DESC, rowid DESC')
    .all(currentShopId()) as unknown as Row[];
  return rows.map((r) => ({
    videoId: r.video_id,
    addedAt: r.added_at,
    ...(r.note && { note: r.note }),
    ...(r.added_by && { addedBy: parseJson<ActorRef | undefined>(r.added_by, undefined) }),
  }));
}

export class WatchError extends Error {}

/** Thêm (đã có thì cập nhật ghi chú). */
export function addWatch(videoId: string, note: string | undefined, by?: ActorRef): WatchItem[] {
  const shopId = currentShopId();
  const db = getDb();
  tx(db, () => {
    const existing = db.prepare('SELECT 1 FROM watchlist WHERE shop_id = ? AND video_id = ?').get(shopId, videoId);
    if (existing) {
      if (note !== undefined) db.prepare('UPDATE watchlist SET note = ? WHERE shop_id = ? AND video_id = ?').run(note || null, shopId, videoId);
      return;
    }
    const n = (db.prepare('SELECT count(*) n FROM watchlist WHERE shop_id = ?').get(shopId) as { n: number }).n;
    if (n >= MAX_WATCH) throw new WatchError(`Tối đa ${MAX_WATCH} video — bỏ bớt rồi thêm lại`);
    db.prepare('INSERT INTO watchlist (shop_id, video_id, note, added_at, added_by) VALUES (?, ?, ?, ?, ?)').run(
      shopId,
      videoId,
      note || null,
      new Date().toISOString(),
      by ? JSON.stringify(by) : null,
    );
  });
  return getWatchlist();
}

export function removeWatch(videoId: string): WatchItem[] {
  getDb().prepare('DELETE FROM watchlist WHERE shop_id = ? AND video_id = ?').run(currentShopId(), videoId);
  return getWatchlist();
}
