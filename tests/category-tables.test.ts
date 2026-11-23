import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeTables, encodeTable, tableOf } from '../src/pages/finance/pricing/categoryTables';
import { categoryId } from '../src/pages/finance/pricing/import/categoryImport';
import { normalizeConfig } from '../src/pages/finance/pricing/config';

describe('bảng phí ngành của hệ thống', () => {
  it('mã hoá gọn → giải mã giữ tên, %, ưu đãi; ID = hash tên (như khi tải file)', () => {
    const raw = encodeTable(
      [
        { id: 'x', name: 'Máy tính › Máy tính bàn', pct: 2.5, promoPct: 1.25 },
        { id: 'y', name: 'Thời trang › Áo', pct: 10 },
      ],
      { source: 'shopee thường.pdf', updatedAt: '2026-11-21T00:00:00Z', effectiveFrom: null, defaultPct: null },
    );
    expect(raw.rows).toEqual([
      ['Máy tính › Máy tính bàn', 2.5, 1.25],
      ['Thời trang › Áo', 10],
    ]);
    const t = decodeTables({ version: 1, tables: { 'shopee:standard': raw } });
    const table = tableOf(t, 'shopee', 'standard');
    expect(table.categories[0]).toEqual({ id: categoryId('Máy tính › Máy tính bàn'), name: 'Máy tính › Máy tính bàn', pct: 2.5, promoPct: 1.25 });
    expect(table.categories[1].promoPct).toBeUndefined();
    expect(tableOf(t, 'tiktok', 'mall').categories).toEqual([]);
    expect(decodeTables(null)).toEqual({});
  });

  it('file đi kèm hệ thống có đủ 4 bảng (TikTok 2 loại shop, Shopee thường có ưu đãi, Shopee Mall)', () => {
    const t = decodeTables(JSON.parse(readFileSync('src/data/category-fees.json', 'utf8')));
    const tt = tableOf(t, 'tiktok', 'standard');
    expect(tt.categories.length).toBeGreaterThan(1000);
    expect(tt.defaultPct).not.toBeNull();
    expect(tableOf(t, 'tiktok', 'mall').categories.length).toBeGreaterThan(1000);
    const sp = tableOf(t, 'shopee', 'standard');
    expect(sp.categories.some((c) => c.promoPct != null)).toBe(true);
    expect(tableOf(t, 'shopee', 'mall').categories.length).toBeGreaterThan(1000);
    for (const table of Object.values(t)) {
      expect(table!.categories.every((c) => c.pct >= 0 && c.pct < 100 && c.name.length > 0)).toBe(true);
    }
  });

  it('cấu hình cũ có bảng phí khách tự tải → bỏ (dùng bảng hệ thống), giữ ngành tự lưu và khoản phí', () => {
    const cfg = normalizeConfig({
      profiles: {
        'tiktok:standard': {
          fees: [{ id: 'p', label: 'Phí thanh toán', kind: 'pct', value: 5 }],
          categories: [{ id: 'a', name: 'Áo', pct: 10 }],
          categoriesSource: { fileName: 'phi.pdf', importedAt: '2026-11-20', effectiveFrom: null },
        },
        'shopee:standard': { categories: [{ id: 'b', name: 'Ngành tự lưu', pct: 7 }] },
      },
    });
    expect(cfg.profiles['tiktok:standard'].categories).toEqual([]);
    expect(cfg.profiles['tiktok:standard'].fees[0].value).toBe(5);
    expect(cfg.profiles['shopee:standard'].categories).toEqual([{ id: 'b', name: 'Ngành tự lưu', pct: 7 }]);
  });
});
