import { normalizeGroups, type GroupDef, type GroupLevel } from './groups.js';
import type { CampaignTuneSettings } from './campaignTune.js';

/** ID nhóm hệ thống cấp sản phẩm "Cân nhắc bật lại" (shared/reEnable.ts — để đây tránh vòng import) */
export const REENABLE_GROUP = 'p-reenable';

/** Thiết lập phân loại: ROI hoà vốn từng sản phẩm + định nghĩa nhóm của 3 cấp (lưu trên server) */
export interface AdsSettings {
  /** ROI hoà vốn theo ID sản phẩm (item_group_id) */
  breakEvenRoi: Record<string, number>;
  /** Lợi nhuận 1 đơn Sếp nhập (đ) theo ID sản phẩm — ưu tiên hơn số tính từ giá ÷ ROI hoà vốn (Sếp chốt 26/11) */
  profitPerOrder?: Record<string, number>;
  /** Nhóm video, xét theo thứ tự từ trên xuống (nhóm fallback luôn cuối) */
  groups: GroupDef[];
  /** Nhóm sản phẩm (trong từng chiến dịch) */
  productGroups: GroupDef[];
  /** Nhóm chiến dịch */
  campaignGroups: GroupDef[];
  /** Chỉnh riêng bộ gợi ý cho shop này (shared/suggestRules.ts): tắt gợi ý / đổi hệ số. Thiếu = dùng mặc định chung */
  suggestOverrides?: Record<string, SuggestOverride>;
  /** Chiến lược điều chỉnh ROI mục tiêu & ngân sách chiến dịch (Sếp chốt 26/11) — thiếu = mặc định DEFAULT_TUNE */
  campaignTune?: Partial<CampaignTuneSettings>;
}

export interface SuggestOverride {
  off?: boolean;
  /** Ghi đè hệ số mặc định của gợi ý (cùng tên khoá với SUGGESTION_PARAMS) */
  params?: Record<string, number>;
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

/** Nhóm mẫu đã bỏ khỏi bộ mặc định — bản lưu cũ còn thì lọc đi */
const REMOVED_VIDEO_GROUP = 'watch';

/** Ghép bản lưu (có thể cũ / thiếu cấp) với mặc định → bản đầy đủ, nhóm fallback ở cuối */
export function normalizeSettings(saved: Partial<AdsSettings> | null | undefined, defaults: AdsSettings): AdsSettings {
  const groupsFor = (level: GroupLevel) => {
    const list = saved?.[GROUP_KEY[level]];
    // Bản lưu cũ (chưa có nhóm cấp này) → dùng nhóm mặc định
    const groups = Array.isArray(list) && list.length > 0 ? list : groupsOf(defaults, level);
    // Sếp bỏ nhóm mẫu "Theo dõi" (22/11/2026) — shop cần thì tự thêm nhóm mới (id khác, không bị bỏ)
    // Nhóm hệ thống "Cân nhắc bật lại" (Sếp chốt 25/11): bản lưu cũ chưa có → thêm lên đầu nhóm sản phẩm
    const sys = level === 'product' && !groups.some((g) => g.id === REENABLE_GROUP) ? defaults.productGroups.find((g) => g.id === REENABLE_GROUP) : undefined;
    const withSys = sys ? [sys, ...groups] : groups;
    return normalizeGroups(level === 'video' ? withSys.filter((g) => !(g.id === REMOVED_VIDEO_GROUP && g.builtin)) : withSys);
  };
  return {
    breakEvenRoi: { ...defaults.breakEvenRoi, ...saved?.breakEvenRoi },
    profitPerOrder: { ...defaults.profitPerOrder, ...saved?.profitPerOrder },
    groups: groupsFor('video'),
    productGroups: groupsFor('product'),
    campaignGroups: groupsFor('campaign'),
    suggestOverrides: { ...defaults.suggestOverrides, ...saved?.suggestOverrides },
    campaignTune: { ...defaults.campaignTune, ...saved?.campaignTune },
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
