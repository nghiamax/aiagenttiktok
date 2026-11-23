import NumberField from './NumberField';

interface PercentSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}

/** Thanh kéo % + ô nhập số (gõ được số lẻ, vd 12,5) */
export default function PercentSlider({ label, value, onChange, max = 50 }: PercentSliderProps) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={Math.min(value, max)}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
      />
      <NumberField
        ariaLabel={label}
        value={value}
        onChange={onChange}
        suffix="%"
        decimals={2}
        max={99}
        className="w-24"
      />
    </div>
  );
}
