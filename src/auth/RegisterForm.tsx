import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { MIN_PASSWORD_LENGTH } from '../../shared/permissions';
import { api, ApiError } from '../lib/api';
import { useAuth } from './authContext';

const INPUT =
  'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

interface RegisterFormProps {
  onSuccess?: () => void;
  /** Đã có tài khoản → về form đăng nhập */
  onSwitchToLogin: () => void;
}

/** Đăng ký dùng thử: tài khoản khách riêng + gói Pro TRIAL_DAYS ngày, đăng nhập luôn */
export default function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Server tắt đăng ký (SIGNUP=off) */
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    api<{ signup: boolean }>('/auth/options')
      .then((o) => setClosed(!o.signup))
      .catch(() => undefined);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const u = username.trim().toLowerCase();
    if (!name.trim() || !u || !password) return setError('Nhập đủ tên hiển thị, tên đăng nhập và mật khẩu');
    if (!/^[a-z0-9._-]{3,32}$/.test(u)) return setError('Tên đăng nhập 3–32 ký tự: chữ thường không dấu, số, . _ -');
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
    if (password !== confirm) return setError('Hai lần nhập mật khẩu chưa khớp');
    setBusy(true);
    setError(null);
    try {
      await register({ name: name.trim(), username: u, password });
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'NETWORK'
            ? 'Không kết nối được server — thử lại sau'
            : err.message
          : 'Đăng ký không thành công',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-bold">Đăng ký dùng thử</h1>
        <p className="mt-1 text-sm text-muted">Tạo tài khoản trong 1 phút, không cần thẻ thanh toán.</p>
      </div>

      {closed && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          Hiện chưa mở đăng ký — liên hệ quản trị viên để được cấp tài khoản.
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Tên hiển thị</span>
        <input
          className={INPUT}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên bạn hoặc tên shop"
          autoComplete="name"
          maxLength={60}
          autoFocus
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Tên đăng nhập</span>
        <input
          className={INPUT}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="vd: shopcuatoi"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={32}
        />
        <span className="block text-xs text-muted">Chữ thường không dấu, số, dấu . _ - (3–32 ký tự)</span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Mật khẩu</span>
        <span className="relative block">
          <input
            className={`${INPUT} pr-11`}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            className="absolute inset-y-0 right-1 my-1 flex w-9 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </span>
        <span className="block text-xs text-muted">Ít nhất {MIN_PASSWORD_LENGTH} ký tự</span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Nhập lại mật khẩu</span>
        <input
          className={INPUT}
          type={showPassword ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </label>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || closed}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-violet px-4 py-2.5 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {busy ? 'Đang tạo tài khoản…' : 'Đăng ký'}
      </button>
      <p className="text-center text-sm text-muted">
        Đã có tài khoản?{' '}
        <button type="button" onClick={onSwitchToLogin} className="font-semibold text-primary hover:underline">
          Đăng nhập
        </button>
      </p>
    </form>
  );
}
