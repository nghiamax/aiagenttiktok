import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TUNE_CODES, TUNE_RULE_GROUPS, tuneRuleRows, type TuneConfig } from '../../../../../shared/campaignTune';

interface TuneRulesTableProps {
  /** Cấu hình đang xem (bản nháp chưa lưu) — số trong bảng đổi theo */
  config: TuneConfig;
}

/** Bảng mọi tình huống BOT chỉnh chiến dịch, theo đúng thứ tự xét, kèm số đang cài (Sếp yêu cầu 27/11) */
export default function TuneRulesTable({ config }: TuneRulesTableProps) {
  const [open, setOpen] = useState(false);
  const rows = tuneRuleRows(config);

  return (
    <div className="mt-5 border-t border-line pt-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
      >
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        Xem bảng quy tắc ({rows.length} tình huống)
      </button>
      {open && (
        <div className="mt-3">
          <p className="mb-3 text-xs text-muted">
            BOT xét từ trên xuống, khớp dòng nào thì dừng ở đó. P = lợi nhuận 1 đơn tham chiếu của chiến dịch. Số trong bảng là số đang cài ở
            trên (đổi số là bảng đổi theo).
          </p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-canvas text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Mã</th>
                  <th className="px-3 py-2 font-semibold">Khi nào</th>
                  <th className="px-3 py-2 font-semibold">BOT làm</th>
                </tr>
              </thead>
              {TUNE_RULE_GROUPS.map((g) => {
                const list = rows.filter((r) => r.group === g.id);
                return (
                  <tbody key={g.id} className="border-t border-line">
                    <tr>
                      <td colSpan={3} className="bg-primary-soft/50 px-3 py-1.5 text-xs font-semibold text-primary">
                        {g.label}
                      </td>
                    </tr>
                    {list.map((r) => (
                      <tr key={r.code} className={`border-t border-line align-top ${r.off ? 'opacity-50' : ''}`}>
                        <td className="whitespace-nowrap px-3 py-2">
                          <b className="tabular-nums">{r.code}</b>
                          <span className="block text-xs text-muted">{TUNE_CODES[r.code]}</span>
                        </td>
                        <td className="px-3 py-2">{r.when}</td>
                        <td className="px-3 py-2">
                          {r.action}
                          {r.off && <span className="ml-1.5 rounded bg-canvas px-1.5 py-0.5 text-xs text-muted">đang tắt</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
