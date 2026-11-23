import { KeyRound, Megaphone, ShoppingBag, UserCog, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { Permission } from '../../shared/permissions';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Quyền cần có để thấy mục này (Người dùng chỉ có `finance`) */
  permission: Permission;
  /** Không dùng làm trang mở đầu sau khi đăng nhập */
  notHome?: boolean;
  /** Mục con (hiện dưới mục cha khi đang ở trong mục đó) */
  children?: { label: string; path: string; /** Chỉ gói Pro — gói Miễn phí thấy nhãn Pro */ pro?: boolean }[];
}

export const APP_NAME = 'Shop Agent';
export const APP_TAGLINE = 'Vận hành TikTok Shop';

/** Nguồn duy nhất cho danh sách tab trên sidebar. Thêm tab mới tại đây. */
export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Quản lý tài khoản',
    path: '/accounts',
    icon: KeyRound,
    permission: 'finance',
    notHome: true,
    children: [
      { label: 'TikTok', path: '/accounts/tiktok' },
      { label: 'Shopee', path: '/accounts/shopee' },
    ],
  },
  { label: 'ADS 24/7', path: '/ads', icon: Megaphone, permission: 'view' },
  { label: 'Đơn hàng', path: '/orders', icon: ShoppingBag, permission: 'view' },
  { label: 'Booking KOC', path: '/koc-booking', icon: Users, permission: 'view' },
  {
    label: 'Tài chính',
    path: '/finance',
    icon: Wallet,
    permission: 'finance',
    children: [
      { label: 'Tính giá bán', path: '/finance/pricing' },
      { label: 'Tính lợi nhuận', path: '/finance/profit' },
    ],
  },
  { label: 'Tài khoản', path: '/admin/users', icon: UserCog, permission: 'manage_users' },
];

/** Trang mở đầu tiên sau khi đăng nhập: mục đầu tiên tài khoản được thấy */
export function homePath(can: (p: Permission) => boolean): string {
  return NAV_ITEMS.find((n) => !n.notHome && can(n.permission))?.path ?? '/finance';
}
