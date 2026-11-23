// Logic thuần của máy tính giá bán (không phụ thuộc React) — có test ở tests/pricing.test.ts

export type Platform = 'tiktok' | 'shopee';
export type ShopType = 'standard' | 'mall';

/** Một khoản phí của sàn: theo % giá bán hoặc số tiền cố định mỗi đơn */
export interface FeeLine {
  id: string;
  label: string;
  kind: 'pct' | 'fixed';
  /** % (vd 5 = 5%) hoặc đồng / đơn */
  value: number;
}

/** Phí vận hành logistics theo cân nặng (TikTok Shop, từ 12/10/2026) */
export const LOGISTICS_RULE = {
  freeBelowKg: 10,
  baseFee: 3_000,
  stepKg: 0.5,
  stepFee: 3_000,
  maxFee: 65_000,
} as const;

/** Dưới 10kg: 0đ · từ 10kg: 3.000đ, cứ thêm 0,5kg +3.000đ · tối đa 65.000đ / đơn */
export function logisticsFee(weightKg: number): number {
  const r = LOGISTICS_RULE;
  if (!Number.isFinite(weightKg) || weightKg < r.freeBelowKg) return 0;
  const steps = Math.floor((weightKg - r.freeBelowKg) / r.stepKg + 1e-9);
  return Math.min(r.maxFee, r.baseFee + steps * r.stepFee);
}

export interface PricingInput {
  /** Giá vốn mỗi sản phẩm (đ) */
  cost: number;
  /** Phí ngành (% giá bán) */
  categoryPct: number;
  /** Các khoản phí khác của sàn */
  fees: FeeLine[];
  /** Chi phí quảng cáo (% giá bán) */
  adsPct: number;
  /** Hoa hồng tiếp thị liên kết trả KOC (% giá bán) — theo nguồn đơn hàng */
  affiliatePct?: number;
  /** Tên khoản hoa hồng hiển thị, vd "Hoa hồng KOC (tiêu chuẩn)" */
  affiliateLabel?: string;
  /** Thuế sàn khấu trừ (% giá bán) */
  taxPct: number;
  /** Cân nặng mỗi đơn (kg) — chỉ dùng khi applyLogistics */
  weightKg: number;
  applyLogistics: boolean;
}

export interface Deduction {
  id: string;
  label: string;
  /** % giá bán, null nếu là phí cố định */
  pct: number | null;
  amount: number;
}

export interface PricingResult {
  price: number;
  deductions: Deduction[];
  totalDeductions: number;
  /** Tiền về sau khi trừ mọi khoản (chưa trừ giá vốn) */
  netReceived: number;
  profit: number;
  /** Lãi / giá bán (%) */
  marginPct: number | null;
  /** Lãi / giá vốn (%) */
  markupPct: number | null;
  /** Giá bán hoà vốn (lãi = 0), null nếu tổng % phí ≥ 100% */
  breakEvenPrice: number | null;
}

interface PctItem {
  id: string;
  label: string;
  pct: number;
}

function pctItems(input: PricingInput): PctItem[] {
  const items: PctItem[] = [
    { id: 'category', label: 'Phí ngành hàng', pct: input.categoryPct },
    ...input.fees.filter((f) => f.kind === 'pct').map((f) => ({ id: f.id, label: f.label, pct: f.value })),
    {
      id: 'affiliate',
      label: input.affiliateLabel ?? 'Hoa hồng tiếp thị liên kết',
      pct: input.affiliatePct ?? 0,
    },
    { id: 'ads', label: 'Quảng cáo', pct: input.adsPct },
    { id: 'tax', label: 'Thuế sàn khấu trừ', pct: input.taxPct },
  ];
  return items.filter((i) => i.pct > 0);
}

function fixedItems(input: PricingInput): { id: string; label: string; amount: number }[] {
  const items = input.fees
    .filter((f) => f.kind === 'fixed' && f.value > 0)
    .map((f) => ({ id: f.id, label: f.label, amount: f.value }));
  if (input.applyLogistics) {
    const fee = logisticsFee(input.weightKg);
    if (fee > 0) items.push({ id: 'logistics', label: 'Phí vận hành logistics', amount: fee });
  }
  return items;
}

/** Tổng % phí (theo giá bán) và tổng phí cố định mỗi đơn */
export function feeTotals(input: PricingInput): { pct: number; fixed: number } {
  return {
    pct: pctItems(input).reduce((s, i) => s + i.pct, 0),
    fixed: fixedItems(input).reduce((s, i) => s + i.amount, 0),
  };
}

/** Có giá bán → tính lãi */
export function computeFromPrice(price: number, input: PricingInput): PricingResult {
  const deductions: Deduction[] = [
    ...pctItems(input).map((i) => ({ id: i.id, label: i.label, pct: i.pct, amount: (price * i.pct) / 100 })),
    ...fixedItems(input).map((i) => ({ ...i, pct: null })),
  ];
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const netReceived = price - totalDeductions;
  const profit = netReceived - input.cost;
  const { pct, fixed } = feeTotals(input);
  const keep = 1 - pct / 100;
  return {
    price,
    deductions,
    totalDeductions,
    netReceived,
    profit,
    marginPct: price > 0 ? (profit / price) * 100 : null,
    markupPct: input.cost > 0 ? (profit / input.cost) * 100 : null,
    breakEvenPrice: keep > 0 ? (input.cost + fixed) / keep : null,
  };
}

/**
 * Muốn lãi X% giá bán → giá bán tối thiểu.
 * Giá × (1 − tổng % phí − X%) = giá vốn + phí cố định.
 * Trả null khi tổng % phí + X% ≥ 100% (không có giá nào đạt).
 */
export function priceForMargin(marginPct: number, input: PricingInput): number | null {
  const { pct, fixed } = feeTotals(input);
  const keep = 1 - (pct + marginPct) / 100;
  if (keep <= 0) return null;
  return (input.cost + fixed) / keep;
}

/**
 * Muốn lãi A đồng mỗi sản phẩm → giá bán tối thiểu.
 * Giá × (1 − tổng % phí) = giá vốn + phí cố định + A. Trả null khi tổng % phí ≥ 100%.
 */
export function priceForProfit(amount: number, input: PricingInput): number | null {
  const { pct, fixed } = feeTotals(input);
  const keep = 1 - pct / 100;
  if (keep <= 0) return null;
  return (input.cost + fixed + amount) / keep;
}

/** Mục tiêu lãi: theo % giá bán hoặc số tiền mỗi sản phẩm */
export interface ProfitTarget {
  kind: 'pct' | 'amount';
  value: number;
}

export const priceForTarget = (t: ProfitTarget, input: PricingInput) =>
  t.kind === 'amount' ? priceForProfit(t.value, input) : priceForMargin(t.value, input);

/** Làm tròn giá lên bội số `step` (mặc định 1.000đ) */
export function roundUpPrice(price: number, step = 1_000): number {
  return Math.ceil(price / step - 1e-9) * step;
}
