import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Package, Pencil, X } from 'lucide-react';
import FilterSelect from '../../../../components/ui/FilterSelect';
import { conditionSetsText, newClause, type ClauseValue, type ConditionSet, type Metric } from '../../groups';
import type { AdsProduct } from '../../types';
import MediaThumb from '../../components/MediaThumb';
import ConditionSetsEditor from './ConditionSetsEditor';

interface ProductConditionsEditorProps {
  /** Điều kiện riêng hiện tại theo ID sản phẩm ([] = không xét sản phẩm đó) */
  value: Record<string, ConditionSet[]>;
  onChange: (next: Record<string, ConditionSet[]>) => void;
  /** Điều kiện chung — chép làm điểm bắt đầu khi thêm sản phẩm */
  general: ConditionSet[];
  products: AdsProduct[];
  subject: string;
  metrics: Metric[];
  valueTypes: ClauseValue['type'][];
  /** Mở sẵn khối của sản phẩm này (link "Phân nhóm riêng" từ bảng Sản phẩm) */
  focusProductId?: string | null;
}

const clone = (sets: ConditionSet[]): ConditionSet[] => sets.map((s) => ({ clauses: s.clauses.map((c) => ({ ...c, value: { ...c.value } })) }));

/**
 * Điều kiện riêng theo sản phẩm trong 1 nhóm (Sếp chốt 25/11): sản phẩm có ở đây chỉ xét bộ riêng, bỏ điều kiện chung.
 * Dùng để đẩy mạnh / giữ chặt từng sản phẩm mà không phải tạo nhóm + quy tắc mới.
 */
export default function ProductConditionsEditor({
  value,
  onChange,
  general,
  products,
  subject,
  metrics,
  valueTypes,
  focusProductId,
}: ProductConditionsEditorProps) {
  const [open, setOpen] = useState<string | null>(focusProductId && value[focusProductId] ? focusProductId : null);
  const focusRef = useRef<HTMLLIElement>(null);
  const byId = new Map(products.map((p) => [p.id, p]));
  // Điểm bắt đầu: chép điều kiện chung; điều kiện chung đang tắt (rỗng) → 1 điều kiện mặc định
  const seed = () => (general.length ? clone(general) : [{ clauses: [newClause()] }]);
  const ids = Object.keys(value);

  useEffect(() => {
    if (focusProductId && value[focusProductId]) focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // chỉ cuộn lần đầu mở
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (id: string, sets: ConditionSet[]) => onChange({ ...value, [id]: sets });
  const remove = (id: string) => {
    const next = { ...value };
    delete next[id];
    onChange(next);
    if (open === id) setOpen(null);
  };
  const add = (id: string | null) => {
    if (!id || value[id]) return;
    onChange({ ...value, [id]: seed() });
    setOpen(id);
  };

  const options = products
    .filter((p) => !value[p.id])
    .map((p) => ({ value: p.id, label: p.name, description: `ID ${p.id}`, imageUrl: p.imageUrl }));

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-sm font-semibold">
        Điều kiện riêng theo sản phẩm{ids.length > 0 && <span className="font-normal text-muted"> ({ids.length})</span>}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Sản phẩm có điều kiện riêng chỉ xét theo điều kiện riêng, bỏ điều kiện chung — dùng để đẩy mạnh hoặc giữ chặt từng sản phẩm.
      </p>

      {ids.length > 0 && (
        <ul className="mt-3 space-y-2">
          {ids.map((id) => {
            const p = byId.get(id);
            const sets = value[id];
            const off = sets.length === 0;
            const isOpen = open === id;
            return (
              <li key={id} ref={id === focusProductId ? focusRef : undefined} className="rounded-xl border border-line">
                <div className="flex items-center gap-3 p-2.5">
                  <MediaThumb src={p?.imageUrl ?? null} icon={Package} shape="square" />
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : id)}
                    className="min-w-0 flex-1 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="block truncate text-sm font-medium" title={p?.name ?? id}>
                      {p?.name ?? 'Sản phẩm không còn số liệu'} <span className="font-normal text-muted">· …{id.slice(-4)}</span>
                    </span>
                    <span className={`block truncate text-xs ${off ? 'font-medium text-amber-600' : 'text-muted'}`}>
                      {off ? 'Không xét sản phẩm này vào nhóm' : conditionSetsText(sets)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : id)}
                    aria-label={isOpen ? 'Thu gọn' : 'Sửa điều kiện riêng'}
                    title={isOpen ? 'Thu gọn' : 'Sửa điều kiện riêng'}
                    className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink"
                  >
                    {isOpen ? <ChevronDown className="size-4" /> : <Pencil className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    aria-label="Bỏ điều kiện riêng (dùng điều kiện chung)"
                    title="Bỏ điều kiện riêng — sản phẩm dùng lại điều kiện chung"
                    className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose-50 hover:text-danger"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {isOpen && (
                  <div className="space-y-3 border-t border-line p-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={off}
                        onChange={(e) => set(id, e.target.checked ? [] : seed())}
                        className="size-4 accent-primary"
                      />
                      Không xét sản phẩm này vào nhóm
                    </label>
                    {!off && (
                      <ConditionSetsEditor sets={sets} onChange={(next) => set(id, next)} subject={subject} metrics={metrics} valueTypes={valueTypes} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {focusProductId && !value[focusProductId] && byId.has(focusProductId) && (
          <button
            type="button"
            onClick={() => add(focusProductId)}
            className="w-fit max-w-xs truncate rounded-xl bg-primary-soft px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            + Riêng cho {byId.get(focusProductId)!.name}
          </button>
        )}
        <div className="max-w-md flex-1">
        <FilterSelect
          label="Sản phẩm"
          icon={Package}
          allLabel="+ Điều kiện riêng cho sản phẩm"
          options={options}
          value={null}
          onChange={add}
          searchPlaceholder="Tìm sản phẩm…"
          hideAll
        />
        </div>
      </div>
    </div>
  );
}
