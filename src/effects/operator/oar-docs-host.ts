import type { DocSessionAgentRecord } from '../../core/operator/doc-session-agent-record';
// The docs host (PRD G5; issue #1021; owner decision D3, 2026-10-28). One
// Node >= 24 process per doc session. It is trusted and runs unsandboxed; only
// the OAR runtime it opens, and that runtime's children, run inside the docs
// host boundary: admission, the Seatbelt profile, the zero-model proof, the
// model API proxy and a private HOME with only the model credential copy. A
// boundary that cannot be built fails the session; there is no unisolated
// fallback. The host maps OAR events to doc session records, serves stop and
// cancel requests, applies the time bounds and removes the credential copy on
// every exit path.

import { decodeDocSessionMessage, type DocSessionMessageResult } from '../../core/operator/doc-session-messages';
import { deliverDocSessionMessage } from './doc-session-messages';
import { codexRuntime, type AvailableInstallation, type Session, type SessionOptions } from '@botiverse/oar';
import { scriptedRuntime, type ScriptedTurn } from '@botiverse/oar/testing';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
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
  DOC_SESSION_AGENT_LIMITS, DOC_SESSION_AGENT_LOCK, DOC_SESSION_CREDENTIAL_WINDOW_MS, docSessionRequestsDirectory, errorCode,
  canResumeDocSessionAgent, docsHostControlRoot, nextAgentRecord, readDocSessionAgent, removeDocSessionCredential, writeDocSessionAgent, type DocSessionControlResult,
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

/** Records with the host cursor: one epoch per host, seq from 0. A busy log keeps the batch for the next flush. */
class EventSink {
  private seq = 0;
  private inputEvents: DocSessionEventBody[] | null = null;
  private pending: Parameters<typeof appendDocSessionEvents>[2][number][] = [];
  constructor(private readonly env: NodeJS.ProcessEnv, private readonly sessionId: string, private readonly epoch: number) {}
  beginInput(): void { this.inputEvents = []; }
  endInput(acceptedText: string | null): void {
    const events = this.inputEvents ?? [];
    this.inputEvents = null;
    if (acceptedText !== null) this.push([{ type: 'message', role: 'user', text: acceptedText }]);
    this.push(events);
    this.flush();
  }
  push(bodies: readonly DocSessionEventBody[]): void {
    if (this.inputEvents !== null) { this.inputEvents.push(...bodies); return; }
    const at = new Date().toISOString();
    for (const body of bodies) this.pending.push({ ...body, epoch: this.epoch, seq: this.seq++, at } as Parameters<typeof appendDocSessionEvents>[2][number]);
  }
  flush(): void {
    if (this.inputEvents !== null || this.pending.length === 0) return;
    try { appendDocSessionEvents(this.env, this.sessionId, this.pending); this.pending = []; }
    catch (error) { if (!(error instanceof DocSessionEventsError && error.code === 'events_busy')) throw error; }
  }
}

interface OpenedRuntime { readonly session: Session; readonly close: () => Promise<void> }

/**
 * The OAR options for one docs host session. Codex refuses `appendSystemPrompt`
 * together with `resume`; a resumed thread keeps the developer instructions
 * saved at its first open, so only a new session sets them.
 */
export function docsHostSessionOptions(worktree: string, env: Readonly<Record<string, string | null>>, resume?: string): SessionOptions {
  return { cwd: worktree, env, ...(resume === undefined ? { appendSystemPrompt: DOCS_HOST_INSTRUCTIONS } : { resume }) };
}

/** Admission, profile, proof, launcher and the isolated installation, in that order. Any step that fails is `boundary_denied`. */
async function openCodex(record: SessionRecord, control: string, env: NodeJS.ProcessEnv, epoch: number, resume?: string): Promise<OpenedRuntime> {
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
      const policy = writeDocsHostPolicy(admission, epoch);
      const scratch = prepareDocsHostScratch(admission, DOC_SESSION_CREDENTIAL_WINDOW_MS, true);
      proveDocsHostBoundary(admission, policy, scratch);
      docsEnv = docsHostEnvironment(scratch, proxy.port);
      launcher = writeDocsHostLauncher(admission, policy, docsEnv, epoch);
    } catch (error) { throw new HostFailure('boundary_denied', errorCode(error)); }
    // The vendor answers `app-server --help` through the launcher, so it runs under the profile before any session.
    const isolated = await runtime.installation!({ env: { OAR_CODEX_BIN: launcher } });
    if (isolated.kind !== 'available' || isolated.via !== 'executable' || isolated.command !== launcher) throw new HostFailure('boundary_denied', 'docs_host_isolated_installation_unverified');
    // Seatbelt is the boundary; codex's own sandbox cannot nest inside it (OAR's default `danger-full-access`).
    delete process.env.OAR_CODEX_SANDBOX;
    const session = await runtime.session(isolated as AvailableInstallation, docsHostSessionOptions(record.worktree, docsEnv, resume));
    const opened = proxy;
    return { session, close: () => opened.close() };
  } catch (error) {
    await proxy?.close();
    throw error;
  }
}

async function openScripted(record: SessionRecord, resume?: string): Promise<OpenedRuntime> {
  const session = await scriptedRuntime({ id: 'fixture', model: 'fixture-oar', turn: scriptedDocsTurn }).session({ kind: 'available', via: 'bundled' }, { cwd: record.worktree, ...(resume === undefined ? {} : { resume }) });
  return { session, close: async () => {} };
}

function turnLimit(env: NodeJS.ProcessEnv): number {
  // The turn bound may be shortened only for the scripted fixture, so a test can reach it.
  const requested = Number(env.REPO_HARNESS_DOCS_HOST_TURN_MS);
  return env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE === '1' && Number.isSafeInteger(requested) && requested > 0 ? requested : DOC_SESSION_AGENT_LIMITS.turn_ms;
}

function idleLimit(env: NodeJS.ProcessEnv): number {
  const requested = Number(env.REPO_HARNESS_DOCS_HOST_IDLE_MS);
  return env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE === '1' && Number.isSafeInteger(requested) && requested > 0 ? requested : DOC_SESSION_AGENT_LIMITS.idle_ms;
}

async function withDeadline<T>(promise: Promise<T>, deadline: number, reason = 'docs_host_start_timeout'): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HostFailure('timeout', reason)), Math.max(0, deadline - Date.now()));
    })]);
  } finally { clearTimeout(timer); }
}

/** How long an accepted interrupt may take to end its turn before the host disposes the runtime. */
export const DOC_SESSION_ABORT_GRACE_MS = 30_000;

/**
 * The host's interrupts of one session. A stop or a time bound counts only
 * when OAR accepts the interrupt; a rejected one (OAR returns `rejected`, for
 * example `runtime_refused` when the interrupt RPC fails) leaves the turn
 * open and is retried by the next request or bound. An accepted interrupt
 * whose turn does not end within the grace period is overdue.
 */
export class DocsTurnControl {
  private acceptedAt: number | null = null;
  constructor(private readonly session: Pick<Session, 'abort'>, private readonly adapter: DocSessionAdapter, private readonly graceMs = DOC_SESSION_ABORT_GRACE_MS) {}

  /** A new turn has no interrupt yet. */
  turnStarted(): void { this.acceptedAt = null; }

  /** True when the turn is ending: this interrupt or an earlier one was accepted. */
  async abort(cause: 'cancelled' | 'timeout', now = Date.now()): Promise<boolean> {
    if (!this.adapter.turnOpen) return false;
    if (this.acceptedAt !== null) return true;
    this.adapter.aborting(cause);
    const outcome = await this.session.abort();
    if (outcome.kind === 'accepted') { this.acceptedAt = now; return true; }
    this.adapter.aborting('cancelled');
    return false;
  }

  overdue(now = Date.now()): boolean {
    return this.adapter.turnOpen && this.acceptedAt !== null && now - this.acceptedAt > this.graceMs;
  }
}

/** Runs one session until it is stopped, times out or fails. The caller holds `agent.lock`. */
async function runSession(sessionDirectory: string, initial: DocSessionAgentRecord, env: NodeJS.ProcessEnv, resume?: string): Promise<void> {
  const started = Date.now();
  const record = readSessionArtifact<SessionRecord>(join(sessionDirectory, 'session.json'));
  const requests = docSessionRequestsDirectory(sessionDirectory);
  const sink = new EventSink(env, record.session_id, initial.epoch);
  const adapter = new DocSessionAdapter(record.worktree);
  let agent = initial;
  let inputInFlight = false;
  let inputState: Parameters<typeof nextAgentRecord>[1] | null = null;
  const update = (change: Parameters<typeof nextAgentRecord>[1]) => {
    if (inputInFlight) { inputState = { ...inputState, ...change }; return; }
    agent = nextAgentRecord(agent, change); writeDocSessionAgent(sessionDirectory, agent);
  };
  let opened: OpenedRuntime | undefined;
  let final: { state: 'stopped' | 'failed'; failure: DocSessionFailureCategory | null; reason: string | null } = { state: 'stopped', failure: null, reason: null };
  try {
    if (record.session_id !== initial.session_id || !isDocsHostRuntimeId(record.runtime)) throw new HostFailure('boundary_denied', 'docs_host_runtime_unverified');
    if (initial.control === null) throw new HostFailure('boundary_denied', 'docs_host_control_unplanned');
    const control = initial.control, scratch = join(control, 'scratch');
    assertWorktree(record);
    // The codex app-server inherits this directory; the boundary denies reads of the session directory.
    process.chdir(record.worktree);
    if (control !== join(docsHostControlRoot(env), record.session_id)) throw new HostFailure('boundary_denied', 'docs_host_control_changed');
    for (const directory of [control, scratch]) {
      if (resume === undefined) mkdirSync(directory, { mode: 0o700 });
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700 || realpathSync(directory) !== directory) throw new HostFailure('boundary_denied', 'docs_host_control_unsafe');
    }
    // The one credential path: the review copy lifecycle, here for the whole session lifetime.
    try { prepareCodexHome(scratch, realpathSync(env.HOME!), DOC_SESSION_CREDENTIAL_WINDOW_MS); }
    catch (error) { throw new HostFailure('runtime_error', errorCode(error)); }
    const deadline = started + DOC_SESSION_AGENT_LIMITS.start_ms;
    opened = await withDeadline(env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE === '1' ? openScripted(record, resume) : openCodex(record, control, env, initial.epoch, resume), deadline);
    const session = opened.session;
    if (resume !== undefined && session.id !== resume) throw new HostFailure('runtime_error', 'docs_host_resume_identity_mismatch');
    update({ native_session_id: session.id });
    const turns = new DocsTurnControl(session, adapter);

    let turnStartedAt = 0, idleSince = 0, exited = false, ended = false;
    session.events(event => {
      const bodies = adapter.map(event);
      sink.push(bodies);
      // A turn boundary reaches the log before the state that follows from it.
      if (bodies.some(body => body.type === 'turn')) sink.flush();
      if (event.agentPath.length !== 0) return;
      if (event.kind === 'turn_started') { turnStartedAt = Date.now(); turns.turnStarted(); update({ state: 'running' }); }
      if (event.kind === 'turn_ended') { idleSince = Date.now(); update({ state: 'idle', actual_model: session.model().value }); }
      if (event.kind === 'exited' && !ended) exited = true;
    }, { cursor: { sessionId: session.id, afterSeq: -1 }, coalesceText: { maxHoldMs: 500 } });

    if (resume === undefined) {
      sink.push([{ type: 'message', role: 'user', text: record.instruction }]);
      sink.flush();
      const prompted = await withDeadline(session.prompt(composePrompt(record)), deadline);
      if (prompted.kind === 'rejected') throw new HostFailure('runtime_error', `docs_host_prompt_${prompted.code}`, true);
    } else {
      // A resume opens the old conversation. It must never replay the creation instruction.
      idleSince = Date.now();
      update({ state: 'idle', actual_model: session.model().value });
    }

    const answered = new Set<string>();
    const answer = (name: string, result: DocSessionControlResult | DocSessionMessageResult) => { writeSessionArtifact(join(requests, `${name}.ack.json`), { epoch: initial.epoch, result }); answered.add(name); };
    const turnMs = turnLimit(env);
    let stopping: 'cancel' | 'idle' | 'lifetime' | 'signal' | 'turn_timeout' | null = null;
    const signal = () => { stopping ??= 'signal'; };
    process.once('SIGTERM', signal); process.once('SIGINT', signal); process.once('SIGHUP', signal);
    try {
      while (stopping === null && !exited) {
        await new Promise(resolve => setTimeout(resolve, 25));
        for (const file of readdirSync(requests).filter(name => /^(stop|cancel|message)-[0-9a-f-]{36}\.json$/u.test(name)).sort()) {
          if (exited || stopping !== null) break;
          const name = file.slice(0, -'.json'.length);
          if (answered.has(name)) continue;
          const request = readSessionArtifact<Record<string, unknown>>(join(requests, file));
          // Old requests and acknowledgements are never delivered to a later host epoch.
          if (request.epoch !== initial.epoch) { answered.add(name); continue; }
          if (name.startsWith('message-')) {
            if (request.kind !== 'message' || request.input_id !== name.slice('message-'.length)) throw new Error('doc_session_message_identity_invalid');
            const { kind: _kind, epoch: _epoch, input_id: inputId, ...fields } = request;
            const input = decodeDocSessionMessage(fields);
            let result: DocSessionMessageResult | undefined;
            inputInFlight = true;
            sink.beginInput();
            try { result = await withDeadline(deliverDocSessionMessage(session, input, inputId as string), Date.now() + 8_000, 'docs_host_message_timeout'); }
            finally {
              inputInFlight = false;
              sink.endInput(result === 'prompted' || result === 'queued' || result === 'steered' ? input.text : null);
              if (inputState !== null) { update(inputState); inputState = null; }
            }
            answer(name, result);
            continue;
          }
          if (Object.keys(request).length !== 2 || request.kind !== name.split('-')[0]) throw new Error('doc_session_control_invalid');
          // A cancel ends the agent whether or not the runtime accepts the interrupt: disposal ends the turn.
          if (name.startsWith('cancel-')) { await turns.abort('cancelled'); stopping = 'cancel'; answer(name, 'accepted'); break; }
          if (!adapter.turnOpen) { answer(name, 'no_active_turn'); continue; }
          answer(name, await turns.abort('cancelled') ? 'accepted' : 'refused');
        }
        const now = Date.now();
        // D5: a turn past its bound ends. A rejected interrupt, or one that does not end the turn, ends the runtime instead.
        if (adapter.turnOpen && now - turnStartedAt > turnMs && !(await turns.abort('timeout'))) stopping = 'turn_timeout';
        if (turns.overdue(now)) stopping = 'turn_timeout';
        if (!adapter.turnOpen && idleSince > 0 && now - idleSince > idleLimit(env)) stopping = 'idle';
        if (now - started > DOC_SESSION_AGENT_LIMITS.lifetime_ms) { await turns.abort('timeout'); stopping = 'lifetime'; }
        sink.flush();
      }
      if (stopping === 'idle') final.reason = 'docs_host_idle';
      if (exited) final = { state: 'failed', failure: 'runtime_error', reason: 'docs_host_runtime_exited' };
      // An accepted interrupt ends its turn before disposal, so the turn's records are complete.
      if (stopping !== 'turn_timeout') {
        for (const until = Date.now() + 5_000; adapter.turnOpen && !exited && Date.now() < until;) await new Promise(resolve => setTimeout(resolve, 25));
      }
      ended = true;
      if (adapter.turnOpen) {
        // The runtime goes with the turn still open: its records end here.
        const cause = stopping === 'turn_timeout' || stopping === 'lifetime' ? 'timeout' : 'cancelled';
        sink.push([...adapter.flush(), { type: 'failure', category: cause }]);
        if (stopping === 'turn_timeout') final = { state: 'failed', failure: 'timeout', reason: 'docs_host_turn_not_interrupted' };
      }
    } finally { process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal); process.removeListener('SIGHUP', signal); }
  } catch (error) {
    const failure = error instanceof HostFailure ? error : new HostFailure('runtime_error', errorCode(error));
    final = { state: 'failed', failure: failure.category, reason: failure.code };
    sink.push(adapter.flush());
    if (!failure.recorded) sink.push([{ type: 'failure', category: failure.category }]);
  } finally {
    adapter.disposed();
    try { await opened?.session.dispose(); } catch { final = { state: 'failed', failure: 'runtime_error', reason: 'docs_host_dispose_failed' }; }
    try { await opened?.close(); } catch { /* the proxy closes with the process */ }
    sink.push(adapter.flush());
    if (adapter.turnOpen) sink.push([{ type: 'turn', boundary: 'ended' }]);
    // The credential copy goes and the state is recorded even when the event log refuses the last batch.
    try { sink.flush(); } catch (error) { if (final.state !== 'failed') final = { state: 'failed', failure: 'runtime_error', reason: errorCode(error) }; }
    update({ ...final, credential: removeDocSessionCredential(agent) });
  }
}

async function main(): Promise<void> {
  if (!(Number(process.versions.node.split('.')[0]) >= 24)) throw new Error('OAR_HOST_NODE_24_REQUIRED');
  const sessionDirectory = realpathSync(process.argv[2] ?? '');
  const resumeEpoch = process.argv[3] === '--resume-epoch' && /^[1-9][0-9]*$/u.test(process.argv[4] ?? '') ? Number(process.argv[4]) : null;
  if (process.argv.length !== (resumeEpoch === null ? 3 : 5)) throw new Error('docs_host_arguments_invalid');
  // Epoch advances only after the old host releases this same lock.
  const lock = acquireExclusiveDirectoryLock(sessionDirectory, DOC_SESSION_AGENT_LOCK, { waitTimeoutMs: resumeEpoch === null ? 1 : 2_000 });
  try {
    let agent = readDocSessionAgent(sessionDirectory);
    let resume: string | undefined;
    if (resumeEpoch !== null) {
      if (!canResumeDocSessionAgent(agent) || agent.epoch !== resumeEpoch) throw new Error('docs_host_not_resumable');
      resume = agent.native_session_id;
      agent = { ...nextAgentRecord(agent, { state: 'starting', reason: null, credential: null }), epoch: agent.epoch + 1 };
      writeDocSessionAgent(sessionDirectory, agent);
    }
    if (agent?.state !== 'starting') throw new Error('docs_host_agent_not_starting');
    await runSession(sessionDirectory, agent, process.env, resume);
  } finally { lock.release(); }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
  process.exit(0);
}
