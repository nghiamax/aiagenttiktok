import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import DateRangeSelect, { type DateRangePreset } from '../../../components/ui/DateRangeSelect';
import { formatDmy } from '../../../lib/dates';
import { lastDays, useAdsData, vnDate } from '../data';

/** Giới hạn của server (/api/ads/snapshot) */
const MAX_DAYS = 90;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Chọn khoảng ngày + trạng thái tải số liệu của trang ADS 24/7 */
export default function AdsRangeControl() {
  const { snapshot, range, setRange, status, source, error, loginRequired, reload } = useAdsData();
  const today = vnDate();
  const loading = status === 'loading';

  const presets: DateRangePreset[] = [
    { label: 'Hôm nay', range: { from: today, to: today } },
    { label: 'Hôm qua', range: { from: vnDate(1), to: vnDate(1) } },
    { label: '7 ngày qua', range: lastDays(7) },
    { label: '14 ngày qua', range: lastDays(14) },
    { label: '30 ngày qua', range: lastDays(30) },
  ];

  const shownRange = snapshot.range ? `${formatDmy(snapshot.range.from)} – ${formatDmy(snapshot.range.to)}` : '';

  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <div className="flex items-center gap-2">
        <DateRangeSelect value={range} onChange={setRange} presets={presets} max={today} maxDays={MAX_DAYS} />
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          aria-label="Tải lại số liệu mới nhất từ TikTok"
          title="Tải lại số liệu mới nhất từ TikTok"
          className="flex size-11 items-center justify-center rounded-xl border border-line bg-white text-muted shadow-sm transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="flex max-w-xl items-center gap-1.5 text-xs text-muted lg:text-right" aria-live="polite">
        {loading ? (
          <>
            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
            Đang tải số liệu từ TikTok…
          </>
        ) : status === 'error' ? (
          <>
            <AlertTriangle className="size-3.5 shrink-0 text-danger" />
            <span>
              <span className="font-medium text-danger">
                {loginRequired ? 'Chưa đăng nhập TikTok trên server (chạy npm run login)' : error}
              </span>
              {shownRange && ` · Đang hiện ${source === 'static' ? 'dữ liệu lưu sẵn' : 'số liệu'} ${shownRange}`}
            </span>
          </>
        ) : (
          <>
            {snapshot.advertiser ? `${snapshot.advertiser.name} · ` : ''}
            {snapshot.updatedAt ? `Cập nhật ${formatDateTime(snapshot.updatedAt)}` : ''}
          </>
        )}
      </p>
    </div>
  );
}
