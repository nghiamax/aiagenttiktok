import readline from 'node:readline';
import { isRole, ROLE_LABEL, ROLES } from '../shared/permissions.js';
import { destroyUserSessions } from './auth/sessions.js';
import { createUser, findUser, listUsers, setDisabled, setPassword, UserError } from './auth/users.js';

/**
 * Quản lý tài khoản web trên máy chạy server (chưa có trang quản trị):
 *   npm run user -- add <tên> [--name "Tên hiển thị"] [--role owner|staff]
 *   npm run user -- passwd <tên>
 *   npm run user -- disable <tên>   |   enable <tên>
 *   npm run user -- list
 * Mật khẩu nhập ẩn trên terminal (không nằm trong lịch sử lệnh).
 */

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Không in lại ký tự đã gõ
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function askNewPassword(): Promise<string> {
  const a = await ask('Mật khẩu mới: ', true);
  const b = await ask('Nhập lại mật khẩu: ', true);
  if (a !== b) throw new UserError('Hai lần nhập không khớp');
  return a;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function need(username: string | undefined) {
  if (!username) throw new UserError('Thiếu tên đăng nhập');
  const u = findUser(username);
  if (!u) throw new UserError(`Không có tài khoản "${username}"`);
  return u;
}

async function main() {
  const [cmd, username, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'add': {
      if (!username) throw new UserError('Cách dùng: npm run user -- add <tên> [--name "…"] [--role owner|staff]');
      const role = flag(rest, 'role') ?? 'owner';
      if (!isRole(role)) throw new UserError(`Vai trò: ${ROLES.join(' | ')}`);
      const u = createUser({ username, name: flag(rest, 'name'), role, password: await askNewPassword() });
      console.log(`Đã tạo tài khoản ${u.username} (${ROLE_LABEL[u.role]}).`);
      break;
    }
    case 'passwd': {
      const u = need(username);
      setPassword(u.id, await askNewPassword());
      destroyUserSessions(u.id);
      console.log(`Đã đổi mật khẩu ${u.username} — mọi phiên đăng nhập cũ đã bị đăng xuất.`);
      break;
    }
    case 'disable':
    case 'enable': {
      const u = need(username);
      setDisabled(u.id, cmd === 'disable');
      if (cmd === 'disable') destroyUserSessions(u.id);
      console.log(`${cmd === 'disable' ? 'Đã khoá' : 'Đã mở khoá'} ${u.username}.`);
      break;
    }
    case 'list': {
      const users = listUsers();
      if (users.length === 0) console.log('Chưa có tài khoản nào.');
      for (const u of users) console.log(`${u.username}\t${u.name}\t${ROLE_LABEL[u.role]}${u.disabled ? '\t(đã khoá)' : ''}`);
      break;
    }
    default:
      console.log('Lệnh: add <tên> [--name "…"] [--role owner|staff] · passwd <tên> · disable <tên> · enable <tên> · list');
  }
}

main().catch((e) => {
  console.error(e instanceof UserError ? `Lỗi: ${e.message}` : e);
  process.exit(1);
});
