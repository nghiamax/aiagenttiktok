import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { defaultSystemFees, normalizeSystemFees, type SystemFees } from '../../../../shared/platformFees';

/* Biểu phí cố định của sàn do hệ thống cung cấp (server) — mọi người dùng, chỉ Quản trị viên lưu được */
export function useSystemFees() {
  const [fees, setFees] = useState<SystemFees>(defaultSystemFees);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api<SystemFees>('/finance/platform-fees')
      .then((v) => alive && setFees(normalizeSystemFees(v)))
      .catch(() => {
        /* server tắt → dùng mặc định của hệ thống */
      })
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (next: SystemFees) => {
    const saved = normalizeSystemFees(await api<SystemFees>('/finance/platform-fees', { method: 'PUT', body: next }));
    setFees(saved);
    return saved;
  }, []);

  return { fees, loaded, save };
}
