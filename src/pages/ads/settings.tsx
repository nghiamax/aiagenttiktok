import { createContext, useContext, useState, type ReactNode } from 'react';
import defaultsJson from '../../data/ads-settings.json';
import { normalizeGroups, type GroupDef } from './groups';

/** Thiết lập phân loại video: ROI hoà vốn từng sản phẩm + định nghĩa các nhóm */
export interface AdsSettings {
  /** ROI hoà vốn theo ID sản phẩm (item_group_id) */
  breakEvenRoi: Record<string, number>;
  /** Nhóm video, xét theo thứ tự từ trên xuống (nhóm fallback luôn cuối) */
  groups: GroupDef[];
}

/** Mặc định đọc từ src/data/ads-settings.json (Claude có thể ghi số vào file này) */
export const DEFAULT_SETTINGS: AdsSettings = defaultsJson as AdsSettings;

const STORAGE_KEY = 'ads-settings-v1';

function load(): AdsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<AdsSettings>;
    return {
      breakEvenRoi: { ...DEFAULT_SETTINGS.breakEvenRoi, ...saved.breakEvenRoi },
      // Bản lưu cũ (chưa có groups) → dùng nhóm mặc định
      groups: normalizeGroups(Array.isArray(saved.groups) && saved.groups.length > 0 ? saved.groups : DEFAULT_SETTINGS.groups),
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
  saveGroups: (groups: GroupDef[]) => void;
  /** Về định nghĩa nhóm mặc định (giữ ROI hoà vốn) */
  resetGroups: () => void;
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
    saveGroups: (groups) => apply({ ...settings, groups: normalizeGroups(groups) }),
    resetGroups: () => apply({ ...settings, groups: DEFAULT_SETTINGS.groups }),
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

export function findGroup(settings: AdsSettings, id: string): GroupDef | undefined {
  return settings.groups.find((g) => g.id === id);
}
