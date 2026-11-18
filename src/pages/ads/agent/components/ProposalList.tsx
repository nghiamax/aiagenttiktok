import { useEffect, useState } from 'react';
import { Check, CheckCircle2, X } from 'lucide-react';
import SegmentedControl from '../../../../components/ui/SegmentedControl';
import EmptyTableState from '../../components/EmptyTableState';
import type { AgentProposal, AgentRule, ProposalStatus } from '../types';
import ProposalItem from './ProposalItem';

interface ProposalListProps {
  /** Toàn bộ đề xuất (mọi trạng thái) */
  proposals: AgentProposal[];
  rules: AgentRule[];
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<void>;
}

const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Đã bỏ qua',
  expired: 'Hết hạn',
};

const EMPTY: Record<ProposalStatus, { title: string; description: string }> = {
  pending: {
    title: 'Không có đề xuất nào đang chờ',
    description: 'Khi quy tắc ở chế độ Cần duyệt, các việc Agent muốn làm sẽ hiện ở đây để Sếp duyệt trước khi thực hiện.',
  },
  approved: { title: 'Chưa duyệt đề xuất nào', description: 'Đề xuất Sếp đã duyệt sẽ hiện ở đây.' },
  rejected: { title: 'Chưa bỏ qua đề xuất nào', description: 'Đề xuất Sếp bỏ qua sẽ hiện ở đây.' },
  expired: { title: 'Chưa có đề xuất hết hạn', description: 'Đề xuất quá 24 giờ chưa duyệt sẽ chuyển sang đây.' },
};

const STATUSES: ProposalStatus[] = ['pending', 'approved', 'rejected', 'expired'];
const NOTICE_MS = 6000;

/** Tab Chờ duyệt: đề xuất của Agent, lọc theo Chờ duyệt / Đã duyệt / Đã bỏ qua / Hết hạn */
export default function ProposalList({ proposals, rules, onDecide }: ProposalListProps) {
  const [status, setStatus] = useState<ProposalStatus>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /** Xác nhận sau khi duyệt / bỏ qua */
  const [notice, setNotice] = useState<{ decision: 'approve' | 'reject'; count: number } | null>(null);

  const ruleName = (id: string) => rules.find((r) => r.id === id)?.name ?? null;
  const count = (s: ProposalStatus) => proposals.filter((p) => p.status === s).length;
  const shown = proposals.filter((p) => p.status === status);
  const isPending = status === 'pending';
  const allSelected = shown.length > 0 && selected.size === shown.length;

  // Tự ẩn dòng xác nhận
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  function changeStatus(s: ProposalStatus) {
    setStatus(s);
    setSelected(new Set());
    setNotice(null);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function decide(ids: string[], decision: 'approve' | 'reject') {
    setBusy(true);
    for (const id of ids) await onDecide(id, decision);
    setSelected(new Set());
    setBusy(false);
    setNotice({ decision, count: ids.length });
  }

  return (
    <>
      <p className="border-b border-line bg-amber-50 px-5 py-3 text-sm text-amber-700">
        Giai đoạn thử: <span className="font-semibold">Duyệt</span> chỉ ghi nhận Sếp đồng ý, Agent{' '}
        <span className="font-semibold">chưa</span> thao tác trên TikTok. Thực thi thật sẽ bật sau khi Sếp xác nhận.
      </p>

      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl
          ariaLabel="Lọc đề xuất theo trạng thái"
          value={status}
          onChange={changeStatus}
          options={STATUSES.map((s) => ({ value: s, label: `${STATUS_LABEL[s]} (${count(s)})` }))}
        />

        {isPending && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={shown.length === 0}
                onChange={() => setSelected(allSelected ? new Set() : new Set(shown.map((p) => p.id)))}
                className="size-4 accent-primary"
              />
              Chọn tất cả {selected.size > 0 && <span className="text-muted">({selected.size})</span>}
            </label>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => decide([...selected], 'approve')}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="size-4" />
              Duyệt đã chọn
            </button>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => decide([...selected], 'reject')}
              className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="size-4" />
              Bỏ qua
            </button>
          </div>
        )}
      </div>

      {notice && (
        <p
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-green-50 px-5 py-3 text-sm text-accent-green"
          aria-live="polite"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          <span className="font-semibold">
            {notice.decision === 'approve' ? 'Đã duyệt' : 'Đã bỏ qua'} {notice.count} đề xuất
          </span>
          {notice.decision === 'approve' && <span>— chưa thực thi trên TikTok (giai đoạn thử).</span>}
          <button
            type="button"
            onClick={() => changeStatus(notice.decision === 'approve' ? 'approved' : 'rejected')}
            className="font-semibold underline underline-offset-2 hover:text-ink"
          >
            Xem ở mục {notice.decision === 'approve' ? 'Đã duyệt' : 'Đã bỏ qua'}
          </button>
        </p>
      )}

      {shown.length > 0 ? (
        <ul className="divide-y divide-line">
          {shown.map((p) => (
            <ProposalItem
              key={p.id}
              item={p}
              ruleName={ruleName(p.ruleId)}
              selected={selected.has(p.id)}
              onToggle={() => toggle(p.id)}
              onDecide={(d) => decide([p.id], d)}
            />
          ))}
        </ul>
      ) : (
        <EmptyTableState title={EMPTY[status].title} description={EMPTY[status].description} />
      )}
    </>
  );
}
