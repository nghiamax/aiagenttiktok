import fs from 'node:fs';
import path from 'node:path';
import type { AgentActionLog, AgentTarget, DayMetric, MetricWindow } from '../../shared/agentTypes.js';
import { getSnapshot, todayVN } from '../ads/cache.js';
import { num, type ReportRow } from '../ads/mapping.js';
import { config } from '../config.js';
import { callReadTool } from '../tiktok/mcpClient.js';
import { getAgentConfig, getRuntime, updateRuntime } from '../store.js';

/**
 * Số liệu "Sau thao tác" theo từng KHỐI 24H (CHỈ ĐỌC TikTok, báo cáo theo giờ `stat_time_hour`):
 * Ngày k = các giờ [T + (k−1)·24h, T + k·24h), T = giờ tròn kế tiếp sau lúc thao tác (bỏ giờ lẫn phút trước thao tác).
 * Khối có số khi đã hết khối + READY_DELAY (TikTok trễ số theo giờ); khối kết thúc trong 48h gần nhất lấy lại mỗi lượt.
 * Ghi `action.after` (tổng, để evaluateAction chấm) + `action.after.days` (từng khối, để hiện + kết luận).
 * Giờ trong báo cáo theo múi giờ tài khoản quảng cáo — giả định Asia/Ho_Chi_Minh (UTC+7).
 */

export const MAX_DAYS = 7;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const VN_OFFSET = 7 * HOUR;
/** Hết khối bao lâu thì lấy số (TikTok trễ số theo giờ) */
export const READY_DELAY_MS = HOUR;
/** Khối kết thúc trong ngần này thì còn lấy lại (đơn về trễ) */
const UNSETTLED_MS = 48 * HOUR;
/** Chỉ theo dõi thao tác trong ngần này ngày */
const TRACK_DAYS = 30;
const HOURLY_DIR = path.join(config.dataDir, 'cache', 'hourly');
/** Báo cáo theo giờ của ngày gần (hôm qua / hôm nay) dùng lại tối đa ngần này */
const RECENT_TTL_MS = HOUR;

export interface Block {
  /** ISO (UTC) */
  start: string;
  end: string;
}

/** Ngày giờ VN (yyyy-MM-dd) của 1 mốc thời gian */
const vnDate = (ms: number) => new Date(ms + VN_OFFSET).toISOString().slice(0, 10);

/** Các khối 24h đã đủ để lấy số (tối đa MAX_DAYS) */
export function afterBlocks(executedAt: string, now: number): Block[] {
  const t0 = Math.ceil(Date.parse(executedAt) / HOUR) * HOUR;
  const out: Block[] = [];
  for (let k = 0; k < MAX_DAYS; k++) {
    const start = t0 + k * DAY;
    const end = start + DAY;
    if (now < end + READY_DELAY_MS) break;
    out.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
  }
  return out;
}

/** Mốc lấy được số của khối 24h đầu (để báo "Có số 24h đầu lúc …") */
export function firstBlockReadyAt(executedAt: string): string {
  const t0 = Math.ceil(Date.parse(executedAt) / HOUR) * HOUR;
  return new Date(t0 + DAY + READY_DELAY_MS).toISOString();
}

/** Ngày VN mà khối trải qua (thường 2 ngày) */
export function datesOfBlock(b: Block): string[] {
  return [...new Set([vnDate(Date.parse(b.start)), vnDate(Date.parse(b.end) - 1)])];
}

/** 1 dòng báo cáo theo giờ: khoá đối tượng + giờ (ms) + số liệu */
export interface HourRow {
  key: string;
  hour: number;
  cost: number;
  revenue: number;
  orders: number;
}

type Level = 'video' | 'product' | 'campaign';
const levelOf = (t: AgentTarget): Level => (t.videoId ? 'video' : t.productId ? 'product' : 'campaign');
const keyOf = (t: AgentTarget) => t.videoId || t.productId || t.campaignId;
const DIM: Record<Level, string> = { video: 'item_id', product: 'item_group_id', campaign: 'campaign_id' };

/** "2026-11-19 15:00:00" (giờ tài khoản, giả định VN) → ms */
export function parseHour(s: string): number {
  return Date.parse(`${s.trim().replace(' ', 'T')}+07:00`);
}

/** Cộng các giờ của đối tượng nằm trong khối */
export function blockMetrics(rows: HourRow[], key: string, b: Block): DayMetric {
  const start = Date.parse(b.start);
  const end = Date.parse(b.end);
  let cost = 0;
  let revenue = 0;
  let orders = 0;
  for (const r of rows) {
    if (r.key !== key || r.hour < start || r.hour >= end) continue;
    cost += r.cost;
    revenue += r.revenue;
    orders += r.orders;
  }
  return { date: vnDate(start), from: b.start, to: b.end, cost, revenue, orders, roi: cost > 0 ? revenue / cost : null };
}

/** Gộp các khối thành ô "Sau thao tác" */
export function windowOfDays(days: DayMetric[], breakEven: number | null): MetricWindow {
  const sum = (k: 'cost' | 'revenue' | 'orders') => days.reduce((s, d) => s + d[k], 0);
  const cost = sum('cost');
  const revenue = sum('revenue');
  const first = days[0];
  const last = days[days.length - 1];
  return {
    from: first.from ?? `${first.date}T00:00:00+07:00`,
    to: last.to ?? `${last.date}T23:59:59+07:00`,
    cost,
    revenue,
    orders: sum('orders'),
    roi: cost > 0 ? revenue / cost : null,
    breakEven,
    days,
  };
}

/* ───────── Đọc báo cáo theo giờ (có cache) ───────── */

function cacheFile(level: Level, campaignId: string, productId: string, date: string) {
  return path.join(HOURLY_DIR, `${date}_${level}_${campaignId}_${productId || '-'}.json`);
}

/** Báo cáo theo giờ của 1 ngày cho (cấp, chiến dịch, sản phẩm) — chỉ đọc */
async function hourlyRows(level: Level, campaignId: string, productId: string, date: string): Promise<HourRow[]> {
  const file = cacheFile(level, campaignId, productId, date);
  const settled = date < vnDate(Date.now() - DAY); // trước hôm qua → số đã chốt
  try {
    const st = fs.statSync(file);
    if (settled || Date.now() - st.mtimeMs < RECENT_TTL_MS) return JSON.parse(fs.readFileSync(file, 'utf8')) as HourRow[];
  } catch {
    // chưa có cache
  }
  const filtering: Record<string, unknown> = { campaign_ids: [campaignId] };
  if (level === 'video') filtering.item_group_ids = [productId];
  const rows: HourRow[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await callReadTool<{ list?: ReportRow[]; page_info?: { total_page: number } }>('gmv_max_report_get', {
      advertiser_id: config.tiktok.advertiserId,
      store_ids: [config.tiktok.storeId],
      start_date: date,
      end_date: date,
      page,
      page_size: 1000,
      dimensions: [DIM[level], 'stat_time_hour'],
      metrics: ['cost', 'gross_revenue', 'orders'],
      filtering,
    });
    for (const r of data.list ?? []) {
      const hour = parseHour(r.dimensions.stat_time_hour ?? '');
      if (Number.isNaN(hour)) continue;
      rows.push({
        key: r.dimensions[DIM[level]],
        hour,
        cost: num(r.metrics.cost) ?? 0,
        revenue: num(r.metrics.gross_revenue) ?? 0,
        orders: num(r.metrics.orders) ?? 0,
      });
    }
    if (!data.page_info || page >= data.page_info.total_page) break;
  }
  fs.mkdirSync(HOURLY_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows));
  return rows;
}

/** Mọi sản phẩm mà video gắn trong chiến dịch (snapshot Agent đang dùng) */
async function productsOfVideo(target: AgentTarget): Promise<string[]> {
  const ids = new Set<string>([target.productId]);
  try {
    const lookback = Math.max(1, getAgentConfig().guardrails.lookbackDays ?? 7);
    const today = todayVN();
    const back = (n: number) => new Date(Date.parse(today) - n * DAY).toISOString().slice(0, 10);
    const { snapshot } = await getSnapshot({ from: back(lookback), to: back(1) }, false);
    for (const v of snapshot.videos) if (v.campaignId === target.campaignId && v.id === target.videoId) ids.add(v.productId);
  } catch {
    // thiếu snapshot → chỉ sản phẩm của thao tác
  }
  return [...ids].filter(Boolean);
}

/** Số liệu 1 khối của đối tượng (video: cộng mọi sản phẩm của video trong chiến dịch) */
async function metricsFor(target: AgentTarget, b: Block, products: string[]): Promise<DayMetric> {
  const level = levelOf(target);
  const rows: HourRow[] = [];
  for (const date of datesOfBlock(b)) {
    if (level === 'video') {
      for (const p of products) rows.push(...(await hourlyRows('video', target.campaignId, p, date)));
    } else {
      rows.push(...(await hourlyRows(level, target.campaignId, '', date)));
    }
  }
  return blockMetrics(rows, keyOf(target), b);
}

const tracked = (a: AgentActionLog, now: number) =>
  (a.status === 'success' || a.status === 'undone') &&
  a.actionType !== 'remind' &&
  !a.undoOf &&
  now - Date.parse(a.executedAt) < TRACK_DAYS * DAY;

let running = false;

/** Điền các khối 24h mới (và lấy lại khối gần) cho thao tác đang theo dõi. Trả số thao tác được cập nhật. */
export async function fillAfterMetrics(now = Date.now()): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const results = new Map<string, DayMetric[]>();
    for (const a of getRuntime().actions) {
      if (!tracked(a, now)) continue;
      const have = new Set((a.after?.days ?? []).map((d) => d.from));
      const need = afterBlocks(a.executedAt, now).filter((b) => !have.has(b.start) || Date.parse(b.end) > now - UNSETTLED_MS);
      if (need.length === 0) continue;
      const products = levelOf(a.target) === 'video' ? await productsOfVideo(a.target) : [];
      const got: DayMetric[] = [];
      for (const b of need) {
        try {
          got.push(await metricsFor(a.target, b, products));
        } catch (e) {
          console.error(`[agent] chưa lấy được số liệu sau thao tác ${a.id}:`, e instanceof Error ? e.message : e);
          break; // lượt sau thử lại
        }
      }
      if (got.length) results.set(a.id, got);
    }
    if (results.size === 0) return 0;

    updateRuntime((rt) => {
      for (const a of rt.actions) {
        const got = results.get(a.id);
        if (!got) continue;
        const fresh = new Set(got.map((d) => d.from));
        // Bỏ dữ liệu cũ đo theo ngày lịch (không có from) — thay bằng khối 24h
        const days = [...(a.after?.days ?? []).filter((d) => d.from && !fresh.has(d.from)), ...got]
          .sort((x, y) => (x.from ?? '').localeCompare(y.from ?? ''))
          .slice(0, MAX_DAYS);
        a.after = windowOfDays(days, a.before.breakEven);
      }
    });
    return results.size;
  } finally {
    running = false;
  }
}
