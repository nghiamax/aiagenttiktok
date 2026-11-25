import type { FeeLine, Platform, ShopType } from './calc';
import { ORDER_SOURCES, type OrderSource } from './orderSource';

export interface SavedCategory {
  id: string;
  name: string;
  pct: number;
  /** Mức phí ưu đãi cho người bán mới (Shopee Shop thường), nếu file có */
  promoPct?: number;
}

export interface FeeProfile {
  fees: FeeLine[];
  /**
   * Ngành Sếp tự lưu (nút "Lưu thành ngành") — bảng phí ngành chính do hệ thống cung cấp (categoryTables.ts),
   * khách không tự tải bảng phí.
   */
  categories: SavedCategory[];
}

export type ProfileKey = `${Platform}:${ShopType}`;

export interface PricingConfig {
  profiles: Record<ProfileKey, FeeProfile>;
  /** Thuế sàn khấu trừ của hộ kinh doanh (% giá bán) */
  taxPct: number;
  /** Chương trình tuỳ chọn của sàn shop có đăng ký: "<sàn:loại shop>|<id phí hệ thống>" */
  optIn: string[];
}

export const PLATFORM_LABEL: Record<Platform, string> = { tiktok: 'TikTok Shop', shopee: 'Shopee' };
export const SHOP_TYPE_LABEL: Record<Platform, Record<ShopType, string>> = {
  tiktok: { standard: 'Shop tiêu chuẩn', mall: 'TikTok Mall' },
  shopee: { standard: 'Shop thường', mall: 'Shopee Mall' },
};

export const profileKey = (p: Platform, s: ShopType): ProfileKey => `${p}:${s}`;

/**
 * Khoản phí RIÊNG của shop (khách tự nhập, mặc định 0) — phí cố định của sàn (phí giao dịch, phí xử lý đơn…)
 * do hệ thống cung cấp ở `shared/platformFees.ts`, không nằm ở đây.
 */
function emptyProfile(): FeeProfile {
  return {
    fees: [{ id: 'service', label: 'Phí dịch vụ (Freeship, Voucher…)', kind: 'pct', value: 0 }],
    categories: [],
  };
}

export function defaultConfig(): PricingConfig {
  return {
    profiles: {
      'tiktok:standard': emptyProfile(),
      'tiktok:mall': emptyProfile(),
      'shopee:standard': emptyProfile(),
      'shopee:mall': emptyProfile(),
    },
    taxPct: 1.5,
    optIn: [],
  };
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** Đọc cấu hình đã lưu, bỏ phần hỏng, thiếu thì lấy mặc định */
export function normalizeConfig(raw: unknown): PricingConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<PricingConfig>;
  for (const key of Object.keys(base.profiles) as ProfileKey[]) {
    const p = r.profiles?.[key];
    if (!p) continue;
    if (Array.isArray(p.fees)) {
      base.profiles[key].fees = p.fees
        .filter((f) => f && typeof f.id === 'string' && typeof f.label === 'string')
        // Dòng mẫu cũ chưa nhập (phí giao dịch / phí cố định) → nay hệ thống cung cấp, bỏ để không trùng
        .filter((f) => !((f.id === 'payment' || f.id === 'fixed') && !(Number(f.value) > 0)))
        .map((f) => ({ id: f.id, label: f.label, kind: f.kind === 'fixed' ? 'fixed' : 'pct', value: num(f.value) }));
    }
    // Bản cũ: bảng phí ngành khách tự tải lên (có categoriesSource) → bỏ, nay dùng bảng của hệ thống
    const uploaded = !!(p as { categoriesSource?: unknown }).categoriesSource;
    if (Array.isArray(p.categories) && !uploaded) {
      base.profiles[key].categories = p.categories
        .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string')
        .map((c) => ({
          id: c.id,
          name: c.name,
          pct: num(c.pct),
          ...(typeof c.promoPct === 'number' && c.promoPct >= 0 ? { promoPct: c.promoPct } : {}),
        }));
    }
  }
  base.taxPct = num(r.taxPct, base.taxPct);
  base.optIn = Array.isArray(r.optIn) ? r.optIn.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
  return base;
}

// ---- Trạng thái form (nhớ lần nhập gần nhất) ----

export type PricingMode = 'profit' | 'price';
/** Tính 1 sản phẩm hay tính hàng loạt từ file */
export type PricingView = 'single' | 'bulk';

export interface PricingForm {
  mode: PricingMode;
  view: PricingView;
  platform: Platform;
  shopType: ShopType;
  categoryId: string | null;
  categoryPct: number;
  cost: number;
  price: number;
  marginPct: number;
  adsPct: number;
  weightKg: number;
  /** ID ngành chọn gần đây (mới nhất trước) */
  recentCategoryIds: string[];
  /** Dùng mức phí ưu đãi người bán mới (khi bảng phí có) */
  newSeller: boolean;
  /** Lãi mong muốn theo % giá bán hay số tiền mỗi sản phẩm */
  marginKind: 'pct' | 'amount';
  /** Lãi mong muốn (đ / sản phẩm) khi marginKind = amount */
  marginAmount: number;
  /** Nguồn đơn hàng: quyết định có trừ quảng cáo / hoa hồng KOC */
  orderSource: OrderSource;
  /** Hoa hồng tiêu chuẩn cho KOC (%) */
  affiliatePct: number;
  /** Hoa hồng quảng cáo cửa hàng (%) */
  shopAdsAffiliatePct: number;
}

export const RECENT_LIMIT = 6;

const DEFAULT_FORM: PricingForm = {
  mode: 'price',
  view: 'single',
  platform: 'tiktok',
  shopType: 'standard',
  categoryId: null,
  categoryPct: 0,
  cost: 0,
  price: 0,
  marginPct: 10,
  adsPct: 10,
  weightKg: 0.5,
  recentCategoryIds: [],
  newSeller: false,
  marginKind: 'pct',
  marginAmount: 0,
  orderSource: 'ads',
  affiliatePct: 0,
  shopAdsAffiliatePct: 0,
};

export function normalizeForm(raw: unknown): PricingForm {
  if (!raw || typeof raw !== 'object') return DEFAULT_FORM;
  const r = raw as Partial<PricingForm>;
  return {
    mode: r.mode === 'profit' ? 'profit' : 'price',
    view: r.view === 'bulk' ? 'bulk' : 'single',
    platform: r.platform === 'shopee' ? 'shopee' : 'tiktok',
    shopType: r.shopType === 'mall' ? 'mall' : 'standard',
    categoryId: typeof r.categoryId === 'string' ? r.categoryId : null,
    categoryPct: num(r.categoryPct),
    cost: num(r.cost),
    price: num(r.price),
    marginPct: num(r.marginPct, DEFAULT_FORM.marginPct),
    adsPct: num(r.adsPct, DEFAULT_FORM.adsPct),
    weightKg: num(r.weightKg, DEFAULT_FORM.weightKg),
    recentCategoryIds: Array.isArray(r.recentCategoryIds)
      ? r.recentCategoryIds.filter((x): x is string => typeof x === 'string').slice(0, RECENT_LIMIT)
      : [],
    newSeller: r.newSeller === true,
    marginKind: r.marginKind === 'amount' ? 'amount' : 'pct',
    marginAmount: num(r.marginAmount),
    orderSource: ORDER_SOURCES.some((x) => x.id === r.orderSource) ? (r.orderSource as OrderSource) : 'ads',
    affiliatePct: num(r.affiliatePct),
    shopAdsAffiliatePct: num(r.shopAdsAffiliatePct),
  };
}

/** Danh sách ngành với % đang áp dụng: bật ưu đãi người bán mới → dùng `promoPct` nếu ngành có */
export function effectiveCategories(categories: SavedCategory[], newSeller: boolean): SavedCategory[] {
  if (!newSeller) return categories;
  return categories.map((c) => (c.promoPct != null ? { ...c, pct: c.promoPct } : c));
}

export const hasPromo = (categories: SavedCategory[]) => categories.some((c) => c.promoPct != null);
