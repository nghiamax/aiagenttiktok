import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, FolderOpen, Package } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import SegmentedControl from '../../../../components/ui/SegmentedControl';
import { formatNumber } from '../../../../lib/format';
import { groupDescription, groupMeta, type ConditionSet } from '../../groups';
import type { AdsSettings } from '../../settings';
import type { VideoAction } from '../../types';
import { campaignOfProduct, campaignOptions, campaignTargetRoi, productOptionsFor } from '../lookup';
import {
  ACTIONS_BY_LEVEL,
  actionTypeMeta,
  budgetLimitWarning,
  defaultParams,
  LEVEL_OPTIONS,
  METRICS_BY_LEVEL,
  MODE_OPTIONS,
  VALUE_TYPES_BY_LEVEL,
} from '../meta';
import { matchRuleTargets } from '../ruleMatch';
import type { AgentActionType, AgentGuardrails, AgentRule, AgentRuleParams, RuleLevel, RuleMode } from '../types';
import ConditionSetsEditor from './ConditionSetsEditor';
import NumberField from './NumberField';
import PctChangeField from './PctChangeField';

interface RuleFormModalProps {
  settings: AdsSettings;
  guardrails: AgentGuardrails;
  onSave: (rule: AgentRule) => void;
  onClose: () => void;
}

/** Điều kiện gợi ý ban đầu cho từng cấp */
const DEFAULT_SETS: Record<Exclude<RuleLevel, 'video'>, ConditionSet[]> = {
  product: [{ clauses: [{ metric: 'roi', op: 'lt', value: { type: 'breakEven', k: 1 } }] }],
  campaign: [
    {
      clauses: [
        { metric: 'budgetUse', op: 'gte', value: { type: 'number', n: 90 } },
        { metric: 'roi', op: 'gte', value: { type: 'target', k: 1 } },
      ],
    },
  ],
};

const SUBJECT: Record<RuleLevel, string> = {
  video: 'Video',
  product: 'Sản phẩm khớp',
  campaign: 'Chiến dịch khớp',
};

const LABEL = 'mb-1.5 block text-sm font-medium';
const SELECT_BOX =
  'mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-white px-3 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-soft hover:border-muted/40';

/** Popup thêm quy tắc: Cấp · Tên · Khi · Thì · Phạm vi · Thời gian chờ · Chế độ */
export default function RuleFormModal({ settings, guardrails, onSave, onClose }: RuleFormModalProps) {
  const groups = settings.groups;
  const [level, setLevel] = useState<RuleLevel>('video');
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<VideoAction>(
    () => (groups.find((g) => g.kind === 'custom') ?? groups[0])?.id ?? '',
  );
  const [sets, setSets] = useState<ConditionSet[]>(DEFAULT_SETS.product);
  const [actionType, setActionType] = useState<AgentActionType>('remove_creative');
  const [params, setParams] = useState<AgentRuleParams>({});
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [cooldownHours, setCooldownHours] = useState(guardrails.cooldownHours);
  const [mode, setMode] = useState<RuleMode>('approve');
  const [touched, setTouched] = useState(false);

  const triggerGroup = groups.find((g) => g.id === trigger);
  const nameError = touched && name.trim() === '' ? 'Nhập tên quy tắc' : null;

  const preview: AgentRule = {
    id: 'preview',
    name,
    level,
    trigger: level === 'video' ? trigger : '',
    conditionSets: level === 'video' ? undefined : sets,
    actionType,
    params,
    mode,
    cooldownHours,
    campaignIds: campaignId ? [campaignId] : null,
    productIds: level !== 'campaign' && productId ? [productId] : null,
  };
  const matches = matchRuleTargets(preview, settings);

  function changeLevel(next: RuleLevel) {
    setLevel(next);
    const first = ACTIONS_BY_LEVEL[next][0];
    setActionType(first);
    setParams(defaultParams(first));
    if (next !== 'video') setSets(DEFAULT_SETS[next]);
    if (next === 'campaign') setProductId(null);
  }

  function changeAction(a: AgentActionType) {
    setActionType(a);
    setParams(defaultParams(a));
  }

  function changeCampaign(id: string | null) {
    setCampaignId(id);
    // Sản phẩm không thuộc chiến dịch mới thì bỏ
    if (productId && id && campaignOfProduct(productId) !== id) setProductId(null);
  }

  function changeProduct(id: string | null) {
    setProductId(id);
    if (id) setCampaignId(campaignOfProduct(id));
  }

  function handleSave() {
    setTouched(true);
    if (name.trim() === '' || (level === 'video' && !trigger)) return;
    onSave({ ...preview, id: `custom-${Date.now().toString(36)}`, name: name.trim() });
    onClose();
  }

  // Ví dụ quy đổi ROI mục tiêu trên chiến dịch đang chọn (hoặc chiến dịch đầu tiên)
  const exampleTarget = campaignTargetRoi(campaignId);
  const roiPct = params.roiTargetChangePct ?? 0;

  return (
    <Modal
      title="Thêm quy tắc"
      description="Khi video / sản phẩm / chiến dịch khớp điều kiện thì Agent làm gì, trong phạm vi nào."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-canvas"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            Thêm quy tắc
          </button>
        </div>
      }
    >
      <div className="space-y-5 p-5">
        <div>
          <span className={LABEL}>Áp dụng cho</span>
          <SegmentedControl options={LEVEL_OPTIONS} value={level} onChange={changeLevel} ariaLabel="Cấp áp dụng" />
        </div>

        <label className="block">
          <span className={LABEL}>Tên quy tắc</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={
              level === 'campaign'
                ? 'vd: Tăng ngân sách khi tiêu gần hết mà ROI tốt'
                : level === 'product'
                  ? 'vd: Tắt sản phẩm lỗ'
                  : 'vd: Gỡ video lỗ chiến dịch Gross revenue'
            }
            autoFocus
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-primary-soft ${
              nameError ? 'border-danger' : 'border-line hover:border-muted/40 focus:border-primary'
            }`}
          />
          {nameError && <span className="mt-1 block text-xs text-danger">{nameError}</span>}
        </label>

        <fieldset>
          <legend className={LABEL}>Khi</legend>
          {level === 'video' ? (
            <>
              <p className="mb-2 text-xs text-muted">Video thuộc nhóm:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {groups.map((g) => {
                  const meta = groupMeta(g);
                  const active = g.id === trigger;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setTrigger(g.id)}
                      aria-pressed={active}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        active ? 'border-primary bg-primary-soft' : 'border-line hover:bg-canvas'
                      }`}
                    >
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}>
                        <meta.icon className="size-4" />
                      </span>
                      <span className={`font-medium ${active ? 'text-primary' : ''}`}>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">
                {triggerGroup ? groupDescription(triggerGroup) : ''}{' '}
                <Link to="/ads/agent?view=groups" onClick={onClose} className="font-medium text-primary hover:text-primary-hover">
                  Sửa định nghĩa nhóm →
                </Link>
              </p>
            </>
          ) : (
            <ConditionSetsEditor
              sets={sets}
              onChange={setSets}
              subject={SUBJECT[level]}
              metrics={METRICS_BY_LEVEL[level]}
              valueTypes={VALUE_TYPES_BY_LEVEL[level]}
            />
          )}
          <p className="mt-2 text-sm">
            Hiện có <b>{formatNumber(matches.names.length)}</b> {matches.unit} khớp
            {matches.names.length > 0 && (
              <span className="text-muted" title={matches.names.join('\n')}>
                {' '}
                ({matches.names.slice(0, 2).join(', ')}
                {matches.names.length > 2 ? '…' : ''})
              </span>
            )}
          </p>
        </fieldset>

        <fieldset>
          <legend className={LABEL}>Thì Agent sẽ</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ACTIONS_BY_LEVEL[level].map((a) => {
              const meta = actionTypeMeta(a, a === actionType ? params : {});
              const active = a === actionType;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => changeAction(a)}
                  aria-pressed={active}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    active ? 'border-primary bg-primary-soft' : 'border-line hover:bg-canvas'
                  }`}
                >
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.className}`}>
                    <meta.icon className="size-4" />
                  </span>
                  <span className={`font-medium ${active ? 'text-primary' : ''}`}>{meta.label}</span>
                </button>
              );
            })}
          </div>

          {actionType === 'boost_creative' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <NumberField
                label="Ngân sách tăng cường"
                suffix="đ/ngày"
                min={1000}
                value={params.boostBudget ?? 50000}
                onCommit={(n) => setParams({ ...params, boostBudget: n })}
              />
              <NumberField
                label="Số ngày"
                suffix="ngày"
                min={1}
                value={params.boostDays ?? 1}
                onCommit={(n) => setParams({ ...params, boostDays: n })}
              />
            </div>
          )}
          {actionType === 'update_budget' && (
            <div className="mt-3 sm:max-w-xs">
              <PctChangeField
                label="Đổi ngân sách ngày"
                value={params.budgetChangePct ?? 20}
                onCommit={(n) => setParams({ ...params, budgetChangePct: n })}
                warning={budgetLimitWarning(params, guardrails)}
              />
            </div>
          )}
          {actionType === 'update_roi_target' && (
            <div className="mt-3 sm:max-w-xs">
              <PctChangeField
                label="Đổi ROI mục tiêu"
                hint="Giảm ROI mục tiêu → TikTok tiêu mạnh hơn; tăng → chặt hơn, tiêu ít hơn"
                value={roiPct}
                onCommit={(n) => setParams({ ...params, roiTargetChangePct: n })}
              />
              {exampleTarget != null && (
                <span className="mt-1 block text-xs text-muted">
                  vd ROI mục tiêu {formatNumber(exampleTarget, 2)} → {formatNumber(exampleTarget * (1 + roiPct / 100), 2)}
                </span>
              )}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className={LABEL}>Phạm vi</legend>
          <div className={`grid gap-3 ${level === 'campaign' ? '' : 'sm:grid-cols-2'}`}>
            <label className="block text-sm">
              <span className="text-xs text-muted">Chiến dịch</span>
              <span className={SELECT_BOX}>
                <FolderOpen className="size-4 shrink-0 text-muted" />
                <select
                  value={campaignId ?? ''}
                  onChange={(e) => changeCampaign(e.target.value || null)}
                  className="w-full truncate bg-transparent py-2 outline-none"
                >
                  <option value="">Tất cả chiến dịch</option>
                  {campaignOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            {level !== 'campaign' && (
              <label className="block text-sm">
                <span className="text-xs text-muted">Sản phẩm</span>
                <span className={SELECT_BOX}>
                  <Package className="size-4 shrink-0 text-muted" />
                  <select
                    value={productId ?? ''}
                    onChange={(e) => changeProduct(e.target.value || null)}
                    className="w-full truncate bg-transparent py-2 outline-none"
                  >
                    <option value="">Tất cả sản phẩm</option>
                    {productOptionsFor(campaignId).map((p) => (
                      <option key={`${p.campaignId}:${p.value}`} value={p.value}>
                        {p.description ? `${p.label} · ${p.description}` : p.label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            )}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Thời gian chờ"
            hint={`Không thao tác lại trên cùng ${level === 'video' ? 'video' : level === 'product' ? 'sản phẩm' : 'chiến dịch'}`}
            suffix="giờ"
            value={cooldownHours}
            onCommit={setCooldownHours}
          />
          <div>
            <span className="block text-sm font-medium">Chế độ ban đầu</span>
            <span className="block text-xs text-muted">Có thể đổi sau trên thẻ quy tắc</span>
            <div className="mt-1.5">
              <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} ariaLabel="Chế độ ban đầu" />
            </div>
          </div>
        </div>

        {mode === 'auto' && (
          <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
            <AlertTriangle className="size-5 shrink-0" />
            <span>
              Agent sẽ tự thực hiện quy tắc này mà không chờ Sếp duyệt. Đây là thao tác thật trên TikTok Ads, vẫn bị giới hạn
              bởi giới hạn an toàn (trần tăng cường, mức tăng/giảm ngân sách, số thao tác mỗi ngày).
            </span>
          </p>
        )}
      </div>
    </Modal>
  );
}
