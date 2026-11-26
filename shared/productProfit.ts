/**
 * Lợi nhuận 1 đơn của từng sản phẩm (Sếp chốt 26/11) = giá khách trả ÷ ROI hoà vốn
 * (ROI hoà vốn = giá bán ÷ lợi nhuận gộp trước quảng cáo → lợi nhuận = giá bán ÷ ROI hoà vốn)
 * = tiền quảng cáo tối đa cho 1 đơn mà vẫn hoà vốn — dùng cho điều kiện "Chi phí ≥ k lần lợi nhuận 1 đơn".
 *
 * Ưu tiên: lợi nhuận 1 đơn Sếp nhập (`settings.profitPerOrder`, nhập ở Phân nhóm — Sếp chốt 26/11)
 * → còn lại tính = giá ÷ ROI hoà vốn. Giá tự lấy (TikTok không trả giá khuyến mãi — đã kiểm 26/11), ưu tiên:
 *   1. Giá trị đơn trung bình = doanh thu ÷ đơn của sản phẩm (mọi chiến dịch), 30 → 14 → 7 ngày
 *   2. Giá niêm yết TikTok Shop (`AdsProduct.listPrice`, sản phẩm chưa có đơn)
 * Không có số nhập và thiếu giá / ROI hoà vốn → KHÔNG đoán (Sếp chốt 26/11: bỏ mức tạm 100k) — điều kiện "lần lợi nhuận 1 đơn" không khớp.
 * Cả 3 khung xét nhóm dùng cùng một mức.
 */
import type { AdsSnapshot } from './adsSnapshot.js';
import { breakEvenOf, type AdsSettings } from './settings.js';

export type PriceSource = 'aov' | 'list';

export interface ProductPrice {
  price: number;
  source: PriceSource;
}

/** ID sản phẩm → lợi nhuận 1 đơn (VND). Sản phẩm không có trong map = chưa tính được */
export type ProfitMap = Map<string, number>;

type Snaps = { d7: AdsSnapshot | null; d14: AdsSnapshot | null; d30: AdsSnapshot | null };

/** Giá trị đơn trung bình từng sản phẩm của 1 snapshot (mọi chiến dịch) */
function aovOf(s: AdsSnapshot): Map<string, number> {
  const t = new Map<string, { revenue: number; orders: number }>();
  for (const p of s.products) {
    const x = t.get(p.id) ?? { revenue: 0, orders: 0 };
    x.revenue += p.revenue ?? 0;
    x.orders += p.orders ?? 0;
    t.set(p.id, x);
  }
  const out = new Map<string, number>();
  for (const [id, x] of t) if (x.orders > 0 && x.revenue > 0) out.set(id, x.revenue / x.orders);
  return out;
}

/** Giá dùng để tính (kèm nguồn) — cho mọi sản phẩm có trong 7 / 14 / 30 ngày */
export function productPrices(snaps: Snaps): Map<string, ProductPrice> {
  const list = [snaps.d30, snaps.d14, snaps.d7].filter((s): s is AdsSnapshot => !!s);
  const out = new Map<string, ProductPrice>();
  for (const s of list) for (const [id, aov] of aovOf(s)) if (!out.has(id)) out.set(id, { price: aov, source: 'aov' });
  // Giá niêm yết: snapshot mới nhất có giá
  for (const s of [...list].reverse()) {
    for (const p of s.products) if (!out.has(p.id) && p.listPrice && p.listPrice > 0) out.set(p.id, { price: p.listPrice, source: 'list' });
  }
  return out;
}

/** Lợi nhuận 1 đơn Sếp nhập (số dương), không có → null */
export function manualProfitOf(settings: AdsSettings, productId: string): number | null {
  const v = settings.profitPerOrder?.[productId];
  return typeof v === 'number' && v > 0 ? v : null;
}

/** Lợi nhuận 1 đơn = số Sếp nhập, không có thì giá ÷ ROI hoà vốn; thiếu cả hai → không có trong map */
export function profitPerOrderMap(snaps: Snaps, settings: AdsSettings): ProfitMap {
  const out: ProfitMap = new Map();
  for (const [id, { price }] of productPrices(snaps)) {
    const be = breakEvenOf(settings, id);
    if (be != null) out.set(id, price / be);
  }
  for (const id of Object.keys(settings.profitPerOrder ?? {})) {
    const v = manualProfitOf(settings, id);
    if (v != null) out.set(id, v);
  }
  return out;
}

/** Bối cảnh so điều kiện: lợi nhuận 1 đơn của sản phẩm. Không có bảng / thiếu số → null (điều kiện không khớp) */
export function profitContext(profit: ProfitMap | undefined, productId: string): { profitPerOrder: number | null } {
  return { profitPerOrder: profit?.get(productId) ?? null };
}
