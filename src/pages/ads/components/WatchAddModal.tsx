import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import { parseVideoId } from '../../../../shared/videoId';
import { useWatchlist } from '../watchlist';

const INPUT =
  'w-full rounded-xl border border-line px-3.5 py-2.5 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

/** Thêm video vào ô "Đang theo dõi": dán mã video hoặc link TikTok (tự tách mã) + ghi chú tuỳ chọn */
export default function WatchAddModal({ onClose }: { onClose: () => void }) {
  const { add } = useWatchlist();
  const [video, setVideo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseVideoId(video);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!parsed) return setError('Không nhận ra mã video — dán mã số hoặc link TikTok của video');
    setBusy(true);
    setError(null);
    const err = await add(parsed, note.trim() || undefined);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <Modal title="Theo dõi video" description="Video sẽ hiện ở ô Đang theo dõi cho tới khi bỏ theo dõi." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5" noValidate>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Mã video hoặc link TikTok</span>
          <input
            className={INPUT}
            value={video}
            onChange={(e) => setVideo(e.target.value)}
            placeholder="vd 7577366150904843541 hoặc https://www.tiktok.com/@…/video/…"
            autoFocus
          />
          {video && <span className="block text-xs text-muted">{parsed ? `Mã video: ${parsed}` : 'Chưa nhận ra mã video'}</span>}
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Ghi chú (tuỳ chọn)</span>
          <input className={INPUT} value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd video KOC mới, xem 3 ngày" maxLength={200} />
        </label>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink">
            Huỷ
          </button>
          <button
            type="submit"
            disabled={busy || !parsed}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Theo dõi
          </button>
        </div>
      </form>
    </Modal>
  );
}
