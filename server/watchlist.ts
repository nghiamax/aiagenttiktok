import fs from 'node:fs';
import path from 'node:path';
import type { ActorRef } from '../shared/permissions.js';
import { config } from './config.js';

/* Danh sách video tự thêm vào ô "Đang theo dõi" (Sếp chốt 22/11) — dùng chung mọi người dùng của shop. */

export interface WatchItem {
  videoId: string;
  note?: string;
  addedAt: string;
  addedBy?: ActorRef;
}

export const MAX_WATCH = 200;
const file = () => path.join(config.dataDir, 'watchlist.json');

export function getWatchlist(): WatchItem[] {
  try {
    const list = JSON.parse(fs.readFileSync(file(), 'utf8')) as WatchItem[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list: WatchItem[]) {
  const p = file();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, p);
}

export class WatchError extends Error {}

/** Thêm (đã có thì cập nhật ghi chú). Mới nhất lên đầu. */
export function addWatch(videoId: string, note: string | undefined, by?: ActorRef): WatchItem[] {
  const list = getWatchlist();
  const existing = list.find((w) => w.videoId === videoId);
  if (existing) {
    if (note !== undefined) existing.note = note || undefined;
    save(list);
    return list;
  }
  if (list.length >= MAX_WATCH) throw new WatchError(`Tối đa ${MAX_WATCH} video — bỏ bớt rồi thêm lại`);
  const item: WatchItem = { videoId, addedAt: new Date().toISOString(), ...(note && { note }), ...(by && { addedBy: by }) };
  const next = [item, ...list];
  save(next);
  return next;
}

export function removeWatch(videoId: string): WatchItem[] {
  const next = getWatchlist().filter((w) => w.videoId !== videoId);
  save(next);
  return next;
}
