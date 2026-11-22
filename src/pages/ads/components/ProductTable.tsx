import { Fragment, useState } from 'react';
import { Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import Pagination from '../../../components/ui/Pagination';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import { formatNumber, formatVnd } from '../../../lib/format';
import { usePagination } from '../../../lib/usePagination';
import { groupDescription } from '../groups';
import { cpa, nextSort, sortByValue } from '../metrics';
import { breakEvenOf, findGroup, type AdsSettings } from '../settings';
import type { AdsProduct, Campaign, SortState } from '../types';
import TrendGroupCell from './TrendGroupCell';
import SignalDivider from './SignalDivider';
import { useTrend } from '../trend';
import EmptyTableState from './EmptyTableState';
import MediaThumb from './MediaThumb';
import SortableHeader from './SortableHeader';
import { LINK_BTN, TD, TD_NUM, TH, TOOLBAR } from './tableStyles';

type ProductSortKey = 'cost' | 'revenue' | 'orders' | 'cpa' | 'roi';

interface ProductTableProps {
  products: AdsProduct[];
  campaignById: Map<string, Campaign>;
  onOpenProduct: (product: AdsProduct) => void;
  onOpenCampaign: (campaignId: string) => void;
  settings: AdsSettings;
  onOpenSettings: () => void;
  /** ID nhóm sản phẩm đang lọc hoặc 'all' (lưu trên URL) */
  action: string;
  onActionChange: (action: string) => void;
}

const PAGE_SIZE = 20;

export default function ProductTable({
  products,
  campaignById,
  onOpenProduct,
  onOpenCampaign,
  settings,
  onOpenSettings,
  action: filter,
  onActionChange: setFilter,
}: ProductTableProps) {
  const [sort, setSort] = useState<SortState<ProductSortKey>>({ key: 'cost', dir: 'desc' });

  // Nhóm theo 7 · 14 · 30 ngày đến hôm qua (đã xác nhận = 7 và 14 ngày cùng nhóm), không đổi theo ô chọn ngày
  const trends = useTrend();
  const rows = products.map((p) => ({ p, cpa: cpa(p.cost, p.orders), trend: trends.product(p) }));
  type Row = (typeof rows)[number];
  /** Dấu hiệu của nhóm đang lọc: 7 ngày gần nhất thuộc nhóm, 14 ngày chưa */
  const isSignalRow = (r: Row) => !!r.trend?.unconfirmed && r.trend.g7 === filter;
  const filtered = filter === 'all' ? rows : rows.filter((r) => r.trend?.group === filter || isSignalRow(r));
  const activeGroup = filter === 'all' ? undefined : findGroup(settings, filter, 'product');

  // Số sản phẩm mỗi nhóm hiện ngay trên nút lọc
  const counts = new Map<string, number>();
  const signals = new Map<string, number>();
  for (const r of rows) {
    if (r.trend?.group) counts.set(r.trend.group, (counts.get(r.trend.group) ?? 0) + 1);
    else if (r.trend?.unconfirmed && r.trend.g7) signals.set(r.trend.g7, (signals.get(r.trend.g7) ?? 0) + 1);
  }
  const filterOptions = [
    { value: 'all', label: `Tất cả (${rows.length})` },
    ...settings.productGroups.map((g) => ({
      value: g.id,
      label: `${g.name} ${counts.get(g.id) ?? 0}${signals.get(g.id) ? ` · ${signals.get(g.id)} dấu hiệu` : ''}`,
    })),
  ];
  const sortRows = (list: Row[]) => sortByValue(list, (r) => (sort.key === 'cpa' ? r.cpa : r.p[sort.key]), sort.dir);
  // Lọc theo nhóm: đã thuộc nhóm lên trước, dấu hiệu xếp sau dải phân cách
  const signalRows = activeGroup ? filtered.filter(isSignalRow) : [];
  const sorted = activeGroup ? [...sortRows(filtered.filter((r) => !isSignalRow(r))), ...sortRows(signalRows)] : sortRows(filtered);
  const firstSignal = signalRows.length > 0 ? sorted[sorted.length - signalRows.length] : null;
  const { page, pageCount, pageItems, setPage } = usePagination(sorted, PAGE_SIZE);

  const header = { sort, onSort: (key: ProductSortKey) => setSort(nextSort(sort, key)) };

  return (
    <>
      <div className={TOOLBAR}>
        <SegmentedControl options={filterOptions} value={filter} onChange={setFilter} ariaLabel="Lọc sản phẩm theo nhóm" />
        <span className="text-sm text-muted">
          {activeGroup ? (
            groupDescription(activeGroup, 'product')
          ) : (
            <>
              {filtered.length} sản phẩm ·{' '}
              <Link
                to="/ads/agent?view=groups&level=product"
                className="font-medium text-primary transition-colors hover:text-primary-hover"
              >
                Sửa nhóm sản phẩm
              </Link>
            </>
          )}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={`${TH} text-left`}>Sản phẩm</th>
              <th className={`${TH} text-left`}>Chiến dịch</th>
              <th className={`${TH} text-left`}>Video</th>
              <SortableHeader label="Chi phí" sortKey="cost" {...header} />
              <SortableHeader label="Doanh thu" sortKey="revenue" {...header} />
              <SortableHeader label="Đơn hàng" sortKey="orders" {...header} />
              <SortableHeader label="CPA" sortKey="cpa" {...header} />
              <SortableHeader label="ROI" sortKey="roi" {...header} />
              <th className={`${TH} text-right`}>ROI hoà vốn</th>
              <th className={`${TH} text-left`}>Nhóm</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pageItems.map((row) => {
              const { p, cpa: cpaValue, trend } = row;
              const campaign = campaignById.get(p.campaignId);
              return (
                <Fragment key={`${p.campaignId}-${p.id}`}>
                {row === firstSignal && activeGroup && (
                  <SignalDivider colSpan={10} groupName={activeGroup.name} count={signalRows.length} unit="sản phẩm" />
                )}
                <tr className={`transition-colors hover:bg-canvas ${isSignalRow(row) ? 'opacity-70 hover:opacity-100' : ''}`}>
                  <td className={`${TD} max-w-[320px]`}>
                    <div className="flex items-center gap-3">
                      <MediaThumb src={p.imageUrl} icon={Package} shape="square" />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenProduct(p)}
                          className={`${LINK_BTN} block w-full truncate`}
                          title={`${p.name}\nBấm để xem video`}
                        >
                          {p.name}
                        </button>
                        <p className="truncate text-xs text-muted">ID {p.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className={`${TD} max-w-[200px]`}>
                    <button
                      type="button"
                      onClick={() => onOpenCampaign(p.campaignId)}
                      className="block w-full truncate text-left text-muted transition-colors hover:text-primary"
                      title={campaign?.name ?? p.campaignId}
                    >
                      {campaign?.name ?? p.campaignId}
                    </button>
                  </td>
                  <td className={TD}>
                    <button
                      type="button"
                      onClick={() => onOpenProduct(p)}
                      className="whitespace-nowrap font-medium text-primary transition-colors hover:text-primary-hover"
                    >
                      {p.videoCount == null ? 'Xem video' : `${formatNumber(p.videoCount)} video`}
                    </button>
                  </td>
                  <td className={TD_NUM}>{formatVnd(p.cost)}</td>
                  <td className={`${TD_NUM} font-semibold text-accent-green`}>{formatVnd(p.revenue)}</td>
                  <td className={TD_NUM}>{formatNumber(p.orders)}</td>
                  <td className={TD_NUM}>{formatVnd(cpaValue)}</td>
                  <td className={`${TD_NUM} font-semibold`}>{formatNumber(p.roi, 2)}</td>
                  <td className={TD_NUM}>
                    {(() => {
                      const be = breakEvenOf(settings, p.id);
                      return be == null ? (
                        <button
                          type="button"
                          onClick={onOpenSettings}
                          title="Chưa nhập ROI hoà vốn — nhóm Lỗ / Lời sẽ không khớp"
                          className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                        >
                          Nhập
                        </button>
                      ) : (
                        <span className="text-muted">{formatNumber(be, 2)}</span>
                      );
                    })()}
                  </td>
                  <td className={TD}>
                    <TrendGroupCell level="product" trend={trend} />
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
          title="Chưa có dữ liệu sản phẩm"
          description="Sản phẩm trong chiến dịch GMV Max sẽ hiển thị tại đây sau khi cập nhật số liệu từ TikTok Ads."
        />
      )}
      <Pagination page={page} pageCount={pageCount} total={filtered.length} onChange={setPage} />
    </>
  );
}
