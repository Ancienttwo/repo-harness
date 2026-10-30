import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';

export interface WorktreeProcess { pid: number; cwd: string }
export interface LinuxWorktreeProcessProbe {
  readonly uid: number;
  entries(): readonly string[];
  owner(pid: string): number;
  cwd(pid: string): string;
  /** The text of /proc/self/mountinfo. */
  mountInfo(): string;
}

/**
 * True only when the visible /proc mount lists every process. With
 * hidepid=invisible (2) or ptraceable (4), readdir skips a task this user cannot
 * ptrace, such as a non-dumpable same-UID process, so absence proves nothing.
 * Any malformed row, an unknown hidepid value, or more than one mount on /proc
 * (file order is not stack order) leaves the listing unproven.
 */
function procListsEveryProcess(mountInfo: string): boolean {
  const procRows: string[][] = [];
  for (const line of mountInfo.split('\n').filter(Boolean)) {
    const fields = line.split(' ');
    const separator = fields.indexOf('-', 6);
    // Six fixed fields, optional fields, '-', then exactly fstype, source and super options.
    if (separator < 0 || fields.length !== separator + 4 || fields.some(field => !field)) return false;
    if (!/^\d+$/u.test(fields[0]!) || !/^\d+$/u.test(fields[1]!) || !/^\d+:\d+$/u.test(fields[2]!)) return false;
    if (fields[4] === '/proc') procRows.push(fields.slice(separator + 1));
  }
  if (procRows.length !== 1) return false;
  const [fstype, , superOptions] = procRows[0]!;
  if (fstype !== 'proc') return false;
  return superOptions!.split(',').every(option => option !== '' && (option.split('=')[0] !== 'hidepid' || /^hidepid=(?:off|noaccess|0|1)$/u.test(option)));
}
/** A process occupies a worktree when its cwd is the worktree or a path below
 * it. A sibling directory that only shares the text prefix stays outside. */
export function occupiesWorktree(processes: readonly WorktreeProcess[], worktree: string): boolean {
  return processes.some(process => process.cwd === worktree || process.cwd.startsWith(`${worktree}/`));
}

/** Null means occupancy could not be proved. Never turn a failed process probe into an empty list. */
export function worktreeProcesses(deadline: number, linuxProbe?: LinuxWorktreeProcessProbe): WorktreeProcess[] | null {
  try {
    if (linuxProbe || process.platform === 'linux') {
      const probe = linuxProbe ?? {
        uid: process.getuid!(),
        entries: () => readdirSync('/proc'),
        owner: (pid: string) => statSync(`/proc/${pid}`).uid,
        cwd: (pid: string) => readlinkSync(`/proc/${pid}/cwd`),
        mountInfo: () => readFileSync('/proc/self/mountinfo', 'utf8'),
      };
      if (!procListsEveryProcess(probe.mountInfo())) return null;
      const result: WorktreeProcess[] = [];
      for (const pid of probe.entries().filter(name => /^\d+$/u.test(name))) {
        if (Date.now() >= deadline) return null;
        try {
          // Like unprivileged lsof on macOS, inventory this operator's processes.
          if (probe.owner(pid) !== probe.uid) continue;
          result.push({ pid: Number(pid), cwd: probe.cwd(pid) });
        }
        catch (error) { if (!['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) return null; }
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
