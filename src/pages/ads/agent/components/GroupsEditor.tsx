import { useMemo, useState } from 'react';
import { Check, Plus, RotateCcw } from 'lucide-react';
import SegmentedControl from '../../../../components/ui/SegmentedControl';
import { formatNumber } from '../../../../lib/format';
import { buildTrendIndex } from '../../../../../shared/trend';
import { useTrend } from '../../trend';
import { LEVEL_UNIT, newClause, type GroupDef, type GroupLevel } from '../../groups';
import { breakEvenOf, DEFAULT_SETTINGS, GROUP_KEY, groupsOf, useAdsSettings, type AdsSettings } from '../../settings';
import { useAdsData } from '../../data';
import type { TrendSnaps } from '../../../../../shared/trend';
import { LEVEL_OPTIONS, ruleLevel } from '../meta';
import type { AgentRule } from '../types';
import { useAllProducts } from '../../allProducts';
import GroupCard from './GroupCard';

interface GroupsEditorProps {
  level: GroupLevel;
  onLevelChange: (level: GroupLevel) => void;
  rules: AgentRule[];
  onOpenBreakEven: () => void;
}


const INTRO: Record<GroupLevel, string> = {
  video: 'Video được xét từ nhóm trên cùng xuống, khớp nhóm nào trước thì thuộc nhóm đó.',
  product: 'Mỗi sản phẩm trong từng chiến dịch được xét từ nhóm trên cùng xuống, khớp nhóm nào trước thì thuộc nhóm đó.',
  campaign:
    'Chiến dịch được xét từ nhóm trên cùng xuống, khớp nhóm nào trước thì thuộc nhóm đó. Mức tiêu ngân sách (%) = chi trung bình mỗi ngày ÷ ngân sách ngày × 100.',
};

function validate(g: GroupDef): string[] {
  const errors: string[] = [];
  if (g.name.trim() === '') errors.push('Nhập tên nhóm');
  if (g.kind === 'custom') {
    if (g.conditionSets.length === 0) errors.push('Cần ít nhất 1 cách nhận diện');
    if (g.conditionSets.some((s) => s.clauses.length === 0)) errors.push('Mỗi cách cần ít nhất 1 điều kiện');
  }
  return errors;
}

/**
 * Số đối tượng mỗi nhóm theo một bản thiết lập (bản nháp → thấy ảnh hưởng trước khi lưu).
 * Đếm nhóm ĐÃ XÁC NHẬN theo 7 · 14 · 30 ngày đến hôm qua (giống cột Nhóm / Agent); unconfirmed = 7 ngày thuộc nhóm nhưng 14 ngày khác.
 */
function countByGroup(snaps: TrendSnaps, level: GroupLevel, settings: AdsSettings, confirmOn: boolean) {
  const counts = new Map<string, number>();
  const unconfirmed = new Map<string, number>();
  for (const t of buildTrendIndex(level, snaps, settings, confirmOn).values()) {
    if (t.group) counts.set(t.group, (counts.get(t.group) ?? 0) + 1);
    else if (t.unconfirmed && t.g7) unconfirmed.set(t.g7, (unconfirmed.get(t.g7) ?? 0) + 1);
  }
  return { counts, unconfirmed };
}

/** Tab "Nhóm": định nghĩa nhóm video / sản phẩm / chiến dịch (sửa trên bản nháp, bấm Lưu mới áp dụng) + ROI hoà vốn */
export default function GroupsEditor({ level, onLevelChange, rules, onOpenBreakEven }: GroupsEditorProps) {
  const { settings, saveGroups, resetGroups } = useAdsSettings();
  const { snapshot } = useAdsData();
  const campaignById = useMemo(() => new Map(snapshot.campaigns.map((c) => [c.id, c])), [snapshot]);
  // Mọi sản phẩm có số trong 7 / 14 / 30 ngày (nhập ROI hoà vốn đủ, kể cả sản phẩm đã loại trừ)
  const uniqueProducts = useAllProducts().breakEven;
  const saved = groupsOf(settings, level);
  const [draft, setDraft] = useState<GroupDef[]>(saved);
  /** Nhóm vừa bấm "Thêm nhóm" → cuộn tới + nổi bật */
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const unit = LEVEL_UNIT[level];

  // So bản nháp với bản đã lưu để thanh lưu nói rõ thay đổi gì
  const savedById = new Map(saved.map((g) => [g.id, g]));
  const addedCount = draft.filter((g) => !savedById.has(g.id)).length;
  const removedCount = saved.filter((g) => !draft.some((d) => d.id === g.id)).length;
  const editedCount = draft.filter((g) => {
    const s = savedById.get(g.id);
    return s && JSON.stringify(s) !== JSON.stringify(g);
  }).length;
  const changeSummary = [
    addedCount > 0 && `${addedCount} nhóm mới`,
    editedCount > 0 && `${editedCount} nhóm đã sửa`,
    removedCount > 0 && `${removedCount} nhóm bị xoá`,
  ]
    .filter(Boolean)
    .join(' · ');
  const isUnsaved = (g: GroupDef) => {
    const s = savedById.get(g.id);
    return !s || JSON.stringify(s) !== JSON.stringify(g);
  };

  function changeLevel(next: GroupLevel) {
    if (next === level) return;
    if (dirty && !window.confirm(`Bỏ các thay đổi chưa lưu ở nhóm ${unit}?`)) return;
    onLevelChange(next);
  }

  function save() {
    const clean = draft.map((g) => ({ ...g, name: g.name.trim() }));
    saveGroups(level, clean);
    setDraft(clean);
    setJustAdded(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  }

  const trends = useTrend();
  const { counts, unconfirmed } = useMemo(
    () => countByGroup(trends.snaps, level, { ...settings, [GROUP_KEY[level]]: draft }, trends.confirmOn),
    [trends.snaps, trends.confirmOn, level, draft, settings],
  );

  const errors = new Map(draft.map((g) => [g.id, validate(g)]));
  const hasErrors = [...errors.values()].some((e) => e.length > 0);
  const fallbackIndex = draft.findIndex((g) => g.kind === 'fallback');
  const lastMovable = (fallbackIndex === -1 ? draft.length : fallbackIndex) - 1;

  const update = (id: string, patch: Partial<GroupDef>) =>
    setDraft(draft.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target > lastMovable) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  }

  function addGroup() {
    const group: GroupDef = {
      id: `g-${Date.now().toString(36)}`,
      // Không trùng tên khi bấm thêm nhiều lần: "Nhóm mới", "Nhóm mới 2", …
      name: (() => {
        const taken = new Set(draft.map((g) => g.name));
        let n = 1;
        while (taken.has(n === 1 ? 'Nhóm mới' : `Nhóm mới ${n}`)) n++;
        return n === 1 ? 'Nhóm mới' : `Nhóm mới ${n}`;
      })(),
      tone: 'violet',
      icon: 'sparkles',
      kind: 'custom',
      builtin: false,
      showInInbox: true,
      conditionSets: [{ clauses: [newClause()] }],
    };
    const at = fallbackIndex === -1 ? draft.length : fallbackIndex;
    setDraft([...draft.slice(0, at), group, ...draft.slice(at)]);
    setJustAdded(group.id);
  }

  function restoreDefaults() {
    resetGroups(level);
    setDraft(groupsOf(DEFAULT_SETTINGS, level));
    setJustAdded(null);
  }

  const missingBe = uniqueProducts.filter((p) => breakEvenOf(settings, p.id) == null).length;

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl options={LEVEL_OPTIONS} value={level} onChange={changeLevel} ariaLabel="Cấp nhóm" />
        <span className="text-sm text-muted">
          {formatNumber(draft.length)} nhóm {unit} · dùng cho quy tắc cấp {unit}
        </span>
      </div>

      {/* ROI hoà vốn — dùng trong điều kiện "ROI hoà vốn ×" (chiến dịch không so với hoà vốn) */}
      {level !== 'campaign' && (
        <section className="rounded-2xl border border-line bg-canvas/60 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">ROI hoà vốn theo sản phẩm</h3>
              <p className="text-sm text-muted">
                Dùng cho điều kiện “ROI hoà vốn ×”.{' '}
                {missingBe > 0 ? `${missingBe}/${uniqueProducts.length} sản phẩm chưa nhập — điều kiện đó sẽ không khớp.` : 'Đã nhập đủ.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenBreakEven}
              className="w-fit rounded-xl bg-white px-3.5 py-2 text-sm font-medium shadow-sm transition hover:shadow-md"
            >
              Nhập ROI hoà vốn
            </button>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {uniqueProducts.map((p) => {
              const be = breakEvenOf(settings, p.id);
              return (
                <li
                  key={p.id}
                  className="max-w-[260px] truncate rounded-lg bg-white px-2.5 py-1 text-xs"
                  title={`${p.name}\n${campaignById.get(p.campaignId)?.name ?? ''}`}
                >
                  {p.name} · <b className={be == null ? 'text-muted' : ''}>{be == null ? 'chưa nhập' : formatNumber(be, 2)}</b>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-muted">
          {INTRO[level]} Dùng ↑↓ để đổi thứ tự ưu tiên. Số {unit} tính trên số liệu hiện tại và cập nhật ngay khi sửa.
          <span className="mt-1 block">
            Ngưỡng chi đặt theo 7 ngày. Mọi nhóm được kiểm tra thêm bằng 14 ngày (và 30 ngày để bắt lỗ âm thầm) — dùng chung điều
            kiện, không cần đặt riêng. 7 ngày thuộc nhóm mà 14 ngày chưa = <b className="font-medium text-ink">dấu hiệu</b> (chưa tính).
          </span>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={restoreDefaults}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <RotateCcw className="size-4" />
            Khôi phục mặc định
          </button>
          <button
            type="button"
            onClick={addGroup}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            <Plus className="size-4" />
            Thêm nhóm
          </button>
        </div>
      </div>

      <ul className="space-y-4">
        {draft.map((g, i) => (
          <GroupCard
            key={g.id}
            group={g}
            level={level}
            count={counts.get(g.id) ?? 0}
            unconfirmed={unconfirmed.get(g.id) ?? 0}
            usedByRules={rules.filter((r) => ruleLevel(r) === level && r.trigger === g.id).length}
            errors={errors.get(g.id) ?? []}
            canMoveUp={g.kind !== 'fallback' && i > 0}
            canMoveDown={g.kind !== 'fallback' && i < lastMovable}
            onChange={(patch) => update(g.id, patch)}
            onMove={(dir) => move(i, dir)}
            onRemove={() => setDraft(draft.filter((x) => x.id !== g.id))}
            justAdded={g.id === justAdded}
            unsaved={isUnsaved(g)}
          />
        ))}
      </ul>

      {savedFlash && !dirty && (
        <div
          role="status"
          className="sticky bottom-4 z-20 flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-accent-green shadow-lg"
        >
          <Check className="size-4" />
          Đã lưu — Tổng quan và quy tắc đã dùng định nghĩa mới.
        </div>
      )}

      {dirty && (
        <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm">
            <b>Có thay đổi chưa lưu</b>
            {changeSummary && <span className="text-muted"> · {changeSummary}</span>}
            {hasErrors && <span className="text-danger"> · sửa các lỗi màu đỏ trước khi lưu</span>}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(saved);
                setJustAdded(null);
              }}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-canvas"
            >
              Huỷ
            </button>
            <button
              type="button"
              disabled={hasErrors}
              onClick={save}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Lưu thay đổi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
