import { ExternalLink } from 'lucide-react';

interface VideoActionsProps {
  /** Link mở video trên TikTok; null nếu chưa có username tác giả */
  videoUrl: string | null;
}

/** Thao tác trên dòng video. Tăng cường / Tắt video sẽ thêm khi có backend thực thi */
export default function VideoActions({ videoUrl }: VideoActionsProps) {
  return (
    <div className="flex justify-end">
      {videoUrl ? (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Mở video trên TikTok"
          title="Mở video trên TikTok"
          className="flex size-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary-soft"
        >
          <ExternalLink className="size-4" />
        </a>
      ) : (
        <span
          aria-label="Không mở được video"
          title="Không có username tác giả (video riêng tư / đã xoá) nên không mở được"
          className="flex size-8 cursor-not-allowed items-center justify-center rounded-lg text-muted opacity-40"
        >
          <ExternalLink className="size-4" />
        </span>
      )}
    </div>
  );
}
