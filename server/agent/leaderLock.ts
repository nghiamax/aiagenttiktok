import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Chỉ 1 tiến trình được chạy lịch Agent (quét, kiểm tra kết quả, đo sau thao tác).
 * Trên cPanel (Passenger) có thể có nhiều tiến trình cùng lúc → không có khoá thì Agent chạy trùng, ghi đè dữ liệu.
 * Khoá = file server-data/scheduler.lock {id, at}; tiến trình giữ khoá làm mới mỗi lần tick;
 * quá LOCK_TTL_MS không làm mới (tiến trình đã tắt) → tiến trình khác lấy lại.
 */
export const LOCK_TTL_MS = 2 * 60_000;
const INSTANCE_ID = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
const lockFile = () => path.join(config.dataDir, 'scheduler.lock');

/** Giữ / lấy khoá. true = tiến trình này được chạy lịch. */
export function holdSchedulerLock(now = Date.now(), id = INSTANCE_ID): boolean {
  try {
    const cur = JSON.parse(fs.readFileSync(lockFile(), 'utf8')) as { id?: string; at?: number };
    if (cur.id && cur.id !== id && typeof cur.at === 'number' && now - cur.at < LOCK_TTL_MS) return false;
  } catch {
    /* chưa có khoá / hỏng → lấy */
  }
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(lockFile(), JSON.stringify({ id, at: now }));
    return true;
  } catch {
    return false;
  }
}

/** Trả khoá khi tiến trình tắt (Restart trên cPanel) → tiến trình mới chạy lịch ngay, không đợi khoá hết hạn */
export function releaseSchedulerLock(id = INSTANCE_ID): boolean {
  try {
    const cur = JSON.parse(fs.readFileSync(lockFile(), 'utf8')) as { id?: string };
    if (cur.id !== id) return false;
    fs.rmSync(lockFile(), { force: true });
    return true;
  } catch {
    return false;
  }
}
