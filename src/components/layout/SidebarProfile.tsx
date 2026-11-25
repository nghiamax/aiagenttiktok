import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Crown, KeyRound, LogIn, LogOut, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
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
 * Hồ sơ cuối sidebar (Sếp chốt 23/11) — 4 phần:
 *  1. Tên hiển thị + gói đang dùng (Miễn phí / Pro; Quản trị viên = Pro)
 *  2. Nâng cấp gói  3. Đổi mật khẩu  4. Đăng xuất
 */
export default function SidebarProfile({ collapsed, onNavigate }: SidebarProfileProps) {
  const { user, logout, promptLogin, promptRegister } = useAuth();
  const [changing, setChanging] = useState(false);
  if (!user) return <GuestProfile collapsed={collapsed} onLogin={() => promptLogin()} onRegister={promptRegister} />;

  const admin = user.role === 'owner';
  const pro = effectivePlan(user) === 'pro';
  const plan = pro
    ? {
        label: 'Gói Pro',
        sub: admin
          ? 'Quản trị viên'
          : user.proUntil
            ? `Dùng đến ${dateVi(user.proUntil)}`
            : 'Không giới hạn thời hạn',
        cls: 'bg-accent-violet text-white',
        dot: 'bg-accent-violet',
        Icon: Crown,
      }
    : {
        label: 'Gói Miễn phí',
        sub: 'Giới hạn lượt tính',
        cls: 'bg-white text-muted ring-1 ring-line',
        dot: 'bg-muted/50',
        Icon: null,
      };
  const upgradeLabel = admin ? 'Xem các gói' : pro ? 'Gia hạn gói' : 'Nâng cấp gói';
  const doLogout = () => {
    onNavigate();
    void logout();
  };

  const avatar = (
    <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-green to-primary text-sm font-semibold text-white">
      {initials(user.name)}
      <span
        className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white ${plan.dot}`}
        aria-hidden="true"
      />
    </span>
  );

  const row = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors';

  return (
    <div className="shrink-0 border-t border-line p-3">
      {/* Sidebar thu gọn (desktop): avatar + icon xếp dọc */}
      <div className={`hidden flex-col items-center gap-1 ${collapsed ? 'lg:flex' : ''}`}>
        <span title={`${user.name} · ${plan.label}`}>{avatar}</span>
        <Link
          to="/upgrade"
          onClick={onNavigate}
          title={upgradeLabel}
          aria-label={upgradeLabel}
          className={`${iconBtn} text-accent-violet hover:bg-accent-violet/10 hover:text-accent-violet`}
        >
          <Sparkles className="size-4" />
        </Link>
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
      <div className={`overflow-hidden rounded-2xl border border-line bg-white ${collapsed ? 'lg:hidden' : ''}`}>
        {/* 1. Tên hiển thị + gói đang dùng */}
        <div className="flex items-center gap-2.5 bg-canvas/70 px-3 py-2.5">
          {avatar}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-ink">{user.name}</span>
              {admin && <ShieldCheck className="size-3.5 shrink-0 text-ink" aria-label="Quản trị viên" />}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5">
              <span
                className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 text-xs font-bold leading-[18px] ${plan.cls}`}
              >
                {plan.Icon && <plan.Icon className="size-3" />}
                {plan.label}
              </span>
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">{plan.sub}</p>
          </div>
        </div>

        <div className="space-y-0.5 p-1.5">
          {/* 2. Nâng cấp gói */}
          <Link
            to="/upgrade"
            onClick={onNavigate}
            className={`${row} ${
              pro ? 'text-accent-violet hover:bg-accent-violet/10' : 'bg-accent-violet text-white hover:opacity-90'
            }`}
          >
            <Sparkles className="size-4 shrink-0" />
            <span className="flex-1">{upgradeLabel}</span>
            <ChevronRight className="size-4 shrink-0 opacity-60" />
          </Link>
          {/* 3. Đổi mật khẩu */}
          <button
            type="button"
            onClick={() => setChanging(true)}
            className={`${row} text-ink/80 hover:bg-canvas hover:text-ink`}
          >
            <KeyRound className="size-4 shrink-0 text-muted" />
            <span className="flex-1">Đổi mật khẩu</span>
          </button>
          {/* 4. Đăng xuất */}
          <button type="button" onClick={doLogout} className={`${row} text-danger hover:bg-danger/10`}>
            <LogOut className="size-4 shrink-0" />
            <span className="flex-1">Đăng xuất</span>
          </button>
        </div>
      </div>

      {changing && <ChangePasswordModal onClose={() => setChanging(false)} />}
    </div>
  );
}

/** Chưa đăng nhập: "Chưa đăng nhập" + nút Đăng ký dùng thử + Đăng nhập (thay thẻ hồ sơ) */
function GuestProfile({ collapsed, onLogin, onRegister }: { collapsed: boolean; onLogin: () => void; onRegister: () => void }) {
  return (
    <div className="shrink-0 border-t border-line p-3">
      <div className={`hidden flex-col items-center gap-1 ${collapsed ? 'lg:flex' : ''}`}>
        <button
          type="button"
          onClick={onLogin}
          title="Đăng nhập"
          aria-label="Đăng nhập"
          className="flex size-10 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary-hover"
        >
          <LogIn className="size-4" />
        </button>
        <button
          type="button"
          onClick={onRegister}
          title="Đăng ký dùng thử"
          aria-label="Đăng ký dùng thử"
          className={`${iconBtn} text-accent-violet hover:bg-accent-violet/10 hover:text-accent-violet`}
        >
          <Sparkles className="size-4" />
        </button>
      </div>
      <div className={`rounded-2xl border border-line bg-white p-3 ${collapsed ? 'lg:hidden' : ''}`}>
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas text-muted">
            <UserRound className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Chưa đăng nhập</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRegister}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-violet px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <Sparkles className="size-4" />
          Đăng ký dùng thử
        </button>
        <button
          type="button"
          onClick={onLogin}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink transition hover:bg-canvas"
        >
          <LogIn className="size-4" />
          Đăng nhập
        </button>
      </div>
    </div>
  );
}
