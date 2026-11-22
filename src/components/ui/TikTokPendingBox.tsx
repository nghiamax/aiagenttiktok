import { useState } from 'react';
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useTikTok } from '../../tiktok/TikTokProvider';

/**
 * Đang chờ cho phép trên TikTok: người dùng tự chọn Mở trang TikTok (tab mới) hoặc Sao chép link (trình duyệt khác).
 * Tab này tự tải lại khi kết nối xong. Sao chép link để dán sang trình duyệt đang đăng nhập TikTok Ads.
 */
export default function TikTokPendingBox() {
  const { pending, openTikTok, cancelPending, connect } = useTikTok();
  const [copied, setCopied] = useState(false);
  if (!pending) return null;

  const btn = 'flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink';

  async function copy() {
    try {
      await navigator.clipboard.writeText(pending!.authUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Sao chép link này:', pending!.authUrl);
    }
  }

  if (pending.expired) {
    return (
      <div className="w-full space-y-3 rounded-xl border border-line bg-canvas p-4 text-left text-sm">
        <p className="font-medium text-ink">Link đã hết hạn (10 phút).</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void connect()} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover">
            Kết nối lại
          </button>
          <button type="button" onClick={cancelPending} className={btn}>
            Huỷ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-xl border border-primary/20 bg-primary-soft p-4 text-left text-sm" aria-live="polite">
      <p className="flex items-center gap-2 font-semibold text-primary">
        <Loader2 className="size-4 animate-spin" />
        Đang chờ cho phép trên TikTok…
      </p>
      <p className="text-muted">Bấm Mở trang TikTok, hoặc sao chép link sang trình duyệt đang đăng nhập TikTok Ads. Trang này tự tải lại khi xong.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openTikTok}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
        >
          <ExternalLink className="size-4" /> Mở trang TikTok
        </button>
        <button type="button" onClick={copy} className={btn}>
          {copied ? <Check className="size-4 text-accent-green" /> : <Copy className="size-4" />}
          {copied ? 'Đã sao chép' : 'Sao chép link'}
        </button>
        <button type="button" onClick={cancelPending} className={btn}>
          Huỷ
        </button>
      </div>
    </div>
  );
}
