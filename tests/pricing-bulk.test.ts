import { describe, expect, it } from 'vitest';
import { computeFromPrice, logisticsFee, priceForMargin, roundUpPrice } from '../src/pages/finance/pricing/calc';
import { readXlsx } from '../src/pages/finance/pricing/import/xlsx';
import {
  buildCategoryMatcher,
  categoryLeafOf,
  detectBulkTable,
  detectFilePlatform,
  mergeItems,
  parseAmount,
  readBulkItems,
} from '../src/pages/finance/pricing/bulk/bulkImport';
import { computeBulkRow } from '../src/pages/finance/pricing/bulk/bulkCalc';
import {
  applyCategory,
  clearCategory,
  countRows,
  filterRows,
  resolveBulkRows,
} from '../src/pages/finance/pricing/bulk/bulkRows';
import type { BulkState } from '../src/pages/finance/pricing/bulk/useBulkStore';
import { buildXlsx } from '../src/pages/finance/pricing/bulk/writeXlsx';

/** Giống file "Chỉnh sửa hàng loạt" của TikTok: dòng mã, dòng V4, tiêu đề Việt, "Bắt buộc", hướng dẫn, rồi dữ liệu */
const TIKTOK_BULK: string[][] = [
  ['product_id', 'category', 'product_name', 'product_status', 'sku_id', 'variation_value', 'product_description', 'brand', 'price', 'seller_sku', 'parcel_weight'],
  ['V4', 'All_Information', 'metric'],
  ['ID sản phẩm', 'Hạng mục', 'Tên sản phẩm', 'Trạng thái sản phẩm', 'ID SKU', 'Tùy chọn biến thể', 'Mô tả sản phẩm', 'Nhãn hiệu', 'Giá bán lẻ (Nội tệ)', 'SKU người bán', 'Trọng lượng kiện hàng(g)'],
  ['Bắt buộc', 'Bắt buộc', 'Bắt buộc', 'Không bắt buộc', 'Bắt buộc', 'Bắt buộc', 'Bắt buộc', '', 'Bắt buộc', '', 'Bắt buộc'],
  ['Không thể chỉnh sửa', 'Không thể chỉnh sửa', 'Tên sản phẩm phải ít hơn 255 ký tự', '', '', '', '', '', 'Nhập giá của sản phẩm', '', 'Trọng lượng của kiện hàng'],
  ['111', 'Dầu gội & dầu xả (601469)', 'Dầu gội thảo mộc', 'Trên kệ(1)', 'S1', '500ml', '<p>..</p>', '', '250000', 'DG-500', '600'],
  ['111', 'Dầu gội & dầu xả (601469)', 'Dầu gội thảo mộc', 'Trên kệ(1)', 'S2', 'Default', '', '', '120000', '', '12500'],
  ['222', 'Hair Oils & Treatments (981512)', 'Tinh dầu bưởi', 'Trên kệ(1)', 'S3', 'Mặc định', '', '', '95.000', '', ''],
];

const CATS = [
  { id: 'hair', name: 'Làm đẹp › Chăm sóc tóc › Dầu gội & Dầu xả', pct: 15.5 },
  { id: 'pet', name: 'Thú cưng › Đồ chải chuốt › Dầu gội & Dầu xả', pct: 12.5 },
  { id: 'serum', name: 'Làm đẹp › Chăm sóc da › Serum & Tinh chất', pct: 15 },
];

const BASE = { fees: [], adsPct: 10, taxPct: 1.5, applyLogistics: true, marginPct: 10 };

describe('đọc file sản phẩm hàng loạt', () => {
  it('nhận dòng tiêu đề, bỏ dòng "Bắt buộc" / hướng dẫn, đọc giá + trọng lượng', () => {
    const table = detectBulkTable(TIKTOK_BULK)!;
    expect(table.headerRow).toBe(0);
    expect(table.mapping).toMatchObject({ name: 2, price: 8, weight: 10, category: 1, skuId: 4, variant: 5 });
    const items = readBulkItems(TIKTOK_BULK, table);
    expect(items.map((i) => i.key)).toEqual(['S1', 'S2', 'S3']);
    expect(items[0]).toMatchObject({ price: 250_000, weightG: 600, variant: '500ml', sellerSku: 'DG-500', cost: null });
    expect(items[1].variant).toBeNull(); // "Default"
    expect(items[2]).toMatchObject({ price: 95_000, weightG: null, variant: null });
  });

  it('file tự làm có cột Giá vốn, cân nặng theo kg', () => {
    const rows = [
      ['Tên sản phẩm', 'Giá vốn', 'Giá bán', 'Cân nặng (kg)'],
      ['Áo thun', '50.000', '149.000', '0,3'],
      ['Ghi chú cuối file', '', '', ''],
    ];
    const items = readBulkItems(rows, detectBulkTable(rows)!);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ cost: 50_000, price: 149_000, weightG: 300 });
  });

  it('không có cột tên + giá → null', () => {
    expect(detectBulkTable([['a', 'b'], ['1', '2']])).toBeNull();
  });

  it('parseAmount kiểu Việt Nam', () => {
    expect(parseAmount('90000')).toBe(90_000);
    expect(parseAmount('1.250.000đ')).toBe(1_250_000);
    expect(parseAmount('1,5')).toBe(1.5);
    expect(parseAmount('1.234,5')).toBe(1234.5);
    expect(parseAmount('Bắt buộc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });

  it('gộp nhiều file: SKU trùng lấy dòng mới', () => {
    const items = readBulkItems(TIKTOK_BULK, detectBulkTable(TIKTOK_BULK)!);
    const merged = mergeItems(items, [{ ...items[0], price: 1 }]);
    expect(merged).toHaveLength(3);
    expect(merged[0].price).toBe(1);
  });

  it('khớp ngành theo tên cuối, bỏ ID trong ngoặc; trùng tên → ambiguous', () => {
    expect(categoryLeafOf('Serum & Tinh chất (601619)')).toBe('Serum & Tinh chất');
    const match = buildCategoryMatcher(CATS);
    expect(match('Serum & Tinh chất (601619)')).toEqual({ category: CATS[2], ambiguous: false });
    expect(match('Dầu gội & dầu xả (601469)')).toEqual({ category: CATS[0], ambiguous: true });
    expect(match('Hair Oils & Treatments (981512)')).toBeNull();
    expect(match(null)).toBeNull();
  });
});

describe('tính từng dòng', () => {
  const row = (cost: number | null, price: number | null, categoryPct = 15, weightG = 0) => ({
    cost,
    price,
    categoryPct,
    weightG,
  });

  it('thiếu giá vốn → không tính', () => {
    expect(computeBulkRow(row(null, 100_000), BASE).status).toBe('missing-cost');
  });

  it('khớp công thức tính 1 sản phẩm + giá đề xuất làm tròn', () => {
    const r = computeBulkRow(row(100_000, 200_000, 15, 500), BASE);
    const input = { cost: 100_000, categoryPct: 15, fees: [], adsPct: 10, taxPct: 1.5, weightKg: 0.5, applyLogistics: true };
    expect(r.current?.profit).toBeCloseTo(computeFromPrice(200_000, input).profit);
    expect(r.suggested).toBe(roundUpPrice(priceForMargin(10, input)!));
    expect(r.diff).toBe(r.suggested! - 200_000);
    expect(r.status).toBe('ok');
  });

  it('lỗ / dưới mục tiêu / chưa có giá / không đạt', () => {
    expect(computeBulkRow(row(100_000, 110_000), BASE).status).toBe('loss');
    expect(computeBulkRow(row(100_000, 150_000), BASE).status).toBe('below-target');
    expect(computeBulkRow(row(100_000, null), BASE).status).toBe('missing-price');
    expect(computeBulkRow(row(100_000, null, 85), BASE)).toMatchObject({ status: 'impossible', suggested: null });
  });

  it('TikTok: trọng lượng ≥ 10kg cộng phí logistics, Shopee thì không', () => {
    const r = row(100_000, 300_000, 10, 12_500);
    const tiktok = computeBulkRow(r, BASE).current!;
    const shopee = computeBulkRow(r, { ...BASE, applyLogistics: false }).current!;
    expect(shopee.profit - tiktok.profit).toBe(logisticsFee(12.5));
  });

  it('thứ tự ưu tiên ngành: chọn riêng dòng > chọn cả ngành > tự khớp > mặc định', () => {
    const items = readBulkItems(TIKTOK_BULK, detectBulkTable(TIKTOK_BULK)!);
    const state = { items, costs: { S1: 100_000 }, prices: { S2: 200_000 }, categoryMap: {}, rowCategory: {} };
    let rows = resolveBulkRows(state, CATS, 14, BASE);
    expect(rows.map((r) => r.category.kind)).toEqual(['file', 'file', 'default']);
    expect(rows[2].categoryPct).toBe(14);
    expect(rows[0].cost).toBe(100_000);
    expect(rows[1]).toMatchObject({ price: 200_000, priceEdited: true });

    rows = resolveBulkRows(
      { ...state, categoryMap: { 'hair oils & treatments (981512)': 'serum' }, rowCategory: { S1: 'pet' } },
      CATS,
      null,
      BASE,
    );
    expect(rows.map((r) => r.category.kind)).toEqual(['row', 'file', 'map']);
    expect(rows.map((r) => r.categoryPct)).toEqual([12.5, 15.5, 15]);

    const none = resolveBulkRows(state, CATS, null, BASE);
    expect(none[2]).toMatchObject({ category: { kind: 'none' }, categoryPct: 0 });
    expect(countRows(none)).toMatchObject({ all: 3, 'missing-cost': 2, category: 1 });
    expect(filterRows(none, 'all', 'buoi').map((r) => r.item.key)).toEqual(['S3']);
    expect(filterRows(none, 'category', '').map((r) => r.item.key)).toEqual(['S3']);
  });
});

/** Giống file "Cập nhật hàng loạt — thông tin bán hàng" của Shopee */
const SHOPEE_BULK: string[][] = [
  ['et_title_product_id', 'et_title_product_name', 'et_title_variation_id', 'et_title_variation_name', 'et_title_parent_sku', 'et_title_variation_sku', 'et_title_variation_price', 'ps_gtin_code', 'et_title_variation_stock', 'et_title_reason'],
  ['sales_info', '700a3d5d', '0', '347868522', '{"search_condition":{}}'],
  ['Mã Sản phẩm', 'Tên Sản phẩm', 'Mã Phân loại', 'Tên phân loại', 'SKU Sản phẩm', 'SKU', 'Giá', 'GTIN', 'Seller Stock', 'Lý do thất bại'],
  ['', '', '', '', '', '', 'Bắt buộc', '', 'Bắt buộc', ''],
  ['', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', 'Vui lòng nhập 1000 đến 120000000', '', '', ''],
  ['5816', 'Bỉm quần Miobuss', '4109', 'Size 1: 9-14kg (L)', '', '-', '450000', '', '480', ''],
  ['5816', 'Bỉm quần Miobuss', '4110', 'Size 2: 12-17kg (XL)', 'MIO', '-', '450000', '', '454', ''],
  ['3467', 'Ruột chăn đông', '7224', '', '', 'CHAN-01', '419000', '', '1037', ''],
];

describe('file Shopee', () => {
  it('nhận cột theo mẫu Shopee, "-" là trống, SKU cha khi phân loại không có SKU', () => {
    const table = detectBulkTable(SHOPEE_BULK)!;
    expect(table.mapping).toMatchObject({ productId: 0, name: 1, skuId: 2, variant: 3, parentSku: 4, sellerSku: 5, price: 6, stock: 8 });
    const items = readBulkItems(SHOPEE_BULK, table);
    expect(items.map((i) => i.key)).toEqual(['4109', '4110', '7224']);
    expect(items[0]).toMatchObject({ productId: '5816', sellerSku: null, stock: 480, price: 450_000, category: null, weightG: null });
    expect(items[1].sellerSku).toBe('MIO');
    expect(items[2]).toMatchObject({ sellerSku: 'CHAN-01', variant: null, stock: 1037 });
  });

  it('nhận ra file của sàn nào', () => {
    expect(detectFilePlatform(SHOPEE_BULK)).toBe('shopee');
    expect(detectFilePlatform(TIKTOK_BULK)).toBe('tiktok');
    expect(detectFilePlatform([['Tên sản phẩm', 'Giá bán']])).toBeNull();
  });

  it('không có cột ngành: chọn theo sản phẩm, ngành chung cho phần còn lại, bỏ chọn được', () => {
    const items = readBulkItems(SHOPEE_BULK, detectBulkTable(SHOPEE_BULK)!);
    let state: BulkState = {
      items,
      files: [],
      costs: {},
      prices: {},
      categoryMap: {},
      rowCategory: {},
      productCategory: {},
      fallbackCategoryId: null,
    };
    const kinds = () => resolveBulkRows(state, CATS, 14, BASE).map((r) => r.category.kind);
    expect(kinds()).toEqual(['default', 'default', 'default']);

    state = applyCategory(state, items[0], 'serum', 'row');
    state = applyCategory(state, items[0], 'hair', 'product'); // cả sản phẩm → xoá lựa chọn riêng của SKU
    expect(state.rowCategory).toEqual({});
    state = applyCategory(state, null, 'pet', 'fallback');
    let rows = resolveBulkRows(state, CATS, 14, BASE);
    expect(rows.map((r) => r.category.kind)).toEqual(['product', 'product', 'fallback']);
    expect(rows.map((r) => r.categoryPct)).toEqual([15.5, 15.5, 12.5]);
    expect(countRows(rows).category).toBe(0);

    state = clearCategory(state, rows[0]);
    state = clearCategory(state, null);
    rows = resolveBulkRows(state, CATS, 14, BASE);
    expect(rows.map((r) => r.category.kind)).toEqual(['default', 'default', 'default']);
  });

  it('chọn cho cả ngành trong file (TikTok) gỡ lựa chọn hẹp hơn đang che', () => {
    const items = readBulkItems(TIKTOK_BULK, detectBulkTable(TIKTOK_BULK)!);
    let state: BulkState = {
      items,
      files: [],
      costs: {},
      prices: {},
      categoryMap: {},
      rowCategory: { S2: 'serum' },
      productCategory: {},
      fallbackCategoryId: null,
    };
    state = applyCategory(state, items[0], 'pet', 'file');
    const rows = resolveBulkRows(state, CATS, 14, BASE);
    expect(rows.map((r) => r.category.kind)).toEqual(['map', 'map', 'default']);
  });
});

describe('xuất Excel', () => {
  it('file .xlsx tự ghi đọc lại được', async () => {
    const data = buildXlsx('Tính giá', ['Tên', 'Giá', '%'], [
      ['Áo <thun> & "quần"', 149_000, 10.5],
      [null, 0, ''],
    ]);
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const sheets = await readXlsx(buf);
    expect(sheets[0].name).toBe('Tính giá');
    expect(sheets[0].rows[0]).toEqual(['Tên', 'Giá', '%']);
    expect(sheets[0].rows[1]).toEqual(['Áo <thun> & "quần"', '149000', '10.5']);
    expect(sheets[0].rows[2]).toEqual(['', '0']);
  });
});
