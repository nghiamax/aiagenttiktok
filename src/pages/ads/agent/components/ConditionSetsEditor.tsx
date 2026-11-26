import { Plus, X } from 'lucide-react';
import { ENTITY_METRICS, newClause, type Clause, type ClauseValue, type ConditionSet, type Metric } from '../../groups';
import ClauseEditor from './ClauseEditor';

interface ConditionSetsEditorProps {
  sets: ConditionSet[];
  onChange: (sets: ConditionSet[]) => void;
  /** "Video thuộc nhóm", "Chiến dịch khớp", … */
  subject: string;
  /** Chỉ số được dùng (mặc định: không có mức tiêu ngân sách) */
  metrics?: Metric[];
  /** Mốc so sánh ROI được dùng */
  valueTypes?: ClauseValue['type'][];
  /** Lợi nhuận 1 đơn của sản phẩm đang sửa (điều kiện theo sản phẩm) */
  profitPerOrder?: number | null;
}

/** Sửa các "cách" (HOẶC), mỗi cách gồm nhiều điều kiện (VÀ) */
export default function ConditionSetsEditor({
  sets,
  onChange,
  subject,
  metrics = ENTITY_METRICS,
  valueTypes = ['number', 'breakEven', 'target'],
  profitPerOrder,
}: ConditionSetsEditorProps) {
  const updateClause = (si: number, ci: number, clause: Clause) =>
    onChange(sets.map((s, i) => (i === si ? { clauses: s.clauses.map((c, j) => (j === ci ? clause : c)) } : s)));
  const removeClause = (si: number, ci: number) =>
    onChange(sets.map((s, i) => (i === si ? { clauses: s.clauses.filter((_, j) => j !== ci) } : s)));
  const addClause = (si: number) => onChange(sets.map((s, i) => (i === si ? { clauses: [...s.clauses, newClause()] } : s)));

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        {subject} khi khớp <b className="text-ink">một trong</b> các cách:
      </p>
      {sets.map((set, si) => (
        <div key={si}>
          {si > 0 && <p className="py-1 pl-3 text-xs font-bold uppercase tracking-wide text-accent-violet">Hoặc</p>}
          <div className="rounded-xl border border-line bg-canvas/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Cách {si + 1}</span>
              {sets.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(sets.filter((_, i) => i !== si))}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-rose-50 hover:text-danger"
                >
                  <X className="size-3.5" />
                  Bỏ cách này
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {set.clauses.map((c, ci) => (
                <div key={ci} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-xs font-bold text-muted">{ci === 0 ? '' : 'VÀ'}</span>
                  <ClauseEditor
                    clause={c}
                    onChange={(next) => updateClause(si, ci, next)}
                    onRemove={() => removeClause(si, ci)}
                    canRemove={set.clauses.length > 1}
                    metrics={metrics}
                    valueTypes={valueTypes}
                    profitPerOrder={profitPerOrder}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => addClause(si)}
              className="ml-8 mt-2 flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
            >
              <Plus className="size-4" />
              Thêm điều kiện (VÀ)
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...sets, { clauses: [newClause()] }])}
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-accent-violet transition-colors hover:bg-violet-50"
      >
        <Plus className="size-4" />
        Thêm cách khác (HOẶC)
      </button>
    </div>
  );
}
