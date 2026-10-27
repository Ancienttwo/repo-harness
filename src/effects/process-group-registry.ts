// Registration of detached POSIX process groups that a long-running service
// (`operator serve`, the MCP coding shell) owns. A service killed with SIGKILL
// runs no cleanup, so each group it starts is written to one record file under
// `<REPO_HARNESS_HOME>/process-groups/<owner-pid>-<pgid>.json`. Any service
// start reaps the groups of owners that no longer run. Windows callers start
// no detached groups, so registration and reaping are POSIX-only.
//
// One file per group needs no lock: only the owner writes or removes its own
// records while it runs, and a sweep reads only records whose owner is dead.

import { spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

import { processGroupExists, signalProcessGroup, terminateProcessGroupSync } from './process-group-termination';
import { repoHarnessHome } from './repo-harness-home';

const RECORD_KIND = 'repo-harness-detached-process-group';
const RECORD_NAME = /^([1-9]\d*)-([1-9]\d*)\.json$/;
const ORPHAN_TERMINATION_GRACE_MS = 500;
// `ps -o etime` has whole-second resolution.
const START_TIME_TOLERANCE_MS = 1_000;

interface ProcessGroupRecord {
  readonly protocol: 1;
  readonly kind: typeof RECORD_KIND;
  readonly hostname: string;
  readonly owner_pid: number;
  readonly pgid: number;
  readonly service: string;
  readonly registered_at_ms: number;
}

export interface ReapedProcessGroup {
  readonly pgid: number;
  readonly service: string;
  /** The group no longer exists. An unconfirmed group keeps its record for the next sweep. */
  readonly confirmed: boolean;
}

export function processGroupRegistryDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return join(repoHarnessHome(env), 'process-groups');
}

function recordPath(directory: string, ownerPid: number, pgid: number): string {
  return join(directory, `${ownerPid}-${pgid}.json`);
}

function registerProcessGroup(pgid: number, service: string): string {
  const directory = processGroupRegistryDirectory();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = recordPath(directory, process.pid, pgid);
  const record: ProcessGroupRecord = {
    protocol: 1, kind: RECORD_KIND, hostname: hostname(),
    owner_pid: process.pid, pgid, service, registered_at_ms: Date.now(),
  };
  writeFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return path;
}

/**
 * Run `start`, which must spawn a detached group leader on POSIX, and register
 * its group until the child closes. A failed registration kills the group and
 * throws, so no unregistered detached group outlives this call.
 */
export function spawnRegisteredProcessGroup<T extends ChildProcess>(service: string, start: () => T): T {
  const child = start();
  const pgid = child.pid;
  if (process.platform === 'win32' || pgid === undefined) return child;
  let path: string;
  try {
    path = registerProcessGroup(pgid, service);
  } catch (error) {
    child.on('error', () => undefined);
    signalProcessGroup(pgid, 'SIGKILL');
    throw error;
  }
  child.once('close', () => {
    // A record left behind is removed by the first sweep after this owner exits.
    try { rmSync(path, { force: true }); } catch { /* see above */ }
  });
  return child;
}

function ownerRuns(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function readRecord(path: string, ownerPid: number, pgid: number): ProcessGroupRecord | null {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<ProcessGroupRecord>;
    if (value.protocol !== 1 || value.kind !== RECORD_KIND || value.owner_pid !== ownerPid || value.pgid !== pgid
      || typeof value.hostname !== 'string' || typeof value.service !== 'string'
      || !Number.isSafeInteger(value.registered_at_ms)) return null;
    return value as ProcessGroupRecord;
  } catch {
    return null;
  }
}

function elapsedSeconds(etime: string): number | null {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime);
  if (!match) return null;
  const [, days = '0', hours = '0', minutes, seconds] = match;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

/**
 * Whether the group still is the one the record names. The kernel does not
 * reuse a PID while a group with that ID exists, so a leader that started after
 * registration means the PGID now names another group. A group whose leader
 * has exited keeps the original identity.
 */
function groupIdentity(pgid: number, registeredAtMs: number): 'registered' | 'reused' | 'unknown' {
  const result = spawnSync('ps', ['-o', 'etime=', '-p', String(pgid)], {
    encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.error) return 'unknown';
  const etime = result.stdout.trim();
  if (result.status !== 0 && etime === '') return 'registered';
  const seconds = elapsedSeconds(etime);
  if (seconds === null) return 'unknown';
  return Date.now() - seconds * 1_000 > registeredAtMs + START_TIME_TOLERANCE_MS ? 'reused' : 'registered';
}

/**
 * Terminate every registered group whose owner no longer runs, then remove its
 * record. Records of running owners, of other hosts and of groups whose
 * identity cannot be read stay in place.
 */
export function reapOrphanedProcessGroups(env: NodeJS.ProcessEnv = process.env): readonly ReapedProcessGroup[] {
  if (process.platform === 'win32') return [];
  const directory = processGroupRegistryDirectory(env);
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const reaped: ReapedProcessGroup[] = [];
  for (const entry of entries) {
    const match = RECORD_NAME.exec(entry);
    if (!match) continue;
    const ownerPid = Number(match[1]);
    const pgid = Number(match[2]);
    if (ownerRuns(ownerPid)) continue;
    const path = recordPath(directory, ownerPid, pgid);
    const record = readRecord(path, ownerPid, pgid);
    if (record !== null && record.hostname !== hostname()) continue;
    if (record !== null && processGroupExists(pgid)) {
      const identity = groupIdentity(pgid, record.registered_at_ms);
      if (identity === 'unknown') continue;
      if (identity === 'registered') {
        const { confirmed } = terminateProcessGroupSync(pgid, ORPHAN_TERMINATION_GRACE_MS);
        reaped.push({ pgid, service: record.service, confirmed });
        if (!confirmed) continue;
      }
    }
    rmSync(path, { force: true });
  }
  return reaped;
}
