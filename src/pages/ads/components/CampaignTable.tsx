import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatNumber, formatVnd } from '../../../lib/format';
import { contextForCampaign } from '../classify';
import { TUNE_CODES, tuneActionText } from '../../../../shared/campaignTune';
import { TUNE_FILTERS, TUNE_TONE, useCampaignTune, type CampaignTune } from '../useCampaignTune';
import CampaignTuneModal from './CampaignTuneModal';
import { nextSort, sortByValue } from '../metrics';
import { useAdsData } from '../data';
import { findGroup, useAdsSettings } from '../settings';
import type { Campaign, CampaignFilter, SortState } from '../types';
import SignalDivider from './SignalDivider';
import { useTrend } from '../trend';
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
  const { days } = useAdsData();
  // BOT chỉnh ROI & ngân sách (Sếp chốt 26/11): cột Tình trạng + Việc tiếp theo, bấm Tình trạng → hộp chi tiết
  const tunes = useCampaignTune();
  const tuneFilter = groupId ? TUNE_FILTERS[groupId] : undefined;
  const activeGroup = groupId && !tuneFilter ? findGroup(settings, groupId, 'campaign') : undefined;
  const [params, setParams] = useSearchParams();
  const openId = params.get('tune');
  const setOpen = (id: string | null) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (id) next.set('tune', id);
      else next.delete('tune');
      return next;
    }, { replace: true });
  // Nhóm theo 7 · 14 · 30 ngày tính cả hôm nay (đã xác nhận = 7 và 14 ngày cùng nhóm)
  const trends = useTrend();

  const rows = campaigns
    .filter((c) => matchesStatus(c, filter))
    .map((c) => ({ c, trend: trends.campaign(c), budgetUse: contextForCampaign(c, days).budgetUse }));
  type Row = (typeof rows)[number];
  /** Dấu hiệu của nhóm đang lọc: 7 ngày gần nhất thuộc nhóm, 14 ngày chưa */
  const isPausedRow = (r: Row) => !!activeGroup && r.c.status !== 'running';
  const isSignalRow = (r: Row) => !!activeGroup && !!r.trend?.unconfirmed && r.trend.g7 === activeGroup.id && !isPausedRow(r);
  const shown = tuneFilter
    ? rows.filter((r) => { const t = tunes.get(r.c.id); return !!t && !t.signal && t.kind === tuneFilter.kind && (tuneFilter.kind !== 'grow' || !!t.action); })
    : activeGroup
      ? rows.filter((r) => r.trend?.group === activeGroup.id || (!!r.trend?.unconfirmed && r.trend.g7 === activeGroup.id))
      : rows;
  const sortRows = (list: Row[]) => sortByValue(list, (r) => (sort.key === 'budgetUse' ? r.budgetUse : r.c[sort.key]), sort.dir);
  // Lọc theo nhóm: đã thuộc nhóm lên trước, dấu hiệu xếp sau dải phân cách
  const signalRows = shown.filter(isSignalRow);
  const pausedRows = shown.filter(isPausedRow);
  const actionRows = shown.filter((r) => !isSignalRow(r) && !isPausedRow(r));
  const sorted = [...sortRows(actionRows), ...sortRows(signalRows), ...sortRows(pausedRows)];
  const firstSignal = signalRows.length > 0 ? sorted[actionRows.length] : null;
  const firstPaused = pausedRows.length > 0 ? sorted[actionRows.length + signalRows.length] : null;

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
        groupName={tuneFilter?.label ?? activeGroup?.name}
        onClearGroup={onClearGroup}
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1380px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={`${TH} text-left`}>Chiến dịch</th>
              <th className={`${TH} text-left`}>Trạng thái</th>
              <th className={`${TH} text-left`} title="BOT chỉnh ROI & ngân sách — xét 7 ngày tính cả hôm nay, xác nhận 14 ngày. Bấm để xem chi tiết">Tình trạng</th>
              <th className={`${TH} text-left`}>Việc tiếp theo</th>
              <th className={`${TH} text-right`}>Video</th>
              <SortableHeader label="Ngân sách/ngày" sortKey="budget" {...header} />
              <SortableHeader label="Tiêu NS" sortKey="budgetUse" {...header} />
              <SortableHeader label="Chi phí" sortKey="cost" {...header} />
              <SortableHeader label="Doanh thu" sortKey="revenue" {...header} />
              <SortableHeader label="Đơn hàng" sortKey="orders" {...header} />
              <SortableHeader label="ROI" sortKey="roi" {...header} />
              <SortableHeader label="ROI mục tiêu" sortKey="targetRoi" {...header} />
              <th className={`${TH} text-right`} title="Tổng doanh thu ÷ tổng lời gộp các sản phẩm (theo ROI hoà vốn từng sản phẩm)">Hoà vốn CD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((row) => {
              const { c, budgetUse } = row;
              const tune = tunes.get(c.id);
              const noSpend = !c.cost && !c.orders && !c.revenue;
              const belowTarget = c.roi != null && c.targetRoi != null && c.roi < c.targetRoi;
              return (
                <Fragment key={c.id}>
                {row === firstSignal && activeGroup && (
                  <SignalDivider colSpan={13} groupName={activeGroup.name} count={signalRows.length} unit="chiến dịch" />
                )}
                {row === firstPaused && activeGroup && (
                  <SignalDivider colSpan={13} groupName={activeGroup.name} count={pausedRows.length} unit="chiến dịch" kind="paused" />
                )}
                <tr className={`transition-colors hover:bg-canvas ${isSignalRow(row) || isPausedRow(row) ? 'opacity-70 hover:opacity-100' : ''}`}>
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
                    ) : tune ? (
                      <TuneBadge tune={tune} onOpen={() => setOpen(c.id)} />
                    ) : (
                      <span className="text-xs text-muted">--</span>
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-sm`}>
                    {tune?.action ? <b>{tuneActionText(tune.action)}</b> : tune?.suggestPause ? <b className="text-danger">Nên tắt chiến dịch (tắt tay)</b> : tune?.waitUntil ? <span className="text-muted">Đo lại {formatWait(tune.waitUntil)}</span> : <span className="text-muted">--</span>}
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
                  <td className={`${TD_NUM} text-muted`}>{formatNumber(tune?.econ.breakEven, 2)}</td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {openId && tunes.get(openId) && campaigns.find((c) => c.id === openId) && (
        <CampaignTuneModal campaign={campaigns.find((c) => c.id === openId)!} tune={tunes.get(openId)!} onClose={() => setOpen(null)} />
      )}

      {shown.length === 0 && (
        <EmptyTableState
          title="Không có chiến dịch phù hợp"
          description="Thử bỏ bộ lọc trạng thái hoặc nhóm. Chiến dịch hiển thị tại đây sau khi cập nhật số liệu từ TikTok Ads."
        />
      )}
    </>
  );
}

const formatWait = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Badge tình trạng (bấm → hộp chi tiết) */
function TuneBadge({ tune, onOpen }: { tune: CampaignTune; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${tune.reason}
Bấm để xem chi tiết`}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition hover:ring-2 hover:ring-primary-soft ${tune.signal ? 'bg-amber-50 text-amber-700' : TUNE_TONE[tune.kind]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {tune.signal ? `Dấu hiệu · ${TUNE_CODES[tune.code]}` : TUNE_CODES[tune.code]}
    </button>
  );
}
