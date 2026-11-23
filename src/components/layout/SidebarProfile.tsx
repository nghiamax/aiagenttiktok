import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, KeyRound, LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { ROLE_LABEL } from '../../../shared/permissions';
import { effectivePlan } from '../../../shared/plans';
import ChangePasswordModal from './ChangePasswordModal';

interface SidebarProfileProps {
  collapsed: boolean;
  /** Đóng drawer trên mobile khi bấm 1 mục */
  onNavigate: () => void;
}

/** Chữ cái đầu của tên (tối đa 2) */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

const dateVi = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

/**
 * Mục "Hồ sơ" cuối sidebar (Sếp chốt 23/11, thay menu avatar ở góc phải header):
 * avatar + tên + vai trò + nhãn gói, rồi các mục Nâng cấp gói · Đổi mật khẩu · Đăng xuất hiện thẳng.
 */
export default function SidebarProfile({ collapsed, onNavigate }: SidebarProfileProps) {
  const { user, logout } = useAuth();
  const [changing, setChanging] = useState(false);
  if (!user) return null;

  const admin = user.role === 'owner';
  const pro = effectivePlan(user) === 'pro';
  const badge = admin
    ? { text: 'ADMIN', cls: 'bg-ink text-white', Icon: ShieldCheck }
    : pro
      ? { text: 'PRO', cls: 'bg-accent-violet text-white', Icon: Crown }
      : { text: 'FREE', cls: 'bg-canvas text-muted ring-1 ring-line', Icon: null };
  const upgradeLabel = pro
    ? `Gia hạn Pro${user.proUntil ? ` · đến ${dateVi(user.proUntil)}` : ''}`
    : 'Nâng cấp lên Pro';

  const item = `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
    collapsed ? 'lg:justify-center lg:px-0' : ''
  }`;
  const text = `truncate ${collapsed ? 'lg:hidden' : ''}`;

  return (
    <div className="shrink-0 border-t border-line px-3 pb-2 pt-3">
      <p
        className={`mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted ${collapsed ? 'lg:hidden' : ''}`}
      >
        Hồ sơ
      </p>

      {/* Avatar + tên + vai trò + nhãn gói */}
      <div
        title={collapsed ? `${user.name} · ${ROLE_LABEL[user.role]} · ${badge.text}` : undefined}
        className={`flex items-center gap-3 rounded-xl bg-canvas/70 px-3 py-2.5 ${collapsed ? 'lg:justify-center lg:bg-transparent lg:px-0' : ''}`}
      >
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-green to-primary text-sm font-semibold text-white">
          {initials(user.name)}
          {collapsed && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 hidden size-3 rounded-full ring-2 ring-white lg:block ${
                admin ? 'bg-ink' : pro ? 'bg-accent-violet' : 'bg-muted/50'
              }`}
              aria-hidden="true"
            />
          )}
        </span>
        <span className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-ink">{user.name}</span>
            <span
              className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 text-xs font-bold leading-5 ${badge.cls}`}
            >
              {badge.Icon && <badge.Icon className="size-3" />}
              {badge.text}
            </span>
          </span>
          <span className="block truncate text-xs text-muted">
            @{user.username} · {ROLE_LABEL[user.role]}
          </span>
        </span>
      </div>

      <ul className="mt-1.5 space-y-0.5">
        {!admin && (
          <li>
            <Link
              to="/upgrade"
              onClick={onNavigate}
              title={collapsed ? upgradeLabel : undefined}
              aria-label={upgradeLabel}
              className={`${item} text-accent-violet hover:bg-accent-violet/10`}
            >
              <Sparkles className="size-4 shrink-0" />
              <span className={text}>{upgradeLabel}</span>
            </Link>
          </li>
        )}
        <li>
          <button
            type="button"
            onClick={() => setChanging(true)}
            title={collapsed ? 'Đổi mật khẩu' : undefined}
            aria-label="Đổi mật khẩu"
            className={`${item} text-muted hover:bg-canvas hover:text-ink`}
          >
            <KeyRound className="size-4 shrink-0" />
            <span className={text}>Đổi mật khẩu</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => {
              onNavigate();
              void logout();
            }}
            title={collapsed ? 'Đăng xuất' : undefined}
            aria-label="Đăng xuất"
            className={`${item} text-danger hover:bg-danger/10`}
          >
            <LogOut className="size-4 shrink-0" />
            <span className={text}>Đăng xuất</span>
          </button>
        </li>
      </ul>

      {changing && <ChangePasswordModal onClose={() => setChanging(false)} />}
    </div>
  );
}
