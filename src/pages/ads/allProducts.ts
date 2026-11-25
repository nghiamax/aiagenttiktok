import { useMemo } from 'react';
import type { AdsProduct } from './types';
import { useAdsData } from './data';
import { useTrend } from './trend';

/**
 * Danh sách sản phẩm đầy đủ hơn snapshot khoảng đang xem (Sếp chốt 25/11):
 *  - `table`: + sản phẩm ĐÃ LOẠI TRỪ chỉ có số trong 30 / 14 ngày (tắt từ trước, khoảng đang xem không có số) —
 *    số khoảng đang xem = 0, đánh giá bật lại dùng số 30 ngày.
 *  - `breakEven`: mọi sản phẩm (theo ID) có trong khoảng đang xem + 14 / 30 ngày — để nhập ROI hoà vốn đủ.
 */
export function useAllProducts(): { table: AdsProduct[]; breakEven: AdsProduct[] } {
  const { snapshot } = useAdsData();
  const { snaps } = useTrend();
  return useMemo(() => {
    const have = new Set(snapshot.products.map((p) => `${p.campaignId}/${p.id}`));
    const extra: AdsProduct[] = [];
    const byId = new Map(snapshot.products.map((p) => [p.id, p]));
    for (const s of [snaps.d30, snaps.d14]) {
      for (const p of s?.products ?? []) {
        if (!byId.has(p.id)) byId.set(p.id, p);
        const k = `${p.campaignId}/${p.id}`;
        if (!p.excluded || have.has(k)) continue;
        have.add(k);
        extra.push({ ...p, cost: 0, revenue: 0, orders: 0, roi: null, videoCount: 0 });
      }
    }
    return { table: [...snapshot.products, ...extra], breakEven: [...byId.values()] };
  }, [snapshot.products, snaps.d30, snaps.d14]);
}
