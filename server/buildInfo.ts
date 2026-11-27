import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/**
 * Phiên bản code (commit git) — để phát hiện tiến trình chạy code cũ.
 * Lỗi 27/11 trên hosting (LiteSpeed lsnode): Restart / git pull không tắt tiến trình cũ → tiến trình từ 25/11 vẫn giữ lịch
 * quét mỗi giờ bằng code cũ, tạo đề xuất gỡ video sai ("Chi 18đ ≥ mục tiêu 7").
 */
export function readCodeVersion(root: string): string | null {
  try {
    const gitDir = path.join(root, '.git');
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return /^[0-9a-f]{7,40}$/i.test(head) ? head.slice(0, 12) : null;
    const ref = head.slice(4).trim();
    try {
      const hash = fs.readFileSync(path.join(gitDir, ...ref.split('/')), 'utf8').trim();
      if (/^[0-9a-f]{7,40}$/i.test(hash)) return hash.slice(0, 12);
    } catch {
      /* ref đã gói vào packed-refs */
    }
    const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
    for (const line of packed.split(/\r?\n/)) {
      const [hash, name] = line.trim().split(/\s+/);
      if (name === ref && /^[0-9a-f]{7,40}$/i.test(hash)) return hash.slice(0, 12);
    }
    return null;
  } catch {
    return null;
  }
}

/** Commit lúc tiến trình khởi động */
export const BOOT_VERSION = readCodeVersion(config.root);
export const BOOTED_AT = new Date().toISOString();

/** Code trên ổ đĩa khác code tiến trình này đang chạy (thiếu 1 trong 2 → không kết luận) */
export function codeChangedFrom(boot: string | null, current: string | null): boolean {
  return boot != null && current != null && boot !== current;
}

export const currentCodeVersion = () => readCodeVersion(config.root);

/** Chạy dưới trình quản lý app của hosting (LiteSpeed lsnode / Passenger): thoát thì request sau tự mở tiến trình mới */
export function managedByHost(): boolean {
  return (
    process.title.startsWith('lsnode') ||
    process.argv.some((a) => a.includes('lsnode')) ||
    process.env.IN_PASSENGER === '1' ||
    'PhusionPassenger' in globalThis
  );
}
