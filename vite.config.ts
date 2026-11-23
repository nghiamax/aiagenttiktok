import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Cố định IPv4 nội bộ: mặc định Vite có lúc chỉ nghe ::1 (IPv6) → trình duyệt gọi localhost qua 127.0.0.1 bị từ chối.
    // Vẫn chỉ trong máy — KHÔNG mở ra mạng ngoài (không dùng --host / 0.0.0.0).
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Gọi /api giống hệt khi đã lên host; server chạy bằng npm run server (cổng 8787)
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
    // Không theo dõi dữ liệu server: hồ sơ Chrome của Seller Center (.secrets/seller) khoá file tạm → Vite sập (EBUSY)
    watch: {
      ignored: ['**/.secrets/**', '**/server-data/**', '**/dist/**'],
    },
  },
});
