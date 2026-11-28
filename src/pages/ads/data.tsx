import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AdsSnapshot } from './types';
import { annotateCrossProduct, applyRecentActions, creativeSuccesses } from '../../../shared/videoStatus';
import { useAgentStore } from './agent/agentStore';
import type { TrendSnaps } from '../../../shared/trend';
import { notifyAuthRequired } from '../../lib/api';
import { useAuth } from '../../auth/AuthProvider';
import { emptySnapshot } from '../../../shared/adsSnapshot';

export interface DateRange {
  from: string;
  to: string;
}

export type AdsDataStatus = 'loading' | 'ready' | 'error';

/** live = số liệu từ server theo khoảng ngày chọn; static = chưa có số (trước đây là file lưu sẵn — đã bỏ 28/11: đó là số của 1 shop khác) */
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
  /** Số liệu chuẩn "7 ngày tính cả hôm nay" — cùng khoảng Agent xét, dùng cho Gợi ý (không đổi theo ngày đang xem) */
  baseline: AdsSnapshot;
  /** 7 · 14 · 30 ngày (tính cả hôm nay) — xếp nhóm đã xác nhận (14 / 30 null khi đang tải / lỗi) */
  trendSnaps: TrendSnaps;
  /** Đã có số thật từ server ít nhất 1 lần (trước đó trang chỉ hiện màn hình chờ) */
  firstLoaded: boolean;
  /** Phần số liệu đang tải (khoảng đang xem, 7 / 14 / 30 ngày, hôm nay) — trống = đủ */
  loadingParts: string[];
}

/** Chưa đăng nhập web → không có số liệu nào (không dùng file lưu sẵn — đó là số thật của shop) */
const EMPTY = emptySnapshot();
const STORAGE_KEY = 'ads-range';
/** Đợi một chút sau khi đổi ngày rồi mới tải, để khỏi gọi khi đang chọn dở */
const DEBOUNCE_MS = 500;

const DAY = 86_400_000;
/** Ngày theo giờ Việt Nam, dạng yyyy-MM-dd; offset = số ngày lùi lại */
export function vnDate(offset = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 - offset * DAY).toISOString().slice(0, 10);
}

/** n ngày gần nhất, TÍNH CẢ HÔM NAY (giống TikTok — Sếp chốt 26/11) */
export function lastDays(n: number): DateRange {
  return { from: vnDate(n - 1), to: vnDate() };
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
  const { guest } = useAuth();
  const [range, setRangeState] = useState<DateRange>(() => readStoredRange() ?? lastDays(7));
  const [rawSnapshot, setSnapshot] = useState<AdsSnapshot>(EMPTY);
  const [source, setSource] = useState<AdsDataSource>(guest ? 'live' : 'static');
  const [status, setStatus] = useState<AdsDataStatus>(guest ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const [firstLoaded, setFirstLoaded] = useState(guest);
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
    // Chế độ khách: không gọi API (provider được dựng lại khi đăng nhập)
    if (guest) return;
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
          setFirstLoaded(true);
          setLoginRequired(false);
          setError(null);
          setStatus('ready');
        } catch (e) {
          if (controller.signal.aborted) return;
          // Server chưa chạy / lỗi → giữ số liệu đang có (lần đầu: chưa có số → màn hình chờ báo lỗi)
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
  }, [guest, range.from, range.to, reloadKey]);

  // Số liệu cố định 7 · 14 · 30 ngày (tính cả hôm nay) (cùng khung Agent xét): trùng khoảng đang xem thì dùng luôn,
  // không thì tải nền (server có cache). Dùng cho Gợi ý, nhóm đã xác nhận ở các bảng / hộp Tổng quan
  const live = source === 'live' && status === 'ready' ? rawSnapshot : null;
  const mainLoading = status === 'loading';
  const f7 = useFixedSnapshot(7, range, live, mainLoading, reloadKey, guest);
  const f14 = useFixedSnapshot(14, range, live, mainLoading, reloadKey, guest);
  const f30 = useFixedSnapshot(30, range, live, mainLoading, reloadKey, guest);
  const f1 = useFixedSnapshot(1, range, live, mainLoading, reloadKey, guest);
  const raw7 = f7.snap;
  const raw14 = f14.snap;
  const raw30 = f30.snap;
  const d1 = f1.snap;
  const loadingParts = [
    ...(mainLoading ? ['Số liệu khoảng ngày đang xem'] : []),
    ...(f7.pending ? ['Số liệu 7 ngày'] : []),
    ...(f14.pending ? ['Số liệu 14 ngày'] : []),
    ...(f30.pending ? ['Số liệu 30 ngày'] : []),
    ...(f1.pending ? ['Số liệu hôm nay'] : []),
  ];
  const loadingKey = loadingParts.join('|');

  // Video vừa gỡ / thêm lại thành công mà snapshot lưu sẵn (cache tới 6 giờ) chưa biết → đè trạng thái theo Nhật ký
  // để nhóm, hộp Tổng quan, lọc "Đã gỡ" đổi ngay. Khoá theo các thao tác thành công → không tính lại mỗi lần tải Agent.
  const { state: agentState } = useAgentStore();
  const doneKey = creativeSuccesses(agentState.actions)
    .map((a) => `${a.id}:${a.executedAt}`)
    .join(',');
  const done = useMemo(
    () => creativeSuccesses(agentState.actions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doneKey],
  );
  const snapshot = useMemo(() => applyRecentActions(rawSnapshot, done), [rawSnapshot, done]);
  const d7 = useMemo(() => raw7 && applyRecentActions(raw7, done), [raw7, done]);
  const d14 = useMemo(() => raw14 && applyRecentActions(raw14, done), [raw14, done]);
  const d30 = useMemo(() => raw30 && applyRecentActions(raw30, done), [raw30, done]);
  const baseline = d7 ?? snapshot;
  const trendSnaps = useMemo<TrendSnaps>(() => ({ d7: baseline, d14, d30, d1 }), [baseline, d14, d30, d1]);

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
      firstLoaded,
      loadingParts: loadingKey ? loadingKey.split('|') : [],
    }),
    [snapshot, range, setRange, status, source, error, loginRequired, reload, baseline, trendSnaps, firstLoaded, loadingKey],
  );

  return <AdsDataContext.Provider value={value}>{children}</AdsDataContext.Provider>;
}

/**
 * Snapshot n ngày đến hôm qua. Khoảng đang xem trùng → dùng snapshot đang xem (đã tải xong); không thì tải nền.
 * snap null = chưa có (đang tải / lỗi) — nơi dùng tự quay về cách cũ. pending = đang tải (lỗi cũng tính là xong, không treo).
 */
function useFixedSnapshot(
  n: number,
  viewing: DateRange,
  live: AdsSnapshot | null,
  mainLoading: boolean,
  reloadKey: number,
  guest: boolean,
): { snap: AdsSnapshot | null; pending: boolean } {
  const want = lastDays(n);
  const same = viewing.from === want.from && viewing.to === want.to;
  const [snap, setSnap] = useState<AdsSnapshot | null>(null);
  const [fetching, setFetching] = useState(!guest);
  useEffect(() => {
    if (same || guest) {
      setFetching(false);
      return;
    }
    const controller = new AbortController();
    setFetching(true);
    fetch(`/api/ads/snapshot?${new URLSearchParams({ from: want.from, to: want.to })}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ snapshot?: AdsSnapshot }>) : null))
      .then((body) => body?.snapshot && setSnap(annotateCrossProduct(body.snapshot)))
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setFetching(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [same, guest, want.from, want.to, reloadKey]);
  if (guest) return { snap: EMPTY, pending: false };
  // Trùng khoảng đang xem → đi theo lần tải chính
  return same ? { snap: live ?? snap, pending: mainLoading } : { snap, pending: fetching };
}

export function useAdsData(): AdsDataValue {
  const ctx = useContext(AdsDataContext);
  if (!ctx) throw new Error('useAdsData phải nằm trong AdsDataProvider');
  return ctx;
}
