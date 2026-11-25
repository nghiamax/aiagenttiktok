import { ArrowRight, Lightbulb, ThumbsUp, TriangleAlert } from 'lucide-react';
import { MIN_SAMPLE, type Lesson, type LessonTarget } from '../evaluate';
import type { AgentRule } from '../types';

interface LessonListProps {
  lessons: Lesson[];
  rules: AgentRule[];
  onGoto: (target: LessonTarget) => void;
}

const TONE = {
  warn: { icon: TriangleAlert, className: 'bg-amber-50 text-amber-700' },
  good: { icon: ThumbsUp, className: 'bg-green-50 text-accent-green' },
  info: { icon: Lightbulb, className: 'bg-blue-50 text-primary' },
} as const;

const TARGET_LABEL: Record<LessonTarget, string> = {
  groups: 'Sửa phân nhóm video',
  rules: 'Mở Quy tắc',
  breakEven: 'Nhập ROI hoà vốn',
};

/** "Rút kinh nghiệm": gợi ý chỉnh quy tắc / nhóm từ kết quả thật */
export default function LessonList({ lessons, rules, onGoto }: LessonListProps) {
  const ruleName = (id: string) => rules.find((r) => r.id === id)?.name ?? id;

  if (lessons.length === 0) {
    return (
      <p className="rounded-xl bg-canvas/70 px-4 py-3 text-sm text-muted">
        Chưa có gợi ý. Gợi ý chỉ xuất hiện khi một quy tắc có ít nhất {MIN_SAMPLE} thao tác đã được chấm Đúng/Sai.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {lessons.map((l, i) => {
        const tone = TONE[l.tone];
        return (
          <li key={i} className={`flex flex-col gap-2 rounded-xl px-4 py-3 text-sm sm:flex-row sm:items-center ${tone.className}`}>
            <tone.icon className="size-4 shrink-0" />
            <span className="flex-1">
              <b>{ruleName(l.ruleId)}:</b> {l.text}
            </span>
            <button
              type="button"
              onClick={() => onGoto(l.target)}
              className="flex w-fit shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold shadow-sm transition hover:shadow-md"
            >
              {TARGET_LABEL[l.target]}
              <ArrowRight className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
