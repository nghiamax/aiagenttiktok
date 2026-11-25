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

export type OtherCostKind = 'perOrder' | 'perReturn' | 'perCancel' | 'perUnit' | 'pctRevenue' | 'fixed';

/** Cơ sở để tính chi phí khác (số đơn, số sản phẩm, doanh thu của kỳ) */
export interface OtherCostBases {
  orders: number;
  returned: number;
  cancelled: number;
  units: number;
  revenue: number;
}

/** Số tiền 1 khoản chi phí khác theo cơ sở của kỳ */
export function otherCostAmount(c: Pick<OtherCost, 'kind' | 'value'>, b: OtherCostBases): number {
  switch (c.kind) {
    case 'perOrder':
      return c.value * b.orders;
    case 'perReturn':
      return c.value * b.returned;
    case 'perCancel':
      return c.value * b.cancelled;
    case 'perUnit':
      return c.value * b.units;
    case 'pctRevenue':
      return (b.revenue * c.value) / 100;
    default:
      return c.value;
  }
}

export interface OtherCost {
  id: string;
  label: string;
  /**
   * perOrder: đ / đơn bán (đơn không huỷ) · perReturn: đ / đơn hoàn (trả hàng) · perCancel: đ / đơn huỷ ·
   * perUnit: đ / sản phẩm bán ra (đã trừ trả hàng) · pctRevenue: % doanh thu · fixed: số tiền cả kỳ
   */
  kind: OtherCostKind;
  value: number;
}

export interface ProfitOptions {
  /** Cộng cả đơn chờ quyết toán (số ước tính) */
  includeUnsettled: boolean;
  /** Phí GMV Max đã trừ trong quyết toán → bớt khỏi chi phí file quảng cáo để không tính 2 lần */
  dedupeGmvMax: boolean;
  /**
   * TikTok: shop có tham gia chương trình Hoàn phí vận chuyển (mặc định = như file). false = tính thử "nếu không đăng ký":
   * bỏ "Phí dịch vụ SFR" và cả "Hoàn tiền chương trình đảm bảo" (`withoutSfr`)
   */
  sfrEnrolled?: boolean;
  /**
   * Kỳ tính: `order` = đơn đặt trong kỳ của file đơn hàng (mặc định) · `payment` = mọi đơn / khoản sàn ĐÃ TRẢ
   * trong file quyết toán (khớp báo cáo thu nhập tháng của Shopee); không dùng số ước tính
   */
  basis?: ProfitBasis;
}

export type ProfitBasis = 'order' | 'payment';
const ORDER_ROW = /(^|\s)(don hang|order)$/;
/** Phí GMV Max trừ thẳng trong từng đơn (đã nằm trong chi phí file quảng cáo) */
const GMV_KEYS = new Set(['gmvMax', 'gmvVoucher', 'gmvVoucherTax', 'gmvAds']);
/**
 * Dòng TikTok "GMV thanh toán cho Quảng cáo TikTok" = tiền trích từ số dư đã quyết toán để NẠP ví quảng cáo
 * (không phải phí). Có file quảng cáo → chi phí quảng cáo lấy theo file, dòng nạp tiền không trừ thêm (tránh tính 2 lần).
 */
const ADS_TOPUP = /(thanh toan cho quang (cao|ba)|nap tien quang cao)/;

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
  /** Quảng cáo chia cho SKU (chỉ khi file quảng cáo có chi tiết theo sản phẩm, vd Shopee) */
  ads: number;
}

export interface FeeLineResult {
  key: string;
  label: string;
  amount: number;
  /** Nhóm hiển thị (Phí sàn, Vận chuyển, Hoa hồng liên kết…) */
  section?: string;
}

export interface ProfitResult {
  hasOrders: boolean;
  hasIncome: boolean;
  /** Có dòng tiền đã quyết toán / đã thanh toán thật (Shopee: file "Đã thanh toán") */
  hasSettled: boolean;
  /** Khoản điều chỉnh đã tính (không phải dòng đơn hàng) theo loại, vd "Trả hàng/ Hoàn tiền", "Chương trình Marketing" */
  adjustmentLines: { label: string; count: number; amount: number }[];
  /** Dòng đơn đã tính theo file nguồn (Shopee: Shop / Shopee Xử Lý) → đối chiếu từng báo cáo */
  incomeBySource: SourceTotals[];
  /**
   * TikTok "GMV thanh toán cho Quảng cáo TikTok" (nạp ví quảng cáo từ số dư, số âm). counted = false → không trừ vào
   * tiền về / lợi nhuận vì chi phí quảng cáo đã lấy theo file quảng cáo
   */
  adsTopup: { count: number; amount: number; counted: boolean };
  /** Kỳ tính thực tế (payment chỉ khi có dòng đã quyết toán) */
  basis: ProfitBasis;
  /** Theo ngày thanh toán: khoảng ngày sàn trả tiền */
  paidPeriod: { from: string; to: string } | null;
  /** Theo ngày thanh toán: đơn đã trả không có trong file đơn hàng → không có giá vốn */
  paidNoOrder: { count: number; settlement: number };
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
  otherLines: { id: string; label: string; kind: OtherCostKind; value: number; amount: number }[];
  /** Cơ sở tính chi phí khác (để hiện phép tính trên giao diện) */
  otherBases: OtherCostBases;
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
  /** File quảng cáo có chi tiết theo sản phẩm → bảng SKU có cột quảng cáo */
  adsBySku: boolean;
  /** Quảng cáo của sản phẩm không có trong file đơn hàng (không chia được) */
  adsUnmatched: number;
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
  if (has(text, /(hoan tat|hoan thanh|completed|da giao|giao thanh cong|delivered)/)) return 'completed';
  return qty > 0 ? 'in_progress' : 'cancelled';
}

const skuKey = (l: OrderLine) => l.skuId ?? `${fold(l.productName)}|${fold(l.variation ?? '')}`;

/** Gộp dữ liệu nhiều file: dòng trùng khoá lấy file sau */
/** Khoản của chương trình Hoàn phí vận chuyển (TikTok) trong dữ liệu: phí SFR (âm) + tiền hoàn (dương) */
export function sfrTotals(data: ProfitData): { fee: number; refund: number; orders: number } {
  let fee = 0;
  let refund = 0;
  let orders = 0;
  for (const r of data.income) {
    const f = r.feeParts.sfr ?? 0;
    fee += f;
    refund += r.feeParts.sfrRefund ?? 0;
    if (f) orders++;
  }
  return { fee, refund, orders };
}

/**
 * Tính thử "nếu KHÔNG đăng ký chương trình Hoàn phí vận chuyển": mỗi dòng quyết toán bỏ phí SFR (được giữ lại tiền) và
 * bỏ tiền hoàn của chương trình (đơn trả / giao không thành công tự chịu phí ship) → tiền về đổi đúng phần đó
 */
export function withoutSfr(data: ProfitData): ProfitData {
  return {
    ...data,
    income: data.income.map((r) => {
      const delta = (r.feeParts.sfr ?? 0) + (r.feeParts.sfrRefund ?? 0);
      if (!delta) return r;
      const feeParts = { ...r.feeParts };
      delete feeParts.sfr;
      delete feeParts.sfrRefund;
      return { ...r, feeParts, fees: r.fees - delta, settlement: r.settlement - delta };
    }),
  };
}

export function mergeData(parts: ProfitData[]): ProfitData {
  const orders = new Map<string, OrderLine>();
  const income = new Map<string, IncomeRow>();
  const ads = new Map<string, AdsRow>();
  for (const p of parts) {
    for (const o of p.orders) orders.set(`${o.orderId}|${o.skuId ?? o.productName}|${o.variation ?? ''}`, o);
    // 1 đơn có thể được quyết toán nhiều lần (TikTok: −3.255đ ngày 14, −40.000đ ngày 15, +40.000đ ngày 18…) →
    // khoá gồm thời gian + số tiền + thứ tự lặp trong file: dòng thật khác nhau đều giữ, chỉ bỏ dòng trùng do tải 2 file chồng kỳ
    const seen = new Map<string, number>();
    // dòng đã quyết toán không bị dòng "chờ quyết toán" cũ đè
    for (const r of p.income) {
      const base = r.settled ? `${r.id}|${r.type}|${r.settledAt ?? ''}|${r.settlement}` : `${r.id}|${r.type}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const k = r.settled ? `${base}|${n}` : base;
      const prev = income.get(k);
      if (!prev || r.settled || !prev.settled) income.set(k, r);
    }
    for (const a of p.ads) ads.set(a.key, a);
  }
  // Đơn đã có dòng quyết toán thật → bỏ dòng "chờ quyết toán" / ước tính của chính đơn đó
  const settledKeys = new Set([...income.values()].filter((r) => r.settled).map((r) => `${r.id}|${r.type}`));
  const kept = [...income.values()].filter((r) => r.settled || !settledKeys.has(`${r.id}|${r.type}`));
  return { orders: [...orders.values()], income: kept, ads: [...ads.values()] };
}

function rangeOf(dates: (string | null)[]): { from: string; to: string } | null {
  const d = dates.filter((x): x is string => !!x).sort();
  return d.length ? { from: d[0], to: d[d.length - 1] } : null;
}

function adjustmentLinesOf(rows: IncomeRow[]) {
  const m = new Map<string, { label: string; count: number; amount: number }>();
  for (const r of rows) {
    if (has(r.type, ORDER_ROW)) continue;
    const label = r.type.trim() || 'Điều chỉnh';
    const cur = m.get(label) ?? { label, count: 0, amount: 0 };
    cur.count++;
    cur.amount += r.settlement;
    m.set(label, cur);
  }
  return [...m.values()].filter((x) => Math.abs(x.amount) >= 1).sort((a, b) => a.amount - b.amount);
}

/** Số của riêng 1 file quyết toán (Shopee: "Shop" / "Shopee Xử Lý") — để đối chiếu đúng từng báo cáo của sàn */
export interface SourceTotals {
  label: string;
  /** Số đơn */
  count: number;
  revenue: number;
  fees: number;
  /** Tổng tiền các đơn (chưa gồm điều chỉnh) */
  settlement: number;
  feeParts: Record<string, number>;
  adjustmentLines: { label: string; count: number; amount: number }[];
}

function incomeBySourceOf(rows: IncomeRow[]): SourceTotals[] {
  const m = new Map<string, { t: SourceTotals; adj: IncomeRow[] }>();
  for (const r of rows) {
    const label = r.source ?? '';
    const cur = m.get(label) ?? {
      t: { label, count: 0, revenue: 0, fees: 0, settlement: 0, feeParts: {}, adjustmentLines: [] },
      adj: [],
    };
    m.set(label, cur);
    if (!has(r.type, ORDER_ROW)) {
      cur.adj.push(r);
      continue;
    }
    cur.t.count++;
    cur.t.revenue += r.revenue;
    cur.t.fees += r.fees;
    cur.t.settlement += r.settlement;
    for (const [k, v] of Object.entries(r.feeParts)) cur.t.feeParts[k] = (cur.t.feeParts[k] ?? 0) + v;
  }
  return [...m.values()]
    .map(({ t, adj }) => ({ ...t, adjustmentLines: adjustmentLinesOf(adj) }))
    .sort((a, b) => b.settlement - a.settlement);
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
  const hasSettled = data.income.some((r) => r.settled);
  // Theo ngày thanh toán: chỉ dòng đã trả; chỉ đơn đã trả mới lấy dòng đơn hàng (để có giá vốn)
  const payment = options.basis === 'payment' && hasSettled;
  if (payment) {
    const income = data.income.filter((r) => r.settled);
    const paidIds = new Set(income.filter((r) => has(r.type, ORDER_ROW)).map((r) => r.orderId ?? r.id));
    data = { ...data, income, orders: data.orders.filter((l) => paidIds.has(l.orderId)) };
  }
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
    const settledOrderRows = settledRows.filter((r) => has(r.type, /(^|\s)(don hang|order)$/));
    if (settledRows.length && (settledOrderRows.length || !unsettledRows.length)) {
      source = 'settled';
      picked = settledRows;
    } else if (unsettledRows.length) {
      // Chỉ có khoản điều chỉnh đã trả (chưa có dòng đơn đã quyết toán) → ước tính + điều chỉnh
      source = 'unsettled';
      picked = [...settledRows, ...(options.includeUnsettled ? unsettledRows : [])];
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
  // Theo ngày thanh toán: đơn đã trả nhưng không có trong file đơn hàng (đặt trước kỳ) → tính tiền, thiếu giá vốn
  const paidNoOrder: IncomeRow[] = [];
  // Nạp ví quảng cáo từ số dư (TikTok): có file quảng cáo + bật "không tính 2 lần" → không trừ (chi phí lấy theo file QC)
  const topupRows: IncomeRow[] = [];
  const topupCounted = !(hasAds && options.dedupeGmvMax);
  for (const r of data.income) {
    if (usedIncome.has(r)) continue;
    if (!r.settled && !options.includeUnsettled) continue;
    if (has(r.type, ADS_TOPUP)) {
      topupRows.push(r);
      if (topupCounted) adjustmentRows.push(r);
      continue;
    }
    const isOrderRow = has(r.type, ORDER_ROW);
    if (payment && isOrderRow) paidNoOrder.push(r);
    else if (hasOrders && isOrderRow) {
      outCount++;
      outSettlement += r.settlement;
    } else adjustmentRows.push(r);
  }
  if (!hasOrders) missingCostSkus = new Set();

  // Không có file đơn hàng → mọi dòng quyết toán đều tính (dòng "đơn hàng" coi như đơn)
  const moneyRows = [
    ...orderResults.flatMap((o) =>
      (incomeByOrder.get(o.orderId) ?? []).filter((r) =>
        o.source === 'settled' ? r.settled : o.source === 'unsettled' && (r.settled || options.includeUnsettled),
      ),
    ),
    ...adjustmentRows,
    ...paidNoOrder,
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
    section: g.section,
    amount: sumBy(moneyRows, (r) => r.feeParts[g.key] ?? 0),
  }));
  const rest = fees - sumBy(feeLines, (f) => f.amount);
  if (Math.abs(rest) >= 1)
    feeLines.push({ key: 'other', label: 'Phí khác (cột chưa phân loại)', section: 'Khác', amount: rest });

  // Quảng cáo
  const adsFile = sumBy(
    data.ads.filter((a) => !a.detail),
    (a) => a.cost,
  );
  const gmvInSettlement = -sumBy(
    feeLines.filter((f) => GMV_KEYS.has(f.key)),
    (f) => f.amount,
  );
  const ads = options.dedupeGmvMax ? Math.max(0, adsFile - Math.max(0, gmvInSettlement)) : adsFile;

  // Chi phí khác
  const countedOrders =
    orderResults.filter((o) => o.state !== 'cancelled').length || (hasOrders ? 0 : moneyRows.length);
  const otherBases: OtherCostBases = {
    orders: countedOrders,
    returned: orderResults.filter((o) => o.state === 'returned').length,
    cancelled: orderResults.filter((o) => o.state === 'cancelled').length,
    units: sumBy(
      orderResults.filter((o) => o.state !== 'cancelled'),
      (o) => sumBy(o.lines, (l) => Math.max(0, l.qty - l.returnQty)),
    ),
    revenue,
  };
  const otherLines = otherCosts
    .filter((c) => c.value > 0)
    .map((c) => ({ id: c.id, label: c.label, kind: c.kind, value: c.value, amount: otherCostAmount(c, otherBases) }));
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
          ads: 0,
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

  // Quảng cáo theo sản phẩm (file có dòng chi tiết): chia chi phí của sản phẩm cho các SKU theo doanh thu
  const detailAds = data.ads.filter((a) => a.detail && a.product && a.cost > 0);
  let adsUnmatched = 0;
  if (detailAds.length) {
    const byProduct = new Map<string, SkuResult[]>();
    for (const s of skus) byProduct.set(fold(s.productName), [...(byProduct.get(fold(s.productName)) ?? []), s]);
    for (const a of detailAds) {
      const group = byProduct.get(fold(a.product!));
      if (!group) {
        adsUnmatched += a.cost;
        continue;
      }
      const base = sumBy(group, (s) => Math.max(0, s.revenue));
      const qtyBase = sumBy(group, (s) => s.qty);
      for (const s of group) {
        const share = base > 0 ? Math.max(0, s.revenue) / base : qtyBase > 0 ? s.qty / qtyBase : 1 / group.length;
        s.ads += a.cost * share;
      }
    }
  }

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
    hasSettled,
    adjustmentLines: adjustmentLinesOf(moneyRows),
    adsTopup: {
      count: topupRows.length,
      amount: sumBy(topupRows, (r) => r.settlement),
      counted: topupCounted,
    },
    incomeBySource: incomeBySourceOf(moneyRows),
    basis: payment ? 'payment' : 'order',
    paidPeriod: payment ? rangeOf(data.income.map((r) => r.settledAt)) : null,
    paidNoOrder: { count: paidNoOrder.length, settlement: sumBy(paidNoOrder, (r) => r.settlement) },
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
    otherBases,
    profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
    feeLines: feeLines.filter((f) => Math.abs(f.amount) >= 1),
    skus,
    orderResults,
    noMoney: { count: noMoneyOrders.length, goodsValue: sumBy(noMoneyOrders, (o) => o.goodsValue) },
    outOfPeriod: { count: outCount, settlement: outSettlement },
    missingCost: { skus: missingCostSkus.size, qty: missingCostQty },
    adsBySku: detailAds.length > 0,
    adsUnmatched,
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
