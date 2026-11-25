import { useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { ApiError } from '../lib/api';
import { useAuth } from './authContext';

const INPUT =
  'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

interface LoginFormProps {
  /** Câu dưới tiêu đề (vd lý do phải đăng nhập) */
  subtitle?: string;
  onSuccess?: () => void;
  /** Chưa có tài khoản → mở form Đăng ký dùng thử */
  onSwitchToRegister?: () => void;
}

/** Form đăng nhập dùng chung: trang /login và hộp đăng nhập (chế độ khách) */
export default function LoginForm({
  subtitle = 'Dùng tài khoản được cấp để vào trang quản lý.',
  onSuccess,
  onSwitchToRegister,
}: LoginFormProps) {
  const { status, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Nhập tên đăng nhập và mật khẩu');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'NETWORK'
            ? 'Không kết nối được server — kiểm tra server đã chạy chưa'
            : err.message
          : 'Đăng nhập không thành công',
      );
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-bold">Đăng nhập</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>

      {status === 'offline' && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          Chưa kết nối được server — đang thử lại…
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Tên đăng nhập</span>
        <input
          className={INPUT}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Mật khẩu</span>
        <span className="relative block">
          <input
            className={`${INPUT} pr-11`}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
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
      </label>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-white transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
        {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
      {onSwitchToRegister && (
        <p className="text-center text-sm text-muted">
          Chưa có tài khoản?{' '}
          <button type="button" onClick={onSwitchToRegister} className="font-semibold text-accent-violet hover:underline">
            Đăng ký dùng thử
          </button>
        </p>
      )}
      <p className="text-center text-xs text-muted">Quên mật khẩu? Liên hệ người quản trị để đặt lại.</p>
    </form>
  );
}
