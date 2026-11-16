import { CalendarDays, RefreshCw } from 'lucide-react';
import type { AdsSnapshot } from '../types';

interface SnapshotInfoProps {
  snapshot: AdsSnapshot;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Hiển thị khoảng ngày của số liệu và thời điểm cập nhật */
export default function SnapshotInfo({ snapshot }: SnapshotInfoProps) {
  if (!snapshot.updatedAt || !snapshot.range) {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl border border-dashed border-line bg-white px-3 py-2.5 text-sm text-muted">
        <RefreshCw className="size-4" />
        Chưa có dữ liệu
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 lg:items-end">
      <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-medium shadow-sm">
        <CalendarDays className="size-4 text-primary" />
        {formatDate(snapshot.range.from)} → {formatDate(snapshot.range.to)}
      </span>
      <span className="text-xs text-muted">
        {snapshot.advertiser ? `${snapshot.advertiser.name} · ` : ''}
        Cập nhật {formatDateTime(snapshot.updatedAt)}
      </span>
    </div>
  );
}
