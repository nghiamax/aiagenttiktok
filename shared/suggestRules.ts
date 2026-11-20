/**
 * Bộ gợi ý CHUNG cho mọi shop (Sếp chốt 20/11/2026, 10 gợi ý).
 * Không dùng số tiền cố định theo 1 shop: ngưỡng tính theo mốc riêng của từng shop
 * (CPA hoà vốn, ROI hoà vốn, ROI mục tiêu, % tiêu ngân sách, tỷ trọng doanh thu).
 * Hệ số dưới đây là MẶC ĐỊNH CHUNG; từng shop ghi đè / tắt qua `settings.suggestOverrides`.
 */
import type { AdsSnapshot } from './adsSnapshot.js';
import { breakEvenOf, type AdsSettings } from './settings.js';

export const SUGGESTION_IDS = [
  'break-even',
  'video-cut',
  'product-loss',
  'campaign-low-roi',
  'video-scale',
  'campaign-scale',
  'campaign-slow',
  'video-authorize',
  'video-concentration',
  'product-few-videos',
] as const;
export type SuggestionId = (typeof SUGGESTION_IDS)[number];

/** Hệ số mặc định của từng gợi ý */
export const SUGGESTION_PARAMS = {
  'break-even': {},
  'video-cut': {
    /** Chi ≥ k × CPA hoà vốn mà 0 đơn */
    noOrderCpaX: 1,
    /** Chi ≥ k × CPA hoà vốn và ROI < hoà vốn */
    lossCpaX: 2,
  },
  'product-loss': {
    /** ROI < hoà vốn và chi ≥ k × CPA hoà vốn (đủ tiền cho ~k đơn mới kết luận) */
    minCpaX: 2,
  },
  'campaign-low-roi': {
    /** ROI < k × ROI mục tiêu */
    roiTargetX: 0.8,
    /** Chi ≥ k ngày ngân sách (đủ số liệu) */
    minBudgetDays: 1,
    budgetChangePct: -20,
  },
  'video-scale': {
    minOrders: 3,
    /** ROI ≥ k × ROI mục tiêu */
    roiTargetX: 1,
  },
  'campaign-scale': {
    minBudgetUsePct: 90,
    roiTargetX: 1,
    budgetChangePct: 20,
  },
  'campaign-slow': {
    maxBudgetUsePct: 50,
    roiTargetChangePct: -10,
  },
  'video-authorize': {},
  'video-concentration': {
    /** Số video doanh thu cao nhất */
    topN: 3,
    /** Chiếm ≥ % doanh thu quảng cáo cả shop */
    minSharePct: 60,
    /** Chỉ xét khi shop có ≥ N video có doanh thu */
    minVideos: 5,
  },
  'product-few-videos': {
    /** ≥ % video của sản phẩm bị TikTok báo không khả dụng */
    unavailableSharePct: 50,
    /** hoặc chỉ còn ≤ N video đang chạy */
    maxRunningVideos: 2,
  },
} as const satisfies Record<SuggestionId, Record<string, number>>;

/** Ngưỡng tiền dự phòng khi chưa tính được CPA hoà vốn (sản phẩm chưa có đơn / chưa nhập hoà vốn) */
export const FALLBACK_CPA_VND = 100_000;

export type SuggestionParams<K extends SuggestionId> = { [P in keyof (typeof SUGGESTION_PARAMS)[K]]: number };

/** Hệ số của gợi ý cho shop này = mặc định chung + phần shop ghi đè */
export function suggestParams<K extends SuggestionId>(settings: AdsSettings, id: K): SuggestionParams<K> {
  const own = settings.suggestOverrides?.[id]?.params ?? {};
  const merged: Record<string, number> = { ...SUGGESTION_PARAMS[id] };
  for (const key of Object.keys(merged)) {
    const v = own[key];
    if (typeof v === 'number' && Number.isFinite(v)) merged[key] = v;
  }
  return merged as SuggestionParams<K>;
}

export const isSuggestionOff = (settings: AdsSettings, id: SuggestionId) => settings.suggestOverrides?.[id]?.off === true;

/**
 * CPA hoà vốn của từng sản phẩm = giá trị đơn trung bình ÷ ROI hoà vốn
 * = số tiền quảng cáo tối đa cho 1 đơn mà vẫn hoà vốn.
 * Giá trị đơn TB lấy theo mọi chiến dịch của sản phẩm trong kỳ. Thiếu đơn / thiếu hoà vốn → không có trong map.
 */
export function cpaBreakEvenMap(snapshot: AdsSnapshot, settings: AdsSettings): Map<string, number> {
  const totals = new Map<string, { revenue: number; orders: number }>();
  for (const p of snapshot.products) {
    const t = totals.get(p.id) ?? { revenue: 0, orders: 0 };
    t.revenue += p.revenue ?? 0;
    t.orders += p.orders ?? 0;
    totals.set(p.id, t);
  }
  const out = new Map<string, number>();
  for (const [id, t] of totals) {
    const be = breakEvenOf(settings, id);
    if (be == null || t.orders <= 0 || t.revenue <= 0) continue;
    out.set(id, t.revenue / t.orders / be);
  }
  return out;
}
