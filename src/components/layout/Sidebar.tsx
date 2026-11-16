import { NavLink } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, Sparkles, X } from 'lucide-react';
import { APP_NAME, APP_TAGLINE, NAV_ITEMS } from '../../config/navigation';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  return (
    <>
      {/* Lớp phủ khi mở drawer trên mobile/tablet */}
      <div
        className={`fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm transition-opacity lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-white transition-all duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:sticky lg:top-0 lg:h-screen lg:translate-x-0
          ${collapsed ? 'lg:w-[76px]' : 'lg:w-64'}`}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent-violet text-white shadow-sm">
            <Sparkles className="size-5" strokeWidth={2} />
          </div>
          <div className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="truncate text-lg font-bold leading-tight">{APP_NAME}</p>
            <p className="truncate text-xs text-muted">{APP_TAGLINE}</p>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink lg:hidden"
            aria-label="Đóng menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Điều hướng */}
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <p
            className={`mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted ${
              collapsed ? 'lg:hidden' : ''
            }`}
          >
            Chức năng
          </p>
          <ul className="space-y-1">
            {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
              <li key={path}>
                <NavLink
                  to={path}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
                      collapsed ? 'lg:justify-center lg:px-0' : ''
                    } ${
                      isActive
                        ? 'bg-primary-soft font-semibold text-primary'
                        : 'font-medium text-ink/80 hover:bg-canvas hover:text-ink'
                    }`
                  }
                >
                  <Icon className="size-5 shrink-0" strokeWidth={1.9} />
                  <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Thu gọn / mở rộng (chỉ desktop) */}
        <div className="hidden border-t border-line p-3 lg:block">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-ink ${
              collapsed ? 'justify-center px-0' : ''
            }`}
            aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          >
            {collapsed ? (
              <ChevronsRight className="size-5" />
            ) : (
              <>
                <ChevronsLeft className="size-5" />
                <span>Thu gọn</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
