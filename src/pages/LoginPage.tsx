import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import BrandLogo from '../components/ui/BrandLogo';
import { useAuth } from '../auth/AuthProvider';
import LoginForm from '../auth/LoginForm';
import RegisterForm from '../auth/RegisterForm';
import { APP_NAME, APP_TAGLINE } from '../config/navigation';

/** Chỉ cho quay về đường dẫn trong app (chặn chuyển hướng ra trang ngoài) */
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/');

/** Trang đăng nhập riêng (link trực tiếp /login); trong app thì dùng hộp đăng nhập */
export default function LoginPage() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  // /login?signup=1 → mở thẳng form Đăng ký dùng thử
  const [registering, setRegistering] = useState(params.get('signup') === '1');

  if (status === 'signedIn') return <Navigate to={next} replace />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <BrandLogo className="size-12" />
          <div>
            <p className="text-xl font-bold leading-tight">{APP_NAME}</p>
            <p className="text-sm text-muted">{APP_TAGLINE}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          {registering ? (
            <RegisterForm onSwitchToLogin={() => setRegistering(false)} />
          ) : (
            <LoginForm onSwitchToRegister={() => setRegistering(true)} />
          )}
        </div>
      </div>
    </main>
  );
}
