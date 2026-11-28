import type { AdsSnapshot, VideoStatus } from '../../shared/adsSnapshot.js';
import { effectiveStatus } from '../../shared/videoStatus.js';
import type { AgentActionLog, AgentTarget, DayMetric, MetricWindow } from '../../shared/agentTypes.js';
import { getSnapshot } from '../ads/cache.js';
import { getRuntime, updateRuntime } from '../store.js';

/**
 * Số liệu "Sau thao tác" theo NGÀY LỊCH (giờ VN), CHỈ ĐỌC — dùng snapshot 1 ngày (`getSnapshot`, cùng đường đọc trang Tổng quan).
 * Ngày k = ngày (ngày thao tác + k), hiện khi đã tròn k × 24h sau thao tác (Sếp chốt 20/11/2026):
 * gỡ 14:57 19/11 → 14:57 20/11 có Ngày 1 = số ngày 20/11 (tạm tính tới hết ngày), 14:57 21/11 có thêm Ngày 2 = 21/11…
 * Ngày thao tác không tính (lẫn giờ trước thao tác). Ngày chưa hết / vừa hết trong 48h lấy lại mỗi lượt (đơn về trễ).
 * TikTok KHÔNG cho `stat_time_hour` ở cấp video (40002 Invalid dimension) — đừng quay lại cách đo theo giờ.
 * Ghi `action.after` (tổng, để evaluateAction chấm) + `action.after.days` (từng ngày, để hiện + kết luận).
 */

export const MAX_DAYS = 7;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const VN_OFFSET = 7 * HOUR;
/** Ngày kết thúc trong ngần này thì còn lấy lại (đơn về trễ) */
const UNSETTLED_MS = 48 * HOUR;
/** Chỉ theo dõi thao tác trong ngần này ngày */
const TRACK_DAYS = 30;

/** Ngày giờ VN (yyyy-MM-dd) của 1 mốc thời gian */
const vnDate = (ms: number) => new Date(ms + VN_OFFSET).toISOString().slice(0, 10);
/** 00:00 giờ VN của ngày (ms) */
const vnMidnight = (date: string) => Date.parse(`${date}T00:00:00+07:00`);

/** Các ngày sau thao tác đã đến lượt hiện (Ngày k khi now ≥ thao tác + k·24h), tối đa MAX_DAYS */
export function afterDates(executedAt: string, now: number): string[] {
  const at = Date.parse(executedAt);
  const d0 = vnMidnight(vnDate(at));
  const out: string[] = [];
  for (let k = 1; k <= MAX_DAYS; k++) {
    if (now < at + k * DAY) break;
    out.push(vnDate(d0 + k * DAY));
  }
  return out;
}

/** Mốc hiện Ngày 1 (= thao tác + 24h) */
export function firstDayReadyAt(executedAt: string): string {
  return new Date(Date.parse(executedAt) + DAY).toISOString();
}

/** Ngày đã chốt (hết ngày + 48h) → không lấy lại */
const settled = (date: string, now: number) => vnMidnight(date) + DAY <= now - UNSETTLED_MS;

/** Số liệu 1 ngày của đối tượng trong snapshot của đúng ngày đó (video: cộng mọi sản phẩm của video trong chiến dịch) */
export function dayMetric(snapshot: AdsSnapshot, t: AgentTarget, date: string): DayMetric {
  const rows: { cost: number | null; revenue: number | null; orders: number | null }[] = t.videoId
    ? snapshot.videos.filter((v) => v.campaignId === t.campaignId && v.id === t.videoId && v.contentType !== 'product_card')
    : t.productId
      ? snapshot.products.filter((p) => p.campaignId === t.campaignId && p.id === t.productId)
      : snapshot.campaigns.filter((c) => c.id === t.campaignId);
  const sum = (k: 'cost' | 'revenue' | 'orders') => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
  const cost = sum('cost');
  const revenue = sum('revenue');
  return { date, cost, revenue, orders: sum('orders'), roi: cost > 0 ? revenue / cost : null };
}

/**
 * Gộp các ngày thành ô "Sau thao tác". `asOf`: lúc lấy số — ngày cuối chưa hết thì `to` = lúc đó
 * (để mốc "nếu không làm gì" chỉ tính phần ngày đã qua).
 */
export function windowOfDays(days: DayMetric[], breakEven: number | null, asOf = Number.POSITIVE_INFINITY): MetricWindow {
  const sum = (k: 'cost' | 'revenue' | 'orders') => days.reduce((s, d) => s + d[k], 0);
  const cost = sum('cost');
  const revenue = sum('revenue');
  const lastEnd = vnMidnight(days[days.length - 1].date) + DAY - 1000;
  return {
    from: `${days[0].date}T00:00:00+07:00`,
    to: asOf < lastEnd ? new Date(asOf).toISOString() : `${days[days.length - 1].date}T23:59:59+07:00`,
    cost,
    revenue,
    orders: sum('orders'),
    roi: cost > 0 ? revenue / cost : null,
    breakEven,
    days,
  };
}

const tracked = (a: AgentActionLog, now: number) =>
  (a.status === 'success' || a.status === 'undone') &&
  a.actionType !== 'remind' &&
  now - Date.parse(a.executedAt) < TRACK_DAYS * DAY;

/** Gỡ / tắt: lấy số đủ ngày gỡ (`beforeFull`) */
const CUT_TYPES = new Set<AgentActionLog['actionType']>(['remove_creative', 'disable_product']);
/** Chưa chốt (ngày gỡ chưa qua 48h) thì lấy lại tối đa mỗi giờ */
const FULL_REFRESH_MS = HOUR;

/**
 * Cần lấy (lại) số đủ ngày gỡ không: gỡ / tắt, ngày gỡ đã hết; chưa có, hoặc ngày gỡ chưa chốt (48h — đơn về trễ) và lần lấy trước đã quá 1 giờ.
 * Trả khoảng ngày cần lấy: ngày đầu "Lúc quyết định" → ngày gỡ.
 */
export function beforeFullRange(a: AgentActionLog, now: number): { from: string; to: string } | null {
  if (!CUT_TYPES.has(a.actionType)) return null;
  const day = vnDate(Date.parse(a.executedAt));
  if (vnMidnight(day) + DAY > now) return null; // ngày gỡ chưa hết
  const f = a.beforeFull;
  if (f && (settled(day, now) || now - Date.parse(f.at) < FULL_REFRESH_MS)) return null;
  const from = vnDate(Date.parse(a.before.from));
  return { from: from < day ? from : day, to: day };
}

/** Dữ liệu cũ đo theo khối giờ (có `from`) → bỏ, đo lại theo ngày */
const isDayEntry = (d: DayMetric) => !d.from;

/* ───────── Video thay đổi → ngừng đo ───────── */

export type MeasureStop = NonNullable<AgentActionLog['measureStop']>;

const ACTION_NAME: Record<AgentActionLog['actionType'], string> = {
  remove_creative: 'Gỡ video',
  add_creative: 'Thêm lại video',
  boost_creative: 'Tăng cường',
  update_budget: 'Đổi ngân sách',
  update_roi_target: 'Đổi ROI mục tiêu',
  disable_product: 'Tắt sản phẩm',
  enable_product: 'Bật sản phẩm',
  remind: 'Nhắc việc',
};

const STATUS_NAME: Partial<Record<VideoStatus, string>> = {
  delivering: 'Đang phân phối',
  learning: 'Đang học',
  in_queue: 'Chờ phân phối',
  not_delivering: 'Không phân phối',
  authorization_needed: 'Cần ủy quyền',
  excluded: 'Đã gỡ',
  unavailable: 'Không khả dụng',
  rejected: 'Bị từ chối',
  not_active: 'Chưa kích hoạt',
};

/** Cùng đối tượng: video = chiến dịch + video; sản phẩm = chiến dịch + sản phẩm; chiến dịch = chiến dịch */
const sameTarget = (x: AgentTarget, y: AgentTarget) =>
  x.campaignId === y.campaignId && (x.videoId || y.videoId ? x.videoId === y.videoId : (x.productId || '') === (y.productId || ''));

/** "14:37 21/11" giờ VN */
const vnTime = (iso: string) => {
  const d = new Date(Date.parse(iso) + VN_OFFSET).toISOString();
  return `${d.slice(11, 16)} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
};

/** Thao tác mới (đã gửi lên TikTok: không lỗi, không nhắc việc) trên cùng đối tượng sau thao tác này */
export function nextActionStop(a: AgentActionLog, actions: AgentActionLog[]): MeasureStop | null {
  const at = Date.parse(a.executedAt);
  const next = actions
    .filter((x) => x.id !== a.id && x.status !== 'failed' && x.actionType !== 'remind' && sameTarget(x.target, a.target))
    .filter((x) => Date.parse(x.executedAt) > at)
    .sort((x, y) => x.executedAt.localeCompare(y.executedAt))[0];
  if (!next) return null;
  const date = vnDate(Date.parse(next.executedAt));
  const sameDay = date === vnDate(at);
  return {
    date,
    reason: sameDay
      ? `có thao tác ${ACTION_NAME[next.actionType]} cùng ngày lúc ${vnTime(next.executedAt).slice(0, 5)}`
      : `có thao tác ${ACTION_NAME[next.actionType]} lúc ${vnTime(next.executedAt)}`,
  };
}

/** Có xét trạng thái video không: thao tác gỡ / thêm / tăng cường video, đã qua ngày thao tác (hôm đó trạng thái có thể chưa cập nhật) */
const checksStatus = (a: AgentActionLog, today: string) =>
  !!a.target.videoId &&
  ['remove_creative', 'add_creative', 'boost_creative'].includes(a.actionType) &&
  vnDate(Date.parse(a.executedAt)) < today;

/**
 * Trạng thái hiện tại của video không còn như thao tác để lại (đổi ngoài hệ thống: Ads Manager, TikTok tự chuyển…).
 * Gỡ → phải còn `excluded` (không có dòng = vẫn gỡ). Thêm lại / tăng cường → không bị gỡ / không khả dụng / từ chối
 * (không có dòng = chưa kết luận). Mốc = hôm nay (ngày phát hiện, không tính).
 */
export function statusStop(a: AgentActionLog, todaySnap: AdsSnapshot, today: string): MeasureStop | null {
  if (!checksStatus(a, today)) return null;
  const t = a.target;
  const rows = todaySnap.videos.filter((v) => v.campaignId === t.campaignId && v.id === t.videoId && v.contentType !== 'product_card');
  if (rows.length === 0) return null;
  const main = rows.find((v) => !v.crossProduct) ?? rows[0];
  const status = effectiveStatus(main);
  if (status === 'unknown') return null;
  const ok = a.actionType === 'remove_creative' ? status === 'excluded' : !['excluded', 'unavailable', 'rejected'].includes(status);
  return ok ? null : { date: today, reason: `trạng thái video đổi sang ${STATUS_NAME[status] ?? status}` };
}

/** Mốc sớm hơn thắng */
const earlier = (x: MeasureStop | null | undefined, y: MeasureStop | null | undefined) =>
  !x ? (y ?? null) : !y ? x : y.date < x.date ? y : x;

let running = false;

/** Điền các ngày mới (và lấy lại ngày gần) cho thao tác đang theo dõi. Trả số thao tác được cập nhật. */
export async function fillAfterMetrics(now = Date.now()): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    // Snapshot 1 ngày dùng chung cho mọi thao tác trong lượt
    const snaps = new Map<string, Promise<AdsSnapshot>>();
    const snapOf = (date: string) => {
      if (!snaps.has(date)) snaps.set(date, getSnapshot({ from: date, to: date }, false).then((r) => r.snapshot));
      return snaps.get(date)!;
    };

    const today = vnDate(now);
    const actions = getRuntime().actions;
    const results = new Map<string, DayMetric[]>();
    const fulls = new Map<string, NonNullable<AgentActionLog['beforeFull']>>();
    const stops = new Map<string, MeasureStop>();
    for (const a of actions) {
      if (!tracked(a, now)) continue;
      // Video thay đổi (thao tác mới trong Nhật ký / trạng thái đổi) → chỉ đo các ngày trước mốc
      let stop: MeasureStop | null = earlier(a.measureStop, nextActionStop(a, actions));
      // Chỉ đọc trạng thái hôm nay khi thao tác cấp video đã qua ngày (tránh tải snapshot thừa)
      if (!stop && checksStatus(a, today)) {
        try {
          stop = statusStop(a, await snapOf(today), today);
        } catch {
          // chưa đọc được trạng thái hôm nay → lượt sau
        }
      }
      if (stop && stop.date !== a.measureStop?.date) stops.set(a.id, stop);
      // Gỡ / tắt: số đủ tới hết ngày gỡ (đơn cùng ngày gỡ không nằm ở "Lúc quyết định" lẫn "Sau thao tác")
      const fr = beforeFullRange(a, now);
      if (fr) {
        try {
          const m = dayMetric((await getSnapshot(fr, false)).snapshot, a.target, fr.to);
          fulls.set(a.id, { from: fr.from, to: fr.to, cost: m.cost, revenue: m.revenue, orders: m.orders, at: new Date(now).toISOString() });
        } catch (e) {
          console.error(`[agent] chưa lấy được số đủ ngày gỡ ${a.id}:`, e instanceof Error ? e.message : e);
        }
      }
      const have = new Set((a.after?.days ?? []).filter(isDayEntry).map((d) => d.date));
      const need = afterDates(a.executedAt, now).filter((d) => (!stop || d < stop.date) && (!have.has(d) || !settled(d, now)));
      if (need.length === 0) continue;
      const got: DayMetric[] = [];
      for (const date of need) {
        try {
          got.push(dayMetric(await snapOf(date), a.target, date));
        } catch (e) {
          snaps.delete(date);
          console.error(`[agent] chưa lấy được số liệu sau thao tác ${a.id} (${date}):`, e instanceof Error ? e.message : e);
          break; // lượt sau thử lại
        }
      }
      if (got.length) results.set(a.id, got);
    }
    if (results.size === 0 && stops.size === 0 && fulls.size === 0) return 0;

    updateRuntime((rt) => {
      for (const a of rt.actions) {
        const full = fulls.get(a.id);
        if (full) a.beforeFull = full;
        const got = results.get(a.id) ?? [];
        const stop = stops.get(a.id);
        if (!got.length && !stop) continue;
        if (stop) a.measureStop = stop;
        const until = a.measureStop?.date;
        const fresh = new Set(got.map((d) => d.date));
        const days = [...(a.after?.days ?? []).filter((d) => isDayEntry(d) && !fresh.has(d.date)), ...got]
          .filter((d) => !until || d.date < until)
          .sort((x, y) => x.date.localeCompare(y.date))
          .slice(0, MAX_DAYS);
        a.after = days.length ? windowOfDays(days, a.before.breakEven, now) : null;
      }
    });
    return new Set([...results.keys(), ...stops.keys(), ...fulls.keys()]).size;
  } finally {
    running = false;
  }
}
