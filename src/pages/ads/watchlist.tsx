import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthProvider';

/* Ô "Đang theo dõi" — video tự thêm (server: /api/watchlist, dùng chung mọi người dùng của shop) */

export interface WatchItem {
  videoId: string;
  note?: string;
  addedAt: string;
  addedBy?: { id: string; name: string };
}

interface WatchValue {
  items: WatchItem[];
  has: (videoId: string) => boolean;
  /** Thêm bằng mã video hoặc link TikTok; trả lỗi (null = thành công) */
  add: (video: string, note?: string) => Promise<string | null>;
  remove: (videoId: string) => Promise<void>;
  /** Có quyền thêm / bỏ (configure) */
  canEdit: boolean;
}

const WatchContext = createContext<WatchValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const { can, guest } = useAuth();
  const canEdit = can('configure');

  useEffect(() => {
    if (guest) return; // chế độ khách: danh sách trống, không gọi API
    api<{ items: WatchItem[] }>('/watchlist')
      .then((r) => setItems(r.items))
      .catch(() => undefined);
  }, [guest]);

  const add = useCallback(async (video: string, note?: string) => {
    try {
      const r = await api<{ items: WatchItem[] }>('/watchlist', { method: 'POST', body: { video, note } });
      setItems(r.items);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Không thêm được';
    }
  }, []);

  const remove = useCallback(async (videoId: string) => {
    try {
      const r = await api<{ items: WatchItem[] }>(`/watchlist/${encodeURIComponent(videoId)}`, { method: 'DELETE' });
      setItems(r.items);
    } catch {
      /* giữ nguyên */
    }
  }, []);

  const value = useMemo<WatchValue>(() => {
    const ids = new Set(items.map((i) => i.videoId));
    return { items, has: (id) => ids.has(id), add, remove, canEdit };
  }, [items, add, remove, canEdit]);

  return <WatchContext.Provider value={value}>{children}</WatchContext.Provider>;
}

export function useWatchlist(): WatchValue {
  const ctx = useContext(WatchContext);
  if (!ctx) throw new Error('useWatchlist phải nằm trong WatchlistProvider');
  return ctx;
}
