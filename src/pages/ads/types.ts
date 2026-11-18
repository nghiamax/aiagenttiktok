// Kiểu dữ liệu số liệu dùng chung với server → shared/adsSnapshot.ts
export type {
  CampaignStatus,
  Campaign,
  AdsSummary,
  AdsSnapshot,
  PreviousSummary,
  VideoStatus,
  CreativeContentType,
  AdsProduct,
  AdsVideo,
} from '../../../shared/adsSnapshot';

export type CampaignFilter = 'all' | 'running' | 'paused';

/** Tab trong card danh sách GMV Max */
export type AdsListTab = 'campaigns' | 'products' | 'videos';

/** ID nhóm video (định nghĩa trong settings.groups, Sếp tự sửa/thêm). Mặc định: authorize, cut, scale, watch, stable */
export type VideoAction = string;

/** ID nhóm hoặc 'all' */
export type VideoActionFilter = string;

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}
