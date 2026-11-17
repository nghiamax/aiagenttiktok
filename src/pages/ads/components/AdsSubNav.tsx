import { Bot, LayoutDashboard } from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface AdsSubNavProps {
  /** Số đề xuất chờ duyệt, hiện cạnh "AI Agent" */
  pendingCount: number;
}

const LINK =
  '-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors';

/** Điều hướng con của ADS 24/7: Tổng quan | AI Agent */
export default function AdsSubNav({ pendingCount }: AdsSubNavProps) {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `${LINK} ${
      isActive ? 'border-primary font-semibold text-primary' : 'border-transparent font-medium text-muted hover:text-ink'
    }`;

  return (
    <nav className="-mt-2 mb-6 flex gap-1 border-b border-line" aria-label="ADS 24/7">
      <NavLink to="/ads" end className={cls}>
        <LayoutDashboard className="size-4" />
        Tổng quan
      </NavLink>
      <NavLink to="/ads/agent" className={cls}>
        <Bot className="size-4" />
        AI Agent
        {pendingCount > 0 && (
          <span className="rounded-full bg-danger px-1.5 py-0.5 text-xs font-semibold leading-none text-white">
            {pendingCount}
          </span>
        )}
      </NavLink>
    </nav>
  );
}
