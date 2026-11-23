import { Bell, ChevronDown, Menu, Settings, Store } from 'lucide-react';
import { useTikTok } from '../../tiktok/TikTokProvider';
import UserMenu from './UserMenu';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  /** Mở hộp Kết nối TikTok (không có = tài khoản không dùng ADS → ẩn nút shop) */
  onOpenTikTok?: () => void;
}

const iconButton =
  'relative flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-canvas hover:text-ink';

export default function Header({ onOpenMobileMenu, onOpenTikTok }: HeaderProps) {
  const { status } = useTikTok();
  const dot =
    !status || status.state === 'never'
      ? { className: 'bg-muted/40', label: 'Chưa kết nối TikTok' }
      : status.state === 'connected'
        ? { className: 'bg-accent-green', label: 'Đang kết nối TikTok' }
        : { className: 'bg-danger', label: 'Mất kết nối TikTok — bấm để kết nối lại' };
  const shopName =
    status?.state === 'never' ? 'Chưa kết nối TikTok' : (status?.advertiser?.name ?? 'Tài khoản TikTok Shop');
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur md:px-8">
      <button type="button" onClick={onOpenMobileMenu} className={`${iconButton} lg:hidden`} aria-label="Mở menu">
        <Menu className="size-5" />
      </button>

      {/* Shop đang dùng + trạng thái kết nối TikTok → bấm mở hộp Kết nối TikTok */}
      {onOpenTikTok && (
        <button
          type="button"
          onClick={onOpenTikTok}
          title={dot.label}
          className="flex min-w-0 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold transition-colors hover:bg-canvas"
        >
          <Store className="size-4 shrink-0 text-primary" />
          <span className="truncate">{shopName}</span>
          <span className={`size-2 shrink-0 rounded-full ${dot.className}`} aria-label={dot.label} />
          <ChevronDown className="size-4 shrink-0 text-muted" />
        </button>
      )}

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
