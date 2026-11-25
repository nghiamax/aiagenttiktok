import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthProvider';
import type { FinanceQuota } from '../../../shared/plans';

/* Gói + lượt Tính giá bán của tài khoản đang đăng nhập (server đếm, web chỉ hiển thị) */

interface QuotaValue {
  /** null = đang tải / không tải được */
  quota: FinanceQuota | null;
  loading: boolean;
  /** Ghi 1 lượt tính → true nếu được tính (Pro luôn true) */
  consume: () => Promise<boolean>;
  reload: () => Promise<void>;
}

const QuotaContext = createContext<QuotaValue | null>(null);

export function FinanceQuotaProvider({ children }: { children: ReactNode }) {
  const { guest } = useAuth();
  const [quota, setQuota] = useState<FinanceQuota | null>(null);
  // Chế độ khách: không có lượt, không gọi API (quota null → không đếm lượt)
  const [loading, setLoading] = useState(!guest);

  const reload = useCallback(async () => {
    try {
      setQuota((await api<{ quota: FinanceQuota }>('/finance/quota')).quota);
    } catch {
      /* server tắt → giữ số cũ */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!guest) void reload();
  }, [reload, guest]);

  const consume = useCallback(async () => {
    try {
      setQuota((await api<{ quota: FinanceQuota }>('/finance/calc', { method: 'POST', body: {} })).quota);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'QUOTA_EXCEEDED') void reload();
      return false;
    }
  }, [reload]);

  const value = useMemo(() => ({ quota, loading, consume, reload }), [quota, loading, consume, reload]);
  return <QuotaContext.Provider value={value}>{children}</QuotaContext.Provider>;
}

export function useFinanceQuota(): QuotaValue {
  const v = useContext(QuotaContext);
  if (!v) throw new Error('useFinanceQuota cần nằm trong FinanceQuotaProvider');
  return v;
}
