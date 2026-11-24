// Tính lợi nhuận — đọc file xuất từ Shopee Kênh Người Bán. Logic thuần, test ở tests/profit-shopee.test.ts
//  • Đơn hàng → Tất cả → Xuất ("Order.all.order_creation_date….xlsx"): mỗi dòng = 1 sản phẩm của đơn; các khoản theo
//    ĐƠN (Phí cố định, Phí Dịch Vụ, Phí xử lý giao dịch, Mã giảm giá của Shop…) lặp lại trên mọi dòng của đơn → lấy 1 lần.
//    Shopee không có file quyết toán riêng trong hướng dẫn → tiền về mỗi đơn = ƯỚC TÍNH từ chính file đơn hàng:
//      doanh thu = tiền hàng các dòng (trừ phần trả hàng) − mã giảm giá / combo của Shop
//      tiền về  = doanh thu − phí cố định − phí dịch vụ − phí xử lý giao dịch − phí vận chuyển trả hàng
//    (đơn trả hàng toàn bộ: Shopee đã ghi phí = 0 trong file → chỉ trừ phần tiền hàng bị trả)
//  • Kênh Marketing → Quảng cáo Shopee → Xuất dữ liệu (.csv): dòng chiến dịch (Mã sản phẩm "-") = tổng; dòng sản phẩm
//    bên dưới = chi tiết của chiến dịch → chỉ cộng dòng chiến dịch, dòng sản phẩm dùng để chia quảng cáo cho sản phẩm.

import {
  clean,
  findHeader,
  norm,
  num,
  parseDate,
  pick,
  type AdsRow,
  type Cols,
  type IncomeRow,
  type OrderLine,
  type ParsedFile,
} from './profitImport';

/** 2 cột gần trùng tên — chỉ khác chữ hoa "Người" / "người" (dòng sản phẩm / cả đơn) → so đúng nguyên văn */
const LINE_TOTAL = 'Tổng số tiền Người mua thanh toán';

const isShopeeOrders = (c: Cols) =>
  pick(c, 'ma don hang') != null && pick(c, 'trang thai don hang') != null && pick(c, 'phi co dinh') != null;

/** Tên cột tên chiến dịch / sản phẩm (báo cáo nhóm: "Chiến dịch / Tên sản phẩm"; báo cáo khác có thể chỉ "Tên sản phẩm") */
const ADS_NAME = ['chien dich / ten san pham', 'ten chien dich', 'chien dich', 'ten san pham', 'ten quang cao'];
/** Báo cáo Dịch vụ Hiển thị Shopee: có "Chi phí" + cột chỉ Shopee có (ACOS / Loại Dịch vụ Hiển thị) hoặc cột tên kiểu Shopee */
const isShopeeAds = (c: Cols) =>
  pick(c, 'chi phi') != null &&
  (pick(c, 'chien dich / ten san pham') != null ||
    (pick(c, ...ADS_NAME) != null && (pick(c, 'acos') != null || pick(c, 'loai dich vu hien thi') != null)));

/** File của Shopee? (để báo khi tải nhầm sàn) */
export function isShopeeTable(rows: string[][]): boolean {
  return !!(findHeader(rows, isShopeeOrders) ?? findHeader(rows, isShopeeAds));
}

export function parseShopeeOrders(rows: string[][]): { orders: OrderLine[]; income: IncomeRow[] } {
  const h = findHeader(rows, isShopeeOrders);
  if (!h) return { orders: [], income: [] };
  const c = h.cols;
  const header = rows[h.row];
  const exact = header.findIndex((x) => clean(x) === LINE_TOTAL);
  const col = {
    orderId: pick(c, 'ma don hang')!,
    created: pick(c, 'ngay dat hang'),
    status: pick(c, 'trang thai don hang')!,
    returnStatus: pick(c, 'trang thai tra hang/hoan tien'),
    product: pick(c, 'ten san pham'),
    variation: pick(c, 'ten phan loai hang'),
    skuVar: pick(c, 'sku phan loai hang'),
    skuProduct: pick(c, 'sku san pham'),
    qty: pick(c, 'so luong')!,
    returnQty: pick(c, 'so luong san pham duoc hoan tra'),
    lineTotal: exact >= 0 ? exact : undefined,
    salePrice: pick(c, 'gia uu dai'),
    shopVoucher: pick(c, 'ma giam gia cua shop'),
    shopCombo: pick(c, 'giam gia tu combo cua shop'),
    fixed: pick(c, 'phi co dinh'),
    service: pick(c, 'phi dich vu'),
    transaction: pick(c, 'phi xu ly giao dich'),
    returnShip: pick(c, 'phi van chuyen tra hang (don tra hang/hoan tien)', /^phi van chuyen tra hang/),
    completedAt: pick(c, 'thoi gian hoan thanh don hang'),
  };
  // Shopee ghi "-" khi trống (vd SKU) → coi như trống
  const get = (r: string[], i: number | undefined) => {
    const v = i == null ? '' : clean(r[i]);
    return v === '-' ? '' : v;
  };

  const orders: OrderLine[] = [];
  const byOrder = new Map<string, { lines: OrderLine[]; first: string[] }>();
  for (const r of rows.slice(h.row + 1)) {
    const orderId = get(r, col.orderId);
    if (!orderId || /^ma don hang$/i.test(norm(orderId))) continue;
    const qty = num(r[col.qty]);
    const lineTotal = col.lineTotal != null ? num(r[col.lineTotal]) : num(get(r, col.salePrice)) * qty;
    const skuVar = get(r, col.skuVar);
    const line: OrderLine = {
      orderId,
      skuId: skuVar || null,
      sellerSku: skuVar || get(r, col.skuProduct) || null,
      productName: get(r, col.product) || '(không tên)',
      variation: get(r, col.variation) || null,
      qty,
      returnQty: Math.min(qty, num(get(r, col.returnQty))),
      subtotal: lineTotal,
      status: get(r, col.status),
      substatus: get(r, col.returnStatus),
      cancelType: '',
      createdAt: parseDate(get(r, col.created)),
      channel: null,
      creator: null,
    };
    orders.push(line);
    const g = byOrder.get(orderId);
    if (g) g.lines.push(line);
    else byOrder.set(orderId, { lines: [line], first: r });
  }

  // Tiền về ước tính theo đơn (khoản theo đơn lấy ở dòng đầu)
  const income: IncomeRow[] = [];
  for (const [orderId, { lines, first }] of byOrder) {
    const status = norm(lines[0].status);
    if (/da huy|huy/.test(status)) continue;
    const goods = lines.reduce((s, l) => s + (l.qty > 0 ? (l.subtotal * (l.qty - l.returnQty)) / l.qty : 0), 0);
    const allReturned = lines.every((l) => l.qty > 0 && l.returnQty >= l.qty);
    const shopDiscount = allReturned ? 0 : num(get(first, col.shopVoucher)) + num(get(first, col.shopCombo));
    const revenue = goods - shopDiscount;
    const feeParts: Record<string, number> = {
      spFixed: -num(get(first, col.fixed)),
      spService: -num(get(first, col.service)),
      spTransaction: -num(get(first, col.transaction)),
      spReturnShip: -num(get(first, col.returnShip)),
    };
    for (const k of Object.keys(feeParts)) if (feeParts[k] === 0) delete feeParts[k];
    const fees = Object.values(feeParts).reduce((s, v) => s + v, 0);
    income.push({
      id: orderId,
      orderId,
      type: 'Đơn hàng',
      createdAt: lines[0].createdAt,
      settledAt: parseDate(get(first, col.completedAt)),
      settlement: revenue + fees,
      revenue,
      fees,
      adjustment: 0,
      feeParts,
      // Số ƯỚC TÍNH từ file đơn hàng → luôn coi như "chờ thanh toán"; tải file "Đã thanh toán" (Doanh thu) thì
      // dòng thật (settled) của cùng đơn được ưu tiên (mergeData / computeProfit)
      settled: false,
    });
  }
  return { orders, income };
}

/** "01/10/2026 - 31/10/2026" ở các dòng thông tin đầu file */
function periodOf(rows: string[][], before: number): { from: string; to: string } | null {
  for (const r of rows.slice(0, before)) {
    if (!/khoang thoi gian/.test(norm(r[0]))) continue;
    const [a, b] = clean(r[1] ?? r[0].split(',')[1]).split(/\s*-\s*/);
    const from = parseDate(a);
    const to = parseDate(b);
    if (from && to) return { from, to };
  }
  return null;
}

export function parseShopeeAds(rows: string[][]): { ads: AdsRow[]; range: { from: string; to: string } | null } {
  const h = findHeader(rows, isShopeeAds);
  if (!h) return { ads: [], range: null };
  const c = h.cols;
  const col = {
    no: pick(c, 'thu tu'),
    name: pick(c, ...ADS_NAME)!,
    productId: pick(c, 'ma san pham'),
    bid: pick(c, 'phuong thuc dau thau'),
    cost: pick(c, 'chi phi')!,
    revenue: pick(c, 'doanh so'),
    orders: pick(c, 'luot chuyen doi'),
  };
  const range = periodOf(rows, h.row);
  // Khoá dòng theo LOẠI báo cáo (dòng tiêu đề, vd "Chiến dịch nhóm" / "Chiến dịch tự động…") + kỳ → tải nhiều file
  // quảng cáo cùng kỳ (nhóm + tự động chọn sản phẩm) không bị đè lên nhau vì trùng số thứ tự
  const title = norm(rows[0]?.[0] ?? '').slice(0, 60) || 'shopee';
  const tag = `${title}|${range ? `${range.from}_${range.to}` : ''}`;
  const get = (r: string[], i: number | undefined) => (i == null ? '' : clean(r[i]));
  const ads: AdsRow[] = [];
  rows.slice(h.row + 1).forEach((r, i) => {
    const name = get(r, col.name);
    if (!name) return;
    const cost = num(get(r, col.cost));
    const pid = get(r, col.productId);
    const bid = get(r, col.bid);
    const no = get(r, col.no) || String(i + 1);
    // Dòng chiến dịch: không có mã sản phẩm ("-") hoặc có phương thức đấu thầu (quảng cáo 1 sản phẩm riêng)
    const isCampaign = !pid || pid === '-' || (!!bid && bid !== '-');
    const base = {
      date: null,
      cost,
      revenue: col.revenue == null ? null : num(get(r, col.revenue)),
      orders: col.orders == null ? null : num(get(r, col.orders)),
    };
    if (isCampaign) ads.push({ key: `sp|${tag}|c${no}`, ...base });
    if (pid && pid !== '-') ads.push({ key: `sp|${tag}|p${no}`, ...base, detail: true, product: name });
  });
  return { ads, range };
}

// ───────── Tài chính → Doanh thu → Đã thanh toán → Xuất ("Income.đã phát hành.vn.….xlsx") ─────────
// Trang "Doanh thu": dòng "Order" = 1 đơn (số Shopee THỰC chuyển + từng khoản), dòng "Sku" = chi tiết (bỏ qua).
// Trang "Adjustment": khoản điều chỉnh (trả hàng sau khi đã trả tiền, chương trình marketing).
// File "shopee_xi_Income…" (đơn Shopee Xử Lý) cùng cấu trúc → tải cả 2.

const isShopeeIncome = (c: Cols) =>
  pick(c, 'don hang / san pham') != null &&
  pick(c, 'ma don hang') != null &&
  pick(c, 'tong tien da thanh toan') != null;

const isShopeeAdjust = (c: Cols) => pick(c, 'so tien dieu chinh') != null && pick(c, 'ma don hang lien quan') != null;

export function parseShopeeIncome(rows: string[][]): IncomeRow[] {
  const h = findHeader(rows, isShopeeIncome);
  if (!h) return [];
  const c = h.cols;
  const col = (...n: (string | RegExp)[]) => pick(c, ...n);
  const at = {
    level: col('don hang / san pham')!,
    orderId: col('ma don hang')!,
    created: col('ngay dat hang'),
    paid: col('ngay hoan thanh thanh toan'),
    total: col('tong tien da thanh toan')!,
  };
  // Doanh thu hàng = giá sản phẩm (đã trừ trợ giá của shop) + hoàn tiền + trợ giá Shopee + mã ưu đãi / hoàn xu shop chịu
  const revenueCols = [
    'gia san pham',
    'so tien hoan lai',
    'san pham duoc tro gia tu shopee',
    'ma uu dai do nguoi ban chiu',
    'ma uu dai dong tai tro do nguoi ban chiu',
    'ma hoan xu do nguoi ban chiu',
    'ma hoan xu dong tai tro do nguoi ban chiu',
  ].map((n) => col(n));
  const feeCols: Record<string, (number | undefined)[]> = {
    spShipping: [
      'phi van chuyen nguoi mua tra',
      'phi van chuyen thuc te',
      'phi van chuyen duoc tro gia tu shopee',
      'phi van chuyen tra hang (don tra hang/hoan tien)',
      'phi van chuyen duoc hoan boi piship',
      'phi van chuyen tra hang (don giao khong thanh cong)',
      'shipping fee discount from 3pl',
    ].map((n) => col(n)),
    spFixed: [col('phi co dinh')],
    spService: [col('phi dich vu')],
    spTransaction: [col('phi xu ly giao dich')],
    spAffiliate: [col('phi hoa hong tiep thi lien ket')],
    spPiship: [col('phi dich vu piship')],
    spTopup: [col(/^phi dvht nap tien tu dong/)],
    spVat: [col('thue gtgt')],
    spPit: [col('thue tncn')],
    spInstall: [col('phi lap dat nguoi mua tra'), col('phi lap dat thuc te'), col('trade-in bonus by seller')],
  };
  const sum = (r: string[], idx: (number | undefined)[]) =>
    idx.reduce<number>((s, i) => (i == null ? s : s + num(clean(r[i]) === '-' ? '0' : r[i])), 0);

  const out: IncomeRow[] = [];
  for (const r of rows.slice(h.row + 1)) {
    if (norm(r[at.level]) !== 'order') continue;
    const orderId = clean(r[at.orderId]);
    if (!orderId) continue;
    const settlement = num(r[at.total]);
    const revenue = sum(r, revenueCols);
    const feeParts: Record<string, number> = {};
    for (const [k, idx] of Object.entries(feeCols)) {
      const v = sum(r, idx);
      if (v !== 0) feeParts[k] = v;
    }
    out.push({
      id: orderId,
      orderId,
      type: 'Đơn hàng',
      createdAt: at.created == null ? null : parseDate(r[at.created]),
      settledAt: at.paid == null ? null : parseDate(r[at.paid]),
      settlement,
      revenue,
      // Tổng khấu trừ = tiền về − doanh thu (phần lệch so với các nhóm phí → "Phí khác")
      fees: settlement - revenue,
      adjustment: 0,
      feeParts,
      settled: true,
    });
  }
  return out;
}

export function parseShopeeAdjust(rows: string[][]): IncomeRow[] {
  const h = findHeader(rows, isShopeeAdjust);
  if (!h) return [];
  const c = h.cols;
  const col = {
    id: pick(c, 'ma giao dich'),
    date: pick(c, /^ngay hoan thanh dieu chinh/),
    type: pick(c, /^loai dieu chinh/),
    reason: pick(c, 'ly do dieu chinh'),
    amount: pick(c, 'so tien dieu chinh')!,
    orderId: pick(c, 'ma don hang lien quan')!,
  };
  const out: IncomeRow[] = [];
  rows.slice(h.row + 1).forEach((r, i) => {
    const raw = clean(r[col.amount]);
    if (!raw || !/\d/.test(raw)) return;
    // Dòng "Tổng cộng" cuối trang = tổng các dòng trên → bỏ (không thì cộng gấp đôi)
    if (r.some((v) => norm(v).startsWith('tong cong'))) return;
    const amount = num(raw);
    const orderId = clean(r[col.orderId]) || null;
    const date = col.date == null ? null : parseDate(r[col.date]);
    out.push({
      id: `adj-${col.id == null ? i : clean(r[col.id])}-${orderId ?? ''}`,
      orderId,
      type: (col.type == null ? '' : clean(r[col.type])) || 'Điều chỉnh',
      createdAt: date,
      settledAt: date,
      settlement: amount,
      revenue: 0,
      fees: 0,
      adjustment: amount,
      feeParts: {},
      settled: true,
    });
  });
  return out;
}

/**
 * Trang "Service Fee Details" của file "Đã thanh toán": Phí Dịch Vụ từng đơn tách thành Phí hạ tầng (2 cột) +
 * Voucher Xtra → map mã đơn → phần tách; không phải trang này → null
 */
export function parseShopeeServiceFees(rows: string[][]): Map<string, { infra: number; voucher: number }> | null {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const h = (rows[i] ?? []).map((x) => norm(x));
    const orderCol = h.indexOf('ma don hang');
    const infra = h.flatMap((x, j) => (x === 'phi ha tang' ? [j] : []));
    const voucher = h.indexOf('voucher xtra');
    if (orderCol < 0 || (!infra.length && voucher < 0)) continue;
    const out = new Map<string, { infra: number; voucher: number }>();
    for (const r of rows.slice(i + 1)) {
      const id = clean(r[orderCol]);
      if (!id) continue;
      const cur = out.get(id) ?? { infra: 0, voucher: 0 };
      cur.infra += infra.reduce((s, j) => s + num(r[j]), 0);
      if (voucher >= 0) cur.voucher += num(r[voucher]);
      out.set(id, cur);
    }
    return out;
  }
  return null;
}

/** Tách nhóm "Phí dịch vụ" của dòng đơn đã thanh toán thành Phí hạ tầng / Voucher Xtra / phần còn lại */
export function splitServiceFees(income: IncomeRow[], fees: Map<string, { infra: number; voucher: number }>) {
  for (const r of income) {
    const f = r.orderId ? fees.get(r.orderId) : undefined;
    const svc = r.feeParts.spService;
    if (!f || svc == null || !r.settled) continue;
    const rest = svc - f.infra - f.voucher;
    const parts: Record<string, number> = { ...r.feeParts };
    delete parts.spService;
    if (f.infra) parts.spInfra = f.infra;
    if (f.voucher) parts.spVoucherXtra = f.voucher;
    if (Math.abs(rest) >= 1) parts.spService = rest;
    r.feeParts = parts;
  }
}

/** File Shopee (đơn hàng / quảng cáo / doanh thu đã thanh toán) → dữ liệu; không phải file Shopee → null */
export function parseShopeeRows(rows: string[][]): ParsedFile | null {
  if (findHeader(rows, isShopeeIncome)) return { kind: 'income', platform: 'shopee', income: parseShopeeIncome(rows) };
  if (findHeader(rows, isShopeeAdjust)) return { kind: 'income', platform: 'shopee', income: parseShopeeAdjust(rows) };
  if (findHeader(rows, isShopeeOrders)) {
    const { orders, income } = parseShopeeOrders(rows);
    return { kind: 'orders', platform: 'shopee', orders, income };
  }
  if (findHeader(rows, isShopeeAds)) {
    const { ads, range } = parseShopeeAds(rows);
    const title = norm(rows[0]?.[0] ?? '');
    const adsType = /tu dong chon san pham/.test(title) ? 'auto' : 'group';
    return { kind: 'ads', platform: 'shopee', adsType, ads, range };
  }
  return null;
}
