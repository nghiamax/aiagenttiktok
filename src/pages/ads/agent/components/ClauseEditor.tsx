import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  ENTITY_METRICS,
  isMoneyMetric,
  METRIC_LABEL,
  OP_LABEL,
  type Clause,
  type ClauseValue,
  type Metric,
  type Op,
} from '../../groups';

interface ClauseEditorProps {
  clause: Clause;
  onChange: (clause: Clause) => void;
  onRemove: () => void;
  canRemove: boolean;
  /** Chỉ số được chọn */
  metrics?: Metric[];
  /** Mốc so sánh ROI được chọn */
  valueTypes?: ValueType[];
}

const OPS = Object.keys(OP_LABEL) as Op[];
type ValueType = ClauseValue['type'];

const SELECT =
  'rounded-lg border border-line bg-white px-2 py-1.5 text-sm outline-none transition hover:border-muted/40 focus:border-primary focus:ring-2 focus:ring-primary-soft';

const vi = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

/** Ô số: tiền/đơn → số nguyên ("100.000"), ROI/hệ số → thập phân ("1,5"). Lưu khi rời ô */
function NumberInput({ value, integer, onCommit, label }: { value: number; integer: boolean; onCommit: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState(vi.format(value));
  useEffect(() => setDraft(vi.format(value)), [value]);

  function commit() {
    const t = draft.trim();
    // Thập phân: "1,5" hoặc "1.5" đều được; có dấu phẩy thì dấu chấm là phân cách nghìn
    const n = integer
      ? Number(t.replace(/[^\d]/g, ''))
      : Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
    if (draft.trim() === '' || !Number.isFinite(n) || n < 0) setDraft(vi.format(value));
    else {
      onCommit(n);
      setDraft(vi.format(n));
    }
  }

  return (
    <input
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`${SELECT} w-28 text-right tabular-nums`}
    />
  );
}

/** Một điều kiện: [Chỉ số] [≥] [Số / Hoà vốn × / Mục tiêu ×] [giá trị] ✕ */
export default function ClauseEditor({
  clause,
  onChange,
  onRemove,
  canRemove,
  metrics = ENTITY_METRICS,
  valueTypes = ['number', 'breakEven', 'target'],
}: ClauseEditorProps) {
  const { metric, op, value } = clause;
  const isRoi = metric === 'roi';
  // Chi phí / CPA so được với "k lần lợi nhuận 1 đơn" của sản phẩm (Sếp chốt 26/11)
  const profitable = (m: Metric) => (m === 'cost' || m === 'cpa') && valueTypes.includes('profit');

  function changeMetric(m: Metric) {
    // ROI so được với hoà vốn / mục tiêu; Chi phí / CPA so được với lợi nhuận 1 đơn; còn lại chỉ số cố định
    const keep = value.type === 'number' || (m === 'roi' ? value.type !== 'profit' : value.type === 'profit' && profitable(m));
    const nextValue: ClauseValue = keep ? value : { type: 'number', n: 0 };
    onChange({ ...clause, metric: m, value: nextValue });
  }

  function changeValueType(t: ValueType) {
    if (t === value.type) return;
    onChange({ ...clause, value: t === 'number' ? { type: 'number', n: 0 } : { type: t, k: 1 } });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select aria-label="Chỉ số" value={metric} onChange={(e) => changeMetric(e.target.value as Metric)} className={SELECT}>
        {metrics.map((m) => (
          <option key={m} value={m}>
            {METRIC_LABEL[m]}
          </option>
        ))}
      </select>

      <select aria-label="Phép so sánh" value={op} onChange={(e) => onChange({ ...clause, op: e.target.value as Op })} className={SELECT}>
        {OPS.map((o) => (
          <option key={o} value={o}>
            {OP_LABEL[o]}
          </option>
        ))}
      </select>

      {/* Đọc thành câu: "ROI < 1,2 lần ROI hoà vốn" — ô số trước, đơn vị/mốc so sánh sau */}
      {value.type === 'number' ? (
        <NumberInput
          label="Giá trị"
          value={value.n}
          integer={metric !== 'roi'}
          onCommit={(n) => onChange({ ...clause, value: { type: 'number', n } })}
        />
      ) : (
        <NumberInput
          label={`Số lần ${value.type === 'breakEven' ? 'ROI hoà vốn' : value.type === 'profit' ? 'lợi nhuận 1 đơn' : 'ROI mục tiêu'}`}
          value={value.k}
          integer={false}
          onCommit={(k) => onChange({ ...clause, value: { type: value.type, k } })}
        />
      )}

      {isRoi ? (
        <select
          aria-label="So với"
          value={value.type}
          onChange={(e) => changeValueType(e.target.value as ValueType)}
          className={SELECT}
        >
          {valueTypes.includes('number') && <option value="number">(số cố định)</option>}
          {valueTypes.includes('breakEven') && <option value="breakEven">lần ROI hoà vốn</option>}
          {valueTypes.includes('target') && <option value="target">lần ROI mục tiêu</option>}
          {value.type === 'profit' && <option value="profit">lần lợi nhuận 1 đơn</option>}
        </select>
      ) : profitable(metric) ? (
        <select
          aria-label="Đơn vị"
          value={value.type}
          onChange={(e) => changeValueType(e.target.value as ValueType)}
          title="Lợi nhuận 1 đơn = giá trị đơn trung bình 30 ngày ÷ ROI hoà vốn của sản phẩm (tự tính, mỗi sản phẩm một mức)"
          className={SELECT}
        >
          <option value="number">đ</option>
          <option value="profit">lần lợi nhuận 1 đơn</option>
        </select>
      ) : (
        <span className="text-sm text-muted">{isMoneyMetric(metric) ? 'đ' : metric === 'orders' ? 'đơn' : metric === 'budgetUse' ? '%' : ''}</span>
      )}

      {value.type === 'profit' ? (
        <span className="text-xs text-muted">(vd lợi nhuận 1 đơn 100.000đ → {vi.format(100_000 * value.k)}đ)</span>
      ) : (
        value.type !== 'number' &&
        value.k !== 1 && (
          <span className="text-xs text-muted">
            (vd {value.type === 'breakEven' ? 'hoà vốn' : 'mục tiêu'} 5 → {vi.format(5 * value.k)})
          </span>
        )
      )}

      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Xoá điều kiện"
          title="Xoá điều kiện"
          className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose-50 hover:text-danger"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
