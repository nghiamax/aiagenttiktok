import { Coins, Layers, X } from 'lucide-react';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import type { CampaignFilter } from '../types';
import { TOOLBAR } from './tableStyles';

interface CampaignFilterBarProps {
  value: CampaignFilter;
  onChange: (value: CampaignFilter) => void;
  /** Số chiến dịch theo từng trạng thái, hiện trên nút lọc */
  counts: Record<CampaignFilter, number>;
  onOpenBreakEven: () => void;
  /** Tên nhóm đang lọc (mở từ hộp "Agent đang theo dõi") → hiện chip có nút bỏ lọc */
  groupName?: string;
  onClearGroup?: () => void;
}

const LABELS: Record<CampaignFilter, string> = { all: 'Tất cả', running: 'Đang chạy', paused: 'Đã tắt' };

export default function CampaignFilterBar({
  value,
  onChange,
  counts,
  onOpenBreakEven,
  groupName,
  onClearGroup,
}: CampaignFilterBarProps) {
  const options = (Object.keys(LABELS) as CampaignFilter[]).map((f) => ({
    value: f,
    label: `${LABELS[f]} (${counts[f]})`,
  }));

  return (
    <div className={TOOLBAR}>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl options={options} value={value} onChange={onChange} ariaLabel="Lọc chiến dịch" />
        {groupName && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft py-1 pl-3 pr-1 text-sm font-medium text-primary">
            <Layers className="size-4" />
            Nhóm: {groupName}
            <button
              type="button"
              onClick={onClearGroup}
              aria-label="Bỏ lọc theo nhóm"
              title="Bỏ lọc theo nhóm"
              className="flex size-6 items-center justify-center rounded-full transition-colors hover:bg-primary hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenBreakEven}
        className="flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink/80 transition-colors hover:bg-canvas hover:text-ink"
      >
        <Coins className="size-4 text-amber-500" />
        ROI hoà vốn
      </button>
    </div>
  );
}
