import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Eye } from 'lucide-react';
import { ruleLevel } from '../../../../../shared/agentMatch';
import type { SignalItem } from '../useSignals';
import { ActionCell, ITEM_GRID, TargetCell } from './AgentBits';
import WindowsTable from './WindowsTable';

const TAB_OF_LEVEL = { video: 'videos', product: 'products', campaign: 'campaigns' } as const;

/**
 * Phần "Đang có dấu hiệu — Agent theo dõi" ở tab Chờ duyệt (Sếp chốt 22/11):
 * báo cho người dùng biết, KHÔNG có nút Duyệt / Gỡ — đủ 14 ngày cùng nhóm thì Agent mới đưa lên Cần duyệt.
 */
export default function SignalList({ items }: { items: SignalItem[] }) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;

  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-5 py-3 text-left text-sm transition-colors hover:bg-canvas/60"
      >
        <ChevronRight className={`size-4 text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
        <Eye className="size-4 text-amber-600" />
        <span className="font-semibold">Đang có dấu hiệu — Agent theo dõi ({items.length})</span>
        <span className="text-xs text-muted">7 ngày gần nhất đã thuộc nhóm, 14 ngày chưa · chưa cần làm gì</span>
      </button>
      {open && (
        <ul className="divide-y divide-line border-t border-line bg-amber-50/30">
          {items.map((s) => {
            const level = ruleLevel(s.rule);
            return (
              <li key={s.key} className={ITEM_GRID}>
                <div className="text-xs text-muted">
                  <p className="font-semibold text-amber-700">Dấu hiệu {s.groupName}</p>
                  <p className="mt-0.5">Chưa đề xuất</p>
                </div>
                <ActionCell actionType={s.rule.actionType} ruleName={s.rule.name} params={s.rule.params} />
                <TargetCell target={s.target.target} />
                <div className="space-y-2">
                  <WindowsTable before={s.before} windows={s.windows} />
                  <p className="text-sm text-muted">
                    7 ngày gần nhất thuộc <b className="text-ink">{s.groupName}</b>, 14 ngày vẫn là {s.group14Name} — Agent chờ thêm. Nếu 14 ngày
                    cũng {s.groupName.toLowerCase()} sẽ chuyển lên Cần duyệt.
                  </p>
                </div>
                <div className="lg:text-right">
                  <Link
                    to={`/ads?tab=${TAB_OF_LEVEL[level]}&action=${encodeURIComponent(s.rule.trigger ?? '')}`}
                    className="text-sm font-medium text-primary transition-colors hover:text-primary-hover"
                  >
                    Xem ở bảng
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
