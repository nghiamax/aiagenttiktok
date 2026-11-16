import { Megaphone, ShoppingBag, Users, Wallet, type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const APP_NAME = 'Shop Agent';
export const APP_TAGLINE = 'Vận hành TikTok Shop';

/** Nguồn duy nhất cho danh sách tab trên sidebar. Thêm tab mới tại đây. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'ADS 24/7', path: '/ads', icon: Megaphone },
  { label: 'Đơn hàng', path: '/orders', icon: ShoppingBag },
  { label: 'Booking KOC', path: '/koc-booking', icon: Users },
  { label: 'Tài chính', path: '/finance', icon: Wallet },
];
