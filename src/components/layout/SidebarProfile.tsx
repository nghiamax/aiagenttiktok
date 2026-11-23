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

const iconBtn =
  'flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink';

/**
 * Hồ sơ cuối sidebar (Sếp chốt 23/11, thay menu avatar ở góc phải header) — gói trong 1 thẻ:
 * avatar + tên + nhãn gói · nút Nâng cấp / Gia hạn (khách) · hàng Đổi mật khẩu | Đăng xuất.
 */
export default function SidebarProfile({ collapsed, onNavigate }: SidebarProfileProps) {
  const { user, logout } = useAuth();
  const [changing, setChanging] = useState(false);
  if (!user) return null;

  const admin = user.role === 'owner';
  const pro = effectivePlan(user) === 'pro';
  const badge = admin
    ? { text: 'ADMIN', cls: 'bg-ink text-white', dot: 'bg-ink', Icon: ShieldCheck }
    : pro
      ? { text: 'PRO', cls: 'bg-accent-violet text-white', dot: 'bg-accent-violet', Icon: Crown }
      : { text: 'FREE', cls: 'bg-white text-muted ring-1 ring-line', dot: 'bg-muted/50', Icon: null };
  const upgradeLabel = pro ? 'Gia hạn Pro' : 'Nâng cấp lên Pro';
  const doLogout = () => {
    onNavigate();
    void logout();
  };

  const avatar = (
    <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-green to-primary text-sm font-semibold text-white">
      {initials(user.name)}
      <span
        className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white ${badge.dot}`}
        aria-hidden="true"
      />
    </span>
  );

  return (
    <div className="shrink-0 border-t border-line p-3">
      {/* Sidebar thu gọn (desktop): avatar + icon xếp dọc */}
      <div className={`hidden flex-col items-center gap-1 ${collapsed ? 'lg:flex' : ''}`}>
        <span title={`${user.name} · ${ROLE_LABEL[user.role]} · ${badge.text}`}>{avatar}</span>
        {!admin && (
          <Link
            to="/upgrade"
            onClick={onNavigate}
            title={upgradeLabel}
            aria-label={upgradeLabel}
            className={`${iconBtn} text-accent-violet hover:bg-accent-violet/10 hover:text-accent-violet`}
          >
            <Sparkles className="size-4" />
          </Link>
        )}
        <button
          type="button"
          onClick={() => setChanging(true)}
          title="Đổi mật khẩu"
          aria-label="Đổi mật khẩu"
          className={iconBtn}
        >
          <KeyRound className="size-4" />
        </button>
        <button
          type="button"
          onClick={doLogout}
          title="Đăng xuất"
          aria-label="Đăng xuất"
          className={`${iconBtn} hover:bg-danger/10 hover:text-danger`}
        >
          <LogOut className="size-4" />
        </button>
      </div>

      {/* Thẻ hồ sơ đầy đủ */}
      <div className={`rounded-2xl border border-line bg-canvas/60 p-2.5 ${collapsed ? 'lg:hidden' : ''}`}>
        <div className="flex items-center gap-2.5 px-0.5">
          {avatar}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-ink">{user.name}</span>
              <span
                className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 text-xs font-bold leading-[18px] ${badge.cls}`}
              >
                {badge.Icon && <badge.Icon className="size-3" />}
                {badge.text}
              </span>
            </div>
            <p className="truncate text-xs text-muted">
              @{user.username} · {ROLE_LABEL[user.role]}
            </p>
          </div>
        </div>

        {!admin && (
          <Link
            to="/upgrade"
            onClick={onNavigate}
            className={`mt-2.5 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              pro
                ? 'bg-accent-violet/10 text-accent-violet hover:bg-accent-violet/15'
                : 'bg-accent-violet text-white shadow-sm hover:opacity-90'
            }`}
          >
            <Sparkles className="size-4" />
            {upgradeLabel}
            {pro && user.proUntil && <span className="font-medium opacity-80">· đến {dateVi(user.proUntil)}</span>}
          </Link>
        )}

        <div className="mt-2 grid grid-cols-2 gap-1 border-t border-line pt-2">
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-white hover:text-ink"
          >
            <KeyRound className="size-3.5" /> Đổi mật khẩu
          </button>
          <button
            type="button"
            onClick={doLogout}
            className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <LogOut className="size-3.5" /> Đăng xuất
          </button>
        </div>
      </div>

      {changing && <ChangePasswordModal onClose={() => setChanging(false)} />}
    </div>
  );
}
