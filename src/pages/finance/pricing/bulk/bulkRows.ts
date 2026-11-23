// Ghép dữ liệu file + giá vốn / ngành Sếp nhập → từng dòng đã tính (logic thuần)
import type { SavedCategory } from '../config';
import { fold } from '../import/categoryImport';
import { buildCategoryMatcher, type BulkItem } from './bulkImport';
import { computeBulkRow, type BulkBase, type BulkRowResult } from './bulkCalc';
import type { BulkState } from './useBulkStore';

export type CategoryResolution =
  /**
   * row: chọn riêng dòng này · product: chọn cho cả sản phẩm · map: chọn cho cả ngành trong file
   * · file: tự khớp tên ngành · fallback: ngành chung cho SKU chưa khớp
   */
  | {
      kind: 'row' | 'product' | 'map' | 'file' | 'fallback';
      category: SavedCategory;
      ambiguous: boolean;
    }
  /** Không khớp → dùng phí mặc định của bảng phí */
  | { kind: 'default'; pct: number }
  | { kind: 'none' };

export interface BulkRow {
  item: BulkItem;
  cost: number | null;
  price: number | null;
  priceEdited: boolean;
  category: CategoryResolution;
  categoryPct: number;
  result: BulkRowResult;
}

export const categoryMapKey = (raw: string) => fold(raw);

export function resolveBulkRows(
  state: Pick<BulkState, 'items' | 'costs' | 'prices' | 'categoryMap' | 'rowCategory'> &
    Partial<Pick<BulkState, 'productCategory' | 'fallbackCategoryId'>>,
  categories: SavedCategory[],
  defaultCategoryPct: number | null,
  base: BulkBase,
): BulkRow[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const match = buildCategoryMatcher(categories);
  const fallback = state.fallbackCategoryId ? byId.get(state.fallbackCategoryId) : undefined;
  return state.items.map((item) => {
    let category: CategoryResolution;
    // Ưu tiên: chọn riêng dòng > cả sản phẩm > cả ngành trong file > tự khớp > ngành chung > % mặc định
    const rowCat = byId.get(state.rowCategory[item.key] ?? '');
    const productCat = item.productId ? byId.get(state.productCategory?.[item.productId] ?? '') : undefined;
    const mapCat = item.category ? byId.get(state.categoryMap[categoryMapKey(item.category)] ?? '') : undefined;
    const auto = rowCat || productCat || mapCat ? null : match(item.category);
    if (rowCat) category = { kind: 'row', category: rowCat, ambiguous: false };
    else if (productCat) category = { kind: 'product', category: productCat, ambiguous: false };
    else if (mapCat) category = { kind: 'map', category: mapCat, ambiguous: false };
    else if (auto) category = { kind: 'file', ...auto };
    else if (fallback) category = { kind: 'fallback', category: fallback, ambiguous: false };
    else if (defaultCategoryPct != null) category = { kind: 'default', pct: defaultCategoryPct };
    else category = { kind: 'none' };
    const categoryPct = 'category' in category ? category.category.pct : category.kind === 'default' ? category.pct : 0;

    const cost = state.costs[item.key] ?? item.cost;
    const edited = state.prices[item.key];
    const price = edited ?? item.price;
    return {
      item,
      cost,
      price,
      priceEdited: edited != null,
      category,
      categoryPct,
      result: computeBulkRow({ cost, price, categoryPct, weightG: item.weightG }, base),
    };
  });
}

export type BulkFilter = 'all' | 'missing-cost' | 'loss' | 'below-target' | 'category';

/** Dòng chưa khớp được ngành trong bảng phí (đang dùng % mặc định hoặc 0%) */
export const needsCategory = (r: BulkRow) => r.category.kind === 'default' || r.category.kind === 'none';

export function filterRows(rows: BulkRow[], filter: BulkFilter, query: string): BulkRow[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (filter === 'missing-cost' && r.result.status !== 'missing-cost') return false;
    if (filter === 'loss' && r.result.status !== 'loss') return false;
    if (filter === 'below-target' && r.result.status !== 'below-target') return false;
    if (filter === 'category' && !needsCategory(r)) return false;
    if (!words.length) return true;
    const hay = fold(
      [r.item.name, r.item.variant, r.item.skuId, r.item.productId, r.item.sellerSku, r.item.category].join(' '),
    );
    return words.every((w) => hay.includes(w));
  });
}

export function countRows(rows: BulkRow[]): Record<BulkFilter, number> {
  return {
    all: rows.length,
    'missing-cost': rows.filter((r) => r.result.status === 'missing-cost').length,
    loss: rows.filter((r) => r.result.status === 'loss').length,
    'below-target': rows.filter((r) => r.result.status === 'below-target').length,
    category: rows.filter(needsCategory).length,
  };
}

export type CategoryScope = 'row' | 'product' | 'file' | 'fallback';

const without = (rec: Record<string, string>, keys: Iterable<string>) => {
  const out = { ...rec };
  for (const k of keys) delete out[k];
  return out;
};

/**
 * Gán ngành theo phạm vi: chỉ SKU (`row`), mọi phân loại của sản phẩm (`product`),
 * mọi SKU cùng ngành trong file (`file`), hoặc ngành chung cho SKU chưa khớp (`fallback`).
 * Phạm vi rộng xoá các lựa chọn hẹp hơn đang che nó, để lựa chọn mới có tác dụng ngay.
 */
export function applyCategory(
  s: BulkState,
  item: BulkItem | null,
  categoryId: string,
  scope: CategoryScope,
): BulkState {
  if (scope === 'fallback' || !item) return { ...s, fallbackCategoryId: categoryId };
  if (scope === 'row') return { ...s, rowCategory: { ...s.rowCategory, [item.key]: categoryId } };
  if (scope === 'product' && item.productId) {
    const keys = s.items.filter((i) => i.productId === item.productId).map((i) => i.key);
    return {
      ...s,
      rowCategory: without(s.rowCategory, keys),
      productCategory: { ...s.productCategory, [item.productId]: categoryId },
    };
  }
  if (scope === 'file' && item.category) {
    const key = categoryMapKey(item.category);
    const same = s.items.filter((i) => i.category && categoryMapKey(i.category) === key);
    return {
      ...s,
      rowCategory: without(
        s.rowCategory,
        same.map((i) => i.key),
      ),
      productCategory: without(
        s.productCategory,
        same.map((i) => i.productId ?? ''),
      ),
      categoryMap: { ...s.categoryMap, [key]: categoryId },
    };
  }
  return { ...s, rowCategory: { ...s.rowCategory, [item.key]: categoryId } };
}

/** Bỏ ngành chọn tay đang áp cho dòng này (theo đúng mức đang áp) / bỏ ngành chung */
export function clearCategory(s: BulkState, row: BulkRow | null): BulkState {
  if (!row) return { ...s, fallbackCategoryId: null };
  const { item, category } = row;
  if (category.kind === 'row') return { ...s, rowCategory: without(s.rowCategory, [item.key]) };
  if (category.kind === 'product' && item.productId)
    return { ...s, productCategory: without(s.productCategory, [item.productId]) };
  if (category.kind === 'map' && item.category)
    return { ...s, categoryMap: without(s.categoryMap, [categoryMapKey(item.category)]) };
  return s;
}
