import { useState } from 'react';
import agentJson from '../../../data/agent.json';
import type { VideoAction } from '../types';
import type { AgentGuardrails, AgentRule, AgentState, RuleLevel } from './types';

/** Dữ liệu Agent (đề xuất, nhật ký, trạng thái) — backend/Claude ghi vào file này */
export const AGENT_DATA = agentJson as AgentState;

/** Phần Sếp chỉnh trên giao diện: chế độ + tham số quy tắc, giới hạn an toàn */
export interface AgentConfig {
  rules: AgentRule[];
  guardrails: AgentGuardrails;
}

const DEFAULT_CONFIG: AgentConfig = { rules: AGENT_DATA.rules, guardrails: AGENT_DATA.guardrails };
const STORAGE_KEY = 'ads-agent-config-v1';

function load(): AgentConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const saved = JSON.parse(raw) as Partial<AgentConfig>;
    const savedRules = new Map((saved.rules ?? []).map((r) => [r.id, r]));
    const defaultIds = new Set(DEFAULT_CONFIG.rules.map((r) => r.id));
    return {
      // Giữ danh sách quy tắc theo file mặc định, áp phần Sếp đã chỉnh lên trên,
      // rồi nối thêm các quy tắc Sếp tự tạo
      rules: [
        ...DEFAULT_CONFIG.rules.map((r) => {
          const s = savedRules.get(r.id);
          return s ? { ...r, ...s, params: { ...r.params, ...s.params }, custom: false } : r;
        }),
        ...(saved.rules ?? []).filter((r) => r.custom && !defaultIds.has(r.id)),
      ],
      guardrails: { ...DEFAULT_CONFIG.guardrails, ...saved.guardrails },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function persist(config: AgentConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // trình duyệt chặn lưu trữ → chỉ giữ trong phiên
  }
}

export function useAgentConfig() {
  const [config, setConfig] = useState<AgentConfig>(load);

  function apply(next: AgentConfig) {
    setConfig(next);
    persist(next);
  }

  return {
    config,
    updateRule(id: string, patch: Partial<AgentRule>) {
      apply({ ...config, rules: config.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    },
    addRule(rule: AgentRule) {
      apply({ ...config, rules: [...config.rules, { ...rule, custom: true }] });
    },
    /** Chỉ xoá được quy tắc tự tạo */
    removeRule(id: string) {
      apply({ ...config, rules: config.rules.filter((r) => r.id !== id || !r.custom) });
    },
    updateGuardrails(patch: Partial<AgentGuardrails>) {
      apply({ ...config, guardrails: { ...config.guardrails, ...patch } });
    },
    reset() {
      setConfig(DEFAULT_CONFIG);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // bỏ qua
      }
    },
  };
}

export const pendingProposals = () => AGENT_DATA.proposals.filter((p) => p.status === 'pending');

export function activeRuleCount(rules: AgentRule[]): number {
  return rules.filter((r) => r.mode !== 'off').length;
}

/** Quy tắc gắn với một nhóm (cùng cấp), ưu tiên quy tắc đang bật */
export function ruleForTrigger(rules: AgentRule[], trigger: VideoAction, level: RuleLevel = 'video'): AgentRule | null {
  const list = rules.filter((r) => (r.level ?? 'video') === level && r.trigger === trigger);
  return list.find((r) => r.mode !== 'off') ?? list[0] ?? null;
}
