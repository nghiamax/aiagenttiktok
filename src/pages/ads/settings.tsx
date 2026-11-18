import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import defaultsJson from '../../data/ads-settings.json';
import { api } from '../../lib/api';
import {
  GROUP_KEY,
  groupsOf,
  normalizeSettings,
  type AdsSettings,
} from '../../../shared/settings';
import { normalizeGroups, type GroupDef, type GroupLevel } from './groups';

// Kiểu + hàm thuần dùng chung với server → shared/settings.ts
export {
  breakEvenOf,
  findGroup,
  findGroupAnyLevel,
  GROUP_KEY,
  groupsOf,
  type AdsSettings,
} from '../../../shared/settings';

/** Mặc định đọc từ src/data/ads-settings.json (dùng khi chưa kết nối server) */
export const DEFAULT_SETTINGS: AdsSettings = normalizeSettings(defaultsJson as AdsSettings, defaultsJson as AdsSettings);

/** Bản cũ lưu trong trình duyệt trước khi có server — đẩy lên server 1 lần rồi xoá */
const LEGACY_KEY = 'ads-settings-v1';

function readLegacy(): Partial<AdsSettings> | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? (JSON.parse(raw) as Partial<AdsSettings>) : null;
  } catch {
    return null;
  }
}

function clearLegacy() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* bỏ qua */
  }
}

interface SettingsResponse {
  settings: AdsSettings;
  stored: boolean;
}

interface AdsSettingsValue {
  settings: AdsSettings;
  /** Lỗi lưu / tải từ server (null = ổn) */
  syncError: string | null;
  /** Lưu toàn bộ thiết lập */
  save: (next: AdsSettings) => void;
  /** Xoá ROI hoà vốn đã nhập (giữ định nghĩa nhóm) */
  reset: () => void;
  saveGroups: (level: GroupLevel, groups: GroupDef[]) => void;
  /** Về định nghĩa nhóm mặc định của một cấp (giữ ROI hoà vốn) */
  resetGroups: (level: GroupLevel) => void;
}

const AdsSettingsContext = createContext<AdsSettingsValue | null>(null);

/** Bọc các trang ADS 24/7 để Tổng quan và AI Agent dùng chung một bản thiết lập (lưu trên server) */
export function AdsSettingsProvider({ children }: { children: ReactNode }) {
  // Chưa tải xong thì dùng bản cũ trong trình duyệt (nếu có) để không bị nháy về mặc định
  const [settings, setSettings] = useState<AdsSettings>(() => normalizeSettings(readLegacy(), DEFAULT_SETTINGS));
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let res = await api<SettingsResponse>('/settings');
        const legacy = readLegacy();
        if (!res.stored && legacy) {
          res = await api<SettingsResponse>('/settings', { method: 'PUT', body: normalizeSettings(legacy, DEFAULT_SETTINGS) });
        }
        if (legacy) clearLegacy();
        if (!cancelled) {
          setSettings(res.settings);
          setSyncError(null);
        }
      } catch (e) {
        if (!cancelled) setSyncError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = useCallback((next: AdsSettings) => {
    setSettings(next);
    api<SettingsResponse>('/settings', { method: 'PUT', body: next }).then(
      (res) => {
        setSettings(res.settings);
        setSyncError(null);
      },
      (e: Error) => setSyncError(`Chưa lưu được thiết lập: ${e.message}`),
    );
  }, []);

  const value: AdsSettingsValue = {
    settings,
    syncError,
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
