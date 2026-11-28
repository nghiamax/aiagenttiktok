import { updateRuntime } from '../store.js';
import { maybeShopId, withShop } from '../shopContext.js';
import { shopsWithTikTok } from '../shops.js';
import { holdSchedulerLock, releaseSchedulerLock } from './leaderLock.js';
import { BOOT_VERSION, codeChangedFrom, currentCodeVersion, managedByHost } from '../buildInfo.js';

/** Lượt quét bị chặn vì tiến trình khác đang giữ khoá → thử lại sau ngần này (không đợi tới giờ sau) */
export const LOCK_RETRY_MS = 60_000;
import { runAgent, type RunSummary } from './engine.js';
import { runAutoProposals, verifyPendingActions } from './executor.js';
import { fillAfterMetrics } from './afterMetrics.js';

/** Điền số liệu "Sau thao tác" từng khối 24h: 1 phút sau khi bật server, rồi mỗi 15 phút (chỉ đọc TikTok; không có khối tới hạn thì không gọi) */
const AFTER_FIRST_MS = 60_000;
const AFTER_EVERY_MS = 15 * 60_000;
async function afterTick() {
  if (!holdLock()) return;
  try {
    await forEachShop('cập nhật số liệu sau thao tác', async (shop) => {
      const n = await fillAfterMetrics();
      if (n) console.log(`[agent] ${shop}: đã cập nhật số liệu sau thao tác cho ${n} thao tác`);
    });
  } catch (e) {
    console.error('[agent] cập nhật số liệu sau thao tác lỗi:', e instanceof Error ? e.message : e);
  }
}

/** Chạy việc nền lần lượt cho từng shop có kết nối TikTok; shop lỗi chỉ ghi log, không chặn shop khác */
async function forEachShop(what: string, fn: (shopId: string) => Promise<void>) {
  for (const shopId of shopsWithTikTok()) {
    try {
      await withShop(shopId, () => fn(shopId));
    } catch (e) {
      console.error(`[agent] ${shopId}: ${what} lỗi:`, e instanceof Error ? e.message : e);
    }
  }
}

/** Kiểm tra kết quả gỡ / thêm video mỗi 10 giây (chỉ gọi TikTok khi có dòng đang chờ tới hạn) */
const VERIFY_EVERY_MS = 10_000;
let verifying = false;
async function verifyTick() {
  if (verifying || !holdLock()) return;
  verifying = true;
  try {
    await forEachShop('kiểm tra kết quả', async (shop) => {
      const n = await verifyPendingActions();
      if (n) console.log(`[agent] ${shop}: đã kiểm tra kết quả ${n} thao tác trên TikTok`);
    });
  } catch (e) {
    console.error('[agent] kiểm tra kết quả lỗi:', e instanceof Error ? e.message : e);
  } finally {
    verifying = false;
  }
}

const INTERVAL_MIN = Number(process.env.AGENT_INTERVAL_MINUTES ?? 60);
/** Lượt đầu sau khi khởi động server */
const FIRST_RUN_DELAY_MS = 30_000;

/** Lượt đang chạy theo shop (không chạy chồng trong cùng shop) */
const running = new Map<string, Promise<RunSummary>>();

/** Thời điểm lượt quét theo lịch kế tiếp (ms), null nếu lịch tắt */
let nextRunAt: number | null = null;

/**
 * Tiến trình chạy code cũ (code trên ổ đĩa đã đổi sau git pull) → nhường lịch, không bao giờ lấy lại khoá.
 * Lỗi 27/11: hosting LiteSpeed không tắt tiến trình cũ khi Restart → tiến trình từ 25/11 vẫn quét bằng code cũ.
 * Dưới lsnode / Passenger: thoát hẳn khi rảnh (request sau tự mở tiến trình mới); máy dev / VPS chỉ nhả lịch.
 */
let retired = false;
export function holdLock(): boolean {
  if (retired) return false;
  const now = currentCodeVersion();
  if (codeChangedFrom(BOOT_VERSION, now)) {
    retired = true;
    releaseSchedulerLock();
    console.warn(`[agent] Code trên ổ đĩa đã đổi (${BOOT_VERSION} → ${now}) — tiến trình cũ (pid ${process.pid}) nhường lịch quét`);
    if (managedByHost()) {
      const quit = () => (running.size ? setTimeout(quit, 5_000) : process.exit(0));
      quit();
    }
    return false;
  }
  return holdSchedulerLock();
}

/** Shop đang mở có lượt quét đang chạy không */
export const isAgentRunning = () => {
  const shop = maybeShopId();
  return shop ? running.has(shop) : running.size > 0;
};

export const getNextRunAt = () => (nextRunAt ? new Date(nextRunAt).toISOString() : null);

export const AGENT_INTERVAL_MINUTES = INTERVAL_MIN;

/**
 * Giới hạn thời gian phần quét (đọc số liệu + tạo đề xuất) — lớp chặn thứ 2 sau giới hạn từng lời gọi TikTok.
 * Lỗi 28/11: lượt treo nằm mãi trong `running` → Quét ngay / quét theo giờ dùng lại lượt treo, không làm gì.
 * Quá giờ → lượt báo lỗi, `running` được xoá (lượt sau chạy lại bình thường); kết quả muộn của lượt cũ không thực thi BOT.
 */
export const runTiming = { timeoutMs: 15 * 60_000 };
function withRunTimeout<T>(job: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Lượt quét quá ${Math.round(runTiming.timeoutMs / 60_000)} phút (TikTok không phản hồi) — lượt sau quét lại`)),
      runTiming.timeoutMs,
    );
  });
  return Promise.race([job, limit]).finally(() => clearTimeout(timer));
}

/** Chạy 1 lượt cho shop đang mở (currentShopId); đang có lượt của shop đó thì dùng chung (không chạy chồng) */
export function runAgentOnce(trigger: 'schedule' | 'manual'): Promise<RunSummary> {
  const shop = maybeShopId();
  if (!shop) return Promise.reject(new Error('Chưa chọn shop'));
  const existing = running.get(shop);
  if (existing) return existing;
  // Quét ngay: lấy số liệu mới từ TikTok; lịch tự động: dùng cache (tối đa 6 tiếng)
  const p = withRunTimeout(runAgent({ fresh: trigger === 'manual' }))
    // BOT chạy: thực thi ngay đề xuất của quy tắc chế độ "BOT chạy" (cùng shop, lần lượt, đủ lớp kiểm tra như Duyệt)
    .then(async (s) => (s.autoIds.length ? { ...s, auto: await runAutoProposals(s.autoIds) } : s))
    .then((s) => {
      const skipped = Object.entries(s.skippedTargets)
        .map(([k, n]) => `${k}: ${n}`)
        .join(', ');
      console.log(
        `[agent] ${shop} ${trigger} ${s.skipped ? '— đang tạm dừng' : `→ ${s.proposals} đề xuất, ${s.reminders} nhắc việc, ${s.expired} hết hạn, ${s.outdated} không còn khớp${skipped ? ` · bỏ qua (${skipped})` : ''}${s.auto ? ` · BOT chạy ${s.auto.ran}, chưa chạy được ${s.auto.failed}` : ''}`}`,
      );
      return s;
    })
    .catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[agent] ${shop} ${trigger} lỗi:`, message);
      updateRuntime((rt) => {
        rt.lastRunAt = new Date().toISOString();
        rt.lastRunError = message;
      });
      throw e;
    })
    .finally(() => {
      running.delete(shop);
    });
  running.set(shop, p);
  return p;
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
    // Shop chưa kết nối TikTok → không nằm trong danh sách, bỏ qua (kết nối xong lượt sau tự chạy)
    tryRun();
  };
  /** Tiến trình khác đang giữ lịch (cPanel có thể chạy nhiều tiến trình / vừa Restart) → thử lại sau 1 phút, không quét trùng */
  const tryRun = () => {
    if (!holdLock()) {
      if (retired) return;
      setTimeout(() => {
        // Chỉ thử lại khi lượt kế tiếp còn xa (tránh chồng lên lượt theo lịch)
        if (nextRunAt && nextRunAt - Date.now() > LOCK_RETRY_MS) tryRun();
      }, LOCK_RETRY_MS);
      return;
    }
    void (async () => {
      for (const shopId of shopsWithTikTok()) {
        await withShop(shopId, () => runAgentOnce('schedule')).catch(() => undefined);
      }
    })();
  };
  nextRunAt = Date.now() + FIRST_RUN_DELAY_MS;
  setTimeout(() => {
    tick();
    setInterval(tick, intervalMs);
  }, FIRST_RUN_DELAY_MS);
  console.log(`[agent] Chạy mỗi ${INTERVAL_MIN} phút (tạo đề xuất; Sếp duyệt + xác nhận mới thao tác trên TikTok)`);
}
