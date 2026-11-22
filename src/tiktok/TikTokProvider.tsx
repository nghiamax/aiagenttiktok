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

/** Đang chờ người dùng cho phép trên TikTok (tab mới / trình duyệt khác) */
export interface PendingConnect {
  authUrl: string;
  startedAt: number;
  /** connectedAt lúc bấm — đổi = vừa kết nối xong (cả trường hợp Kết nối lại) */
  prevConnectedAt: string | null;
  expired: boolean;
}

interface TikTokValue {
  /** null = chưa tải được (server chưa chạy / đang tải) */
  status: TikTokStatus | null;
  /** Đã thử đọc trạng thái ít nhất 1 lần (thành công hay lỗi) */
  checked: boolean;
  refresh: () => Promise<void>;
  /** Mở trang TikTok ở tab mới rồi chờ; trả lỗi nếu không mở được */
  connect: () => Promise<string | null>;
  connecting: boolean;
  pending: PendingConnect | null;
  /** Mở lại link TikTok đang chờ ở tab mới */
  reopen: () => void;
  cancelPending: () => void;
}

const TikTokContext = createContext<TikTokValue | null>(null);
/** Kiểm tra lại mỗi 5 phút (biết sớm khi TikTok từ chối gia hạn) */
const POLL_MS = 5 * 60_000;
/** Đang chờ cho phép → kiểm tra mỗi 3 giây, tối đa bằng hạn link (10 phút) */
const PENDING_POLL_MS = 3000;
const PENDING_MAX_MS = 10 * 60_000;
/** Đánh dấu "vừa kết nối xong" để sau khi tải lại trang hiện dải xanh */
export const JUST_CONNECTED_KEY = 'tiktok-just-connected';

export function TikTokProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TikTokStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState<PendingConnect | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api<TikTokStatus>('/ads/status');
      setStatus(s);
      return s;
    } catch {
      return null; // server chưa chạy — giữ trạng thái cũ
    } finally {
      setChecked(true);
    }
  }, []);
  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    // Quay lại tab (vd vừa cho phép TikTok ở trình duyệt / tab khác) → đọc lại ngay
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [load]);

  // Đang chờ cho phép: kiểm tra mỗi 3 giây; kết nối xong → tải lại cả trang (số liệu mới, Sếp chốt)
  useEffect(() => {
    if (!pending || pending.expired) return;
    const t = setInterval(async () => {
      if (Date.now() - pending.startedAt > PENDING_MAX_MS) {
        setPending((p) => (p ? { ...p, expired: true } : p));
        return;
      }
      const s = await load();
      if (s?.state === 'connected' && s.connectedAt && s.connectedAt !== pending.prevConnectedAt) {
        try {
          sessionStorage.setItem(JUST_CONNECTED_KEY, '1');
        } catch {
          /* bỏ qua */
        }
        window.location.reload();
      }
    }, PENDING_POLL_MS);
    return () => clearInterval(t);
  }, [pending, load]);

  const connect = useCallback(async () => {
    // Mở tab ngay lúc bấm (chờ server trả link rồi mới mở thì trình duyệt chặn popup)
    const tab = window.open('', '_blank');
    setConnecting(true);
    try {
      const { authUrl } = await api<{ authUrl: string }>('/tiktok/connect', { method: 'POST', body: {} });
      setPending({ authUrl, startedAt: Date.now(), prevConnectedAt: status?.connectedAt ?? null, expired: false });
      if (tab) tab.location.href = authUrl;
      else window.location.href = authUrl; // trình duyệt chặn tab mới → mở ngay tại tab này
      return null;
    } catch (e) {
      tab?.close();
      return e instanceof ApiError ? e.message : 'Không mở được đăng nhập TikTok';
    } finally {
      setConnecting(false);
    }
  }, [status?.connectedAt]);

  const reopen = useCallback(() => {
    if (pending) window.open(pending.authUrl, '_blank');
  }, [pending]);
  const cancelPending = useCallback(() => setPending(null), []);

  const value = useMemo(
    () => ({ status, checked, refresh, connect, connecting, pending, reopen, cancelPending }),
    [status, checked, refresh, connect, connecting, pending, reopen, cancelPending],
  );
  return <TikTokContext.Provider value={value}>{children}</TikTokContext.Provider>;
}

export function useTikTok(): TikTokValue {
  const ctx = useContext(TikTokContext);
  if (!ctx) throw new Error('useTikTok phải nằm trong TikTokProvider');
  return ctx;
}
