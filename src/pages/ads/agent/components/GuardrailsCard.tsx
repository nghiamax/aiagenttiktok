import { ShieldCheck } from 'lucide-react';
import type { AgentGuardrails } from '../types';
import NumberField from './NumberField';

interface GuardrailsCardProps {
  guardrails: AgentGuardrails;
  onChange: (patch: Partial<AgentGuardrails>) => void;
  onReset: () => void;
}

/** Giới hạn an toàn áp cho mọi quy tắc */
export default function GuardrailsCard({ guardrails: g, onChange, onReset }: GuardrailsCardProps) {
  return (
    <section className="rounded-2xl border border-line bg-canvas/60 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5 text-accent-green" />
          Giới hạn an toàn
        </h3>
        <button
          type="button"
          onClick={onReset}
          className="w-fit rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-white hover:text-ink"
        >
          Khôi phục mặc định (cả quy tắc)
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">Áp cho mọi quy tắc, kể cả khi Tự chạy. Vượt giới hạn thì Agent dừng và chờ hôm sau.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <NumberField
          label="Trần chi tăng cường"
          hint="Tổng tiền tăng cường mỗi ngày"
          suffix="đ/ngày"
          value={g.dailyBoostCap}
          onCommit={(n) => onChange({ dailyBoostCap: n })}
        />
        <NumberField
          label="Số thao tác tối đa"
          hint="Mọi loại thao tác cộng lại"
          suffix="/ngày"
          min={1}
          value={g.maxActionsPerDay}
          onCommit={(n) => onChange({ maxActionsPerDay: n })}
        />
        <NumberField
          label="Thời gian chờ mặc định"
          hint="Giữa 2 thao tác trên cùng video"
          suffix="giờ"
          value={g.cooldownHours}
          onCommit={(n) => onChange({ cooldownHours: n })}
        />
        <NumberField
          label="Tăng ngân sách tối đa"
          hint="Mỗi chiến dịch, mỗi ngày"
          suffix="%/ngày"
          min={1}
          value={g.maxBudgetIncreasePct}
          onCommit={(n) => onChange({ maxBudgetIncreasePct: n })}
        />
        <NumberField
          label="Giảm ngân sách tối đa"
          hint="Tránh cắt quá tay làm mất đà học"
          suffix="%/ngày"
          min={1}
          value={g.maxBudgetDecreasePct}
          onCommit={(n) => onChange({ maxBudgetDecreasePct: n })}
        />
        <NumberField
          label="Đánh giá kết quả sau"
          hint="Đơn về trễ nên chờ rồi mới so"
          suffix="giờ"
          value={g.evaluateAfterHours}
          onCommit={(n) => onChange({ evaluateAfterHours: n })}
        />
      </div>
    </section>
  );
}
