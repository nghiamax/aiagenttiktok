import { normalizeGroups, type GroupDef, type GroupLevel } from './groups.js';

/** Thiết lập phân loại: ROI hoà vốn từng sản phẩm + định nghĩa nhóm của 3 cấp (lưu trên server) */
export interface AdsSettings {
  /** ROI hoà vốn theo ID sản phẩm (item_group_id) */
  breakEvenRoi: Record<string, number>;
  /** Nhóm video, xét theo thứ tự từ trên xuống (nhóm fallback luôn cuối) */
  groups: GroupDef[];
  /** Nhóm sản phẩm (trong từng chiến dịch) */
  productGroups: GroupDef[];
  /** Nhóm chiến dịch */
  campaignGroups: GroupDef[];
}

/** Key trong AdsSettings chứa nhóm của từng cấp */
export const GROUP_KEY = {
  video: 'groups',
  product: 'productGroups',
  campaign: 'campaignGroups',
} as const satisfies Record<GroupLevel, keyof AdsSettings>;

export function groupsOf(settings: AdsSettings, level: GroupLevel): GroupDef[] {
  return settings[GROUP_KEY[level]];
}

/** Ghép bản lưu (có thể cũ / thiếu cấp) với mặc định → bản đầy đủ, nhóm fallback ở cuối */
export function normalizeSettings(saved: Partial<AdsSettings> | null | undefined, defaults: AdsSettings): AdsSettings {
  const groupsFor = (level: GroupLevel) => {
    const list = saved?.[GROUP_KEY[level]];
    // Bản lưu cũ (chưa có nhóm cấp này) → dùng nhóm mặc định
    return normalizeGroups(Array.isArray(list) && list.length > 0 ? list : groupsOf(defaults, level));
  };
  return {
    breakEvenRoi: { ...defaults.breakEvenRoi, ...saved?.breakEvenRoi },
    groups: groupsFor('video'),
    productGroups: groupsFor('product'),
    campaignGroups: groupsFor('campaign'),
  };
}

export function breakEvenOf(settings: AdsSettings, productId: string): number | null {
  const value = settings.breakEvenRoi[productId];
  return typeof value === 'number' && value > 0 ? value : null;
}

export function findGroup(settings: AdsSettings, id: string, level: GroupLevel = 'video'): GroupDef | undefined {
  return groupsOf(settings, level).find((g) => g.id === id);
}

/** Tìm nhóm ở mọi cấp (dùng khi chỉ biết ID, vd nhật ký) */
export function findGroupAnyLevel(settings: AdsSettings, id: string): GroupDef | undefined {
  return findGroup(settings, id, 'video') ?? findGroup(settings, id, 'product') ?? findGroup(settings, id, 'campaign');
}
