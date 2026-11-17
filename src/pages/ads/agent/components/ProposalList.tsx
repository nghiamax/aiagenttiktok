import { useState } from 'react';
import { Check, X } from 'lucide-react';
import EmptyTableState from '../../components/EmptyTableState';
import type { AgentProposal, AgentRule } from '../types';
import ProposalItem from './ProposalItem';

interface ProposalListProps {
  proposals: AgentProposal[];
  rules: AgentRule[];
}

/** Tab Chờ duyệt: đề xuất của các quy tắc ở chế độ "Cần duyệt" */
export default function ProposalList({ proposals, rules }: ProposalListProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ruleName = (id: string) => rules.find((r) => r.id === id)?.name ?? null;
  const allSelected = proposals.length > 0 && selected.size === proposals.length;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={proposals.length === 0}
            onChange={() => setSelected(allSelected ? new Set() : new Set(proposals.map((p) => p.id)))}
            className="size-4 accent-primary"
          />
          Chọn tất cả {selected.size > 0 && <span className="text-muted">({selected.size} đã chọn)</span>}
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled
            title="Duyệt đã chọn · Chưa kết nối backend"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white opacity-50"
          >
            <Check className="size-4" />
            Duyệt đã chọn
          </button>
          <button
            type="button"
            disabled
            title="Bỏ qua đã chọn · Chưa kết nối backend"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium text-muted opacity-60"
          >
            <X className="size-4" />
            Bỏ qua
          </button>
        </div>
      </div>

      {proposals.length > 0 ? (
        <ul className="divide-y divide-line">
          {proposals.map((p) => (
            <ProposalItem
              key={p.id}
              item={p}
              ruleName={ruleName(p.ruleId)}
              selected={selected.has(p.id)}
              onToggle={() => toggle(p.id)}
            />
          ))}
        </ul>
      ) : (
        <EmptyTableState
          title="Chưa có đề xuất nào"
          description="Khi quy tắc ở chế độ Cần duyệt, các việc Agent muốn làm sẽ hiện ở đây để Sếp duyệt trước khi thực hiện."
        />
      )}
    </>
  );
}
