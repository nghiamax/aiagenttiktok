import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { TikTokProvider } from '../../tiktok/TikTokProvider';
import Sidebar from './Sidebar';
import Header from './Header';
import TikTokBanner from './TikTokBanner';
import TikTokConnectModal from './TikTokConnectModal';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const location = useLocation();
  // Người dùng (khách) không xem ADS → không có nút / dải Kết nối TikTok
  const tiktok = useAuth().can('view');

  // Đóng drawer trên mobile khi chuyển trang
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <TikTokProvider enabled={tiktok}>
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
            onOpenTikTok={tiktok ? () => setConnectOpen(true) : undefined}
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
