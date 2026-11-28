import type { AgentActionLog, MetricWindow } from './agentTypes.js';
import { formatNumber, shortVnd } from './format.js';

/**
 * CHUẨN CHẤM CHUNG cho MỌI thao tác (Sếp chốt 20/11/2026) — số là ƯỚC TÍNH, tính từ nhật ký thật:
 * - Lãi/lỗ QC mỗi ngày = doanh thu ÷ ROI hoà vốn − chi phí (hoà vốn ghi lúc quyết định).
 * - So lãi/lỗ mỗi ngày SAU thao tác với TRƯỚC (= tình trạng ngay lúc bấm):
 *   đang chạy (gỡ, tăng cường, tắt SP, ngân sách, ROI) → TB/ngày của khoảng "Lúc quyết định";
 *   đang tắt (thêm lại video, bật SP) → 0 (không chi, không đơn).
 * - Sau ≥ trước → Đúng, thấp hơn → Sai. Tác động = chênh lãi/lỗ mỗi ngày × số ngày sau.
 * - Chênh quá nhỏ (chi chênh < MIN_COST_DIFF và đơn chênh < 1) → Chưa đủ số liệu, chưa chấm.
 * - Gỡ video / tắt sản phẩm (Sếp chốt 28/11): doanh thu / đơn SAU khi gỡ là ĐƠN VỀ MUỘN (khách bấm lúc còn chạy) →
 *   cộng vào khoảng TRƯỚC, không tính là lãi của việc gỡ; sau chỉ còn chi. Tính cả đơn muộn mà ROI ≥ hoà vốn → Sai;
 *   ≥ LATE_CLOSE_RATIO × hoà vốn → Sát hoà vốn (không chấm Đúng / Sai).
 */

export type Verdict = 'good' | 'bad' | 'close' | 'pending' | 'insufficient' | 'unscorable' | 'excluded';

/**
 * Gỡ / tắt có đơn về muộn: tính cả đơn muộn mà ROI lúc gỡ ≥ tỷ lệ này × hoà vốn (nhưng < hoà vốn) → "Sát hoà vốn"
 * (không Đúng / Sai — gỡ gần như không lợi không hại, đơn muộn còn về có thể thành Gỡ sai; Sếp chốt 28/11)
 */
export const LATE_CLOSE_RATIO = 0.8;

/** Chi chênh tối thiểu (cả khoảng sau) để chấm */
export const MIN_COST_DIFF = 50_000;

/** Thao tác bật lại thứ đang tắt → mốc "trước" = 0 */
export const STARTS_FROM_ZERO = new Set(['add_creative', 'enable_product']);
/** Gỡ / tắt → doanh thu sau đó là đơn về muộn */
export const CUT_ACTIONS = new Set(['remove_creative', 'disable_product']);

export interface ActionEvaluation {
  verdict: Verdict;
  /** Lợi nhuận tác động (VND, ước tính); null nếu chưa chấm được */
  profitEffect: number | null;
  /** Gỡ video: chi phí tránh được */
  avoidedCost: number | null;
  /** Gỡ video: doanh thu mất */
  lostRevenue: number | null;
  /** Tăng cường…: chi thêm so với mốc */
  extraCost: number | null;
  /** Tăng cường…: doanh thu thêm so với mốc */
  extraRevenue: number | null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Số thao tác đã chấm tối thiểu để đưa ra gợi ý */
export const MIN_SAMPLE = 5;

export const EMPTY: Omit<ActionEvaluation, 'verdict'> = {
  profitEffect: null,
  avoidedCost: null,
  lostRevenue: null,
  extraCost: null,
  extraRevenue: null,
};

export function windowDays(w: MetricWindow): number {
  // Tối thiểu 1 giờ để tránh chia cho 0
  return Math.max((new Date(w.to).getTime() - new Date(w.from).getTime()) / DAY, 1 / 24);
}

export function evaluateAction(a: AgentActionLog, evaluateAfterHours: number, now = Date.now()): ActionEvaluation {
  // Đã xoá khỏi Nhật ký → không tính vào Hiệu quả
  if (a.hidden || a.actionType === 'remind' || a.status !== 'success') return { verdict: 'excluded', ...EMPTY };
  // Video thay đổi trước khi có ngày nào để đo → không chấm
  if (a.measureStop && !a.after) return { verdict: 'excluded', ...EMPTY };
  if (!a.after || now - new Date(a.executedAt).getTime() < evaluateAfterHours * HOUR) {
    return { verdict: 'pending', ...EMPTY };
  }

  const { base, after, total, aDays } = compareWindows(a);
  const be = a.before.breakEven;
  // Chênh lệch trên cả khoảng sau (mốc "trước" quy theo số ngày sau)
  const dCost = total.cost - base.cost * aDays;
  const dRevenue = total.revenue - base.revenue * aDays;
  const dOrders = total.orders - base.orders * aDays;
  const cut = a.actionType === 'remove_creative' || a.actionType === 'disable_product';
  const parts = cut
    ? { avoidedCost: Math.max(0, -dCost), lostRevenue: Math.max(0, -dRevenue) }
    : { extraCost: dCost, extraRevenue: dRevenue };

  if (!be) return { ...EMPTY, ...parts, verdict: 'unscorable' };
  if (Math.abs(dCost) < MIN_COST_DIFF && Math.abs(dOrders) < 1) return { ...EMPTY, ...parts, verdict: 'insufficient' };
  const w = CUT_ACTIONS.has(a.actionType) ? cutWindows(a) : { base, after };
  if ('hasLate' in w && w.hasLate && w.roi != null && w.roi >= LATE_CLOSE_RATIO * be && w.roi < be) {
    return { ...EMPTY, ...parts, verdict: 'close' };
  }
  const profitEffect = (dailyProfit(w.after, be) - dailyProfit(w.base, be)) * aDays;
  return { ...EMPTY, ...parts, verdict: profitEffect >= 0 ? 'good' : 'bad', profitEffect };
}

export interface PerDay {
  cost: number;
  revenue: number;
  orders: number;
}

/** Lãi/lỗ QC mỗi ngày = DT ÷ hoà vốn − chi */
export const dailyProfit = (x: PerDay, be: number) => x.revenue / be - x.cost;

/**
 * TRƯỚC (mỗi ngày, theo tình trạng lúc bấm) và SAU (mỗi ngày + số ngày) của thao tác.
 * Thêm lại video / bật SP: trước = 0 vì đối tượng đang tắt.
 */
export function compareWindows(a: AgentActionLog): { base: PerDay; after: PerDay; total: PerDay; aDays: number } {
  const bDays = windowDays(a.before);
  const base: PerDay = STARTS_FROM_ZERO.has(a.actionType)
    ? { cost: 0, revenue: 0, orders: 0 }
    : { cost: (a.before.cost ?? 0) / bDays, revenue: (a.before.revenue ?? 0) / bDays, orders: (a.before.orders ?? 0) / bDays };
  const w = a.after;
  const aDays = w ? windowDays(w) : 1;
  const total: PerDay = { cost: w?.cost ?? 0, revenue: w?.revenue ?? 0, orders: w?.orders ?? 0 };
  return {
    base,
    total,
    aDays,
    after: { cost: total.cost / aDays, revenue: total.revenue / aDays, orders: total.orders / aDays },
  };
}

/** Số ngày lịch từ `from` tới `to` (yyyy-MM-dd, tính cả 2 đầu) */
const dateSpan = (from: string, to: string) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1);

export interface CutWindows {
  base: PerDay;
  after: PerDay;
  /** Đơn về sau ngày gỡ (các ngày "Sau thao tác") */
  late: { revenue: number; orders: number };
  /** Phần ngày gỡ chưa có ở "Lúc quyết định" (đơn cùng ngày gỡ — có từ `beforeFull`) */
  extra: { revenue: number; orders: number };
  /** Có đơn ngoài "Lúc quyết định" (ngày gỡ / về sau) */
  hasLate: boolean;
  /** ROI lúc gỡ tính cả đơn ngày gỡ + đơn về sau */
  roi: number | null;
  /** Tổng chi / DT / đơn đã tính (trước gỡ đủ ngày gỡ + về sau) */
  sum: PerDay;
  /** Khoảng ngày đã tính (yyyy-MM-dd) — chỉ có khi đã có `beforeFull` */
  span: { from: string; to: string } | null;
  /** Đã đủ số ngày gỡ (có `beforeFull`) — chưa đủ = tạm tính */
  full: boolean;
}

/**
 * Gỡ video / tắt sản phẩm: đơn về muộn (DT / đơn sau khi gỡ) cộng vào khoảng trước — khoản chi trước khi gỡ mới là thứ tạo ra chúng;
 * sau khi gỡ chỉ còn chi (nếu có). roi = ROI lúc gỡ tính cả đơn về muộn.
 * Có `beforeFull` (server lấy đủ tới hết ngày gỡ, Sếp chốt 28/11) → dùng thay "Lúc quyết định": đơn CÙNG NGÀY GỠ không bị bỏ sót
 * (trước đây ngày gỡ không thuộc ô nào — video 7674145968920562965: ngày gỡ 26/11 có 2 đơn 878k bị bỏ).
 */
export function cutWindows(a: AgentActionLog): CutWindows {
  const full = a.beforeFull ?? null;
  const pre = full
    ? { cost: full.cost, revenue: full.revenue, orders: full.orders }
    : { cost: a.before.cost ?? 0, revenue: a.before.revenue ?? 0, orders: a.before.orders ?? 0 };
  const bDays = full ? dateSpan(full.from, full.to) : windowDays(a.before);
  const w = a.after;
  const aDays = w ? windowDays(w) : 1;
  const late = { revenue: w?.revenue ?? 0, orders: w?.orders ?? 0 };
  const extra = full
    ? { revenue: Math.max(0, full.revenue - (a.before.revenue ?? 0)), orders: Math.max(0, full.orders - (a.before.orders ?? 0)) }
    : { revenue: 0, orders: 0 };
  const revenue = pre.revenue + late.revenue;
  const orders = pre.orders + late.orders;
  const lastAfter = w?.days?.length ? w.days[w.days.length - 1].date : null;
  return {
    base: { cost: pre.cost / bDays, revenue: revenue / bDays, orders: orders / bDays },
    after: { cost: (w?.cost ?? 0) / aDays, revenue: 0, orders: 0 },
    late,
    extra,
    hasLate: late.revenue > 0 || late.orders > 0 || extra.revenue > 0 || extra.orders > 0,
    roi: pre.cost > 0 ? revenue / pre.cost : null,
    sum: { cost: pre.cost + (w?.cost ?? 0), revenue, orders },
    span: full ? { from: full.from, to: lastAfter && lastAfter > full.to ? lastAfter : full.to } : null,
    full: !!full,
  };
}

const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const vnd = (n: number) => shortVnd(Math.max(0, Math.round(n)));
/** Ngày giờ VN (yyyy-MM-dd) */
const vnDay = (iso: string) => new Date(Date.parse(iso) + 7 * HOUR).toISOString().slice(0, 10);

/**
 * Phần đơn ngoài "Lúc quyết định" của gỡ / tắt, bằng lời:
 * đủ ngày gỡ → "tính đủ 19/11–27/11 (gồm ngày gỡ 26/11: DT 878k · 2 đơn, 1 đơn về sau gỡ 439k): chi 436k · DT 2,2tr";
 * chưa đủ → "1 đơn về muộn (DT 439k, chi 0đ) · tạm tính, chưa đủ số ngày gỡ".
 */
export function cutLateText(a: AgentActionLog, c: CutWindows = cutWindows(a)): string {
  const verb = a.actionType === 'remove_creative' ? 'gỡ' : 'tắt';
  if (!c.span) {
    return `${formatNumber(c.late.orders)} đơn về muộn (DT ${vnd(c.late.revenue)}, chi ${vnd(a.after?.cost ?? 0)}) · tạm tính, chưa đủ số ngày ${verb}`;
  }
  const parts: string[] = [];
  const day = ddmm(vnDay(a.executedAt));
  parts.push(c.extra.revenue > 0 || c.extra.orders > 0 ? `ngày ${verb} ${day}: DT ${vnd(c.extra.revenue)} · ${formatNumber(c.extra.orders)} đơn` : `ngày ${verb} ${day}`);
  if (c.late.revenue > 0 || c.late.orders > 0) parts.push(`${formatNumber(c.late.orders)} đơn về sau ${verb} ${vnd(c.late.revenue)}`);
  return `tính đủ ${ddmm(c.span.from)}–${ddmm(c.span.to)} (gồm ${parts.join(', ')}): chi ${vnd(c.sum.cost)} · DT ${vnd(c.sum.revenue)} · ${formatNumber(c.sum.orders)} đơn`;
}

/** "ROI lúc gỡ 5,03 ≥ hoà vốn 3,5" */
export function cutRoiText(a: AgentActionLog, c: CutWindows = cutWindows(a)): string {
  const be = a.before.breakEven;
  const sign = c.roi != null && be != null && c.roi >= be ? '≥' : '<';
  return `ROI lúc ${a.actionType === 'remove_creative' ? 'gỡ' : 'tắt'} ${formatNumber(c.roi, 2)} ${sign} hoà vốn ${formatNumber(be, 2)}`;
}

/**
 * Gỡ video ĐÃ ĐỦ CƠ SỞ kết luận sai (để BOT thêm lại — Sếp chốt 28/11): đã chấm Gỡ sai VÀ đã có đủ ngày gỡ (`beforeFull`)
 * VÀ ROI lúc gỡ tính cả đơn ngày gỡ + đơn về sau ≥ hoà vốn. Chưa đủ ngày gỡ (tạm tính) → không.
 */
export function isWrongCut(a: AgentActionLog, evaluateAfterHours: number, now = Date.now()): boolean {
  if (a.actionType !== 'remove_creative' || !a.beforeFull) return false;
  if (evaluateAction(a, evaluateAfterHours, now).verdict !== 'bad') return false;
  const c = cutWindows(a);
  const be = a.before.breakEven;
  return c.roi != null && be != null && c.roi >= be;
}
