import { useMemo, useState } from 'react';
import { Check, Plus, RotateCcw } from 'lucide-react';
import snapshotJson from '../../../../data/ads-snapshot.json';
import { formatNumber } from '../../../../lib/format';
import { classifyVideo } from '../../classify';
import { newClause, type GroupDef } from '../../groups';
import { breakEvenOf, DEFAULT_SETTINGS, useAdsSettings } from '../../settings';
import type { AdsSnapshot } from '../../types';
import type { AgentRule } from '../types';
import GroupCard from './GroupCard';

interface GroupsEditorProps {
  rules: AgentRule[];
  onOpenBreakEven: () => void;
}

const snapshot = snapshotJson as AdsSnapshot;
const campaignById = new Map(snapshot.campaigns.map((c) => [c.id, c]));
const uniqueProducts = [...new Map(snapshot.products.map((p) => [p.id, p])).values()];

function validate(g: GroupDef): string[] {
  const errors: string[] = [];
  if (g.name.trim() === '') errors.push('Nhập tên nhóm');
  if (g.kind === 'custom') {
    if (g.conditionSets.length === 0) errors.push('Cần ít nhất 1 cách nhận diện');
    if (g.conditionSets.some((s) => s.clauses.length === 0)) errors.push('Mỗi cách cần ít nhất 1 điều kiện');
  }
  return errors;
}

/** Tab "Nhóm video": định nghĩa nhóm (sửa trên bản nháp, bấm Lưu mới áp dụng) + ROI hoà vốn */
export default function GroupsEditor({ rules, onOpenBreakEven }: GroupsEditorProps) {
  const { settings, saveGroups, resetGroups } = useAdsSettings();
  const [draft, setDraft] = useState<GroupDef[]>(settings.groups);
  /** Nhóm vừa bấm "Thêm nhóm" → cuộn tới + nổi bật */
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.groups);

  // So bản nháp với bản đã lưu để thanh lưu nói rõ thay đổi gì
  const savedById = new Map(settings.groups.map((g) => [g.id, g]));
  const addedCount = draft.filter((g) => !savedById.has(g.id)).length;
  const removedCount = settings.groups.filter((g) => !draft.some((d) => d.id === g.id)).length;
  const editedCount = draft.filter((g) => {
    const saved = savedById.get(g.id);
    return saved && JSON.stringify(saved) !== JSON.stringify(g);
  }).length;
  const changeSummary = [
    addedCount > 0 && `${addedCount} nhóm mới`,
    editedCount > 0 && `${editedCount} nhóm đã sửa`,
    removedCount > 0 && `${removedCount} nhóm bị xoá`,
  ]
    .filter(Boolean)
    .join(' · ');
  const isUnsaved = (g: GroupDef) => {
    const saved = savedById.get(g.id);
    return !saved || JSON.stringify(saved) !== JSON.stringify(g);
  };

  function save() {
    const clean = draft.map((g) => ({ ...g, name: g.name.trim() }));
    saveGroups(clean);
    setDraft(clean);
    setJustAdded(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  }

  // Số video từng nhóm theo bản nháp (thấy ngay ảnh hưởng trước khi lưu)
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    const draftSettings = { ...settings, groups: draft };
    for (const v of snapshot.videos) {
      const c = classifyVideo(v, campaignById.get(v.campaignId), draftSettings);
      if (c) map.set(c.action, (map.get(c.action) ?? 0) + 1);
    }
    return map;
  }, [draft, settings]);

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
    resetGroups();
    setDraft(DEFAULT_SETTINGS.groups);
    setJustAdded(null);
  }

  const missingBe = uniqueProducts.filter((p) => breakEvenOf(settings, p.id) == null).length;

  return (
    <div className="space-y-5 p-5">
      {/* ROI hoà vốn — dùng trong điều kiện "ROI hoà vốn ×" */}
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-muted">
          Video được xét từ nhóm trên cùng xuống, khớp nhóm nào trước thì thuộc nhóm đó (dùng ↑↓ để đổi thứ tự ưu tiên). Số
          video tính trên số liệu hiện tại và cập nhật ngay khi sửa.
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
            count={counts.get(g.id) ?? 0}
            usedByRules={rules.filter((r) => r.trigger === g.id).length}
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
          Đã lưu — Tổng quan, bảng Video và quy tắc đã dùng định nghĩa mới.
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
                setDraft(settings.groups);
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
