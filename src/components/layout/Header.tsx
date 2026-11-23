import { Bell, Menu, Settings } from 'lucide-react';
import ShopMenu from './ShopMenu';
import UserMenu from './UserMenu';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  /** Mở hộp Kết nối TikTok (không có = tài khoản không dùng ADS → ẩn nút shop) */
  onOpenTikTok?: () => void;
}

const iconButton =
  'relative flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-canvas hover:text-ink';

export default function Header({ onOpenMobileMenu, onOpenTikTok }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur md:px-8">
      <button type="button" onClick={onOpenMobileMenu} className={`${iconButton} lg:hidden`} aria-label="Mở menu">
        <Menu className="size-5" />
      </button>

      {/* Shop đang mở (đổi shop / Thêm shop / Kết nối TikTok) — ẩn với tài khoản không dùng mục ADS */}
      {onOpenTikTok && <ShopMenu onOpenTikTok={onOpenTikTok} />}

      <div className="ml-auto flex items-center gap-1 md:gap-2">
        <button type="button" className={iconButton} aria-label="Cài đặt">
          <Settings className="size-5" />
        </button>
        <button type="button" className={iconButton} aria-label="Thông báo">
          <Bell className="size-5" />
          <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-danger ring-2 ring-white" />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
