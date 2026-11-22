import { useMemo, useState } from 'react';
import Pagination from '../../../components/ui/Pagination';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import { formatNumber, formatVnd } from '../../../lib/format';
import { usePagination } from '../../../lib/usePagination';
import { cpa, nextSort, productKey, sortByValue, tiktokVideoUrl } from '../metrics';
import type { AdsProduct, AdsVideo, Campaign, SortState, VideoActionFilter, VideoStatus } from '../types';
import { groupDescription } from '../groups';
import { findGroup, useAdsSettings } from '../settings';
import TrendGroupCell from './TrendGroupCell';
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

const STATUS: Record<VideoStatus, { label: string; className: string } | null> = {
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
/** Nhóm 7 ngày chưa được khung 14 ngày xác nhận */
export const UNCONFIRMED_FILTER = 'unconfirmed';

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
  const filtered =
    action === 'all'
      ? rows
      : action === CARD_FILTER
        ? rows.filter(isCardRow)
        : action === UNAVAILABLE_FILTER
          ? rows.filter(isUnavailableRow)
          : action === UNCONFIRMED_FILTER
            ? rows.filter((r) => r.trend?.unconfirmed)
            : rows.filter((r) => r.trend?.group === action);

  // Số video mỗi nhóm (theo bộ lọc chiến dịch/sản phẩm/tìm kiếm hiện tại) hiện ngay trên nút lọc
  const counts = new Map<string, number>();
  for (const r of rows) if (r.trend?.group) counts.set(r.trend.group, (counts.get(r.trend.group) ?? 0) + 1);
  const unconfirmedCount = rows.filter((r) => r.trend?.unconfirmed).length;
  const cardCount = rows.filter(isCardRow).length;
  const unavailableCount = rows.filter(isUnavailableRow).length;
  const filterOptions: { value: VideoActionFilter; label: string }[] = [
    { value: 'all', label: `Tất cả (${rows.length})` },
    ...settings.groups.map((g) => ({ value: g.id, label: `${g.name} (${counts.get(g.id) ?? 0})` })),
    // 7 ngày một nhóm, 14 ngày nhóm khác → chưa chắc chắn, Agent không đề xuất
    ...(unconfirmedCount > 0 ? [{ value: UNCONFIRMED_FILTER, label: `Chưa xác nhận (${unconfirmedCount})` }] : []),
    // Thẻ sản phẩm không phải video, không xếp nhóm → lọc riêng
    ...(cardCount > 0 ? [{ value: CARD_FILTER, label: `Thẻ sản phẩm (${cardCount})` }] : []),
    // Video không khả dụng: chưa có cách xử lý, không xếp nhóm → chỉ lọc riêng ở đây
    ...(unavailableCount > 0 ? [{ value: UNAVAILABLE_FILTER, label: `Không khả dụng (${unavailableCount})` }] : []),
  ];
  const sorted = sortByValue(filtered, (r) => (sort.key === 'cpa' ? r.cpa : r.v[sort.key]), sort.dir);
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
                : action === UNCONFIRMED_FILTER
                  ? 'Nhóm 7 ngày khác nhóm 14 ngày — chưa chắc chắn, không tính ở Tổng quan, Agent không đề xuất'
                  : `${filtered.length} dòng · nhóm xét theo 7 · 14 · 30 ngày đến hôm qua`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={`${TH} text-left`}>Video</th>
              <th className={`${TH} text-left`}>Sản phẩm</th>
              <th className={`${TH} text-left`}>Nhóm</th>
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
            {pageItems.map(({ v, cpa: cpaValue, trend }) => {
              const product = productByKey.get(productKey(v.campaignId, v.productId));
              const status = STATUS[v.status];
              const cut = trend?.group === 'cut';
              const isCard = v.contentType === 'product_card';
              const videoUrl = isCard ? null : tiktokVideoUrl(v.id, v.authorUsername);
              return (
                <tr
                  key={`${v.campaignId}-${v.productId}-${v.id}`}
                  // Thẻ sản phẩm không phải video → nền nhạt để tách khỏi danh sách video
                  className={`transition-colors hover:bg-canvas ${isCard ? 'bg-canvas/50' : ''}`}
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
                    {isCard || effectiveStatus(v) === 'unavailable' ? (
                      <span className="text-muted" title={isCard ? undefined : 'Video không khả dụng — không xếp nhóm'}>
                        --
                      </span>
                    ) : (
                      <TrendGroupCell
                        level="video"
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
