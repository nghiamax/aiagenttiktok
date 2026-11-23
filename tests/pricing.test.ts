import { describe, expect, it } from 'vitest';
import {
  computeFromPrice,
  logisticsFee,
  priceForMargin,
  roundUpPrice,
  type PricingInput,
} from '../src/pages/finance/pricing/calc';
import { defaultConfig, normalizeConfig } from '../src/pages/finance/pricing/config';

const base: PricingInput = {
  cost: 100_000,
  categoryPct: 12.5,
  fees: [
    { id: 'payment', label: 'Phí thanh toán', kind: 'pct', value: 5 },
    { id: 'fixed', label: 'Phí cố định', kind: 'fixed', value: 3_000 },
    { id: 'zero', label: 'Chưa nhập', kind: 'pct', value: 0 },
  ],
  adsPct: 10,
  taxPct: 1.5,
  weightKg: 0.5,
  applyLogistics: true,
};

describe('logisticsFee', () => {
  it('dưới 10kg không mất phí', () => {
    expect(logisticsFee(0.5)).toBe(0);
    expect(logisticsFee(9.99)).toBe(0);
  });
  it('từ 10kg 3.000đ, thêm 3.000đ mỗi 0,5kg', () => {
    expect(logisticsFee(10)).toBe(3_000);
    expect(logisticsFee(10.4)).toBe(3_000);
    expect(logisticsFee(10.5)).toBe(6_000);
    expect(logisticsFee(12)).toBe(15_000);
  });
  it('tối đa 65.000đ', () => {
    expect(logisticsFee(100)).toBe(65_000);
  });
});

describe('computeFromPrice', () => {
  it('trừ lần lượt từng khoản, bỏ khoản bằng 0', () => {
    const r = computeFromPrice(200_000, base);
    // % phí: 12,5 + 5 + 10 + 1,5 = 29% → 58.000đ; cố định 3.000đ
    expect(r.deductions.map((d) => d.id)).toEqual(['category', 'payment', 'ads', 'tax', 'fixed']);
    expect(r.totalDeductions).toBeCloseTo(61_000);
    expect(r.netReceived).toBeCloseTo(139_000);
    expect(r.profit).toBeCloseTo(39_000);
    expect(r.marginPct).toBeCloseTo(19.5);
    expect(r.markupPct).toBeCloseTo(39);
    expect(r.breakEvenPrice).toBeCloseTo(103_000 / 0.71);
  });
  it('tính phí logistics khi nặng từ 10kg, chỉ khi bật', () => {
    const heavy = { ...base, weightKg: 11 };
    expect(computeFromPrice(200_000, heavy).deductions.find((d) => d.id === 'logistics')?.amount).toBe(9_000);
    expect(
      computeFromPrice(200_000, { ...heavy, applyLogistics: false }).deductions.some((d) => d.id === 'logistics'),
    ).toBe(false);
  });
});

describe('priceForMargin', () => {
  it('giá tìm được cho đúng % lãi mong muốn', () => {
    const p = priceForMargin(10, base)!;
    expect(p).toBeCloseTo(103_000 / 0.61);
    expect(computeFromPrice(p, base).marginPct).toBeCloseTo(10);
  });
  it('làm tròn lên vẫn đạt mục tiêu', () => {
    const p = roundUpPrice(priceForMargin(10, base)!);
    expect(p % 1_000).toBe(0);
    expect(computeFromPrice(p, base).marginPct!).toBeGreaterThanOrEqual(10);
  });
  it('tổng % phí + lãi ≥ 100% → không có giá', () => {
    expect(priceForMargin(71, base)).toBeNull();
  });
});

describe('normalizeConfig', () => {
  it('dữ liệu hỏng → mặc định, phí mặc định đều bằng 0 (không tự điền)', () => {
    const c = normalizeConfig('rác');
    expect(c).toEqual(defaultConfig());
    expect(c.profiles['tiktok:standard'].fees.every((f) => f.value === 0)).toBe(true);
  });
  it('giữ phí đã nhập, bỏ số âm', () => {
    const c = normalizeConfig({
      taxPct: -1,
      profiles: { 'shopee:mall': { fees: [{ id: 'a', label: 'A', kind: 'pct', value: 4 }], categories: [] } },
    });
    expect(c.profiles['shopee:mall'].fees).toEqual([{ id: 'a', label: 'A', kind: 'pct', value: 4 }]);
    expect(c.taxPct).toBe(1.5);
  });
});

// ---- Nhập phí ngành từ file ----
import { deflateRawSync } from 'node:zlib';
import {
  buildCategories,
  categoryId,
  detectMapping,
  effectiveDateOf,
  mergeCategories,
  normalizeText,
  parseCsv,
  parseFee,
  prepareTable,
  searchCategories,
} from '../src/pages/finance/pricing/import/categoryImport';
import { pdfPagesToRows, type PdfTextItem } from '../src/pages/finance/pricing/import/pdfTable';
import { readXlsx } from '../src/pages/finance/pricing/import/xlsx';

describe('parseCsv', () => {
  it('nhận dấu ; và ô có ngoặc kép', () => {
    expect(parseCsv('﻿a;"b;c";d\n1;"x ""y""";3')).toEqual([
      ['a', 'b;c', 'd'],
      ['1', 'x "y"', '3'],
    ]);
  });
});

describe('parseFee', () => {
  it('đọc nhiều kiểu số', () => {
    expect(parseFee('12,5%')).toEqual({ value: 12.5, percent: true });
    expect(parseFee(' 8.25 % ')).toEqual({ value: 8.25, percent: true });
    expect(parseFee('0.125')).toEqual({ value: 0.125, percent: false });
    expect(parseFee('Liên hệ')).toBeNull();
    expect(parseFee('')).toBeNull();
  });
});

describe('normalizeText', () => {
  it('sửa chữ lỗi trong PDF của sàn: dấu mã cũ, chữ Kirin giống Latin', () => {
    expect(normalizeText('Đồ uống')).toBe('Đồ uống');
    expect(normalizeText('Pin ѕạc dự phòng')).toBe('Pin sạc dự phòng');
  });
});

describe('prepareTable + detectMapping (bố cục bảng phí TikTok)', () => {
  // Tiêu đề nhiều dòng, dòng "Phí suất mặc định", 2 cột phí Mall / Shop tiêu chuẩn
  const raw = [
    ['', '', '', '', 'Từ 20-10-2026', 'Từ 3-07-2026'],
    ['', '', '', 'Phí suất mặc định', '16.00%', '14.00%'],
    ['', '', '', '', 'Nhà bán hàng Mall', 'Nhà bán hàng tiêu chuẩn'],
    ['Nhóm ngành hàng', 'Ngành hàng cấp độ 1', 'Ngành hàng cấp độ 2', 'Ngành hàng cấp độ 3', '', ''],
    ['Thiết bị điện tử', 'Máy tính', 'Ngoại vi', 'Tấm làm mát', '12.50%', '7.50%'],
    ['Thiết bị điện tử', 'Máy tính', 'Ngoại vi', 'Bàn phím & Chuột', '13.70%', '9.50%'],
  ];

  it('ghép tiêu đề, tách phí mặc định theo cột, đọc ngày áp dụng', () => {
    const t = prepareTable(raw);
    expect(t.defaults).toEqual({ 4: 16, 5: 14 });
    expect(t.rows[0][4]).toBe('Từ 20-10-2026 Nhà bán hàng Mall');
    expect(t.rows).toHaveLength(3);
    expect(effectiveDateOf(t.rows[0][4])).toBe('2026-10-20');
    expect(effectiveDateOf(t.rows[0][5])).toBe('2026-07-03');
  });

  it('nhận cột Mall / Shop tiêu chuẩn theo tiêu đề', () => {
    const t = prepareTable(raw);
    const m = detectMapping(t.rows)!;
    expect(m).toEqual({ nameCols: [0, 1, 2, 3], feeCols: { mall: 4, standard: 5 } });
    expect(buildCategories(t.rows, m.nameCols, m.feeCols.standard!).categories.map((c) => c.pct)).toEqual([7.5, 9.5]);
    expect(buildCategories(t.rows, m.nameCols, m.feeCols.mall!).categories[0]).toMatchObject({
      name: 'Thiết bị điện tử › Máy tính › Ngoại vi › Tấm làm mát',
      pct: 12.5,
    });
  });
});

describe('prepareTable + buildCategories (bảng có STT, tên bảng, ô gộp)', () => {
  const rows = [
    ['BẢNG PHÍ NGÀNH HÀNG 2026'],
    [],
    ['STT', 'Ngành cấp 1', 'Ngành cấp 2', 'Ngành cấp 3', 'Phí cố định (%)'],
    ['1', 'Thiết bị điện tử', 'Máy tính', 'Bàn phím', '12,5%'],
    ['2', '', '', 'Chuột', '12,5%'],
    ['3', '', 'Điện thoại', '', '8%'],
    ['4', 'Thời trang nữ', 'Áo', 'Áo thun', 'Liên hệ'],
  ];

  it('bỏ tên bảng, bỏ cột STT, 1 cột phí → Shop tiêu chuẩn', () => {
    const t = prepareTable(rows);
    expect(t.rows[0]).toEqual(['STT', 'Ngành cấp 1', 'Ngành cấp 2', 'Ngành cấp 3', 'Phí cố định (%)']);
    expect(detectMapping(t.rows)).toEqual({ nameCols: [1, 2, 3], feeCols: { standard: 4 } });
  });

  it('điền xuống ô gộp, bỏ dòng không có % hợp lệ', () => {
    const r = buildCategories(prepareTable(rows).rows, [1, 2, 3], 4);
    expect(r.categories.map((c) => [c.name, c.pct])).toEqual([
      ['Thiết bị điện tử › Máy tính › Bàn phím', 12.5],
      ['Thiết bị điện tử › Máy tính › Chuột', 12.5],
      ['Thiết bị điện tử › Điện thoại', 8],
    ]);
    expect(r.skipped).toBe(1);
  });

  it('cột % lưu dạng phân số (Excel) → nhân 100', () => {
    const r = buildCategories(
      [
        ['Ngành', 'Phí'],
        ['A', '0.125'],
        ['B', '0.08'],
      ],
      [0],
      1,
    );
    expect(r.categories.map((c) => c.pct)).toEqual([12.5, 8]);
  });
});

describe('pdfPagesToRows', () => {
  const t = (str: string, x: number, y: number, width: number): PdfTextItem => ({ str, x, y, width });

  it('chữ căn giữa (TikTok): tiêu đề nhiều dòng, nối mảnh chữ bị tách, nhiều trang', () => {
    const page1 = [
      t('Từ 20-10-2026', 1063, 1745, 72),
      t('Phí suất mặc định', 937, 1729, 89),
      t('16.00%', 1081, 1729, 36),
      t('Nhóm ngành hàng', 160, 1706, 93),
      t('Ngành hàng cấp độ 1', 323, 1706, 106),
      t('Nhà bán hàng Mall', 1051, 1714, 95),
      t('Đồ ăn', 186, 1684, 40),
      t('Đồ uố', 351, 1684, 30),
      t('ng', 381.5, 1684, 12),
      t('12.50%', 1084, 1684, 30),
    ];
    const page2 = [t('Đồ ăn', 186, 1746, 40), t('Trà', 369, 1746, 15), t('9.00%', 1086, 1746, 25)];
    const rows = pdfPagesToRows([page1, page2]);
    expect(rows.slice(-2)).toEqual([
      ['Đồ ăn', 'Đồ uống', '12.50%'],
      ['Đồ ăn', 'Trà', '9.00%'],
    ]);
    const table = prepareTable(rows);
    expect(table.defaults).toEqual({ 2: 16 });
    expect(table.rows[0][2]).toContain('Mall');
  });

  it('chữ căn trái, STT căn phải, ô trống (Shopee); bỏ tên bảng ở trên', () => {
    const page = [
      t('BIỂU PHÍ CỐ ĐỊNH ÁP DỤNG CHO SHOP THƯỜNG', 200, 600, 400),
      t('STT', 52.6, 531.5, 18),
      t('Ngành hàng cấp 1', 78, 531.5, 82),
      t('Ngành hàng cấp 3', 443, 531.5, 82),
      t('Phí Cố Định áp', 660, 547.6, 67),
      t('dụng từ 01/05/2026', 650, 536.7, 86),
      t('1', 68.3, 499, 5),
      t('Thiết Bị Âm Thanh', 78, 499, 78),
      t('Thu sóng AV', 443, 499, 54),
      t('10.00%', 679, 499, 32),
      t('2', 68.3, 483.7, 5),
      t('Thiết Bị Âm Thanh', 78, 483.7, 78),
      t('8.00%', 681.6, 483.7, 27),
    ];
    const rows = pdfPagesToRows([page]);
    expect(rows.some((r) => r.join(' ').includes('BIỂU PHÍ'))).toBe(false);
    expect(rows.slice(-2)).toEqual([
      ['1', 'Thiết Bị Âm Thanh', 'Thu sóng AV', '10.00%'],
      ['2', 'Thiết Bị Âm Thanh', '', '8.00%'],
    ]);
    const table = prepareTable(rows);
    expect(effectiveDateOf(table.rows[0][3])).toBe('2026-05-01');
    expect(detectMapping(table.rows)).toEqual({ nameCols: [1, 2], feeCols: { standard: 3 } });
  });
});

describe('ngành hàng', () => {
  const list = [
    { id: categoryId('Thiết bị điện tử › Tai nghe'), name: 'Thiết bị điện tử › Tai nghe', pct: 10 },
    { id: categoryId('Thời trang nữ › Áo thun'), name: 'Thời trang nữ › Áo thun', pct: 7 },
    { id: 'c3', name: 'Thể thao › Đồ dùng bếp cắm trại', pct: 14 },
    { id: 'c4', name: 'Tạp hoá › Đồ uống › Trà', pct: 12.5 },
  ];
  it('tìm không dấu, nhiều từ khoá', () => {
    expect(searchCategories(list, 'tai nghe').map((c) => c.pct)).toEqual([10]);
    expect(searchCategories(list, 'thoi trang ao').map((c) => c.pct)).toEqual([7]);
    expect(searchCategories(list, 'dien thoai')).toEqual([]);
  });
  it('khớp nguyên chữ ở tên ngành cuối xếp trước ("tra" → Trà trước "cắm trại")', () => {
    // "Thời trang" cũng chứa "tra" nhưng không khớp ở tên ngành cuối → xếp sau
    expect(searchCategories(list, 'tra').map((c) => c.id)).toEqual(['c4', 'c3', list[1].id]);
  });
  it('ID ổn định theo tên (không phân biệt dấu/hoa thường)', () => {
    expect(categoryId('Áo Thun')).toBe(categoryId('ao thun'));
  });
  it('gộp: trùng tên lấy % mới, giữ ngành cũ', () => {
    const merged = mergeCategories(list.slice(0, 2), [{ id: 'x', name: 'thời trang nữ › áo thun', pct: 9 }]);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ id: list[1].id, pct: 9 });
  });
});

/** Dựng file zip tối giản (nén deflate) để thử đọc .xlsx */
function makeZip(files: Record<string, string>): ArrayBuffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cenBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...chunks, cenBuf, eocd]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

describe('readXlsx', () => {
  it('đọc chuỗi dùng chung, chuỗi trong ô, số, nhiều trang', async () => {
    const zip = makeZip({
      'xl/workbook.xml':
        '<workbook><sheets><sheet name="TikTok &amp; Mall" sheetId="1" r:id="rId1"/><sheet name="Khác" sheetId="2" r:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>Ngành</t></si><si><r><t>Phí </t></r><r><t xml:space="preserve">(%)</t></r></si><si><t>Tai nghe</t></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="3"><c r="A3" t="s"><v>2</v></c><c r="C3"><v>0.1</v></c></row></sheetData></worksheet>',
      'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>Ô &lt;b&gt;</t></is></c></row></sheetData></worksheet>',
    });
    const sheets = await readXlsx(zip);
    expect(sheets.map((s) => s.name)).toEqual(['TikTok & Mall', 'Khác']);
    expect(sheets[0].rows).toEqual([['Ngành', '', 'Phí (%)'], [], ['Tai nghe', '', '0.1']]);
    expect(sheets[1].rows).toEqual([['', 'Ô <b>']]);
    const table = prepareTable(sheets[0].rows);
    const m = detectMapping(table.rows)!;
    expect(buildCategories(table.rows, m.nameCols, m.feeCols.standard!).categories).toEqual([
      { id: categoryId('Tai nghe'), name: 'Tai nghe', pct: 10 },
    ]);
  });

  it('file không phải xlsx → báo lỗi', async () => {
    await expect(readXlsx(new ArrayBuffer(40))).rejects.toThrow();
  });
});

// ---- Shopee: phí ưu đãi người bán mới, file Mall 1 cột ----
import { attachPromo, shopFromFileName } from '../src/pages/finance/pricing/import/categoryImport';
import { effectiveCategories, hasPromo } from '../src/pages/finance/pricing/config';

describe('Shopee: phí ưu đãi người bán mới & file Mall', () => {
  const thuong = [
    ['STT', 'Ngành hàng cấp 1', 'Ngành hàng cấp 2', 'Mức phí tiêu chuẩn', 'Mức phí ưu đãi'],
    ['', '', '', '', 'cho Người bán mới (*)'],
    ['1', 'Máy tính & Laptop', 'Laptop', '2.00%', '1.00%'],
    ['2', 'Thiết Bị Âm Thanh', 'Micro thu âm', '12.00%', '9.00%'],
    // tiêu đề lặp lại ở trang sau
    ['STT', 'Ngành hàng cấp 1', 'Ngành hàng cấp 2', 'Mức phí tiêu chuẩn', 'Mức phí ưu đãi'],
    ['', '', '', '', 'cho Người bán mới (*)'],
    ['3', 'Đồng Hồ', 'Đồng hồ nam', '15.50%', '12.50%'],
  ];

  it('cột "ưu đãi người bán mới" là promo, không nhầm thành Mall', () => {
    const t = prepareTable(thuong);
    expect(detectMapping(t.rows)).toEqual({ nameCols: [1, 2], feeCols: { standard: 3, promo: 4 } });
  });

  it('bỏ tiêu đề lặp lại ở đầu mỗi trang (không tính là dòng bỏ qua)', () => {
    const t = prepareTable(thuong);
    const r = buildCategories(t.rows, [1, 2], 3);
    expect(r.categories).toHaveLength(3);
    expect(r.skipped).toBe(0);
  });

  it('gắn mức ưu đãi theo ngành, bật "Người bán mới" thì dùng mức ưu đãi', () => {
    const t = prepareTable(thuong);
    const cats = attachPromo(buildCategories(t.rows, [1, 2], 3).categories, buildCategories(t.rows, [1, 2], 4).categories);
    expect(cats[1]).toMatchObject({ name: 'Thiết Bị Âm Thanh › Micro thu âm', pct: 12, promoPct: 9 });
    expect(hasPromo(cats)).toBe(true);
    expect(effectiveCategories(cats, true).map((c) => c.pct)).toEqual([1, 9, 12.5]);
    expect(effectiveCategories(cats, false).map((c) => c.pct)).toEqual([2, 12, 15.5]);
  });

  it('file 1 cột không ghi loại shop → theo tên file / loại shop đang chọn', () => {
    const mall = prepareTable([
      ['STT', 'Ngành hàng cấp 1', 'Phí cố định áp dụng từ 04/10/2026 (đã bao gồm thuế GTGT 8%)'],
      ['1', 'Laptop', '3.80%'],
    ]);
    expect(shopFromFileName('shopee mall.pdf')).toBe('mall');
    expect(shopFromFileName('shopee thường.pdf')).toBe('standard');
    expect(shopFromFileName('bang-phi.pdf')).toBeNull();
    expect(detectMapping(mall.rows, 'mall')!.feeCols).toEqual({ mall: 2 });
    expect(detectMapping(mall.rows)!.feeCols).toEqual({ standard: 2 });
    expect(effectiveDateOf(mall.rows[0][2])).toBe('2026-10-04');
  });
});
