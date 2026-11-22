import { updateRuntime } from '../store.js';
import { readToken } from '../tiktok/auth.js';
import { holdSchedulerLock, releaseSchedulerLock } from './leaderLock.js';

/** Lượt quét bị chặn vì tiến trình khác đang giữ khoá → thử lại sau ngần này (không đợi tới giờ sau) */
export const LOCK_RETRY_MS = 60_000;
import { runAgent, type RunSummary } from './engine.js';
import { verifyPendingActions } from './executor.js';
import { fillAfterMetrics } from './afterMetrics.js';

/** Điền số liệu "Sau thao tác" từng khối 24h: 1 phút sau khi bật server, rồi mỗi 15 phút (chỉ đọc TikTok; không có khối tới hạn thì không gọi) */
const AFTER_FIRST_MS = 60_000;
const AFTER_EVERY_MS = 15 * 60_000;
async function afterTick() {
  if (!holdSchedulerLock()) return;
  try {
    const n = await fillAfterMetrics();
    if (n) console.log(`[agent] đã cập nhật số liệu sau thao tác cho ${n} thao tác`);
  } catch (e) {
    console.error('[agent] cập nhật số liệu sau thao tác lỗi:', e instanceof Error ? e.message : e);
  }
}

/** Kiểm tra kết quả gỡ / thêm video mỗi 10 giây (chỉ gọi TikTok khi có dòng đang chờ tới hạn) */
const VERIFY_EVERY_MS = 10_000;
let verifying = false;
async function verifyTick() {
  if (verifying || !holdSchedulerLock()) return;
  verifying = true;
  try {
    const n = await verifyPendingActions();
    if (n) console.log(`[agent] đã kiểm tra kết quả ${n} thao tác trên TikTok`);
  } catch (e) {
    console.error('[agent] kiểm tra kết quả lỗi:', e instanceof Error ? e.message : e);
  } finally {
    verifying = false;
  }
}

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
        `[agent] ${trigger} ${s.skipped ? '— đang tạm dừng' : `→ ${s.proposals} đề xuất, ${s.reminders} nhắc việc, ${s.expired} hết hạn, ${s.outdated} không còn khớp${skipped ? ` · bỏ qua (${skipped})` : ''}`}`,
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
  // Tắt tiến trình (Restart) → trả khoá để tiến trình mới chạy lịch ngay
  const release = () => releaseSchedulerLock();
  process.once('exit', release);
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => {
      release();
      process.exit(0);
    });
  }
  setInterval(verifyTick, VERIFY_EVERY_MS);
  setTimeout(afterTick, AFTER_FIRST_MS);
  setInterval(afterTick, AFTER_EVERY_MS);
  setTimeout(verifyTick, FIRST_RUN_DELAY_MS);
  if (!(INTERVAL_MIN > 0)) {
    console.log('[agent] Lịch chạy tắt (AGENT_INTERVAL_MINUTES = 0)');
    return;
  }
  const intervalMs = INTERVAL_MIN * 60_000;
  const tick = () => {
    nextRunAt = Date.now() + intervalMs;
    // Chưa kết nối TikTok lần nào → bỏ qua lượt, không ghi lỗi (kết nối xong lượt sau tự chạy)
    if (!readToken()?.access_token) return;
    tryRun();
  };
  /** Tiến trình khác đang giữ lịch (cPanel có thể chạy nhiều tiến trình / vừa Restart) → thử lại sau 1 phút, không quét trùng */
  const tryRun = () => {
    if (!holdSchedulerLock()) {
      setTimeout(() => {
        // Chỉ thử lại khi lượt kế tiếp còn xa (tránh chồng lên lượt theo lịch)
        if (nextRunAt && nextRunAt - Date.now() > LOCK_RETRY_MS) tryRun();
      }, LOCK_RETRY_MS);
      return;
    }
    runAgentOnce('schedule').catch(() => undefined);
  };
  nextRunAt = Date.now() + FIRST_RUN_DELAY_MS;
  setTimeout(() => {
    tick();
    setInterval(tick, intervalMs);
  }, FIRST_RUN_DELAY_MS);
  console.log(`[agent] Chạy mỗi ${INTERVAL_MIN} phút (tạo đề xuất; Sếp duyệt + xác nhận mới thao tác trên TikTok)`);
}
