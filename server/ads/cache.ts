import fs from 'node:fs';
import path from 'node:path';
import type { AdsSnapshot } from '../../shared/adsSnapshot.js';
import { config } from '../config.js';
import { buildSnapshot, SNAPSHOT_BUILD, type DateRange } from './buildSnapshot.js';
import { annotateCrossProduct } from '../../shared/videoStatus.js';
import { currentShopId } from '../shopContext.js';
import { requireAccount } from '../tiktok/link.js';

const DIR = path.join(config.dataDir, 'cache');
/**
 * Khoảng có hôm nay / 2 ngày gần → mỗi lần tải trang / quét lấy số MỚI từ TikTok (Sếp chốt 26/11).
 * Chỉ dùng lại bản vừa lấy trong 1 phút: 1 lần tải trang gửi cùng lúc 3–4 yêu cầu, BOT quét xong chạy ngay → khỏi gọi trùng.
 */
const TODAY_TTL_MS = 60_000;
/** Ngày đã qua: TikTok vẫn có thể chốt lại số trong ~1-2 ngày → cũng lấy mới */
const RECENT_TTL_MS = 60_000;
const RECENT_DAYS = 2;

const inflight = new Map<string, Promise<AdsSnapshot>>();

/**
 * Cache theo shop + tài khoản quảng cáo + shop TikTok: cache/<shop>/<advertiser>_<store>/<from>_<to>.json —
 * đổi tài khoản thì không dùng nhầm số cũ; shop khác không bao giờ đọc được file của nhau.
 */
function scopeDir(): string {
  const a = requireAccount();
  return path.join(DIR, currentShopId(), `${a.advertiserId}_${a.storeId}`);
}
const fileOf = (r: DateRange) => path.join(scopeDir(), `${r.from}_${r.to}.json`);

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
    // Dựng bằng code cũ → dựng lại (kể cả khoảng ngày "giữ mãi")
    if (snap.build !== SNAPSHOT_BUILD) return null;
    const age = Date.now() - Date.parse(snap.updatedAt ?? '');
    return age < ttlFor(r) ? snap : null;
  } catch {
    return null;
  }
}

function writeCache(r: DateRange, snap: AdsSnapshot) {
  const file = fileOf(r);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snap));
}

/** Lấy snapshot theo khoảng ngày: cache → nếu không có thì gọi TikTok. Yêu cầu trùng dùng chung 1 lần gọi. */
export async function getSnapshot(r: DateRange, refresh = false): Promise<{ snapshot: AdsSnapshot; cached: boolean }> {
  if (!refresh) {
    const hit = readCache(r);
    if (hit) return { snapshot: annotateCrossProduct(hit), cached: true };
  }
  const key = fileOf(r);
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
  return { snapshot: annotateCrossProduct(await job), cached: false };
}
