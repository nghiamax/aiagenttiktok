import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NAV_ANCHOR_EVENT } from '../config/navigation';

/**
 * Mục con sidebar có `anchor`: cuộn tới phần tử `id` (đang ở trang → sự kiện NAV_ANCHOR_EVENT;
 * từ trang khác → `#id` trên URL, xử lý xong thì xoá `#`). `onReveal` chạy trước khi cuộn (vd mở ô đang thu gọn).
 */
export function useNavAnchor(id: string, onReveal?: () => void) {
  const location = useLocation();
  const navigate = useNavigate();
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;

  useEffect(() => {
    const reveal = () => {
      revealRef.current?.();
      // Đợi giao diện cập nhật (ô vừa mở) rồi mới cuộn
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    };
    if (location.hash === `#${id}`) {
      reveal();
      navigate({ pathname: location.pathname, search: location.search }, { replace: true });
    }
    const onAnchor = (e: Event) => {
      if ((e as CustomEvent<string>).detail === id) reveal();
    };
    window.addEventListener(NAV_ANCHOR_EVENT, onAnchor);
    return () => window.removeEventListener(NAV_ANCHOR_EVENT, onAnchor);
  }, [id, location.hash, location.pathname, location.search, navigate]);
}
