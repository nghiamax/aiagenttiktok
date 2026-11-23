import { useCallback, useEffect, useState } from 'react';
import { defaultConfig, normalizeConfig, normalizeForm, type PricingConfig, type PricingForm } from './config';

const CONFIG_KEY = 'finance-pricing-config-v1';
const FORM_KEY = 'finance-pricing-form-v1';

function readJson(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* trình duyệt chặn lưu → bỏ qua */
  }
}

/** Biểu phí do Sếp nhập, lưu trên trình duyệt này */
export function usePricingConfig() {
  const [config, setConfig] = useState<PricingConfig>(() => normalizeConfig(readJson(CONFIG_KEY)));
  useEffect(() => writeJson(CONFIG_KEY, config), [config]);
  const reset = useCallback(() => setConfig(defaultConfig()), []);
  return { config, setConfig, reset };
}

export function usePricingForm() {
  const [form, setForm] = useState<PricingForm>(() => normalizeForm(readJson(FORM_KEY)));
  useEffect(() => writeJson(FORM_KEY, form), [form]);
  const update = useCallback(<K extends keyof PricingForm>(key: K, value: PricingForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);
  return { form, setForm, update };
}
