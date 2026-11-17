import type { ReactNode } from 'react';
import Card from '../../../components/ui/Card';
import type { AdsListTab } from '../types';
import ListViewTabs from './ListViewTabs';

interface GmvMaxListCardProps {
  tab: AdsListTab;
  onTabChange: (tab: AdsListTab) => void;
  /** Hàng bộ lọc (chọn chiến dịch, sản phẩm, tìm video) */
  filters: ReactNode;
  /** Bảng của tab đang chọn */
  children: ReactNode;
}

/** Card danh sách GMV Max: 3 tab Chiến dịch / Sản phẩm / Video + bộ lọc */
export default function GmvMaxListCard({ tab, onTabChange, filters, children }: GmvMaxListCardProps) {
  return (
    // Không overflow-hidden ở card để danh sách thả xuống của bộ lọc không bị cắt
    <Card>
      <div className="space-y-4 border-b border-line p-5">
        <h2 className="text-lg font-semibold">Chiến dịch GMV Max</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{filters}</div>
        <ListViewTabs value={tab} onChange={onTabChange} />
      </div>

      <div className="overflow-hidden rounded-b-2xl">{children}</div>
    </Card>
  );
}
