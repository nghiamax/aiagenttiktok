import { Bot, Eye, LayoutDashboard, Megaphone, ShoppingBag, Users, Wallet, type LucideIcon } from 'lucide-react';

export interface NavChild {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Mốc trong trang (id phần tử) — bấm thì cuộn tới, xem NAV_ANCHOR_EVENT */
  anchor?: string;
}

/** Sự kiện báo trang đang mở cuộn tới mốc (detail = id); trang khác thì đi bằng #id trên URL */
export const NAV_ANCHOR_EVENT = 'nav-anchor';
/** Mốc ô Đang theo dõi (trang Tổng quan ADS) */
export const WATCH_ANCHOR = 'theo-doi';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Mục con hiện dưới mục cha (ẩn khi sidebar thu gọn) */
  children?: NavChild[];
}

export const APP_NAME = 'Shop Agent';
export const APP_TAGLINE = 'Vận hành TikTok Shop';

/** Nguồn duy nhất cho danh sách tab trên sidebar. Thêm tab mới tại đây. */
export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Quản lí chiến dịch',
    path: '/ads',
    icon: Megaphone,
    children: [
      { label: 'Tổng quan', path: '/ads', icon: LayoutDashboard },
      { label: 'Care Ads 24/7', path: '/ads/agent', icon: Bot },
      { label: 'Theo dõi video', path: '/ads', icon: Eye, anchor: WATCH_ANCHOR },
    ],
  },
  { label: 'Đơn hàng', path: '/orders', icon: ShoppingBag },
  { label: 'Booking KOC', path: '/koc-booking', icon: Users },
  { label: 'Tài chính', path: '/finance', icon: Wallet },
];
