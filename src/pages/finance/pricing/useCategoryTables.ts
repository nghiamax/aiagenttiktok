import { useEffect, useState } from 'react';
import { decodeTables, type CategoryTables } from './categoryTables';

let cache: CategoryTables | null = null;

/** Bảng phí ngành của hệ thống — nạp động (file ~700KB), dùng chung cho cả trang */
export function useCategoryTables(): { tables: CategoryTables; loading: boolean; error: boolean } {
  const [tables, setTables] = useState<CategoryTables | null>(cache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    import('../../../data/category-fees.json')
      .then((m) => {
        cache = decodeTables(m.default);
        if (alive) setTables(cache);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);
  return { tables: tables ?? {}, loading: !tables && !error, error };
}
