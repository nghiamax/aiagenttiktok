import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2, LogIn, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { APP_NAME, APP_TAGLINE } from '../config/navigation';
import { ApiError } from '../lib/api';

/** Chỉ cho quay về đường dẫn trong app (chặn chuyển hướng ra trang ngoài) */
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/ads');

const INPUT =
  'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

/** Trang đăng nhập web (ngoài khung AppLayout) */
export default function LoginPage() {
  const { status, login } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'signedIn') return <Navigate to={next} replace />;

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
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent-violet text-white shadow-sm">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="text-xl font-bold leading-tight">{APP_NAME}</p>
            <p className="text-sm text-muted">{APP_TAGLINE}</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm" noValidate>
          <div>
            <h1 className="text-xl font-bold">Đăng nhập</h1>
            <p className="mt-1 text-sm text-muted">Dùng tài khoản được cấp để vào trang quản lý.</p>
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
        </form>

        <p className="mt-4 text-center text-xs text-muted">Quên mật khẩu? Liên hệ người quản trị để đặt lại.</p>
      </div>
    </main>
  );
}
