import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, PlugZap, X } from 'lucide-react';
import { useTikTok } from '../../tiktok/TikTokProvider';

interface TikTokBannerProps {
  onOpenConnect: () => void;
}

/**
 * Dải trên cùng nội dung:
 *  - kết quả sau khi TikTok chuyển về (?tiktok=connected | error&reason=…), rồi xoá khỏi URL
 *  - mất kết nối TikTok (TikTok từ chối gia hạn / chưa kết nối) → nút Kết nối lại
 */
export default function TikTokBanner({ onOpenConnect }: TikTokBannerProps) {
  const { status, refresh } = useTikTok();
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const r = params.get('tiktok');
    if (!r) return;
    setResult(
      r === 'connected'
        ? { ok: true, text: 'Đã kết nối TikTok.' }
        : { ok: false, text: `Chưa kết nối được TikTok: ${params.get('reason') ?? 'lỗi không rõ'}` },
    );
    void refresh();
    const next = new URLSearchParams(params);
    next.delete('tiktok');
    next.delete('reason');
    setParams(next, { replace: true });
  }, [params, setParams, refresh]);

  const lost = status?.state === 'lost';
  // Lần đầu chưa kết nối: trang ADS đã có thẻ "Kết nối TikTok để bắt đầu" → dải nhẹ chỉ hiện ở các tab khác
  const never = status?.state === 'never' && !pathname.startsWith('/ads');
  if (!result && !lost && !never) return null;

  return (
    <div className="mb-6 space-y-2" aria-live="polite">
      {result && (
        <p
          className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
            result.ok ? 'bg-green-50 text-accent-green' : 'bg-rose-50 text-danger'
          }`}
        >
          {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1 font-medium">{result.text}</span>
          <button type="button" onClick={() => setResult(null)} aria-label="Đóng thông báo" className="rounded p-0.5 transition hover:bg-black/5">
            <X className="size-4" />
          </button>
        </p>
      )}
      {never && !result?.ok && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary">
          <PlugZap className="size-4 shrink-0" />
          <span className="flex-1 font-medium">Chưa kết nối TikTok</span>
          <button
            type="button"
            onClick={onOpenConnect}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-hover"
          >
            Kết nối
          </button>
        </div>
      )}
      {lost && !result?.ok && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/20 bg-rose-50 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1 font-medium">
            Mất kết nối TikTok — kết nối lại để cập nhật số liệu.
          </span>
          <button
            type="button"
            onClick={onOpenConnect}
            className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
          >
            Kết nối lại
          </button>
        </div>
      )}
    </div>
  );
}
