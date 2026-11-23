import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { TikTokProvider } from '../../tiktok/TikTokProvider';
import { ShopProvider, useShop } from '../../shop/ShopProvider';
import Sidebar from './Sidebar';
import Header from './Header';
import TikTokBanner from './TikTokBanner';
import TikTokConnectModal from './TikTokConnectModal';

/** Shop (danh sách + shop đang mở) bọc ngoài cùng: kết nối TikTok, số liệu, Agent đều theo shop đang mở */
export default function AppLayout() {
  return (
    <ShopProvider>
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
  const canView = useAuth().can('view');
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
          <Header
            onOpenMobileMenu={() => setMobileOpen(true)}
            onOpenTikTok={canView ? () => setConnectOpen(true) : undefined}
          />
          <main className="flex-1 p-4 md:p-8">
            <div className="mx-auto w-full max-w-7xl">
              {tiktok && <TikTokBanner onOpenConnect={() => setConnectOpen(true)} />}
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      {connectOpen && <TikTokConnectModal onClose={() => setConnectOpen(false)} />}
    </TikTokProvider>
  );
}
