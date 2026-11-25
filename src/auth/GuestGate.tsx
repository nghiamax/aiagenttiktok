import type { KeyboardEvent, ReactNode, SyntheticEvent } from 'react';
import { useAuth } from './AuthProvider';

/** Phần tử tính là "chức năng" — khách bấm vào thì mở hộp đăng nhập */
const INTERACTIVE =
  'button, a[href], input, select, textarea, label, summary, [role="button"], [role="switch"], [role="tab"], [role="checkbox"], [role="radio"], [role="option"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
/** Phần tử được phép bấm khi là khách (vd nút Đăng nhập) */
const ALLOW = '[data-guest-allow]';

function hitInteractive(e: SyntheticEvent): boolean {
  const el = e.target instanceof Element ? e.target : null;
  if (!el || el.closest(ALLOW)) return false;
  return !!el.closest(INTERACTIVE);
}

/**
 * Chế độ khách: chặn MỌI thao tác trong vùng bọc (bấm nút, mở ô chọn, gõ vào ô nhập…) ở 1 chỗ
 * → mở hộp đăng nhập, không phải sửa từng nút. Đã đăng nhập → không làm gì.
 */
export default function GuestGate({ children, className }: { children: ReactNode; className?: string }) {
  const { guest, promptLogin } = useAuth();
  if (!guest) return <div className={className}>{children}</div>;

  const block = (e: SyntheticEvent) => {
    if (!hitInteractive(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const blockAndPrompt = (e: SyntheticEvent) => {
    if (!hitInteractive(e)) return;
    e.preventDefault();
    e.stopPropagation();
    promptLogin();
  };
  const onKey = (e: KeyboardEvent) => {
    // Tab vẫn được (di chuyển bằng bàn phím); phím khác trên ô / nút → yêu cầu đăng nhập
    if (e.key === 'Tab') return;
    blockAndPrompt(e);
  };

  return (
    <div
      className={className}
      onPointerDownCapture={block}
      onMouseDownCapture={block}
      onClickCapture={blockAndPrompt}
      onKeyDownCapture={onKey}
      onChangeCapture={block}
    >
      {children}
    </div>
  );
}
