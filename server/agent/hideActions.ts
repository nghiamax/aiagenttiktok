import type { ActorRef } from '../../shared/permissions.js';
import { updateRuntime } from '../store.js';

/**
 * Xoá dòng Nhật ký (Sếp yêu cầu 28/11) — CHỈ ẨN (`hidden`): Nhật ký / Hiệu quả / Theo dõi video không hiện,
 * nhưng vẫn giữ để tính giới hạn an toàn, thời gian chờ, Hoàn tác, trạng thái video. Dòng đang chờ TikTok xác nhận không xoá.
 */
export function hideActionLogs(ids: string[], by?: ActorRef): { hidden: number; skippedRunning: number } {
  const want = new Set(ids);
  const at = new Date().toISOString();
  let hidden = 0;
  let skippedRunning = 0;
  updateRuntime((rt) => {
    for (const a of rt.actions) {
      if (!want.has(a.id) || a.hidden) continue;
      if (a.status === 'running') {
        skippedRunning++;
        continue;
      }
      a.hidden = { at, ...(by ? { by } : {}) };
      hidden++;
    }
  });
  return { hidden, skippedRunning };
}
