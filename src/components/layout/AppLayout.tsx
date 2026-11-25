import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Eye, Loader2, LogIn, WifiOff } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import GuestGate from '../../auth/GuestGate';
import { TikTokProvider } from '../../tiktok/TikTokProvider';
import { ShopProvider, useShop } from '../../shop/ShopProvider';
import Sidebar from './Sidebar';
import Header from './Header';
import TikTokBanner from './TikTokBanner';
import TikTokConnectModal from './TikTokConnectModal';

/**
 * Shop (danh sách + shop đang mở) bọc ngoài cùng: kết nối TikTok, số liệu, Agent đều theo shop đang mở.
 * `key` theo người dùng → đăng nhập / đăng xuất là mọi dữ liệu tải lại sạch (không lẫn số của phiên trước).
 * Chưa đăng nhập = chế độ khách: vẫn hiện app, các provider không gọi API, `GuestGate` chặn bấm → hộp đăng nhập.
 */
export default function AppLayout() {
  const { status, user } = useAuth();
  // Đang đọc phiên lúc mở trang → chờ (tránh dựng bản khách rồi dựng lại ngay)
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        <Loader2 className="size-6 animate-spin" aria-label="Đang tải" />
      </div>
    );
  }
  return (
    <ShopProvider key={user?.id ?? 'guest'}>
      <AppShell />
    </ShopProvider>
  );
}

function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const location = useLocation();
  // Người dùng (khách) không xem ADS → không có nút / dải Kết nối TikTok
  // Chưa có shop → chưa có gì để kết nối (trang ADS hiện thẻ Tạo shop)
  const shop = useShop();
  const { can, guest } = useAuth();
  const canView = can('view');
  const tiktok = canView && !!shop.current;

  // Đóng drawer trên mobile khi chuyển trang
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <TikTokProvider key={shop.current?.id ?? 'none'} enabled={tiktok}>
      <div className="flex min-h-screen">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <GuestGate className="sticky top-0 z-30">
            <Header
              onOpenMobileMenu={() => setMobileOpen(true)}
              onOpenTikTok={canView ? () => setConnectOpen(true) : undefined}
            />
          </GuestGate>
          <main className="flex-1 p-4 md:p-8">
            <div className="mx-auto w-full max-w-7xl">
              {guest && <GuestBanner />}
              {tiktok && <TikTokBanner onOpenConnect={() => setConnectOpen(true)} />}
              <GuestGate>
                <Outlet />
              </GuestGate>
            </div>
          </main>
        </div>
      </div>
      {connectOpen && <TikTokConnectModal onClose={() => setConnectOpen(false)} />}
    </TikTokProvider>
  );
}

/** Dải đầu trang khi chưa đăng nhập (server tắt → báo không kết nối được) */
function GuestBanner() {
  const { status, promptLogin } = useAuth();
  const offline = status === 'offline';
  return (
    <div
      className={`mb-6 flex flex-col gap-2 rounded-2xl px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${
        offline ? 'bg-amber-50 text-amber-700' : 'bg-primary-soft text-primary'
      }`}
    >
      <p className="flex items-center gap-2">
        {offline ? <WifiOff className="size-4 shrink-0" /> : <Eye className="size-4 shrink-0" />}
        {offline
          ? 'Chưa kết nối được server — đang thử lại…'
          : 'Bạn đang xem thử — đăng nhập để xem số liệu shop và dùng các chức năng.'}
      </p>
      <span className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => promptLogin()}
          className="flex w-fit items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-hover"
        >
          <LogIn className="size-3.5" />
          Đăng nhập
        </button>
      </span>
    </div>
  );
}
