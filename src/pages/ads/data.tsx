import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import staticSnapshot from '../../data/ads-snapshot.json';
import type { AdsSnapshot } from './types';
import { annotateCrossProduct } from '../../../shared/videoStatus';
import type { TrendSnaps } from '../../../shared/trend';
import { notifyAuthRequired } from '../../lib/api';

export interface DateRange {
  from: string;
  to: string;
}

export type AdsDataStatus = 'loading' | 'ready' | 'error';

/** live = số liệu từ server theo khoảng ngày chọn; static = file lưu sẵn src/data/ads-snapshot.json */
export type AdsDataSource = 'live' | 'static';

interface AdsDataValue {
  snapshot: AdsSnapshot;
  /** Khoảng ngày đang chọn (có thể khác snapshot.range khi đang tải / lỗi) */
  range: DateRange;
  setRange: (range: DateRange) => void;
  status: AdsDataStatus;
  source: AdsDataSource;
  /** Lỗi hiển thị cho người dùng */
  error: string | null;
  /** Chưa đăng nhập TikTok trên server */
  loginRequired: boolean;
  /** Tải lại, bỏ qua cache của server */
  reload: () => void;
  /** Số ngày của snapshot đang hiển thị (tính cả 2 đầu) */
  days: number;
  /** Số liệu chuẩn "7 ngày đến hôm qua" — cùng khoảng Agent xét, dùng cho Gợi ý (không đổi theo ngày đang xem) */
  baseline: AdsSnapshot;
  /** 7 · 14 · 30 ngày đến hôm qua — xếp nhóm đã xác nhận (14 / 30 null khi đang tải / lỗi) */
  trendSnaps: TrendSnaps;
}

const STATIC = annotateCrossProduct(staticSnapshot as AdsSnapshot);
const STORAGE_KEY = 'ads-range';
/** Đợi một chút sau khi đổi ngày rồi mới tải, để khỏi gọi khi đang chọn dở */
const DEBOUNCE_MS = 500;

const DAY = 86_400_000;
/** Ngày theo giờ Việt Nam, dạng yyyy-MM-dd; offset = số ngày lùi lại */
export function vnDate(offset = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 - offset * DAY).toISOString().slice(0, 10);
}

/** n ngày gần nhất, tính đến hôm qua */
export function lastDays(n: number): DateRange {
  return { from: vnDate(n), to: vnDate(1) };
}

export function daysOf(range: { from: string; to: string } | null | undefined): number {
  if (!range) return 7;
  return Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY) + 1;
}

/** Khoảng tương đối (nút nhanh): lưu tên, mở lại trang thì tính lại theo hôm nay */
const RELATIVE: Record<string, () => DateRange> = {
  today: () => ({ from: vnDate(), to: vnDate() }),
  yesterday: () => ({ from: vnDate(1), to: vnDate(1) }),
  '7d': () => lastDays(7),
  '14d': () => lastDays(14),
  '30d': () => lastDays(30),
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function readStoredRange(): DateRange | null {
  try {
    const r = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as (DateRange & { preset?: string }) | null;
    if (r?.preset && RELATIVE[r.preset]) return RELATIVE[r.preset]();
    // Bản cũ lưu ngày cố định → coi như "7 ngày qua" để luôn có số mới nhất
    if (r && DATE_RE.test(r.from) && DATE_RE.test(r.to) && r.from <= r.to && r.to <= vnDate()) {
      return r.preset === 'custom' ? r : lastDays(7);
    }
  } catch {
    /* localStorage bị chặn */
  }
  return null;
}

function storeRange(r: DateRange) {
  const preset = Object.keys(RELATIVE).find((k) => {
    const p = RELATIVE[k]();
    return p.from === r.from && p.to === r.to;
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preset ? { preset } : { ...r, preset: 'custom' }));
  } catch {
    /* bỏ qua */
  }
}

interface ApiError {
  code?: string;
  error?: string;
}

const AdsDataContext = createContext<AdsDataValue | null>(null);

/** Nguồn số liệu ADS dùng chung cho Tổng quan + AI Agent (bọc trong AdsLayout) */
export function AdsDataProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<DateRange>(() => readStoredRange() ?? lastDays(7));
  const [snapshot, setSnapshot] = useState<AdsSnapshot>(STATIC);
  const [source, setSource] = useState<AdsDataSource>('static');
  const [status, setStatus] = useState<AdsDataStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const forceRef = useRef(false);

  const setRange = useCallback((r: DateRange) => {
    setRangeState(r);
    storeRange(r);
  }, []);

  const reload = useCallback(() => {
    forceRef.current = true;
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const force = forceRef.current;
    forceRef.current = false;
    setStatus('loading');
    const timer = setTimeout(
      async () => {
        try {
          const qs = new URLSearchParams({ from: range.from, to: range.to, ...(force && { refresh: '1' }) });
          const res = await fetch(`/api/ads/snapshot?${qs}`, { signal: controller.signal });
          const body = (await res.json().catch(() => null)) as ({ snapshot?: AdsSnapshot } & ApiError) | null;
          if (!res.ok || !body?.snapshot) {
            notifyAuthRequired(res.status, body?.code);
            setLoginRequired(body?.code === 'TIKTOK_LOGIN_REQUIRED');
            throw new Error(body?.error ?? 'Không kết nối được server số liệu (npm run server)');
          }
          setSnapshot(annotateCrossProduct(body.snapshot));
          setSource('live');
          setLoginRequired(false);
          setError(null);
          setStatus('ready');
        } catch (e) {
          if (controller.signal.aborted) return;
          // Server chưa chạy / lỗi → giữ số liệu đang có (lần đầu là file lưu sẵn)
          setError(e instanceof TypeError ? 'Không kết nối được server số liệu (npm run server)' : (e as Error).message);
          setStatus('error');
        }
      },
      force ? 0 : DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [range.from, range.to, reloadKey]);

  // Số liệu cố định 7 · 14 · 30 ngày đến hôm qua (cùng khung Agent xét): trùng khoảng đang xem thì dùng luôn,
  // không thì tải nền (server có cache). Dùng cho Gợi ý, nhóm đã xác nhận ở các bảng / hộp Tổng quan
  const live = source === 'live' && status === 'ready' ? snapshot : null;
  const d7 = useFixedSnapshot(7, range, live, reloadKey);
  const d14 = useFixedSnapshot(14, range, live, reloadKey);
  const d30 = useFixedSnapshot(30, range, live, reloadKey);
  const baseline = d7 ?? snapshot;
  const trendSnaps = useMemo<TrendSnaps>(() => ({ d7: baseline, d14, d30 }), [baseline, d14, d30]);

  const value = useMemo<AdsDataValue>(
    () => ({
      snapshot,
      range,
      setRange,
      status,
      source,
      error,
      loginRequired,
      reload,
      days: daysOf(snapshot.range),
      baseline,
      trendSnaps,
    }),
    [snapshot, range, setRange, status, source, error, loginRequired, reload, baseline, trendSnaps],
  );

  return <AdsDataContext.Provider value={value}>{children}</AdsDataContext.Provider>;
}

/**
 * Snapshot n ngày đến hôm qua. Khoảng đang xem trùng → dùng snapshot đang xem (đã tải xong); không thì tải nền.
 * null = chưa có (đang tải / lỗi) — nơi dùng tự quay về cách cũ.
 */
function useFixedSnapshot(n: number, viewing: DateRange, live: AdsSnapshot | null, reloadKey: number): AdsSnapshot | null {
  const want = lastDays(n);
  const same = viewing.from === want.from && viewing.to === want.to;
  const [snap, setSnap] = useState<AdsSnapshot | null>(null);
  useEffect(() => {
    if (same) return;
    const controller = new AbortController();
    fetch(`/api/ads/snapshot?${new URLSearchParams({ from: want.from, to: want.to })}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ snapshot?: AdsSnapshot }>) : null))
      .then((body) => body?.snapshot && setSnap(annotateCrossProduct(body.snapshot)))
      .catch(() => undefined);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [same, want.from, want.to, reloadKey]);
  return same ? (live ?? snap) : snap;
}

export function useAdsData(): AdsDataValue {
  const ctx = useContext(AdsDataContext);
  if (!ctx) throw new Error('useAdsData phải nằm trong AdsDataProvider');
  return ctx;
}
