import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { normalizeSystemFees, type SystemFees } from '../../shared/platformFees.js';

/* Biểu phí cố định của sàn (phí giao dịch, phí xử lý đơn…): server-data/platform-fees.json — chung mọi tài khoản, chỉ Quản trị viên sửa */

const file = () => path.join(config.dataDir, 'platform-fees.json');

export function getSystemFees(): SystemFees {
  try {
    return normalizeSystemFees(JSON.parse(fs.readFileSync(file(), 'utf8')));
  } catch {
    return normalizeSystemFees(null);
  }
}

export function saveSystemFees(raw: unknown): SystemFees {
  const next = { ...normalizeSystemFees(raw), updatedAt: new Date().toISOString() };
  const p = file();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next));
  fs.renameSync(tmp, p);
  return next;
}
