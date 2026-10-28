import { execFileSync } from 'node:child_process';
import { readdirSync, readlinkSync, statSync } from 'node:fs';

export interface WorktreeProcess { pid: number; cwd: string }
/** Null means occupancy could not be proved. Never turn a failed process probe into an empty list. */
export function worktreeProcesses(deadline: number): WorktreeProcess[] | null {
  try {
    if (process.platform === 'linux') {
      const result: WorktreeProcess[] = [];
      for (const pid of readdirSync('/proc').filter(name => /^\d+$/u.test(name))) {
        if (Date.now() >= deadline) return null;
        try {
          // Like unprivileged lsof on macOS, inventory this operator's processes.
          if (statSync(`/proc/${pid}`).uid !== process.getuid?.()) continue;
          result.push({ pid: Number(pid), cwd: readlinkSync(`/proc/${pid}/cwd`) });
        }
        // The kernel refuses the cwd of a same-UID non-dumpable process, for example systemd --user.
        // Unprivileged lsof on macOS skips such a process too. Every other probe error is unknown.
        catch (error) { if (!['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) return null; }
      }
      return result;
    }
    if (process.platform !== 'darwin') return null;
    const output = execFileSync('/usr/sbin/lsof', ['-a', '-d', 'cwd', '-Fpn0'], {
      cwd: '/', encoding: 'utf8', timeout: Math.max(1, deadline - Date.now()), maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result: WorktreeProcess[] = [];
    let pid: number | null = null;
    for (const field of output.split('\0').map(part => part.replace(/^\n/u, ''))) {
      if (/^p\d+$/u.test(field)) pid = Number(field.slice(1));
      else if (field.startsWith('n') && pid !== null) result.push({ pid, cwd: field.slice(1) });
    }
    return result.length ? result : null;
  } catch { return null; }
}
