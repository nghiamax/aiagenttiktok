import { useState } from 'react';
import { BookOpen, Check, ChevronDown, RotateCcw } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import GuideVideoPlayer from '../../components/ui/GuideVideoPlayer';
import { GUIDE_SECTIONS, type GuideSection } from '../../config/guide';

/** Phần đã xem — lưu trên trình duyệt (ai cũng dùng được, kể cả chưa đăng nhập) */
const DONE_KEY = 'guide-done';

function readDone(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeDone(ids: string[]) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(ids));
  } catch {
    /* bỏ qua */
  }
}

/**
 * Hướng dẫn sử dụng (/guide): checklist — mỗi phần 1 video, đánh dấu "Đã xem", thanh tiến độ.
 * Nội dung ở src/config/guide.ts (GUIDE_SECTIONS). Mở được cả khi chưa đăng nhập (data-guest-allow cho cả trang).
 */
export default function GuidePage() {
  const [done, setDone] = useState<string[]>(readDone);
  // Mở sẵn phần đầu tiên chưa xem
  const [open, setOpen] = useState<string | null>(
    () => GUIDE_SECTIONS.find((s) => !readDone().includes(s.id))?.id ?? GUIDE_SECTIONS[0]?.id ?? null,
  );
  const ids = new Set(GUIDE_SECTIONS.map((s) => s.id));
  const doneCount = done.filter((id) => ids.has(id)).length;
  const total = GUIDE_SECTIONS.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const update = (next: string[]) => {
    setDone(next);
    writeDone(next);
  };
  const toggleDone = (s: GuideSection) => {
    if (done.includes(s.id)) return update(done.filter((x) => x !== s.id));
    update([...done, s.id]);
    // Xem xong → mở phần kế tiếp chưa xem
    const next = GUIDE_SECTIONS.find((x) => x.id !== s.id && !done.includes(x.id));
    setOpen(next?.id ?? null);
  };

  return (
    <div data-guest-allow>
      <PageHeader
        icon={BookOpen}
        title="Hướng dẫn sử dụng"
        description="Xem lần lượt từng video để làm quen với các chức năng. Xem xong phần nào thì đánh dấu để theo dõi tiến độ."
      />

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold">
            Đã xem {doneCount}/{total} phần
            {doneCount === total && total > 0 && <span className="ml-2 text-accent-green">· Hoàn thành 🎉</span>}
          </p>
          {doneCount > 0 && (
            <button
              type="button"
              onClick={() => update([])}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition hover:bg-canvas hover:text-ink"
            >
              <RotateCcw className="size-3.5" />
              Xem lại từ đầu
            </button>
          )}
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-canvas"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Tiến độ xem hướng dẫn"
        >
          <div className="h-full rounded-full bg-accent-green transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <ol className="space-y-3">
        {GUIDE_SECTIONS.map((s, i) => {
          const isDone = done.includes(s.id);
          const isOpen = open === s.id;
          return (
            <li key={s.id}>
              <Card className={isOpen ? 'ring-1 ring-primary/20' : ''}>
                <div className="flex items-center gap-3 p-4 md:p-5">
                  <button
                    type="button"
                    onClick={() => toggleDone(s)}
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={isDone ? `Bỏ đánh dấu đã xem: ${s.title}` : `Đánh dấu đã xem: ${s.title}`}
                    title={isDone ? 'Bỏ đánh dấu đã xem' : 'Đánh dấu đã xem'}
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition ${
                      isDone
                        ? 'border-accent-green bg-accent-green text-white hover:opacity-90'
                        : 'border-line text-muted hover:border-primary hover:text-primary'
                    }`}
                  >
                    {isDone ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : s.id)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block font-semibold ${isDone ? 'text-muted line-through decoration-muted/40' : ''}`}>
                        {s.title}
                      </span>
                      <span className="block truncate text-sm text-muted">{s.description}</span>
                    </span>
                    <ChevronDown className={`size-5 shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-line p-4 md:p-5">
                    <div className="mx-auto max-w-3xl space-y-4">
                      <GuideVideoPlayer url={s.videoUrl} title={s.title} />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => toggleDone(s)}
                          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                            isDone
                              ? 'border border-line text-muted hover:bg-canvas hover:text-ink'
                              : 'bg-primary text-white hover:bg-primary-hover'
                          }`}
                        >
                          <Check className="size-4" />
                          {isDone ? 'Đã xem — bỏ đánh dấu' : 'Đánh dấu đã xem'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
