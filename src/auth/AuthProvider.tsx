import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import LoginModal, { type AuthMode } from './LoginModal';
import { api, ApiError, AUTH_REQUIRED_EVENT } from '../lib/api';
import { can as roleCan, type Permission, type PublicUser } from '../../shared/permissions';
import { AuthContext, type AuthStatus, type AuthValue } from './authContext';

export { useAuth, useNoPermission } from './authContext';

/*
 * Phiên đăng nhập web: tải /api/auth/me lúc mở trang.
 * Chưa đăng nhập = CHẾ ĐỘ KHÁCH: vẫn ở trong app, các ô không có dữ liệu (provider không gọi API), bấm chức năng → hộp đăng nhập.
 * API trả AUTH_REQUIRED (phiên hết hạn) → về chế độ khách + mở hộp đăng nhập.
 */

const DEFAULT_PROMPT = 'Đăng nhập để dùng chức năng này và xem số liệu shop.';
const EXPIRED_TEXT = 'Phiên đăng nhập đã hết — đăng nhập lại để tiếp tục.';

interface MeResponse {
  user: PublicUser;
  permissions: Permission[];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const statusRef = useRef(status);
  statusRef.current = status;
  const [user, setUser] = useState<PublicUser | null>(null);
  /** Hộp đăng nhập / đăng ký đang mở; null = đóng */
  const [prompt, setPrompt] = useState<{ mode: AuthMode; reason: string } | null>(null);

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
      // Đang đăng nhập mà server báo hết phiên → về chế độ khách + mở hộp đăng nhập lại
      if (statusRef.current === 'signedIn') setPrompt({ mode: 'login', reason: EXPIRED_TEXT });
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

  const register = useCallback(async (input: { name: string; username: string; password: string }) => {
    const me = await api<MeResponse>('/auth/register', { method: 'POST', body: input });
    setUser(me.user);
    setStatus('signedIn');
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const promptLogin = useCallback((reason?: string) => setPrompt({ mode: 'login', reason: reason ?? DEFAULT_PROMPT }), []);
  const promptRegister = useCallback(() => setPrompt({ mode: 'register', reason: DEFAULT_PROMPT }), []);
  const closePrompt = useCallback(() => setPrompt(null), []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      guest: status !== 'signedIn',
      promptLogin,
      promptRegister,
      can: (p) => roleCan(user?.role, p),
      login,
      register,
      logout,
      refresh,
    }),
    [status, user, promptLogin, promptRegister, login, register, logout, refresh],
  );
  return (
    <AuthContext.Provider value={value}>
      {children}
      {prompt && status !== 'signedIn' && (
        <LoginModal mode={prompt.mode} reason={prompt.reason} onClose={closePrompt} />
      )}
    </AuthContext.Provider>
  );
}
