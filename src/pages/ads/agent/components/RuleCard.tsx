import { useState } from 'react';
import { AlertTriangle, ChevronDown, FolderOpen, Package, Trash2 } from 'lucide-react';
import FilterSelect from '../../../../components/ui/FilterSelect';
import Modal from '../../../../components/ui/Modal';
import SegmentedControl from '../../../../components/ui/SegmentedControl';
import ActionBadge from '../../components/ActionBadge';
import { formatNumber } from '../../../../lib/format';
import { conditionSetsText, groupDescription } from '../../groups';
import { findGroup, type AdsSettings } from '../../settings';
import { campaignOfProduct, campaignOptions, campaignTargetRoi, productOptionsFor } from '../lookup';
import {
  actionText,
  actionTypeMeta,
  budgetLimitWarning,
  LEVEL_LABEL,
  METRICS_BY_LEVEL,
  MODE_OPTIONS,
  ruleLevel,
  VALUE_TYPES_BY_LEVEL,
} from '../meta';
import { matchRuleTargets } from '../ruleMatch';
import type { AgentGuardrails, AgentRule, RuleMode } from '../types';
import ConditionSetsEditor from './ConditionSetsEditor';
import NumberField from './NumberField';
import PctChangeField from './PctChangeField';

interface RuleCardProps {
  rule: AgentRule;
  settings: AdsSettings;
  guardrails: AgentGuardrails;
  onChange: (patch: Partial<AgentRule>) => void;
  /** Chỉ có với quy tắc tự tạo */
  onRemove?: () => void;
}

const MODE_STYLE: Record<RuleMode, string> = {
  off: 'border-line',
  approve: 'border-primary/40',
  auto: 'border-accent-violet/50',
};

/** Thẻ quy tắc: Khi … Thì … · Phạm vi · Chế độ Tắt / Cần duyệt / Tự chạy */
export default function RuleCard({ rule, settings, guardrails, onChange, onRemove }: RuleCardProps) {
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editingConditions, setEditingConditions] = useState(false);
  const typeMeta = actionTypeMeta(rule.actionType, rule.params);
  const level = ruleLevel(rule);
  const matches = matchRuleTargets(rule, settings);
  const exampleTarget = campaignTargetRoi(rule.campaignIds?.[0] ?? null);
  const unitName = level === 'video' ? 'video' : level === 'product' ? 'sản phẩm' : 'chiến dịch';
  const group = findGroup(settings, rule.trigger);
  const campaignId = rule.campaignIds?.[0] ?? null;
  const productId = rule.productIds?.[0] ?? null;

  function changeMode(mode: RuleMode) {
    // Bật Tự chạy luôn hỏi lại: Agent sẽ tự tiêu tiền / gỡ video không cần duyệt
    if (mode === 'auto' && rule.mode !== 'auto') setConfirmAuto(true);
    else onChange({ mode });
  }

  return (
    <li className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${MODE_STYLE[rule.mode]}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${typeMeta.className}`}>
            <typeMeta.icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 font-semibold">
              {rule.name}
              <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary">{LEVEL_LABEL[level]}</span>
              {rule.custom && (
                <span className="rounded-md bg-canvas px-1.5 py-0.5 text-xs font-medium text-muted">Tự tạo</span>
              )}
            </h3>
            <p className="text-xs text-muted">
              {rule.mode === 'off' ? 'Đang tắt' : rule.mode === 'approve' ? 'Đề xuất chờ Sếp duyệt' : 'Agent tự thực hiện'}
            </p>
          </div>
        </div>
        <SegmentedControl options={MODE_OPTIONS} value={rule.mode} onChange={changeMode} ariaLabel={`Chế độ ${rule.name}`} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-[80px_minmax(0,1fr)]">
        <dt className="font-semibold text-muted">Khi</dt>
        <dd className="space-y-2">
          {level === 'video' ? (
            <div className="flex flex-wrap items-center gap-2">
              <ActionBadge action={rule.trigger} />
              {group ? (
                <span>{groupDescription(group)}</span>
              ) : (
                <span className="flex items-center gap-1.5 font-medium text-danger">
                  <AlertTriangle className="size-4" />
                  Nhóm đã bị xoá — quy tắc sẽ không chạy. Chọn lại nhóm hoặc xoá quy tắc.
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span>{conditionSetsText(rule.conditionSets ?? [])}</span>
                <button
                  type="button"
                  onClick={() => setEditingConditions((v) => !v)}
                  className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-hover"
                >
                  {editingConditions ? 'Xong' : 'Sửa điều kiện'}
                  <ChevronDown className={`size-4 transition-transform ${editingConditions ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {editingConditions && (
                <ConditionSetsEditor
                  sets={rule.conditionSets ?? []}
                  onChange={(conditionSets) => onChange({ conditionSets })}
                  subject={level === 'campaign' ? 'Chiến dịch khớp' : 'Sản phẩm khớp'}
                  metrics={METRICS_BY_LEVEL[level]}
                  valueTypes={VALUE_TYPES_BY_LEVEL[level]}
                />
              )}
            </>
          )}
          <p className="text-xs text-muted" title={matches.names.join('\n')}>
            Hiện có <b className="text-ink">{formatNumber(matches.names.length)}</b> {matches.unit} khớp theo số liệu hiện tại
          </p>
        </dd>
        <dt className="font-semibold text-muted">Thì</dt>
        <dd>{actionText(rule)}</dd>
        <dt className="font-semibold text-muted md:pt-3">Phạm vi</dt>
        <dd className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <FilterSelect
            label="Chiến dịch"
            icon={FolderOpen}
            allLabel="Tất cả chiến dịch"
            options={campaignOptions}
            value={campaignId}
            onChange={(id) =>
              onChange({
                campaignIds: id ? [id] : null,
                // Sản phẩm không thuộc chiến dịch mới thì bỏ
                productIds: productId && id && campaignOfProduct(productId) !== id ? null : (rule.productIds ?? null),
              })
            }
            searchPlaceholder="Gõ tên chiến dịch…"
          />
          {level !== 'campaign' && (
            <FilterSelect
              label="Sản phẩm"
              icon={Package}
              allLabel="Tất cả sản phẩm"
              options={productOptionsFor(campaignId)}
              value={productId}
              onChange={(id) =>
                onChange(
                  id
                    ? { productIds: [id], campaignIds: [campaignOfProduct(id) ?? ''].filter(Boolean) }
                    : { productIds: null },
                )
              }
              searchPlaceholder="Gõ tên sản phẩm…"
            />
          )}
        </dd>
      </dl>

      <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
        {rule.actionType === 'boost_creative' && (
          <>
            <NumberField
              label="Ngân sách tăng cường"
              suffix="đ/ngày"
              min={1000}
              value={rule.params.boostBudget ?? 0}
              onCommit={(n) => onChange({ params: { ...rule.params, boostBudget: n } })}
            />
            <NumberField
              label="Số ngày"
              suffix="ngày"
              min={1}
              value={rule.params.boostDays ?? 1}
              onCommit={(n) => onChange({ params: { ...rule.params, boostDays: n } })}
            />
          </>
        )}
        {rule.actionType === 'update_budget' && (
          <PctChangeField
            label="Đổi ngân sách ngày"
            value={rule.params.budgetChangePct ?? 20}
            onCommit={(n) => onChange({ params: { ...rule.params, budgetChangePct: n } })}
            warning={budgetLimitWarning(rule.params, guardrails)}
          />
        )}
        {rule.actionType === 'update_roi_target' && (
          <div>
            <PctChangeField
              label="Đổi ROI mục tiêu"
              value={rule.params.roiTargetChangePct ?? -10}
              onCommit={(n) => onChange({ params: { ...rule.params, roiTargetChangePct: n } })}
            />
            {exampleTarget != null && (
              <span className="mt-1 block text-xs text-muted">
                vd {formatNumber(exampleTarget, 2)} →{' '}
                {formatNumber(exampleTarget * (1 + (rule.params.roiTargetChangePct ?? 0) / 100), 2)}
              </span>
            )}
          </div>
        )}
        <NumberField
          label="Thời gian chờ"
          hint={`Không thao tác lại trên cùng ${unitName}`}
          suffix="giờ"
          value={rule.cooldownHours}
          onCommit={(n) => onChange({ cooldownHours: n })}
        />
      </div>

      {onRemove && (
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-3">
          {confirmRemove ? (
            <>
              <span className="text-sm text-muted">Xoá quy tắc này?</span>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Xoá
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-rose-50 hover:text-danger"
            >
              <Trash2 className="size-4" />
              Xoá quy tắc
            </button>
          )}
        </div>
      )}

      {confirmAuto && (
        <Modal
          title={`Bật "Tự chạy" cho ${rule.name}?`}
          onClose={() => setConfirmAuto(false)}
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAuto(false)}
                className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-canvas"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange({ mode: 'auto' });
                  setConfirmAuto(false);
                }}
                className="rounded-xl bg-accent-violet px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Bật Tự chạy
              </button>
            </div>
          }
        >
          <div className="space-y-3 p-5 text-sm">
            <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-amber-700">
              <AlertTriangle className="size-5 shrink-0" />
              <span>
                Agent sẽ tự thực hiện <b>“{actionText(rule)}”</b> mà không chờ Sếp duyệt. Đây là thao tác thật trên TikTok
                Ads.
              </span>
            </p>
            <p className="text-muted">
              Mọi thao tác vẫn bị giới hạn bởi giới hạn an toàn (trần tăng cường, mức tăng/giảm ngân sách, số thao tác mỗi ngày), và được ghi vào Nhật ký để
              theo dõi. Nên chạy ở chế độ Cần duyệt một thời gian trước khi bật Tự chạy.
            </p>
          </div>
        </Modal>
      )}
    </li>
  );
}
