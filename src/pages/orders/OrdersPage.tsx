import { ShoppingBag } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import PlaceholderCard from '../../components/ui/PlaceholderCard';

export default function OrdersPage() {
  return (
    <>
      <PageHeader
        icon={ShoppingBag}
        title="Đơn hàng"
        description="Quản lý và theo dõi tình hình đơn hàng trên TikTok Shop."
      />
      <PlaceholderCard description="Danh sách và xử lý đơn hàng sẽ được bổ sung khi kết nối API TikTok Shop." />
    </>
  );
}
