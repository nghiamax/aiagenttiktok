import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, KeyRound, LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { ROLE_LABEL } from '../../../shared/permissions';
import { effectivePlan, PLAN_LABEL } from '../../../shared/plans';
import ChangePasswordModal from './ChangePasswordModal';

/** Chữ cái đầu của tên (tối đa 2) */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** Avatar ở header → menu: tên + vai trò · Đổi mật khẩu · Đăng xuất */
export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const admin = user.role === 'owner';
  const pro = effectivePlan(user) === 'pro';
  const item =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-canvas';

  return (
    <div ref={ref} className="relative ml-1 flex items-center gap-2">
      {/* Loại tài khoản hiện luôn cạnh avatar; Miễn phí / Pro bấm → trang Nâng cấp */}
      {admin ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-white">
          <ShieldCheck className="size-3.5" /> ADMIN
        </span>
      ) : (
        <Link
          to="/upgrade"
          title={pro ? 'Gói Pro — xem / gia hạn' : 'Nâng cấp lên Pro'}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition ${
            pro
              ? 'bg-accent-violet text-white hover:opacity-90'
              : 'bg-canvas text-muted ring-1 ring-line hover:bg-accent-violet/10 hover:text-accent-violet'
          }`}
        >
          {pro ? <Crown className="size-3.5" /> : <Sparkles className="size-3.5" />}
          {pro ? 'PRO' : 'FREE · Nâng cấp'}
        </Link>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Tài khoản"
        aria-expanded={open}
        title={user.name}
        className="rounded-full transition hover:shadow-md"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-accent-green to-primary text-sm font-semibold text-white ring-2 ring-white">
          {initials(user.name)}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-60 rounded-2xl border border-line bg-white p-2 shadow-lg">
          <div className="border-b border-line px-3 pb-2 pt-1">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">
              @{user.username} · {ROLE_LABEL[user.role]}
            </p>
            {!admin && (
              <p className={`mt-0.5 text-xs font-medium ${pro ? 'text-accent-violet' : 'text-muted'}`}>
                Gói {PLAN_LABEL[pro ? 'pro' : 'free']}
                {user.role !== 'owner' && user.proUntil && pro
                  ? ` · đến ${new Date(user.proUntil).toLocaleDateString('vi-VN')}`
                  : ''}
              </p>
            )}
          </div>
          <div className="pt-1">
            {!admin && (
              <Link to="/upgrade" className={`${item} text-accent-violet`} onClick={() => setOpen(false)}>
                <Sparkles className="size-4" />
                {pro ? 'Gia hạn gói Pro' : 'Nâng cấp lên Pro'}
              </Link>
            )}
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                setChanging(true);
              }}
            >
              <KeyRound className="size-4 text-muted" />
              Đổi mật khẩu
            </button>
            <button type="button" className={`${item} text-danger`} onClick={() => void logout()}>
              <LogOut className="size-4" />
              Đăng xuất
            </button>
          </div>
        </div>
      )}
      {changing && <ChangePasswordModal onClose={() => setChanging(false)} />}
    </div>
  );
}
