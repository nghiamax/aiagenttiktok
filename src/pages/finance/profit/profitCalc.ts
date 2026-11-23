// Tính lợi nhuận thật từ dữ liệu đã đọc (logic thuần, test ở tests/profit.test.ts).
//
// Cách đối chiếu:
//  1. Kỳ tính = các đơn trong file "Tất cả đơn hàng" (nếu có). Không có file đơn hàng → lấy mọi dòng quyết toán.
//  2. Mỗi đơn tìm dòng quyết toán theo ID đơn (dòng điều chỉnh trỏ về đơn gốc qua "ID đơn hàng liên quan").
//     Đã quyết toán → số thật · chỉ có trong file chờ quyết toán → số ước tính (bật/tắt được) · không có → chưa có số.
//  3. Giá vốn = giá vốn SKU × (số lượng − số lượng trả); đơn huỷ / hoàn tiền toàn bộ không tính giá vốn.
//  4. Lợi nhuận = tiền về (quyết toán) − giá vốn − quảng cáo − chi phí khác.

import { FEE_GROUPS, type AdsRow, type IncomeRow, type OrderLine } from './profitImport';
import { fold } from '../pricing/import/categoryImport';

export type OrderState = 'completed' | 'returned' | 'cancelled' | 'in_progress';
export type MoneySource = 'settled' | 'unsettled' | 'none';

export interface OtherCost {
  id: string;
  label: string;
  /** perOrder: đ / đơn (đơn không huỷ) · pctRevenue: % doanh thu · fixed: số tiền cả kỳ */
  kind: 'perOrder' | 'pctRevenue' | 'fixed';
  value: number;
}

export interface ProfitOptions {
  /** Cộng cả đơn chờ quyết toán (số ước tính) */
  includeUnsettled: boolean;
  /** Phí GMV Max đã trừ trong quyết toán → bớt khỏi chi phí file quảng cáo để không tính 2 lần */
  dedupeGmvMax: boolean;
}

export interface ProfitData {
  orders: OrderLine[];
  income: IncomeRow[];
  ads: AdsRow[];
}

export interface OrderResult {
  orderId: string;
  state: OrderState;
  source: MoneySource;
  createdAt: string | null;
  lines: OrderLine[];
  revenue: number;
  fees: number;
  settlement: number;
  cogs: number;
  /** Giá trị hàng (tiền hàng sau giảm giá) — để báo đơn chưa có số quyết toán */
  goodsValue: number;
}

export interface SkuResult {
  key: string;
  skuId: string | null;
  productName: string;
  variation: string | null;
  orders: number;
  /** Số lượng bán ròng (trừ trả hàng, bỏ đơn huỷ) */
  qty: number;
  revenue: number;
  fees: number;
  settlement: number;
  cost: number | null;
  cogs: number;
  /** Lãi trước quảng cáo = tiền về − giá vốn */
  profit: number;
}

export interface FeeLineResult {
  key: string;
  label: string;
  amount: number;
}

export interface ProfitResult {
  hasOrders: boolean;
  hasIncome: boolean;
  hasAds: boolean;
  period: { from: string; to: string } | null;
  counts: Record<OrderState, number> & { total: number; settled: number; unsettled: number; none: number };
  revenue: number;
  fees: number;
  /** Tiền đã về (quyết toán thật) */
  settled: number;
  /** Tiền chờ về (ước tính, chỉ cộng khi bật includeUnsettled) */
  unsettled: number;
  /** Điều chỉnh / khoản không gắn đơn trong kỳ */
  adjustments: number;
  cogs: number;
  adsFile: number;
  /** Phí GMV Max đã trừ trong quyết toán (số dương) */
  gmvInSettlement: number;
  ads: number;
  other: number;
  otherLines: { id: string; label: string; amount: number }[];
  profit: number;
  /** Lợi nhuận / doanh thu (%) */
  marginPct: number | null;
  feeLines: FeeLineResult[];
  skus: SkuResult[];
  orderResults: OrderResult[];
  /** Đơn không huỷ nhưng chưa có số quyết toán */
  noMoney: { count: number; goodsValue: number };
  /** Dòng quyết toán của đơn không có trong file đơn hàng (ngoài kỳ) — không tính */
  outOfPeriod: { count: number; settlement: number };
  /** SKU đã bán nhưng chưa có giá vốn */
  missingCost: { skus: number; qty: number };
}

const has = (s: string, re: RegExp) => re.test(fold(s));

/** Trạng thái đơn từ "Order Status" / "Substatus" / "Cancelation/Return Type" / số lượng trả */
export function orderState(lines: OrderLine[]): OrderState {
  const l = lines[0];
  const text = `${l.status} ${l.substatus}`;
  const qty = lines.reduce((s, x) => s + x.qty, 0);
  const ret = lines.reduce((s, x) => s + x.returnQty, 0);
  if (has(l.cancelType, /(return|refund|tra hang|hoan tien)/)) return 'returned';
  // Đơn huỷ: TikTok vẫn ghi "số lượng trả" = số lượng → xét huỷ trước số lượng trả
  if (has(text, /(da huy|huy don|cancel)/) || has(l.cancelType, /(cancel|huy)/)) return 'cancelled';
  if (ret > 0) return 'returned';
  if (has(text, /(hoan tat|completed|da giao|delivered)/)) return 'completed';
  return qty > 0 ? 'in_progress' : 'cancelled';
}

const skuKey = (l: OrderLine) => l.skuId ?? `${fold(l.productName)}|${fold(l.variation ?? '')}`;

/** Gộp dữ liệu nhiều file: dòng trùng khoá lấy file sau */
export function mergeData(parts: ProfitData[]): ProfitData {
  const orders = new Map<string, OrderLine>();
  const income = new Map<string, IncomeRow>();
  const ads = new Map<string, AdsRow>();
  for (const p of parts) {
    for (const o of p.orders) orders.set(`${o.orderId}|${o.skuId ?? o.productName}|${o.variation ?? ''}`, o);
    // dòng đã quyết toán không bị dòng "chờ quyết toán" cũ đè
    for (const r of p.income) {
      const k = `${r.id}|${r.type}`;
      const prev = income.get(k);
      if (!prev || r.settled || !prev.settled) income.set(k, r);
    }
    for (const a of p.ads) ads.set(a.key, a);
  }
  return { orders: [...orders.values()], income: [...income.values()], ads: [...ads.values()] };
}

const sumBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

export function computeProfit(
  data: ProfitData,
  costs: Record<string, number>,
  otherCosts: OtherCost[],
  options: ProfitOptions,
): ProfitResult {
  const hasOrders = data.orders.length > 0;
  const hasIncome = data.income.length > 0;
  const hasAds = data.ads.length > 0;

  // Quyết toán theo đơn
  const incomeByOrder = new Map<string, IncomeRow[]>();
  for (const r of data.income) {
    const k = r.orderId ?? r.id;
    incomeByOrder.set(k, [...(incomeByOrder.get(k) ?? []), r]);
  }

  // Đơn hàng
  const linesByOrder = new Map<string, OrderLine[]>();
  for (const l of data.orders) linesByOrder.set(l.orderId, [...(linesByOrder.get(l.orderId) ?? []), l]);

  const orderResults: OrderResult[] = [];
  const usedIncome = new Set<IncomeRow>();
  let missingCostSkus = new Set<string>();
  let missingCostQty = 0;

  for (const [orderId, lines] of linesByOrder) {
    const state = orderState(lines);
    const rows = incomeByOrder.get(orderId) ?? [];
    const settledRows = rows.filter((r) => r.settled);
    const unsettledRows = rows.filter((r) => !r.settled);
    let source: MoneySource = 'none';
    let picked: IncomeRow[] = [];
    if (settledRows.length) {
      source = 'settled';
      picked = settledRows;
    } else if (unsettledRows.length) {
      source = 'unsettled';
      picked = options.includeUnsettled ? unsettledRows : [];
    }
    for (const r of rows) usedIncome.add(r);
    const revenue = sumBy(picked, (r) => r.revenue);
    const fees = sumBy(picked, (r) => r.fees);
    const settlement = sumBy(picked, (r) => r.settlement);

    // Giá vốn: bỏ đơn huỷ, đơn đã quyết toán mà doanh thu ≤ 0 (hoàn tiền toàn bộ)
    const refundedAll = source === 'settled' && revenue <= 0;
    let cogs = 0;
    if (state !== 'cancelled' && !refundedAll) {
      for (const l of lines) {
        const q = Math.max(0, l.qty - l.returnQty);
        if (q <= 0) continue;
        const c = costs[skuKey(l)];
        if (c == null || c <= 0) {
          missingCostSkus.add(skuKey(l));
          missingCostQty += q;
        } else cogs += c * q;
      }
    }
    orderResults.push({
      orderId,
      state,
      source,
      createdAt: lines[0].createdAt,
      lines,
      revenue,
      fees,
      settlement,
      cogs,
      goodsValue: sumBy(lines, (l) => l.subtotal),
    });
  }

  // Dòng quyết toán không gắn đơn nào trong file đơn hàng
  let outCount = 0;
  let outSettlement = 0;
  const adjustmentRows: IncomeRow[] = [];
  for (const r of data.income) {
    if (usedIncome.has(r)) continue;
    if (!r.settled && !options.includeUnsettled) continue;
    const isOrderRow = has(r.type, /(^|\s)(don hang|order)$/);
    if (hasOrders && isOrderRow) {
      outCount++;
      outSettlement += r.settlement;
    } else adjustmentRows.push(r);
  }
  if (!hasOrders) missingCostSkus = new Set();

  // Không có file đơn hàng → mọi dòng quyết toán đều tính (dòng "đơn hàng" coi như đơn)
  const moneyRows = [
    ...orderResults.flatMap((o) =>
      (incomeByOrder.get(o.orderId) ?? []).filter((r) =>
        o.source === 'settled' ? r.settled : o.source === 'unsettled' && options.includeUnsettled,
      ),
    ),
    ...adjustmentRows,
  ];
  const revenue = sumBy(moneyRows, (r) => r.revenue);
  const fees = sumBy(moneyRows, (r) => r.fees);
  const settled = sumBy(
    moneyRows.filter((r) => r.settled),
    (r) => r.settlement,
  );
  const unsettled = sumBy(
    moneyRows.filter((r) => !r.settled),
    (r) => r.settlement,
  );
  const adjustments = hasOrders ? sumBy(adjustmentRows, (r) => r.settlement) : sumBy(moneyRows, (r) => r.adjustment);
  const cogs = sumBy(orderResults, (o) => o.cogs);

  // Phí theo nhóm
  const feeLines: FeeLineResult[] = FEE_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    amount: sumBy(moneyRows, (r) => r.feeParts[g.key] ?? 0),
  }));
  const rest = fees - sumBy(feeLines, (f) => f.amount);
  if (Math.abs(rest) >= 1) feeLines.push({ key: 'other', label: 'Phí khác', amount: rest });

  // Quảng cáo
  const adsFile = sumBy(data.ads, (a) => a.cost);
  const gmvInSettlement = -(feeLines.find((f) => f.key === 'gmvMax')?.amount ?? 0);
  const ads = options.dedupeGmvMax ? Math.max(0, adsFile - Math.max(0, gmvInSettlement)) : adsFile;

  // Chi phí khác
  const countedOrders =
    orderResults.filter((o) => o.state !== 'cancelled').length || (hasOrders ? 0 : moneyRows.length);
  const otherLines = otherCosts
    .filter((c) => c.value > 0)
    .map((c) => ({
      id: c.id,
      label: c.label,
      amount:
        c.kind === 'perOrder' ? c.value * countedOrders : c.kind === 'pctRevenue' ? (revenue * c.value) / 100 : c.value,
    }));
  const other = sumBy(otherLines, (l) => l.amount);

  const profit = settled + unsettled - cogs - ads - other;

  // Theo SKU: chia tiền của đơn cho từng dòng theo tiền hàng (không có thì theo số lượng)
  const skuMap = new Map<string, SkuResult & { orderSet: Set<string> }>();
  for (const o of orderResults) {
    const base = sumBy(o.lines, (l) => l.subtotal);
    const baseQty = sumBy(o.lines, (l) => l.qty);
    for (const l of o.lines) {
      const share = base > 0 ? l.subtotal / base : baseQty > 0 ? l.qty / baseQty : 1 / o.lines.length;
      const k = skuKey(l);
      const s =
        skuMap.get(k) ??
        ({
          key: k,
          skuId: l.skuId,
          productName: l.productName,
          variation: l.variation,
          orders: 0,
          qty: 0,
          revenue: 0,
          fees: 0,
          settlement: 0,
          cost: costs[k] ?? null,
          cogs: 0,
          profit: 0,
          orderSet: new Set<string>(),
        } as SkuResult & { orderSet: Set<string> });
      s.orderSet.add(o.orderId);
      const refundedAll = o.source === 'settled' && o.revenue <= 0;
      const q = o.state === 'cancelled' || refundedAll ? 0 : Math.max(0, l.qty - l.returnQty);
      s.qty += q;
      s.revenue += o.revenue * share;
      s.fees += o.fees * share;
      s.settlement += o.settlement * share;
      if (s.cost != null && s.cost > 0) s.cogs += s.cost * q;
      skuMap.set(k, s);
    }
  }
  const skus = [...skuMap.values()]
    .map(({ orderSet, ...s }) => ({ ...s, orders: orderSet.size, profit: s.settlement - s.cogs }))
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty);

  const dates = [
    ...orderResults.map((o) => o.createdAt),
    ...(hasOrders ? [] : data.income.map((r) => r.createdAt)),
  ].filter((d): d is string => !!d);
  dates.sort();

  const counts = {
    total: orderResults.length,
    completed: orderResults.filter((o) => o.state === 'completed').length,
    returned: orderResults.filter((o) => o.state === 'returned').length,
    cancelled: orderResults.filter((o) => o.state === 'cancelled').length,
    in_progress: orderResults.filter((o) => o.state === 'in_progress').length,
    settled: orderResults.filter((o) => o.source === 'settled').length,
    unsettled: orderResults.filter((o) => o.source === 'unsettled').length,
    none: orderResults.filter((o) => o.source === 'none').length,
  };
  const noMoneyOrders = orderResults.filter(
    (o) => o.state !== 'cancelled' && (o.source === 'none' || (o.source === 'unsettled' && !options.includeUnsettled)),
  );

  return {
    hasOrders,
    hasIncome,
    hasAds,
    period: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    counts,
    revenue,
    fees,
    settled,
    unsettled,
    adjustments,
    cogs,
    adsFile,
    gmvInSettlement: Math.max(0, gmvInSettlement),
    ads,
    other,
    otherLines,
    profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
    feeLines: feeLines.filter((f) => Math.abs(f.amount) >= 1),
    skus,
    orderResults,
    noMoney: { count: noMoneyOrders.length, goodsValue: sumBy(noMoneyOrders, (o) => o.goodsValue) },
    outOfPeriod: { count: outCount, settlement: outSettlement },
    missingCost: { skus: missingCostSkus.size, qty: missingCostQty },
  };
}

/** Mã đơn của kỳ để đếm giới hạn gói Miễn phí: theo file đơn hàng; không có thì theo dòng quyết toán gắn đơn */
export function profitOrderIds(data: ProfitData): string[] {
  const ids = data.orders.length ? data.orders.map((o) => o.orderId) : data.income.map((r) => r.orderId ?? '');
  return [...new Set(ids.filter(Boolean))];
}

/** Chỉ giữ đơn được phép (gói Miễn phí): bỏ dòng đơn hàng + dòng quyết toán của đơn chưa được tính */
export function limitOrders(data: ProfitData, allowed: Set<string>): ProfitData {
  const all = new Set(profitOrderIds(data));
  const blocked = (id: string | null) => !!id && all.has(id) && !allowed.has(id);
  return {
    orders: data.orders.filter((o) => !blocked(o.orderId)),
    income: data.income.filter((r) => !blocked(r.orderId)),
    ads: data.ads,
  };
}
