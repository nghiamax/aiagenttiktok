import { updateRuntime } from '../store.js';
import { runAgent, type RunSummary } from './engine.js';

const INTERVAL_MIN = Number(process.env.AGENT_INTERVAL_MINUTES ?? 60);
/** Lượt đầu sau khi khởi động server */
const FIRST_RUN_DELAY_MS = 30_000;

let running: Promise<RunSummary> | null = null;

/** Thời điểm lượt quét theo lịch kế tiếp (ms), null nếu lịch tắt */
let nextRunAt: number | null = null;

export const isAgentRunning = () => running !== null;

export const getNextRunAt = () => (nextRunAt ? new Date(nextRunAt).toISOString() : null);

export const AGENT_INTERVAL_MINUTES = INTERVAL_MIN;

/** Chạy 1 lượt; đang có lượt chạy thì dùng chung lượt đó (không chạy chồng) */
export function runAgentOnce(trigger: 'schedule' | 'manual'): Promise<RunSummary> {
  // Quét ngay: lấy số liệu mới từ TikTok; lịch tự động: dùng cache (tối đa 6 tiếng)
  running ??= runAgent({ fresh: trigger === 'manual' })
    .then((s) => {
      const skipped = Object.entries(s.skippedTargets)
        .map(([k, n]) => `${k}: ${n}`)
        .join(', ');
      console.log(
        `[agent] ${trigger} ${s.skipped ? '— đang tạm dừng' : `→ ${s.proposals} đề xuất, ${s.reminders} nhắc việc, ${s.expired} hết hạn${skipped ? ` · bỏ qua (${skipped})` : ''}`}`,
      );
      return s;
    })
    .catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[agent] ${trigger} lỗi:`, message);
      updateRuntime((rt) => {
        rt.lastRunAt = new Date().toISOString();
        rt.lastRunError = message;
      });
      throw e;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

export function startScheduler() {
  if (!(INTERVAL_MIN > 0)) {
    console.log('[agent] Lịch chạy tắt (AGENT_INTERVAL_MINUTES = 0)');
    return;
  }
  const intervalMs = INTERVAL_MIN * 60_000;
  const tick = () => {
    nextRunAt = Date.now() + intervalMs;
    runAgentOnce('schedule').catch(() => undefined);
  };
  nextRunAt = Date.now() + FIRST_RUN_DELAY_MS;
  setTimeout(() => {
    tick();
    setInterval(tick, intervalMs);
  }, FIRST_RUN_DELAY_MS);
  console.log(`[agent] Chạy mỗi ${INTERVAL_MIN} phút (chỉ đề xuất, không thao tác trên TikTok)`);
}
