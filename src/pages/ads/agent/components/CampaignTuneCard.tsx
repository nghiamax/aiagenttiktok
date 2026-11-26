import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DEFAULT_TUNE, tuneSettingsOf, type CampaignTuneSettings } from '../../../../../shared/campaignTune';
import { useAdsSettings } from '../../settings';

type NumKey = { [K in keyof CampaignTuneSettings]: CampaignTuneSettings[K] extends number ? K : never }[keyof CampaignTuneSettings];
type BoolKey = 'rescue' | 'grow' | 'autoRevert';

const SECTIONS: { title: string; fields: { key: NumKey; label: string; unit: string; hint?: string }[] }[] = [
  {
    title: 'Mục tiêu',
    fields: [
      { key: 'maxOrderDropPct', label: 'Đơn/ngày được giảm tối đa', unit: '%', hint: 'Bước thử làm đơn giảm hơn mức này → trả về số cũ' },
      { key: 'waitHours', label: 'Chờ giữa 2 lần đổi cùng chiến dịch', unit: 'giờ', hint: 'Cũng là thời gian đo kết quả bước thử' },
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
    title: 'Mỗi bước thử',
    fields: [
      { key: 'budgetStepPct', label: 'Tăng ngân sách', unit: '%' },
      { key: 'roiStepPct', label: 'Đổi ROI mục tiêu', unit: '%' },
      { key: 'lossRaiseMaxPct', label: 'Đang lỗ: nâng ROI mục tiêu tối đa mỗi lần', unit: '%' },
    ],
  },
  {
    title: 'Hàng rào',
    fields: [
      { key: 'floorK', label: 'Sàn ROI mục tiêu = hoà vốn chiến dịch ×', unit: '' },
      { key: 'ceilK', label: 'Trần ROI mục tiêu = ROI thực 7 ngày ×', unit: '' },
      { key: 'minOrders', label: 'Cần ít nhất', unit: 'đơn / 7 ngày' },
      { key: 'missingBeMaxPct', label: 'Không đánh giá khi SP thiếu hoà vốn chiếm >', unit: '% doanh thu' },
      { key: 'concentratePct', label: 'Lỗ dồn 1 sản phẩm khi chiếm ≥', unit: '% phần lỗ' },
    ],
  },
];

const SWITCHES: { key: BoolKey; label: string; desc: string }[] = [
  { key: 'rescue', label: 'Cứu chiến dịch lỗ', desc: 'Nâng ROI mục tiêu khi lỗ (B1 – B5)' },
  { key: 'grow', label: 'Mở rộng chiến dịch lời', desc: 'Tăng ngân sách / chỉnh ROI mục tiêu (C1 – C4)' },
  { key: 'autoRevert', label: 'Tự đo & lùi', desc: 'Bước thử làm xấu đi → đề xuất trả về (D2 – D3)' },
];

const toText = (n: number) => String(n).replace('.', ',');
const parse = (t: string) => {
  const n = Number(t.trim().replace(',', '.'));
  return t.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};

/** Chiến lược điều chỉnh ROI mục tiêu & ngân sách chiến dịch (Phân nhóm → Chiến dịch, Sếp chốt 26/11) */
export default function CampaignTuneCard() {
  const { settings, save, loaded } = useAdsSettings();
  const saved = tuneSettingsOf(settings);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [bools, setBools] = useState<Pick<CampaignTuneSettings, BoolKey>>(saved);
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    setDraft(Object.fromEntries(SECTIONS.flatMap((s) => s.fields).map((f) => [f.key, toText(saved[f.key])])));
    setBools({ rescue: saved.rescue, grow: saved.grow, autoRevert: saved.autoRevert });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const next: Partial<CampaignTuneSettings> = { ...bools };
  const bad: string[] = [];
  for (const f of SECTIONS.flatMap((s) => s.fields)) {
    const v = parse(draft[f.key] ?? '');
    if (v == null) bad.push(f.label);
    else (next as Record<string, number>)[f.key] = v;
  }
  const dirty = JSON.stringify({ ...saved, ...next }) !== savedKey;

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Chiến lược điều chỉnh ROI mục tiêu &amp; ngân sách</h3>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Mục tiêu: tăng tổng lời, số đơn không giảm. BOT xét từng chiến dịch theo tình huống (lỗ / lời / vừa thử), mỗi lần đổi 1 thứ
            một bước nhỏ, đo lại sau thời gian chờ — tốt thì giữ, xấu thì đề xuất trả về. Chạy khi bật quy tắc{' '}
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

      {SECTIONS.map((s) => (
        <div key={s.title} className="mt-5">
          <p className="mb-2 text-sm font-semibold text-muted">{s.title}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.fields.map((f) => (
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
            ))}
          </div>
        </div>
      ))}

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

      {(dirty || bad.length > 0) && (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {bad.length > 0 && <span className="mr-auto text-sm text-danger">Số chưa hợp lệ: {bad.join(', ')}</span>}
          <button
            type="button"
            onClick={() => setDraft(Object.fromEntries(SECTIONS.flatMap((s) => s.fields).map((f) => [f.key, toText(saved[f.key])])))}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-canvas"
          >
            Huỷ
          </button>
          <button
            type="button"
            disabled={!loaded || bad.length > 0}
            onClick={() => save({ ...settings, campaignTune: { ...saved, ...next } })}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Lưu
          </button>
        </div>
      )}
    </section>
  );
}
