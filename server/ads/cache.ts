import fs from 'node:fs';
import path from 'node:path';
import type { AdsSnapshot } from '../../shared/adsSnapshot.js';
import { config } from '../config.js';
import { buildSnapshot, type DateRange } from './buildSnapshot.js';

const DIR = path.join(config.dataDir, 'cache');
/** Khoảng ngày có chứa hôm nay → số liệu còn đổi, cache ngắn */
const TODAY_TTL_MS = 15 * 60_000;
/** Ngày đã qua → TikTok vẫn có thể chốt lại số trong ~1-2 ngày, cache 6 giờ */
const RECENT_TTL_MS = 6 * 60 * 60_000;
const RECENT_DAYS = 2;

const inflight = new Map<string, Promise<AdsSnapshot>>();

const fileOf = (r: DateRange) => path.join(DIR, `${r.from}_${r.to}.json`);

/** Ngày hôm nay theo giờ Việt Nam (yyyy-MM-dd) */
export function todayVN(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function ttlFor(r: DateRange): number {
  const today = todayVN();
  if (r.to >= today) return TODAY_TTL_MS;
  const daysAgo = (Date.parse(today) - Date.parse(r.to)) / 86_400_000;
  return daysAgo <= RECENT_DAYS ? RECENT_TTL_MS : Infinity;
}

function readCache(r: DateRange): AdsSnapshot | null {
  try {
    const snap = JSON.parse(fs.readFileSync(fileOf(r), 'utf8')) as AdsSnapshot;
    const age = Date.now() - Date.parse(snap.updatedAt ?? '');
    return age < ttlFor(r) ? snap : null;
  } catch {
    return null;
  }
}

function writeCache(r: DateRange, snap: AdsSnapshot) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileOf(r), JSON.stringify(snap));
}

/** Lấy snapshot theo khoảng ngày: cache → nếu không có thì gọi TikTok. Yêu cầu trùng dùng chung 1 lần gọi. */
export async function getSnapshot(r: DateRange, refresh = false): Promise<{ snapshot: AdsSnapshot; cached: boolean }> {
  if (!refresh) {
    const hit = readCache(r);
    if (hit) return { snapshot: hit, cached: true };
  }
  const key = `${r.from}_${r.to}`;
  let job = inflight.get(key);
  if (!job) {
    job = buildSnapshot(r)
      .then((snap) => {
        writeCache(r, snap);
        return snap;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return { snapshot: await job, cached: false };
}
