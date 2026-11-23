interface QuickPicksProps {
  values: number[];
  value: number;
  onPick: (value: number) => void;
  /** Cách hiện số (mặc định "10%") */
  format?: (value: number) => string;
}

/** Nút chọn nhanh mức % thường dùng */
export default function QuickPicks({ values, value, onPick, format = (v) => `${v}%` }: QuickPicksProps) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {values.map((v) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            aria-pressed={on}
            className={`rounded-lg border px-2.5 py-1 text-sm font-medium tabular-nums transition ${
              on
                ? 'border-primary bg-primary text-white'
                : 'border-line text-muted hover:border-primary/40 hover:text-ink'
            }`}
          >
            {format(v)}
          </button>
        );
      })}
    </div>
  );
}
