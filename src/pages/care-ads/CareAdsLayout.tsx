import { Package, Radio } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import AdsRangeControl from '../ads/components/AdsRangeControl';

/**
 * Care Ads 24/7 (Sếp chốt 23/11, mục cấp 1 trên sidebar): GMV Max sản phẩm (= trang BOT AI / AI Agent) | GMV Max Livestream (đang phát triển).
 * Chọn mục con ở sidebar — KHÔNG có hàng tab trong trang (Sếp bỏ 26/11 cho đỡ nhiều tầng).
 * Nằm trong AdsLayout → dùng chung số liệu, thiết lập, dữ liệu Agent với Quản lí chiến dịch.
 */
export default function CareAdsLayout() {
  const onProduct = useLocation().pathname.startsWith('/care-ads/product');

  return (
    <>
      {onProduct ? (
        <PageHeader
          icon={Package}
          title="GMV Max sản phẩm"
          description="BOT AI theo dõi chiến dịch GMV Max sản phẩm, đề xuất việc cần làm — Sếp duyệt rồi mới chạy."
          actions={<AdsRangeControl />}
        />
      ) : (
        <PageHeader icon={Radio} title="GMV Max Livestream" description="BOT AI cho chiến dịch GMV Max Livestream." />
      )}
      <Outlet />
    </>
  );
}
