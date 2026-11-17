import { ExternalLink, PowerOff, Zap, type LucideIcon } from 'lucide-react';

interface VideoActionsProps {
  /** Link mở video trên TikTok; null nếu chưa có username tác giả */
  videoUrl: string | null;
}

/** Thao tác chưa có nghiệp vụ → tạm khoá */
const LOCKED: { label: string; icon: LucideIcon }[] = [
  { label: 'Tăng cường', icon: Zap },
  { label: 'Tắt video', icon: PowerOff },
];

export default function VideoActions({ videoUrl }: VideoActionsProps) {
  return (
    <div className="flex justify-end gap-1">
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
        <button
          type="button"
          disabled
          aria-label="Mở video trên TikTok"
          title="Chưa có username tác giả nên chưa mở được"
          className="flex size-8 cursor-not-allowed items-center justify-center rounded-lg text-muted opacity-50"
        >
          <ExternalLink className="size-4" />
        </button>
      )}
      {LOCKED.map(({ label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          disabled
          aria-label={label}
          title={`${label} · Chưa hỗ trợ`}
          className="flex size-8 cursor-not-allowed items-center justify-center rounded-lg text-muted opacity-50"
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
