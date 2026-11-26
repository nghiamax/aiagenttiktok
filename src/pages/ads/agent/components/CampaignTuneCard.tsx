import { useEffect, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../../auth/AuthProvider';
import { DEFAULT_TUNE, TUNE_MODES, tuneSettingsOf, type CampaignTuneSettings, type TuneMode } from '../../../../../shared/campaignTune';
import { useAdsSettings } from '../../settings';

type NumKey = { [K in keyof CampaignTuneSettings]: CampaignTuneSettings[K] extends number ? K : never }[keyof CampaignTuneSettings];
type BoolKey = 'rescue' | 'grow' | 'autoRevert';
type Field = { key: NumKey; label: string; unit: string; hint?: string };

/** Giới hạn bảo vệ — ai có quyền chỉnh thiết lập đều thấy (P = lợi nhuận 1 đơn tham chiếu của chiến dịch) */
const PROTECT: Field[] = [
  { key: 'dayLossP', label: 'Lỗ hôm nay tối đa', unit: '× P', hint: 'Vượt → hạ ngân sách về gần mức đã chi (H3)' },
  { key: 'weekLossP', label: 'Lỗ 7 ngày tối đa', unit: '× P', hint: 'Vượt → đề xuất Sếp tắt chiến dịch (H4)' },
  { key: 'warnP', label: 'Chưa có đơn: cảnh báo khi chi ≥', unit: '× P', hint: 'H1' },
  { key: 'stopP', label: 'Chưa có đơn: bảo vệ khi chi ≥', unit: '× P', hint: 'Tiêu hết ngân sách → hạ ngân sách; tiêu ít → đề xuất tắt (H2)' },
  { key: 'learningDays', label: 'Chiến dịch mới / vừa bảo vệ: chỉ bảo vệ trong', unit: 'ngày' },
];

/** Nâng cao — chỉ Quản trị viên */
const ADVANCED: { title: string; fields: Field[] }[] = [
  {
    title: 'Đo bước thử',
    fields: [
      { key: 'minWaitDays', label: 'Đo tối thiểu', unit: 'ngày' },
      { key: 'maxWaitDays', label: 'Đo tối đa (hết mà thiếu số = không đủ cơ sở)', unit: 'ngày' },
      { key: 'maxOrderDropPct', label: 'Bước mở rộng: đơn/ngày được giảm tối đa', unit: '%' },
    ],
  },
  {
    title: 'Mức tiêu ngân sách',
    fields: [
      { key: 'fullUsePct', label: 'Tiêu hết khi ≥', unit: '% ngân sách' },
      { key: 'slowUsePct', label: 'Tiêu chậm khi <', unit: '% ngân sách' },
    ],
  },
  {
    title: 'Khi lỗ / lời mỏng',
    fields: [
      { key: 'roiUpPct', label: 'Nâng ROI mục tiêu mỗi bước', unit: '%' },
      { key: 'lossRaiseMaxPct', label: 'ROI MT dưới hoà vốn: nâng tối đa mỗi lần', unit: '%' },
      { key: 'lossBudgetCutPct', label: 'Lỗ + tiêu hết ngân sách: hạ ngân sách', unit: '%' },
      { key: 'gapPct', label: 'Ngừng siết khi ROI thực thấp hơn ROI MT ≥', unit: '%' },
      { key: 'thinMarginPct', label: 'Lời mỏng khi ROI thực < hoà vốn +', unit: '%' },
      { key: 'ceilK', label: 'Lời mỏng: ROI MT mới ≤ ROI thực ×', unit: '' },
    ],
  },
  {
    title: 'Hàng rào số liệu',
    fields: [
      { key: 'minOrders', label: 'Cần ít nhất', unit: 'đơn / 7 ngày' },
      { key: 'missingBeMaxPct', label: 'Không đánh giá khi SP thiếu hoà vốn chiếm >', unit: '% doanh thu' },
      { key: 'concentratePct', label: 'Lỗ dồn 1 sản phẩm khi chiếm ≥', unit: '% phần lỗ' },
    ],
  },
];

const ALL_FIELDS = [...PROTECT, ...ADVANCED.flatMap((s) => s.fields)];

const SWITCHES: { key: BoolKey; label: string; desc: string }[] = [
  { key: 'rescue', label: 'Cứu chiến dịch lỗ', desc: 'Nâng ROI mục tiêu / hạ ngân sách khi lỗ (B1 – B7)' },
  { key: 'grow', label: 'Mở rộng chiến dịch lời', desc: 'Tăng ngân sách / hạ ROI mục tiêu (C1 – C4)' },
  { key: 'autoRevert', label: 'Tự đo & lùi', desc: 'Bước thử làm xấu đi → đề xuất trả về (D2 – D4)' },
];

const MODE_ORDER: TuneMode[] = ['careful', 'balanced', 'growth'];

const toText = (n: number) => String(n).replace('.', ',');
const parse = (t: string) => {
  const n = Number(t.trim().replace(',', '.'));
  return t.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};

/** Chiến lược điều chỉnh ROI mục tiêu & ngân sách chiến dịch (Phân nhóm → Chiến dịch; bộ quy tắc v3, Sếp chốt 26/11) */
export default function CampaignTuneCard() {
  const { settings, save, loaded } = useAdsSettings();
  const isAdmin = useAuth().can('manage_users');
  const saved = tuneSettingsOf(settings);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [bools, setBools] = useState<Pick<CampaignTuneSettings, BoolKey>>(saved);
  const [mode, setMode] = useState<TuneMode>(saved.mode);
  const [advanced, setAdvanced] = useState(false);
  const savedKey = JSON.stringify(saved);
  const resetDraft = () => {
    setDraft(Object.fromEntries(ALL_FIELDS.map((f) => [f.key, toText(saved[f.key])])));
    setBools({ rescue: saved.rescue, grow: saved.grow, autoRevert: saved.autoRevert });
    setMode(saved.mode);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(resetDraft, [savedKey]);

  const next: Partial<CampaignTuneSettings> = { ...bools, mode };
  const bad: string[] = [];
  for (const f of ALL_FIELDS) {
    const v = parse(draft[f.key] ?? '');
    if (v == null) bad.push(f.label);
    else (next as Record<string, number>)[f.key] = v;
  }
  const savedPlain = Object.fromEntries(Object.keys(DEFAULT_TUNE).map((k) => [k, saved[k as keyof CampaignTuneSettings]]));
  const dirty = JSON.stringify({ ...savedPlain, ...next }) !== JSON.stringify(savedPlain);

  const fieldInput = (f: Field) => (
    <label key={f.key} className="block" title={f.hint}>
      <span className="mb-1 block text-xs text-muted">{f.label}</span>
      <span className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={draft[f.key] ?? ''}
          onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
          className={`w-24 rounded-lg border bg-white px-3 py-2 text-right text-sm tabular-nums outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-soft ${
            parse(draft[f.key] ?? '') == null ? 'border-danger' : 'border-line'
          }`}
        />
        {f.unit && <span className="text-sm text-muted">{f.unit}</span>}
      </span>
    </label>
  );

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Chiến lược điều chỉnh ROI mục tiêu &amp; ngân sách</h3>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Mục tiêu: tăng tổng lời/ngày, số đơn không giảm. Lỗ thì siết / bảo vệ ngay, lời thì mở rộng từng bước và đo lại — tốt thì giữ, xấu thì
            trả về. Chạy khi bật quy tắc{' '}
            <Link to="?view=rules" className="font-medium text-primary hover:text-primary-hover">
              BOT chỉnh ROI &amp; ngân sách
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => save({ ...settings, campaignTune: { ...DEFAULT_TUNE } })}
          disabled={!loaded}
          className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-50"
        >
          <RotateCcw className="size-4" />
          Khôi phục mặc định
        </button>
      </div>

      <p className="mb-2 mt-5 text-sm font-semibold text-muted">Chế độ chạy</p>
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Chế độ chạy">
        {MODE_ORDER.map((m) => {
          const p = TUNE_MODES[m];
          const on = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMode(m)}
              className={`rounded-xl border p-3 text-left transition ${on ? 'border-primary bg-primary-soft ring-2 ring-primary-soft' : 'border-line hover:bg-canvas'}`}
            >
              <b className={`block text-sm ${on ? 'text-primary' : ''}`}>
                {p.label}
                {m === 'balanced' && <span className="ml-1.5 text-xs font-normal text-muted">(mặc định)</span>}
              </b>
              <span className="block text-xs text-muted">{p.desc}</span>
              <ul className="mt-2 space-y-0.5 text-xs tabular-nums">
                <li>Tăng ngân sách mỗi bước +{p.budgetStepPct}%</li>
                <li>Hạ ROI mục tiêu mỗi bước −{p.roiDownPct}%</li>
                <li>Lỗ tối đa mỗi lần thử {p.testLossP}P</li>
                <li>Lời/ngày giảm &gt; {p.profitDropPct}% → trả về</li>
              </ul>
            </button>
          );
        })}
      </div>

      <p className="mb-1 mt-5 text-sm font-semibold text-muted">Giới hạn bảo vệ</p>
      <p className="mb-2 text-xs text-muted">P = lợi nhuận 1 đơn tham chiếu của chiến dịch (theo cơ cấu đơn 30 ngày). Tắt chiến dịch luôn do Sếp quyết.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{PROTECT.map(fieldInput)}</div>

      <p className="mb-2 mt-5 text-sm font-semibold text-muted">Tình huống áp dụng</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {SWITCHES.map((w) => (
          <button
            key={w.key}
            type="button"
            role="switch"
            aria-checked={bools[w.key]}
            onClick={() => setBools({ ...bools, [w.key]: !bools[w.key] })}
            className="flex items-center gap-3 rounded-xl border border-line p-3 text-left transition hover:bg-canvas"
          >
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${bools[w.key] ? 'bg-accent-green' : 'bg-muted/40'}`}>
              <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all ${bools[w.key] ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
            <span>
              <b className="block text-sm">{w.label}</b>
              <span className="text-xs text-muted">{w.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {isAdmin && (
        <div className="mt-5 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setAdvanced(!advanced)}
            aria-expanded={advanced}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
          >
            <ChevronDown className={`size-4 transition-transform ${advanced ? 'rotate-180' : ''}`} />
            Nâng cao (Quản trị viên)
          </button>
          {advanced &&
            ADVANCED.map((s) => (
              <div key={s.title} className="mt-4">
                <p className="mb-2 text-xs font-semibold text-muted">{s.title}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{s.fields.map(fieldInput)}</div>
              </div>
            ))}
        </div>
      )}

      {(dirty || bad.length > 0) && (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {bad.length > 0 && <span className="mr-auto text-sm text-danger">Số chưa hợp lệ: {bad.join(', ')}</span>}
          <button
            type="button"
            onClick={resetDraft}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-canvas"
          >
            Huỷ
          </button>
          <button
            type="button"
            disabled={!loaded || bad.length > 0}
            onClick={() => save({ ...settings, campaignTune: { ...savedPlain, ...next } as Partial<CampaignTuneSettings> })}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Lưu
          </button>
        </div>
      )}
    </section>
  );
}
