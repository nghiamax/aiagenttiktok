import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/* Giá vốn theo SKU của từng tài khoản: server-data/costs.json — nhớ giữa các lần tải file, mọi máy / trình duyệt */

export type CostPlatform = 'tiktok' | 'shopee';
export type CostBook = Record<CostPlatform, Record<string, number>>;

const MAX_PER_PLATFORM = 20_000;
const costsFile = () => path.join(config.dataDir, 'costs.json');
export const isCostPlatform = (v: unknown): v is CostPlatform => v === 'tiktok' || v === 'shopee';

function readAll(): Record<string, CostBook> {
  try {
    const v = JSON.parse(fs.readFileSync(costsFile(), 'utf8')) as Record<string, CostBook>;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, CostBook>) {
  const p = costsFile();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, p);
}

export function getCosts(userId: string): CostBook {
  const b = readAll()[userId];
  return { tiktok: { ...(b?.tiktok ?? {}) }, shopee: { ...(b?.shopee ?? {}) } };
}

/** Ghi nhiều giá vốn 1 lần; giá ≤ 0 = xoá. Trả sổ sau khi ghi. */
export function saveCosts(userId: string, platform: CostPlatform, changes: Record<string, unknown>): CostBook {
  const all = readAll();
  const book = getCosts(userId);
  const target = book[platform];
  for (const [rawKey, rawVal] of Object.entries(changes)) {
    const key = String(rawKey).slice(0, 80);
    if (!key) continue;
    const v = Math.round(Number(rawVal));
    if (Number.isFinite(v) && v > 0 && v < 1e12) target[key] = v;
    else delete target[key];
  }
  if (Object.keys(target).length > MAX_PER_PLATFORM) throw new Error('Quá nhiều SKU');
  all[userId] = book;
  writeAll(all);
  return book;
}

export function deleteCosts(userId: string) {
  const all = readAll();
  if (!(userId in all)) return;
  delete all[userId];
  writeAll(all);
}
