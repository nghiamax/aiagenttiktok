import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Lock, Palette, Trash2 } from 'lucide-react';
import { formatNumber } from '../../../../lib/format';
import {
  GROUP_ICONS,
  GROUP_TONE_DOT,
  GROUP_TONES,
  groupDescription,
  groupMeta,
  type ConditionSet,
  LEVEL_UNIT,
  type GroupDef,
  type GroupIcon,
  type GroupLevel,
  type GroupTone,
} from '../../groups';
import { METRICS_BY_LEVEL, VALUE_TYPES_BY_LEVEL } from '../meta';
import ConditionSetsEditor from './ConditionSetsEditor';

const SUBJECT: Record<GroupLevel, string> = {
  video: 'Video thuộc nhóm',
  product: 'Sản phẩm thuộc nhóm',
  campaign: 'Chiến dịch thuộc nhóm',
};

interface GroupCardProps {
  group: GroupDef;
  /** Cấp của nhóm: quyết định chỉ số dùng được và đơn vị đếm */
  level: GroupLevel;
  /** Số đối tượng khớp nhóm theo bản nháp hiện tại */
  count: number;
  /** 7 ngày thuộc nhóm nhưng 14 ngày khác (không tính vào count) */
  unconfirmed?: number;
  /** Số quy tắc Agent đang dùng nhóm này */
  usedByRules: number;
  errors: string[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<GroupDef>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  /** Nhóm vừa thêm: cuộn tới, viền nổi bật, đặt con trỏ vào ô tên */
  justAdded?: boolean;
  /** Nhóm mới / đã sửa nhưng chưa lưu */
  unsaved?: boolean;
}

const TONES = Object.keys(GROUP_TONES) as GroupTone[];
const ICONS = Object.keys(GROUP_ICONS) as GroupIcon[];

/** Thẻ định nghĩa một nhóm video: tên, màu, các "cách" nhận diện (HOẶC) gồm điều kiện (VÀ) */
export default function GroupCard({
  group,
  level,
  count,
  unconfirmed,
  usedByRules,
  errors,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onRemove,
  justAdded = false,
  unsaved = false,
}: GroupCardProps) {
  const [styling, setStyling] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const cardRef = useRef<HTMLLIElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Nhóm vừa thêm nằm cuối danh sách → cuộn tới và chọn sẵn tên để Sếp gõ đè
  useEffect(() => {
    if (!justAdded) return;
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameRef.current?.focus({ preventScroll: true });
    nameRef.current?.select();
  }, [justAdded]);
  const meta = groupMeta(group);
  const editable = group.kind === 'custom';
  const sets = group.conditionSets;

  const setSets = (next: ConditionSet[]) => onChange({ conditionSets: next });

  const iconBtn =
    'flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink disabled:pointer-events-none disabled:opacity-30';

  return (
    <li
      ref={cardRef}
      className={`scroll-mt-24 rounded-2xl border bg-white p-5 shadow-sm transition ${
        errors.length ? 'border-danger/50' : justAdded ? 'border-primary ring-2 ring-primary-soft' : 'border-line'
      }`}
    >
      {/* Đầu thẻ */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => setStyling((v) => !v)}
            aria-label="Đổi màu và icon"
            title="Đổi màu và icon"
            className={`relative flex size-10 shrink-0 items-center justify-center rounded-xl transition hover:ring-2 hover:ring-primary-soft ${meta.tone}`}
          >
            <meta.icon className="size-5" />
            <Palette className="absolute -bottom-1 -right-1 size-4 rounded-full bg-white p-0.5 text-muted shadow" />
          </button>
          <input
            ref={nameRef}
            value={group.name}
            onChange={(e) => onChange({ name: e.target.value })}
            aria-label="Tên nhóm"
            placeholder="Tên nhóm"
            className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-base font-semibold outline-none transition hover:border-line focus:border-primary focus:ring-2 focus:ring-primary-soft"
          />
          {unsaved && (
            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">
              Chưa lưu
            </span>
          )}
          <span
            className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold tabular-nums text-muted"
            title={unconfirmed ? `+${unconfirmed} có dấu hiệu: 7 ngày gần nhất thuộc nhóm này, 14 ngày chưa` : 'Tính theo 7 và 14 ngày cùng nhóm'}
          >
            {formatNumber(count)} {LEVEL_UNIT[level]}
            {!!unconfirmed && <span className="font-normal"> · {formatNumber(unconfirmed)} dấu hiệu</span>}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {/* Hiện thành một ô ở hộp "Agent đang theo dõi" (tab theo cấp) */}
          <label className="mr-2 flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={group.showInInbox}
              onChange={(e) => onChange({ showInInbox: e.target.checked })}
              className="size-4 accent-primary"
            />
            Hiện ở Tổng quan
          </label>
          <button type="button" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label="Ưu tiên cao hơn" title="Ưu tiên cao hơn" className={iconBtn}>
            <ArrowUp className="size-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label="Ưu tiên thấp hơn" title="Ưu tiên thấp hơn" className={iconBtn}>
            <ArrowDown className="size-4" />
          </button>
          {!group.builtin && (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              aria-label="Xoá nhóm"
              title="Xoá nhóm"
              className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose-50 hover:text-danger"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Bảng chọn màu + icon */}
      {styling && (
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-canvas/70 p-3">
          <div className="flex gap-1.5" role="radiogroup" aria-label="Màu">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={group.tone === t}
                aria-label={`Màu ${t}`}
                onClick={() => onChange({ tone: t })}
                className={`size-6 rounded-full ${GROUP_TONE_DOT[t]} transition ${
                  group.tone === t ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-110'
                }`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Icon">
            {ICONS.map((i) => {
              const Icon = GROUP_ICONS[i];
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={group.icon === i}
                  aria-label={`Icon ${i}`}
                  onClick={() => onChange({ icon: i })}
                  className={`flex size-8 items-center justify-center rounded-lg transition ${
                    group.icon === i ? `${meta.tone} ring-1 ring-current` : 'text-muted hover:bg-white'
                  }`}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Điều kiện */}
      <div className="mt-4">
        {!editable ? (
          <p className="flex items-center gap-2 rounded-xl bg-canvas/70 px-3 py-2.5 text-sm text-muted">
            <Lock className="size-4 shrink-0" />
            {groupDescription(group, level)}
            {group.kind === 'platform' && ' (quy tắc của sàn, không sửa được)'}
          </p>
        ) : (
          <ConditionSetsEditor
            sets={sets}
            onChange={setSets}
            subject={SUBJECT[level]}
            metrics={METRICS_BY_LEVEL[level]}
            valueTypes={VALUE_TYPES_BY_LEVEL[level]}
          />
        )}
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}

      {confirmRemove && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl bg-rose-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-danger">
            Xoá nhóm “{group.name}”?
            {usedByRules > 0 && ` ${usedByRules} quy tắc đang dùng nhóm này sẽ không chạy.`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="rounded-lg bg-white px-3 py-1.5 font-medium text-muted transition-colors hover:text-ink"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg bg-danger px-3 py-1.5 font-semibold text-white transition hover:opacity-90"
            >
              Xoá nhóm
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
