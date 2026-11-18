import { useState } from 'react';
import { CreditCard, Film } from 'lucide-react';
import Pagination from '../../../components/ui/Pagination';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import { formatNumber, formatVnd } from '../../../lib/format';
import { usePagination } from '../../../lib/usePagination';
import type { VideoClassification } from '../classify';
import { cpa, nextSort, productKey, sortByValue, tiktokVideoUrl } from '../metrics';
import type { AdsProduct, AdsVideo, SortState, VideoActionFilter, VideoStatus } from '../types';
import { groupDescription } from '../groups';
import { findGroup, useAdsSettings } from '../settings';
import ActionBadge from './ActionBadge';
import EmptyTableState from './EmptyTableState';
import MediaThumb from './MediaThumb';
import SortableHeader from './SortableHeader';
import VideoActions from './VideoActions';
import { LINK_BTN, TD, TD_NUM, TH, TOOLBAR } from './tableStyles';

type VideoSortKey = 'cost' | 'revenue' | 'orders' | 'cpa' | 'roi';

interface VideoTableProps {
  videos: AdsVideo[];
  productByKey: Map<string, AdsProduct>;
  onFilterProduct: (campaignId: string, productId: string) => void;
  /** Kết quả phân loại việc cần làm của từng video */
  classification: Map<AdsVideo, VideoClassification>;
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

interface VideoRow {
  v: AdsVideo;
  cpa: number | null;
  cls: VideoClassification | null;
}

export default function VideoTable({
  videos,
  productByKey,
  onFilterProduct,
  classification,
  action,
  onActionChange,
}: VideoTableProps) {
  const [sort, setSort] = useState<SortState<VideoSortKey>>({ key: 'cost', dir: 'desc' });
  const { settings } = useAdsSettings();
  const activeGroup = action === 'all' ? undefined : findGroup(settings, action);

  const rows: VideoRow[] = videos.map((v) => ({ v, cpa: cpa(v.cost, v.orders), cls: classification.get(v) ?? null }));
  const isCardRow = (r: VideoRow) => r.v.contentType === 'product_card';
  const filtered =
    action === 'all'
      ? rows
      : action === CARD_FILTER
        ? rows.filter(isCardRow)
        : rows.filter((r) => r.cls?.action === action);

  // Số video mỗi nhóm (theo bộ lọc chiến dịch/sản phẩm/tìm kiếm hiện tại) hiện ngay trên nút lọc
  const counts = new Map<string, number>();
  for (const r of rows) if (r.cls) counts.set(r.cls.action, (counts.get(r.cls.action) ?? 0) + 1);
  const cardCount = rows.filter(isCardRow).length;
  const filterOptions: { value: VideoActionFilter; label: string }[] = [
    { value: 'all', label: `Tất cả (${rows.length})` },
    ...settings.groups.map((g) => ({ value: g.id, label: `${g.name} (${counts.get(g.id) ?? 0})` })),
    // Thẻ sản phẩm không phải video, không xếp nhóm → lọc riêng
    ...(cardCount > 0 ? [{ value: CARD_FILTER, label: `Thẻ sản phẩm (${cardCount})` }] : []),
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
              : `${filtered.length} dòng`}
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
              <th className={`${TH} text-right`}>TikTok</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pageItems.map(({ v, cpa: cpaValue, cls }) => {
              const product = productByKey.get(productKey(v.campaignId, v.productId));
              const status = STATUS[v.status];
              const cut = cls?.action === 'cut';
              const isCard = v.contentType === 'product_card';
              const videoUrl = isCard ? null : tiktokVideoUrl(v.id, v.authorUsername);
              return (
                <tr
                  key={`${v.campaignId}-${v.productId}-${v.id}`}
                  // Thẻ sản phẩm không phải video → nền nhạt để tách khỏi danh sách video
                  className={`transition-colors hover:bg-canvas ${isCard ? 'bg-canvas/50' : ''}`}
                >
                  <td className={`${TD} max-w-[320px] ${cut ? 'shadow-[inset_3px_0_0_theme(colors.danger)]' : ''}`}>
                    <div className="flex items-center gap-3">
                      <MediaThumb src={v.thumbnailUrl} icon={isCard ? CreditCard : Film} shape="portrait" />
                      {isCard ? (
                        <div className="min-w-0">
                          <p className="font-medium">Thẻ sản phẩm</p>
                          <p className="text-xs text-muted">Không phải video</p>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          {videoUrl ? (
                            <a
                              href={videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`${LINK_BTN} block w-full truncate`}
                              title={`${v.title ?? v.id}\nBấm để mở video trên TikTok`}
                            >
                              {v.title || `Video ${v.id}`}
                            </a>
                          ) : (
                            <p className="truncate font-medium" title={v.title ?? v.id}>
                              {v.title || `Video ${v.id}`}
                            </p>
                          )}
                          <p className="truncate text-xs text-muted">
                            {/* identityName là tên hiển thị, @ chỉ dùng cho username thật */}
                            {v.authorUsername ? `@${v.authorUsername} · ` : v.identityName ? `${v.identityName} · ` : ''}ID{' '}
                            {v.id}
                          </p>
                        </div>
                      )}
                    </div>
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
                    {isCard ? <span className="text-muted">--</span> : <ActionBadge action={cls?.action ?? null} reason={cls?.reason} />}
                  </td>
                  <td className={TD}>
                    {status ? (
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
                  <td className={TD}>{!isCard && <VideoActions videoUrl={videoUrl} />}</td>
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
