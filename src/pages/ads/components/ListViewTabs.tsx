import { Clapperboard, FolderOpen, Package, type LucideIcon } from 'lucide-react';
import type { AdsListTab } from '../types';

interface ListViewTabsProps {
  value: AdsListTab;
  onChange: (tab: AdsListTab) => void;
}

const TABS: { value: AdsListTab; label: string; icon: LucideIcon }[] = [
  { value: 'campaigns', label: 'Chiến dịch', icon: FolderOpen },
  { value: 'products', label: 'Sản phẩm', icon: Package },
  { value: 'videos', label: 'Video', icon: Clapperboard },
];

/** 3 tầng xem: Chiến dịch → Sản phẩm → Video */
export default function ListViewTabs({ value, onChange }: ListViewTabsProps) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Chế độ xem">
      {TABS.map(({ value: tab, label, icon: Icon }) => {
        const active = tab === value;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab)}
            // px-3 + viền trong suốt: icon thẳng cột với icon trong ô chọn phía trên
            className={`flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-sm transition-colors ${
              active ? 'bg-primary-soft font-semibold text-primary' : 'font-medium text-muted hover:bg-canvas hover:text-ink'
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
