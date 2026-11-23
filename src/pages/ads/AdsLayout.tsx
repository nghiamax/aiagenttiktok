import { Outlet } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import ConnectTikTokCard from '../../components/ui/ConnectTikTokCard';
import PageHeader from '../../components/ui/PageHeader';
import { useTikTok } from '../../tiktok/TikTokProvider';
import { AgentStoreProvider } from './agent/agentStore';
import { AdsDataProvider } from './data';
import { AdsSettingsProvider } from './settings';
import { TrendProvider } from './trend';
import { WatchlistProvider } from './watchlist';

/**
 * Khung chung của ADS 24/7 (Tổng quan + AI Agent): số liệu theo ngày + thiết lập phân loại + dữ liệu Agent (server).
 * Chưa kết nối TikTok lần nào → chỉ hiện thẻ "Kết nối TikTok để bắt đầu" (không hiện số liệu lưu sẵn, không có Agent).
 */
export default function AdsLayout() {
  const { status, checked } = useTikTok();
  // Chờ đọc trạng thái kết nối (rất nhanh) để không nháy số liệu lưu sẵn trước thẻ chào
  if (!checked) return null;
  if (status?.state === 'never') {
    return (
      <>
        <PageHeader icon={Megaphone} title="Quản lí chiến dịch" description="Theo dõi và tối ưu chiến dịch GMV Max sản phẩm trên TikTok Ads." />
        <ConnectTikTokCard />
      </>
    );
  }
  return (
    <AdsDataProvider>
      <AdsSettingsProvider>
        <AgentStoreProvider>
          <TrendProvider>
            <WatchlistProvider>
              <Outlet />
            </WatchlistProvider>
          </TrendProvider>
        </AgentStoreProvider>
      </AdsSettingsProvider>
    </AdsDataProvider>
  );
}
