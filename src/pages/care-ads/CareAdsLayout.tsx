import { Bot, Package, Radio } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import AdsRangeControl from '../ads/components/AdsRangeControl';
import { useAgentStore } from '../ads/agent/agentStore';
import { pendingProposals } from '../ads/agent/useAgentConfig';

const LINK = '-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors';
const cls = ({ isActive }: { isActive: boolean }) =>
  `${LINK} ${isActive ? 'border-primary font-semibold text-primary' : 'border-transparent font-medium text-muted hover:text-ink'}`;

/**
 * Care Ads 24/7 (Sếp chốt 23/11, mục cấp 1 trên sidebar): tab GMV Max sản phẩm (= trang BOT AI / AI Agent) | GMV Max Livestream (đang phát triển).
 * Nằm trong AdsLayout → dùng chung số liệu, thiết lập, dữ liệu Agent với Quản lí chiến dịch.
 */
export default function CareAdsLayout() {
  const { state } = useAgentStore();
  const pending = pendingProposals(state.proposals).length;
  const onProduct = useLocation().pathname.startsWith('/care-ads/product');

  return (
    <>
      <PageHeader
        icon={Bot}
        title="Care Ads 24/7"
        description="BOT AI theo dõi chiến dịch GMV Max, đề xuất việc cần làm — Sếp duyệt rồi mới chạy."
        actions={onProduct ? <AdsRangeControl /> : undefined}
      />
      <nav className="-mt-2 mb-6 flex gap-1 border-b border-line" aria-label="Care Ads 24/7">
        <NavLink to="/care-ads/product" className={cls}>
          <Package className="size-4" />
          GMV Max sản phẩm
          {pending > 0 && (
            <span className="rounded-full bg-danger px-1.5 py-0.5 text-xs font-semibold leading-none text-white">{pending}</span>
          )}
        </NavLink>
        <NavLink to="/care-ads/live" className={cls}>
          <Radio className="size-4" />
          GMV Max Livestream
        </NavLink>
      </nav>
      <Outlet />
    </>
  );
}
