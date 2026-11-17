import { useState } from 'react';
import { formatNumber, formatVnd } from '../../../lib/format';
import type { Campaign, CampaignFilter } from '../types';
import CampaignFilterBar from './CampaignFilterBar';
import EmptyTableState from './EmptyTableState';
import { LINK_BTN, TD, TD_NUM, TH } from './tableStyles';

interface CampaignTableProps {
  campaigns: Campaign[];
  /** Bấm vào chiến dịch → xem sản phẩm của chiến dịch đó */
  onOpenCampaign: (campaignId: string) => void;
  onOpenBreakEven: () => void;
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

function filterCampaigns(list: Campaign[], filter: CampaignFilter): Campaign[] {
  switch (filter) {
    case 'running':
      return list.filter((c) => c.status === 'running');
    case 'paused':
      return list.filter((c) => c.status === 'paused');
    case 'suggested':
      return list.filter((c) => c.hasSuggestion);
    default:
      return list;
  }
}

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const running = status === 'running';
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        running ? 'bg-green-50 text-accent-green' : 'bg-canvas text-muted'
      }`}
    >
      <span className={`size-1.5 rounded-full ${running ? 'bg-accent-green' : 'bg-muted'}`} />
      {running ? 'Đang chạy' : 'Đã tắt'}
    </span>
  );
}

export default function CampaignTable({ campaigns, onOpenCampaign, onOpenBreakEven }: CampaignTableProps) {
  const [filter, setFilter] = useState<CampaignFilter>('all');
  const rows = filterCampaigns(campaigns, filter);

  return (
    <>
      <CampaignFilterBar value={filter} onChange={setFilter} onOpenBreakEven={onOpenBreakEven} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-line">
              {COLUMNS.map((c) => (
                <th key={c.label} className={`${TH} ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-canvas">
                <td className={`${TD} max-w-[300px]`}>
                  <button
                    type="button"
                    onClick={() => onOpenCampaign(c.id)}
                    className={`${LINK_BTN} block w-full truncate`}
                    title={`${c.name}\nBấm để xem sản phẩm`}
                  >
                    {c.name}
                  </button>
                </td>
                <td className={TD}>
                  <StatusBadge status={c.status} />
                </td>
                <td className={`${TD} text-muted`}>{formatNumber(c.selectedVideos)}</td>
                <td className={TD_NUM}>{formatVnd(c.budget)}</td>
                <td className={TD_NUM}>{formatVnd(c.cost)}</td>
                <td className={`${TD_NUM} font-semibold text-accent-green`}>{formatVnd(c.revenue)}</td>
                <td className={TD_NUM}>{formatNumber(c.orders)}</td>
                <td className={`${TD_NUM} font-semibold`}>{formatNumber(c.roi, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <EmptyTableState
          title="Chưa có dữ liệu chiến dịch"
          description="Danh sách chiến dịch sẽ hiển thị tại đây sau khi kết nối TikTok Ads."
        />
      )}
    </>
  );
}
