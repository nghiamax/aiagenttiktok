import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/authContext';

/* Đăng nhập Seller Center (TikTok Shop / Shopee) bằng trình duyệt trên máy chạy server — xem server/sellerBrowser/session.ts */

export type SellerPlatform = 'tiktok' | 'shopee';

export interface SellerState {
  platform: SellerPlatform;
  status: 'none' | 'waiting_login' | 'logged_in';
  open: boolean;
  loggedInAt: string | null;
  lastOpenAt: string | null;
  error: string | null;
}

export interface SellerDownload {
  id: string;
  name: string;
  size: number;
  at: string;
}

export const SELLER_LABEL: Record<SellerPlatform, string> = {
  tiktok: 'TikTok Seller Center',
  shopee: 'Shopee Kênh Người Bán',
};

/** Trạng thái 1 sàn; cửa sổ đang mở / chờ đăng nhập → hỏi lại mỗi 2 giây */
export function useSeller(platform: SellerPlatform) {
  const { guest } = useAuth();
  const [state, setState] = useState<SellerState | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ enabled: boolean; platforms: SellerState[] }>('/seller/status');
      setEnabled(r.enabled);
      setState(r.platforms.find((p) => p.platform === platform) ?? null);
    } catch {
      /* server tắt → giữ trạng thái cũ */
    }
  }, [platform]);

  const active = !!state?.open || state?.status === 'waiting_login';
  useEffect(() => {
    if (guest) return; // chế độ khách: không hỏi server
    void load();
    const t = setInterval(() => void load(), active ? 2000 : 10_000);
    return () => clearInterval(t);
  }, [load, active, guest]);

  const run = useCallback(
    async (path: string, body: unknown = {}) => {
      setBusy(true);
      setError(null);
      try {
        const r = await api<{ state: SellerState }>(`/seller/${platform}/${path}`, { method: 'POST', body });
        setState(r.state);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Không thực hiện được');
      } finally {
        setBusy(false);
      }
    },
    [platform],
  );

  return {
    state,
    enabled,
    busy,
    error: error ?? state?.error ?? null,
    open: () => run('open'),
    close: () => run('close'),
    logout: () => run('logout', { confirm: true }),
    reload: load,
  };
}

/** Tải 1 file đã bắt được về trình duyệt web (để bộ đọc file hiện có xử lý) */
export async function fetchSellerFile(platform: SellerPlatform, d: SellerDownload): Promise<File> {
  const res = await fetch(`/api/seller/${platform}/downloads/${encodeURIComponent(d.id)}`);
  if (!res.ok) throw new Error(`${d.name}: không tải được từ server`);
  return new File([await res.blob()], d.name);
}
