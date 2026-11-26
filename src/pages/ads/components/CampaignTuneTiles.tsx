import { formatNumber, formatVnd } from '../../../lib/format';
import { tuneActionText } from '../../../../shared/campaignTune';
import { TUNE_TONE, useCampaignTune, type CampaignTune } from '../useCampaignTune';

interface CampaignTuneTilesProps {
  /** Bấm ô → bảng Chiến dịch lọc theo tune-loss / tune-grow / tune-testing */
  onOpen: (filter: string) => void;
}

const TILES = [
  { id: 'tune-loss', kind: 'loss', title: 'Đang lỗ', empty: 'Không có chiến dịch lỗ' },
  { id: 'tune-grow', kind: 'grow', title: 'Có cơ hội tăng', empty: 'Chưa có chiến dịch còn dư địa' },
  { id: 'tune-testing', kind: 'testing', title: 'Đang thử', empty: 'Không có bước thử nào đang đo' },
] as const;

const perDay = (t: CampaignTune) => (t.econ.profit == null ? 0 : t.econ.profit / Math.max(1, t.econ.days));

/** Tổng quan → hộp Agent → tab Chiến dịch: 3 ô theo BOT chỉnh ROI & ngân sách (Sếp chốt 26/11) */
export default function CampaignTuneTiles({ onOpen }: CampaignTuneTilesProps) {
  const tunes = [...useCampaignTune().values()].filter((t) => !t.signal);
  return (
    <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
      {TILES.map((tile) => {
        const list = tunes.filter((t) => t.kind === tile.kind && (tile.kind !== 'grow' || !!t.action));
        const money = list.reduce((s, t) => s + perDay(t), 0);
        const first = list.find((t) => t.action) ?? list[0];
        return (
          <button
            key={tile.id}
            type="button"
            onClick={() => onOpen(tile.id)}
            className="flex flex-col items-start gap-2 bg-white p-5 text-left transition-colors hover:bg-canvas"
          >
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TUNE_TONE[tile.kind]}`}>
              <span className="size-1.5 rounded-full bg-current" />
              {tile.title}
            </span>
            <span className="text-2xl font-bold">
              {formatNumber(list.length)} <span className="text-sm font-normal text-muted">chiến dịch</span>
            </span>
            {list.length === 0 ? (
              <span className="text-sm text-muted">{tile.empty}</span>
            ) : (
              <>
                {tile.kind !== 'testing' && (
                  <span className={`text-sm ${money < 0 ? 'text-danger' : 'text-accent-green'}`}>
                    {money < 0 ? 'Lỗ' : 'Lời'} ~{formatVnd(Math.abs(money))}/ngày
                  </span>
                )}
                {first && (
                  <span className="text-sm text-muted">
                    → {first.action ? tuneActionText(first.action) : first.reason}
                    {list.length > 1 && ` · +${list.length - 1} chiến dịch`}
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
