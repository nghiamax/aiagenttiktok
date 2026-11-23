import { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import { useFinanceQuota } from '../useFinanceQuota';

/** Kết quả đứng yên bao lâu thì tính là 1 lượt (gõ liên tục không bị trừ nhiều lượt) */
export const METER_DELAY_MS = 1500;

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Đếm lượt Tính giá bán (gói Miễn phí): mỗi kết quả MỚI (bộ số nhập khác lần trước) đứng yên METER_DELAY_MS → trừ 1 lượt.
 * Hết lượt → `locked` (ẩn kết quả mới; kết quả đã tính gần nhất vẫn xem được). Pro không đếm.
 * @param signature chuỗi đại diện bộ số nhập của kết quả hiện tại; null = chưa có kết quả
 */
export function usePricingMeter(signature: string | null) {
  const { user } = useAuth();
  const { quota, consume } = useFinanceQuota();
  const storageKey = 'finance-pricing-last-calc-' + (user?.id ?? 'anon');
  const [counted, setCounted] = useState<string | null>(() => readKey(storageKey));

  const metered = !!quota && !quota.unlimited;
  const remaining = quota?.remaining ?? 0;

  useEffect(() => {
    if (!signature || !metered || signature === counted || remaining <= 0) return;
    const t = setTimeout(async () => {
      if (!(await consume())) return;
      setCounted(signature);
      try {
        localStorage.setItem(storageKey, signature);
      } catch {
        /* bỏ qua */
      }
    }, METER_DELAY_MS);
    return () => clearTimeout(t);
  }, [signature, metered, counted, remaining, consume, storageKey]);

  const locked = !!signature && metered && remaining <= 0 && signature !== counted;
  return { quota, locked };
}
