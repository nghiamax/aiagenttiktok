// Khoản phí CỐ ĐỊNH của sàn (ngoài phí ngành) — do hệ thống cung cấp, chỉ Quản trị viên sửa.
// Dùng chung web (Tính giá bán) + server (lưu / API). Khoản phí riêng của từng shop (Voucher Xtra, Freeship…) vẫn do khách tự nhập.

export type FeePlatform = 'tiktok' | 'shopee';
export type FeeShopType = 'standard' | 'mall';
export type FeeKey = `${FeePlatform}:${FeeShopType}`;

export interface SystemFeeLine {
  id: string;
  label: string;
  /** pct = % giá bán · fixed = đồng mỗi đơn */
  kind: 'pct' | 'fixed';
  value: number;
  /** Ghi chú ngắn, vd "mỗi đơn giao thành công" */
  note?: string;
  /** Chương trình shop tự đăng ký (vd Hoàn phí vận chuyển) → mỗi người dùng tự bật "Shop có đăng ký" */
  optional?: boolean;
}

export interface SystemFees {
  tables: Record<FeeKey, SystemFeeLine[]>;
  /** ISO — lần Quản trị viên lưu gần nhất (null = mặc định của hệ thống) */
  updatedAt: string | null;
}

export const FEE_KEYS: FeeKey[] = ['tiktok:standard', 'tiktok:mall', 'shopee:standard', 'shopee:mall'];

// TikTok Shop (Sếp cung cấp 24/11/2026): phí giao dịch 6% · phí xử lý đơn hàng 3.000đ / đơn giao thành công
const TIKTOK_FIXED: SystemFeeLine[] = [
  { id: 'sys-transaction', label: 'Phí giao dịch', kind: 'pct', value: 6 },
  { id: 'sys-order', label: 'Phí xử lý đơn hàng', kind: 'fixed', value: 3000, note: 'mỗi đơn giao thành công' },
  // Chương trình Hoàn phí vận chuyển (SFR) — tuỳ shop đăng ký; trong file quyết toán là "Phí dịch vụ SFR"
  {
    id: 'sys-sfr',
    label: 'Chương trình Hoàn phí vận chuyển',
    kind: 'fixed',
    value: 1620,
    note: 'hoàn phí ship đơn trả / giao không thành công',
    optional: true,
  },
];

export function defaultSystemFees(): SystemFees {
  return {
    tables: {
      'tiktok:standard': TIKTOK_FIXED.map((f) => ({ ...f })),
      'tiktok:mall': TIKTOK_FIXED.map((f) => ({ ...f })),
      'shopee:standard': [],
      'shopee:mall': [],
    },
    updatedAt: null,
  };
}

const MAX_LINES = 20;

function line(raw: unknown, i: number): SystemFeeLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SystemFeeLine>;
  const label = typeof r.label === 'string' ? r.label.trim().slice(0, 80) : '';
  const value = typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : NaN;
  const kind = r.kind === 'fixed' ? 'fixed' : 'pct';
  if (!label || !(value >= 0) || (kind === 'pct' && value >= 100) || (kind === 'fixed' && value > 10_000_000))
    return null;
  const id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : `sys-${i}`;
  const note = typeof r.note === 'string' && r.note.trim() ? r.note.trim().slice(0, 80) : undefined;
  return { id, label, kind, value, ...(note ? { note } : {}), ...(r.optional === true ? { optional: true } : {}) };
}

/** Đọc / kiểm tra dữ liệu (file lưu hoặc body PUT); bảng thiếu → mặc định */
export function normalizeSystemFees(raw: unknown): SystemFees {
  const base = defaultSystemFees();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SystemFees>;
  for (const k of FEE_KEYS) {
    const t = r.tables?.[k];
    if (!Array.isArray(t)) continue;
    const seen = new Set<string>();
    base.tables[k] = t
      .slice(0, MAX_LINES)
      .map(line)
      .filter((x): x is SystemFeeLine => !!x && !seen.has(x.id) && !!seen.add(x.id));
  }
  base.updatedAt = typeof r.updatedAt === 'string' ? r.updatedAt : null;
  return base;
}
