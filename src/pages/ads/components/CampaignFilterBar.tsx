import { CalendarClock, Coins, Wand2 } from 'lucide-react';
import type { CampaignFilter } from '../types';

interface CampaignFilterBarProps {
  value: CampaignFilter;
  onChange: (value: CampaignFilter) => void;
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

export default function CampaignFilterBar({ value, onChange }: CampaignFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      {/* Bộ lọc dạng segmented control */}
      <div
        className="inline-flex w-fit flex-wrap gap-1 rounded-xl bg-canvas p-1"
        role="tablist"
        aria-label="Lọc chiến dịch"
      >
        {FILTERS.map((f) => {
          const active = f.value === value;
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(f.value)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
                active ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Tiện ích */}
      <div className="flex flex-wrap items-center gap-1">
        {ACTIONS.map(({ label, icon: Icon, color }) => (
          <button
            key={label}
            type="button"
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
