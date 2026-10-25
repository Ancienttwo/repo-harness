import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { userInfo } from 'os';

let cachedAccountHome: string | null = null;

/**
 * The OS account home from the account database, never from the environment.
 * Bun's `os.userInfo().homedir` returns the HOME the process was launched with,
 * so trusted gate readers resolve the home here. Memoized because it spawns
 * `id` and `dscl`/`getent`.
 */
export function osAccountHome(): string {
  cachedAccountHome ??= resolveOsAccountHome();
  return cachedAccountHome;
}

function resolveOsAccountHome(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (process.platform === 'darwin' && uid !== undefined) {
    const identity = spawnSync('/usr/bin/id', ['-un', String(uid)], { encoding: 'utf-8' });
    const username = identity.status === 0 ? identity.stdout.trim() : '';
    if (!/^[A-Za-z0-9._-]+$/.test(username)) throw new Error('cannot resolve the current macOS account name');
    const directory = spawnSync('/usr/bin/dscl', ['.', '-read', `/Users/${username}`, 'NFSHomeDirectory'], { encoding: 'utf-8' });
    const match = directory.status === 0 ? directory.stdout.match(/^NFSHomeDirectory:\s*(.+)$/m) : null;
    if (!match?.[1]?.trim()) throw new Error('cannot resolve the current macOS account home');
    return match[1].trim();
  }
  if (process.platform === 'linux' && uid !== undefined) {
    for (const getent of ['/usr/bin/getent', '/bin/getent']) {
      if (!existsSync(getent)) continue;
      const account = spawnSync(getent, ['passwd', String(uid)], { encoding: 'utf-8' });
      const home = account.status === 0 ? account.stdout.trim().split(':')[5] : '';
      if (home) return home;
    }
    const account = readFileSync('/etc/passwd', 'utf-8')
      .split('\n')
      .find((line) => line.split(':')[2] === String(uid));
    const home = account?.split(':')[5];
    if (home) return home;
    throw new Error('cannot resolve the current Linux account home');
  }
  return userInfo().homedir;
}
