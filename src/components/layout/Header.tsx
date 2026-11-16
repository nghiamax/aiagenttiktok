import { Bell, ChevronDown, Menu, Settings, Store } from 'lucide-react';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

const iconButton =
  'relative flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-canvas hover:text-ink';

export default function Header({ onOpenMobileMenu }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur md:px-8">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className={`${iconButton} lg:hidden`}
        aria-label="Mở menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Tài khoản / shop đang dùng */}
      <button
        type="button"
        className="flex min-w-0 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold transition-colors hover:bg-canvas"
      >
        <Store className="size-4 shrink-0 text-primary" />
        <span className="truncate">Tài khoản TikTok Shop</span>
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>

      <div className="ml-auto flex items-center gap-1 md:gap-2">
        <button type="button" className={iconButton} aria-label="Cài đặt">
          <Settings className="size-5" />
        </button>
        <button type="button" className={iconButton} aria-label="Thông báo">
          <Bell className="size-5" />
          <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-danger ring-2 ring-white" />
        </button>
        <button
          type="button"
          className="ml-1 flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-accent-green to-primary text-sm font-semibold text-white ring-2 ring-white transition-shadow hover:shadow-md"
          aria-label="Tài khoản"
        >
          A
        </button>
      </div>
    </header>
  );
}
