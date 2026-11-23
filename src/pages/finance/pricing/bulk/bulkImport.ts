// Tính giá hàng loạt — đọc file danh sách sản phẩm: file "Chỉnh sửa hàng loạt" của TikTok Seller Center,
// file "Cập nhật hàng loạt — thông tin bán hàng" của Shopee, hoặc file tự làm.
// Logic thuần, có test ở tests/pricing-bulk.test.ts

import type { Platform } from '../calc';
import type { SavedCategory } from '../config';
import { fold, PATH_SEP } from '../import/categoryImport';

/** Một dòng (SKU) đọc từ file */
export interface BulkItem {
  /** Khoá duy nhất: ID SKU, không có thì ID sản phẩm + biến thể / số dòng */
  key: string;
  productId: string | null;
  skuId: string | null;
  name: string;
  variant: string | null;
  sellerSku: string | null;
  /** Tồn kho (Shopee: Seller Stock) */
  stock: number | null;
  /** Ngành như trong file, vd "Dầu dưỡng thể & dầu massage (873736)" */
  category: string | null;
  price: number | null;
  /** Trọng lượng kiện hàng (gram) */
  weightG: number | null;
  /** Giá vốn nếu file có cột này */
  cost: number | null;
}

export type BulkField =
  | 'productId'
  | 'skuId'
  | 'name'
  | 'variant'
  | 'sellerSku'
  | 'parentSku'
  | 'stock'
  | 'category'
  | 'price'
  | 'weight'
  | 'cost';

/**
 * Nhận diện tiêu đề cột (đã bỏ dấu, chữ thường). TikTok / Shopee đều có 1 dòng mã tiếng Anh
 * (TikTok `product_name`…, Shopee `et_title_product_name`…) và 1 dòng tiếng Việt.
 * Shopee: "Mã Phân loại" = ID SKU, "SKU" = SKU phân loại, "SKU Sản phẩm" = SKU cha, "Seller Stock" = tồn kho.
 */
const FIELD_PATTERNS: Record<BulkField, RegExp> = {
  productId: /^(product_id|product id|et_title_product_id|id san pham|ma san pham)$/,
  skuId: /^(sku_id|sku id|et_title_variation_id|id sku|ma sku|ma phan loai)$/,
  name: /^(product_name|product name|et_title_product_name|ten san pham)$/,
  variant: /^(variation_value|et_title_variation_name|tuy chon bien the|ten phan loai|phan loai|bien the)$/,
  sellerSku: /^(seller_sku|et_title_variation_sku|sku|sku nguoi ban|sku phan loai|ma sku nguoi ban)$/,
  parentSku: /^(et_title_parent_sku|parent sku|sku san pham|sku cha)$/,
  stock: /^(et_title_variation_stock|seller stock|stock|ton kho|kho hang)$/,
  category: /^(category|hang muc|nganh hang|nganh|danh muc)$/,
  price: /^(price|et_title_variation_price|gia ban le( \(.*\))?|gia ban( \(.*\))?|gia( \(.*\))?)$/,
  weight: /^(parcel_weight|trong luong kien hang.*|trong luong.*|can nang.*)$/,
  cost: /^(cost|gia von.*|gia nhap.*)$/,
};

/** File tải từ sàn nào (theo dòng mã tiêu đề) — để tự chọn đúng biểu phí */
export function detectFilePlatform(rows: string[][]): Platform | null {
  const head = rows
    .slice(0, 6)
    .map((r) => (r ?? []).join(' '))
    .join(' ')
    .toLowerCase();
  if (/et_title_|shopee/.test(head)) return 'shopee';
  if (/product_property|all_information|parcel_weight|tiktok/.test(head)) return 'tiktok';
  return null;
}

export type BulkMapping = Partial<Record<BulkField, number>> & {
  weightUnit: 'g' | 'kg';
};

export interface BulkTable {
  headerRow: number;
  mapping: BulkMapping;
}

function mapRow(row: string[]): BulkMapping {
  const mapping: BulkMapping = { weightUnit: 'g' };
  row.forEach((cell, i) => {
    const f = fold(cell ?? '').replace(/\s+/g, ' ');
    if (!f) return;
    for (const field of Object.keys(FIELD_PATTERNS) as BulkField[]) {
      if (mapping[field] != null) continue;
      if (FIELD_PATTERNS[field].test(f)) {
        mapping[field] = i;
        if (field === 'weight' && /\bkg\b/.test(f)) mapping.weightUnit = 'kg';
        break;
      }
    }
  });
  return mapping;
}

const fieldCount = (m: BulkMapping) => (Object.keys(m) as string[]).filter((k) => k !== 'weightUnit').length;

/** Tìm dòng tiêu đề trong 20 dòng đầu: dòng khớp nhiều cột nhất, phải có tên sản phẩm và (giá bán hoặc giá vốn) */
export function detectBulkTable(rows: string[][]): BulkTable | null {
  let best: BulkTable | null = null;
  rows.slice(0, 20).forEach((row, i) => {
    const mapping = mapRow(row ?? []);
    if (mapping.name == null || (mapping.price == null && mapping.cost == null)) return;
    if (!best || fieldCount(mapping) > fieldCount(best.mapping)) best = { headerRow: i, mapping };
  });
  return best;
}

/** Số tiền / số kiểu Việt Nam: "90000", "90.000", "90.000đ", "1,5", "1.234,5" */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw)
    .trim()
    .replace(/\s|đ|vnd|₫/gi, '');
  if (!s || !/\d/.test(s) || /[^\d.,-]/.test(s)) return null;
  if (s.includes(',') && s.includes('.')) {
    // dấu xuất hiện sau cùng là dấu thập phân
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const cell = (row: string[], i: number | undefined) => (i == null ? '' : (row[i] ?? '').trim());
/** Ô trống / "-" (Shopee ghi "-" khi không có SKU) → null */
const text = (row: string[], i: number | undefined) => {
  const v = cell(row, i);
  return v && !/^[-–—]+$/.test(v) ? v : null;
};

/** Đọc các dòng sản phẩm (bỏ dòng hướng dẫn / "Bắt buộc" — dòng không có giá bán lẫn giá vốn là số) */
export function readBulkItems(rows: string[][], table: BulkTable, source = ''): BulkItem[] {
  const m = table.mapping;
  const items: BulkItem[] = [];
  const seen = new Set<string>();
  for (let r = table.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const name = cell(row, m.name);
    const price = parseAmount(cell(row, m.price));
    const cost = parseAmount(cell(row, m.cost));
    if (!name || (price == null && cost == null)) continue;
    const productId = text(row, m.productId);
    const skuId = text(row, m.skuId);
    const variant = text(row, m.variant);
    let key = skuId ?? (productId ? `${productId}|${variant ?? ''}` : `${source}#${r + 1}`);
    if (seen.has(key)) key = `${key}#${r + 1}`;
    seen.add(key);
    const weight = parseAmount(cell(row, m.weight));
    const stock = parseAmount(cell(row, m.stock));
    items.push({
      key,
      productId,
      skuId,
      name,
      variant: variant && !/^(default|mac dinh)$/.test(fold(variant)) ? variant : null,
      sellerSku: text(row, m.sellerSku) ?? text(row, m.parentSku),
      stock: stock != null && stock >= 0 ? stock : null,
      category: text(row, m.category),
      price: price != null && price > 0 ? price : null,
      weightG: weight != null && weight > 0 ? (m.weightUnit === 'kg' ? weight * 1000 : weight) : null,
      cost: cost != null && cost > 0 ? cost : null,
    });
  }
  return items;
}

/** Gộp nhiều file (TikTok tách file theo nhóm ngành): SKU trùng lấy dòng của file sau */
export function mergeItems(current: BulkItem[], incoming: BulkItem[]): BulkItem[] {
  const map = new Map(current.map((i) => [i.key, i]));
  for (const i of incoming) map.set(i.key, i);
  return [...map.values()];
}

/** "Dầu dưỡng thể & dầu massage (873736)" → "Dầu dưỡng thể & dầu massage" */
export const categoryLeafOf = (raw: string) => raw.replace(/\s*\(\s*\d+\s*\)\s*$/, '').trim();

/**
 * Ngành trong file → ngành trong bảng phí: so tên ngành cuối (không dấu), rồi so cả đường dẫn.
 * Trùng nhiều ngành cùng tên cuối → lấy ngành đầu, `ambiguous` = true.
 */
export function buildCategoryMatcher(categories: SavedCategory[]) {
  const byLeaf = new Map<string, SavedCategory[]>();
  const byFull = new Map<string, SavedCategory>();
  for (const c of categories) {
    const leaf = fold(c.name.split(PATH_SEP).pop() ?? c.name);
    byLeaf.set(leaf, [...(byLeaf.get(leaf) ?? []), c]);
    byFull.set(fold(c.name), c);
  }
  return (raw: string | null): { category: SavedCategory; ambiguous: boolean } | null => {
    if (!raw) return null;
    const leaf = fold(categoryLeafOf(raw));
    const full = byFull.get(leaf) ?? byFull.get(leaf.split(/\s*[›>/]\s*/).join(PATH_SEP));
    if (full) return { category: full, ambiguous: false };
    const last = leaf.split(/\s*[›>/]\s*/).pop() ?? leaf;
    const hits = byLeaf.get(last);
    return hits?.length ? { category: hits[0], ambiguous: hits.length > 1 } : null;
  };
}
