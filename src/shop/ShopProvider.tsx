import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';

/* Shop của tài khoản đang đăng nhập (GET /api/shops): mỗi shop có kết nối TikTok + dữ liệu ADS riêng */

export interface Shop {
  id: string;
  name: string;
  createdAt: string;
}

interface ShopValue {
  shops: Shop[];
  current: Shop | null;
  /** Đã tải danh sách ít nhất 1 lần */
  loaded: boolean;
  /** Đổi shop đang mở → tải lại trang (mọi số liệu / Agent theo shop mới) */
  switchShop: (id: string) => Promise<string | null>;
  /** Tạo shop mới rồi mở luôn; trả lỗi (null = xong) */
  createShop: (name: string) => Promise<string | null>;
}

const ShopContext = createContext<ShopValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<{ shops: Shop[]; currentShopId: string | null }>('/shops')
      .then((r) => {
        setShops(r.shops);
        // Phiên chưa mở shop nào mà tài khoản có shop → mở shop đầu tiên
        if (!r.currentShopId && r.shops.length > 0) {
          void api('/shops/current', { method: 'POST', body: { shopId: r.shops[0].id } }).then(() => window.location.reload());
          return;
        }
        setCurrentId(r.currentShopId);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const switchShop = useCallback(async (id: string) => {
    try {
      await api('/shops/current', { method: 'POST', body: { shopId: id } });
      window.location.reload();
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Không đổi được shop';
    }
  }, []);

  const createShop = useCallback(async (name: string) => {
    try {
      await api('/shops', { method: 'POST', body: { name } });
      window.location.reload();
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Không tạo được shop';
    }
  }, []);

  const value = useMemo<ShopValue>(
    () => ({ shops, current: shops.find((s) => s.id === currentId) ?? null, loaded, switchShop, createShop }),
    [shops, currentId, loaded, switchShop, createShop],
  );
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop phải nằm trong ShopProvider');
  return ctx;
}
