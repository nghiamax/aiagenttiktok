import { useEffect, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { pullCosts } from './costSync';
import { Outlet, useLocation } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import QuotaBadge from './QuotaBadge';
import { FinanceQuotaProvider } from './useFinanceQuota';

const TITLE: Record<string, string> = { pricing: 'Tính giá bán', profit: 'Tính lợi nhuận' };

const DESCRIPTION: Record<string, string> = {
  pricing:
    'Tính giá bán có lãi: nhập giá vốn, phí sàn và chi phí quảng cáo, công cụ trừ lần lượt từng khoản và cho ra lãi trên mỗi sản phẩm.',
  profit:
    'Tính lợi nhuận thật của shop TikTok Shop / Shopee: tải file đơn hàng, quyết toán và quảng cáo, trang tự đối chiếu và trừ giá vốn.',
};

/** Khung Tài chính: tiêu đề + nội dung mục con (chọn Tính giá bán / Tính lợi nhuận ở sidebar) */
export default function FinancePage() {
  const { pathname } = useLocation();
  const section = pathname.includes('/finance/profit') ? 'profit' : 'pricing';
  const { user, guest } = useAuth();
  const userId = user?.id;
  // Tải giá vốn đã nhớ của tài khoản trước khi mở trang con (tối đa 4 giây; lỗi → dùng bản trên máy); khách: không tải
  const [costsReady, setCostsReady] = useState(guest);
  useEffect(() => {
    if (!userId) return;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setCostsReady(true);
      }
    };
    const t = setTimeout(finish, 4000);
    pullCosts(userId)
      .catch(() => undefined)
      .finally(finish);
    return () => clearTimeout(t);
  }, [userId]);
  return (
    <FinanceQuotaProvider>
      <PageHeader
        icon={Wallet}
        title={TITLE[section]}
        description={DESCRIPTION[section]}
        actions={<QuotaBadge kind={section} />}
      />
      {costsReady ? (
        <Outlet />
      ) : (
        <div className="flex justify-center p-10 text-muted">
          <Loader2 className="size-6 animate-spin" aria-label="Đang tải" />
        </div>
      )}
    </FinanceQuotaProvider>
  );
}
