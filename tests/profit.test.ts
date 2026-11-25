import { describe, expect, it } from 'vitest';
import { parseSheetXml } from '../src/pages/finance/pricing/import/xlsx';
import {
  classifyRows,
  isUnsettledFile,
  parseAds,
  parseDate,
  parseIncome,
  parseOrders,
  parseProfitRows,
} from '../src/pages/finance/profit/profitImport';
import {
  computeProfit,
  limitOrders,
  mergeData,
  orderState,
  profitOrderIds,
  sfrTotals,
  withoutSfr,
  type ProfitOptions,
} from '../src/pages/finance/profit/profitCalc';

// Cột rút gọn theo file "Tất cả đơn hàng" của TikTok (giá trị ID có "\t" ở cuối như file thật)
const ORDERS: string[][] = [
  [
    'Order ID',
    'Order Status',
    'Order Substatus',
    'Cancelation/Return Type',
    'SKU ID',
    'Seller SKU',
    'Product Name',
    'Variation',
    'Quantity',
    'Sku Quantity of return',
    'SKU Subtotal After Discount',
    'Created Time',
    'Order Channel',
    'Creator Handle',
  ],
  [
    'A1\t',
    'Đã hoàn tất',
    'Đã hoàn tất',
    '',
    'S1\t',
    '',
    'Dầu mù u',
    '10ml',
    '1',
    '0',
    '75600',
    '28/10/2026 21:16:08\t',
    'Product cards',
    '',
  ],
  [
    'A2\t',
    'Đã hoàn tất',
    'Đã hoàn tất',
    '',
    'S1\t',
    '',
    'Dầu mù u',
    '10ml',
    '2',
    '0',
    '150000',
    '27/10/2026 18:58:45\t',
    'Videos',
    'koc_a',
  ],
  [
    'A2\t',
    'Đã hoàn tất',
    'Đã hoàn tất',
    '',
    'S2\t',
    '',
    'Tinh dầu',
    '',
    '1',
    '0',
    '50000',
    '27/10/2026 18:58:45\t',
    'Videos',
    'koc_a',
  ],
  [
    'A3\t',
    'Đã hủy',
    'Đã hủy',
    'Cancel',
    'S2\t',
    '',
    'Tinh dầu',
    '',
    '1',
    '1',
    '270000',
    '01/10/2026 10:00:00\t',
    '',
    '',
  ],
  [
    'A4\t',
    'Đang giao',
    'Đang vận chuyển',
    '',
    'S1\t',
    '',
    'Dầu mù u',
    '10ml',
    '1',
    '0',
    '90000',
    '30/10/2026 08:00:00\t',
    '',
    '',
  ],
  [
    'A5\t',
    'Đã hoàn tất',
    'Đã hoàn tất',
    'Return/Refund',
    'S2\t',
    '',
    'Tinh dầu',
    '',
    '1',
    '1',
    '60000',
    '15/10/2026 08:00:00\t',
    '',
    '',
  ],
];

// Cột rút gọn theo sheet "Chi tiết đơn hàng" của file income
const INCOME_HEADER = [
  'ID đơn hàng/điều chỉnh',
  'Loại giao dịch',
  'Thời gian tạo đơn hàng',
  'Thời gian quyết toán đơn hàng',
  'Tổng số tiền quyết toán',
  'Tổng doanh thu',
  'Tổng phí',
  'Phí giao dịch',
  'Phí hoa hồng của TikTok Shop',
  'Phí vận chuyển của người bán',
  'Phí vận chuyển thực tế',
  'Hoa hồng liên kết',
  'Phí xử lý đơn hàng',
  'Thuế GTGT do TikTok Shop khấu trừ',
  'Phí quảng cáo GMV Max',
  'Số tiền điều chỉnh',
  'ID đơn hàng liên quan',
  'Trọng lượng kiện hàng ước tính',
];
const INCOME: string[][] = [
  INCOME_HEADER,
  [
    'A1',
    'Đơn hàng',
    '2026/10/28',
    '2026/11/09',
    '50000',
    '75600',
    '-25600',
    '-5000',
    '-12000',
    '0',
    '-34800',
    '-5000',
    '-3000',
    '-600',
    '0',
    '0',
    'A1',
    '400',
  ],
  [
    'A2',
    'Đơn hàng',
    '2026/10/27',
    '2026/11/07',
    '150000',
    '200000',
    '-50000',
    '-10000',
    '-20000',
    '0',
    '-30000',
    '-10000',
    '-3000',
    '-2000',
    '-5000',
    '0',
    'A2',
    '400',
  ],
  [
    'A3',
    'Đơn hàng',
    '2026/10/01',
    '2026/10/02',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    'A3',
    '400',
  ],
  [
    'A5',
    'Đơn hàng',
    '2026/10/15',
    '2026/10/30',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    'A5',
    '400',
  ],
  [
    'Z9',
    'Đơn hàng',
    '2026/09/21',
    '2026/10/02',
    '40000',
    '60000',
    '-20000',
    '-4000',
    '-10000',
    '0',
    '0',
    '-3000',
    '-3000',
    '0',
    '0',
    '0',
    'Z9',
    '400',
  ],
  [
    'ADJ1',
    'Điều chỉnh phí vận chuyển',
    '2026/10/20',
    '2026/10/25',
    '-5000',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '-5000',
    '',
    '0',
  ],
];
const ONHOLD: string[][] = [
  ['ID đơn hàng', 'Thời gian tạo đơn hàng', 'Tổng số tiền quyết toán ước tính', 'Tổng doanh thu', 'Tổng phí'],
  ['A4', '2026/10/30', '60000', '90000', '-30000'],
];
const ADS: string[][] = [
  [
    'Theo ngày',
    'Chi phí',
    'Số lượng đơn hàng SKU (Cửa hàng hiện tại)',
    'Chi phí cho mỗi đơn hàng',
    'Doanh thu gộp (Cửa hàng hiện tại)',
    'ROI',
    'Tiền tệ',
  ],
  ['2026-10-01 00:00:00', '20000', '1', '20000', '90000', '4.50', 'VND'],
  ['2026-10-02 00:00:00', '15000', '0', '0', '0', '0.00', 'VND'],
  ['-', '35000', '1', '35000', '90000', '2.57', 'VND'],
];

const OPTS: ProfitOptions = { includeUnsettled: true, dedupeGmvMax: true };
const COSTS = { S1: 30000, S2: 20000 };

function load() {
  return mergeData([
    { orders: parseOrders(ORDERS), income: [], ads: [] },
    { orders: [], income: parseIncome(INCOME, true), ads: [] },
    { orders: [], income: parseIncome(ONHOLD, false), ads: [] },
    { orders: [], income: [], ads: parseAds(ADS) },
  ]);
}

describe('đọc file Tính lợi nhuận', () => {
  it('nhận loại file theo tiêu đề', () => {
    expect(classifyRows(ORDERS)).toBe('orders');
    expect(classifyRows(INCOME)).toBe('income');
    expect(classifyRows(ONHOLD)).toBe('income');
    expect(classifyRows(ADS)).toBe('ads');
    expect(classifyRows([['Tên', 'Giá']])).toBeNull();
    expect(parseProfitRows(ADS, 'x.xlsx')?.kind).toBe('ads');
  });

  it('ngày nhiều kiểu', () => {
    expect(parseDate('28/10/2026 21:16:08\t')).toBe('2026-10-28');
    expect(parseDate('2026/11/07')).toBe('2026-11-07');
    expect(parseDate('2026-10-01 00:00:00')).toBe('2026-10-01');
    expect(parseDate('46000')).toBe('2025-12-09');
    expect(parseDate('')).toBeNull();
  });

  it('đơn hàng: bỏ "\\t", đọc số lượng / trả / tiền hàng / kênh', () => {
    const o = parseOrders(ORDERS);
    expect(o).toHaveLength(6);
    expect(o[0]).toMatchObject({
      orderId: 'A1',
      skuId: 'S1',
      qty: 1,
      subtotal: 75600,
      createdAt: '2026-10-28',
      channel: 'Product cards',
    });
    expect(o[3]).toMatchObject({ orderId: 'A3', cancelType: 'Cancel', returnQty: 1 });
  });

  it('quyết toán: mỗi cột phí 1 dòng, vận chuyển tách cột cấp 3 — tổng các dòng = Tổng phí', () => {
    const r = parseIncome(INCOME, true);
    expect(r[0]).toMatchObject({
      id: 'A1',
      orderId: 'A1',
      settlement: 50000,
      revenue: 75600,
      fees: -25600,
      settled: true,
    });
    // Mỗi cột phí = 1 dòng; "Phí vận chuyển của người bán" (0) tách theo cột cấp 3 → phần chưa tách bù đúng tổng
    expect(r[0].feeParts).toEqual({
      transaction: -5000,
      commission: -12000,
      affiliate: -5000,
      handling: -3000,
      shipActual: -34800,
      shipping: 34800,
      taxVat: -600,
    });
    const sum = (o: Record<string, number>) => Object.values(o).reduce((x, v) => x + v, 0);
    expect(sum(r[0].feeParts)).toBe(-25600); // = Tổng phí
    expect(r[1].feeParts.gmvVoucher ?? r[1].feeParts.gmvAds).toBe(-5000);
    expect(r[5]).toMatchObject({ orderId: null, adjustment: -5000 }); // điều chỉnh không gắn đơn
  });

  it('file chờ quyết toán: theo tên file / cột tiền "ước tính" — không nhầm cột "Trọng lượng … ước tính"', () => {
    expect(isUnsettledFile('income_20261121141613(UTC+7).xlsx', INCOME)).toBe(false);
    expect(isUnsettledFile('bao-cao.xlsx', INCOME)).toBe(false);
    expect(isUnsettledFile('Onhold-unsettled-order-2026.xlsx', INCOME)).toBe(true);
    expect(isUnsettledFile('file.xlsx', ONHOLD)).toBe(true);
  });

  it('quảng cáo: cộng các ngày, bỏ dòng tổng "-"', () => {
    const a = parseAds(ADS);
    expect(a.map((x) => x.cost)).toEqual([20000, 15000]);
    expect(a[0]).toMatchObject({ date: '2026-10-01', revenue: 90000, orders: 1 });
  });

  it('xlsx: gộp nhiều thẻ <row> cùng số dòng (file đơn hàng .xlsx của TikTok)', () => {
    const xml =
      '<sheetData><row r="1"><c r="A1" t="str"><v>Order ID</v></c></row><row r="1"><c r="B1" t="str"><v>SKU ID</v></c></row>' +
      '<row r="2"><c r="A2" t="str"><v>A1</v></c></row><row r="2"><c r="B2" t="str"><v>S1</v></c></row></sheetData>';
    expect(parseSheetXml(xml, [])).toEqual([
      ['Order ID', 'SKU ID'],
      ['A1', 'S1'],
    ]);
  });
});

describe('trạng thái đơn', () => {
  const lines = parseOrders(ORDERS);
  const of = (id: string) => orderState(lines.filter((l) => l.orderId === id));
  it('huỷ xét trước số lượng trả; trả hàng theo loại / số lượng trả', () => {
    expect(of('A1')).toBe('completed');
    expect(of('A3')).toBe('cancelled');
    expect(of('A4')).toBe('in_progress');
    expect(of('A5')).toBe('returned');
  });
});

describe('tính lợi nhuận', () => {
  it('đối chiếu đơn ↔ quyết toán, giá vốn, quảng cáo, điều chỉnh', () => {
    const r = computeProfit(load(), COSTS, [], OPTS);
    expect(r.counts).toMatchObject({
      total: 5,
      completed: 2,
      cancelled: 1,
      in_progress: 1,
      returned: 1,
      settled: 4,
      unsettled: 1,
    });
    // A1 50k + A2 150k + A3 0 + A5 0 + điều chỉnh −5k = 195k đã về; A4 60k chờ về
    expect(r.settled).toBe(195000);
    expect(r.unsettled).toBe(60000);
    expect(r.revenue).toBe(75600 + 200000 + 90000);
    // giá vốn: A1 1×30k + A2 (2×30k + 1×20k) + A4 1×30k; A3 huỷ, A5 trả hết → 0
    expect(r.cogs).toBe(30000 + 80000 + 30000);
    // quảng cáo 35k − 5k GMV Max đã trừ trong quyết toán
    expect(r.adsFile).toBe(35000);
    expect(r.gmvInSettlement).toBe(5000);
    expect(r.ads).toBe(30000);
    expect(r.profit).toBe(195000 + 60000 - 140000 - 30000);
    expect(r.outOfPeriod).toEqual({ count: 1, settlement: 40000 });
    expect(r.adjustments).toBe(-5000);
    expect(r.missingCost).toEqual({ skus: 0, qty: 0 });
    expect(r.period).toEqual({ from: '2026-10-01', to: '2026-10-30' });
  });

  it('tắt "chờ quyết toán" → A4 thành đơn chưa có số; tắt chống trùng GMV Max', () => {
    const r = computeProfit(load(), COSTS, [], { includeUnsettled: false, dedupeGmvMax: false });
    expect(r.unsettled).toBe(0);
    expect(r.noMoney).toEqual({ count: 1, goodsValue: 90000 });
    expect(r.ads).toBe(35000);
  });

  it('thiếu giá vốn → đếm SKU thiếu, giá vốn tính 0', () => {
    const r = computeProfit(load(), { S1: 30000 }, [], OPTS);
    expect(r.missingCost).toEqual({ skus: 1, qty: 1 });
    expect(r.cogs).toBe(30000 + 60000 + 30000);
  });

  it('chi phí khác: đ/đơn (đơn không huỷ), % doanh thu, cố định', () => {
    const r = computeProfit(
      load(),
      COSTS,
      [
        { id: 'a', label: 'Đóng gói', kind: 'perOrder', value: 2000 },
        { id: 'b', label: 'Ship tự trả', kind: 'pctRevenue', value: 10 },
        { id: 'c', label: 'Nhân sự', kind: 'fixed', value: 100000 },
      ],
      OPTS,
    );
    expect(r.otherLines.map((l) => l.amount)).toEqual([8000, 36560, 100000]);
  });

  it('phí theo nhóm + theo SKU chia theo tiền hàng', () => {
    const r = computeProfit(load(), COSTS, [], OPTS);
    // A1 −12k + A2 −20k (file chờ quyết toán không có cột phí chi tiết → vào "Phí khác")
    expect(r.feeLines.find((f) => f.key === 'commission')?.amount).toBe(-32000);
    expect(r.feeLines.find((f) => f.key === 'other')?.amount).toBe(-30000);
    const s1 = r.skus.find((s) => s.key === 'S1')!;
    // A1 cả đơn + A2 phần 150k/200k + A4 (chờ quyết toán) cả đơn
    expect(s1.qty).toBe(4);
    expect(s1.settlement).toBeCloseTo(50000 + 150000 * 0.75 + 60000);
    expect(s1.profit).toBeCloseTo(s1.settlement - 4 * 30000);
  });

  it('không có file đơn hàng → tính mọi dòng quyết toán, không có giá vốn', () => {
    const r = computeProfit(mergeData([{ orders: [], income: parseIncome(INCOME, true), ads: [] }]), COSTS, [], OPTS);
    expect(r.hasOrders).toBe(false);
    expect(r.settled).toBe(50000 + 150000 + 40000 - 5000);
    expect(r.cogs).toBe(0);
    expect(r.outOfPeriod.count).toBe(0);
  });

  it('gộp file: dòng đã quyết toán không bị dòng chờ quyết toán đè', () => {
    const settled = parseIncome([ONHOLD[0], ['A4', '2026/10/30', '55000', '90000', '-35000']], true);
    const data = mergeData([
      { orders: [], income: settled, ads: [] },
      { orders: [], income: parseIncome(ONHOLD, false), ads: [] },
    ]);
    expect(data.income).toHaveLength(1);
    expect(data.income[0]).toMatchObject({ settled: true, settlement: 55000 });
  });
});

describe('Giới hạn đơn gói Miễn phí', () => {
  it('chỉ giữ dòng đơn hàng + quyết toán của đơn được phép; dòng điều chỉnh không gắn đơn giữ nguyên', () => {
    const data = {
      orders: [{ orderId: 'A' }, { orderId: 'B' }] as never[],
      income: [{ orderId: 'A' }, { orderId: 'B' }, { orderId: null }, { orderId: 'X' }] as never[],
      ads: [],
    };
    expect(profitOrderIds(data)).toEqual(['A', 'B']);
    const kept = limitOrders(data, new Set(['A']));
    expect(kept.orders.map((o: { orderId: string }) => o.orderId)).toEqual(['A']);
    // B bị bỏ; dòng không gắn đơn + dòng ngoài kỳ (X) giữ để báo như cũ
    expect(kept.income.map((r: { orderId: string | null }) => r.orderId)).toEqual(['A', null, 'X']);
  });
});

describe('mergeData — 1 đơn quyết toán nhiều lần', () => {
  it('giữ mọi lần quyết toán khác nhau, chỉ bỏ dòng trùng khi tải 2 file chồng kỳ', () => {
    const row = (settledAt: string, settlement: number) => ({
      id: 'O1',
      orderId: 'O1',
      type: 'Đơn hàng',
      createdAt: '2026-10-10',
      settledAt,
      settlement,
      revenue: 0,
      fees: settlement,
      adjustment: 0,
      feeParts: {},
      settled: true,
    });
    const file = [row('2026-10-14', -3255), row('2026-10-15', -40000), row('2026-10-18', 40000)];
    const m = mergeData([
      { orders: [], income: file, ads: [] },
      { orders: [], income: file.map((r) => ({ ...r })), ads: [] }, // tải lại cùng file
    ]);
    expect(m.income.map((r) => r.settlement)).toEqual([-3255, -40000, 40000]);
    const est = { ...row('', 50000), settledAt: null, settled: false };
    expect(mergeData([{ orders: [], income: [...file, est], ads: [] }]).income).toHaveLength(3); // bỏ ước tính
  });
});

describe('Nạp ví quảng cáo từ số dư (TikTok)', () => {
  const row = (id: string, type: string, settlement: number) => ({
    id,
    orderId: null,
    type,
    createdAt: '2026-10-10',
    settledAt: '2026-10-10',
    settlement,
    revenue: 0,
    fees: 0,
    adjustment: settlement,
    feeParts: {},
    settled: true,
  });
  const income = [
    row('T1', 'GMV thanh toán cho Quảng cáo TikTok', -500000),
    row('B1', 'Khoản bồi hoàn của nền tảng', 50000),
  ];
  const ads = [{ key: 'a1', date: '2026-10-10', cost: 300000, revenue: null, orders: null }];
  const opts = { includeUnsettled: true, dedupeGmvMax: true };

  it('có file quảng cáo → không trừ khoản nạp ví (chi phí lấy theo file QC), báo riêng', () => {
    const r = computeProfit(mergeData([{ orders: [], income, ads }]), {}, [], opts);
    expect(r.adsTopup).toEqual({ count: 1, amount: -500000, counted: false });
    expect(r.settled).toBe(50000);
    expect(r.ads).toBe(300000);
    expect(r.adjustmentLines.map((a) => a.label)).toEqual(['Khoản bồi hoàn của nền tảng']);
  });

  it('không có file quảng cáo / tắt công tắc → khoản nạp ví vẫn trừ như điều chỉnh', () => {
    expect(computeProfit(mergeData([{ orders: [], income, ads: [] }]), {}, [], opts).settled).toBe(-450000);
    const off = computeProfit(mergeData([{ orders: [], income, ads }]), {}, [], { ...opts, dedupeGmvMax: false });
    expect(off.settled).toBe(-450000);
    expect(off.adsTopup.counted).toBe(true);
  });
});

describe('Chương trình Hoàn phí vận chuyển (TikTok) — có / không đăng ký', () => {
  it('không đăng ký = bỏ phí SFR và bỏ tiền hoàn của chương trình', () => {
    const row = (id: string, settlement: number, feeParts: Record<string, number>) => ({
      id,
      orderId: id,
      type: 'Đơn hàng',
      createdAt: '2026-10-10',
      settledAt: '2026-10-12',
      settlement,
      revenue: 100000,
      fees: settlement - 100000,
      adjustment: 0,
      feeParts,
      settled: true,
    });
    const data = {
      orders: [],
      income: [row('O1', 96745, { sfr: -3255 }), row('O2', 70000, { sfr: -3255, sfrRefund: 20000 })],
      ads: [],
    };
    expect(sfrTotals(data)).toEqual({ fee: -6510, refund: 20000, orders: 2 });
    const opts = { includeUnsettled: true, dedupeGmvMax: true };
    const on = computeProfit(data, {}, [], opts);
    const off = computeProfit(withoutSfr(data), {}, [], opts);
    expect(off.settled - on.settled).toBe(6510 - 20000);
    expect(off.feeLines.some((f) => f.key === 'sfr' || f.key === 'sfrRefund')).toBe(false);
  });
});
