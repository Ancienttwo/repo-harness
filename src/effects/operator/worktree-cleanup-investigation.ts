import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalize } from '../../core/evidence/canonical-json';
import type { JsonValue } from '../../core/evidence/types';
import { decodeQuotaReport } from '../../core/board/quota';
import type { ProcessProof, ReviewerRunner, ReviewHostSpec, TaskRequest } from '../../core/review/runner-port';
import {
  CLEANUP_INVESTIGATION_MANIFEST, cleanupInvestigationInstructions, cleanupInvestigationManifest, decodeCleanupInvestigationResult,
  WORKTREE_CLEANUP_INVESTIGATION_MAX_ITEMS, type CleanupAdvice, type CleanupInvestigationFailure, type CleanupInvestigationJob, type CleanupInvestigationStatus, type CleanupPlan,
} from '../../core/operator/worktree-cleanup-plan';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { configuredGitBinary, gitExecFileSync, withoutRepositorySelectingGitEnv } from '../git/runner';
import { prepareCodexHome, prepareReviewLauncher, removeCopiedAuth, reviewIsolationPolicy, type CleanupReviewIsolationPaths } from '../review/review-isolation';
import { runSetupProcess, type SetupProcessRunner } from '../setup/collector';
import { readSessionArtifact, writeSessionArtifact, writeSessionBytes } from '../terminal/task-session-io';
import { readQuotaReport } from '../board/quota';
import type { CleanupObservationTarget } from './worktree-cleanup-observation';
import { createCleanupPlan } from './worktree-cleanup-plan';
import {
  CleanupSessionMissing, cleanupSessionDirectory, loadCleanupInvestigation, loadCleanupSession, saveCleanupInvestigation, saveCleanupSession,
} from './worktree-cleanup-store';
import { prepareOperatorStateDir } from './write-audit';
import type { OperatorWriteRoute } from './write-channel';
import { OperatorWriteRefusal, type OperatorWriteOperation } from './write-run';

/**
 * Agent investigation of one cleanup plan session (#1721, owner decision M69).
 * The start route checks the plan size and the chatgpt quota, then runs a job
 * child outside the 120 s plan child. The job runs codex once through the
 * review host, with the review profile plus one rule that denies reads of the
 * target worktrees and their Git directories. The agent reads only the server
 * manifest and writes only its output directory. Its answer becomes a new plan
 * version through `createCleanupPlan`; the user still approves each item.
 */
export const OPERATOR_WORKTREES_CLEANUP_INVESTIGATION_ROUTE = /^\/api\/v1\/worktrees\/cleanup\/investigation$/u;
export const OPERATOR_WORKTREES_CLEANUP_INVESTIGATION_STATUS_ROUTE = /^\/api\/v1\/worktrees\/cleanup\/investigation\/([a-f0-9]{32})$/u;
const JOB_TIMEOUT_MS = 20 * 60_000;
/** The job child stops starting new work this long before the parent kills its process group. */
const JOB_DEADLINE_MARGIN_MS = 5_000;
/** A running record this long past its deadline has no parent left to finish it. */
const JOB_INTERRUPTED_AFTER_MS = 60_000;
const HOST_READY_TIMEOUT_MS = 60_000;
const HOST_DISPOSE_TIMEOUT_MS = 60_000;
const TURN_TIMEOUT_MS = 15 * 60_000;
const RESULT_MAX_BYTES = 1024 * 1024;
const SESSION = /^[a-f0-9]{32}$/u;

type RefusalCode = 'session_not_found' | 'investigation_too_large' | 'investigation_running' | 'quota_exhausted' | 'quota_unknown';
const REFUSALS: Readonly<Record<RefusalCode, { readonly status: number; readonly message: string; readonly next_action: string }>> = Object.freeze({
  session_not_found: { status: 404, message: 'The cleanup session does not exist. No investigation started.', next_action: 'Create a new plan, then send a new request_id.' },
  investigation_too_large: { status: 422, message: `The plan has more than ${WORKTREE_CLEANUP_INVESTIGATION_MAX_ITEMS} items. No investigation started.`,
    next_action: `Split the selection into plans of at most ${WORKTREE_CLEANUP_INVESTIGATION_MAX_ITEMS} worktrees, then start an investigation for each plan.` },
  investigation_running: { status: 409, message: 'An investigation of this plan is running. No investigation started.', next_action: 'Wait for its status, then send a new request_id.' },
  quota_exhausted: { status: 429, message: 'The chatgpt account quota is exhausted. No investigation started.', next_action: 'Wait for the quota window to reset, then send a new request_id.' },
  quota_unknown: { status: 503, message: 'The chatgpt account quota cannot be read. No investigation started.', next_action: 'Check the quota page, then send a new request_id.' },
});
const refusal = (code: RefusalCode) => new OperatorWriteRefusal(REFUSALS[code].status, code, REFUSALS[code].message, REFUSALS[code].next_action);

/** A typed job failure. Any other error is a defect that the job records as `host_failed` with its text in the run directory. */
export class CleanupInvestigationError extends Error {
  constructor(readonly failure: CleanupInvestigationFailure) { super(`worktree cleanup investigation ${failure}`); }
}

const iso = (ms: number) => new Date(ms).toISOString();

/** A running record that no parent can finish any more reads as interrupted. */
function current(job: CleanupInvestigationJob, now: number): CleanupInvestigationJob {
  return job.state === 'running' && now > Date.parse(job.deadline_at) + JOB_INTERRUPTED_AFTER_MS ? { ...job, state: 'failed', failure: 'interrupted' } : job;
}

export function readCleanupInvestigationStatus(env: NodeJS.ProcessEnv, sessionId: string, now = Date.now()): CleanupInvestigationStatus | null {
  const stored = loadCleanupInvestigation(env, sessionId);
  if (stored === null) return null;
  const job = current(stored, now);
  return { ...job, plan: job.state === 'succeeded' ? loadCleanupSession(env, sessionId).plan : null };
}

/** M60, fail closed: only a chatgpt account that is neither exhausted nor unknown admits a codex turn. */
async function assertCodexQuota(read: () => Promise<unknown>): Promise<void> {
  let state: string;
  try { state = decodeQuotaReport(await read()).accounts.find(account => account.account === 'chatgpt')?.state ?? 'unknown'; } catch { state = 'unknown'; }
  if (state === 'exhausted') throw refusal('quota_exhausted');
  if (state === 'unknown') throw refusal('quota_unknown');
}

export interface CleanupInvestigationRouteOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** Production reads the quota read model; only tests inject another. */
  readonly read_quota?: () => Promise<unknown>;
  readonly run_process?: SetupProcessRunner;
}

/** The job child is a hidden CLI subcommand, because the CLI root injects the review runner (ADR-0002 rule 5). */
const JOB_ARGV = Object.freeze([fileURLToPath(new URL('../../cli/index.ts', import.meta.url)), 'operator', 'cleanup-investigation-job'] as const);

/** Write the running record, then start the job child. The record, not this promise, carries the outcome. */
export async function startCleanupInvestigation(sessionId: string, options: CleanupInvestigationRouteOptions = {}): Promise<CleanupInvestigationJob> {
  const env = { ...process.env, ...options.env };
  let plan: CleanupPlan;
  try { plan = loadCleanupSession(env, sessionId).plan; } catch (error) {
    if (error instanceof CleanupSessionMissing) throw refusal('session_not_found');
    throw error;
  }
  if (plan.items.length > WORKTREE_CLEANUP_INVESTIGATION_MAX_ITEMS) throw refusal('investigation_too_large');
  const previous = loadCleanupInvestigation(env, sessionId);
  if (previous !== null && current(previous, Date.now()).state === 'running') throw refusal('investigation_running');
  await assertCodexQuota(options.read_quota ?? (() => readQuotaReport(env)));
  const now = Date.now();
  const job: CleanupInvestigationJob = { protocol: 1, kind: 'operator_worktree_cleanup_investigation', session_id: sessionId, job_id: randomBytes(16).toString('hex'),
    state: 'running', started_at: iso(now), deadline_at: iso(now + JOB_TIMEOUT_MS), failure: null };
  saveCleanupInvestigation(env, job);
  const childEnv = withoutRepositorySelectingGitEnv({ ...env, GIT_TERMINAL_PROMPT: '0' });
  // Not aborted on server close: the job finishes or meets its process-group deadline.
  void (options.run_process ?? runSetupProcess)([...JOB_ARGV, sessionId, job.job_id, String(JOB_TIMEOUT_MS - JOB_DEADLINE_MARGIN_MS)],
    { cwd: process.cwd(), env: childEnv, timeout_ms: JOB_TIMEOUT_MS, signal: new AbortController().signal, service: 'worktree-cleanup-investigation' })
    .then(result => {
      // The child writes the final record. A child that stopped before it did leaves this job running.
      const stored = loadCleanupInvestigation(env, sessionId);
      if (stored?.job_id === job.job_id && stored.state === 'running') {
        saveCleanupInvestigation(env, { ...job, state: 'failed', failure: !result.ok && result.code === 'timeout' ? 'timeout' : 'host_failed' });
      }
    })
    .catch(error => { console.error(`worktree cleanup investigation ${job.job_id}: ${String(error)}`); });
  return job;
}

/** `POST /api/v1/worktrees/cleanup/investigation` `{ session_id }`. It shares the session lock with pass 2 of the plan route. */
export function worktreeCleanupInvestigationWriteRoute(options: CleanupInvestigationRouteOptions = {}): OperatorWriteRoute {
  return {
    id: 'worktrees_cleanup_investigation',
    path: OPERATOR_WORKTREES_CLEANUP_INVESTIGATION_ROUTE,
    decode(fields): OperatorWriteOperation {
      if (Object.keys(fields).join(',') !== 'session_id' || typeof fields.session_id !== 'string' || !SESSION.test(fields.session_id)) {
        throw new Error('worktree_cleanup_investigation_request_invalid');
      }
      const sessionId = fields.session_id;
      return { operation: 'worktrees_cleanup_investigation', target: `worktree_cleanup_session:${sessionId}`, input: { session_id: sessionId },
        execute: async () => ({ status: 202, body: await startCleanupInvestigation(sessionId, options) as unknown as JsonValue }) };
    },
  };
}

/** The directories and admitted profile of one job. Output alone is writable by the agent. */
export interface CleanupInvestigationRun {
  readonly control: string;
  readonly output: string;
  readonly policyFile: string;
  readonly paths: CleanupReviewIsolationPaths;
}

function privateDirectory(path: string): string {
  try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new Error('worktree cleanup investigation directory unsafe');
  return realpathSync(path);
}

/** Each target worktree, its Git directory and its common Git directory, resolved. */
function readDeniedRoots(targets: readonly CleanupObservationTarget[], env: NodeJS.ProcessEnv): string[] {
  const roots = new Set<string>();
  for (const target of targets) {
    if (!existsSync(target.worktree)) throw new CleanupInvestigationError('plan_changed');
    const gitDir = gitExecFileSync(['rev-parse', '--absolute-git-dir'], { cwd: target.worktree, env: withoutRepositorySelectingGitEnv(env),
      gitBin: configuredGitBinary(env), timeout: 30_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    for (const path of [target.worktree, gitDir, resolveGitCommonDirectory(target.repository, configuredGitBinary(env), 30_000, withoutRepositorySelectingGitEnv(env))]) {
      roots.add(realpathSync(path));
    }
  }
  return [...roots].sort();
}

/** Seatbelt matches the profile against each access, so each denied root is probed under the admitted profile before any agent starts. */
function assertReadDenied(policyFile: string, roots: readonly string[]): void {
  for (const root of roots) {
    const probe = spawnSync('/usr/bin/sandbox-exec', ['-f', policyFile, '/bin/ls', '-d', root], { encoding: 'utf8', timeout: 5_000 });
    if (probe.status === 0 || !probe.stderr.includes('Operation not permitted')) throw new CleanupInvestigationError('isolation_unproven');
  }
}

/**
 * The review isolation paths of a cleanup job. The subject, primary and common
 * Git directory fields feed only the overlap check of the review profile, so
 * they name the first target repository; every target is in the deny list.
 */
export function prepareCleanupInvestigation(env: NodeJS.ProcessEnv, sessionId: string, jobId: string, targets: readonly CleanupObservationTarget[]): CleanupInvestigationRun {
  const run = privateDirectory(join(privateDirectory(join(prepareOperatorStateDir(env), 'worktree-cleanup-investigation')), jobId));
  const control = privateDirectory(join(run, 'control')), output = privateDirectory(join(run, 'output'));
  const repository = realpathSync(targets[0]!.repository);
  const paths: CleanupReviewIsolationPaths = { subject: repository, primary: repository, ownerRecord: cleanupSessionDirectory(env, sessionId), journal: control,
    gitCommonDir: resolveGitCommonDirectory(repository, configuredGitBinary(env), 30_000, withoutRepositorySelectingGitEnv(env)), output,
    cleanup: { readDenied: readDeniedRoots(targets, env) } };
  let policy: string;
  try { policy = reviewIsolationPolicy(paths); } catch (error) {
    if (error instanceof Error && error.message.startsWith('OAR_REVIEW_')) throw new CleanupInvestigationError('isolation_unproven');
    throw error;
  }
  const policyFile = join(control, 'isolation.sb');
  writeFileSync(policyFile, policy, { flag: 'wx', mode: 0o600 });
  assertReadDenied(policyFile, paths.cleanup!.readDenied);
  return { control, output, policyFile, paths };
}

/** Runs the one agent turn of a job. It returns after the turn ended; the agent wrote `request.result_ref` or nothing. */
export type CleanupInvestigator = (run: CleanupInvestigationRun, request: TaskRequest, context: string, deadline: number) => Promise<void>;

async function waitFor(path: string, deadline: number, alive: () => boolean): Promise<void> {
  while (!existsSync(path)) {
    if (!alive()) throw new CleanupInvestigationError('host_failed');
    if (Date.now() >= deadline) throw new CleanupInvestigationError('timeout');
    await Bun.sleep(100);
  }
}

/** The parts of the reviewer runner port that one cleanup turn uses. The CLI root injects the task-agent-host implementation. */
export type CleanupReviewHost = Pick<ReviewerRunner<unknown, unknown, unknown>, 'installation' | 'hostCommand' | 'sessionOptions'>;

/** Production investigator: codex in the review host, with the host's own file request protocol. */
export const reviewHostInvestigator = (runner: CleanupReviewHost): CleanupInvestigator => async (run, request, context, deadline) => {
  const env = process.env;
  const home = prepareCodexHome(run.output, env.HOME ?? userInfo().homedir, deadline - Date.now()).home;
  try {
    const installed = await runner.installation('codex');
    if (installed.kind !== 'available' || installed.via !== 'executable') throw new CleanupInvestigationError('host_failed');
    const launcher = prepareReviewLauncher(run.control, run.policyFile, installed.command);
    const isolated = await runner.installation('codex', launcher);
    if (isolated.kind !== 'available' || isolated.via !== 'executable' || isolated.command !== launcher) throw new CleanupInvestigationError('host_failed');
    const spec: ReviewHostSpec = { mode: 'review', isolation: { paths: run.paths, policyFile: run.policyFile }, kind: 'codex', installation: isolated, launcher,
      vendorExecutable: realpathSync(installed.command), options: runner.sessionOptions('codex', run.output, home),
      requestDirectory: run.control, output: run.output, controlDirectory: run.control, timeoutMs: TURN_TIMEOUT_MS };
    const specFile = join(run.control, 'host.json');
    writeSessionArtifact(specFile, spec);
    const [node, ...args] = runner.hostCommand(specFile, false);
    const log = openSync(join(run.control, 'host.log'), 'wx', 0o600);
    const host = spawn(node!, args, { cwd: run.control, env, stdio: ['ignore', log, log] });
    closeSync(log);
    let alive = true;
    const exited = new Promise<void>(resolve => host.once('close', () => { alive = false; resolve(); }));
    try {
      await waitFor(join(run.control, 'ready.json'), Math.min(deadline, Date.now() + HOST_READY_TIMEOUT_MS), () => alive);
      const claim = readSessionArtifact<ProcessProof>(join(run.control, 'host-claim.json'));
      if (claim.pid !== host.pid || readSessionArtifact<{ pid: number }>(join(run.control, 'ready.json')).pid !== host.pid) throw new CleanupInvestigationError('host_failed');
      // The started file is the host's publication fence: request and context are durable before it.
      writeSessionArtifact(join(run.control, 'request-1.json'), request);
      writeSessionBytes(request.context_ref, context);
      writeSessionArtifact(join(run.control, 'started-1.json'), { request_id: request.request_id, provider: claim });
      await waitFor(join(run.control, 'observed-1.json'), deadline - HOST_DISPOSE_TIMEOUT_MS, () => alive);
      const observed = readSessionArtifact<{ kind: string; outcome: string | null }>(join(run.control, 'observed-1.json'));
      if (observed.kind !== 'ended' || observed.outcome !== 'completed') throw new CleanupInvestigationError('host_failed');
    } finally {
      if (alive) {
        if (!existsSync(join(run.control, 'close.request'))) writeSessionArtifact(join(run.control, 'close.request'), { close: true });
        await Promise.race([exited, Bun.sleep(HOST_DISPOSE_TIMEOUT_MS)]);
        if (alive) host.kill('SIGTERM');
      }
    }
  } finally { removeCopiedAuth(run.output); }
};

/** The agent result file: a regular file in output, never followed through a link. */
function readResult(path: string): unknown {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { throw new CleanupInvestigationError('advice_invalid'); }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > RESULT_MAX_BYTES) throw new CleanupInvestigationError('advice_invalid');
    return JSON.parse(readFileSync(fd, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new CleanupInvestigationError('advice_invalid');
    throw error;
  } finally { closeSync(fd); }
}

export interface CleanupInvestigationOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly deadline: number;
  readonly investigate: CleanupInvestigator;
}

/** One job: manifest, one agent turn, then a new plan version from the decoded advice. A failure leaves the plan unchanged. */
export async function runCleanupInvestigation(sessionId: string, jobId: string, options: CleanupInvestigationOptions): Promise<CleanupPlan> {
  const session = loadCleanupSession(options.env, sessionId);
  const before = canonicalize(session.plan as unknown as JsonValue);
  const own = (id: string) => session.items[id]!;
  const run = prepareCleanupInvestigation(options.env, sessionId, jobId, session.plan.items.map(item => own(item.worktree.id).target));
  writeFileSync(join(run.output, CLEANUP_INVESTIGATION_MANIFEST), `${JSON.stringify(cleanupInvestigationManifest(session.plan, id => own(id).loss), null, 2)}\n`,
    { flag: 'wx', mode: 0o600 });
  const context = cleanupInvestigationInstructions();
  const request: TaskRequest = { protocol: 2, task: `worktree-cleanup-${sessionId}`, role: 'worktree-cleanup-advisor', round: 1, request_id: randomUUID(),
    context_ref: join(run.output, 'context-1.txt'), source_ref: join(run.output, CLEANUP_INVESTIGATION_MANIFEST),
    context_sha256: `sha256:${createHash('sha256').update(context).digest('hex')}`, result_ref: join(run.output, 'result-1.json'),
    result_contract: { required_fields: ['request_id', 'context_sha256', 'value'], atomic_write: 'temp_rename' } };
  await options.investigate(run, request, context, options.deadline);
  const ids = session.plan.items.map(item => item.worktree.id);
  let advice: ReadonlyMap<string, CleanupAdvice>, plan: CleanupPlan;
  try {
    advice = decodeCleanupInvestigationResult(readResult(request.result_ref), request, ids);
    plan = createCleanupPlan(sessionId, session.plan.items.map(item => ({ observation: { worktree: item.worktree, loss: own(item.worktree.id).loss },
      advice: advice.get(item.worktree.id)! })));
  } catch (error) {
    if (error instanceof CleanupInvestigationError) throw error;
    // The observations passed this same function when the plan was made, so a refusal here comes from the advice.
    throw new CleanupInvestigationError('advice_invalid');
  }
  // A user choice saved during the turn wins; the job does not replace it.
  if (canonicalize(loadCleanupSession(options.env, sessionId).plan as unknown as JsonValue) !== before) throw new CleanupInvestigationError('plan_changed');
  saveCleanupSession(options.env, { plan, items: session.items });
  return plan;
}

/**
 * The job child: run one job, then write its final record. A typed failure is
 * recorded as it is. Any other error is a defect: its text goes next to the
 * run directories for the owner, and the record says `host_failed`.
 */
export async function runCleanupInvestigationJob(sessionId: string, jobId: string, deadlineMs: number, runner: CleanupReviewHost): Promise<void> {
  if (!SESSION.test(sessionId) || !SESSION.test(jobId) || !Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) throw new Error('worktree cleanup investigation job arguments are invalid');
  const env = process.env, job = loadCleanupInvestigation(env, sessionId);
  if (job?.job_id !== jobId || job.state !== 'running') throw new Error('worktree cleanup investigation job changed');
  let failure: CleanupInvestigationFailure | null = null;
  try { await runCleanupInvestigation(sessionId, jobId, { env, deadline: Date.now() + deadlineMs, investigate: reviewHostInvestigator(runner) }); } catch (error) {
    if (error instanceof CleanupInvestigationError) failure = error.failure;
    else {
      const runs = privateDirectory(join(prepareOperatorStateDir(env), 'worktree-cleanup-investigation'));
      writeFileSync(join(runs, `${jobId}-error.txt`), String((error as Error)?.stack ?? error), { mode: 0o600 });
      failure = 'host_failed';
    }
  }
  saveCleanupInvestigation(env, { ...job, state: failure === null ? 'succeeded' : 'failed', failure });
}
