import { useState } from 'react';
import { CheckCircle2, Lightbulb, RefreshCw } from 'lucide-react';
import { formatDm } from '../../../../lib/dates';
import { useAgentStore } from '../agentStore';
import { useSuggestions, type Suggestion } from '../useSuggestions';
import SuggestionCard from './SuggestionCard';

interface SuggestionListProps {
  onOpenBreakEven: () => void;
}

/** Tab "Gợi ý": hệ thống đọc số liệu shop → gợi ý quy tắc nên bật (luôn Cần duyệt) */
export default function SuggestionList({ onOpenBreakEven }: SuggestionListProps) {
  const { suggestions, range, apply, dismiss } = useSuggestions();
  const { runNow, running } = useAgentStore();
  const [applied, setApplied] = useState<string | null>(null);

  function applyOne(s: Suggestion) {
    apply(s);
    if (s.action.kind === 'rule') setApplied(s.action.name);
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start gap-3 rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">
        <Lightbulb className="mt-0.5 size-4 shrink-0" />
        <p>
          Hệ thống đọc số liệu 7 ngày gần nhất
          {range ? ` (${formatDm(range.from)} – ${formatDm(range.to)})` : ''}, giống khoảng Agent xét — không đổi theo ngày
          Sếp đang xem — và gợi ý việc nên làm.
          Mọi quy tắc bật từ đây đều ở chế độ <span className="font-semibold">Cần duyệt</span> — Agent chỉ đề xuất, Sếp duyệt
          mới làm.
        </p>
      </div>

      {applied && (
        <div className="flex flex-col gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-accent-green sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>
              Đã bật quy tắc <span className="font-semibold">"{applied}"</span>. Bấm Quét ngay để Agent tạo đề xuất.
            </span>
          </p>
          <button
            type="button"
            onClick={() => runNow()}
            disabled={running}
            className="flex w-fit items-center gap-1.5 whitespace-nowrap rounded-lg border border-accent-green/30 bg-white px-3 py-1.5 text-xs font-semibold transition hover:bg-green-100 disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${running ? 'animate-spin' : ''}`} />
            Quét ngay
          </button>
        </div>
      )}

      {suggestions.length > 0 ? (
        <ul className="space-y-3">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onApply={() => applyOne(s)}
              onDismiss={() => dismiss(s)}
              onOpenBreakEven={onOpenBreakEven}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-green-50 text-accent-green">
            <CheckCircle2 className="size-6" />
          </div>
          <p className="font-semibold">Chưa có gợi ý nào</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Số liệu hiện tại chưa có gì đáng lo. Hệ thống sẽ gợi ý khi phát hiện video lỗ, sản phẩm lỗ, chiến dịch thiếu ngân sách…
          </p>
        </div>
      )}
    </div>
  );
}
