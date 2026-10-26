// Background Bot access collector (PRD G29). It runs only in the `operator
// serve` process on a timer, never on a request path; a GET reads `read()`.
//
// Sources: `repo-harness mcp doctor --json` (never `--live`, which registers
// and saves an OAuth client), the Bot registry, the MCP OAuth token store, the repository
// registry, the newest MCP audit row of each registered repository, `herdr
// status --json` and the `session.snapshot` socket method, and the notify
// plugin status. Every source passes through a projection in
// `core/operator/bot-access`, so the cache holds no secret, absolute path,
// stderr or environment value. Nothing here writes: the OAuth store and the
// segmented audit log are read directly, without their writers' load or lock.

import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  projectBots,
  projectHerdrSnapshot,
  projectHerdrStatus,
  projectMcpAuditEntry,
  projectMcpDoctor,
  projectOAuthClients,
  projectRegistryRepo,
  type BotAccessSnapshotV1,
  type BotDirectory,
  type McpAuditProjection,
  type RegistryRepoProjection,
} from '../../core/operator/bot-access';
import { readBotRegistry } from '../bot-registry';
import { readRepoHarnessRegistryStrictSnapshot, RepoHarnessRegistryStrictError, repoHarnessHome } from '../repo-registry';
import { herdrVersionCheck, requestHerdrObservation, type HerdrJson } from '../terminal/herdr-observation';
import { readNotifyChannelStatus, type NotifyChannelStatus, type NotifyStatusReadInput } from './notify-status';

const runFile = promisify(execFile);

export const BOT_ACCESS_INTERVAL_MS = 5 * 60_000;
export const BOT_ACCESS_TIMEOUT_MS = 30_000;
const STDOUT_LIMIT = 4 * 1024 * 1024;
const OAUTH_STORE_LIMIT = 4 * 1024 * 1024;
const AUDIT_TAIL_BYTES = 64 * 1024;
const SNAPSHOT_DEADLINE_MS = 5_000;

/** The store `McpOAuthTokenStore` persists and the log `writeMcpAuditEntry` appends; tests pin both against their writers. */
export const MCP_OAUTH_TOKEN_STORE_FILE = 'mcp.oauth-tokens.json';
export const MCP_AUDIT_LOG_SEGMENTS = ['.ai', 'harness', 'mcp', 'audit.log'] as const;
const AUDIT_SEGMENT_NAME = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/;

/** The doctor argv is a code constant. It never carries `--live`. */
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
  readonly cwd?: string;
  /** The Herdr session that runs the Bots and the notify plugin. Defaults to the session Herdr itself selects. */
  readonly session?: string;
  readonly now?: () => Date;
  readonly timeout_ms?: number;
  readonly run_command?: BotAccessCommand;
  readonly read_notify?: (input: NotifyStatusReadInput) => Promise<NotifyChannelStatus>;
}

function withoutHerdr(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const name of Object.keys(next)) if (name.startsWith('HERDR_')) delete next[name];
  return next;
}

async function mcpSection(input: Required<Pick<BotAccessReadInput, 'env' | 'cwd' | 'timeout_ms' | 'run_command'>>): Promise<BotAccessSnapshotV1['mcp']> {
  const env: NodeJS.ProcessEnv = { ...input.env, NO_COLOR: '1' };
  delete env.REPO_HARNESS_MCP_OAUTH_PASSPHRASE;
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

async function oauthSection(env: NodeJS.ProcessEnv, now: Date, directory: BotDirectory): Promise<BotAccessSnapshotV1['oauth']> {
  const path = join(repoHarnessHome(env), MCP_OAUTH_TOKEN_STORE_FILE);
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > OAUTH_STORE_LIMIT) return { state: 'unavailable', reason: 'oauth_unreadable' };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { state: 'missing' } : { state: 'unavailable', reason: 'oauth_unreadable' };
  }
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let raw: string;
    try { raw = await handle.readFile('utf8'); } finally { await handle.close(); }
    return { state: 'ok', ...projectOAuthClients(JSON.parse(raw), Math.floor(now.getTime() / 1000), directory) };
  } catch {
    return { state: 'unavailable', reason: 'oauth_unreadable' };
  }
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
    const directory = join(root, ...MCP_AUDIT_LOG_SEGMENTS.slice(0, -1));
    try { if (await realpath(directory) !== directory) return { state: 'unavailable', reason: 'audit_unreadable' }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'missing' }; throw error; }
    const active = join(directory, MCP_AUDIT_LOG_SEGMENTS.at(-1)!);
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

async function herdrSection(input: Required<Pick<BotAccessReadInput, 'env' | 'cwd' | 'timeout_ms' | 'run_command'>> & { readonly session: string; readonly directory: BotDirectory }): Promise<BotAccessSnapshotV1['herdr']> {
  const result = await input.run_command('herdr', ['--session', input.session, 'status', '--json'], {
    cwd: input.cwd, env: withoutHerdr(input.env), timeout_ms: input.timeout_ms,
  });
  if (!result.ok) return { session: input.session, status: { state: 'unavailable', reason: 'herdr_status_failed' }, snapshot: { state: 'unavailable', reason: 'herdr_snapshot_failed' } };
  let raw: HerdrJson, value;
  try {
    raw = JSON.parse(result.stdout) as HerdrJson;
    value = projectHerdrStatus(raw, herdrVersionCheck);
  } catch {
    return { session: input.session, status: { state: 'unavailable', reason: 'herdr_status_invalid' }, snapshot: { state: 'unavailable', reason: 'herdr_snapshot_failed' } };
  }
  const status = { state: 'ok', value } as const;
  if (value.server.status !== 'running') return { session: input.session, status, snapshot: { state: 'unavailable', reason: 'herdr_not_running' } };
  // An unpinned server's snapshot schema is unverified, so it is not read.
  if (value.server.version?.state !== 'aligned') return { session: input.session, status, snapshot: { state: 'unavailable', reason: 'herdr_version_mismatch' } };
  // Herdr names the socket of the session it answered for. The path stays inside this function.
  const socket = (raw.server as HerdrJson).socket;
  if (typeof socket !== 'string' || !isAbsolute(socket)) return { session: input.session, status, snapshot: { state: 'unavailable', reason: 'herdr_snapshot_failed' } };
  try {
    const reply = await requestHerdrObservation({ socket_path: socket, deadline_ms: SNAPSHOT_DEADLINE_MS }, 'session.snapshot');
    if (reply.type !== 'session_snapshot') throw new Error('herdr_snapshot_type');
    return { session: input.session, status, snapshot: { state: 'ok', value: projectHerdrSnapshot(reply.snapshot, input.directory) } };
  } catch {
    return { session: input.session, status, snapshot: { state: 'unavailable', reason: 'herdr_snapshot_failed' } };
  }
}

async function notifySection(read: NonNullable<BotAccessReadInput['read_notify']>, env: NodeJS.ProcessEnv, session: string, now: Date): Promise<BotAccessSnapshotV1['notify']> {
  try {
    const { status, channels } = await read({ env, session, now });
    return { state: 'ok', status, channels };
  } catch {
    return { state: 'unavailable', reason: 'notify_status_failed' };
  }
}

/** One collection cycle. Each section fails on its own; the cycle itself does not throw. */
export async function collectBotAccess(input: BotAccessReadInput = {}): Promise<BotAccessSnapshotV1> {
  const env = { ...process.env, ...input.env };
  const session = input.session ?? (env.HERDR_SESSION || 'default');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(session)) throw new Error('bot_access_session');
  const now = (input.now ?? (() => new Date()))();
  const base = { env, cwd: input.cwd ?? process.cwd(), timeout_ms: input.timeout_ms ?? BOT_ACCESS_TIMEOUT_MS, run_command: input.run_command ?? runBotAccessCommand };
  // One registry read per cycle, so every attribution in a snapshot agrees.
  const directory = botDirectory(env);
  const bots: BotAccessSnapshotV1['bots'] = directory.state === 'ok' ? { state: 'ok', bots: projectBots(directory) } : { state: 'unavailable', reason: 'bot_registry_invalid' };
  const [mcp, oauth, registry, herdr, notify] = await Promise.all([
    mcpSection(base),
    oauthSection(env, now, directory),
    registrySection(env, directory),
    herdrSection({ ...base, session, directory }),
    notifySection(input.read_notify ?? readNotifyChannelStatus, env, session, now),
  ]);
  return { protocol: 1, kind: 'operator_bot_access', observed_at: now.toISOString(), bots, mcp, oauth, registry, herdr, notify };
}

export interface BotAccessCollectorHandle {
  /** Cache read only; never starts work. `null` until the first cycle settles. */
  readonly read: () => BotAccessSnapshotV1 | null;
  /** Resolves when the cycle in flight, if any, has settled. */
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** Collect at startup, then every interval after the previous cycle settles. Cycles never overlap. */
export function startBotAccessCollector(options: BotAccessReadInput & { readonly interval_ms?: number } = {}): BotAccessCollectorHandle {
  let cache: BotAccessSnapshotV1 | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  const cycle = (): Promise<void> => {
    inflight = collectBotAccess(options)
      .then(snapshot => { if (!closed) cache = snapshot; }, () => { /* keep the last snapshot */ })
      .finally(() => {
        inflight = null;
        if (closed) return;
        timer = setTimeout(cycle, options.interval_ms ?? BOT_ACCESS_INTERVAL_MS);
        timer.unref?.();
      });
    return inflight;
  };
  void cycle();
  return Object.freeze({
    read: () => cache,
    settled: () => inflight ?? Promise.resolve(),
    close: async () => {
      closed = true;
      clearTimeout(timer);
      await inflight;
    },
  });
}
