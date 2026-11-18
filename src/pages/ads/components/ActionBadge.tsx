import { HelpCircle } from 'lucide-react';
import { groupMeta, type GroupLevel } from '../groups';
import { findGroup, useAdsSettings } from '../settings';
import type { VideoAction } from '../types';

interface ActionBadgeProps {
  /** ID nhóm */
  action: VideoAction | null;
  reason?: string;
  /** Cấp của nhóm (mặc định video) */
  level?: GroupLevel;
}

/** Badge nhóm video / sản phẩm / chiến dịch (tên, màu, icon lấy từ định nghĩa nhóm Sếp đặt) */
export default function ActionBadge({ action, reason, level = 'video' }: ActionBadgeProps) {
  const { settings } = useAdsSettings();
  if (!action) return <span className="text-muted">--</span>;

  const group = findGroup(settings, action, level);
  if (!group) {
    return (
      <span
        title="Nhóm này đã bị xoá khỏi định nghĩa"
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-muted"
      >
        <HelpCircle className="size-3.5" />
        Nhóm đã xoá
      </span>
    );
  }

  const meta = groupMeta(group);
  return (
    <span
      title={reason}
      className={`inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${meta.tone}`}
    >
      <meta.icon className="size-3.5" />
      {meta.label}
    </span>
  );
}
