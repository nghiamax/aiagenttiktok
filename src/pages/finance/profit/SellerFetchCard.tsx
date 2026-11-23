import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CircleDashed, Download, Loader2, LogIn, MinusCircle } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { api, ApiError } from '../../../lib/api';
import { fetchSellerFile, useSeller, type SellerDownload } from '../../accounts/useSeller';
import { readProfitFile } from './profitFiles';
import type { ProfitFile } from './useProfitStore';

type StepStatus = 'pending' | 'running' | 'done' | 'empty' | 'error';
interface FetchJob {
  id: string;
  from: string;
  to: string;
  running: boolean;
  error: string | null;
  steps: { key: string; label: string; status: StepStatus; message: string | null; file: string | null }[];
}

const POLL_MS = 2500;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Kỳ mặc định: tháng trước (giờ VN) */
function lastMonth(): { from: string; to: string } {
  const now = new Date(Date.now() + 7 * 3_600_000);
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { from: iso(first), to: iso(last) };
}

/** File đơn hàng xuất cả 12 tháng → chỉ giữ đơn đặt trong kỳ đã chọn */
function keepPeriod(pf: ProfitFile, from: string, to: string): ProfitFile {
  if (pf.kind !== 'orders') return pf;
  const orders = pf.data.orders.filter((o) => !o.createdAt || (o.createdAt >= from && o.createdAt <= to));
  const dates = orders
    .map((o) => o.createdAt)
    .filter((d): d is string => !!d)
    .sort();
  return {
    ...pf,
    rows: orders.length,
    range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    data: { ...pf.data, orders },
  };
}

const ICON: Record<StepStatus, JSX.Element> = {
  pending: <CircleDashed className="size-4 text-muted" />,
  running: <Loader2 className="size-4 animate-spin text-primary" />,
  done: <CheckCircle2 className="size-4 text-accent-green" />,
  empty: <MinusCircle className="size-4 text-muted" />,
  error: <AlertTriangle className="size-4 text-danger" />,
};

/**
 * Lấy file TỰ ĐỘNG từ TikTok Seller Center đã đăng nhập: server chạy ẩn (không mở cửa sổ) → xuất Đã quyết toán,
 * Chờ quyết toán, Đơn hàng cho kỳ đã chọn → file về tự đọc và đưa vào trang tính.
 */
export default function SellerFetchCard({ onAdd }: { onAdd: (files: ProfitFile[]) => void }) {
  const { state, enabled, reload } = useSeller('tiktok');
  const [range, setRange] = useState(lastMonth);
  const [job, setJob] = useState<FetchJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<string[]>([]);
  const handling = useRef(new Set<string>());
  const loggedIn = state?.status === 'logged_in';
  const running = !!job?.running;

  // Nhận file đã tải về (lọc đơn theo kỳ của lần lấy) → đưa vào trang → xoá khỏi server
  const pullDownloads = useCallback(
    async (period: { from: string; to: string }) => {
      const { downloads } = await api<{ downloads: SellerDownload[] }>('/seller/tiktok/downloads');
      for (const d of downloads) {
        if (handling.current.has(d.id)) continue;
        handling.current.add(d.id);
        try {
          const pf = keepPeriod(await readProfitFile(await fetchSellerFile('tiktok', d)), period.from, period.to);
          onAdd([pf]);
          setImported((x) => [d.name, ...x].slice(0, 6));
        } catch (e) {
          setError(`${d.name}: ${e instanceof Error ? e.message : 'không đọc được'}`);
        }
        void api(`/seller/tiktok/downloads/${encodeURIComponent(d.id)}`, { method: 'DELETE' }).catch(() => undefined);
      }
    },
    [onAdd],
  );

  // Mở trang: có lần lấy đang chạy (vd tải lại trang giữa chừng) → theo dõi tiếp
  useEffect(() => {
    void api<{ job: FetchJob | null }>('/seller/tiktok/fetch')
      .then((r) => r.job?.running && setJob(r.job))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!job?.running) return;
    const period = { from: job.from, to: job.to };
    const t = setInterval(async () => {
      try {
        const r = await api<{ job: FetchJob | null }>('/seller/tiktok/fetch');
        await pullDownloads(period);
        if (r.job) setJob(r.job);
        if (r.job && !r.job.running) {
          await pullDownloads(period);
          void reload();
        }
      } catch {
        /* thử lại lượt sau */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [job?.running, job?.from, job?.to, pullDownloads, reload]);

  const start = async () => {
    setError(null);
    setImported([]);
    try {
      const r = await api<{ job: FetchJob }>('/seller/tiktok/fetch', { method: 'POST', body: range });
      setJob(r.job);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không bắt đầu được');
    }
  };

  if (!state) return null;
  const dateCls =
    'rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60';

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
          <Download className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Lấy file tự động từ TikTok Shop</h3>
          <p className="mt-0.5 text-sm text-muted">
            {loggedIn
              ? 'Chọn kỳ (ngày đặt đơn) → hệ thống tự vào Seller Center bằng phiên đã đăng nhập (chạy ẩn, không mở cửa sổ), xuất đủ 4 file (Đã quyết toán, Chờ quyết toán, Đơn hàng, Quảng cáo) rồi đưa vào trang tính.'
              : 'Đăng nhập TikTok Seller Center 1 lần ở Quản lý tài khoản → TikTok, sau đó lấy file tự động tại đây.'}
          </p>
        </div>
        {!loggedIn && (
          <Link
            to="/accounts/tiktok"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-semibold transition hover:bg-canvas"
          >
            <LogIn className="size-4" /> Đăng nhập shop
          </Link>
        )}
      </div>

      {loggedIn && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Kỳ</span>
          <input
            type="date"
            aria-label="Từ ngày"
            value={range.from}
            disabled={running}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className={dateCls}
          />
          <span className="text-muted">–</span>
          <input
            type="date"
            aria-label="Đến ngày"
            value={range.to}
            disabled={running}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className={dateCls}
          />
          <button
            type="button"
            disabled={running || !enabled || !range.from || !range.to}
            onClick={() => void start()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {running ? 'Đang lấy file…' : 'Lấy file tự động'}
          </button>
        </div>
      )}

      {job && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {job.steps.map((s) => (
            <li key={s.key} className="rounded-xl border border-line px-3 py-2 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                {ICON[s.status]} {s.label}
              </p>
              <p
                className={`mt-0.5 truncate ${s.status === 'error' ? 'text-danger' : 'text-muted'}`}
                title={s.message ?? ''}
              >
                {s.status === 'done'
                  ? `Đã lấy ${s.file ?? 'file'}`
                  : s.status === 'running'
                    ? 'Đang xuất trên Seller Center…'
                    : s.status === 'pending'
                      ? 'Chờ'
                      : (s.message ?? (s.status === 'empty' ? 'Không có dữ liệu' : 'Lỗi'))}
              </p>
            </li>
          ))}
        </ul>
      )}
      {job?.error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">{job.error}</p>}
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">{error}</p>}
      {imported.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-accent-green">
          <CheckCircle2 className="size-4 shrink-0" /> Đã đưa vào trang: {imported.join(', ')}
        </p>
      )}
    </Card>
  );
}
