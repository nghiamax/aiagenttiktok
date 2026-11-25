import {
  BarChart3,
  BookOpen,
  Bot,
  Calculator,
  Eye,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  Music2,
  Package,
  Radio,
  ShoppingBag,
  TrendingUp,
  UserCog,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '../../shared/permissions';

export interface NavChild {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Mốc trong trang (id phần tử) — bấm thì cuộn tới, xem NAV_ANCHOR_EVENT */
  anchor?: string;
  /** Chỉ gói Pro — gói Miễn phí thấy nhãn Pro */
  pro?: boolean;
}

/** Sự kiện báo trang đang mở cuộn tới mốc (detail = id); trang khác thì đi bằng #id trên URL */
export const NAV_ANCHOR_EVENT = 'nav-anchor';
/** Mốc ô Đang theo dõi (trang Tổng quan ADS) */
export const WATCH_ANCHOR = 'theo-doi';
/** Mốc card Phân tích GMV Max (trang Tổng quan ADS) */
export const GMV_LIST_ANCHOR = 'ads-list';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Quyền cần có để thấy mục này (xem shared/permissions.ts); không ghi = mọi người, kể cả chưa đăng nhập */
  permission?: Permission;
  /** Không dùng làm trang mở đầu sau khi đăng nhập */
  notHome?: boolean;
  /** Mục con hiện dưới mục cha (ẩn khi sidebar thu gọn) */
  children?: NavChild[];
}

export const APP_NAME = 'NECOTOO';
export const APP_TAGLINE = 'Quảng Cáo Tự Động';

/** Nguồn duy nhất cho danh sách tab trên sidebar. Thêm tab mới tại đây. */
export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Quản lí chiến dịch',
    path: '/ads',
    icon: Megaphone,
    permission: 'view',
    children: [
      { label: 'Tổng quan', path: '/ads', icon: LayoutDashboard },
      { label: 'Theo dõi video', path: '/ads', icon: Eye, anchor: WATCH_ANCHOR },
      { label: 'Phân tích GMV Max', path: '/ads', icon: BarChart3, anchor: GMV_LIST_ANCHOR },
    ],
  },
  {
    label: 'Care Ads 24/7',
    path: '/care-ads',
    icon: Bot,
    permission: 'view',
    children: [
      { label: 'GMV Max sản phẩm', path: '/care-ads/product', icon: Package },
      { label: 'GMV Max Livestream', path: '/care-ads/live', icon: Radio },
    ],
  },
  {
    label: 'Tài chính',
    path: '/finance',
    icon: Wallet,
    permission: 'finance',
    children: [
      { label: 'Tính giá bán', path: '/finance/pricing', icon: Calculator },
      { label: 'Tính lợi nhuận', path: '/finance/profit', icon: TrendingUp },
    ],
  },
  {
    label: 'Quản lý shop',
    path: '/accounts',
    icon: KeyRound,
    permission: 'finance',
    notHome: true,
    children: [
      { label: 'TikTok', path: '/accounts/tiktok', icon: Music2 },
      { label: 'Shopee', path: '/accounts/shopee', icon: ShoppingBag },
    ],
  },
  { label: 'Tài khoản', path: '/admin/users', icon: UserCog, permission: 'manage_users' },
  // Ai cũng xem được (cả khi chưa đăng nhập)
  { label: 'Hướng dẫn sử dụng', path: '/guide', icon: BookOpen, notHome: true },
];

/** Trang mở đầu tiên sau khi đăng nhập: mục đầu tiên tài khoản được thấy */
export function homePath(can: (p: Permission) => boolean): string {
  return NAV_ITEMS.find((n) => !n.notHome && (!n.permission || can(n.permission)))?.path ?? '/finance';
}
