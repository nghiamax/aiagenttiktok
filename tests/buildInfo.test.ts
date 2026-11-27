import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { codeChangedFrom, readCodeVersion } from '../server/buildInfo';

/* Phiên bản code từ .git — tiến trình cũ còn sống sau git pull phải nhận ra code đã đổi (lỗi hosting 27/11) */
const dirs: string[] = [];
function repo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildinfo-'));
  dirs.push(root);
  for (const [f, text] of Object.entries(files)) {
    const full = path.join(root, '.git', f);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return root;
}
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const A = 'b13ef3f0123456789abcdef0123456789abcdef0';
const B = 'd7ff60b0123456789abcdef0123456789abcdef0';

describe('readCodeVersion', () => {
  it('HEAD trỏ nhánh → đọc file ref', () => {
    expect(readCodeVersion(repo({ HEAD: 'ref: refs/heads/master\n', 'refs/heads/master': `${A}\n` }))).toBe(A.slice(0, 12));
  });
  it('nhánh đã gói vào packed-refs', () => {
    const root = repo({ HEAD: 'ref: refs/heads/master\n', 'packed-refs': `# pack-refs with: peeled\n${B} refs/heads/master\n` });
    expect(readCodeVersion(root)).toBe(B.slice(0, 12));
  });
  it('HEAD tách rời (detached) → chính commit đó', () => {
    expect(readCodeVersion(repo({ HEAD: `${A}\n` }))).toBe(A.slice(0, 12));
  });
  it('không có .git → null', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildinfo-'));
    dirs.push(root);
    expect(readCodeVersion(root)).toBeNull();
  });
  it('git pull đổi commit → nhận ra code đã đổi', () => {
    const root = repo({ HEAD: 'ref: refs/heads/master\n', 'refs/heads/master': A });
    const boot = readCodeVersion(root);
    fs.writeFileSync(path.join(root, '.git', 'refs', 'heads', 'master'), B);
    expect(codeChangedFrom(boot, readCodeVersion(root))).toBe(true);
  });
});

describe('codeChangedFrom', () => {
  it('thiếu 1 trong 2 → không kết luận', () => {
    expect(codeChangedFrom(null, 'abc')).toBe(false);
    expect(codeChangedFrom('abc', null)).toBe(false);
    expect(codeChangedFrom('abc', 'abc')).toBe(false);
  });
});
