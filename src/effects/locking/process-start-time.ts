import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { win32 } from 'path';

const PROCESS_TABLE_TIMEOUT_MS = 10_000;

let linuxBootId: string | undefined;
let ownStartTime: string | undefined;

function unreadable(pid: number, detail: string): Error {
  return new Error(`cannot read the process start time of pid ${pid}: ${detail}`);
}

function readLinuxBootId(): string {
  if (linuxBootId === undefined) {
    const value = readFileSync('/proc/sys/kernel/random/boot_id', 'utf-8').trim();
    if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('cannot read the Linux boot ID');
    linuxBootId = value;
  }
  return linuxBootId;
}

function linuxStartTime(pid: number): string | null {
  let stat: string;
  try {
    stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ESRCH') return null;
    throw error;
  }
  // The command name in field 2 may hold spaces and parentheses; fields after
  // its closing parenthesis start at field 3, so field 22 is index 19.
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const ticks = fields[19];
  if (ticks === undefined || !/^\d+$/.test(ticks)) throw unreadable(pid, 'malformed /proc stat');
  return `linux:${readLinuxBootId()}:${ticks}`;
}

function darwinStartTime(pid: number): string | null {
  // A fixed binary and environment keep PATH and locale out of the value.
  const result = spawnSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
    encoding: 'utf-8',
    env: { LC_ALL: 'C', TZ: 'UTC' },
    timeout: PROCESS_TABLE_TIMEOUT_MS,
  });
  if (result.error) throw result.error;
  const text = result.stdout.trim().replace(/\s+/g, ' ');
  if (result.status === 1 && text === '') return null;
  if (result.status !== 0 || text === '') throw unreadable(pid, `ps exited with status ${result.status}`);
  return `darwin:${text}`;
}

function windowsStartTime(pid: number): string | null {
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !win32.isAbsolute(systemRoot)) throw unreadable(pid, 'SystemRoot is not an absolute path');
  const powershell = win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; `
    + 'if ($null -eq $p) { exit 3 }; '
    + '[Console]::Out.Write($p.StartTime.ToFileTimeUtc())';
  const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf-8',
    timeout: PROCESS_TABLE_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  const text = result.stdout.trim();
  if (result.status === 3 && text === '') return null;
  if (result.status !== 0 || !/^\d+$/.test(text)) throw unreadable(pid, `Get-Process exited with status ${result.status}`);
  return `win32:${text}`;
}

/**
 * Read the start time of the process that has this PID from the OS process
 * table. The value is opaque: two reads are equal only when they name the same
 * process instance.
 *
 * A PID names one process only while it runs. After the process exits, the OS
 * can give the number to a new process. The kernel records the start time when
 * it creates the process, and no process can change it, so a reused PID has a
 * different start time:
 * - linux: field 22 of /proc/<pid>/stat (clock ticks after boot), with the boot
 *   ID, because the tick count starts again at each boot.
 * - darwin: `ps -o lstart`, from the kernel's p_starttime. The resolution is one
 *   second. Darwin gives PIDs in sequence, so a reuse in the same second needs
 *   the full PID range to wrap in that second.
 * - win32: the process creation time from Get-Process, in 100 ns units.
 *
 * Returns null when no process has this PID. Throws when the table cannot be read.
 */
export function readProcessStartTime(pid: number): string | null {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error(`invalid process id: ${pid}`);
  if (process.platform === 'linux') return linuxStartTime(pid);
  if (process.platform === 'darwin') return darwinStartTime(pid);
  if (process.platform === 'win32') return windowsStartTime(pid);
  throw unreadable(pid, `unsupported platform ${process.platform}`);
}

/** The start time of this process; read from the OS once per process. */
export function currentProcessStartTime(): string {
  if (ownStartTime === undefined) {
    const value = readProcessStartTime(process.pid);
    if (value === null) throw unreadable(process.pid, 'the current process is not in the process table');
    ownStartTime = value;
  }
  return ownStartTime;
}
