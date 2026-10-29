// The docs host (PRD G5; issue #1021; owner decision D3, 2026-10-28). One
// Node >= 24 process per doc session. It is trusted and runs unsandboxed; only
// the OAR runtime it opens, and that runtime's children, run inside the docs
// host boundary: admission, the Seatbelt profile, the zero-model proof, the
// model API proxy and a private HOME with only the model credential copy. A
// boundary that cannot be built fails the session; there is no unisolated
// fallback. The host maps OAR events to doc session records, serves stop and
// cancel requests, applies the time bounds and removes the credential copy on
// every exit path.

import { codexRuntime, type AvailableInstallation, type Session, type SessionOptions } from '@botiverse/oar';
import { scriptedRuntime, type ScriptedTurn } from '@botiverse/oar/testing';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DocSessionAdapter, type DocSessionEventBody } from '../../core/operator/doc-session-adapter';
import { isDocsHostRuntimeId } from '../../core/operator/docs-host-runtimes';
import type { DocSessionFailureCategory } from '../../core/operator/doc-session-events';
import { acquireExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { repoHarnessHome } from '../repo-harness-home';
import { readSessionArtifact, writeSessionArtifact } from '../terminal/task-session-io';
import { DOCS_HOST_MODEL_API, docsHostDeveloperDirectory, docsHostEnvironment, prepareDocsHostScratch, proveDocsHostBoundary, writeDocsHostLauncher, writeDocsHostPolicy, type DocsHostAdmission } from '../review/docs-host-isolation';
import { startModelApiProxy, type ModelApiProxy } from '../review/docs-host-proxy';
import { prepareCodexHome } from '../review/review-isolation';
import {
  DOC_SESSION_AGENT_LIMITS, DOC_SESSION_AGENT_LOCK, DOC_SESSION_CREDENTIAL_WINDOW_MS, docSessionControlDirectory, docSessionRequestsDirectory, errorCode,
  nextAgentRecord, readDocSessionAgent, removeDocSessionCredential, writeDocSessionAgent, type DocSessionAgentRecord, type DocSessionControlResult,
} from './doc-session-agent';
import { appendDocSessionEvents, DocSessionEventsError } from './doc-session-events';

/** The session record fields the host reads (doc-session.ts writes it). */
interface SessionRecord {
  readonly session_id: string;
  readonly runtime: string;
  readonly branch: string;
  readonly worktree: string;
  readonly base_commit: string;
  readonly instruction: string;
  readonly citations: readonly { readonly path: string; readonly resolved: { readonly path: string; readonly start_line: number; readonly end_line: number } }[];
}

/** A failure the host records with its category. Anything else is `runtime_error`. `recorded`: an OAR event already gave its record. */
class HostFailure extends Error {
  constructor(readonly category: DocSessionFailureCategory, readonly code: string, readonly recorded = false) { super(code); }
}

export const DOCS_HOST_INSTRUCTIONS = [
  'You edit human-written documentation in this git worktree.',
  'Write only files under docs/. Do not edit generated files that docs/architecture/.projection-manifest.json lists, AGENTS.md, CLAUDE.md, plans/ or .archcontext/.',
  'Do not commit, push or open a pull request: the user reviews the diff in the operator console and commits it there.',
  'The network is closed except for the model API.',
].join('\n');

/** The first prompt: the instruction and each cited passage, read from the worktree at the session base. */
function composePrompt(record: SessionRecord): string {
  const passages = record.citations.map(({ resolved }) => {
    const lines = readFileSync(join(record.worktree, resolved.path), 'utf8').split('\n').slice(resolved.start_line - 1, resolved.end_line);
    return `--- ${resolved.path} lines ${resolved.start_line}-${resolved.end_line} ---\n${lines.join('\n')}`;
  });
  return `${record.instruction}\n\nCited passages:\n${passages.join('\n\n')}`;
}

/** The worktree is still the session's: its branch at the session base. */
function assertWorktree(record: SessionRecord): void {
  const git = (...args: string[]) => execFileSync('/usr/bin/git', args, { cwd: record.worktree, encoding: 'utf8', timeout: 10_000, env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
  if (realpathSync(record.worktree) !== record.worktree || git('rev-parse', 'HEAD') !== record.base_commit
    || git('symbolic-ref', '--short', 'HEAD') !== record.branch) throw new HostFailure('boundary_denied', 'docs_host_worktree_changed');
}

/**
 * Zero-model seam (REPO_HARNESS_OAR_SCRIPTED_FIXTURE=1 only, as for the review
 * host): OAR's scripted runtime emits real text, tool and turn events. The
 * instruction picks a script; the default one plants values that no record may keep.
 */
export async function scriptedDocsTurn(turn: ScriptedTurn): Promise<void> {
  if (turn.input.startsWith('fixture:hold')) {
    await new Promise<void>(resolve => turn.signal.addEventListener('abort', () => resolve(), { once: true }));
    return;
  }
  if (turn.input.startsWith('fixture:fail')) throw new Error('fixture turn failed');
  turn.think('PLANTED-REASONING');
  turn.say('I tightened the intro of docs/guide.md. Authorization: Bearer ghp_0123456789abcdefghijklmnopqrstuvwxyzAB');
  await turn.tool('fileChange', JSON.stringify([
    { path: join(turn.options.cwd, 'docs', 'guide.md'), kind: 'update', diff: 'PLANTED-DIFF' },
    { path: '/etc/PLANTED-OUTSIDE', kind: 'update', diff: '' },
  ]), () => 'PLANTED-TOOL-OUTPUT');
  // A failed command fails its tool record, not the turn.
  await turn.tool('commandExecution', 'cat docs/guide.md # PLANTED-COMMAND', () => { throw new Error('PLANTED-COMMAND-OUTPUT'); }).catch(() => {});
}

/** Records with the host cursor: epoch 1 (one host per session), seq from 0. A busy log keeps the batch for the next flush. */
class EventSink {
  private seq = 0;
  private pending: Parameters<typeof appendDocSessionEvents>[2][number][] = [];
  constructor(private readonly env: NodeJS.ProcessEnv, private readonly sessionId: string, private readonly epoch: number) {}
  push(bodies: readonly DocSessionEventBody[]): void {
    const at = new Date().toISOString();
    for (const body of bodies) this.pending.push({ ...body, epoch: this.epoch, seq: this.seq++, at } as Parameters<typeof appendDocSessionEvents>[2][number]);
  }
  flush(): void {
    if (this.pending.length === 0) return;
    try { appendDocSessionEvents(this.env, this.sessionId, this.pending); this.pending = []; }
    catch (error) { if (!(error instanceof DocSessionEventsError && error.code === 'events_busy')) throw error; }
  }
}

interface OpenedRuntime { readonly session: Session; readonly close: () => Promise<void> }

/** Admission, profile, proof, launcher and the isolated installation, in that order. Any step that fails is `boundary_denied`. */
async function openCodex(record: SessionRecord, control: string, env: NodeJS.ProcessEnv): Promise<OpenedRuntime> {
  if (process.platform !== 'darwin') throw new HostFailure('boundary_denied', 'platform_unsupported');
  const runtime = codexRuntime;
  const vendor = await runtime.installation!({});
  if (vendor.kind !== 'available' || vendor.via !== 'executable') throw new HostFailure('runtime_error', 'docs_host_runtime_not_installed');
  let proxy: ModelApiProxy | undefined;
  try {
    proxy = await startModelApiProxy(DOCS_HOST_MODEL_API.codex);
    const admission: DocsHostAdmission = {
      runtime: 'codex', worktree: record.worktree, control, operatorHome: realpathSync(env.HOME!), stateHome: realpathSync(repoHarnessHome(env)),
      node: process.execPath, executable: vendor.command, developerDirectory: docsHostDeveloperDirectory(), proxyPort: proxy.port,
    };
    let launcher: string, docsEnv: Record<string, string>;
    try {
      const policy = writeDocsHostPolicy(admission);
      const scratch = prepareDocsHostScratch(admission, DOC_SESSION_CREDENTIAL_WINDOW_MS, true);
      proveDocsHostBoundary(admission, policy, scratch);
      docsEnv = docsHostEnvironment(scratch, proxy.port);
      launcher = writeDocsHostLauncher(admission, policy, docsEnv);
    } catch (error) { throw new HostFailure('boundary_denied', errorCode(error)); }
    // The vendor answers `app-server --help` through the launcher, so it runs under the profile before any session.
    const isolated = await runtime.installation!({ env: { OAR_CODEX_BIN: launcher } });
    if (isolated.kind !== 'available' || isolated.via !== 'executable' || isolated.command !== launcher) throw new HostFailure('boundary_denied', 'docs_host_isolated_installation_unverified');
    // Seatbelt is the boundary; codex's own sandbox cannot nest inside it (OAR's default `danger-full-access`).
    delete process.env.OAR_CODEX_SANDBOX;
    const options: SessionOptions = { cwd: record.worktree, env: docsEnv, appendSystemPrompt: DOCS_HOST_INSTRUCTIONS };
    const session = await runtime.session(isolated as AvailableInstallation, options);
    const opened = proxy;
    return { session, close: () => opened.close() };
  } catch (error) {
    await proxy?.close();
    throw error;
  }
}

async function openScripted(record: SessionRecord): Promise<OpenedRuntime> {
  const session = await scriptedRuntime({ id: 'fixture', model: 'fixture-oar', turn: scriptedDocsTurn }).session({ kind: 'available', via: 'bundled' }, { cwd: record.worktree });
  return { session, close: async () => {} };
}

function turnLimit(env: NodeJS.ProcessEnv): number {
  // The turn bound may be shortened only for the scripted fixture, so a test can reach it.
  const requested = Number(env.REPO_HARNESS_DOCS_HOST_TURN_MS);
  return env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE === '1' && Number.isSafeInteger(requested) && requested > 0 ? requested : DOC_SESSION_AGENT_LIMITS.turn_ms;
}

async function withDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HostFailure('timeout', 'docs_host_start_timeout')), Math.max(0, deadline - Date.now()));
    })]);
  } finally { clearTimeout(timer); }
}

/** Runs one session until it is stopped, times out or fails. The caller holds `agent.lock`. */
async function runSession(sessionDirectory: string, initial: DocSessionAgentRecord, env: NodeJS.ProcessEnv): Promise<void> {
  const started = Date.now();
  const record = readSessionArtifact<SessionRecord>(join(sessionDirectory, 'session.json'));
  const control = docSessionControlDirectory(sessionDirectory), scratch = join(control, 'scratch'), requests = docSessionRequestsDirectory(sessionDirectory);
  const sink = new EventSink(env, record.session_id, initial.epoch);
  const adapter = new DocSessionAdapter(record.worktree);
  let agent = initial;
  const update = (change: Parameters<typeof nextAgentRecord>[1]) => { agent = nextAgentRecord(agent, change); writeDocSessionAgent(sessionDirectory, agent); };
  let opened: OpenedRuntime | undefined;
  let final: { state: 'stopped' | 'failed'; failure: DocSessionFailureCategory | null; reason: string | null } = { state: 'stopped', failure: null, reason: null };
  try {
    if (record.session_id !== initial.session_id || !isDocsHostRuntimeId(record.runtime)) throw new HostFailure('boundary_denied', 'docs_host_runtime_unverified');
    assertWorktree(record);
    // The codex app-server inherits this directory; the boundary denies reads of the session directory.
    process.chdir(record.worktree);
    mkdirSync(control, { mode: 0o700 });
    mkdirSync(scratch, { mode: 0o700 });
    // The one credential path: the review copy lifecycle, here for the whole session lifetime.
    try { prepareCodexHome(scratch, realpathSync(env.HOME!), DOC_SESSION_CREDENTIAL_WINDOW_MS); }
    catch (error) { throw new HostFailure('runtime_error', errorCode(error)); }
    const deadline = started + DOC_SESSION_AGENT_LIMITS.start_ms;
    opened = await withDeadline(env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE === '1' ? openScripted(record) : openCodex(record, control, env), deadline);
    const session = opened.session;

    let turnStartedAt = 0, idleSince = 0, abortRequested = false, exited = false, ended = false;
    session.events(event => {
      const bodies = adapter.map(event);
      sink.push(bodies);
      // A turn boundary reaches the log before the state that follows from it.
      if (bodies.some(body => body.type === 'turn')) sink.flush();
      if (event.agentPath.length !== 0) return;
      if (event.kind === 'turn_started') { turnStartedAt = Date.now(); abortRequested = false; update({ state: 'running' }); }
      if (event.kind === 'turn_ended') { idleSince = Date.now(); update({ state: 'idle', actual_model: session.model().value }); }
      if (event.kind === 'exited' && !ended) exited = true;
    }, { cursor: { sessionId: session.id, afterSeq: -1 }, coalesceText: { maxHoldMs: 500 } });

    sink.push([{ type: 'message', role: 'user', text: record.instruction }]);
    sink.flush();
    const prompted = await withDeadline(session.prompt(composePrompt(record)), deadline);
    // OAR's control_rejected event gives the failure record of a rejected prompt.
    if (prompted.kind === 'rejected') throw new HostFailure('runtime_error', `docs_host_prompt_${prompted.code}`, true);

    const abort = async (cause: 'cancelled' | 'timeout') => {
      if (!adapter.turnOpen || abortRequested) return;
      abortRequested = true;
      adapter.aborting(cause);
      await session.abort();
    };
    const answered = new Set<string>();
    const answer = (name: string, result: DocSessionControlResult) => { answered.add(name); writeSessionArtifact(join(requests, `${name}.ack.json`), { result }); };
    const turnMs = turnLimit(env);
    let stopping: 'cancel' | 'idle' | 'lifetime' | 'signal' | null = null;
    const signal = () => { stopping ??= 'signal'; };
    process.once('SIGTERM', signal); process.once('SIGINT', signal); process.once('SIGHUP', signal);
    try {
      while (stopping === null && !exited) {
        await new Promise(resolve => setTimeout(resolve, 25));
        for (const file of readdirSync(requests).filter(name => /^(stop|cancel)-[0-9a-f-]{36}\.json$/u.test(name)).sort()) {
          const name = file.slice(0, -'.json'.length);
          if (answered.has(name)) continue;
          if (name.startsWith('cancel-')) { await abort('cancelled'); stopping = 'cancel'; answer(name, 'accepted'); break; }
          if (!adapter.turnOpen) { answer(name, 'no_active_turn'); continue; }
          await abort('cancelled');
          answer(name, 'accepted');
        }
        const now = Date.now();
        if (adapter.turnOpen && now - turnStartedAt > turnMs) await abort('timeout');
        if (!adapter.turnOpen && idleSince > 0 && now - idleSince > DOC_SESSION_AGENT_LIMITS.idle_ms) stopping = 'idle';
        if (now - started > DOC_SESSION_AGENT_LIMITS.lifetime_ms) { await abort('timeout'); stopping = 'lifetime'; }
        sink.flush();
      }
      if (exited) final = { state: 'failed', failure: 'runtime_error', reason: 'docs_host_runtime_exited' };
      // An abort in flight ends its turn before disposal, so the turn's records are complete.
      for (const until = Date.now() + 5_000; adapter.turnOpen && !exited && Date.now() < until;) await new Promise(resolve => setTimeout(resolve, 25));
      ended = true;
    } finally { process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal); process.removeListener('SIGHUP', signal); }
  } catch (error) {
    const failure = error instanceof HostFailure ? error : new HostFailure('runtime_error', errorCode(error));
    final = { state: 'failed', failure: failure.category, reason: failure.code };
    if (!failure.recorded) sink.push([{ type: 'failure', category: failure.category }]);
  } finally {
    adapter.disposed();
    try { await opened?.session.dispose(); } catch { /* the runtime is gone either way; the state below records the outcome */ }
    try { await opened?.close(); } catch { /* the proxy closes with the process */ }
    if (adapter.turnOpen) sink.push([{ type: 'turn', boundary: 'ended' }]);
    // The credential copy goes and the state is recorded even when the event log refuses the last batch.
    try { sink.flush(); } catch (error) { if (final.state !== 'failed') final = { state: 'failed', failure: 'runtime_error', reason: errorCode(error) }; }
    update({ ...final, credential: removeDocSessionCredential(sessionDirectory) });
  }
}

async function main(): Promise<void> {
  if (!(Number(process.versions.node.split('.')[0]) >= 24)) throw new Error('OAR_HOST_NODE_24_REQUIRED');
  const sessionDirectory = realpathSync(process.argv[2] ?? '');
  // A second host for the session exits here, before any effect.
  const lock = acquireExclusiveDirectoryLock(sessionDirectory, DOC_SESSION_AGENT_LOCK, { waitTimeoutMs: 1 });
  try {
    const agent = readDocSessionAgent(sessionDirectory);
    if (agent?.state !== 'starting') throw new Error('docs_host_agent_not_starting');
    await runSession(sessionDirectory, agent, process.env);
  } finally { lock.release(); }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
  process.exit(0);
}
