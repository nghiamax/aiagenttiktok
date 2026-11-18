import { CircleDollarSign, Gauge, ShoppingCart, TrendingUp } from 'lucide-react';
import StatCard, { type StatChange } from '../../../components/ui/StatCard';
import { formatNumber, formatVnd } from '../../../lib/format';
import type { AdsSummary, PreviousSummary } from '../types';

interface AdsStatsGridProps {
  summary: AdsSummary;
  /** Tổng kỳ liền trước; không có thì không hiện dòng so sánh */
  previous?: PreviousSummary | null;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** 4 KPI chính, mỗi ô so với kỳ liền trước (nếu có số) */
export default function AdsStatsGrid({ summary: s, previous }: AdsStatsGridProps) {
  const label = previous ? `so với ${ddmm(previous.range.from)} – ${ddmm(previous.range.to)}` : '';

  function change(now: number | null, before: number | null | undefined, direction: StatChange['direction']) {
    if (!previous || now == null || before == null || before === 0) return null;
    return { pct: ((now - before) / before) * 100, direction, label };
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Tổng chi phí"
        value={formatVnd(s.totalCost)}
        icon={CircleDollarSign}
        tone="blue"
        // Chi tăng không hẳn tốt hay xấu → màu trung tính
        change={change(s.totalCost, previous?.totalCost, 'neutral')}
        hint={s.videosWithSpend7d == null ? undefined : `${formatNumber(s.videosWithSpend7d)} video có chi tiêu`}
      />
      <StatCard
        label="Tổng doanh thu"
        value={formatVnd(s.totalRevenue)}
        icon={TrendingUp}
        tone="green"
        change={change(s.totalRevenue, previous?.totalRevenue, 'up-good')}
      />
      <StatCard
        label="Tổng đơn hàng"
        value={formatNumber(s.totalOrders)}
        icon={ShoppingCart}
        tone="violet"
        change={change(s.totalOrders, previous?.totalOrders, 'up-good')}
      />
      <StatCard
        label="ROI"
        value={formatNumber(s.roi, 2)}
        icon={Gauge}
        tone="amber"
        change={change(s.roi, previous?.roi, 'up-good')}
        hint="Doanh thu ÷ chi phí"
      />
    </div>
  );
}
