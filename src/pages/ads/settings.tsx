import { createContext, useContext, useState, type ReactNode } from 'react';
import defaultsJson from '../../data/ads-settings.json';
import { normalizeGroups, type GroupDef, type GroupLevel } from './groups';

/** Thiết lập phân loại: ROI hoà vốn từng sản phẩm + định nghĩa nhóm của 3 cấp */
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

/** Mặc định đọc từ src/data/ads-settings.json (Claude có thể ghi số vào file này) */
export const DEFAULT_SETTINGS: AdsSettings = defaultsJson as AdsSettings;

const STORAGE_KEY = 'ads-settings-v1';

/** Key trong AdsSettings chứa nhóm của từng cấp */
export const GROUP_KEY = {
  video: 'groups',
  product: 'productGroups',
  campaign: 'campaignGroups',
} as const satisfies Record<GroupLevel, keyof AdsSettings>;

export function groupsOf(settings: AdsSettings, level: GroupLevel): GroupDef[] {
  return settings[GROUP_KEY[level]];
}

function loadGroups(saved: Partial<AdsSettings>, level: GroupLevel): GroupDef[] {
  const list = saved[GROUP_KEY[level]];
  // Bản lưu cũ (chưa có nhóm cấp này) → dùng nhóm mặc định
  return normalizeGroups(Array.isArray(list) && list.length > 0 ? list : groupsOf(DEFAULT_SETTINGS, level));
}

function load(): AdsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<AdsSettings>;
    return {
      breakEvenRoi: { ...DEFAULT_SETTINGS.breakEvenRoi, ...saved.breakEvenRoi },
      groups: loadGroups(saved, 'video'),
      productGroups: loadGroups(saved, 'product'),
      campaignGroups: loadGroups(saved, 'campaign'),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persist(next: AdsSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // trình duyệt chặn lưu trữ → chỉ giữ trong phiên hiện tại
  }
}

interface AdsSettingsValue {
  settings: AdsSettings;
  /** Lưu toàn bộ thiết lập */
  save: (next: AdsSettings) => void;
  /** Xoá ROI hoà vốn đã nhập (giữ định nghĩa nhóm) */
  reset: () => void;
  saveGroups: (level: GroupLevel, groups: GroupDef[]) => void;
  /** Về định nghĩa nhóm mặc định của một cấp (giữ ROI hoà vốn) */
  resetGroups: (level: GroupLevel) => void;
}

const AdsSettingsContext = createContext<AdsSettingsValue | null>(null);

/** Bọc các trang ADS 24/7 để Tổng quan và AI Agent dùng chung một bản thiết lập */
export function AdsSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AdsSettings>(load);

  function apply(next: AdsSettings) {
    setSettings(next);
    persist(next);
  }

  const value: AdsSettingsValue = {
    settings,
    save: apply,
    reset: () => apply({ ...settings, breakEvenRoi: DEFAULT_SETTINGS.breakEvenRoi }),
    saveGroups: (level, groups) => apply({ ...settings, [GROUP_KEY[level]]: normalizeGroups(groups) }),
    resetGroups: (level) => apply({ ...settings, [GROUP_KEY[level]]: groupsOf(DEFAULT_SETTINGS, level) }),
  };

  return <AdsSettingsContext.Provider value={value}>{children}</AdsSettingsContext.Provider>;
}

export function useAdsSettings(): AdsSettingsValue {
  const ctx = useContext(AdsSettingsContext);
  if (!ctx) throw new Error('useAdsSettings phải nằm trong AdsSettingsProvider');
  return ctx;
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
