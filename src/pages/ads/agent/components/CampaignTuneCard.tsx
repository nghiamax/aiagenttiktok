import { useEffect, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../../auth/AuthProvider';
import { DEFAULT_TUNE, TUNE_MODES, tuneSettingsOf, type CampaignTuneSettings, type TuneMode } from '../../../../../shared/campaignTune';
import { useAdsSettings } from '../../settings';
import TuneRulesTable from './TuneRulesTable';

type NumKey = { [K in keyof CampaignTuneSettings]: CampaignTuneSettings[K] extends number ? K : never }[keyof CampaignTuneSettings];
type BoolKey = 'rescue' | 'grow' | 'autoRevert';
type Field = { key: NumKey; label: string; unit: string; desc: string };

/** Giới hạn bảo vệ — ai có quyền chỉnh thiết lập đều thấy (P = lợi nhuận 1 đơn tham chiếu của chiến dịch) */
const PROTECT: Field[] = [
  { key: 'dayLossP', label: 'Lỗ hôm nay tối đa', unit: '× P', desc: 'Hôm nay lỗ quá mức này → BOT hạ ngân sách về gần số đã tiêu để ngừng chạy hôm nay. Hôm sau ngon lại thì trả ngân sách cũ.' },
  { key: 'weekLossP', label: 'Lỗ 7 ngày tối đa', unit: '× P', desc: 'Cộng dồn 7 ngày lỗ quá mức này → BOT báo "Nên tắt chiến dịch" để Sếp tự tắt trên TikTok.' },
  { key: 'warnP', label: 'Chưa có đơn: cảnh báo khi chi ≥', unit: '× P', desc: 'Đã tiêu tới mức này mà chưa ra đơn → BOT chỉ báo cho Sếp biết, chưa đụng gì.' },
  { key: 'stopP', label: 'Chưa có đơn: bảo vệ khi chi ≥', unit: '× P', desc: 'Tiêu tới mức này vẫn 0 đơn → đang tiêu hết ngân sách thì BOT hạ ngân sách; tiêu ít thì báo "Nên tắt".' },
  {
    key: 'learningDays',
    label: 'Chiến dịch mới / vừa hạ ngân sách vì lỗ kéo dài: không tăng ngân sách trong',
    unit: 'ngày',
    desc: 'Trong số ngày này BOT chỉ canh lỗ, không tăng ngân sách / hạ ROI. Nếu 2 ngày có lời và tiêu hết ngân sách mới thì mở sớm.',
  },
];

/** Nâng cao — chỉ Quản trị viên */
const ADVANCED: { title: string; fields: Field[] }[] = [
  {
    title: 'Đo bước thử',
    fields: [
      { key: 'minWaitDays', label: 'Đo tối thiểu', unit: 'ngày', desc: 'Sau mỗi lần chỉnh, chờ ít nhất bấy nhiêu ngày mới chấm đúng / sai.' },
      { key: 'maxWaitDays', label: 'Đo tối đa (hết mà thiếu số = không đủ cơ sở)', unit: 'ngày', desc: 'Chờ tới bấy nhiêu ngày vẫn ít đơn → giữ số mới, tạm không thử tiếp.' },
      { key: 'maxOrderDropPct', label: 'Bước mở rộng: đơn/ngày được giảm tối đa', unit: '%', desc: 'Sau khi tăng ngân sách / chỉnh ROI lúc đang lời, đơn giảm quá mức này → trả về số cũ.' },
    ],
  },
  {
    title: 'Mức tiêu ngân sách',
    fields: [
      { key: 'fullUsePct', label: 'Tiêu hết khi ≥', unit: '% ngân sách', desc: 'Tiêu từ mức này trở lên = "tiêu hết": lời thì tăng ngân sách, lỗ thì hạ ngân sách.' },
      { key: 'slowUsePct', label: 'Tiêu chậm khi <', unit: '% ngân sách', desc: 'Tiêu dưới mức này = "tiêu chậm": lời thì hạ ROI mục tiêu để TikTok phân phối mạnh hơn.' },
    ],
  },
  {
    title: 'Khi lỗ / lời mỏng',
    fields: [
      { key: 'roiUpPct', label: 'Nâng ROI mục tiêu mỗi bước', unit: '%', desc: 'Đang lỗ (tiêu chưa hết) hoặc lời mỏng thì mỗi lần nâng ROI mục tiêu bấy nhiêu. Vd 4 → 4,2.' },
      { key: 'lossRaiseMaxPct', label: 'ROI MT dưới hoà vốn: nâng tối đa mỗi lần', unit: '%', desc: 'Lỗ mà ROI mục tiêu đặt thấp hơn hoà vốn → nâng nhanh hơn về phía hoà vốn, tối đa bấy nhiêu mỗi lần.' },
      { key: 'lossBudgetCutPct', label: 'Lỗ + tiêu hết ngân sách: hạ ngân sách', unit: '%', desc: 'Lỗ kéo dài mà đang tiêu hết tiền → hạ ngân sách bấy nhiêu. Vd 1.000k → 800k.' },
      { key: 'gapPct', label: 'Ngừng siết khi ROI thực thấp hơn ROI MT ≥', unit: '%', desc: 'ROI thực đã thấp hơn mục tiêu quá xa → TikTok không đạt nổi, BOT ngừng nâng và báo Sếp.' },
      { key: 'thinMarginPct', label: 'Lời mỏng khi ROI thực < hoà vốn +', unit: '%', desc: 'Ranh giới lời mỏng / lời rõ. Hoà vốn 4, mức 10% → ROI thực dưới 4,4 là lời mỏng.' },
      { key: 'ceilK', label: 'Lời mỏng: ROI MT mới ≤ ROI thực ×', unit: '', desc: 'Lời mỏng mà nâng ROI mục tiêu thì không vượt ROI thực × hệ số này (1 = không vượt ROI thực).' },
      { key: 'protectCutPct', label: 'Bảo vệ (chưa có đơn / lỗ hôm nay): hạ ngân sách tối đa', unit: '%', desc: 'Mức hạ ngân sách lớn nhất khi BOT bảo vệ khẩn (chưa ra đơn mà chi nhiều, hoặc lỗ hôm nay).' },
    ],
  },
  {
    title: 'Khi đang lời: thử nâng ROI mục tiêu',
    fields: [
      { key: 'headroomK', label: 'Bắt buộc thử nâng khi ROI thực ≥ ROI MT ×', unit: '', desc: 'ROI thực vượt mục tiêu từ bấy nhiêu lần = mục tiêu đặt quá thấp → BOT thử nâng. Vd 1,2: mục tiêu 4, thực ≥ 4,8.' },
      { key: 'nearK', label: 'Tiêu 50–90%: chỉ thử nâng khi ROI thực ≥ ROI MT ×', unit: '', desc: 'ROI thực sát mục tiêu mới thử nâng. Vd 0,85: mục tiêu 8 thì thực phải ≥ 6,8; thấp hơn thì giữ.' },
      { key: 'raiseCooldownDays', label: 'Thử nâng bị trả về: không thử lại trong', unit: 'ngày', desc: 'Nâng ROI làm đơn / lời giảm phải trả về → coi như chạm trần, bấy nhiêu ngày không thử nâng nữa.' },
    ],
  },
  {
    title: 'Hàng rào số liệu',
    fields: [
      { key: 'minOrders', label: 'Cần ít nhất', unit: 'đơn / 7 ngày', desc: 'Ít đơn hơn thì BOT chưa chỉnh — ít đơn quá dễ kết luận sai.' },
      { key: 'missingBeMaxPct', label: 'Không đánh giá khi SP thiếu hoà vốn chiếm >', unit: '% doanh thu', desc: 'Sản phẩm chưa nhập ROI hoà vốn chiếm nhiều doanh thu quá → không tính được lời / lỗ, BOT không chỉnh.' },
      { key: 'concentratePct', label: 'Lỗ dồn 1 sản phẩm khi chiếm ≥', unit: '% phần lỗ', desc: 'Phần lớn lỗ nằm ở 1 sản phẩm → không đụng cả chiến dịch, chỉ báo xử lý sản phẩm đó.' },
      { key: 'recoverMinOrders', label: 'Vừa hạ ngân sách: ngày ngon để tăng lại cần ít nhất', unit: 'đơn', desc: 'Sau khi hạ ngân sách, 1 ngày phải có lời, tiêu hết và ít nhất bấy nhiêu đơn mới tính là "ngon lại".' },
    ],
  },
];

const ALL_FIELDS = [...PROTECT, ...ADVANCED.flatMap((s) => s.fields)];

const SWITCHES: { key: BoolKey; label: string; desc: string }[] = [
  { key: 'rescue', label: 'Cứu chiến dịch lỗ', desc: 'Bật: chiến dịch lỗ kéo dài thì BOT nâng ROI mục tiêu hoặc hạ ngân sách. Tắt: chỉ báo "Đang lỗ".' },
  { key: 'grow', label: 'Mở rộng chiến dịch lời', desc: 'Bật: đang lời thì BOT tăng ngân sách, thử nâng hoặc hạ ROI mục tiêu để bán thêm. Tắt: giữ nguyên.' },
  { key: 'autoRevert', label: 'Tự đo & lùi', desc: 'Bật: sau mỗi lần chỉnh, BOT đo lại 2–7 ngày; đơn / lời giảm thì đề xuất trả về số cũ.' },
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
  // Bảng quy tắc hiện theo bản nháp (chưa lưu) để thấy ngay số vừa gõ
  const draftConfig = tuneSettingsOf({ campaignTune: { ...savedPlain, ...next } as Partial<CampaignTuneSettings> });

  const fieldInput = (f: Field) => (
    <label key={f.key} className="block">
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
      <span className="mt-1 block text-xs leading-snug text-muted/80">{f.desc}</span>
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
                <li>Đang lời: thử nâng ROI +{p.roiRaisePct}%</li>
                <li>Lỗ tối đa mỗi lần thử {p.testLossP}P</li>
                <li>Lời/ngày giảm &gt; {p.profitDropPct}% → trả về</li>
              </ul>
            </button>
          );
        })}
      </div>

      <p className="mb-1 mt-5 text-sm font-semibold text-muted">Giới hạn bảo vệ</p>
      <p className="mb-2 text-xs text-muted">P = lợi nhuận 1 đơn tham chiếu của chiến dịch (theo cơ cấu đơn 30 ngày). Tắt chiến dịch luôn do Sếp quyết.</p>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{PROTECT.map(fieldInput)}</div>

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

      <TuneRulesTable config={draftConfig} />

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
                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{s.fields.map(fieldInput)}</div>
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
