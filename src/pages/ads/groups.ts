import {
  Eye,
  Flame,
  Hourglass,
  KeyRound,
  Scissors,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { GroupDef, GroupIcon, GroupTone } from '../../../shared/groups';

// Logic nhóm dùng chung với server → shared/groups.ts
export * from '../../../shared/groups';

/* ───────────── Hiển thị ───────────── */

export const GROUP_ICONS: Record<GroupIcon, LucideIcon> = {
  scissors: Scissors,
  trending: TrendingUp,
  key: KeyRound,
  hourglass: Hourglass,
  shield: ShieldCheck,
  sparkles: Sparkles,
  flame: Flame,
  star: Star,
  eye: Eye,
  tag: Tag,
};

/** Màu nền + chữ cho badge và ô icon */
export const GROUP_TONES: Record<GroupTone, string> = {
  red: 'bg-rose-50 text-danger',
  green: 'bg-green-50 text-accent-green',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-primary',
  violet: 'bg-violet-50 text-accent-violet',
  gray: 'bg-canvas text-muted',
};

/** Chấm màu đậm dùng trong bảng chọn màu */
export const GROUP_TONE_DOT: Record<GroupTone, string> = {
  red: 'bg-danger',
  green: 'bg-accent-green',
  amber: 'bg-amber-500',
  blue: 'bg-primary',
  violet: 'bg-accent-violet',
  gray: 'bg-muted',
};

export function groupMeta(group: GroupDef): { label: string; icon: LucideIcon; tone: string } {
  return { label: group.name, icon: GROUP_ICONS[group.icon] ?? Tag, tone: GROUP_TONES[group.tone] ?? GROUP_TONES.gray };
}

