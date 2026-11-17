import { formatNumber } from '../../../../lib/format';
import type { RuleImpact } from '../evaluate';
import { MODE_LABEL } from '../meta';
import { signedVnd } from './VerdictBadge';

const TH = 'whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted';
const TD = 'whitespace-nowrap px-4 py-3 tabular-nums';
const pct = (x: number | null) => (x == null ? '--' : `${Math.round(x * 100)}%`);

/** Hiệu quả theo từng quy tắc */
export default function RuleImpactTable({ stats }: { stats: RuleImpact[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-canvas/60">
          <tr>
            <th className={`${TH} text-left`}>Quy tắc</th>
            <th className={`${TH} text-left`}>Chế độ</th>
            <th className={`${TH} text-right`}>Thao tác</th>
            <th className={`${TH} text-right`}>Đúng</th>
            <th className={`${TH} text-right`}>Sai</th>
            <th className={`${TH} text-right`}>Chờ</th>
            <th className={`${TH} text-right`}>Tỷ lệ đúng</th>
            <th className={`${TH} text-right`}>Lợi nhuận tác động</th>
            <th className={`${TH} text-right`}>Đề xuất bị bỏ qua</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {stats.map((s) => (
            <tr key={s.rule.id} className="transition-colors hover:bg-canvas/50">
              <td className="max-w-[240px] truncate px-4 py-3 font-medium" title={s.rule.name}>
                {s.rule.name}
              </td>
              <td className="px-4 py-3 text-muted">{MODE_LABEL[s.rule.mode]}</td>
              <td className={`${TD} text-right`}>{formatNumber(s.total)}</td>
              <td className={`${TD} text-right text-accent-green`}>{formatNumber(s.good)}</td>
              <td className={`${TD} text-right text-danger`}>{formatNumber(s.bad)}</td>
              <td className={`${TD} text-right text-muted`}>{formatNumber(s.pending)}</td>
              <td className={`${TD} text-right font-semibold`}>{pct(s.accuracy)}</td>
              <td
                className={`${TD} text-right font-semibold ${
                  s.profitEffect == null ? 'text-muted' : s.profitEffect >= 0 ? 'text-accent-green' : 'text-danger'
                }`}
              >
                {s.profitEffect == null ? '--' : signedVnd(s.profitEffect)}
              </td>
              <td className={`${TD} text-right text-muted`}>
                {s.proposals === 0 ? '--' : `${formatNumber(s.rejected)}/${formatNumber(s.proposals)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
