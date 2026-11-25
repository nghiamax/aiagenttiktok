import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import defaultsJson from '../../data/ads-settings.json';
import { api } from '../../lib/api';
import { useAuth } from '../../auth/AuthProvider';
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
  /** Đã tải từ server (chưa tải thì không lưu được) */
  loaded: boolean;
  /** Lưu toàn bộ thiết lập */
  save: (next: AdsSettings) => void;
  /** Xoá ROI hoà vốn đã nhập (giữ định nghĩa nhóm) */
  reset: () => void;
  saveGroups: (level: GroupLevel, groups: GroupDef[]) => void;
  /** Về định nghĩa nhóm mặc định của một cấp (giữ ROI hoà vốn) */
  resetGroups: (level: GroupLevel) => void;
}

const AdsSettingsContext = createContext<AdsSettingsValue | null>(null);
const RETRY_MS = 5000;

/** Bọc các trang ADS 24/7 để Tổng quan và AI Agent dùng chung một bản thiết lập (lưu trên server) */
export function AdsSettingsProvider({ children }: { children: ReactNode }) {
  const { guest } = useAuth();
  // Chưa tải xong thì dùng bản cũ trong trình duyệt (nếu có) để không bị nháy về mặc định; khách = mặc định
  const [settings, setSettings] = useState<AdsSettings>(() =>
    guest ? DEFAULT_SETTINGS : normalizeSettings(readLegacy(), DEFAULT_SETTINGS),
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  /** Đã tải được thiết lập từ server — chưa tải thì KHÔNG cho lưu (tránh ghi đè ROI hoà vốn / nhóm bằng mặc định) */
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  // Tải thiết lập; server chưa chạy thì thử lại mỗi 5 giây tới khi được
  useEffect(() => {
    // Chế độ khách: không gọi API, không lưu (loaded = false chặn apply)
    if (guest) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
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
          loadedRef.current = true;
          setLoaded(true);
        }
      } catch (e) {
        if (cancelled) return;
        setSyncError(`Chưa tải được thiết lập từ server (${(e as Error).message}) — đang thử lại…`);
        timer = setTimeout(load, RETRY_MS);
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [guest]);

  const apply = useCallback((next: AdsSettings) => {
    if (!loadedRef.current) {
      setSyncError('Chưa tải được thiết lập từ server nên chưa lưu — đợi server chạy rồi thử lại.');
      return;
    }
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
    loaded,
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
