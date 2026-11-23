import { useEffect, useState } from 'react';

/**
 * Phần đang xem khi cuộn: mốc cuối cùng (theo thứ tự `ids`) có mép trên đã qua 40% màn hình.
 * Chưa qua mốc nào → null (đang ở đầu trang). `enabled = false` → luôn null, không nghe cuộn.
 */
export function useScrollSpy(ids: string[], enabled: boolean): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');

  useEffect(() => {
    if (!enabled || ids.length === 0) {
      setActive(null);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.4;
      // Cuộn hết trang → mốc cuối (phần cuối ngắn không bao giờ chạm vạch 40%)
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let hit: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) hit = id;
      }
      if (atBottom && window.scrollY > 0) {
        const last = [...ids].reverse().find((id) => document.getElementById(id));
        if (last) hit = last;
      }
      setActive(hit);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    // Nội dung tải dần (số liệu, ô mở / thu gọn) làm mốc dịch chỗ → đo lại định kỳ nhẹ
    const timer = window.setInterval(update, 1000);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.clearInterval(timer);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return active;
}
