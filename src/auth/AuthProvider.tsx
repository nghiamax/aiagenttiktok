import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, AUTH_REQUIRED_EVENT } from '../lib/api';
import { can as roleCan, type Permission, type PublicUser } from '../../shared/permissions';

/* Phiên đăng nhập web: tải /api/auth/me lúc mở trang; API trả AUTH_REQUIRED → về trang đăng nhập */

type AuthStatus = 'loading' | 'signedIn' | 'signedOut' | 'offline';

interface AuthValue {
  status: AuthStatus;
  user: PublicUser | null;
  /** Kiểm tra quyền — dùng để mờ nút; server vẫn kiểm tra lại */
  can: (p: Permission) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

interface MeResponse {
  user: PublicUser;
  permissions: Permission[];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api<MeResponse>('/auth/me');
      setUser(me.user);
      setStatus('signedIn');
    } catch (e) {
      setUser(null);
      setStatus(e instanceof ApiError && e.code === 'NETWORK' ? 'offline' : 'signedOut');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onRequired = () => {
      setUser(null);
      setStatus('signedOut');
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onRequired);
  }, [refresh]);

  // Server tắt lúc mở trang → thử lại mỗi 5 giây
  useEffect(() => {
    if (status !== 'offline') return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [status, refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const me = await api<MeResponse>('/auth/login', { method: 'POST', body: { username, password } });
    setUser(me.user);
    setStatus('signedIn');
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ status, user, can: (p) => roleCan(user?.role, p), login, logout, refresh }),
    [status, user, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth cần nằm trong AuthProvider');
  return v;
}

/** Lý do không bấm được vì thiếu quyền (null = được) — dùng cho tooltip nút */
export function useNoPermission(p: Permission): string | null {
  const { can } = useAuth();
  return can(p) ? null : 'Tài khoản không có quyền';
}
