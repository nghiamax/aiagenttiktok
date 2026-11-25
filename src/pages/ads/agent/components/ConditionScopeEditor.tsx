import { useState } from 'react';
import { Package } from 'lucide-react';
import FilterSelect from '../../../../components/ui/FilterSelect';
import type { ClauseValue, ConditionSet, Metric } from '../../groups';
import type { AdsProduct } from '../../types';
import ConditionSetsEditor from './ConditionSetsEditor';

interface ConditionScopeEditorProps {
  /** Điều kiện chung */
  general: ConditionSet[];
  onGeneralChange: (sets: ConditionSet[]) => void;
  /** Điều kiện riêng theo ID sản phẩm ([] = không xét sản phẩm đó) */
  own: Record<string, ConditionSet[]>;
  onOwnChange: (next: Record<string, ConditionSet[]>) => void;
  products: AdsProduct[];
  subject: string;
  metrics: Metric[];
  valueTypes: ClauseValue['type'][];
  /** Chọn sẵn sản phẩm này (link "Phân nhóm riêng" từ bảng Sản phẩm) */
  initialProductId?: string | null;
}

const clone = (sets: ConditionSet[]): ConditionSet[] => sets.map((s) => ({ clauses: s.clauses.map((c) => ({ ...c, value: { ...c.value } })) }));

/**
 * Điều kiện của nhóm theo phạm vi (Sếp chốt 25/11): ô "Áp dụng cho" = Tất cả sản phẩm (điều kiện chung) hoặc 1 sản phẩm.
 * Sản phẩm chưa có riêng → hiện điều kiện chung, sửa là thành điều kiện riêng. Sản phẩm có riêng chỉ xét bộ riêng.
 */
export default function ConditionScopeEditor({
  general,
  onGeneralChange,
  own,
  onOwnChange,
  products,
  subject,
  metrics,
  valueTypes,
  initialProductId = null,
}: ConditionScopeEditorProps) {
  const [productId, setProductId] = useState<string | null>(initialProductId);
  const byId = new Map(products.map((p) => [p.id, p]));
  const ownIds = Object.keys(own);
  const shortName = (id: string) => byId.get(id)?.name ?? `…${id.slice(-4)}`;

  // Sản phẩm có điều kiện riêng lên đầu (kể cả SP không còn số liệu)
  const options = [
    ...ownIds.map((id) => ({
      value: id,
      label: byId.get(id)?.name ?? `Sản phẩm …${id.slice(-4)}`,
      description: own[id].length ? 'Đang dùng điều kiện riêng' : 'Không xét vào nhóm',
      imageUrl: byId.get(id)?.imageUrl ?? null,
    })),
    ...products
      .filter((p) => !own[p.id])
      .map((p) => ({ value: p.id, label: p.name, description: 'Đang dùng điều kiện chung', imageUrl: p.imageUrl })),
  ];

  const setOwn = (id: string, sets: ConditionSet[]) => onOwnChange({ ...own, [id]: sets });
  const removeOwn = (id: string) => {
    const next = { ...own };
    delete next[id];
    onOwnChange(next);
  };

  const mine = productId ? own[productId] : undefined;
  const off = mine !== undefined && mine.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="w-full max-w-md">
          <FilterSelect
            label="Áp dụng cho"
            icon={Package}
            allLabel="Tất cả sản phẩm"
            options={options}
            value={productId}
            onChange={setProductId}
            searchPlaceholder="Tìm sản phẩm…"
          />
        </div>
        {ownIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted">Riêng:</span>
            {ownIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setProductId(id)}
                title={byId.get(id)?.name ?? id}
                className={`max-w-[180px] truncate rounded-full px-2.5 py-1 font-medium transition-colors ${
                  id === productId ? 'bg-primary text-white' : 'bg-primary-soft text-primary hover:bg-primary hover:text-white'
                }`}
              >
                {shortName(id)}
                {own[id].length === 0 && ' · không xét'}
              </button>
            ))}
          </div>
        )}
      </div>

      {productId == null ? (
        <>
          {ownIds.length > 0 && (
            <p className="text-xs text-muted">
              Điều kiện chung áp cho mọi sản phẩm, trừ {ownIds.length} sản phẩm dùng điều kiện riêng.
            </p>
          )}
          <ConditionSetsEditor sets={general} onChange={onGeneralChange} subject={subject} metrics={metrics} valueTypes={valueTypes} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={off}
                onChange={(e) => (e.target.checked ? setOwn(productId, []) : removeOwn(productId))}
                className="size-4 accent-primary"
              />
              Không xét sản phẩm này vào nhóm
            </label>
            {mine !== undefined && (
              <button type="button" onClick={() => removeOwn(productId)} className="text-sm font-medium text-primary hover:text-primary-hover">
                Về điều kiện chung
              </button>
            )}
          </div>
          {!off &&
            (mine === undefined ? (
              <>
                <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
                  Đang dùng điều kiện chung — sửa ở đây sẽ thành điều kiện riêng cho sản phẩm này.
                </p>
                <ConditionSetsEditor
                  sets={general}
                  onChange={(next) => setOwn(productId, clone(next))}
                  subject={subject}
                  metrics={metrics}
                  valueTypes={valueTypes}
                />
              </>
            ) : (
              <>
                <p className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary">
                  Điều kiện riêng — sản phẩm này chỉ xét theo điều kiện dưới đây, bỏ điều kiện chung.
                </p>
                <ConditionSetsEditor sets={mine} onChange={(next) => setOwn(productId, next)} subject={subject} metrics={metrics} valueTypes={valueTypes} />
              </>
            ))}
        </>
      )}
    </div>
  );
}
