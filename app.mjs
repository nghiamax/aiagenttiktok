// File khởi động cho cPanel "Setup Node.js App" (Passenger): nạp tsx rồi chạy server TypeScript.
// Passenger tự gắn cổng / địa chỉ cho app.listen(). Trên VPS / máy dùng: npm start.
import { register } from 'tsx/esm/api';

register();
await import('./server/index.ts');
