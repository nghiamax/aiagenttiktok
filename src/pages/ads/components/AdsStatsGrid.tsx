import { CircleDollarSign, Percent, ShoppingCart, TrendingUp } from 'lucide-react';
import Card from '../../../components/ui/Card';
import StatCard from '../../../components/ui/StatCard';
import { formatNumber, formatVnd } from '../../../lib/format';
import type { AdsSummary } from '../types';

interface AdsStatsGridProps {
  summary: AdsSummary;
}

export default function AdsStatsGrid({ summary: s }: AdsStatsGridProps) {
  const secondary = [
    { label: 'Video có chi tiêu (7 ngày)', value: formatNumber(s.videosWithSpend7d) },
    { label: 'Video đang tăng cường', value: formatNumber(s.boostedVideos) },
    { label: 'Đề xuất chờ duyệt', value: formatNumber(s.pendingSuggestions) },
    {
      label: 'Quy tắc đang bật',
      value:
        s.activeRules == null ? '--' : `${formatNumber(s.activeRules)}/${formatNumber(s.totalRules ?? 0)}`,
    },
  ];

  return (
    <div className="space-y-4">
      {/* KPI chính */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng chi phí" value={formatVnd(s.totalCost)} icon={CircleDollarSign} tone="blue" />
        <StatCard label="Tổng doanh thu" value={formatVnd(s.totalRevenue)} icon={TrendingUp} tone="green" />
        <StatCard label="Tổng đơn hàng" value={formatNumber(s.totalOrders)} icon={ShoppingCart} tone="violet" />
        <StatCard label="ROI" value={formatNumber(s.roi, 2)} icon={Percent} tone="amber" />
      </div>

      {/* Chỉ số phụ: gom vào một dải */}
      <Card className="grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
        {secondary.map((item) => (
          <div key={item.label} className="px-5 py-4">
            <p className="text-xs font-medium text-muted">{item.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{item.value}</p>
          </div>
        ))}
      </Card>
    </div>
  );
}
