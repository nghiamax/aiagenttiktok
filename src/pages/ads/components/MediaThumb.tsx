import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface MediaThumbProps {
  src: string | null;
  icon: LucideIcon;
  /** square: ảnh sản phẩm, portrait: video 9:16 */
  shape: 'square' | 'portrait';
}

/** Ảnh nhỏ trong bảng; không có ảnh / ảnh lỗi (link hết hạn) thì hiện icon */
export default function MediaThumb({ src, icon: Icon, shape }: MediaThumbProps) {
  const size = shape === 'square' ? 'size-10' : 'h-14 w-10';
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(src)}
        className={`${size} shrink-0 rounded-lg bg-canvas object-cover`}
      />
    );
  }
  return (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-canvas text-muted`}>
      <Icon className="size-4" />
    </div>
  );
}
