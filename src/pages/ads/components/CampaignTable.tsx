import { Inbox } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { formatNumber, formatVnd } from '../../../lib/format';
import type { Campaign, CampaignFilter } from '../types';
import CampaignFilterBar from './CampaignFilterBar';

interface CampaignTableProps {
  campaigns: Campaign[];
  filter: CampaignFilter;
  onFilterChange: (value: CampaignFilter) => void;
}

const COLUMNS: { label: string; align?: 'right' }[] = [
  { label: 'Chiến dịch' },
  { label: 'Trạng thái' },
  { label: 'Video' },
  { label: 'Ngân sách', align: 'right' },
  { label: 'Chi phí', align: 'right' },
  { label: 'Doanh thu', align: 'right' },
  { label: 'Đơn hàng', align: 'right' },
  { label: 'ROI', align: 'right' },
];

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const running = status === 'running';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        running ? 'bg-green-50 text-accent-green' : 'bg-canvas text-muted'
      }`}
    >
      <span className={`size-1.5 rounded-full ${running ? 'bg-accent-green' : 'bg-muted'}`} />
      {running ? 'Đang chạy' : 'Đã tắt'}
    </span>
  );
}

export default function CampaignTable({ campaigns, filter, onFilterChange }: CampaignTableProps) {
  return (
    <Card className="overflow-hidden">
      {/* Đầu card: tiêu đề + bộ lọc */}
      <div className="space-y-4 border-b border-line p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Chiến dịch GMV Max</h2>
          <span className="text-sm text-muted">{campaigns.length} chiến dịch</span>
        </div>
        <CampaignFilterBar value={filter} onChange={onFilterChange} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-line">
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  className={`whitespace-nowrap px-5 py-3 text-xs font-medium text-muted ${
                    c.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {campaigns.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-canvas">
                <td className="max-w-[280px] truncate px-5 py-3.5 font-medium" title={c.name}>
                  {c.name}
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-5 py-3.5 text-muted">{c.selectedVideos ?? '–'}</td>
                <td className="px-5 py-3.5 text-right tabular-nums">{formatVnd(c.budget)}</td>
                <td className="px-5 py-3.5 text-right tabular-nums">{formatVnd(c.cost)}</td>
                <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-accent-green">
                  {formatVnd(c.revenue)}
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums">{formatNumber(c.orders)}</td>
                <td className="px-5 py-3.5 text-right font-semibold tabular-nums">
                  {formatNumber(c.roi, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Inbox className="size-6" strokeWidth={1.75} />
          </div>
          <p className="font-semibold">Chưa có dữ liệu chiến dịch</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Danh sách chiến dịch sẽ hiển thị tại đây sau khi kết nối TikTok Ads.
          </p>
        </div>
      )}
    </Card>
  );
}
