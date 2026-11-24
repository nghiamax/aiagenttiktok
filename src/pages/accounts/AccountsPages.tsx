import { KeyRound, Megaphone } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import Card from '../../components/ui/Card';
import PageHeader from '../../components/ui/PageHeader';
import { useAuth } from '../../auth/AuthProvider';
import SellerCard from './SellerCard';
import TikTokAdsCard from './TikTokAdsCard';

/** Khung Quản lý shop: TikTok | Shopee (chọn ở sidebar) */
export default function AccountsLayout() {
  const shopee = useLocation().pathname.includes('/accounts/shopee');
  return (
    <>
      <PageHeader
        icon={KeyRound}
        title={shopee ? 'Shopee' : 'TikTok'}
        description="Kết nối tài khoản để hệ thống tự lấy số liệu. Đăng nhập Seller Center mở cửa sổ trình duyệt thật — bạn tự đăng nhập, hệ thống chỉ nhớ phiên để lấy file."
      />
      <Outlet />
    </>
  );
}

const NOTE =
  'Đăng nhập Seller Center chạy trên máy tính đang chạy hệ thống: cửa sổ trình duyệt mở ra trên máy đó. Phiên đăng nhập lưu riêng cho tài khoản của bạn.';

export function TikTokAccountsPage() {
  // Tài khoản không xem ADS → không có thẻ TikTok Ads
  const ads = useAuth().can('view');
  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        {ads && <TikTokAdsCard />}
        <SellerCard
          platform="tiktok"
          title="TikTok Shop"
          usedFor="Tính lợi nhuận (lấy file đơn hàng, quyết toán), Đơn hàng, Booking KOC"
          tone="bg-ink"
        />
      </div>
      <p className="text-sm text-muted">{NOTE}</p>
    </div>
  );
}

export function ShopeeAccountsPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <SellerCard
          platform="shopee"
          title="Shopee Shop"
          usedFor="Lấy file đơn hàng, quảng cáo Shopee"
          tone="bg-shopee"
        />
        <Card className="flex items-start gap-3 p-5 opacity-70">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-shopee-soft text-shopee">
            <Megaphone className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">Quảng cáo Shopee</h3>
            <p className="text-sm text-muted">Sắp có. Hiện lấy file báo cáo quảng cáo qua cửa sổ Shopee Shop.</p>
          </div>
        </Card>
      </div>
      <p className="text-sm text-muted">
        {NOTE} Tính lợi nhuận cho Shopee đang được xây — hiện trang chỉ đọc file TikTok.
      </p>
    </div>
  );
}
