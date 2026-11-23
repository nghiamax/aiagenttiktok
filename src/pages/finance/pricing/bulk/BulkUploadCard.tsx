import { useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Trash2, Upload } from 'lucide-react';
import { formatNumber } from '../../../../lib/format';
import { readTableFile } from '../import/readFile';
import type { Platform } from '../calc';
import { detectBulkTable, detectFilePlatform, readBulkItems, type BulkItem } from './bulkImport';

interface BulkUploadCardProps {
  /** Sàn đang xem, vd "Shopee" */
  platformLabel: string;
  files: string[];
  itemCount: number;
  /** `replace` = thay danh sách cũ, ngược lại gộp thêm */
  /** `platform` = sàn nhận ra từ file (null nếu không rõ) */
  onLoaded: (items: BulkItem[], fileNames: string[], replace: boolean, platform: Platform | null) => void;
  onClear: () => void;
}

const ACCEPT = '.xlsx,.csv,.tsv,.txt';

async function readItems(file: File): Promise<{ items: BulkItem[]; platform: Platform | null }> {
  const sheets = await readTableFile(file);
  for (const sheet of sheets) {
    const table = detectBulkTable(sheet.rows);
    if (!table) continue;
    const items = readBulkItems(sheet.rows, table, file.name);
    if (items.length) return { items, platform: detectFilePlatform(sheet.rows) };
  }
  throw new Error(
    `${file.name}: không thấy cột "Tên sản phẩm" kèm "Giá bán" hoặc "Giá vốn", hoặc file chưa có dòng sản phẩm nào.`,
  );
}

/** Tải file danh sách sản phẩm (nhiều file cùng lúc — TikTok tách file theo nhóm ngành) */
export default function BulkUploadCard({ platformLabel, files, itemCount, onLoaded, onClear }: BulkUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [replace, setReplace] = useState(false);
  const [reading, setReading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const open = (mode: boolean) => {
    setReplace(mode);
    inputRef.current?.click();
  };

  const handle = async (list: FileList | null, replaceList: boolean) => {
    const picked = list ? [...list] : [];
    if (!picked.length) return;
    setReading(true);
    setErrors([]);
    const items: BulkItem[] = [];
    const names: string[] = [];
    const errs: string[] = [];
    let platform: Platform | null = null;
    for (const f of picked) {
      try {
        if (f.name.toLowerCase().endsWith('.pdf')) throw new Error(`${f.name}: hãy dùng file Excel (.xlsx) hoặc .csv.`);
        const got = await readItems(f);
        items.push(...got.items);
        platform = got.platform ?? platform;
        names.push(f.name);
      } catch (e) {
        errs.push(e instanceof Error ? e.message : `${f.name}: không đọc được file`);
      }
    }
    if (items.length) onLoaded(items, names, replaceList, platform);
    setErrors(errs);
    setReading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const hasList = itemCount > 0;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handle(e.dataTransfer.files, !hasList);
      }}
      className={`rounded-xl border border-dashed p-4 transition ${
        dragging ? 'border-primary bg-primary-soft/50' : 'border-line bg-canvas/50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        aria-label="Chọn file danh sách sản phẩm"
        onChange={(e) => void handle(e.target.files, replace || !hasList)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
          {reading ? <Loader2 className="size-5 animate-spin" /> : <FileSpreadsheet className="size-5" />}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          {hasList ? (
            <>
              <p className="font-semibold text-ink">
                {formatNumber(itemCount)} SKU {platformLabel} từ {files.length} file
              </p>
              <p className="truncate text-muted" title={files.join(', ')}>
                {files.join(' · ')}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-ink">
                Chưa có danh sách {platformLabel} — kéo thả hoặc chọn file sản phẩm (.xlsx, .csv)
              </p>
              <p className="text-muted">
                TikTok: file "Chỉnh sửa hàng loạt" ở Seller Center (chọn được nhiều file cùng lúc) · Shopee: file "Cập
                nhật hàng loạt — Thông tin bán hàng" · hoặc file bất kỳ có cột Tên sản phẩm + Giá bán. Mỗi sàn một danh
                sách riêng — file của sàn nào tự vào danh sách sàn đó. Thêm cột <b className="text-ink">Giá vốn</b> vào
                file thì khỏi nhập tay.
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={reading}
            onClick={() => open(false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60"
          >
            <Upload className="size-4" />
            {reading ? 'Đang đọc…' : hasList ? 'Thêm file' : 'Chọn file'}
          </button>
          {hasList && (
            <>
              <button
                type="button"
                disabled={reading}
                onClick={() => open(true)}
                className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-60"
              >
                Thay danh sách
              </button>
              <button
                type="button"
                aria-label="Xoá danh sách"
                title="Xoá danh sách (giữ giá vốn đã nhập)"
                onClick={() =>
                  window.confirm('Xoá danh sách sản phẩm đang tính? Giá vốn đã nhập vẫn được nhớ theo ID SKU.') &&
                  onClear()
                }
                className="rounded-lg p-2 text-muted transition hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>
      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
