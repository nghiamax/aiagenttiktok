import type { VideoAction } from '../types';
import { useAgentStore } from './agentStore';
import type { AgentGuardrails, AgentProposal, AgentRule, RuleLevel } from './types';

/** Phần Sếp chỉnh trên giao diện: quy tắc + giới hạn an toàn (lưu trên server) */
export interface AgentConfigView {
  rules: AgentRule[];
  guardrails: AgentGuardrails;
}

/** Cấu hình Agent + các hàm sửa (lưu trên server qua AgentStoreProvider) */
export function useAgentConfig() {
  const { state, updateRule, addRule, removeRule, updateGuardrails, reset } = useAgentStore();
  const config: AgentConfigView = { rules: state.rules, guardrails: state.guardrails };
  return { config, updateRule, addRule, removeRule, updateGuardrails, reset };
}

export const pendingProposals = (proposals: AgentProposal[]) => proposals.filter((p) => p.status === 'pending');

export function activeRuleCount(rules: AgentRule[]): number {
  return rules.filter((r) => r.mode !== 'off').length;
}

/** Quy tắc gắn với một nhóm (cùng cấp), ưu tiên quy tắc đang bật */
export function ruleForTrigger(rules: AgentRule[], trigger: VideoAction, level: RuleLevel = 'video'): AgentRule | null {
  const list = rules.filter((r) => (r.level ?? 'video') === level && r.trigger === trigger);
  return list.find((r) => r.mode !== 'off') ?? list[0] ?? null;
}
