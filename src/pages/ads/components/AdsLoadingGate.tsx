import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import BrandLogo from '../../../components/ui/BrandLogo';
import { useAgentStore } from '../agent/agentStore';
import { useAdsData } from '../data';
import { useAdsSettings } from '../settings';

/** Quá ngần này mà lần đầu vẫn chưa xong → báo TikTok trả lời chậm + nút Thử lại */
const SLOW_MS = 30_000;

/**
 * Màn hình chờ của Quản lí chiến dịch + Care Ads (Sếp yêu cầu 28/11): trước đây trang hiện số trong lúc chờ
 * (số lưu sẵn của shop khác, nhóm theo thiết lập mặc định, khung 7 · 14 · 30 ngày cũ) → người dùng tưởng là số thật.
 * - Lần đầu: chưa đủ số liệu + thiết lập phân nhóm + BOT AI → chỉ hiện màn hình chờ (lỗi → thẻ lỗi, không hiện số).
 * - Sau đó, lấy số mới / đổi khoảng ngày: phủ mờ phần nội dung + chặn bấm tới khi xong (ô chọn ngày nằm trên lớp phủ).
 */
export default function AdsLoadingGate({ children }: { children: ReactNode }) {
  const data = useAdsData();
  const settings = useAdsSettings();
  const agent = useAgentStore();

  const parts = [
    { label: 'Số liệu chiến dịch', done: data.firstLoaded },
    { label: 'Số liệu 7 · 14 · 30 ngày', done: data.firstLoaded && !data.loadingParts.some((p) => /\d+ ngày|hôm nay/.test(p)) },
    { label: 'Thiết lập phân nhóm', done: settings.loaded || !!settings.syncError },
    { label: 'BOT AI', done: agent.connected || !!agent.error },
  ];
  const readyNow = parts.every((p) => p.done);
  // Đã hiện trang 1 lần → các lần tải sau chỉ phủ mờ, không quay về màn hình chờ
  const shownRef = useRef(false);
  if (readyNow) shownRef.current = true;

  if (!shownRef.current) {
    if (!data.firstLoaded && data.status === 'error') {
      return <LoadError message={data.loginRequired ? 'Mất kết nối TikTok — kết nối lại ở ô shop trên đầu trang' : (data.error ?? 'Không tải được số liệu')} onRetry={data.reload} />;
    }
    return <FirstLoad parts={parts} onRetry={data.reload} />;
  }

  const busy = data.loadingParts.length > 0;
  return (
    <div className="relative" aria-busy={busy}>
      {children}
      {busy && (
        <div className="absolute inset-0 z-20 rounded-2xl bg-canvas/70 backdrop-blur-[1px]" role="status" aria-live="polite">
          <div className="sticky top-24 mx-auto mt-40 flex w-fit max-w-[90%] items-start gap-3 rounded-2xl border border-line bg-white px-5 py-4 shadow-md">
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
            <div>
              <p className="font-semibold">Đang lấy số liệu mới từ TikTok…</p>
              <p className="mt-0.5 text-sm text-muted">Chờ: {data.loadingParts.join(' · ')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FirstLoad({ parts, onRetry }: { parts: { label: string; done: boolean }[]; onRetry: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <BrandLogo className="size-10" />
          <div>
            <p className="font-semibold">Đang tải số liệu shop…</p>
            <p className="text-sm text-muted">Lấy số mới từ TikTok, thường mất vài giây</p>
          </div>
        </div>
        <ul className="mt-5 space-y-2.5">
          {parts.map((p) => (
            <li key={p.label} className={`flex items-center gap-2 text-sm ${p.done ? 'text-ink' : 'text-muted'}`}>
              {p.done ? <CheckCircle2 className="size-4 text-accent-green" /> : <Loader2 className="size-4 animate-spin text-primary" />}
              {p.label}
            </li>
          ))}
        </ul>
        {slow && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <span>TikTok đang trả lời chậm</span>
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1 rounded-lg px-2 py-1 font-medium transition hover:bg-amber-100"
            >
              <RefreshCw className="size-3.5" /> Thử lại
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto size-8 text-danger" />
        <p className="mt-3 font-semibold">Chưa tải được số liệu</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
        >
          <RefreshCw className="size-4" /> Thử lại
        </button>
      </div>
    </div>
  );
}
