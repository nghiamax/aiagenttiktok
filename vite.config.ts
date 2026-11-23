import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
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
