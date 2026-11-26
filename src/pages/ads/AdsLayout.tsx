import { Outlet, useLocation } from 'react-router-dom';
import { Bot, Megaphone } from 'lucide-react';
import ConnectTikTokCard from '../../components/ui/ConnectTikTokCard';
import ChooseAccountCard from '../../components/ui/ChooseAccountCard';
import CreateShopCard from '../../components/ui/CreateShopCard';
import GuideVideoCard from '../../components/ui/GuideVideoCard';
import { useShop } from '../../shop/ShopProvider';
import { useAuth } from '../../auth/AuthProvider';
import PageHeader from '../../components/ui/PageHeader';
import { useTikTok } from '../../tiktok/TikTokProvider';
import { AgentStoreProvider } from './agent/agentStore';
import { AdsDataProvider } from './data';
import { AdsSettingsProvider } from './settings';
import { TrendProvider } from './trend';
import VideoGroupsMigrator from './VideoGroupsMigrator';
import { WatchlistProvider } from './watchlist';

/**
 * Khung chung của Quản lí chiến dịch (/ads) + Care Ads 24/7 (/care-ads, BOT AI): số liệu theo ngày + thiết lập phân loại + dữ liệu Agent (server).
 * Chưa đăng nhập / chưa có tài khoản quảng cáo / chưa kết nối / chưa chọn tài khoản → chỉ hiện thẻ hướng dẫn bước đó
 * + Video hướng dẫn sử dụng (không hiện bảng số liệu rỗng, không có Agent).
 */
export default function AdsLayout() {
  const { status, checked } = useTikTok();
  const shop = useShop();
  const care = useLocation().pathname.startsWith('/care-ads');
  const { guest } = useAuth();
  // Chờ đọc shop + trạng thái kết nối (rất nhanh) để không nháy số liệu lưu sẵn trước thẻ chào
  if (!guest && (!shop.loaded || (shop.current && !checked))) return null;
  // Thứ tự: chưa có shop → tạo shop; shop chưa kết nối TikTok → kết nối; đã kết nối mà chưa chọn tài khoản → chọn
  // Chưa đăng nhập = như chưa có tài khoản quảng cáo (bấm nút → hộp đăng nhập)
  const gate = guest || !shop.current
    ? <CreateShopCard />
    : status?.state === 'never'
      ? <ConnectTikTokCard />
      : status && !status.account
        ? <ChooseAccountCard />
        : null;
  if (gate) {
    return (
      <>
        {care ? (
          <PageHeader icon={Bot} title="Care Ads 24/7" description="BOT AI theo dõi chiến dịch GMV Max, đề xuất việc cần làm — Sếp duyệt rồi mới chạy." />
        ) : (
          <PageHeader icon={Megaphone} title="Quản lí chiến dịch" description="Theo dõi và tối ưu chiến dịch GMV Max sản phẩm trên TikTok Ads." />
        )}
        {gate}
        <GuideVideoCard />
      </>
    );
  }
  return (
    <AgentStoreProvider>
      <AdsDataProvider>
        <AdsSettingsProvider>
          <TrendProvider>
            <VideoGroupsMigrator />
            <WatchlistProvider>
              <Outlet />
            </WatchlistProvider>
          </TrendProvider>
        </AdsSettingsProvider>
      </AdsDataProvider>
    </AgentStoreProvider>
  );
}
