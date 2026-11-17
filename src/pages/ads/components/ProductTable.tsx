import { useState } from 'react';
import { Package } from 'lucide-react';
import Pagination from '../../../components/ui/Pagination';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import { formatNumber, formatVnd } from '../../../lib/format';
import { usePagination } from '../../../lib/usePagination';
import { productMargin } from '../classify';
import { cpa, nextSort, sortByValue } from '../metrics';
import { breakEvenOf, type AdsSettings } from '../settings';
import type { AdsProduct, Campaign, ProductFilter, SortState } from '../types';
import MarginBadge from './MarginBadge';
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
}

const FILTERS: { value: ProductFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'loss', label: 'Lỗ' },
  { value: 'near', label: 'Sát hoà vốn' },
  { value: 'profit', label: 'Lời' },
];

const PAGE_SIZE = 20;

export default function ProductTable({
  products,
  campaignById,
  onOpenProduct,
  onOpenCampaign,
  settings,
  onOpenSettings,
}: ProductTableProps) {
  const [filter, setFilter] = useState<ProductFilter>('all');
  const [sort, setSort] = useState<SortState<ProductSortKey>>({ key: 'cost', dir: 'desc' });

  const rows = products.map((p) => ({
    p,
    cpa: cpa(p.cost, p.orders),
    margin: productMargin(p, settings),
  }));
  const filtered = filter === 'all' ? rows : rows.filter((r) => r.margin === filter);
  const sorted = sortByValue(filtered, (r) => (sort.key === 'cpa' ? r.cpa : r.p[sort.key]), sort.dir);
  const { page, pageCount, pageItems, setPage } = usePagination(sorted, PAGE_SIZE);

  const header = { sort, onSort: (key: ProductSortKey) => setSort(nextSort(sort, key)) };

  return (
    <>
      <div className={TOOLBAR}>
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} ariaLabel="Lọc sản phẩm" />
        <span className="text-sm text-muted">
          {filtered.length} sản phẩm · Lời/lỗ so với{' '}
          <button type="button" onClick={onOpenSettings} className="font-medium text-primary transition-colors hover:text-primary-hover">
            ROI hoà vốn
          </button>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
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
              <th className={`${TH} text-left`}>Lời / lỗ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pageItems.map(({ p, cpa: cpaValue, margin }) => {
              const campaign = campaignById.get(p.campaignId);
              return (
                <tr key={`${p.campaignId}-${p.id}`} className="transition-colors hover:bg-canvas">
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
                  <td className={TD}>
                    <MarginBadge margin={margin} breakEven={breakEvenOf(settings, p.id)} />
                  </td>
                </tr>
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
