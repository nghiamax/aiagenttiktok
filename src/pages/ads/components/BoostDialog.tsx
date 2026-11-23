import { useState } from 'react';
import Modal from '../../../components/ui/Modal';
import { MIN_BOOST_BUDGET_VND } from '../../../../shared/agentPolicy';
import { formatNumber } from '../../../lib/format';

interface BoostDialogProps {
  title: string;
  /** Tăng cường đã dùng hôm nay / trần (Giới hạn an toàn) */
  usedToday: number;
  dailyCap: number;
  onNext: (boostBudget: number, boostDays: number) => void;
  onClose: () => void;
}

const MAX_DAYS = 7;
const vnd = (n: number) => `${formatNumber(Math.round(n))}đ`;

/** Bước 1 của Tăng cường thủ công: nhập ngân sách/ngày + số ngày → bước 2 là hộp xác nhận */
export default function BoostDialog({ title, usedToday, dailyCap, onNext, onClose }: BoostDialogProps) {
  const [budget, setBudget] = useState(String(MIN_BOOST_BUDGET_VND));
  const [days, setDays] = useState('1');
  const b = Math.round(Number(budget.replace(/\D/g, '')));
  const d = Math.round(Number(days));
  const budgetError = !(b >= MIN_BOOST_BUDGET_VND) ? `Tối thiểu ${vnd(MIN_BOOST_BUDGET_VND)}/ngày (mức tối thiểu của TikTok)` : null;
  const daysError = !(d >= 1 && d <= MAX_DAYS) ? `Từ 1 đến ${MAX_DAYS} ngày` : null;
  const overCap = !budgetError && usedToday + b > dailyCap;
  const field = 'w-full rounded-xl border border-line px-3 py-2 text-sm tabular-nums outline-none transition focus:border-primary';

  return (
    <Modal
      title="Tăng cường video"
      description={title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink"
          >
            Huỷ
          </button>
          <button
            type="button"
            disabled={!!budgetError || !!daysError || overCap}
            onClick={() => onNext(b, d)}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Tiếp tục
          </button>
        </div>
      }
    >
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Ngân sách / ngày (đ)</span>
          <input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} className={field} />
          {budgetError && <span className="block text-xs text-danger">{budgetError}</span>}
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Số ngày</span>
          <input type="number" min={1} max={MAX_DAYS} value={days} onChange={(e) => setDays(e.target.value)} className={field} />
          {daysError && <span className="block text-xs text-danger">{daysError}</span>}
        </label>
        <p className="text-sm text-muted sm:col-span-2">
          {!budgetError && !daysError && (
            <>
              Tối đa <b className="text-ink">{vnd(b * d)}</b> trong {d} ngày.{' '}
            </>
          )}
          Hôm nay đã tăng cường {vnd(usedToday)} / trần {vnd(dailyCap)}.
        </p>
        {overCap && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 sm:col-span-2">
            Vượt trần tăng cường hôm nay. Giảm ngân sách hoặc nâng trần ở Care Ads → Quy tắc → Giới hạn an toàn.
          </p>
        )}
      </div>
    </Modal>
  );
}
