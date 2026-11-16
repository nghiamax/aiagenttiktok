import type { LucideIcon } from 'lucide-react';
import Card from './Card';

export type StatTone = 'blue' | 'green' | 'violet' | 'amber';

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: StatTone;
  hint?: string;
}

const iconTone: Record<StatTone, string> = {
  blue: 'bg-blue-50 text-primary',
  green: 'bg-green-50 text-accent-green',
  violet: 'bg-violet-50 text-accent-violet',
  amber: 'bg-amber-50 text-amber-600',
};

export default function StatCard({ label, value, icon: Icon, tone, hint }: StatCardProps) {
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
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
