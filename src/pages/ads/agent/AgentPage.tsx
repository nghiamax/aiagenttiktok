import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Card from '../../../components/ui/Card';
import PageHeader from '../../../components/ui/PageHeader';
import snapshotJson from '../../../data/ads-snapshot.json';
import AdsSubNav from '../components/AdsSubNav';
import SnapshotInfo from '../components/SnapshotInfo';
import type { GroupLevel } from '../groups';
import { findGroupAnyLevel, useAdsSettings } from '../settings';
import type { AdsSnapshot } from '../types';
import ActionLogList from './components/ActionLogList';
import ImpactView from './components/ImpactView';
import AgentStatusBar from './components/AgentStatusBar';
import AgentTabs from './components/AgentTabs';
import GuardrailsCard from './components/GuardrailsCard';
import ProposalList from './components/ProposalList';
import RuleCard from './components/RuleCard';
import RuleFormModal from './components/RuleFormModal';
import GroupsEditor from './components/GroupsEditor';
import BreakEvenModal from '../components/BreakEvenModal';
import type { AgentView } from './types';
import { activeRuleCount, AGENT_DATA, pendingProposals, useAgentConfig } from './useAgentConfig';

const snapshot = snapshotJson as AdsSnapshot;
const VIEWS: readonly AgentView[] = ['pending', 'log', 'impact', 'rules', 'groups'];
const LEVELS: readonly GroupLevel[] = ['video', 'product', 'campaign'];
const campaignById = new Map(snapshot.campaigns.map((c) => [c.id, c]));

/** ADS 24/7 → AI Agent: Chờ duyệt / Nhật ký / Quy tắc. Giai đoạn này chỉ hiển thị, chưa thực hiện thao tác */
export default function AgentPage() {
  const [params, setParams] = useSearchParams();
  const rawView = params.get('view');
  const view = VIEWS.find((v) => v === rawView) ?? 'pending';
  const setView = (v: AgentView) => setParams(v === 'pending' ? {} : { view: v });
  // Tab Nhóm: cấp đang xem nằm trên URL (?view=groups&level=product)
  const groupLevel = LEVELS.find((l) => l === params.get('level')) ?? 'video';
  const setGroupLevel = (l: GroupLevel) => setParams(l === 'video' ? { view: 'groups' } : { view: 'groups', level: l });

  const { config, updateRule, addRule, removeRule, updateGuardrails, reset } = useAgentConfig();
  const [adding, setAdding] = useState(false);
  /** Cấp + nhóm chọn sẵn khi mở form từ hộp "Agent đang theo dõi" (?add=level:groupId) */
  const [addPreset, setAddPreset] = useState<{ level: GroupLevel; trigger: string } | null>(null);
  const closeAdding = useCallback(() => {
    setAdding(false);
    setAddPreset(null);
  }, []);

  // ?view=rules&add=product:p-loss → mở form Thêm quy tắc đã chọn sẵn, rồi bỏ "add" khỏi URL
  const addParam = params.get('add');
  useEffect(() => {
    if (!addParam) return;
    const [rawLevel, ...rest] = addParam.split(':');
    const level = LEVELS.find((l) => l === rawLevel);
    if (level) {
      setAddPreset({ level, trigger: rest.join(':') });
      setAdding(true);
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('add');
        return next;
      },
      { replace: true },
    );
  }, [addParam, setParams]);
  const { settings, save: saveSettings, reset: resetBreakEven } = useAdsSettings();
  const [breakEvenOpen, setBreakEvenOpen] = useState(false);
  const closeBreakEven = useCallback(() => setBreakEvenOpen(false), []);
  const pending = pendingProposals();
  const active = activeRuleCount(config.rules);

  return (
    <>
      <PageHeader
        icon={Megaphone}
        title="ADS 24/7"
        description="Theo dõi và tối ưu chiến dịch GMV Max sản phẩm trên TikTok Ads."
        actions={<SnapshotInfo snapshot={snapshot} />}
      />
      <AdsSubNav pendingCount={pending.length} />

      <div className="space-y-6">
        <AgentStatusBar
          paused={AGENT_DATA.paused}
          lastRunAt={AGENT_DATA.lastRunAt}
          actions={AGENT_DATA.actions}
          guardrails={config.guardrails}
          activeRules={active}
        />

        <Card>
          <div className="border-b border-line p-5">
            <AgentTabs
              value={view}
              onChange={setView}
              counts={{
                pending: String(pending.length),
                log: String(AGENT_DATA.actions.length),
                rules: `${active}/${config.rules.length}`,
                groups: String(settings.groups.length + settings.productGroups.length + settings.campaignGroups.length),
                impact: '',
              }}
            />
          </div>

          <div className="rounded-b-2xl">
            {view === 'pending' && <ProposalList proposals={pending} rules={config.rules} />}
            {view === 'impact' && (
              <ImpactView
                actions={AGENT_DATA.actions}
                proposals={AGENT_DATA.proposals}
                rules={config.rules}
                evaluateAfterHours={config.guardrails.evaluateAfterHours}
                groupName={(id) => findGroupAnyLevel(settings, id)?.name ?? id}
                onGoto={(target) => (target === 'breakEven' ? setBreakEvenOpen(true) : setView(target))}
              />
            )}
            {view === 'log' && (
              <ActionLogList
                actions={AGENT_DATA.actions}
                rules={config.rules}
                evaluateAfterHours={config.guardrails.evaluateAfterHours}
              />
            )}
            {view === 'rules' && (
              <div className="space-y-4 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <p className="max-w-2xl text-sm text-muted">
                    Quy tắc chạy theo các nhóm video / sản phẩm / chiến dịch Sếp định nghĩa ở tab{' '}
                    <button type="button" onClick={() => setView('groups')} className="font-medium text-primary hover:text-primary-hover">
                      Nhóm
                    </button>
                    . Thay đổi được lưu trên trình duyệt này.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="flex w-fit shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
                  >
                    <Plus className="size-4" />
                    Thêm quy tắc
                  </button>
                </div>
                <ul className="space-y-4">
                  {config.rules.map((r) => (
                    <RuleCard
                      key={r.id}
                      rule={r}
                      settings={settings}
                      guardrails={config.guardrails}
                      onChange={(patch) => updateRule(r.id, patch)}
                      onRemove={r.custom ? () => removeRule(r.id) : undefined}
                    />
                  ))}
                </ul>
                <GuardrailsCard guardrails={config.guardrails} onChange={updateGuardrails} onReset={reset} />
              </div>
            )}
            {view === 'groups' && (
              <GroupsEditor
                // Đổi cấp → bản nháp mới theo nhóm của cấp đó
                key={groupLevel}
                level={groupLevel}
                onLevelChange={setGroupLevel}
                rules={config.rules}
                onOpenBreakEven={() => setBreakEvenOpen(true)}
              />
            )}
          </div>
        </Card>
      </div>

      {breakEvenOpen && (
        <BreakEvenModal
          products={snapshot.products}
          campaignById={campaignById}
          settings={settings}
          onSave={saveSettings}
          onReset={resetBreakEven}
          onClose={closeBreakEven}
        />
      )}

      {adding && (
        <RuleFormModal
          settings={settings}
          guardrails={config.guardrails}
          onSave={addRule}
          onClose={closeAdding}
          initialLevel={addPreset?.level}
          initialTrigger={addPreset?.trigger}
        />
      )}
    </>
  );
}
