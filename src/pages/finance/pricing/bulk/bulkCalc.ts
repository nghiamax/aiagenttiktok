// Tính từng dòng của bảng tính hàng loạt — dùng đúng công thức của calc.ts
import { computeFromPrice, priceForMargin, roundUpPrice, type FeeLine, type PricingResult } from '../calc';

export interface BulkBase {
  fees: FeeLine[];
  adsPct: number;
  /** Hoa hồng KOC theo nguồn đơn đang chọn (%) */
  affiliatePct?: number;
  taxPct: number;
  applyLogistics: boolean;
  /** Lãi mong muốn (% giá bán) để tính giá đề xuất */
  marginPct: number;
}

export interface BulkRowInput {
  cost: number | null;
  price: number | null;
  categoryPct: number;
  weightG: number | null;
}

export type BulkStatus = 'missing-cost' | 'missing-price' | 'impossible' | 'loss' | 'below-target' | 'ok';

export interface BulkRowResult {
  /** Lãi tại giá bán hiện tại (cần giá vốn + giá bán) */
  current: PricingResult | null;
  /** Giá đề xuất để đạt lãi mong muốn (làm tròn lên 1.000đ) */
  suggested: number | null;
  /** Giá đề xuất − giá bán hiện tại */
  diff: number | null;
  status: BulkStatus;
}

export function computeBulkRow(row: BulkRowInput, base: BulkBase): BulkRowResult {
  const input = {
    cost: row.cost ?? 0,
    categoryPct: row.categoryPct,
    fees: base.fees,
    adsPct: base.adsPct,
    affiliatePct: base.affiliatePct ?? 0,
    taxPct: base.taxPct,
    weightKg: (row.weightG ?? 0) / 1000,
    applyLogistics: base.applyLogistics,
  };
  if (row.cost == null || row.cost <= 0) {
    return {
      current: null,
      suggested: null,
      diff: null,
      status: 'missing-cost',
    };
  }
  const exact = priceForMargin(base.marginPct, input);
  const suggested = exact == null ? null : roundUpPrice(exact);
  const current = row.price != null && row.price > 0 ? computeFromPrice(row.price, input) : null;
  const diff = suggested != null && current ? suggested - current.price : null;
  let status: BulkStatus;
  if (!current) status = suggested == null ? 'impossible' : 'missing-price';
  else if (current.profit < 0) status = 'loss';
  else if ((current.marginPct ?? 0) < base.marginPct - 1e-9) status = 'below-target';
  else status = 'ok';
  return { current, suggested, diff, status };
}
