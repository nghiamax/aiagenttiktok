import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import Card from './Card';

export type StatTone = 'blue' | 'green' | 'violet' | 'amber';

/** So với kỳ trước. good/bad: tăng là tốt hay xấu; neutral: chỉ báo hướng (vd chi phí) */
export interface StatChange {
  /** % thay đổi, vd 12.5 = tăng 12,5% */
  pct: number;
  /** Tăng thì tốt (doanh thu), xấu, hay trung tính (chi phí) */
  direction: 'up-good' | 'up-bad' | 'neutral';
  /** "so với 03/11 – 09/11" */
  label: string;
}

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: StatTone;
  hint?: string;
  change?: StatChange | null;
}

const iconTone: Record<StatTone, string> = {
  blue: 'bg-blue-50 text-primary',
  green: 'bg-green-50 text-accent-green',
  violet: 'bg-violet-50 text-accent-violet',
  amber: 'bg-amber-50 text-amber-600',
};

const pctText = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

function ChangeLine({ change }: { change: StatChange }) {
  const up = change.pct >= 0;
  const good = change.direction === 'up-good' ? up : !up;
  const color =
    change.direction === 'neutral' || Math.abs(change.pct) < 0.05
      ? 'bg-canvas text-muted'
      : good
        ? 'bg-green-50 text-accent-green'
        : 'bg-rose-50 text-danger';
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${color}`}>
        <Arrow className="size-3.5" />
        {pctText.format(Math.abs(change.pct))}%
      </span>
      {change.label}
    </p>
  );
}

export default function StatCard({ label, value, icon: Icon, tone, hint, change }: StatCardProps) {
  return (
    <Card className="p-5 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconTone[tone]}`}>
          <Icon className="size-5" strokeWidth={1.9} />
        </div>
      </div>
      <p className="mt-2 truncate text-2xl font-bold tabular-nums" title={value}>
        {value}
      </p>
      {change && <ChangeLine change={change} />}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
