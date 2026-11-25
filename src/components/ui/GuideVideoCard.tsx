import { ArrowRight, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GUIDE_VIDEO_URL } from '../../config/guide';
import Card from './Card';
import GuideVideoPlayer from './GuideVideoPlayer';

/** Khung "Video hướng dẫn sử dụng" (link ở src/config/guide.ts) — xem được cả khi chưa đăng nhập */
export default function GuideVideoCard() {
  return (
    <Card className="mt-6 p-5 md:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <PlayCircle className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Video hướng dẫn sử dụng</h2>
            <p className="text-sm text-muted">Xem cách kết nối TikTok, chọn tài khoản quảng cáo và dùng BOT AI.</p>
          </div>
        </div>
        <Link
          to="/guide"
          data-guest-allow
          className="flex w-fit items-center gap-1 whitespace-nowrap text-sm font-semibold text-primary hover:underline"
        >
          Xem tất cả hướng dẫn
          <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="mx-auto max-w-3xl">
        <GuideVideoPlayer url={GUIDE_VIDEO_URL} title="Video hướng dẫn sử dụng" />
      </div>
    </Card>
  );
}
