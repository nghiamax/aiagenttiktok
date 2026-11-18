import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Bảng videoId → authorUsername (TikTok bắt buộc username để mở link video).
 * Không tra TikTok lúc tải số liệu; lần đầu lấy từ snapshot tĩnh src/data/ads-snapshot.json.
 */
const FILE = path.join(config.dataDir, 'authors.json');
const SEED = path.join(config.root, 'src', 'data', 'ads-snapshot.json');

let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as Record<string, string>;
  } catch {
    const map: Record<string, string> = {};
    try {
      const seed = JSON.parse(fs.readFileSync(SEED, 'utf8')) as { videos?: { id: string; authorUsername?: string | null }[] };
      for (const v of seed.videos ?? []) if (v.authorUsername) map[v.id] = v.authorUsername;
    } catch {
      /* không có snapshot tĩnh */
    }
    return map;
  }
}

export function getAuthors(): Record<string, string> {
  cache ??= load();
  return cache;
}

export function rememberAuthors(entries: Record<string, string>) {
  const map = { ...getAuthors(), ...entries };
  cache = map;
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}
