import { CalendarClock, Coins, Wand2 } from 'lucide-react';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import type { CampaignFilter } from '../types';
import { TOOLBAR } from './tableStyles';

interface CampaignFilterBarProps {
  value: CampaignFilter;
  onChange: (value: CampaignFilter) => void;
  onOpenBreakEven: () => void;
}

const FILTERS: { value: CampaignFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'running', label: 'Đang chạy' },
  { value: 'paused', label: 'Đã tắt' },
  { value: 'suggested', label: 'Có đề xuất' },
];

const ACTIONS = [
  { label: 'Quy tắc', icon: Wand2, color: 'text-accent-violet' },
  { label: 'ROI hoà vốn', icon: Coins, color: 'text-amber-500' },
  { label: 'Lịch ngân sách', icon: CalendarClock, color: 'text-accent-green' },
];

export default function CampaignFilterBar({ value, onChange, onOpenBreakEven }: CampaignFilterBarProps) {
  return (
    <div className={TOOLBAR}>
      <SegmentedControl options={FILTERS} value={value} onChange={onChange} ariaLabel="Lọc chiến dịch" />

      {/* Tiện ích */}
      <div className="flex flex-wrap items-center gap-1">
        {ACTIONS.map(({ label, icon: Icon, color }) => (
          <button
            key={label}
            type="button"
            onClick={label === 'ROI hoà vốn' ? onOpenBreakEven : undefined}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink/80 transition-colors hover:bg-canvas hover:text-ink"
          >
            <Icon className={`size-4 ${color}`} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
