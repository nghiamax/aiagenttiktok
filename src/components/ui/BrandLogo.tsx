/**
 * Logo NECOTOO (Sếp gửi 24/11): nền xanh bo góc, chữ N trắng + mũi tên đi lên + ngôi sao vàng.
 * File: public/logo.png (256px, góc trong suốt) · tab trình duyệt: public/favicon.png (64px).
 */
export default function BrandLogo({ className = 'size-10' }: { className?: string }) {
  return <img src="/logo.png" alt="NECOTOO" className={`${className} select-none`} draggable={false} />;
}
