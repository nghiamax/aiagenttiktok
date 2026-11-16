import { Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import PlaceholderCard from '../../components/ui/PlaceholderCard';

export default function KocBookingPage() {
  return (
    <>
      <PageHeader
        icon={Users}
        title="Booking KOC"
        description="Quản lý booking KOC, theo dõi tiến độ hợp tác và hiệu quả triển khai nội dung."
      />
      <PlaceholderCard description="Các chức năng booking và theo dõi KOC sẽ được bổ sung ở giai đoạn tiếp theo." />
    </>
  );
}
