/**
 * Nhóm hệ thống cấp sản phẩm "Cân nhắc bật lại" (Sếp chốt 25/11/2026): không có điều kiện để sửa — hệ thống tự đánh giá
 * sản phẩm đang tắt / loại trừ (hoặc thuộc chiến dịch đã tắt) có nên bật lại không, theo số 30 ngày (không có thì 14)
 * so ROI hoà vốn. Quy tắc cấp sản phẩm chọn nhóm này để Bật sản phẩm / Nhắc việc. Dùng chung web + server.
 */
import type { AdsSnapshot } from './adsSnapshot.js';
import { breakEvenOf, REENABLE_GROUP, type AdsSettings } from './settings.js';
import type { WindowStat } from './trend.js';

/** ID nhóm hệ thống (cấp sản phẩm) */
export const REENABLE_GROUP_ID = REENABLE_GROUP;

/** Cần ít nhất ngần này đơn trong khung đánh giá mới khuyên bật lại (ít hơn → ROI chưa có ý nghĩa) */
export const MIN_ORDERS_TO_SUGGEST = 3;

export type ReEnableVerdict = 'suggest' | 'few' | 'keep_off' | 'no_break_even' | 'no_data';

/** Số khung đánh giá: 30 ngày có chi, không thì 14 ngày có chi */
export function reEnableStat(w: { w14: WindowStat | null; w30: WindowStat | null } | undefined): WindowStat | null {
  if (w?.w30 && (w.w30.cost ?? 0) > 0) return w.w30;
  if (w?.w14 && (w.w14.cost ?? 0) > 0) return w.w14;
  return null;
}

/**
 * Chấm có nên bật lại (dùng chung cột đánh giá, ô lọc, nhóm hệ thống, Agent).
 * suggest = ROI ≥ hoà vốn và ≥ MIN_ORDERS_TO_SUGGEST đơn · few = có lời nhưng ít đơn · keep_off = lỗ (tắt là đúng)
 */
export function reEnableVerdict(w: { w14: WindowStat | null; w30: WindowStat | null } | undefined, breakEven: number | null): ReEnableVerdict {
  const s = reEnableStat(w);
  if (!s) return 'no_data';
  if (breakEven == null || s.roi == null) return 'no_break_even';
  if (s.roi < breakEven) return 'keep_off';
  return (s.orders ?? 0) < MIN_ORDERS_TO_SUGGEST ? 'few' : 'suggest';
}

export interface ReEnableCandidate {
  campaignId: string;
  productId: string;
  name: string;
  /** Sản phẩm đã tắt khỏi chiến dịch đang chạy (Bật sản phẩm làm được) */
  excluded: boolean;
  campaignRunning: boolean;
  /** Số khung đánh giá (30 / 14 ngày) */
  stat: WindowStat;
  days: 14 | 30;
  breakEven: number;
}

interface Snaps {
  d7: AdsSnapshot;
  d14: AdsSnapshot | null;
  d30: AdsSnapshot | null;
}

const statOf = (s: AdsSnapshot | null, campaignId: string, productId: string): WindowStat | null => {
  const rows = s?.products.filter((p) => p.campaignId === campaignId && p.id === productId) ?? [];
  if (rows.length === 0) return null;
  const cost = rows.reduce((a, p) => a + (p.cost ?? 0), 0);
  const revenue = rows.reduce((a, p) => a + (p.revenue ?? 0), 0);
  return { cost, revenue, orders: rows.reduce((a, p) => a + (p.orders ?? 0), 0), roi: cost > 0 ? revenue / cost : null };
};

/**
 * Sản phẩm thuộc nhóm "Cân nhắc bật lại": đang tắt khỏi chiến dịch hoặc chiến dịch đang tắt, và đánh giá = suggest.
 * Trạng thái lấy ở snapshot mới nhất có dòng đó (7 → 14 → 30 ngày); thiếu 14 / 30 ngày → dùng snapshot có sẵn.
 */
export function reEnableCandidates(snaps: Snaps, settings: AdsSettings): ReEnableCandidate[] {
  const list = [snaps.d7, snaps.d14, snaps.d30].filter((s): s is AdsSnapshot => !!s);
  const campaignStatus = new Map<string, string>();
  for (const s of [...list].reverse()) for (const c of s.campaigns) campaignStatus.set(c.id, c.status);
  const latest = new Map<string, { name: string; excluded: boolean }>();
  for (const s of [...list].reverse()) {
    for (const p of s.products) latest.set(`${p.campaignId}/${p.id}`, { name: p.name, excluded: !!p.excluded });
  }
  const out: ReEnableCandidate[] = [];
  for (const [key, info] of latest) {
    const [campaignId, productId] = key.split('/');
    const campaignRunning = campaignStatus.get(campaignId) === 'running';
    if (campaignRunning && !info.excluded) continue; // đang chạy bình thường
    const w = { w14: statOf(snaps.d14 ?? snaps.d7, campaignId, productId), w30: statOf(snaps.d30, campaignId, productId) };
    const breakEven = breakEvenOf(settings, productId);
    if (reEnableVerdict(w, breakEven) !== 'suggest') continue;
    const stat = reEnableStat(w)!;
    out.push({ campaignId, productId, name: info.name, excluded: info.excluded, campaignRunning, stat, days: stat === w.w30 ? 30 : 14, breakEven: breakEven! });
  }
  return out;
}

/** Lý do (đề xuất / tooltip) */
export function reEnableReason(c: ReEnableCandidate): string {
  const roi = (c.stat.roi ?? 0).toFixed(2).replace('.', ',');
  const be = c.breakEven.toFixed(2).replace('.', ',');
  const where = c.campaignRunning ? 'Đã loại trừ' : 'Chiến dịch đang tắt';
  return `${where} — ${c.days} ngày qua: ${c.stat.orders ?? 0} đơn · ROI ${roi} ≥ hoà vốn ${be}`;
}
