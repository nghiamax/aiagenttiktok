import { formatNumber } from '../../../lib/format';
import NumberField from './NumberField';
import PercentSlider from './PercentSlider';
import QuickPicks from './QuickPicks';

interface MarginTargetFieldProps {
  kind: 'pct' | 'amount';
  pct: number;
  amount: number;
  onKind: (k: 'pct' | 'amount') => void;
  onPct: (v: number) => void;
  onAmount: (v: number) => void;
}

const KINDS: { value: 'pct' | 'amount'; label: string }[] = [
  { value: 'pct', label: '% giá bán' },
  { value: 'amount', label: 'Số tiền' },
];

/** Lãi mong muốn: theo % giá bán hoặc số tiền mỗi sản phẩm */
export default function MarginTargetField({ kind, pct, amount, onKind, onPct, onAmount }: MarginTargetFieldProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Lãi mong muốn</p>
        <div className="inline-flex rounded-lg bg-canvas p-0.5" role="radiogroup" aria-label="Kiểu lãi mong muốn">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => onKind(k.value)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition ${
                kind === k.value ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {kind === 'pct' ? (
        <>
          <PercentSlider label="% lãi mong muốn" value={pct} onChange={onPct} />
          <QuickPicks values={[10, 15, 20, 30]} value={pct} onPick={onPct} />
        </>
      ) : (
        <>
          <NumberField ariaLabel="Lãi mong muốn mỗi sản phẩm (đ)" value={amount} onChange={onAmount} suffix="đ / sp" />
          <QuickPicks
            values={[10_000, 20_000, 30_000, 50_000]}
            value={amount}
            onPick={onAmount}
            format={(v) => `${formatNumber(v / 1000)}k`}
          />
        </>
      )}
    </div>
  );
}
