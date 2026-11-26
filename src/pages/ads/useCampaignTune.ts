import { useMemo } from 'react';
import { tuneDecisions, type TuneDecision, type TuneKind } from '../../../shared/campaignTune';
import { useAgentStore } from './agent/agentStore';
import { useAdsSettings } from './settings';
import { useTrend } from './trend';

export type CampaignTune = TuneDecision & { signal?: boolean };

/**
 * Quyết định "BOT chỉnh ROI & ngân sách" cho mọi chiến dịch — cùng hàm với Agent trên server
 * (khung A = 7 ngày tính cả hôm nay, khung B = 7 ngày trước đó, hôm nay cho H3, lịch sử bước thử từ Nhật ký).
 */
export function useCampaignTune(): Map<string, CampaignTune> {
  const { snaps } = useTrend();
  const { settings } = useAdsSettings();
  const { state } = useAgentStore();
  return useMemo(
    () => (snaps.d7 ? tuneDecisions(snaps.d7, snaps.d14, settings, state.actions, Date.now(), { d30: snaps.d30, d1: snaps.d1 }) : new Map<string, CampaignTune>()),
    [snaps.d7, snaps.d14, snaps.d30, snaps.d1, settings, state.actions],
  );
}

/** Bộ lọc bảng Chiến dịch từ ô Tổng quan: action=tune-loss / tune-grow / tune-testing */
export const TUNE_FILTERS: Record<string, { kind: TuneKind; label: string }> = {
  'tune-loss': { kind: 'loss', label: 'Đang lỗ' },
  'tune-grow': { kind: 'grow', label: 'Có cơ hội tăng' },
  'tune-testing': { kind: 'testing', label: 'Đang thử' },
};

export const TUNE_TONE: Record<TuneKind, string> = {
  loss: 'bg-rose-50 text-danger',
  grow: 'bg-green-50 text-accent-green',
  testing: 'bg-violet-50 text-accent-violet',
  hold: 'bg-primary-soft text-primary',
  na: 'bg-canvas text-muted',
};
