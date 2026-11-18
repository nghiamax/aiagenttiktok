import { useCallback, useMemo, useState } from 'react';
import { buildSuggestions, findMatchingRule, type Suggestion } from '../../../../shared/suggest';
import { useAdsData } from '../data';
import { useAdsSettings } from '../settings';
import { useAgentStore } from './agentStore';

export type { Suggestion } from '../../../../shared/suggest';

/** Gợi ý Sếp đã ẩn: id → số đối tượng lúc ẩn (số tăng thì hiện lại). Lưu trong trình duyệt. */
const DISMISS_KEY = 'ads-suggest-dismissed';

function readDismissed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function writeDismissed(map: Record<string, number>) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(map));
  } catch {
    /* bỏ qua */
  }
}

/** Gợi ý cho shop từ số liệu đang xem + thiết lập + quy tắc (shared/suggest.ts) */
export function useSuggestions() {
  // Gợi ý luôn xét 7 ngày đến hôm qua (giống Agent), không theo khoảng ngày đang xem
  const { baseline: snapshot } = useAdsData();
  const { settings } = useAdsSettings();
  const { state, addRule, updateRule, updateGuardrails } = useAgentStore();
  const [dismissed, setDismissed] = useState<Record<string, number>>(readDismissed);

  const all = useMemo(
    () => buildSuggestions(snapshot, settings, state.rules, state.guardrails),
    [snapshot, settings, state.rules, state.guardrails],
  );
  const visible = all.filter((s) => !(dismissed[s.id] != null && s.count <= dismissed[s.id]));
  const open = visible.filter((s) => !s.done);

  const dismiss = useCallback((s: Suggestion) => {
    setDismissed((prev) => {
      const next = { ...prev, [s.id]: s.count };
      writeDismissed(next);
      return next;
    });
  }, []);

  /** Bật quy tắc tương ứng (luôn ở chế độ Cần duyệt) */
  const apply = useCallback(
    (s: Suggestion) => {
      const a = s.action;
      if (a.kind !== 'rule') return;
      const existing = findMatchingRule(state.rules, a);
      if (existing) {
        updateRule(existing.id, { mode: 'approve', params: { ...existing.params, ...a.params } });
      } else {
        addRule({
          id: `sg-${a.level}-${a.trigger}-${a.actionType}`,
          name: a.name,
          level: a.level,
          trigger: a.trigger,
          actionType: a.actionType,
          params: a.params,
          mode: 'approve',
          cooldownHours: state.guardrails.cooldownHours,
          campaignIds: null,
          productIds: null,
        });
      }
      if (a.guardrailsPatch) updateGuardrails(a.guardrailsPatch);
    },
    [state.rules, state.guardrails.cooldownHours, addRule, updateRule, updateGuardrails],
  );

  return {
    /** Gợi ý đang hiện (kể cả đã bật) */
    suggestions: visible,
    /** Gợi ý chưa làm */
    openCount: open.length,
    /** Gợi ý chưa làm thuộc nhóm đang mất tiền / cần làm */
    urgentCount: open.filter((s) => s.severity === 'urgent').length,
    range: snapshot.range,
    apply,
    dismiss,
  };
}
