import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';

/* Trạng thái kết nối server ↔ TikTok (GET /api/ads/status) + nút Kết nối TikTok (POST /api/tiktok/connect) */

/** never = chưa từng kết nối · lost = mất kết nối (TikTok từ chối gia hạn) */
export type TikTokState = 'never' | 'connected' | 'lost';

export interface TikTokStatus {
  state: TikTokState;
  connected: boolean;
  expiresAt: string | null;
  canRefresh: boolean;
  connectedAt: string | null;
  connectedBy: string | null;
  refreshedAt: string | null;
  refreshFailedAt: string | null;
  advertiser: { id: string; name: string };
}

interface TikTokValue {
  /** null = chưa tải được (server chưa chạy / đang tải) */
  status: TikTokStatus | null;
  /** Đã thử đọc trạng thái ít nhất 1 lần (thành công hay lỗi) */
  checked: boolean;
  refresh: () => Promise<void>;
  /** Chuyển trang sang đăng nhập TikTok; trả lỗi nếu không mở được */
  connect: () => Promise<string | null>;
  connecting: boolean;
}

const TikTokContext = createContext<TikTokValue | null>(null);
/** Kiểm tra lại mỗi 5 phút (biết sớm khi TikTok từ chối gia hạn) */
const POLL_MS = 5 * 60_000;

export function TikTokProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TikTokStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api<TikTokStatus>('/ads/status'));
    } catch {
      /* server chưa chạy — giữ trạng thái cũ */
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    // Quay lại tab (vd vừa cho phép TikTok ở trình duyệt / tab khác) → đọc lại ngay
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { authUrl } = await api<{ authUrl: string }>('/tiktok/connect', { method: 'POST', body: {} });
      window.location.href = authUrl;
      return null;
    } catch (e) {
      setConnecting(false);
      return e instanceof ApiError ? e.message : 'Không mở được đăng nhập TikTok';
    }
  }, []);

  const value = useMemo(() => ({ status, checked, refresh, connect, connecting }), [status, checked, refresh, connect, connecting]);
  return <TikTokContext.Provider value={value}>{children}</TikTokContext.Provider>;
}

export function useTikTok(): TikTokValue {
  const ctx = useContext(TikTokContext);
  if (!ctx) throw new Error('useTikTok phải nằm trong TikTokProvider');
  return ctx;
}
