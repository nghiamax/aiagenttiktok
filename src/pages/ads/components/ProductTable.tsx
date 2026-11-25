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
import { classifyProduct } from '../classify';
import EmptyTableState from './EmptyTableState';
import { REENABLE_GROUP_ID, reEnableVerdict } from '../reEnable';
import ProductReEnableButton from './ProductReEnableButton';
import ReEnableCell from './ReEnableCell';
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
  /** Mở hộp ROI hoà vốn (kèm sản phẩm vừa bấm → lên đầu, con trỏ ở ô nhập) */
  onOpenSettings: (productId?: string) => void;
  /** ID nhóm sản phẩm đang lọc hoặc 'all' (lưu trên URL) */
  action: string;
  onActionChange: (action: string) => void;
}

const PAGE_SIZE = 20;
/** Sản phẩm đang bật nhưng 7 ngày không có chi / đơn → chưa xếp nhóm (để các ô lọc cộng lại đủ Tất cả) */
const NO_SPEND_FILTER = 'no_spend';
/**
 * Ô lọc chung "Đã tắt / loại trừ" (Sếp chốt 25/11): sản phẩm thuộc chiến dịch đã tắt + sản phẩm đã tắt khỏi chiến dịch đang chạy.
 * Không thuộc nhóm nào. Mỗi chiến dịch 1 dòng; nhãn từng dòng: "CD đã tắt" (ưu tiên) / "Đã loại trừ" (+ đánh giá bật lại).
 */
const OFF_FILTER = 'off';
/** Sản phẩm đang chạy = chiến dịch đang chạy + chưa loại trừ (Sếp thêm 25/11) */
const RUNNING_FILTER = 'running';
/** Nhóm hệ thống "Cân nhắc bật lại" (shared/reEnable.ts): đã tắt / loại trừ mà số 30 ngày có lời đủ đơn — ô lọc = ID nhóm (khớp ô Tổng quan) */
const REENABLE_FILTER = REENABLE_GROUP_ID;
const NO_SPEND_CELL = {
  label: 'Chưa chi tiêu',
  title: '7 ngày gần nhất không có chi phí / đơn — chưa xếp nhóm. Sản phẩm vẫn đang bật trong chiến dịch.',
};

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
  /** Thuộc chiến dịch đã tắt → không tính (phần cuối khi lọc nhóm) */
  const isPausedRow = (r: Row) => campaignById.get(r.p.campaignId)?.status !== 'running';
  /** Đã tắt khỏi chiến dịch */
  /** Đã tắt khỏi chiến dịch ĐANG CHẠY (chiến dịch đã tắt thì xếp vào "Chiến dịch đã tắt") */
  const isExcludedRow = (r: Row) => !!r.p.excluded && !isPausedRow(r);
  /** Đang bật nhưng 7 ngày không có chi / đơn → chưa thuộc nhóm nào */
  const isNoSpendRow = (r: Row) => !isPausedRow(r) && !isExcludedRow(r) && !r.trend?.group && !r.trend?.unconfirmed;
  /** Dấu hiệu của nhóm đang lọc: 7 ngày gần nhất thuộc nhóm, 14 ngày chưa */
  const isSignalRow = (r: Row) => !!r.trend?.unconfirmed && r.trend.g7 === filter && !isPausedRow(r);
  const isOffRow = (r: Row) => isPausedRow(r) || isExcludedRow(r);
  const isReEnableRow = (r: Row) => isOffRow(r) && reEnableVerdict(r.trend, breakEvenOf(settings, r.p.id)) === 'suggest';
  const filtered =
    filter === 'all'
      ? rows
      : filter === RUNNING_FILTER
        ? rows.filter((r) => !isOffRow(r))
        : filter === REENABLE_FILTER
          ? rows.filter(isReEnableRow)
          : filter === OFF_FILTER
        ? rows.filter((r) => isPausedRow(r) || isExcludedRow(r))
        : filter === NO_SPEND_FILTER
          ? rows.filter(isNoSpendRow)
          : rows.filter((r) => !isExcludedRow(r) && (r.trend?.group === filter || (!!r.trend?.unconfirmed && r.trend.g7 === filter)));
  const activeGroup = filter === 'all' || filter === REENABLE_FILTER ? undefined : findGroup(settings, filter, 'product');

  // Số sản phẩm mỗi nhóm hiện ngay trên nút lọc
  const counts = new Map<string, number>();
  const signals = new Map<string, number>();
  for (const r of rows) {
    if (isPausedRow(r) || isExcludedRow(r)) continue; // số trên nút lọc = sản phẩm Agent làm được (khớp ô Tổng quan)
    if (r.trend?.group) counts.set(r.trend.group, (counts.get(r.trend.group) ?? 0) + 1);
    else if (r.trend?.unconfirmed && r.trend.g7) signals.set(r.trend.g7, (signals.get(r.trend.g7) ?? 0) + 1);
  }
  const offCount = rows.filter((r) => isPausedRow(r) || isExcludedRow(r)).length;
  const noSpendCount = rows.filter(isNoSpendRow).length;
  const reEnableCount = rows.filter(isReEnableRow).length;
  const filterOptions = [
    { value: 'all', label: `Tất cả (${rows.length})` },
    { value: RUNNING_FILTER, label: `Đang chạy (${rows.length - offCount})` },
    ...settings.productGroups.filter((g) => g.kind !== 'platform').map((g) => ({
      value: g.id,
      label: `${g.name} ${counts.get(g.id) ?? 0}${signals.get(g.id) ? ` · ${signals.get(g.id)} dấu hiệu` : ''}`,
    })),
    ...(noSpendCount > 0 || filter === NO_SPEND_FILTER ? [{ value: NO_SPEND_FILTER, label: `Chưa chi tiêu (${noSpendCount})` }] : []),
    ...(offCount > 0 || filter === REENABLE_FILTER ? [{ value: REENABLE_FILTER, label: `${findGroup(settings, REENABLE_FILTER, 'product')?.name ?? 'Cân nhắc bật lại'} (${reEnableCount})` }] : []),
    ...(offCount > 0 || filter === OFF_FILTER ? [{ value: OFF_FILTER, label: `Đã tắt / loại trừ (${offCount})` }] : []),
  ];
  const sortRows = (list: Row[]) => sortByValue(list, (r) => (sort.key === 'cpa' ? r.cpa : r.p[sort.key]), sort.dir);
  // Lọc theo nhóm: đã thuộc nhóm lên trước, dấu hiệu xếp sau dải phân cách
  const signalRows = activeGroup ? filtered.filter(isSignalRow) : [];
  const pausedRows = activeGroup ? filtered.filter(isPausedRow) : [];
  const actionRows = activeGroup ? filtered.filter((r) => !isSignalRow(r) && !isPausedRow(r)) : [];
  const sorted = activeGroup ? [...sortRows(actionRows), ...sortRows(signalRows), ...sortRows(pausedRows)] : sortRows(filtered);
  const firstSignal = signalRows.length > 0 ? sorted[actionRows.length] : null;
  const firstPaused = pausedRows.length > 0 ? sorted[actionRows.length + signalRows.length] : null;
  const { page, pageCount, pageItems, setPage } = usePagination(sorted, PAGE_SIZE);

  const header = { sort, onSort: (key: ProductSortKey) => setSort(nextSort(sort, key)) };

  return (
    <>
      <div className={TOOLBAR}>
        <SegmentedControl options={filterOptions} value={filter} onChange={setFilter} ariaLabel="Lọc sản phẩm theo nhóm" />
        <span className="text-sm text-muted">
          {activeGroup ? (
            groupDescription(activeGroup, 'product')
          ) : filter === RUNNING_FILTER ? (
            'Sản phẩm đang chạy (chiến dịch đang bật, chưa loại trừ)'
          ) : filter === REENABLE_FILTER ? (
            'Đã tắt / loại trừ nhưng 30 ngày qua có lời (ROI ≥ hoà vốn, ≥ 3 đơn) — cân nhắc bật lại'
          ) : filter === OFF_FILTER ? (
            'Chiến dịch đã tắt hoặc sản phẩm đã loại trừ — không tính vào nhóm. Đã loại trừ: đánh giá bật lại theo số 30 ngày'
          ) : filter === NO_SPEND_FILTER ? (
            'Sản phẩm đang bật nhưng 7 ngày gần nhất không có chi phí / đơn — chưa xếp nhóm'
          ) : (
            <>
              {filtered.length} sản phẩm ·{' '}
              <Link
                to="/care-ads/product?view=groups&level=product"
                className="font-medium text-primary transition-colors hover:text-primary-hover"
              >
                Sửa phân nhóm sản phẩm
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
              <th className={`${TH} text-left`} title="Agent xét theo 7 · 14 · 30 ngày">Nhóm</th>
              <th className={`${TH} text-left`}>Video</th>
              <SortableHeader label="Chi phí" sortKey="cost" {...header} />
              <SortableHeader label="Doanh thu" sortKey="revenue" {...header} />
              <SortableHeader label="Đơn hàng" sortKey="orders" {...header} />
              <SortableHeader label="CPA" sortKey="cpa" {...header} />
              <SortableHeader label="ROI" sortKey="roi" {...header} />
              <th className={`${TH} text-right`}>ROI hoà vốn</th>
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
                {row === firstPaused && activeGroup && (
                  <SignalDivider colSpan={10} groupName={activeGroup.name} count={pausedRows.length} unit="sản phẩm" kind="paused" />
                )}
                <tr
                  className={`transition-colors hover:bg-canvas ${activeGroup && (isSignalRow(row) || isPausedRow(row)) ? 'opacity-70 hover:opacity-100' : ''}`}
                >
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
                        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                          {isPausedRow(row) ? (
                            <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 font-semibold text-muted" title="Chiến dịch đang tắt">
                              CD đã tắt
                            </span>
                          ) : isExcludedRow(row) && (
                            <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 font-semibold text-muted" title="Sản phẩm đã tắt khỏi chiến dịch">
                              Đã loại trừ
                            </span>
                          )}
                          <span className="truncate">ID {p.id}</span>
                          {(() => {
                            // Điều kiện riêng theo sản phẩm ở nhóm video / sản phẩm (Sếp chốt 25/11)
                            const own = [...settings.groups, ...settings.productGroups].filter((g) => g.productConditions?.[p.id]).length;
                            return (
                              <Link
                                to={`/care-ads/product?view=groups&product=${p.id}`}
                                title="Đặt điều kiện nhóm riêng cho sản phẩm này (vd Cắt lỗ / Nhân rộng ngưỡng khác)"
                                className="shrink-0 font-medium text-primary hover:text-primary-hover"
                              >
                                · {own ? `Phân nhóm riêng (${own})` : 'Phân nhóm riêng'}
                              </Link>
                            );
                          })()}
                        </p>
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
                    {isPausedRow(row) || isExcludedRow(row) ? (
                      <div className="flex flex-col items-start gap-1.5">
                        <ReEnableCell trend={trend} breakEven={breakEvenOf(settings, p.id)} kind={isPausedRow(row) ? 'paused' : 'excluded'} />
                        {isExcludedRow(row) && (
                          <ProductReEnableButton
                            campaignId={p.campaignId}
                            campaignName={campaign?.name ?? p.campaignId}
                            productId={p.id}
                            productName={p.name}
                            suggested={isReEnableRow(row)}
                          />
                        )}
                      </div>
                    ) : (
                      <TrendGroupCell level="product" trend={trend} empty={NO_SPEND_CELL} current={{ group: classifyProduct(p, campaignById.get(p.campaignId), settings)?.action ?? null, cost: p.cost, orders: p.orders, roi: p.roi }} />
                    )}
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
                          onClick={() => onOpenSettings(p.id)}
                          title="Chưa nhập ROI hoà vốn — nhóm Lỗ / Lời sẽ không khớp"
                          className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                        >
                          Nhập
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenSettings(p.id)}
                          title="Bấm để sửa ROI hoà vốn"
                          className="rounded-lg px-2 py-1 text-muted underline decoration-dotted underline-offset-4 transition hover:bg-primary-soft hover:text-primary"
                        >
                          {formatNumber(be, 2)}
                        </button>
                      );
                    })()}
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
