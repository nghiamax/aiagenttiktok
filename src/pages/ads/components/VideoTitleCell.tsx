import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { AdsProduct, AdsVideo } from '../types';
import { LINK_BTN } from './tableStyles';

interface VideoTitleCellProps {
  video: AdsVideo;
  product: AdsProduct | undefined;
  /** Link mở video trên TikTok (null = thiếu username → không mở được) */
  videoUrl: string | null;
}

/** Ô "Video" dạng chữ (không ảnh): tiêu đề + @tài khoản · ID (sao chép); thẻ sản phẩm → nhãn + tên sản phẩm */
export default function VideoTitleCell({ video: v, product, videoUrl }: VideoTitleCellProps) {
  if (v.contentType === 'product_card') {
    return (
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-accent-violet">
            Thẻ sản phẩm
          </span>
          <span className="truncate font-medium" title={product?.name ?? v.productId}>
            {product?.name ?? v.productId}
          </span>
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">Không phải video · quảng cáo hiện ở trang sản phẩm</p>
      </div>
    );
  }

  const title = v.title || `Video ${v.id}`;
  // identityName là tên hiển thị, @ chỉ dùng cho username thật
  const account = v.authorUsername ? `@${v.authorUsername}` : v.identityName;
  return (
    <div className="min-w-0">
      {videoUrl ? (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${LINK_BTN} block w-full truncate font-semibold`}
          title={`${title}\nBấm để mở video trên TikTok`}
        >
          {title}
        </a>
      ) : (
        <p className="truncate font-semibold" title={title}>
          {title}
        </p>
      )}
      <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted">
        {account && <span className="truncate">{account} ·</span>}
        <span className="shrink-0 tabular-nums">{v.id}</span>
        <CopyId id={v.id} />
      </p>
    </div>
  );
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // trình duyệt chặn clipboard → bỏ qua
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Sao chép ID video"
      title="Sao chép ID video"
      className="flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-canvas hover:text-ink"
    >
      {copied ? <Check className="size-3 text-accent-green" /> : <Copy className="size-3" />}
    </button>
  );
}
