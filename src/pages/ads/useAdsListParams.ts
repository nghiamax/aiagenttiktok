import { useSearchParams } from 'react-router-dom';
import type { AdsListTab } from './types';

const TABS: readonly AdsListTab[] = ['campaigns', 'products', 'videos'];

type ParamKey = 'tab' | 'campaign' | 'product' | 'q' | 'action';

/**
 * Trạng thái card GMV Max lưu trên URL: /ads?tab=products&campaign=…&product=…&q=…
 * F5 hoặc gửi link vẫn giữ đúng tab và bộ lọc; nút Back hoạt động bình thường.
 */
export function useAdsListParams() {
  const [params, setSearchParams] = useSearchParams();

  const rawTab = params.get('tab');
  const tab = TABS.find((t) => t === rawTab) ?? 'campaigns';
  // ID nhóm video (nhóm do Sếp định nghĩa) hoặc 'all'
  const action = params.get('action') || 'all';

  /** Gán null/'' để xoá tham số. replace = true: không thêm mục vào lịch sử (dùng cho ô tìm kiếm) */
  function update(patch: Partial<Record<ParamKey, string | null>>, replace = false) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (next.get('tab') === 'campaigns') next.delete('tab');
        if (next.get('action') === 'all') next.delete('action');
        return next;
      },
      { replace },
    );
  }

  return {
    tab,
    campaignId: params.get('campaign'),
    productId: params.get('product'),
    query: params.get('q') ?? '',
    action,
    update,
  };
}
