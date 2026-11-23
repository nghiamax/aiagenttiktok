import { useCallback, useEffect, useState } from 'react';
import { readBulkCosts, writeBulkCost } from '../pricing/bulk/useBulkStore';
import { pushCosts } from '../costSync';
import type { OtherCost, ProfitData, ProfitOptions } from './profitCalc';
import type { ProfitFileKind } from './profitImport';

const KEY = 'finance-profit-v1';

/** 1 file đã tải (giữ dữ liệu đã đọc — không lưu thông tin người mua) */
export interface ProfitFile {
  id: string;
  name: string;
  kind: ProfitFileKind;
  /** File quyết toán: true = đã quyết toán, false = chờ quyết toán */
  settled: boolean;
  importedAt: string;
  rows: number;
  range: { from: string; to: string } | null;
  data: ProfitData;
}

export interface ProfitState {
  files: ProfitFile[];
  otherCosts: OtherCost[];
  options: ProfitOptions;
}

const DEFAULT: ProfitState = {
  files: [],
  otherCosts: [],
  options: { includeUnsettled: true, dedupeGmvMax: true },
};

function load(): ProfitState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ProfitState> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT;
    return {
      files: Array.isArray(raw.files) ? raw.files.filter((f) => f && f.data && typeof f.id === 'string') : [],
      otherCosts: Array.isArray(raw.otherCosts)
        ? raw.otherCosts.filter((c) => c && typeof c.id === 'string' && typeof c.value === 'number')
        : [],
      options: { ...DEFAULT.options, ...(raw.options ?? {}) },
    };
  } catch {
    return DEFAULT;
  }
}

/** File + chi phí khác + tuỳ chọn của trang Tính lợi nhuận, lưu trên trình duyệt này */
export function useProfitStore() {
  const [state, setState] = useState<ProfitState>(load);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      setSaveError(false);
    } catch {
      setSaveError(true); // file quá lớn so với bộ nhớ trình duyệt → vẫn tính được, chỉ không nhớ khi tải lại trang
    }
  }, [state]);
  return { state, setState, saveError };
}

/** Giá vốn TikTok theo ID SKU — dùng chung với Tính giá bán → Tính hàng loạt */
export function useSharedCosts() {
  const [costs, setCosts] = useState<Record<string, number>>(() => readBulkCosts('tiktok'));
  const setCost = useCallback((key: string, value: number) => {
    writeBulkCost('tiktok', key, value);
    pushCosts('tiktok', { [key]: value > 0 ? value : 0 });
    setCosts((c) => {
      const next = { ...c };
      if (value > 0) next[key] = value;
      else delete next[key];
      return next;
    });
  }, []);
  return { costs, setCost };
}
