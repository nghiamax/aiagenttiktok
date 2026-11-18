import { useState } from 'react';
import { formatNumber, formatVnd } from '../../../lib/format';
import { classifyCampaign, contextForCampaign } from '../classify';
import { nextSort, sortByValue } from '../metrics';
import { findGroup, useAdsSettings } from '../settings';
import type { Campaign, CampaignFilter, SortState } from '../types';
import ActionBadge from './ActionBadge';
import CampaignFilterBar from './CampaignFilterBar';
import EmptyTableState from './EmptyTableState';
import SortableHeader from './SortableHeader';
import { LINK_BTN, TD, TD_NUM, TH } from './tableStyles';

interface CampaignTableProps {
  campaigns: Campaign[];
  /** Bấm vào chiến dịch → xem sản phẩm của chiến dịch đó */
  onOpenCampaign: (campaignId: string) => void;
  onOpenBreakEven: () => void;
  /** ID nhóm chiến dịch đang lọc (từ hộp "Agent đang theo dõi"); null = tất cả */
  groupId: string | null;
  onClearGroup: () => void;
}

type CampaignSortKey = 'budget' | 'budgetUse' | 'cost' | 'revenue' | 'orders' | 'roi' | 'targetRoi';

const matchesStatus = (c: Campaign, filter: CampaignFilter) => filter === 'all' || c.status === filter;

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

export default function CampaignTable({
  campaigns,
  onOpenCampaign,
  onOpenBreakEven,
  groupId,
  onClearGroup,
}: CampaignTableProps) {
  const [filter, setFilter] = useState<CampaignFilter>('all');
  const [sort, setSort] = useState<SortState<CampaignSortKey>>({ key: 'cost', dir: 'desc' });
  const { settings } = useAdsSettings();
  const activeGroup = groupId ? findGroup(settings, groupId, 'campaign') : undefined;

  const rows = campaigns
    .filter((c) => matchesStatus(c, filter))
    .map((c) => ({ c, cls: classifyCampaign(c, settings), budgetUse: contextForCampaign(c).budgetUse }))
    .filter((r) => !activeGroup || r.cls?.action === activeGroup.id);
  const sorted = sortByValue(rows, (r) => (sort.key === 'budgetUse' ? r.budgetUse : r.c[sort.key]), sort.dir);

  const counts: Record<CampaignFilter, number> = {
    all: campaigns.length,
    running: campaigns.filter((c) => c.status === 'running').length,
    paused: campaigns.filter((c) => c.status === 'paused').length,
  };
  const header = { sort, onSort: (key: CampaignSortKey) => setSort(nextSort(sort, key)) };

  return (
    <>
      <CampaignFilterBar
        value={filter}
        onChange={setFilter}
        counts={counts}
        onOpenBreakEven={onOpenBreakEven}
        groupName={activeGroup?.name}
        onClearGroup={onClearGroup}
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={`${TH} text-left`}>Chiến dịch</th>
              <th className={`${TH} text-left`}>Trạng thái</th>
              <th className={`${TH} text-left`}>Nhóm</th>
              <th className={`${TH} text-right`}>Video</th>
              <SortableHeader label="Ngân sách/ngày" sortKey="budget" {...header} />
              <SortableHeader label="Tiêu NS" sortKey="budgetUse" {...header} />
              <SortableHeader label="Chi phí" sortKey="cost" {...header} />
              <SortableHeader label="Doanh thu" sortKey="revenue" {...header} />
              <SortableHeader label="Đơn hàng" sortKey="orders" {...header} />
              <SortableHeader label="ROI" sortKey="roi" {...header} />
              <SortableHeader label="ROI mục tiêu" sortKey="targetRoi" {...header} />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map(({ c, cls, budgetUse }) => {
              const noSpend = !c.cost && !c.orders && !c.revenue;
              const belowTarget = c.roi != null && c.targetRoi != null && c.roi < c.targetRoi;
              return (
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
                    <p className="truncate text-xs text-muted">ID {c.id}</p>
                  </td>
                  <td className={TD}>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className={TD}>
                    {noSpend ? (
                      <span className="whitespace-nowrap text-xs text-muted">Chưa chi tiêu</span>
                    ) : (
                      <ActionBadge action={cls?.action ?? null} reason={cls?.reason} level="campaign" />
                    )}
                  </td>
                  <td className={`${TD_NUM} text-muted`}>{formatNumber(c.selectedVideos)}</td>
                  <td className={TD_NUM}>{formatVnd(c.budget)}</td>
                  <td
                    className={TD_NUM}
                    title="Chi trung bình mỗi ngày ÷ ngân sách ngày trong khoảng ngày của số liệu"
                  >
                    {budgetUse == null || noSpend ? '--' : `${formatNumber(budgetUse)}%`}
                  </td>
                  <td className={TD_NUM}>{formatVnd(c.cost)}</td>
                  <td className={`${TD_NUM} font-semibold text-accent-green`}>{formatVnd(c.revenue)}</td>
                  <td className={TD_NUM}>{formatNumber(c.orders)}</td>
                  <td
                    className={`${TD_NUM} font-semibold ${belowTarget ? 'text-danger' : ''}`}
                    title={belowTarget ? 'ROI đang dưới ROI mục tiêu' : undefined}
                  >
                    {formatNumber(c.roi, 2)}
                  </td>
                  <td className={`${TD_NUM} text-muted`}>{formatNumber(c.targetRoi, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <EmptyTableState
          title="Không có chiến dịch phù hợp"
          description="Thử bỏ bộ lọc trạng thái hoặc nhóm. Chiến dịch hiển thị tại đây sau khi cập nhật số liệu từ TikTok Ads."
        />
      )}
    </>
  );
}
