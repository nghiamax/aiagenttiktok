import { CalendarDays } from 'lucide-react';

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}

const input = 'bg-transparent text-sm font-medium text-ink outline-none [color-scheme:light]';

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 shadow-sm transition-colors focus-within:border-primary hover:border-primary/40">
      <CalendarDays className="size-4 shrink-0 text-primary" />
      <input
        type="date"
        value={from}
        max={to}
        onChange={(e) => onChange({ from: e.target.value, to })}
        className={input}
        aria-label="Từ ngày"
      />
      <span className="text-muted">→</span>
      <input
        type="date"
        value={to}
        min={from}
        onChange={(e) => onChange({ from, to: e.target.value })}
        className={input}
        aria-label="Đến ngày"
      />
    </div>
  );
}
