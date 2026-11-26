import { useEffect, useRef } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { migrateVideoGeneral } from '../../../shared/groups';
import { useAdsData } from './data';
import { useAdsSettings } from './settings';
import { useTrend } from './trend';

/**
 * Cấp video bỏ điều kiện chung (Sếp chốt 26/11): shop cũ còn điều kiện chung → chép thành điều kiện riêng
 * cho mọi sản phẩm có trong 7 / 14 / 30 ngày rồi lưu 1 lần. Chờ có snapshot 30 ngày để không sót sản phẩm.
 * Chưa chuyển thì server vẫn xét điều kiện chung như cũ (không mất Cắt lỗ / Nhân rộng).
 */
export default function VideoGroupsMigrator() {
  const { can } = useAuth();
  const { settings, loaded, saveGroups } = useAdsSettings();
  const { snapshot } = useAdsData();
  const { snaps } = useTrend();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !loaded || !can('configure') || !snaps.d30) return;
    const ids = new Set<string>();
    for (const s of [snapshot, snaps.d7, snaps.d14, snaps.d30]) for (const p of s?.products ?? []) ids.add(p.id);
    if (ids.size === 0) return;
    done.current = true;
    const next = migrateVideoGeneral(settings.groups, [...ids]);
    if (next) saveGroups('video', next);
  }, [loaded, can, snapshot, snaps, settings.groups, saveGroups]);

  return null;
}
