import { NavLink, useLocation } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { effectivePlan } from '../../../shared/plans';
import { APP_NAME, APP_TAGLINE, NAV_ANCHOR_EVENT, NAV_ITEMS, type NavItem } from '../../config/navigation';
import { useScrollSpy } from '../../lib/useScrollSpy';
import SidebarProfile from './SidebarProfile';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const inSection = (item: NavItem, pathname: string) =>
  pathname === item.path ||
  pathname.startsWith(`${item.path}/`) ||
  !!item.children?.some((c) => pathname === c.path || pathname.startsWith(`${c.path}/`));

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  const location = useLocation();
  // Mục con là mốc trong trang đang mở (Theo dõi video, Phân tích GMV Max) → sáng theo phần đang xem khi cuộn
  const anchors = NAV_ITEMS.flatMap((i) => i.children ?? [])
    .filter((c) => c.anchor && c.path === location.pathname)
    .map((c) => c.anchor!);
  const spy = useScrollSpy(anchors, anchors.length > 0);
  const { can, user } = useAuth();
  const isPro = !!user && effectivePlan(user) === 'pro';
  const items = NAV_ITEMS.filter((n) => can(n.permission));

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
        {/* Logo + nút thu gọn */}
        <div
          className={`flex h-16 shrink-0 items-center gap-3 border-b border-line px-4 ${
            collapsed ? 'lg:flex-col lg:justify-center lg:gap-1 lg:px-0' : ''
          }`}
        >
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent-violet text-white shadow-sm ${
              collapsed ? 'lg:size-9' : ''
            }`}
          >
            <Sparkles className="size-5" strokeWidth={2} />
          </div>
          <div className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="truncate text-lg font-bold leading-tight">{APP_NAME}</p>
            <p className="truncate text-xs text-muted">{APP_TAGLINE}</p>
          </div>
          {!collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Thu gọn sidebar"
              title="Thu gọn"
              className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink lg:flex"
            >
              <ChevronsLeft className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink lg:hidden"
            aria-label="Đóng menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Mở rộng sidebar"
            title="Mở rộng"
            className="mx-auto mt-2 hidden size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink lg:flex"
          >
            <ChevronsRight className="size-4" />
          </button>
        )}

        {/* Điều hướng */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin]">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const { label, path, icon: Icon, children } = item;
              const active = inSection(item, location.pathname);
              return (
                <li key={path}>
                  <div className="flex items-center">
                    <NavLink
                      to={path}
                      onClick={onCloseMobile}
                      title={collapsed ? label : undefined}
                      className={() =>
                        `flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
                          collapsed ? 'lg:justify-center lg:px-0 lg:py-2.5' : ''
                        } ${
                          active
                            ? 'bg-primary-soft font-semibold text-primary'
                            : 'font-medium text-ink/80 hover:bg-canvas hover:text-ink'
                        }`
                      }
                    >
                      <Icon className="size-5 shrink-0" strokeWidth={1.9} />
                      <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{label}</span>
                    </NavLink>
                  </div>
                  {/* Mục con luôn mở (Sếp chốt 23/11) — dạng nhánh cây gọn */}
                  {children && (
                    <ul
                      className={`mb-1 ml-[22px] mt-0.5 space-y-0.5 border-l border-line pl-2.5 ${collapsed ? 'lg:hidden' : ''}`}
                    >
                      {children!.map((c) => (
                        <li key={c.label}>
                          <NavLink
                            to={c.anchor ? { pathname: c.path, hash: c.anchor } : c.path}
                            end
                            onClick={(e) => {
                              onCloseMobile();
                              if (location.pathname !== c.path) {
                                // Trang khác → chuyển tới (mốc đi bằng #id, trang tự cuộn tới khi dựng xong)
                                if (!c.anchor) window.scrollTo({ top: 0 });
                                return;
                              }
                              // Đang ở đúng trang → không đổi URL (giữ bộ lọc), chỉ cuộn
                              e.preventDefault();
                              if (c.anchor)
                                window.dispatchEvent(new CustomEvent(NAV_ANCHOR_EVENT, { detail: c.anchor }));
                              else window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className={({ isActive }) =>
                              `flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                                isActive && (c.anchor ? spy === c.anchor : !spy)
                                  ? 'bg-canvas font-semibold text-primary'
                                  : 'font-medium text-muted hover:bg-canvas hover:text-ink'
                              }`
                            }
                          >
                            <c.icon className="size-4 shrink-0" strokeWidth={1.9} />
                            <span className="truncate">{c.label}</span>
                            {c.pro && !isPro && (
                              <span className="rounded bg-accent-violet/10 px-1.5 text-xs font-semibold leading-5 text-accent-violet">
                                Pro
                              </span>
                            )}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Hồ sơ: dính đáy, luôn hiện */}
        <SidebarProfile collapsed={collapsed} onNavigate={onCloseMobile} />
      </aside>
    </>
  );
}
