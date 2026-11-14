import { consumePrePromptInbox, recordPrePromptInboxAccepted } from './task-pre-prompt-inbox-consumer';
import { isReviewRuntimeId } from '../../core/review/review-runtimes';
import { sha256Prefixed } from '../../core/evidence/sha256';
import { claudeRuntime, codexRuntime, createPiRuntime, createRuntimeRegistry, type Runtime, type Session, type SessionOptions } from '@botiverse/oar';
import type { PromptRunOptions } from '@botiverse/oar/observe';
import { scriptedRuntime } from '@botiverse/oar/testing';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { processIdentity, readSessionArtifact, writeSessionArtifact } from '../terminal/task-session-io';
import { HOST_DEADLINE_STOP, REVIEW_HOST_LAUNCH_FILE, type HostRoundObservation, type ProcessProof, type ReviewHostLaunch, type ReviewHostSpec, type ReviewIsolationAdmission, type TaskRequest } from '../../core/review/runner-port';
import { dirname } from 'node:path';
import { reviewHostTemporaryDirectory, reviewIsolationPolicy, prepareReviewLauncher, assertReviewIsolation, assertPiCredentialWindow } from '../review/review-isolation';
import { promptWithOarObservation, oarActualModel, oarObservationFile, type OarObservationSink } from '../terminal/task-runtime-observation';

/** OAR owns RPC arguments and its explicit extension. Disable all ambient Pi resources. */
export function piReviewRuntime(command: string): Runtime {
  return createPiRuntime({ execution: 'subprocess', command,
    args: ['--no-extensions', '--no-skills', '--no-context-files', '--no-prompt-templates'],
    projectTrusted: false, allowProjectPackageInstall: false });
}

export function assertOarHostNode(version = process.versions.node): void {
  if (!/^\d+\./.test(version) || Number(version.split('.')[0]) < 24) throw new Error('OAR_HOST_NODE_24_REQUIRED');
}
export function reviewRuntime(kind: string, command?: string) {
  if (!isReviewRuntimeId(kind)) throw new Error('OAR_REVIEW_RUNTIME_UNSUPPORTED');
  if (kind === 'pi') {
    if (!command) throw new Error('OAR_REVIEW_PI_EXECUTABLE_REQUIRED');
    return createRuntimeRegistry([piReviewRuntime(command)]).require(kind);
  }
  return createRuntimeRegistry([codexRuntime, claudeRuntime]).require(kind);
}

/** Domain lifecycle over OAR's public API; no vendor argv or native-output parser. */
export class OarReviewHost {
  private round = 0;
  private disposed = false;
  private readonly unsubscribe: () => void;
  constructor(private readonly session: Session, print: (view: unknown) => void) {
    this.unsubscribe = session.events(print, { cursor: { sessionId: session.id, afterSeq: -1 } });
  }
  /** `kind` is the runtime kind; it selects the shared actual-model rule. */
  async prompt(kind: string, input: string, request: Pick<TaskRequest, 'request_id' | 'round'> & { host: ProcessProof }, save: OarObservationSink,
    limit: Pick<PromptRunOptions, 'timeoutMs'> = { timeoutMs: 30_000 }) {
    if (this.disposed) throw new Error('OAR_REVIEW_HOST_DISPOSED');
    if (this.round >= 3) throw new Error('OAR_REVIEW_ROUND_BUDGET_EXHAUSTED');
    this.round++;
    // Reviewer authors the Result file. This returned text is observation,
    // never a TaskResult, Receipt, or an application-extracted JSON payload.
    return promptWithOarObservation(this.session, kind, request, request.host, input, limit, save);
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.session.dispose();
    this.unsubscribe(); this.disposed = true;
  }
  /** Set when a deadline stop could not prove that the native tree ended: the host writes no disposal receipt. */
  stopIncomplete = false;
  /** The round-deadline stop of a pending turn: the owned tree, then disposal and the turn, all bounded from `deadline`. */
  async stopAtDeadline(deadline: number, turn: Promise<unknown>): Promise<void> {
    try { await stopOwnedTree(deadline, async () => { await this.dispose(); await turn.catch(() => undefined); }); }
    catch (error) { this.stopIncomplete = true; throw error; }
  }
  get sessionId(): string { return this.session.id; }
  model(kind: string): string | null {
    return oarActualModel(kind, this.session);
  }
}

/** Resolves to HOST_DEADLINE_STOP at the absolute `deadline` unless `work` settles first. */
async function untilDeadline<T>(deadline: number, work: Promise<T>): Promise<T | typeof HOST_DEADLINE_STOP> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fired = new Promise<typeof HOST_DEADLINE_STOP>(resolve => { timer = setTimeout(() => resolve(HOST_DEADLINE_STOP), Math.max(0, deadline - Date.now())); });
  try { return await Promise.race([work, fired]); } finally { clearTimeout(timer); }
}

/** The bound of the whole deadline stop, from the deadline: freeze, SIGKILL, disposal and the exit wait. */
const DEADLINE_STOP_MS = 5000;
/**
 * The deadline stop of every process that this host started. OAR's own disposal records the tree
 * once and then signals it, so a descendant in another process group that forks after that record
 * escapes. Here a SIGSTOPped process cannot fork, so the host freezes the tree top-down, then
 * SIGKILLs the frozen set. Then `settle` (OAR disposal and the pending work) runs with a zero kill
 * grace, and the host awaits the exit of each frozen process by pid and start time. A process that
 * reparented to launchd before the stop is not in the tree. The whole stop ends at
 * `deadline + DEADLINE_STOP_MS`; past that bound it throws OAR_HOST_DEADLINE_STOP_INCOMPLETE.
 */
async function stopOwnedTree(deadline: number, settle: () => Promise<unknown>): Promise<void> {
  const end = deadline + DEADLINE_STOP_MS, grace = process.env.OAR_KILL_GRACE_MS;
  // OAR reads the grace when it stops a child; only this stop runs without it.
  process.env.OAR_KILL_GRACE_MS = '0';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const frozen = freezeOwnedTree(end);
    for (const entry of frozen) signalProcess(entry.pid, 'SIGKILL');
    const expired = new Promise<false>(resolve => { timer = setTimeout(resolve, Math.max(0, end - Date.now()), false); });
    const settled = await Promise.race([settle().then(() => true, () => true), expired]);
    for (; ;) {
      const live = new Set(processTable(end).map(identityKey));
      const left = frozen.filter(entry => live.has(identityKey(entry)));
      if (settled && left.length === 0) return;
      if (!settled || Date.now() >= end) {
        throw new Error(`OAR_HOST_DEADLINE_STOP_INCOMPLETE: the native reviewer stop did not end within ${DEADLINE_STOP_MS} ms of the round deadline${
          left.length > 0 ? `; processes ${left.map(entry => entry.pid).join(',')} still run` : ''}; end them, then cancel the review`);
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  } finally {
    clearTimeout(timer);
    if (grace === undefined) delete process.env.OAR_KILL_GRACE_MS; else process.env.OAR_KILL_GRACE_MS = grace;
  }
}

interface ProcessEntry { pid: number; ppid: number; start: string }
const identityKey = (entry: ProcessEntry) => `${entry.pid} ${entry.start}`;
/** The process table without the ps process itself, bounded by `end`. */
function processTable(end: number): ProcessEntry[] {
  const ps = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,lstart='], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, timeout: Math.max(1, end - Date.now()) });
  if (ps.status !== 0) throw new Error(`OAR_HOST_DEADLINE_STOP_INCOMPLETE: ps could not read the process table (${ps.error?.message ?? `status ${ps.status}`}); end the native reviewer processes, then cancel the review`);
  return ps.stdout.split('\n').flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S.*?)\s*$/.exec(line);
    return match && Number(match[1]) !== ps.pid ? [{ pid: Number(match[1]), ppid: Number(match[2]), start: match[3]! }] : [];
  });
}
function signalProcess(pid: number, signal: NodeJS.Signals): void {
  try { process.kill(pid, signal); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
}
/**
 * Each pass stops only the children of the host and of processes frozen in an earlier pass. Such a
 * pid cannot be reused before the signal: a stopped parent cannot reap its child, and this host
 * reaps its own children only on an event-loop turn, which a synchronous pass does not yield.
 * The passes repeat until no child of the host or of a frozen process is unfrozen.
 */
function freezeOwnedTree(end: number): ProcessEntry[] {
  const frozen = new Map<string, ProcessEntry>();
  for (; ;) {
    const parents = new Set([process.pid, ...[...frozen.values()].map(entry => entry.pid)]);
    const next = processTable(end).filter(entry => parents.has(entry.ppid) && !frozen.has(identityKey(entry)));
    if (next.length === 0) return [...frozen.values()];
    if (Date.now() >= end) throw new Error(`OAR_HOST_DEADLINE_STOP_INCOMPLETE: the native reviewer tree did not freeze within ${DEADLINE_STOP_MS} ms of the round deadline; end it, then cancel the review`);
    for (const entry of next) { signalProcess(entry.pid, 'SIGSTOP'); frozen.set(identityKey(entry), entry); }
  }
}

/** Zero-model seam uses OAR's scriptedRuntime, not a hand-built adapter. */
export async function openScriptedReviewHost(options: SessionOptions, print: (view: unknown) => void,
  turn: Parameters<typeof scriptedRuntime>[0]['turn'], admission: ReviewIsolationAdmission): Promise<OarReviewHost> {
  assertOarHostNode();
  assertReviewIsolation(admission);
  // Configuration only; Seatbelt is the protection authority.
  delete process.env.OAR_CODEX_SANDBOX;
  const runtime: Runtime = scriptedRuntime({ id: 'fixture', model: 'fixture-oar', turn });
  const session = await runtime.session({ kind: 'available', via: 'bundled' }, options);
  return new OarReviewHost(session, print);
}

interface FixtureSpec { mode: 'scripted'; cwd: string; inputs: string[]; closeRequest: string; readyFile: string; disposedFile: string; isolation: ReviewIsolationAdmission }

/** File request is application data, never text extracted from a harness. */
export async function runHostFileRequest(host: OarReviewHost, spec: ReviewHostSpec, request: TaskRequest): Promise<HostRoundObservation> {
  if (request.protocol !== 2 || request.round < 1 || request.round > 3
    || request.context_ref !== join(spec.output, `context-${request.round}.txt`)
    || request.result_ref !== join(spec.output, `result-${request.round}.json`)) throw new Error('OAR_HOST_REQUEST_INVALID');
  const content = readFileSync(request.context_ref, 'utf8');
  if (sha256Prefixed(content) !== request.context_sha256) throw new Error('OAR_HOST_CONTEXT_MISMATCH');
  const started = readSessionArtifact<{ request_id: string; provider: ProcessProof }>(join(spec.requestDirectory, `started-${request.round}.json`));
  if (started.request_id !== request.request_id || started.provider?.pid !== process.pid || !started.provider.identity) throw new Error('OAR_HOST_REQUEST_IDENTITY_MISMATCH');
  // The owner's absolute round deadline bounds the turn, so the credential window that admission checked covers it.
  const round = readSessionArtifact<{ request_id: string; deadline: number }>(join(spec.controlDirectory, `deadline-${request.round}.json`));
  if (round.request_id !== request.request_id || !Number.isSafeInteger(round.deadline)) throw new Error('OAR_HOST_DEADLINE_INVALID');
  const consumed_at = Date.now();
  if (round.deadline <= consumed_at) throw new Error('OAR_HOST_DEADLINE_PASSED');
  const inbox = consumePrePromptInbox({ request, requestDirectory: spec.requestDirectory, native_session_id: host.sessionId, host: spec.kind, now: consumed_at });
  writeSessionArtifact(join(spec.controlDirectory, `ack-${request.round}.json`), { request_id: request.request_id });
  // Fleet's RECOMMENDATION-first message is retained. Only the reviewer tool
  // writes result_ref; the host never interprets/publishes root-turn text.
  const turn = host.prompt(spec.kind, `TASK REQUEST: ${JSON.stringify(request)}\n\n${content}\n\n${inbox}`, { ...request, host: started.provider },
    snapshot => {
      writeSessionArtifact(join(spec.requestDirectory, oarObservationFile(request.round)), snapshot, false);
      recordPrePromptInboxAccepted({ request, requestDirectory: spec.requestDirectory, native_session_id: host.sessionId,
        host: spec.kind, consumed_at, observation: snapshot });
    }, {});
  // OAR arms its own limits only after the prompt ack, and native pi can use its credential
  // before that ack, so the deadline stops the native process tree itself.
  const run = await untilDeadline(round.deadline, turn);
  if (run === HOST_DEADLINE_STOP) {
    // The stopped turn's outcome is not the round observation.
    await host.stopAtDeadline(round.deadline, turn);
    const stopped: HostRoundObservation = { request_id: request.request_id, kind: HOST_DEADLINE_STOP, outcome: null, actual_model: null };
    writeSessionArtifact(join(spec.controlDirectory, `observed-${request.round}.json`), stopped);
    return stopped;
  }
  if (run.kind !== 'rejected' && run.kind !== 'handled' && run.outcome.kind === 'failed' && run.outcome.failure === 'auth') throw new Error('OAR_REVIEW_AUTH_STOP');
  // Rejected and handled inputs have no turn outcome.
  const observation = { request_id: request.request_id, kind: run.kind,
    outcome: run.kind !== 'rejected' && run.kind !== 'handled' ? run.outcome.kind : null, actual_model: host.model(spec.kind) };
  writeSessionArtifact(join(spec.controlDirectory, `observed-${request.round}.json`), observation);
  return observation;
}

export type HostStatus = 'idle' | 'working';
/** hc shows a terminal without an OSC 7501 report as unknown, never idle, so
 * the host reports its own state (decision 3, #1474). Only an hc terminal
 * reads the report; piped output and other terminals get nothing. */
function reportHostStatus(state: HostStatus): void {
  if (process.env.HC_TERMINAL_ID && process.stdout.isTTY) process.stdout.write(`\x1b]7501;state=${state}:app=repo-harness\x1b\\`);
}

/** Serves file requests until close. A close request also reaches a pending
 * turn: disposal aborts it, and the aborted turn is not a turn failure. */
export async function serveHostFileRequests(host: OarReviewHost, spec: ReviewHostSpec, close: () => Promise<void>, closing: () => boolean,
  status: (state: HostStatus) => void): Promise<void> {
  const closeRequest = join(spec.controlDirectory, 'close.request');
  const watch = setInterval(() => { if (existsSync(closeRequest)) void close(); }, 25);
  try {
    for (let round = 1; !closing() && !existsSync(closeRequest);) {
      const path = join(spec.requestDirectory, `request-${round}.json`);
      // started is the existing publication fence: request and context are
      // durable before task-session publishes it. A request alone is partial.
      if (!existsSync(path) || !existsSync(join(spec.requestDirectory, `started-${round}.json`))) {
        await new Promise(resolve => setTimeout(resolve, 25)); continue;
      }
      if (round > 3) throw new Error('OAR_REVIEW_ROUND_BUDGET_EXHAUSTED');
      status('working');
      const observation = await runHostFileRequest(host, spec, readSessionArtifact<TaskRequest>(path));
      status('idle');
      if (closing()) return;
      if (observation.kind !== 'ended' || observation.outcome !== 'completed') throw new Error('OAR_REVIEW_TURN_FAILED');
      round++;
    }
  } finally { clearInterval(watch); }
}

/**
 * The owner admitted this launch until its round deadline. A native session that starts later
 * can find the pi token inside pi's refresh margin, so the host checks just before the start.
 * `claimed`: the host already wrote host-claim.json, so a repeated round cannot launch again.
 * Returns the admitted round deadline.
 */
export function assertHostLaunchAdmitted(spec: ReviewHostSpec, claimed: boolean): number {
  const launch = readSessionArtifact<ReviewHostLaunch>(join(spec.controlDirectory, REVIEW_HOST_LAUNCH_FILE));
  if (!Number.isSafeInteger(launch.deadline) || (spec.kind === 'pi' ? launch.pi?.model !== spec.options.model : launch.pi !== null)) {
    throw new Error('OAR_HOST_LAUNCH_DEADLINE_INVALID');
  }
  if (Date.now() >= launch.deadline) {
    throw new Error(`OAR_HOST_LAUNCH_DEADLINE_PASSED: the round deadline passed before this launch; ${claimed
      ? 'this host holds the claim, so cancel the review and start a new one' : 'repeat the round, then run its launch command'}`);
  }
  if (launch.pi) assertPiCredentialWindow(launch.pi, launch.deadline);
  return launch.deadline;
}

export async function openReviewHost(spec: ReviewHostSpec, print: (event: unknown) => void): Promise<OarReviewHost> {
  assertOarHostNode();
  if (spec.controlDirectory !== spec.isolation.paths.journal || spec.output !== spec.isolation.paths.output
    || readFileSync(spec.isolation.policyFile, 'utf8') !== reviewIsolationPolicy(spec.isolation.paths)
    || (spec.kind === 'pi'
      ? spec.installation.via !== 'bundled' || spec.options.env?.PI_CODING_AGENT_DIR !== spec.isolation.paths.piAgentDirectory
        || spec.options.env?.OAR_PI_AGENT_DIR !== spec.isolation.paths.piAgentDirectory || !spec.isolation.paths.piAgentDirectory
      : spec.installation.via !== 'executable' || spec.installation.command !== spec.launcher)
    || prepareReviewLauncher(spec.controlDirectory, spec.isolation.policyFile, spec.vendorExecutable) !== spec.launcher) {
    throw new Error('OAR_REVIEW_PROFILE_NOT_ADMITTED');
  }
  // Prove the child boundary before OAR can open a vendor Session. The host
  // deliberately retains owner write authority; its vendor descendants do not.
  const probe = spawnSync('/usr/bin/sandbox-exec', ['-f', spec.isolation.policyFile, process.execPath, '-e',
    `const fs=require('node:fs');try{fs.closeSync(fs.openSync(process.argv[1],fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW));process.exit(1)}catch(e){process.exit(e.code==='EPERM'?0:1)}`,
    spec.isolation.policyFile], { stdio: 'ignore', timeout: 5000 });
  if (probe.status !== 0) throw new Error('OAR_REVIEW_SEATBELT_UNPROVEN');
  if (spec.options.cwd !== spec.output) throw new Error('OAR_REVIEW_OUTPUT_CWD_REQUIRED');
  process.env.TMPDIR = reviewHostTemporaryDirectory(spec.output);
  delete process.env.OAR_CODEX_SANDBOX; // Never inherit: stock OAR default under the admitted child profile.
  // Last check before the native session: a refusal here leaves no session-opening record behind.
  const deadline = assertHostLaunchAdmitted(spec, existsSync(join(spec.controlDirectory, 'host-claim.json')));
  // From here a native reviewer child can exist until disposal. Cleanup of an
  // unbound host that exits without disposed.json must stay pending.
  writeSessionArtifact(join(spec.controlDirectory, 'session-opening.json'), { pid: process.pid });
  return new OarReviewHost(await openNativeSession(reviewRuntime(spec.kind, spec.launcher), spec.installation, spec.options, deadline), print);
}

/**
 * The native session start under the round deadline. OAR pi starts the native process and awaits
 * its get_state reply here, so the deadline stops a start that crosses it, the same way as a turn.
 */
export async function openNativeSession(runtime: Runtime, installation: ReviewHostSpec['installation'], options: SessionOptions, deadline: number): Promise<Session> {
  const opening = runtime.session(installation, options);
  const session = await untilDeadline(deadline, opening);
  if (session !== HOST_DEADLINE_STOP) return session;
  await stopOwnedTree(deadline, () => opening.then(late => late.dispose()));
  throw new Error('OAR_HOST_DEADLINE_STOP: the round deadline passed during the native session start; cancel the review and start a new one');
}

async function main(): Promise<void> {
  assertOarHostNode();
  if (process.argv[2] === '--installation') {
    const runtime = reviewRuntime(process.argv[3]!, process.argv[4]);
    if (!runtime.installation) throw new Error('OAR_REVIEW_INSTALLATION_UNVERIFIED');
    console.log(JSON.stringify(await runtime.installation()));
    return;
  }
  const spec = readSessionArtifact<FixtureSpec | ReviewHostSpec>(process.argv[2]!);
  const temporary = reviewHostTemporaryDirectory(spec.mode === 'scripted' ? dirname(spec.readyFile) : spec.output);
  process.env.TMPDIR = temporary;
  let host: OarReviewHost;
  if (spec.mode === 'scripted') {
    if (process.env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE !== '1' || spec.inputs.length > 3) throw new Error('OAR_HOST_FIXTURE_SPEC_INVALID');
    host = new OarReviewHost(await scriptedRuntime({ id: 'fixture', model: 'fixture-oar',
      turn: async ({ input, say }) => { say(`RECOMMENDATION: fixture observation for ${input} — confidence: HIGH`); } }).session(
      { kind: 'available', via: 'bundled' }, { cwd: spec.cwd }), view => console.log(JSON.stringify({ fixture: true, view })));
  } else {
    if (process.platform !== 'darwin' || spec.options.cwd !== spec.output) throw new Error('OAR_REVIEW_ISOLATION_UNSUPPORTED');
    // An operator terminal can repeat the launch command. Only the first host
    // claims the control directory; a later one exits before any Session or
    // ready/disposed artifact. A launch refused here holds no claim, so the repeated round can launch again.
    assertHostLaunchAdmitted(spec, false);
    writeSessionArtifact(join(spec.controlDirectory, 'host-claim.json'), { pid: process.pid, identity: processIdentity(process.pid) });
    // OAR launches the reviewer through the proved child Seatbelt executable.
    delete process.env.OAR_CODEX_SANDBOX;
    host = await openReviewHost(spec, view => console.log(JSON.stringify({ oar: view })));
  }
  const readyFile = spec.mode === 'scripted' ? spec.readyFile : join(spec.controlDirectory, 'ready.json');
  const closeRequest = spec.mode === 'scripted' ? spec.closeRequest : join(spec.controlDirectory, 'close.request');
  const disposedFile = spec.mode === 'scripted' ? spec.disposedFile : join(spec.controlDirectory, 'disposed.json');
  let closing: Promise<void> | undefined;
  const close = () => closing ??= host.dispose();
  // Disposal ack is written by finally, not inferred from a signal/idle.
  const signal = () => { void close(); };
  // A closed terminal tab sends SIGHUP and removes the tty. Dispose anyway;
  // console output is observation only, so a lost tty must not stop disposal.
  process.stdout.on('error', () => {});
  process.once('SIGTERM', signal); process.once('SIGINT', signal); process.once('SIGHUP', signal);
  try {
    writeSessionArtifact(readyFile, { pid: process.pid, session_id: host.sessionId, fixture: spec.mode === 'scripted' });
    console.log('OAR_HOST_READY');
    reportHostStatus('idle');
    if (spec.mode === 'scripted') {
      for (const [index, input] of spec.inputs.entries()) {
        reportHostStatus('working');
        await host.prompt('fixture', input, { request_id: randomUUID(), round: index + 1, host: { pid: process.pid, identity: processIdentity(process.pid) } },
          snapshot => writeSessionArtifact(join(dirname(spec.readyFile), oarObservationFile(index + 1)), snapshot, false));
        reportHostStatus('idle');
      }
      console.log('OAR_HOST_ROUNDS_DONE_FIXTURE');
      while (!existsSync(closeRequest) && !closing) await new Promise(resolve => setTimeout(resolve, 25));
    } else await serveHostFileRequests(host, spec, close, () => closing !== undefined, reportHostStatus);
  } catch (error) {
    if (spec.mode === 'review') writeSessionArtifact(join(spec.controlDirectory, 'error.json'), { error: String(error) });
    throw error;
  } finally {
    // After an incomplete deadline stop, native processes may still run: no disposal receipt, so cancel stays pending.
    if (!host.stopIncomplete) {
      await close();
      writeSessionArtifact(disposedFile, { disposed: true, fixture: spec.mode === 'scripted' });
      console.log('OAR_HOST_DISPOSED');
    }
    process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal); process.removeListener('SIGHUP', signal);
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
