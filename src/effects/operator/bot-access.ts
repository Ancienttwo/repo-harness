// Background Bot access collector (PRD G29). It runs only in the `operator
// serve` process on a timer, never on a request path; a GET reads `read()`.
//
// Sources: `rh mcp doctor --json`, the Bot registry, the repository
// registry, the newest MCP audit row of each registered repository, the hc
// core (`hc server status` against the policy pin, and one `hc events`
// snapshot of the task-session terminals), and the notify
// collector's cache (that collector owns the notify probes). Every source
// passes through a projection in `core/operator/bot-access`, so the cache
// holds no secret, absolute path, stderr or environment value. Nothing here writes: the
// segmented audit log is read directly, without its writer's lock.

import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  projectBots,
  projectHcTerminal,
  projectMcpAuditEntry,
  projectMcpDoctor,
  projectRegistryRepo,
  type BotAccessSnapshotV1,
  type BotDirectory,
  type McpAuditProjection,
  type RegistryRepoProjection,
} from '../../core/operator/bot-access';
import { MCP_AUDIT_LOG_RELATIVE_PATH } from '../../core/public-projections/mcp-audit-log';
import { readBotRegistry } from '../bot-registry';
import { readRepoHarnessRegistryStrictSnapshot, RepoHarnessRegistryStrictError } from '../repo-registry';
import { HerdrCoreError } from '../terminal/herdr-core';
import { observeHcCore, readHcSnapshot, TASK_SESSION_LABELS } from './herdr-runtime-transport';
import { keepObservation, startObservationLoop } from '../observation-loop';
import type { NotifyCacheV1 } from './notify-collector';

const runFile = promisify(execFile);

export const BOT_ACCESS_INTERVAL_MS = 5 * 60_000;
export const BOT_ACCESS_TIMEOUT_MS = 30_000;
const STDOUT_LIMIT = 4 * 1024 * 1024;
const AUDIT_TAIL_BYTES = 64 * 1024;
const HC_TIMEOUT_MS = 5_000;

/**
 * Working directory of every child. The doctor reports on the repository that
 * contains its cwd; the root is no repository, so the result is the user-scope
 * MCP setup, whatever directory started the server.
 */
export const BOT_ACCESS_CWD = parse(homedir()).root;

const AUDIT_SEGMENT_NAME = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/;

/** The doctor argv is a code constant. */
export const MCP_DOCTOR_ARGV = Object.freeze([fileURLToPath(new URL('../../cli/index.ts', import.meta.url)), 'mcp', 'doctor', '--json'] as const);

export type BotAccessCommandResult = { readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly code: 'timeout' | 'failed' };
export type BotAccessCommand = (file: string, args: readonly string[], options: {
  readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly timeout_ms: number;
}) => Promise<BotAccessCommandResult>;

/** No shell; stderr is discarded; a deadline kills the child. */
export const runBotAccessCommand: BotAccessCommand = async (file, args, options) => {
  try {
    const { stdout } = await runFile(file, [...args], {
      cwd: options.cwd, env: options.env, encoding: 'utf8', timeout: options.timeout_ms, killSignal: 'SIGKILL', maxBuffer: STDOUT_LIMIT, windowsHide: true,
    });
    return { ok: true, stdout };
  } catch (error) {
    return { ok: false, code: (error as { killed?: boolean }).killed ? 'timeout' : 'failed' };
  }
};

export interface BotAccessReadInput {
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
  readonly timeout_ms?: number;
  readonly run_command?: BotAccessCommand;
  /** The notify collector cache. That collector owns the notify probes; this one runs none. */
  readonly read_notify: () => NotifyCacheV1;
}

type SectionInput = Required<Pick<BotAccessReadInput, 'env' | 'timeout_ms' | 'run_command'>> & { readonly cwd: string };

async function mcpSection(input: SectionInput): Promise<BotAccessSnapshotV1['mcp']> {
  const env: NodeJS.ProcessEnv = { ...input.env, NO_COLOR: '1' };
  const result = await input.run_command(process.execPath, MCP_DOCTOR_ARGV, { cwd: input.cwd, env, timeout_ms: input.timeout_ms });
  if (!result.ok) return { state: 'unavailable', reason: result.code === 'timeout' ? 'mcp_doctor_timeout' : 'mcp_doctor_failed' };
  try { return { state: 'ok', doctor: projectMcpDoctor(JSON.parse(result.stdout)) }; }
  catch { return { state: 'unavailable', reason: 'mcp_doctor_invalid' }; }
}

/** A strict registry read: one invalid record makes every attribution `unavailable`, never `unregistered`. */
function botDirectory(env: NodeJS.ProcessEnv): BotDirectory {
  try { return { state: 'ok', bots: readBotRegistry(env) }; }
  catch { return { state: 'unavailable' }; }
}

/** The newest projectable row in the last `AUDIT_TAIL_BYTES` of one file; `undefined` when the file does not exist. */
async function newestAuditRow(path: string, directory: BotDirectory): Promise<McpAuditProjection | null | undefined> {
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('audit_not_file');
    const start = Math.max(0, stat.size - AUDIT_TAIL_BYTES);
    const buffer = Buffer.alloc(stat.size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.toString('utf8').split('\n');
    if (start > 0) lines.shift();
    for (const line of lines.reverse()) {
      if (!line.trim()) continue;
      try {
        const row = projectMcpAuditEntry(JSON.parse(line), directory);
        if (row) return row;
      } catch { /* a torn or foreign row is skipped, never echoed */ }
    }
    return null;
  } finally { await handle.close(); }
}

/**
 * Read the active log, then the newest archived segment. The audit directory
 * must resolve to itself, so a symlinked ancestor cannot point the read outside
 * the repository.
 */
async function lastAudit(repoPath: string, bots: BotDirectory): Promise<RegistryRepoProjection['last_audit']> {
  try {
    const root = await realpath(repoPath);
    const active = join(root, MCP_AUDIT_LOG_RELATIVE_PATH);
    const directory = dirname(active);
    try { if (await realpath(directory) !== directory) return { state: 'unavailable', reason: 'audit_unreadable' }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'missing' }; throw error; }
    const current = await newestAuditRow(active, bots);
    if (current) return { state: 'ok', entry: current };
    const archive = `${active}.archive`;
    let segments: string[] = [];
    try {
      if ((await lstat(archive)).isDirectory()) segments = (await readdir(archive)).filter(name => AUDIT_SEGMENT_NAME.test(name)).sort().reverse();
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    for (const name of segments) {
      const row = await newestAuditRow(join(archive, name), bots);
      if (row) return { state: 'ok', entry: row };
    }
    return { state: 'missing' };
  } catch {
    return { state: 'unavailable', reason: 'audit_unreadable' };
  }
}

async function registrySection(env: NodeJS.ProcessEnv, directory: BotDirectory): Promise<BotAccessSnapshotV1['registry']> {
  let snapshot;
  try { snapshot = readRepoHarnessRegistryStrictSnapshot({ env }); }
  catch (error) {
    return { state: 'unavailable', reason: error instanceof RepoHarnessRegistryStrictError && error.code === 'fleet_registry_invalid' ? 'registry_invalid' : 'registry_unavailable' };
  }
  const repos = await Promise.all(snapshot.repos.map(async repo => projectRegistryRepo(repo, await lastAudit(repo.path, directory))));
  return { state: 'ok', authorization_revision: snapshot.authorizationRevision, registry_revision: snapshot.registryRevision, repos };
}

/**
 * The hc core that the server's environment selects. A core below the pin is shown with both versions, and its
 * terminals are not read, so a mismatch never looks like a missing core.
 */
async function hcSection(env: NodeJS.ProcessEnv): Promise<BotAccessSnapshotV1['hc']> {
  const herdr_app = { state: 'not_pinned' } as const;
  let observed;
  try { observed = await observeHcCore(env, HC_TIMEOUT_MS); }
  catch (error) {
    return { state: 'unavailable', reason: error instanceof HerdrCoreError && error.reason === 'missing' ? 'hc_missing' : 'hc_unreachable' };
  }
  const version = { state: 'ok', value: observed.check } as const;
  if (observed.check.state !== 'aligned') return { state: 'ok', version, herdr_app, terminals: { state: 'unavailable', reason: 'hc_version_mismatch' } };
  try {
    const { terminals } = await readHcSnapshot(TASK_SESSION_LABELS, env, AbortSignal.timeout(HC_TIMEOUT_MS));
    const value = terminals.map(projectHcTerminal).sort((a, b) => a.address.localeCompare(b.address));
    return { state: 'ok', version, herdr_app, terminals: { state: 'ok', value } };
  } catch {
    return { state: 'ok', version, herdr_app, terminals: { state: 'unavailable', reason: 'hc_terminals_failed' } };
  }
}

function notifySection(cache: NotifyCacheV1): BotAccessSnapshotV1['notify'] {
  if (cache.state === 'pending') return { state: 'unavailable', reason: 'notify_status_pending' };
  if (cache.state === 'unavailable') return { state: 'unavailable', reason: cache.reason };
  const { status, channels, deliveries } = cache.value;
  return { state: 'ok', status, channels, deliveries };
}

/** One collection cycle. Each section fails on its own. */
export async function collectBotAccess(input: BotAccessReadInput): Promise<BotAccessSnapshotV1> {
  const env = { ...process.env, ...input.env };
  const now = (input.now ?? (() => new Date()))();
  const base = { env, cwd: BOT_ACCESS_CWD, timeout_ms: input.timeout_ms ?? BOT_ACCESS_TIMEOUT_MS, run_command: input.run_command ?? runBotAccessCommand };
  // One registry read per cycle, so every attribution in a snapshot agrees.
  const directory = botDirectory(env);
  const bots: BotAccessSnapshotV1['bots'] = directory.state === 'ok' ? { state: 'ok', bots: projectBots(directory) } : { state: 'unavailable', reason: 'bot_registry_invalid' };
  const [mcp, registry, hc] = await Promise.all([
    mcpSection(base),
    registrySection(env, directory),
    hcSection(env),
  ]);
  const notify = notifySection(input.read_notify());
  return { protocol: 2, kind: 'operator_bot_access', observed_at: now.toISOString(), bots, mcp, registry, hc, notify };
}

/**
 * The collector cache. `bot_access_failed` means a cycle threw before any
 * snapshot existed; the next good cycle replaces it.
 */
export type BotAccessCacheV1 =
  | { readonly state: 'pending' }
  | { readonly state: 'failed'; readonly reason: 'bot_access_failed' }
  | { readonly state: 'ok'; readonly snapshot: BotAccessSnapshotV1 };

export interface BotAccessCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: () => BotAccessCacheV1;
  /** Resolves when the cycle in flight, if any, has settled. */
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** Collect at startup, then every interval after the previous cycle settles. Cycles never overlap. */
export interface BotAccessCollectorOptions extends BotAccessReadInput {
  readonly interval_ms?: number;
  /**
   * The first cycle starts after this settles. The server passes the notify
   * collector's first cycle, so the first snapshot does not read its cache while it is still pending.
   */
  readonly first_cycle_after?: Promise<void>;
}

export function startBotAccessCollector(options: BotAccessCollectorOptions): BotAccessCollectorHandle {
  // Keep rule: an unexpected failure keeps the last snapshot at its observation time; it is no reason to show nothing.
  const loop = startObservationLoop<BotAccessSnapshotV1, 'bot_access_failed'>({
    cycle: async () => ({ state: 'observed', value: await collectBotAccess(options) }),
    keep: keepObservation,
    failure: 'bot_access_failed',
    interval_ms: options.interval_ms ?? BOT_ACCESS_INTERVAL_MS,
    first_cycle_after: options.first_cycle_after,
  });
  return Object.freeze({
    read: (): BotAccessCacheV1 => {
      const state = loop.read();
      if (state.state === 'pending') return { state: 'pending' };
      if (state.state === 'unavailable') return { state: 'failed', reason: state.reason };
      return { state: 'ok', snapshot: state.value };
    },
    settled: loop.settled,
    close: loop.close,
  });
}
