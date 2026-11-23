// Bảng phí ngành do hệ thống cung cấp (admin cập nhật bằng `npm run fees:update`, xem scripts/update-category-fees.ts).
// Khách không tự tải bảng phí. Dữ liệu ở src/data/category-fees.json (dạng gọn), nạp động khi mở trang.
import type { Platform, ShopType } from './calc';
import type { ProfileKey, SavedCategory } from './config';
import { categoryId } from './import/categoryImport';

/** 1 dòng trong file JSON: [tên ngành (các cấp nối " › "), % phí, % ưu đãi người bán mới?] */
export type RawCategoryRow = [string, number] | [string, number, number];

export interface RawCategoryTable {
  /** Tên file gốc của sàn */
  source: string;
  /** Lúc admin cập nhật (ISO) */
  updatedAt: string;
  /** Ngày bảng phí bắt đầu áp dụng (yyyy-mm-dd) */
  effectiveFrom: string | null;
  /** Phí suất mặc định cho ngành không có trong bảng */
  defaultPct: number | null;
  rows: RawCategoryRow[];
}

export interface RawCategoryFees {
  version: 1;
  tables: Partial<Record<ProfileKey, RawCategoryTable>>;
}

export interface CategoryTable {
  source: string;
  updatedAt: string;
  effectiveFrom: string | null;
  defaultPct: number | null;
  categories: SavedCategory[];
}

export type CategoryTables = Partial<Record<ProfileKey, CategoryTable>>;

export function decodeTable(t: RawCategoryTable): CategoryTable {
  return {
    source: t.source,
    updatedAt: t.updatedAt,
    effectiveFrom: t.effectiveFrom,
    defaultPct: t.defaultPct,
    categories: t.rows.map(([name, pct, promo]) => ({
      id: categoryId(name),
      name,
      pct,
      ...(promo != null ? { promoPct: promo } : {}),
    })),
  };
}

export function encodeTable(categories: SavedCategory[], meta: Omit<RawCategoryTable, 'rows'>): RawCategoryTable {
  return {
    ...meta,
    rows: categories.map((c): RawCategoryRow => (c.promoPct != null ? [c.name, c.pct, c.promoPct] : [c.name, c.pct])),
  };
}

export function decodeTables(raw: unknown): CategoryTables {
  const out: CategoryTables = {};
  const tables = (raw as Partial<RawCategoryFees> | null)?.tables;
  if (!tables || typeof tables !== 'object') return out;
  for (const [k, t] of Object.entries(tables)) {
    if (t && Array.isArray(t.rows)) out[k as ProfileKey] = decodeTable(t);
  }
  return out;
}

/** Bảng của 1 sàn × loại shop (chưa có → bảng rỗng) */
export function tableOf(tables: CategoryTables, platform: Platform, shop: ShopType): CategoryTable {
  return (
    tables[`${platform}:${shop}`] ?? {
      source: '',
      updatedAt: '',
      effectiveFrom: null,
      defaultPct: null,
      categories: [],
    }
  );
}
