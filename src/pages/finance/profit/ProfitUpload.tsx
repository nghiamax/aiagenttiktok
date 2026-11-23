import { useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, FileSpreadsheet, Loader2, Trash2, Upload, X } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import { fileKindLabel, PROFIT_ACCEPT, readProfitFile } from './profitFiles';
import type { ProfitFile } from './useProfitStore';

interface ProfitUploadProps {
  files: ProfitFile[];
  onAdd: (files: ProfitFile[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

const dateVi = (iso: string) => iso.split('-').reverse().join('/');

/** 4 loại file của 1 kỳ: lấy ở đâu (đường bấm trên Seller Center) + 1 mẹo ngắn */
const SLOTS: {
  id: string;
  title: string;
  required: boolean;
  path: string[];
  tip: string;
  match: (f: ProfitFile) => boolean;
}[] = [
  {
    id: 'orders',
    title: 'Đơn hàng',
    required: true,
    path: ['Đơn hàng', 'Quản lý đơn hàng', 'Xuất'],
    tip: 'Lọc theo ngày đặt của kỳ cần tính',
    match: (f) => f.kind === 'orders',
  },
  {
    id: 'settled',
    title: 'Đã quyết toán',
    required: true,
    path: ['Tài chính', 'Giao dịch', 'Đã quyết toán', 'Xuất'],
    tip: 'Chọn tới ~ngày 20 tháng sau cho đủ đơn cuối kỳ',
    match: (f) => f.kind === 'income' && f.settled,
  },
  {
    id: 'unsettled',
    title: 'Chờ quyết toán',
    required: false,
    path: ['Tài chính', 'Giao dịch', 'Sẽ quyết toán', 'Xuất'],
    tip: 'Đơn đã giao nhưng TikTok chưa trả tiền',
    match: (f) => f.kind === 'income' && !f.settled,
  },
  {
    id: 'ads',
    title: 'Quảng cáo',
    required: false,
    path: ['Quảng cáo', 'GMV Max', 'Xuất báo cáo'],
    tip: 'Cùng kỳ với file đơn hàng',
    match: (f) => f.kind === 'ads',
  },
];

/** Tải các file xuất từ TikTok Shop Seller Center (tự nhận loại file) */
export default function ProfitUpload({ files, onAdd, onRemove, onClear }: ProfitUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const handle = async (list: FileList | null) => {
    const picked = list ? [...list] : [];
    if (!picked.length) return;
    setReading(true);
    const ok: ProfitFile[] = [];
    const errs: string[] = [];
    for (const f of picked) {
      try {
        ok.push(await readProfitFile(f));
      } catch (e) {
        errs.push(e instanceof Error ? e.message : `${f.name}: không đọc được file`);
      }
    }
    if (ok.length) onAdd(ok);
    setErrors(errs);
    setReading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h3 className="font-semibold">Tải file từ Seller Center</h3>
        <p className="mt-0.5 text-sm text-muted">
          Xuất 4 file theo đường bấm bên dưới rồi chọn tất cả 1 lần — trang tự nhận từng loại.
        </p>
      </div>

      <ol className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {SLOTS.map((s, i) => {
          const got = files.filter(s.match);
          const done = got.length > 0;
          return (
            <li
              key={s.id}
              className={`rounded-xl border p-3 text-sm ${done ? 'border-accent-green/30 bg-accent-green/5' : 'border-line'}`}
            >
              <div className="flex items-center gap-2">
                {done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-accent-green" />
                ) : (
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-semibold text-muted">
                    {i + 1}
                  </span>
                )}
                <span className="font-semibold text-ink">{s.title}</span>
                <span
                  className={`ml-auto rounded-md px-1.5 text-xs font-medium leading-5 ${
                    s.required ? 'bg-primary-soft text-primary' : 'bg-canvas text-muted'
                  }`}
                >
                  {s.required ? 'Bắt buộc' : 'Nên có'}
                </span>
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1 text-ink/80">
                {s.path.map((step, k) => (
                  <span key={step} className="inline-flex items-center gap-1">
                    {k > 0 && <ChevronRight className="size-3 text-muted" />}
                    {step}
                  </span>
                ))}
              </p>
              <p className={`mt-0.5 ${done ? 'font-medium text-accent-green' : 'text-muted'}`}>
                {done ? `Đã có ${got.length} file · ${formatNumber(got.reduce((n, f) => n + f.rows, 0))} dòng` : s.tip}
              </p>
            </li>
          );
        })}
      </ol>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(e.dataTransfer.files);
        }}
        className={`flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4 transition ${
          dragging ? 'border-primary bg-primary-soft/50' : 'border-line bg-canvas/50'
        }`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
          {reading ? <Loader2 className="size-5 animate-spin" /> : <FileSpreadsheet className="size-5" />}
        </span>
        <p className="min-w-0 flex-1 text-sm text-muted">
          Kéo thả file vào đây hoặc bấm <b className="text-ink">Chọn file</b> (.xlsx, .csv). Tải lại file mới hơn thì số
          mới đè số cũ.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={PROFIT_ACCEPT}
          className="hidden"
          aria-label="Chọn file từ Seller Center"
          onChange={(e) => void handle(e.target.files)}
        />
        <button
          type="button"
          disabled={reading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          <Upload className="size-4" />
          {reading ? 'Đang đọc…' : 'Chọn file'}
        </button>
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Đã tải {files.length} file</p>
            <button
              type="button"
              onClick={() => window.confirm('Xoá mọi file đã tải ở trang Tính lợi nhuận?') && onClear()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="size-4" /> Xoá tất cả
            </button>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                <span className="shrink-0 rounded-md bg-primary-soft px-2 py-0.5 font-medium text-primary">
                  {fileKindLabel(f)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink" title={f.name}>
                    {f.name}
                  </span>
                  <span className="block text-muted">
                    {formatNumber(f.rows)} dòng
                    {f.range && ` · ${dateVi(f.range.from)} – ${dateVi(f.range.to)}`}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Bỏ file ${f.name}`}
                  onClick={() => onRemove(f.id)}
                  className="rounded-md p-1 text-muted transition hover:bg-canvas hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
