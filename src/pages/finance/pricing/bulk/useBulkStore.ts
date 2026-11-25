import { useCallback, useEffect, useState, useRef } from 'react';
import { diffCosts, pushCosts } from '../../costSync';
import { useAuth } from '../../../../auth/authContext';
import type { Platform } from '../calc';
import type { BulkItem } from './bulkImport';

/** Mỗi sàn 1 danh sách riêng — sang tab TikTok chỉ thấy file TikTok, sang Shopee chỉ thấy file Shopee */
const keyOf = (p: Platform) => `finance-pricing-bulk-v2-${p}`;
/** Bản cũ dùng chung 1 danh sách cho 2 sàn */
const OLD_KEY = 'finance-pricing-bulk-v1';

/** Danh sách tính hàng loạt của 1 sàn */
export interface BulkState {
  items: BulkItem[];
  /** Tên các file đã nạp */
  files: string[];
  /** Giá vốn Sếp nhập, theo khoá SKU — giữ lại khi tải file mới */
  costs: Record<string, number>;
  /** Giá bán sửa tay, theo khoá SKU */
  prices: Record<string, number>;
  /** Ngành trong file (không dấu) → ID ngành trong bảng phí — áp dụng cho mọi dòng cùng ngành */
  categoryMap: Record<string, string>;
  /** Ngành chọn riêng cho 1 dòng (ưu tiên cao nhất) */
  rowCategory: Record<string, string>;
  /** ID sản phẩm → ID ngành (áp cho mọi phân loại của sản phẩm — file Shopee không có cột ngành) */
  productCategory: Record<string, string>;
  /** Ngành chung cho mọi SKU chưa khớp được ngành */
  fallbackCategoryId: string | null;
}

export const EMPTY_BULK: BulkState = {
  items: [],
  files: [],
  costs: {},
  prices: {},
  categoryMap: {},
  rowCategory: {},
  productCategory: {},
  fallbackCategoryId: null,
};

const record = <T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> =>
  v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, T] => ok(e[1])))
    : {};
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

function normalize(raw: unknown): BulkState {
  if (!raw || typeof raw !== 'object') return EMPTY_BULK;
  const r = raw as Partial<BulkState>;
  return {
    items: Array.isArray(r.items) ? r.items.filter((i) => i && typeof i.key === 'string') : [],
    files: Array.isArray(r.files) ? r.files.filter(isStr) : [],
    costs: record(r.costs, isNum),
    prices: record(r.prices, isNum),
    categoryMap: record(r.categoryMap, isStr),
    rowCategory: record(r.rowCategory, isStr),
    productCategory: record(r.productCategory, isStr),
    fallbackCategoryId: isStr(r.fallbackCategoryId) ? r.fallbackCategoryId : null,
  };
}

const read = (key: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
};

/** Bản cũ thuộc sàn nào: theo sàn đã ghi, không có thì theo tên file */
function oldPlatform(raw: { platform?: unknown; files?: unknown }): Platform {
  if (raw.platform === 'tiktok' || raw.platform === 'shopee') return raw.platform;
  const names = Array.isArray(raw.files) ? raw.files.join(' ').toLowerCase() : '';
  return /mass_update|shopee/.test(names) ? 'shopee' : 'tiktok';
}

function loadAll(): Record<Platform, BulkState> {
  const all = { tiktok: normalize(read(keyOf('tiktok'))), shopee: normalize(read(keyOf('shopee'))) };
  const old = read(OLD_KEY);
  if (old && typeof old === 'object') {
    const p = oldPlatform(old as { platform?: unknown; files?: unknown });
    if (all[p].items.length === 0) all[p] = normalize(old);
    try {
      localStorage.removeItem(OLD_KEY);
    } catch {
      /* bỏ qua */
    }
  }
  return all;
}

/** Giá vốn đã nhập ở Tính hàng loạt của 1 sàn (theo ID SKU) — trang Tính lợi nhuận dùng chung */
export function readBulkCosts(p: Platform): Record<string, number> {
  return normalize(read(keyOf(p))).costs;
}

/** Ghi 1 giá vốn vào danh sách của sàn (value ≤ 0 = xoá) */
export function writeBulkCost(p: Platform, key: string, value: number) {
  const s = normalize(read(keyOf(p)));
  const costs = { ...s.costs };
  if (value > 0) costs[key] = value;
  else delete costs[key];
  try {
    localStorage.setItem(keyOf(p), JSON.stringify({ ...s, costs }));
  } catch {
    /* bỏ qua */
  }
}

/** Thay toàn bộ giá vốn của sàn (bản tải từ server — costSync.pullCosts) */
export function replaceBulkCosts(p: Platform, costs: Record<string, number>) {
  const s = normalize(read(keyOf(p)));
  try {
    localStorage.setItem(keyOf(p), JSON.stringify({ ...s, costs }));
  } catch {
    /* bỏ qua */
  }
}

/** Danh sách tính hàng loạt theo từng sàn, lưu trên trình duyệt này (giá vốn đồng bộ lên server theo tài khoản) */
export function useBulkStore(platform: Platform) {
  // Chế độ khách: danh sách trống, không đọc / ghi trình duyệt, không đẩy giá vốn lên server
  const { guest } = useAuth();
  const [all, setAll] = useState<Record<Platform, BulkState>>(() =>
    guest ? { tiktok: normalize(null), shopee: normalize(null) } : loadAll(),
  );
  const prevCosts = useRef({ tiktok: all.tiktok.costs, shopee: all.shopee.costs });
  useEffect(() => {
    if (guest) return;
    try {
      for (const p of ['tiktok', 'shopee'] as const) localStorage.setItem(keyOf(p), JSON.stringify(all[p]));
    } catch {
      /* đầy bộ nhớ / bị chặn → bỏ qua */
    }
    // Giá vốn sửa trên bảng → đẩy lên server (nhớ theo tài khoản)
    for (const p of ['tiktok', 'shopee'] as const) {
      if (all[p].costs !== prevCosts.current[p]) pushCosts(p, diffCosts(prevCosts.current[p], all[p].costs));
    }
    prevCosts.current = { tiktok: all.tiktok.costs, shopee: all.shopee.costs };
  }, [all, guest]);

  /** Sửa danh sách của 1 sàn bất kỳ (tải file TikTok khi đang ở tab Shopee → vào danh sách TikTok) */
  const setFor = useCallback(
    (p: Platform, fn: (s: BulkState) => BulkState) => setAll((a) => ({ ...a, [p]: fn(a[p]) })),
    [],
  );
  const setState = useCallback((fn: (s: BulkState) => BulkState) => setFor(platform, fn), [platform, setFor]);
  return { state: all[platform], setState, setFor, all };
}
