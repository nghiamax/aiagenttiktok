import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/pages/finance/pricing/import/categoryImport';
import { parseProfitRows } from '../src/pages/finance/profit/profitImport';
import {
  parseShopeeAdjust,
  parseShopeeAds,
  parseShopeeIncome,
  parseShopeeOrders,
  parseShopeeServiceFees,
  splitServiceFees,
} from '../src/pages/finance/profit/shopeeImport';
import { computeProfit, mergeData, otherCostAmount, type ProfitOptions } from '../src/pages/finance/profit/profitCalc';

// Cột rút gọn theo file "Order.all.order_creation_date….xlsx" của Shopee (giữ đúng 2 cột gần trùng tên)
const H = [
  'Mã đơn hàng',
  'Ngày đặt hàng',
  'Trạng Thái Đơn Hàng',
  'Trạng thái Trả hàng/Hoàn tiền',
  'SKU sản phẩm',
  'Tên sản phẩm',
  'SKU phân loại hàng',
  'Tên phân loại hàng',
  'Giá ưu đãi',
  'Số lượng',
  'Số lượng sản phẩm được hoàn trả',
  'Tổng số tiền Người mua thanh toán',
  'Tổng giá trị đơn hàng (VND)',
  'Mã giảm giá của Shop',
  'Mã giảm giá của Shopee',
  'Giảm giá từ Combo của Shop',
  'Phí vận chuyển trả hàng (đơn Trả hàng/hoàn tiền)',
  'Tổng số tiền người mua thanh toán',
  'Thời gian hoàn thành đơn hàng',
  'Phí cố định',
  'Phí Dịch Vụ',
  'Phí xử lý giao dịch',
];
const row = (o: Record<string, string>) => H.map((h) => o[h] ?? '');
const ORDERS = [
  H,
  // 1 đơn 2 dòng — khoản theo đơn lặp lại trên mỗi dòng
  row({
    'Mã đơn hàng': 'S1',
    'Ngày đặt hàng': '2026-10-02 09:00',
    'Trạng Thái Đơn Hàng': 'Hoàn thành',
    'Tên sản phẩm': 'Xe chòi chân',
    'Tên phân loại hàng': 'Đỏ',
    'Số lượng': '1',
    'Số lượng sản phẩm được hoàn trả': '0',
    'Tổng số tiền Người mua thanh toán': '300000.00',
    'Tổng số tiền người mua thanh toán': '999999',
    'Mã giảm giá của Shop': '20000.00',
    'Phí cố định': '40000.00',
    'Phí Dịch Vụ': '15000.00',
    'Phí xử lý giao dịch': '12000.00',
  }),
  row({
    'Mã đơn hàng': 'S1',
    'Ngày đặt hàng': '2026-10-02 09:00',
    'Trạng Thái Đơn Hàng': 'Hoàn thành',
    'Tên sản phẩm': 'Bóng nhựa',
    'SKU phân loại hàng': 'B100',
    'Số lượng': '2',
    'Số lượng sản phẩm được hoàn trả': '0',
    'Tổng số tiền Người mua thanh toán': '100000.00',
    'Tổng số tiền người mua thanh toán': '999999',
    'Mã giảm giá của Shop': '20000.00',
    'Phí cố định': '40000.00',
    'Phí Dịch Vụ': '15000.00',
    'Phí xử lý giao dịch': '12000.00',
  }),
  // Huỷ → không có tiền
  row({
    'Mã đơn hàng': 'S2',
    'Ngày đặt hàng': '2026-10-03 10:00',
    'Trạng Thái Đơn Hàng': 'Đã hủy',
    'Tên sản phẩm': 'Xe chòi chân',
    'Tên phân loại hàng': 'Đỏ',
    'Số lượng': '1',
    'Tổng số tiền Người mua thanh toán': '300000.00',
    'Phí cố định': '0.00',
  }),
  // Trả hàng toàn bộ: Shopee ghi phí = 0, có phí vận chuyển trả hàng
  row({
    'Mã đơn hàng': 'S3',
    'Ngày đặt hàng': '2026-10-04 10:00',
    'Trạng Thái Đơn Hàng': 'Hoàn thành',
    'Trạng thái Trả hàng/Hoàn tiền': 'Đã Chấp Thuận Yêu Cầu',
    'Tên sản phẩm': 'Bóng nhựa',
    'SKU phân loại hàng': 'B100',
    'Số lượng': '1',
    'Số lượng sản phẩm được hoàn trả': '1',
    'Tổng số tiền Người mua thanh toán': '50000.00',
    'Mã giảm giá của Shop': '5000.00',
    'Phí vận chuyển trả hàng (đơn Trả hàng/hoàn tiền)': '18000.00',
    'Phí cố định': '0.00',
  }),
];

const ADS_CSV = [
  'Chiến dịch nhóm - Shopee {Quốc gia}',
  'Tên gian hàng,Shop thử',
  'Khoảng thời gian,01/10/2026 - 31/10/2026',
  '',
  'Thứ tự,Chiến dịch / Tên sản phẩm,Trạng thái,Loại Dịch vụ Hiển thị,Mã sản phẩm,Phương thức đấu thầu,Ngày bắt đầu,Ngày kết thúc,Lượt chuyển đổi,Doanh số,Chi phí,ROAS',
  '1,Chiến Dịch Nhóm 1,Đang diễn ra,Dịch vụ Hiển thị Sản phẩm,-,Tối đa Doanh thu,10/01/2026 00:00:00,Không giới hạn,5,900000,30000,30',
  '2,Xe chòi chân,-,Dịch vụ Hiển thị Sản phẩm,111,-,-,-,4,800000,25000,32',
  '3,Bóng nhựa,-,Dịch vụ Hiển thị Sản phẩm,222,-,-,-,1,100000,5000,20',
  '4,"Ghế, có dấu phẩy",Đang diễn ra,Dịch vụ Hiển thị Sản phẩm,333,Đấu thầu tự động,-,-,0,0,7000,0',
].join('\r\n');

const OPTS: ProfitOptions = { includeUnsettled: true, dedupeGmvMax: true };

describe('Shopee — file đơn hàng', () => {
  it('lấy tiền hàng từng dòng (cột "Người" viết hoa), khoản theo đơn chỉ lấy 1 lần', () => {
    const { orders, income } = parseShopeeOrders(ORDERS);
    expect(orders).toHaveLength(4);
    expect(orders[1]).toMatchObject({
      orderId: 'S1',
      skuId: 'B100',
      qty: 2,
      subtotal: 100000,
      createdAt: '2026-10-02',
    });
    expect(orders[0].skuId).toBeNull(); // không có SKU phân loại → khoá theo tên + phân loại
    // Shopee ghi "-" khi trống → coi như không có SKU
    const dash = parseShopeeOrders([
      H,
      row({
        'Mã đơn hàng': 'S9',
        'Trạng Thái Đơn Hàng': 'Hoàn thành',
        'Tên sản phẩm': 'Bỉm',
        'SKU phân loại hàng': '-',
        'Số lượng': '1',
        'Tổng số tiền Người mua thanh toán': '1000',
      }),
    ]);
    expect(dash.orders[0].skuId).toBeNull();
    const s1 = income.find((r) => r.id === 'S1')!;
    // doanh thu = 300k + 100k − mã giảm giá shop 20k (1 lần) · phí = 40k + 15k + 12k (1 lần)
    expect(s1).toMatchObject({ revenue: 380000, fees: -67000, settlement: 313000, settled: false }); // ước tính
    expect(income.find((r) => r.id === 'S2')).toBeUndefined(); // huỷ
    const s3 = income.find((r) => r.id === 'S3')!;
    expect(s3).toMatchObject({ revenue: 0, fees: -18000, settlement: -18000 }); // trả hết: chỉ mất phí ship trả hàng
  });

  it('nhận ra file Shopee trước file TikTok; tính lợi nhuận đủ trạng thái', () => {
    const p = parseProfitRows(ORDERS, 'Order.all.xlsx')!;
    expect(p).toMatchObject({ kind: 'orders', platform: 'shopee' });
    const r = computeProfit(mergeData([{ orders: p.orders!, income: p.income!, ads: [] }]), { B100: 20000 }, [], OPTS);
    expect(r.counts).toMatchObject({ total: 3, completed: 1, returned: 1, cancelled: 1 });
    expect(r.settled).toBe(0);
    expect(r.unsettled).toBe(313000 - 18000); // chưa có file "Đã thanh toán" → ước tính
    expect(r.cogs).toBe(40000); // B100 × 2 (đơn trả hàng không tính giá vốn)
    expect(r.feeLines.map((f) => f.key)).toEqual(['spFixed', 'spService', 'spTransaction', 'spReturnShip']);
  });
});

// Tài chính › Doanh thu › Đã thanh toán: trang "Doanh thu" (dòng tiêu đề ở dòng 3) + trang "Adjustment"
const INCOME_HEAD = [
  'STT',
  'Đơn hàng / Sản phẩm',
  'Mã đơn hàng',
  'Ngày đặt hàng',
  'Ngày hoàn thành thanh toán',
  'Giá sản phẩm',
  'Số tiền hoàn lại',
  'Mã ưu đãi do Người Bán chịu',
  'Phí vận chuyển Người mua trả',
  'Phí vận chuyển thực tế',
  'Phí cố định',
  'Phí Dịch Vụ',
  'Phí xử lý giao dịch',
  'Phí hoa hồng Tiếp thị liên kết',
  'Phí dịch vụ PiShip',
  'Thuế GTGT',
  'Thuế TNCN',
  'Tổng tiền đã thanh toán',
];
const INCOME: string[][] = [
  ['Báo cáo thu nhập'],
  [''],
  INCOME_HEAD,
  [
    '1',
    'Order',
    'S1',
    '2026-10-02',
    '2026-10-09',
    '400000',
    '0',
    '-20000',
    '30000',
    '-30000',
    '-40000',
    '-15000',
    '-12000',
    '-8000',
    '-1650',
    '-4000',
    '-2000',
    '297350',
  ],
  ['', 'Sku', 'S1', '', '', '300000', '', '', '', '', '', '', '', '', '', '', '', ''],
  [
    '2',
    'Order',
    'S9',
    '2026-09-20',
    '2026-10-01',
    '100000',
    '0',
    '0',
    '0',
    '0',
    '-10000',
    '0',
    '-3000',
    '0',
    '0',
    '0',
    '0',
    '87000',
  ],
];
const ADJUST: string[][] = [
  [
    'Mã giao dịch',
    'Ngày hoàn thành điều chỉnh',
    'Loại điều chỉnh',
    'Lý do điều chỉnh',
    'Số tiền điều chỉnh',
    'Mã đơn hàng liên quan',
  ],
  ['111', '2026-10-15', 'Hoàn tiền sau thanh toán', 'Trả hàng', '-50000', 'S3'],
  ['112', '2026-10-16', 'Marketing', 'Chương trình', '-7000', ''],
  ['Tổng cộng', '', '', '', '-57000'],
];

describe('Shopee — file "Đã thanh toán"', () => {
  it('dòng Order = tiền Shopee thực trả + từng khoản (bỏ dòng Sku)', () => {
    const rows = parseShopeeIncome(INCOME);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ orderId: 'S1', settlement: 297350, revenue: 380000, fees: -82650, settled: true });
    expect(rows[0].feeParts).toMatchObject({
      spFixed: -40000,
      spService: -15000,
      spTransaction: -12000,
      spAffiliate: -8000,
      spPiship: -1650,
      spVat: -4000,
      spPit: -2000,
    });
    expect(rows[0].feeParts.spShipping).toBeUndefined(); // người mua trả 30k − thực tế 30k = 0
    expect(parseProfitRows(INCOME, 'Income.đã phát hành.xlsx')).toMatchObject({ kind: 'income', platform: 'shopee' });
  });

  it('điều chỉnh: bỏ dòng "Tổng cộng" (không cộng gấp đôi)', () => {
    const rows = parseShopeeAdjust(ADJUST);
    expect(rows.map((r) => r.settlement)).toEqual([-50000, -7000]);
    expect(rows[0]).toMatchObject({ orderId: 'S3', adjustment: -50000, settled: true });
  });

  it('đơn đã thanh toán lấy số thật; đơn chưa có → ước tính (bật/tắt); đơn ngoài kỳ không tính', () => {
    const p = parseProfitRows(ORDERS, 'Order.all.xlsx')!;
    const data = mergeData([
      { orders: p.orders!, income: p.income!, ads: [] },
      { orders: [], income: [...parseShopeeIncome(INCOME), ...parseShopeeAdjust(ADJUST)], ads: [] },
    ]);
    const r = computeProfit(data, {}, [], OPTS);
    expect(r.hasSettled).toBe(true);
    // S1 thật 297.350 · S3 chỉ có điều chỉnh đã trả −50k + ước tính −18k · điều chỉnh không gắn đơn −7k
    expect(r.settled).toBe(297350 - 50000 - 7000);
    expect(r.unsettled).toBe(-18000);
    expect(r.outOfPeriod).toEqual({ count: 1, settlement: 87000 }); // S9 đặt tháng 9
    expect(r.feeLines.find((f) => f.key === 'spAffiliate')?.amount).toBe(-8000);
    const off = computeProfit(data, {}, [], { ...OPTS, includeUnsettled: false });
    expect(off.unsettled).toBe(0);
    expect(off.settled).toBe(297350 - 50000 - 7000);
  });
});

describe('Shopee — kỳ theo ngày thanh toán (khớp báo cáo thu nhập)', () => {
  it('tính mọi đơn / điều chỉnh đã trả (kể cả đơn đặt trước kỳ), bỏ số ước tính', () => {
    const p = parseProfitRows(ORDERS, 'Order.all.xlsx')!;
    const data = mergeData([
      { orders: p.orders!, income: p.income!, ads: [] },
      { orders: [], income: [...parseShopeeIncome(INCOME), ...parseShopeeAdjust(ADJUST)], ads: [] },
    ]);
    const r = computeProfit(data, { B100: 20000 }, [], { ...OPTS, basis: 'payment' });
    expect(r.basis).toBe('payment');
    // = tổng file "Đã thanh toán": S1 297.350 + S9 87.000 + điều chỉnh −57.000
    expect(r.settled).toBe(297350 + 87000 - 57000);
    expect(r.unsettled).toBe(0);
    expect(r.revenue).toBe(380000 + 100000);
    expect(r.paidNoOrder).toEqual({ count: 1, settlement: 87000 }); // S9 không có trong file đơn hàng → thiếu giá vốn
    expect(r.counts.total).toBe(1); // chỉ S1 (đơn đã trả có trong file đơn hàng)
    expect(r.paidPeriod).toEqual({ from: '2026-10-01', to: '2026-10-16' });
    // điều chỉnh hiện rõ theo loại (không ngầm trong "chênh lệch")
    expect(r.adjustmentLines).toEqual([
      { label: 'Hoàn tiền sau thanh toán', count: 1, amount: -50000 },
      { label: 'Marketing', count: 1, amount: -7000 },
    ]);
  });

  it('chưa có file "Đã thanh toán" → vẫn theo ngày đặt đơn', () => {
    const p = parseProfitRows(ORDERS, 'Order.all.xlsx')!;
    const r = computeProfit(mergeData([{ orders: p.orders!, income: p.income!, ads: [] }]), {}, [], {
      ...OPTS,
      basis: 'payment',
    });
    expect(r.basis).toBe('order');
  });

  it('trang Service Fee Details tách Phí dịch vụ = Phí hạ tầng + Voucher Xtra', () => {
    const svc = parseShopeeServiceFees([
      ['', '', 'Phí Dịch Vụ', '', ''],
      ['Mã giao dịch', 'Mã đơn hàng', 'Phí Hạ Tầng', 'Phí hạ tầng', 'Voucher Xtra'],
      ['1', 'S1', '-3000', '0', '-10000'],
    ])!;
    expect(svc.get('S1')).toEqual({ infra: -3000, voucher: -10000 });
    const income = parseShopeeIncome(INCOME);
    splitServiceFees(income, svc);
    expect(income[0].feeParts).toMatchObject({ spInfra: -3000, spVoucherXtra: -10000, spService: -2000 });
    expect(parseShopeeServiceFees(INCOME)).toBeNull();
  });
});

describe('Shopee — báo cáo quảng cáo', () => {
  it('CSV có dòng thông tin đầu file vẫn tách cột đúng (cả ô có dấu phẩy trong ngoặc kép)', () => {
    const rows = parseCsv(ADS_CSV);
    expect(rows[4]).toHaveLength(12);
    expect(rows[8][1]).toBe('Ghế, có dấu phẩy');
  });

  it('chỉ cộng dòng chiến dịch (không tính trùng dòng sản phẩm); quảng cáo 1 sản phẩm riêng vẫn tính', () => {
    const { ads, range } = parseShopeeAds(parseCsv(ADS_CSV));
    expect(range).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    const total = ads.filter((a) => !a.detail).reduce((s, a) => s + a.cost, 0);
    expect(total).toBe(30000 + 7000);
    expect(ads.filter((a) => a.detail).map((a) => a.product)).toEqual([
      'Xe chòi chân',
      'Bóng nhựa',
      'Ghế, có dấu phẩy',
    ]);
  });

  it('2 file quảng cáo cùng kỳ (nhóm + tự động) không đè nhau dù trùng số thứ tự', () => {
    const other = ADS_CSV.replace('Chiến dịch nhóm - Shopee {Quốc gia}', 'Chiến dịch Tự Động Chọn Sản phẩm - Shopee');
    const a = parseShopeeAds(parseCsv(ADS_CSV)).ads;
    const b = parseShopeeAds(parseCsv(other)).ads;
    const merged = mergeData([
      { orders: [], income: [], ads: a },
      { orders: [], income: [], ads: b },
    ]);
    expect(merged.ads.filter((x) => !x.detail).reduce((s, x) => s + x.cost, 0)).toBe(2 * 37000);
  });

  it('báo cáo "Chiến dịch Tự Động Chọn Sản phẩm": cột "Tên sản phẩm" + "Mã sản phẩm", dòng đầu (Mã "-") = tổng', () => {
    const csv = [
      'Chiến dịch Tự Động Chọn Sản phẩm (cấp độ Shop) - Shopee VN',
      'Khoảng thời gian,01/10/2026 - 31/10/2026',
      '',
      'Thứ tự,Tên sản phẩm,Mã sản phẩm,Số lượt xem,Doanh số,Chi phí,ROAS,ACOS',
      '1,Chiến dịch Tự Động Chọn Sản phẩm (cấp độ Shop),-,100,900000,30000,30,3.33%',
      '2,15197901080,15197901080,0,0,0,0,0.00%',
      '3,"Xe đẩy 3 in 1, xe chòi chân",15212472373,50,600000,20000,30,3.33%',
      '4,Ghế ăn dặm,24042706736,50,300000,10000,30,3.33%',
    ].join('\n');
    const p = parseProfitRows(parseCsv(csv), 'auto.csv')!;
    expect(p).toMatchObject({ kind: 'ads', platform: 'shopee', adsType: 'auto' });
    expect(p.ads!.filter((x) => !x.detail).reduce((s, x) => s + x.cost, 0)).toBe(30000);
    expect(p.ads!.filter((x) => x.detail).map((x) => x.product)).toEqual([
      '15197901080',
      'Xe đẩy 3 in 1, xe chòi chân',
      'Ghế ăn dặm',
    ]);
  });

  it('chia quảng cáo theo sản phẩm cho SKU; sản phẩm không có trong đơn → báo không chia được', () => {
    const o = parseProfitRows(ORDERS, 'Order.all.xlsx')!;
    const a = parseProfitRows(parseCsv(ADS_CSV), 'ads.csv')!;
    expect(a).toMatchObject({ kind: 'ads', platform: 'shopee', adsType: 'group' });
    const r = computeProfit(
      mergeData([
        { orders: o.orders!, income: o.income!, ads: [] },
        { orders: [], income: [], ads: a.ads! },
      ]),
      {},
      [],
      OPTS,
    );
    expect(r.ads).toBe(37000);
    expect(r.adsBySku).toBe(true);
    expect(r.skus.find((s) => s.productName === 'Xe chòi chân')!.ads).toBe(25000);
    expect(r.skus.find((s) => s.skuId === 'B100')!.ads).toBe(5000);
    expect(r.adsUnmatched).toBe(7000);
  });
});

describe('Chi phí khác — đúng cơ sở tính', () => {
  it('đơn hoàn chỉ nhân số đơn trả hàng; đơn bán / sản phẩm / % / cả kỳ', () => {
    const o = parseProfitRows(ORDERS, 'Order.all.xlsx')!;
    const r = computeProfit(
      mergeData([{ orders: o.orders!, income: o.income!, ads: [] }]),
      {},
      [
        { id: 'a', label: 'Đơn hoàn', kind: 'perReturn', value: 20000 },
        { id: 'b', label: 'Đóng gói', kind: 'perOrder', value: 3000 },
        { id: 'c', label: 'Tem', kind: 'perUnit', value: 500 },
        { id: 'd', label: 'Nhân viên', kind: 'fixed', value: 1_000_000 },
        { id: 'e', label: 'Huỷ', kind: 'perCancel', value: 1000 },
      ],
      OPTS,
    );
    // S1 hoàn tất · S2 huỷ · S3 trả hàng
    expect(r.otherBases).toMatchObject({ orders: 2, returned: 1, cancelled: 1, units: 3 });
    const amt = Object.fromEntries(r.otherLines.map((l) => [l.label, l.amount]));
    expect(amt).toEqual({ 'Đơn hoàn': 20000, 'Đóng gói': 6000, Tem: 1500, 'Nhân viên': 1_000_000, Huỷ: 1000 });
    expect(r.other).toBe(1_028_500);
    expect(otherCostAmount({ kind: 'pctRevenue', value: 2 }, { ...r.otherBases, revenue: 500000 })).toBe(10000);
  });
});
