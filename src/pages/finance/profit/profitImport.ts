// Tính lợi nhuận — đọc file xuất từ TikTok Shop Seller Center. Logic thuần, test ở tests/profit.test.ts
//  • "Tất cả đơn hàng" (.csv / .xlsx)          → từng dòng SKU của đơn: số lượng, trả hàng, trạng thái
//  • "income_….xlsx" (Đã quyết toán)            → từng đơn: tiền về, doanh thu, từng khoản phí
//  • "Onhold / unsettled order" (Chờ quyết toán) → như trên, số ước tính
//  • Báo cáo quảng cáo (vd "Campaign overview data") → chi phí quảng cáo

import { fold } from '../pricing/import/categoryImport';
import { parseAmount } from '../pricing/bulk/bulkImport';
import { parseShopeeRows } from './shopeeImport';

export type ProfitFileKind = 'orders' | 'income' | 'ads';

/** 1 dòng SKU trong 1 đơn */
export interface OrderLine {
  orderId: string;
  skuId: string | null;
  sellerSku: string | null;
  productName: string;
  variation: string | null;
  qty: number;
  returnQty: number;
  /** Tiền hàng của dòng sau giảm giá (sàn + shop) */
  subtotal: number;
  status: string;
  substatus: string;
  /** "Cancel" / "Return/Refund"… */
  cancelType: string;
  /** yyyy-mm-dd */
  createdAt: string | null;
  channel: string | null;
  creator: string | null;
}

/** 1 dòng trong file quyết toán (đơn hàng hoặc điều chỉnh) */
export interface IncomeRow {
  id: string;
  /** ID đơn hàng mà dòng này thuộc về (dòng điều chỉnh / hoàn tiền trỏ về đơn gốc) */
  orderId: string | null;
  type: string;
  createdAt: string | null;
  settledAt: string | null;
  /** Tổng số tiền quyết toán (tiền về) */
  settlement: number;
  /** Tổng doanh thu (sau giảm giá của người bán, trừ hoàn tiền) */
  revenue: number;
  /** Tổng phí (số âm) */
  fees: number;
  /** Số tiền điều chỉnh */
  adjustment: number;
  /** Phí theo nhóm (FEE_GROUPS), số âm */
  feeParts: Record<string, number>;
  /** false = file chờ quyết toán (số ước tính) */
  settled: boolean;
  /** Shopee: dòng thuộc file nào ("Shop" / "Shopee Xử Lý") — gắn lúc tính, không lưu */
  source?: string;
}

/** 1 dòng báo cáo quảng cáo (theo ngày / chiến dịch) */
export interface AdsRow {
  key: string;
  date: string | null;
  cost: number;
  revenue: number | null;
  orders: number | null;
  /** Dòng chi tiết theo sản phẩm (đã nằm trong dòng chiến dịch) → KHÔNG cộng vào tổng, chỉ để chia quảng cáo cho sản phẩm */
  detail?: boolean;
  /** Tên sản phẩm của dòng chi tiết (khớp với tên sản phẩm trong file đơn hàng) */
  product?: string;
}

export interface ParsedFile {
  kind: ProfitFileKind;
  /** Loại báo cáo quảng cáo Shopee: nhóm = "Tất cả dữ liệu chiến dịch nhóm", auto = "Chiến dịch Tự Động Chọn Sản phẩm" */
  adsType?: 'group' | 'auto';
  /** Sàn của file (mặc định TikTok) */
  platform?: 'tiktok' | 'shopee';
  /** Kỳ ghi trong file (vd báo cáo quảng cáo Shopee "Khoảng thời gian") — khi dòng dữ liệu không có ngày */
  range?: { from: string; to: string } | null;
  orders?: OrderLine[];
  income?: IncomeRow[];
  ads?: AdsRow[];
  /** Ghi chú khi đọc (vd chưa hỗ trợ cột nào) */
  note?: string;
}

/**
 * Nhóm phí từ các cột cấp 2 dưới "Tổng phí" trong file quyết toán (đúng thứ tự sheet "Báo cáo").
 * Chỉ lấy cột cấp 2 — cột cấp 3 (vd "Phí vận chuyển thực tế") đã gộp trong cấp 2, cộng nữa sẽ bị trùng.
 */
export const FEE_GROUPS: { key: string; label: string; headers: string[] }[] = [
  { key: 'commission', label: 'Phí hoa hồng TikTok', headers: ['phi hoa hong cua tiktok shop'] },
  { key: 'transaction', label: 'Phí giao dịch', headers: ['phi giao dich'] },
  { key: 'shipping', label: 'Phí vận chuyển (người bán chịu)', headers: ['phi van chuyen cua nguoi ban'] },
  {
    key: 'affiliate',
    label: 'Hoa hồng liên kết (KOC/affiliate)',
    headers: [
      'hoa hong lien ket',
      'hoa hong lien ket quang cao cua hang',
      'hoa hong cua doi tac lien ket',
      'tien coc hoa hong lien ket',
      'hoan hoa hong lien ket',
      'hoa hong quang cao cua hang cua doi tac lien ket',
    ],
  },
  { key: 'handling', label: 'Phí xử lý đơn hàng', headers: ['phi xu ly don hang'] },
  {
    key: 'service',
    label: 'Phí dịch vụ (Voucher Xtra, Flash Sale…)',
    headers: [
      'phi dich vu sfp',
      'phi dich vu hoan tien thuong',
      'phi dich vu uu dai dac biet tren live',
      'phi dich vu voucher xtra',
      'phi dich vu chuong trinh eams',
      'phi dich vu flash sale',
      'phi chuong trinh tiktok paylater',
      'phi nguon luc chien dich',
      'phi dich vu sfr',
      'goi dich vu duoc quan ly (thue ban hang)',
      'goi dich vu duoc quan ly (phi moi don hang)',
    ],
  },
  {
    key: 'tax',
    label: 'Thuế do TikTok khấu trừ',
    headers: ['thue gtgt do tiktok shop khau tru', 'thue tncn do tiktok shop khau tru'],
  },
  {
    key: 'gmvMax',
    label: 'Quảng cáo GMV Max (trừ vào quyết toán)',
    headers: ['voucher gmv max', 'thue ban hang cua voucher gmv max', 'phi quang cao gmv max'],
  },
  // Shopee — điền từ file đơn hàng (shopeeImport.ts), không đọc theo tiêu đề cột quyết toán
  { key: 'spFixed', label: 'Phí cố định (Shopee)', headers: [] },
  { key: 'spService', label: 'Phí dịch vụ (Shopee)', headers: [] },
  { key: 'spTransaction', label: 'Phí xử lý giao dịch (Shopee)', headers: [] },
  { key: 'spReturnShip', label: 'Phí vận chuyển trả hàng (Shopee)', headers: [] },
  { key: 'spInfra', label: 'Phí dịch vụ — Phí hạ tầng (Shopee)', headers: [] },
  { key: 'spVoucherXtra', label: 'Phí dịch vụ — Voucher Xtra (Shopee)', headers: [] },
  { key: 'spAffiliate', label: 'Hoa hồng Tiếp thị liên kết (Shopee)', headers: [] },
  { key: 'spPiship', label: 'Phí dịch vụ PiShip (Shopee)', headers: [] },
  { key: 'spShipping', label: 'Phí vận chuyển ròng (Shopee)', headers: [] },
  { key: 'spTopup', label: 'Phí DVHT Nạp Tiền Tự Động (Shopee)', headers: [] },
  { key: 'spInstall', label: 'Lắp đặt / Trade-in (Shopee)', headers: [] },
  { key: 'spTax', label: 'Thuế GTGT + TNCN do Shopee khấu trừ', headers: [] },
  { key: 'spVat', label: 'Thuế GTGT (Shopee khấu trừ)', headers: [] },
  { key: 'spPit', label: 'Thuế TNCN (Shopee khấu trừ)', headers: [] },
];

export const norm = (s: string | undefined) =>
  fold(String(s ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
export const clean = (s: string | undefined) =>
  String(s ?? '')
    .replace(/\t/g, '')
    .trim();
export const num = (s: string | undefined) => parseAmount(clean(s)) ?? 0;

/** "28/10/2026 21:16:08" · "2026/11/07" · "2026-10-01 00:00:00" → "2026-10-28" */
export function parseDate(raw: string | undefined): string | null {
  const s = clean(raw);
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // Excel lưu ngày dạng số (số ngày từ 1899-12-30)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export type Cols = Map<string, number>;

/** Tìm dòng tiêu đề (15 dòng đầu) thoả `test` → bảng tên cột (không dấu) → vị trí */
export function findHeader(rows: string[][], test: (cols: Cols) => boolean): { row: number; cols: Cols } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cols: Cols = new Map();
    (rows[i] ?? []).forEach((c, j) => {
      const k = norm(c);
      if (k && !cols.has(k)) cols.set(k, j);
    });
    if (test(cols)) return { row: i, cols };
  }
  return null;
}

export const pick = (cols: Cols, ...names: (string | RegExp)[]): number | undefined => {
  for (const n of names) {
    if (typeof n === 'string') {
      const i = cols.get(n);
      if (i != null) return i;
    } else {
      for (const [k, i] of cols) if (n.test(k)) return i;
    }
  }
  return undefined;
};

const ORDER_ID = ['order id', 'id don hang', 'ma don hang'];
const SKU_ID = ['sku id', 'id sku'];
const QTY = ['quantity', 'so luong'];
const isOrders = (c: Cols) => pick(c, ...ORDER_ID) != null && pick(c, ...SKU_ID) != null && pick(c, ...QTY) != null;

const INCOME_ID = ['id don hang/dieu chinh', 'order/adjustment id', 'id don hang', 'order id'];
const SETTLE = /^(tong so tien quyet toan|so tien quyet toan|total settlement amount|settlement amount)/;
const isIncome = (c: Cols) => pick(c, ...INCOME_ID) != null && pick(c, SETTLE) != null;

const COST = ['chi phi', 'cost', 'spend', 'tong chi phi'];
const isAds = (c: Cols) => pick(c, ...COST) != null;

/** Nhận loại file theo dòng tiêu đề (xét đơn hàng → quyết toán → quảng cáo) */
export function classifyRows(rows: string[][]): ProfitFileKind | null {
  if (findHeader(rows, isOrders)) return 'orders';
  if (findHeader(rows, isIncome)) return 'income';
  if (findHeader(rows, isAds)) return 'ads';
  return null;
}

export function parseOrders(rows: string[][]): OrderLine[] {
  const h = findHeader(rows, isOrders);
  if (!h) return [];
  const c = h.cols;
  const col = {
    orderId: pick(c, ...ORDER_ID)!,
    skuId: pick(c, ...SKU_ID),
    sellerSku: pick(c, 'seller sku', 'sku nguoi ban'),
    product: pick(c, 'product name', 'ten san pham'),
    variation: pick(c, 'variation', 'phan loai', 'bien the'),
    qty: pick(c, ...QTY)!,
    returnQty: pick(c, 'sku quantity of return', 'so luong tra hang'),
    subtotal: pick(c, 'sku subtotal after discount', 'tong phu sau giam gia'),
    status: pick(c, 'order status', 'trang thai don hang', 'trang thai'),
    substatus: pick(c, 'order substatus', 'trang thai phu'),
    cancelType: pick(c, 'cancelation/return type', 'cancellation/return type', 'loai huy/tra hang'),
    created: pick(c, 'created time', 'thoi gian tao', 'thoi gian tao don hang'),
    channel: pick(c, 'order channel', 'kenh don hang'),
    creator: pick(c, 'creator handle', 'nha sang tao'),
  };
  const get = (r: string[], i: number | undefined) => (i == null ? '' : clean(r[i]));
  const out: OrderLine[] = [];
  for (const r of rows.slice(h.row + 1)) {
    const orderId = get(r, col.orderId);
    if (!/\d/.test(orderId)) continue; // dòng mô tả / trống
    out.push({
      orderId,
      skuId: get(r, col.skuId) || null,
      sellerSku: get(r, col.sellerSku) || null,
      productName: get(r, col.product) || '(không tên)',
      variation: get(r, col.variation) || null,
      qty: num(r[col.qty]),
      returnQty: col.returnQty == null ? 0 : num(r[col.returnQty]),
      subtotal: col.subtotal == null ? 0 : num(r[col.subtotal]),
      status: get(r, col.status),
      substatus: get(r, col.substatus),
      cancelType: get(r, col.cancelType),
      createdAt: parseDate(get(r, col.created)),
      channel: get(r, col.channel) || null,
      creator: get(r, col.creator) || null,
    });
  }
  return out;
}

/** File chờ quyết toán: theo tên file (onhold / unsettled) hoặc tiêu đề ghi "ước tính" */
export function isUnsettledFile(fileName: string, rows: string[][]): boolean {
  const name = norm(fileName);
  if (/(onhold|on-hold|unsettled|chua quyet toan|cho quyet toan|se quyet toan)/.test(name)) return true;
  if (/^income/.test(name)) return false;
  // Chỉ xét cột tiền quyết toán ("Trọng lượng kiện hàng ước tính" có ở cả file đã quyết toán)
  const h = findHeader(rows, isIncome);
  return !!h && [...h.cols.keys()].some((k) => SETTLE.test(k) && /(uoc tinh|estimated|du kien)/.test(k));
}

export function parseIncome(rows: string[][], settled = true): IncomeRow[] {
  const h = findHeader(rows, isIncome);
  if (!h) return [];
  const c = h.cols;
  const col = {
    id: pick(c, ...INCOME_ID)!,
    orderId: pick(c, 'id don hang lien quan', 'related order id'),
    type: pick(c, 'loai giao dich', 'type', 'transaction type'),
    created: pick(c, 'thoi gian tao don hang', 'order created time'),
    settledAt: pick(c, 'thoi gian quyet toan don hang', 'order settled time', /^thoi gian quyet toan/),
    settlement: pick(c, SETTLE)!,
    revenue: pick(c, 'tong doanh thu', 'total revenue', /^tong doanh thu/),
    fees: pick(c, 'tong phi', 'total fees'),
    adjustment: pick(c, 'so tien dieu chinh', 'adjustment amount'),
  };
  const groups = FEE_GROUPS.map((g) => ({ key: g.key, cols: g.headers.map((n) => c.get(n)).filter((i) => i != null) }));
  const out: IncomeRow[] = [];
  for (const r of rows.slice(h.row + 1)) {
    const id = clean(r[col.id]);
    if (!/\d/.test(id)) continue;
    const feeParts: Record<string, number> = {};
    for (const g of groups) {
      const v = g.cols.reduce((s, i) => s + num(r[i!]), 0);
      if (v !== 0) feeParts[g.key] = v;
    }
    const related = col.orderId == null ? '' : clean(r[col.orderId]);
    const type = col.type == null ? '' : clean(r[col.type]);
    out.push({
      id,
      orderId: related || (/(^|\s)(don hang|order)$/.test(norm(type)) || !type ? id : null),
      type: type || 'Đơn hàng',
      createdAt: col.created == null ? null : parseDate(r[col.created]),
      settledAt: col.settledAt == null ? null : parseDate(r[col.settledAt]),
      settlement: num(r[col.settlement]),
      revenue: col.revenue == null ? 0 : num(r[col.revenue]),
      fees: col.fees == null ? 0 : num(r[col.fees]),
      adjustment: col.adjustment == null ? 0 : num(r[col.adjustment]),
      feeParts,
      settled,
    });
  }
  return out;
}

const TOTAL_LABEL = /^(-|—|tong|tong cong|total|grand total)$/;

/** Báo cáo quảng cáo: cộng cột Chi phí từng dòng (bỏ dòng tổng cuối bảng) */
export function parseAds(rows: string[][]): AdsRow[] {
  const h = findHeader(rows, isAds);
  if (!h) return [];
  const c = h.cols;
  const col = {
    cost: pick(c, ...COST)!,
    date: pick(c, 'theo ngay', 'ngay', 'date', 'thoi gian', 'by day'),
    label: pick(c, 'ten chien dich', 'campaign name', 'chien dich', 'campaign'),
    revenue: pick(c, /^doanh thu gop/, /^gross revenue/, /^doanh thu/),
    orders: pick(c, /^so luong don hang/, /^don hang/, /^orders/),
  };
  const out: AdsRow[] = [];
  rows.slice(h.row + 1).forEach((r, i) => {
    const first = norm(r[col.date ?? col.label ?? 0]);
    if (TOTAL_LABEL.test(first)) return;
    const cost = parseAmount(clean(r[col.cost]));
    if (cost == null) return;
    const date = col.date == null ? null : parseDate(r[col.date]);
    const label = col.label == null ? '' : clean(r[col.label]);
    out.push({
      key: date ?? (label || `#${h.row + 2 + i}`),
      date,
      cost,
      revenue: col.revenue == null ? null : parseAmount(clean(r[col.revenue])),
      orders: col.orders == null ? null : parseAmount(clean(r[col.orders])),
    });
  });
  return out;
}

/** Đọc 1 bảng (1 trang tính) → dữ liệu theo loại nhận được (file Shopee xét trước — tiêu đề riêng) */
export function parseProfitRows(rows: string[][], fileName: string): ParsedFile | null {
  const shopee = parseShopeeRows(rows);
  if (shopee) return shopee;
  const kind = classifyRows(rows);
  if (kind === 'orders') return { kind, orders: parseOrders(rows) };
  if (kind === 'income') return { kind, income: parseIncome(rows, !isUnsettledFile(fileName, rows)) };
  if (kind === 'ads') return { kind, ads: parseAds(rows) };
  return null;
}
