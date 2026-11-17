import type { SortDir, SortState } from './types';

/** Khoá tra cứu sản phẩm (một SPU có thể nằm ở nhiều chiến dịch) */
export function productKey(campaignId: string, productId: string): string {
  return `${campaignId}:${productId}`;
}

/** Link mở video trên TikTok. TikTok bắt buộc có username → không có thì trả null */
export function tiktokVideoUrl(id: string, username: string | null | undefined): string | null {
  return username ? `https://www.tiktok.com/@${username}/video/${id}` : null;
}

/** Chi phí trên mỗi đơn. null nếu thiếu số hoặc chưa có đơn */
export function cpa(cost: number | null, orders: number | null): number | null {
  if (cost == null || !orders) return null;
  return cost / orders;
}

/** Sắp xếp theo giá trị số; giá trị null luôn nằm cuối */
export function sortByValue<T>(list: T[], getValue: (item: T) => number | null, dir: SortDir): T[] {
  return [...list].sort((a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return dir === 'asc' ? va - vb : vb - va;
  });
}

/** Bấm lại cùng cột → đảo chiều; cột mới → giảm dần */
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: 'desc' };
}
