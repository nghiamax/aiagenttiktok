import type { ReactNode } from 'react';
import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import { GMV_LIST_ANCHOR } from '../../../config/navigation';
import { useNavAnchor } from '../../../lib/useNavAnchor';
import type { AdsListTab } from '../types';
import ListViewTabs from './ListViewTabs';

interface GmvMaxListCardProps {
  tab: AdsListTab;
  onTabChange: (tab: AdsListTab) => void;
  /** Hàng bộ lọc (chọn chiến dịch, sản phẩm, tìm video) */
  filters: ReactNode;
  /** Số chiến dịch / sản phẩm / video theo bộ lọc hiện tại */
  counts: Record<AdsListTab, number>;
  /** Bảng của tab đang chọn */
  children: ReactNode;
}

/** id của card danh sách, dùng để cuộn tới (sidebar "Phân tích GMV Max" cũng trỏ tới đây) */
export const LIST_ANCHOR = GMV_LIST_ANCHOR;

/** Card danh sách GMV Max: 3 tab Chiến dịch / Sản phẩm / Video + bộ lọc */
export default function GmvMaxListCard({ tab, onTabChange, filters, counts, children }: GmvMaxListCardProps) {
  useNavAnchor(LIST_ANCHOR);
  return (
    // Không overflow-hidden ở card để danh sách thả xuống của bộ lọc không bị cắt
    // id + scroll-mt: bấm ô ở hộp "Agent đang theo dõi" thì cuộn tới đây, không bị header sticky che
    <Card id={LIST_ANCHOR} className="scroll-mt-20">
      <div className="space-y-4 border-b border-line p-5">
        <div>
          <h2 className="text-lg font-semibold">Danh sách GMV Max</h2>
          <p className="text-sm text-muted">
            {formatNumber(counts.campaigns)} chiến dịch · {formatNumber(counts.products)} sản phẩm ·{' '}
            {formatNumber(counts.videos)} video
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{filters}</div>
        <ListViewTabs value={tab} onChange={onTabChange} />
      </div>

      <div className="overflow-hidden rounded-b-2xl">{children}</div>
    </Card>
  );
}
