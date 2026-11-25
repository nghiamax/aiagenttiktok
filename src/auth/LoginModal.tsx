import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

export type AuthMode = 'login' | 'register';

interface LoginModalProps {
  mode: AuthMode;
  reason: string;
  onClose: () => void;
}

/** Hộp Đăng nhập / Đăng ký dùng thử khi đang xem app ở chế độ khách — xong thì ở nguyên trang */
export default function LoginModal({ mode: initialMode, reason, onClose }: LoginModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  useEffect(() => setMode(initialMode), [initialMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'login' ? 'Đăng nhập' : 'Đăng ký dùng thử'}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink"
        >
          <X className="size-5" />
        </button>
        {mode === 'login' ? (
          <LoginForm subtitle={reason} onSuccess={onClose} onSwitchToRegister={() => setMode('register')} />
        ) : (
          <RegisterForm onSuccess={onClose} onSwitchToLogin={() => setMode('login')} />
        )}
      </div>
    </div>
  );
}
