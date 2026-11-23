import { Fragment, useMemo, useState } from 'react';
import Pagination from '../../../components/ui/Pagination';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import { formatNumber, formatVnd } from '../../../lib/format';
import { usePagination } from '../../../lib/usePagination';
import { cpa, nextSort, productKey, sortByValue, tiktokVideoUrl } from '../metrics';
import type { AdsProduct, AdsVideo, Campaign, SortState, VideoActionFilter, VideoStatus } from '../types';
import { groupDescription } from '../groups';
import { findGroup, useAdsSettings } from '../settings';
import TrendGroupCell from './TrendGroupCell';
import SignalDivider from './SignalDivider';
import EmptyTableState from './EmptyTableState';
import VideoTitleCell from './VideoTitleCell';
import SortableHeader from './SortableHeader';
import VideoActions from './VideoActions';
import { TD, TD_NUM, TH, TOOLBAR } from './tableStyles';
import { effectiveStatus, isOtherCampaign } from '../../../../shared/videoStatus';
import { offsetOf } from '../../../../shared/agentMatch';
import { offsetTotalLine, offsetWarning } from '../../../../shared/offsetText';
import type { VideoOffset } from '../../../../shared/agentTypes';
import { useTrend } from '../trend';
import { classifyVideo } from '../classify';
import type { TrendInfo } from '../../../../shared/trend';

type VideoSortKey = 'cost' | 'revenue' | 'orders' | 'cpa' | 'roi';

interface VideoTableProps {
  videos: AdsVideo[];
  productByKey: Map<string, AdsProduct>;
  /** Biết chiến dịch đang chạy để bật / tắt nút Gỡ, Tăng cường */
  campaignById: Map<string, Campaign>;
  onFilterProduct: (campaignId: string, productId: string) => void;
  action: VideoActionFilter;
  onActionChange: (action: VideoActionFilter) => void;
}

const GOOD = 'bg-green-50 text-accent-green';
const WAIT = 'bg-blue-50 text-primary';
const WARN = 'bg-amber-50 text-amber-600';
const OFF = 'bg-canvas text-muted';

export const STATUS: Record<VideoStatus, { label: string; className: string } | null> = {
  delivering: { label: 'Đang phân phối', className: GOOD },
  learning: { label: 'Đang học', className: WAIT },
  in_queue: { label: 'Chờ phân phối', className: WAIT },
  not_delivering: { label: 'Không phân phối', className: OFF },
  authorization_needed: { label: 'Cần ủy quyền', className: WARN },
  excluded: { label: 'Đã loại', className: OFF },
  unavailable: { label: 'Không khả dụng', className: OFF },
  rejected: { label: 'Bị từ chối', className: 'bg-rose-50 text-danger' },
  not_active: { label: 'Chưa kích hoạt', className: OFF },
  unknown: null,
};

const PAGE_SIZE = 20;

/** Giá trị bộ lọc cho dòng thẻ sản phẩm (không trùng ID nhóm) */
const CARD_FILTER = 'product_card';
/** Giá trị bộ lọc cho video không khả dụng (không xếp nhóm) */
const UNAVAILABLE_FILTER = 'unavailable';
/** Video đã gỡ khỏi chiến dịch: ô lọc riêng, không nằm trong nhóm nào (Sếp chốt 22/11 — đã có Nhật ký theo dõi) */
const REMOVED_FILTER = 'removed';

interface VideoRow {
  v: AdsVideo;
  cpa: number | null;
  /** Nhóm theo 7 · 14 · 30 ngày đến hôm qua (không đổi theo ô chọn ngày) */
  trend: TrendInfo | undefined;
}

export default function VideoTable({
  videos,
  productByKey,
  campaignById,
  onFilterProduct,
  action,
  onActionChange,
}: VideoTableProps) {
  const [sort, setSort] = useState<SortState<VideoSortKey>>({ key: 'cost', dir: 'desc' });
  const { settings } = useAdsSettings();
  const trends = useTrend();
  const snapshot = trends.snaps.d7;
  // Video Cắt lỗ có đơn bù ở sản phẩm khác trong cùng chiến dịch → dòng "Tổng: ROI … có lời / vẫn lỗ" dưới badge (Sếp tự quyết có gỡ không)
  const offsets = useMemo(() => {
    const cutRows = new Map<string, Set<AdsVideo>>();
    for (const v of snapshot.videos) {
      if (trends.video(v)?.group !== 'cut') continue;
      const k = `${v.campaignId}/${v.id}`;
      (cutRows.get(k) ?? cutRows.set(k, new Set()).get(k)!).add(v);
    }
    const out = new Map<string, VideoOffset>();
    for (const [k, rows] of cutRows) {
      const [c, id] = k.split('/');
      const o = offsetOf(snapshot, settings, c, id, rows);
      if (o) out.set(k, o);
    }
    return out;
  }, [snapshot, settings, trends]);
  const activeGroup = action === 'all' ? undefined : findGroup(settings, action);

  const rows: VideoRow[] = videos.map((v) => ({
    v,
    cpa: cpa(v.cost, v.orders),
    trend: v.contentType === 'video' && effectiveStatus(v) !== 'unavailable' ? trends.video(v) : undefined,
  }));
  const isCardRow = (r: VideoRow) => r.v.contentType === 'product_card';
  const isUnavailableRow = (r: VideoRow) => !isCardRow(r) && effectiveStatus(r.v) === 'unavailable';
  const isRemovedRow = (r: VideoRow) => !isCardRow(r) && effectiveStatus(r.v) === 'excluded';
  /** Thuộc chiến dịch đã tắt → Agent không làm gì, không tính (phần cuối khi lọc nhóm) */
  const isPausedRow = (r: VideoRow) => campaignById.get(r.v.mainCampaignId ?? r.v.campaignId)?.status !== 'running';
  /** Dấu hiệu của nhóm đang lọc: 7 ngày gần nhất thuộc nhóm, 14 ngày chưa */
  const isSignalRow = (r: VideoRow) => !!r.trend?.unconfirmed && r.trend.g7 === action && !isPausedRow(r);
  /** Lọc nhóm: chỉ video chưa gỡ (đã gỡ ở ô lọc riêng) */
  const inGroup = (r: VideoRow) => !isRemovedRow(r) && (r.trend?.group === action || (!!r.trend?.unconfirmed && r.trend.g7 === action));
  const filtered =
    action === 'all'
      ? rows
      : action === CARD_FILTER
        ? rows.filter(isCardRow)
        : action === UNAVAILABLE_FILTER
          ? rows.filter(isUnavailableRow)
          : action === REMOVED_FILTER
            ? rows.filter(isRemovedRow)
            : rows.filter(inGroup);

  // Số trên nút lọc = video Agent làm được (đã thuộc nhóm, chưa gỡ, chiến dịch đang chạy) — khớp ô Tổng quan
  const counts = new Map<string, number>();
  const signals = new Map<string, number>();
  for (const r of rows) {
    if (isRemovedRow(r) || isPausedRow(r)) continue;
    if (r.trend?.group) counts.set(r.trend.group, (counts.get(r.trend.group) ?? 0) + 1);
    else if (r.trend?.unconfirmed && r.trend.g7) signals.set(r.trend.g7, (signals.get(r.trend.g7) ?? 0) + 1);
  }
  const cardCount = rows.filter(isCardRow).length;
  const unavailableCount = rows.filter(isUnavailableRow).length;
  const removedCount = rows.filter(isRemovedRow).length;
  const filterOptions: { value: VideoActionFilter; label: string }[] = [
    { value: 'all', label: `Tất cả (${rows.length})` },
    // "Cắt lỗ 1 · 4 dấu hiệu": dấu hiệu nằm trong đúng nhóm của nó (không gộp chung)
    ...settings.groups.map((g) => ({
      value: g.id,
      label: `${g.name} ${counts.get(g.id) ?? 0}${signals.get(g.id) ? ` · ${signals.get(g.id)} dấu hiệu` : ''}`,
    })),
    // Thẻ sản phẩm không phải video, không xếp nhóm → lọc riêng
    ...(cardCount > 0 ? [{ value: CARD_FILTER, label: `Thẻ sản phẩm (${cardCount})` }] : []),
    // Video không khả dụng: chưa có cách xử lý, không xếp nhóm → chỉ lọc riêng ở đây
    ...(unavailableCount > 0 ? [{ value: UNAVAILABLE_FILTER, label: `Không khả dụng (${unavailableCount})` }] : []),
    ...(removedCount > 0 ? [{ value: REMOVED_FILTER, label: `Đã gỡ (${removedCount})` }] : []),
  ];
  const sortRows = (list: VideoRow[]) => sortByValue(list, (r) => (sort.key === 'cpa' ? r.cpa : r.v[sort.key]), sort.dir);
  // Lọc theo nhóm: Cần xử lý → Dấu hiệu → Thuộc chiến dịch đã tắt (mỗi phần có dải tiêu đề)
  const signalRows = activeGroup ? filtered.filter(isSignalRow) : [];
  const pausedRows = activeGroup ? filtered.filter(isPausedRow) : [];
  const actionRows = activeGroup ? filtered.filter((r) => !isSignalRow(r) && !isPausedRow(r)) : [];
  const sorted = activeGroup ? [...sortRows(actionRows), ...sortRows(signalRows), ...sortRows(pausedRows)] : sortRows(filtered);
  const firstSignal = signalRows.length > 0 ? sorted[actionRows.length] : null;
  const firstPaused = pausedRows.length > 0 ? sorted[actionRows.length + signalRows.length] : null;
  const { page, pageCount, pageItems, setPage } = usePagination(sorted, PAGE_SIZE);

  const header = { sort, onSort: (key: VideoSortKey) => setSort(nextSort(sort, key)) };

  return (
    <>
      <div className={TOOLBAR}>
        <SegmentedControl options={filterOptions} value={action} onChange={onActionChange} ariaLabel="Lọc video theo việc cần làm" />
        <span className="text-sm text-muted">
          {activeGroup
            ? groupDescription(activeGroup)
            : action === CARD_FILTER
              ? 'Thẻ sản phẩm do TikTok tự tạo từ trang sản phẩm, không phải video'
              : action === UNAVAILABLE_FILTER
                ? 'TikTok báo video không khả dụng (đã ngừng chạy) — chưa có cách xử lý, không xếp nhóm, Agent không đề xuất'
                : action === REMOVED_FILTER
                  ? 'Video đã gỡ khỏi chiến dịch — không thuộc nhóm nào. Kết quả sau khi gỡ xem ở AI Agent → Nhật ký'
                  : `${filtered.length} dòng · nhóm xét theo 7 · 14 · 30 ngày đến hôm qua`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={`${TH} text-left`}>Video</th>
              <th className={`${TH} text-left`}>Sản phẩm</th>
              <th className={`${TH} text-left`} title="Nhóm Agent xét theo 7 · 14 · 30 ngày đến hôm qua, không đổi theo ô chọn ngày">Nhóm</th>
              <th className={`${TH} text-left`}>Trạng thái</th>
              <SortableHeader label="Chi phí" sortKey="cost" {...header} />
              <SortableHeader label="Doanh thu" sortKey="revenue" {...header} />
              <SortableHeader label="Đơn hàng" sortKey="orders" {...header} />
              <SortableHeader label="CPA" sortKey="cpa" {...header} />
              <SortableHeader label="ROI" sortKey="roi" {...header} />
              <th className={`${TH} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pageItems.map((row) => {
              const { v, cpa: cpaValue, trend } = row;
              const faded = activeGroup ? isSignalRow(row) || isPausedRow(row) : false;
              const product = productByKey.get(productKey(v.campaignId, v.productId));
              const status = STATUS[v.status];
              const cut = trend?.group === 'cut' && !isRemovedRow(row) && !isPausedRow(row);
              const isCard = v.contentType === 'product_card';
              const videoUrl = isCard ? null : tiktokVideoUrl(v.id, v.authorUsername);
              return (
                <Fragment key={`${v.campaignId}-${v.productId}-${v.id}`}>
                {row === firstSignal && activeGroup && (
                  <SignalDivider colSpan={10} groupName={activeGroup.name} count={signalRows.length} unit="video" />
                )}
                {row === firstPaused && activeGroup && (
                  <SignalDivider colSpan={10} groupName={activeGroup.name} count={pausedRows.length} unit="video" kind="paused" />
                )}
                <tr
                  // Thẻ sản phẩm không phải video → nền nhạt; dấu hiệu → mờ hơn
                  className={`transition-colors hover:bg-canvas ${isCard ? 'bg-canvas/50' : ''} ${faded ? 'opacity-70 hover:opacity-100' : ''}`}
                >
                  <td className={`${TD} max-w-[320px] ${cut ? 'shadow-[inset_3px_0_0_theme(colors.danger)]' : ''}`}>
                    <VideoTitleCell video={v} product={product} videoUrl={videoUrl} />
                  </td>
                  <td className={`${TD} max-w-[220px]`}>
                    <button
                      type="button"
                      onClick={() => onFilterProduct(v.campaignId, v.productId)}
                      className="block w-full truncate text-left text-muted transition-colors hover:text-primary"
                      title={product?.name ?? v.productId}
                    >
                      {product?.name ?? v.productId}
                    </button>
                  </td>
                  <td className={TD}>
                    {isCard || effectiveStatus(v) === 'unavailable' || isRemovedRow(row) ? (
                      <span
                        className="text-muted"
                        title={isCard ? undefined : isRemovedRow(row) ? 'Đã gỡ khỏi chiến dịch — không xếp nhóm (xem kết quả ở Nhật ký)' : 'Video không khả dụng — không xếp nhóm'}
                      >
                        --
                      </span>
                    ) : (
                      <TrendGroupCell
                        level="video"
                        current={classifyVideo(v, campaignById.get(v.campaignId), settings)?.action ?? null}
                        trend={trend}
                        extra={
                          cut &&
                          (() => {
                            const o = offsets.get(`${v.campaignId}/${v.id}`);
                            if (!o) return null;
                            return (
                              <span
                                className={`whitespace-nowrap text-xs ${o.profitable ? 'font-semibold text-accent-green' : 'text-muted'}`}
                                title={offsetWarning(o)}
                              >
                                {offsetTotalLine(o)}
                              </span>
                            );
                          })()
                        }
                      />
                    )}
                  </td>
                  <td className={TD}>
                    {v.crossProduct ? (
                      // TikTok ghi "Cần ủy quyền" cho cặp với sản phẩm không gắn video (cùng hoặc khác chiến dịch)
                      <span
                        className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${OFF}`}
                        title={`TikTok ghi "Cần ủy quyền" cho cặp với sản phẩm này vì video gắn «${
                          (v.mainProductId && productByKey.get(productKey(v.mainCampaignId ?? v.campaignId, v.mainProductId))?.name) ??
                          v.mainProductId
                        }»${
                          isOtherCampaign(v) ? ` ở chiến dịch «${campaignById.get(v.mainCampaignId!)?.name ?? v.mainCampaignId}»` : ''
                        } (ở đó: ${(v.mainStatus && STATUS[v.mainStatus]?.label) ?? v.mainStatus}). Không cần xử lý.`}
                      >
                        {isOtherCampaign(v) ? 'Chạy ở CD khác' : 'Gắn SP khác'}
                      </span>
                    ) : status ? (
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    ) : (
                      <span className="text-muted">--</span>
                    )}
                  </td>
                  <td className={TD_NUM}>{formatVnd(v.cost)}</td>
                  <td className={`${TD_NUM} font-semibold text-accent-green`}>{formatVnd(v.revenue)}</td>
                  <td className={TD_NUM}>{formatNumber(v.orders)}</td>
                  <td className={TD_NUM}>{formatVnd(cpaValue)}</td>
                  <td className={`${TD_NUM} font-semibold ${cut ? 'text-danger' : ''}`}>{formatNumber(v.roi, 2)}</td>
                  <td className={TD}>
                    {!isCard && (
                      <VideoActions video={v} campaignRunning={campaignById.get(v.mainCampaignId ?? v.campaignId)?.status === 'running'} videoUrl={videoUrl} />
                    )}
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <EmptyTableState
          title="Chưa có dữ liệu video"
          description="Video quảng cáo của từng sản phẩm sẽ hiển thị tại đây sau khi cập nhật số liệu từ TikTok Ads."
        />
      )}
      <Pagination page={page} pageCount={pageCount} total={filtered.length} onChange={setPage} />
    </>
  );
}
