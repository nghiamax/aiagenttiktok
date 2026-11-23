import { Gauge, History, Inbox, Layers, Lightbulb, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { AgentView } from '../types';

interface AgentTabsProps {
  value: AgentView;
  onChange: (view: AgentView) => void;
  counts: Record<AgentView, string>;
}

const TABS: { value: AgentView; label: string; icon: LucideIcon }[] = [
  { value: 'suggest', label: 'Gợi ý', icon: Lightbulb },
  { value: 'pending', label: 'Chờ duyệt', icon: Inbox },
  { value: 'log', label: 'Nhật ký', icon: History },
  { value: 'impact', label: 'Hiệu quả', icon: Gauge },
  { value: 'rules', label: 'Quy tắc', icon: SlidersHorizontal },
  { value: 'groups', label: 'Nhóm', icon: Layers },
];

/** Các tab của trang BOT AI (cùng kiểu với ListViewTabs) */
export default function AgentTabs({ value, onChange, counts }: AgentTabsProps) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="BOT AI">
      {TABS.map(({ value: tab, label, icon: Icon }) => {
        const active = tab === value;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab)}
            className={`flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-sm transition-colors ${
              active ? 'bg-primary-soft font-semibold text-primary' : 'font-medium text-muted hover:bg-canvas hover:text-ink'
            }`}
          >
            <Icon className="size-4" />
            {label}
            <span className={`text-xs ${active ? 'text-primary/70' : 'text-muted'}`}>{counts[tab]}</span>
          </button>
        );
      })}
    </div>
  );
}
