import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { SortState } from '../types';
import { TH } from './tableStyles';

interface SortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
}

/** Ô tiêu đề cột số (căn phải), bấm để sắp xếp */
export default function SortableHeader<K extends string>({ label, sortKey, sort, onSort }: SortableHeaderProps<K>) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th className={`${TH} text-right`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`ml-auto inline-flex items-center gap-1 transition-colors hover:text-ink ${active ? 'text-ink' : ''}`}
      >
        {label}
        <Icon className={`size-3.5 ${active ? 'text-primary' : 'opacity-50'}`} />
      </button>
    </th>
  );
}
