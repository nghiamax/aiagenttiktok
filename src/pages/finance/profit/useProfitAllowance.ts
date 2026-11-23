import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { FinanceQuota } from '../../../../shared/plans';
import { useFinanceQuota } from '../useFinanceQuota';

/**
 * Gói Miễn phí: hỏi server mã đơn nào được tính (tối đa FREE_PROFIT_ORDERS đơn, mỗi mã đếm 1 lần).
 * allowed = null → tính hết (Pro / server không trả lời được); ready = false → đang hỏi.
 */
export function useProfitAllowance(orderIds: string[]) {
  const { quota, reload } = useFinanceQuota();
  const [allowed, setAllowed] = useState<Set<string> | null>(null);
  const [ready, setReady] = useState(false);
  const unlimited = !!quota?.unlimited;
  const key = orderIds.join(',');

  useEffect(() => {
    if (!quota) return;
    if (unlimited || orderIds.length === 0) {
      setAllowed(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ allowed: string[] | null; quota: FinanceQuota }>('/finance/profit-orders', {
          method: 'POST',
          body: { orderIds },
        });
        if (cancelled) return;
        setAllowed(r.allowed ? new Set(r.allowed) : null);
        void reload();
      } catch {
        // Không hỏi được server → không tính đơn nào mới (tránh vượt giới hạn)
        if (!cancelled) setAllowed(new Set());
      } finally {
        if (!cancelled) setReady(true);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // key thay cho orderIds (mảng mới mỗi lần tính lại)
  }, [key, unlimited, !!quota]);

  const blocked = allowed ? orderIds.filter((id) => !allowed.has(id)).length : 0;
  return { allowed, ready: ready || unlimited, blocked, quota };
}
