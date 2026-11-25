import { PlayCircle } from 'lucide-react';
import { parseGuideVideo } from '../../config/guide';

/** Khung 16:9 phát video hướng dẫn (YouTube / file); link trống → "đang được cập nhật" */
export default function GuideVideoPlayer({ url, title }: { url: string; title: string }) {
  const video = parseGuideVideo(url);
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-canvas">
      {video?.kind === 'youtube' ? (
        <iframe
          src={video.embedUrl}
          title={title}
          className="size-full"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : video?.kind === 'file' ? (
        // Nút điều khiển của video nằm trong vùng bị chặn khi là khách → cho phép bấm
        <video src={video.src} controls preload="metadata" className="size-full" data-guest-allow />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-muted">
          <PlayCircle className="size-10" strokeWidth={1.5} />
          <p className="text-sm">Video hướng dẫn đang được cập nhật</p>
        </div>
      )}
    </div>
  );
}
