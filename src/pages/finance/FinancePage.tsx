import { Wallet } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import PlaceholderCard from '../../components/ui/PlaceholderCard';

export default function FinancePage() {
  return (
    <>
      <PageHeader
        icon={Wallet}
        title="Tài chính"
        description="Theo dõi tình hình tài chính: doanh thu, chi phí và lợi nhuận của hoạt động kinh doanh."
      />
      <PlaceholderCard description="Báo cáo và số liệu tài chính sẽ được bổ sung khi kết nối dữ liệu." />
    </>
  );
}
