// Doc session agent lifecycle (PRD G5; issue #1021). One docs host process
// per session runs the OAR runtime inside the docs host boundary
// (oar-docs-host.ts). The server starts it after the session record exists,
// passes stop and cancel requests as files, and records the failure of a host
// that died. `agent.json` holds the state; the host, while it holds
// `agent.lock`, is its only writer, and the server writes it only after it
// took over the lock of a dead host.

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { accessSync, closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DocSessionFailureCategory } from '../../core/operator/doc-session-events';
import { ExclusiveLockContentionError, acquireExclusiveDirectoryLock, type ExclusiveDirectoryLockHandle } from '../locking/exclusive-directory-lock';
import { removeCopiedAuth } from '../review/review-isolation';
import { readSessionArtifact, writeSessionArtifact } from '../terminal/task-session-io';
import { appendDocSessionEvents, docSessionEventsTail } from './doc-session-events';
import { operatorStateDir } from './write-audit';

/** Owner decision D5 (2026-10-28): start 120 s, turn 30 min, idle 30 min, lifetime 4 h, which is also the credential window. */
export const DOC_SESSION_AGENT_LIMITS = Object.freeze({ start_ms: 120_000, turn_ms: 30 * 60_000, idle_ms: 30 * 60_000, lifetime_ms: 4 * 60 * 60_000 });
/** The copied model credential must outlive the whole session. */
export const DOC_SESSION_CREDENTIAL_WINDOW_MS = DOC_SESSION_AGENT_LIMITS.lifetime_ms + 120_000;

export type DocSessionAgentState = 'starting' | 'running' | 'idle' | 'stopped' | 'failed';
export type DocSessionCredentialCleanup = 'removed' | 'absent' | 'cleanup_pending';

/** `<session>/agent.json`, mode 0600. Server state only; no route serves it. */
export interface DocSessionAgentRecord {
  readonly protocol: 1;
  readonly kind: 'docs_session_agent';
  readonly session_id: string;
  readonly epoch: number;
  readonly state: DocSessionAgentState;
  readonly failure: DocSessionFailureCategory | null;
  /** An error code, never a message with paths or text. */
  readonly reason: string | null;
  readonly updated_at: string;
  /** The model the runtime reported (D7); never in events. */
  readonly actual_model: string | null;
  readonly credential: DocSessionCredentialCleanup | null;
}

export type DocSessionControl = 'stop' | 'cancel';
export type DocSessionControlResult = 'accepted' | 'no_active_turn' | 'session_closed';

const SESSION_ID = /^[0-9a-f]{32}$/u;
const AGENT_FILE = 'agent.json';
export const DOC_SESSION_AGENT_LOCK = 'agent.lock';
const CONTROL_ACK_MS = 10_000;

export const isTerminalAgentState = (state: DocSessionAgentState): boolean => state === 'stopped' || state === 'failed';

/** `<repoHarnessHome>/operator/sessions/<sid>`, a real directory that holds `session.json`. */
export function docSessionDirectory(env: NodeJS.ProcessEnv, sessionId: string): string {
  if (!SESSION_ID.test(sessionId)) throw new Error('doc_session_id_invalid');
  const directory = join(operatorStateDir(env), 'sessions', sessionId);
  const entry = lstatSync(directory);
  if (!entry.isDirectory() || entry.isSymbolicLink() || !lstatSync(join(directory, 'session.json')).isFile()) throw new Error('doc_session_directory_unsafe');
  return realpathSync(directory);
}

/** The docs host control directory: profile, launcher, git link and the writable scratch. Only it is readable inside the boundary. */
export const docSessionControlDirectory = (sessionDirectory: string): string => join(sessionDirectory, 'host');
export const docSessionRequestsDirectory = (sessionDirectory: string): string => join(sessionDirectory, 'requests');

/** Removes the session's model credential copy (the review copy lifecycle). A host that failed before its scratch existed copied nothing. */
export function removeDocSessionCredential(sessionDirectory: string): DocSessionCredentialCleanup {
  const scratch = join(docSessionControlDirectory(sessionDirectory), 'scratch');
  return existsSync(scratch) ? removeCopiedAuth(scratch).status : 'absent';
}

export function readDocSessionAgent(sessionDirectory: string): DocSessionAgentRecord | null {
  try { return readSessionArtifact<DocSessionAgentRecord>(join(sessionDirectory, AGENT_FILE)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

/** Replaces the record. Only the holder of `agent.lock` calls it. */
export function writeDocSessionAgent(sessionDirectory: string, record: DocSessionAgentRecord): void {
  writeSessionArtifact(join(sessionDirectory, AGENT_FILE), record, false);
}

export function nextAgentRecord(record: DocSessionAgentRecord, change: Partial<Omit<DocSessionAgentRecord, 'protocol' | 'kind' | 'session_id' | 'epoch'>>): DocSessionAgentRecord {
  return { ...record, ...change, updated_at: new Date().toISOString() };
}

export interface DocsHostExecutable { readonly node: string; readonly entry: string }

/** Node >= 24 runs the host, as for the review host; the server itself runs on Bun. */
export function docsHostExecutable(env: NodeJS.ProcessEnv): DocsHostExecutable {
  const entry = realpathSync(fileURLToPath(new URL('../../../dist/oar-docs-host.js', import.meta.url)));
  if (env.REPO_HARNESS_NODE_BIN) return { node: realpathSync(env.REPO_HARNESS_NODE_BIN), entry };
  for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const candidate = join(directory, 'node');
    try { accessSync(candidate, constants.X_OK); return { node: realpathSync(candidate), entry }; } catch { /* next PATH entry */ }
  }
  throw new Error('docs_host_node_not_found');
}

/**
 * The host gets a new environment, never a copy of the server's: no GH_TOKEN or
 * other credential reaches it. PATH and the OAR install variables let OAR find
 * the same runtime the settings probe found.
 */
const HOST_ENV_KEYS = ['HOME', 'PATH', 'LANG', 'TMPDIR', 'REPO_HARNESS_HOME', 'OAR_CODEX_BIN', 'CODEX_INSTALL_DIR', 'REPO_HARNESS_OAR_SCRIPTED_FIXTURE', 'REPO_HARNESS_DOCS_HOST_TURN_MS'];
function hostEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(HOST_ENV_KEYS.flatMap(key => (env[key] ? [[key, env[key]!]] : [])));
}

/**
 * Writes `agent.json` once (a second launch for a session fails here), then
 * starts the detached host. A host that cannot start, or that exits without a
 * terminal state, is recorded as failed. Detached hosts outlive a server
 * restart (D6); the next server start reconciles a host that died meanwhile.
 */
export function startDocSessionAgent(env: NodeJS.ProcessEnv, sessionId: string, host: () => DocsHostExecutable): DocSessionAgentState {
  const directory = docSessionDirectory(env, sessionId);
  writeSessionArtifact(join(directory, AGENT_FILE), {
    protocol: 1, kind: 'docs_session_agent', session_id: sessionId, epoch: 1, state: 'starting', failure: null, reason: null,
    updated_at: new Date().toISOString(), actual_model: null, credential: null,
  } satisfies DocSessionAgentRecord);
  try {
    mkdirSync(docSessionRequestsDirectory(directory), { mode: 0o700 });
    const { node, entry } = host();
    const log = openSync(join(directory, 'host.log'), 'a', 0o600);
    let child;
    try {
      child = spawn(node, ['--disable-sigusr1', entry, directory], { detached: true, stdio: ['ignore', log, log], env: hostEnvironment(env) });
    } finally { closeSync(log); }
    // An exit handler must not throw into the server; a session left open is reconciled at the next server start.
    const settle = () => { try { reconcileDocSessionAgent(env, sessionId); } catch { /* reconciled at the next server start */ } };
    child.once('error', settle);
    child.once('exit', settle);
    child.unref();
    return 'starting';
  } catch (error) {
    failDocSessionAgent(env, sessionId, 'runtime_error', errorCode(error));
    return readDocSessionAgent(directory)?.state ?? 'failed';
  }
}

/** The leading `snake_case` code of an error message; never the rest, which can hold paths or text. */
export const errorCode = (error: unknown): string => (/^([a-z][a-z0-9]*(?:_[a-z0-9]+)+)/u.exec(error instanceof Error ? error.message : '')?.[1] ?? 'unknown');

/**
 * Takes over the lock of a host that is proven dead (or never ran) and ends a
 * non-terminal session: the failure record, the end of an open turn, the
 * failed state and the removal of the credential copy. A live or unverified
 * owner keeps the session.
 */
export function failDocSessionAgent(env: NodeJS.ProcessEnv, sessionId: string, category: DocSessionFailureCategory, reason: string): void {
  let directory: string;
  try { directory = docSessionDirectory(env, sessionId); } catch { return; }
  const current = readDocSessionAgent(directory);
  if (current === null || isTerminalAgentState(current.state)) return;
  let lock: ExclusiveDirectoryLockHandle;
  try { lock = acquireExclusiveDirectoryLock(directory, DOC_SESSION_AGENT_LOCK, { reclaimStaleOwner: true, waitTimeoutMs: 1 }); }
  catch (error) { if (error instanceof ExclusiveLockContentionError) return; throw error; }
  try {
    const record = readDocSessionAgent(directory);
    if (record === null || isTerminalAgentState(record.state)) return;
    const tail = docSessionEventsTail(env, sessionId);
    let seq = tail.last === null || tail.last.epoch !== record.epoch ? 0 : tail.last.seq + 1;
    const at = new Date().toISOString();
    appendDocSessionEvents(env, sessionId, [
      { type: 'failure', category, epoch: record.epoch, seq: seq++, at },
      ...(tail.activity === 'running' ? [{ type: 'turn' as const, boundary: 'ended' as const, epoch: record.epoch, seq: seq++, at }] : []),
    ]);
    const credential = removeDocSessionCredential(directory);
    writeDocSessionAgent(directory, nextAgentRecord(record, { state: 'failed', failure: category, reason, credential }));
  } finally { lock.release(); }
}

/** A host that exited, or never started, without a terminal state failed with `runtime_error`. */
export function reconcileDocSessionAgent(env: NodeJS.ProcessEnv, sessionId: string): void {
  failDocSessionAgent(env, sessionId, 'runtime_error', 'docs_host_exited');
}

/** Server start: every session whose host died while no server watched it. */
export function reconcileDocSessionAgents(env: NodeJS.ProcessEnv): void {
  const sessions = join(operatorStateDir(env), 'sessions');
  let names: string[];
  try { names = readdirSync(sessions); } catch { return; }
  for (const name of names) {
    if (!SESSION_ID.test(name) || !existsSync(join(sessions, name, AGENT_FILE))) continue;
    try { reconcileDocSessionAgent(env, name); } catch { /* one unreadable session does not stop the others */ }
  }
}

/**
 * Passes a stop (abort the turn) or cancel (end the agent) request to the
 * host and waits for its answer. `session_closed` when no host runs.
 */
export async function requestDocSessionControl(env: NodeJS.ProcessEnv, sessionId: string, kind: DocSessionControl): Promise<DocSessionControlResult | 'unanswered'> {
  const directory = docSessionDirectory(env, sessionId);
  const record = readDocSessionAgent(directory);
  if (record === null || isTerminalAgentState(record.state)) return 'session_closed';
  if (kind === 'stop' && record.state !== 'running') return 'no_active_turn';
  const name = `${kind}-${randomUUID()}`;
  const requests = docSessionRequestsDirectory(directory);
  writeSessionArtifact(join(requests, `${name}.json`), { kind });
  const deadline = Date.now() + CONTROL_ACK_MS;
  while (Date.now() < deadline) {
    try { return readSessionArtifact<{ result: DocSessionControlResult }>(join(requests, `${name}.ack.json`)).result; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const current = readDocSessionAgent(directory);
    if (current === null || isTerminalAgentState(current.state)) return 'session_closed';
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return 'unanswered';
}
