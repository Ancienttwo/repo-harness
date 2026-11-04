import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { JsonValue } from '../../core/evidence/types';
import {
  decodeAuthorizedCleanupRequest, decodeCleanupChoices, decodeCleanupExecutionResult, decodeCleanupPlan,
  type AuthorizedCleanupRequest, type CleanupAdvice, type CleanupChoice, type CleanupExecutionResult, type CleanupPlan, type CleanupPlanItem,
} from '../../core/operator/worktree-cleanup-plan';
import { WORKTREE_CLEANUP_MAX_IDS } from '../../core/operator/worktree-cleanup';
import type { WorktreeView } from '../../core/operator/worktrees';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { managedWorktreeRoot } from '../git/managed-worktree';
import { configuredGitBinary, gitExecFileSync, withoutRepositorySelectingGitEnv } from '../git/runner';
import { worktreeId } from '../git/worktree-record';
import { worktreeProcesses, type WorktreeProcess } from '../git/worktree-processes';
import { readRepoHarnessRegistryStrictSnapshot, type RepoHarnessRegisteredRepo } from '../repo-registry';
import { runSetupProcess, type SetupProcessRunner } from '../setup/collector';
import { entries } from '../state/coordination-worktree-topology';
import { createGithubDraftPrPublisher, type GithubDraftPrPublisher } from './doc-session-finalize-github';
import { stageCleanupArchive, type StagedCleanupArchive } from './worktree-cleanup-archive';
import { CleanupObservationError, observeCleanupLoss, type CleanupObservationTarget } from './worktree-cleanup-observation';
import { cleanupPlanSelectionDigest, createCleanupPlan, executeCleanupPlan, type CleanupExecutionPorts, type CleanupObservation } from './worktree-cleanup-plan';
import { CLEANUP_ARCHIVE_BRANCH, createCleanupArchivePorts } from './worktree-cleanup-publish';
import { reconcileCleanupWorktree, removeCleanupWorktree, type CleanupRemovalInput } from './worktree-cleanup-removal';
import {
  CleanupSessionMissing, cleanupStagingDirectory, loadCleanupSession, readCleanupArchiveRecord, saveCleanupSession, writeCleanupArchiveRecord,
  type CleanupPrivateItem,
} from './worktree-cleanup-store';
import { registeredWorktreePaths, repositoryWorktreeRow, type WorktreeTopologyEntry } from './worktree-collector-worker';
import type { OperatorWriteRoute } from './write-channel';
import { OperatorWriteRefusal, type OperatorWriteOperation } from './write-run';

/**
 * Authorized worktree cleanup (G25, S2). The plan route observes non-green
 * worktrees and writes a server plan (pass 1), then rebuilds it from the same
 * observations with the user's choices (pass 2). The execute route runs
 * `executeCleanupPlan` with the production ports. Both effects run in a
 * supervised child, because observation and removal use sync Git. Green
 * worktrees keep the one-click clean route.
 */
export const OPERATOR_WORKTREES_CLEANUP_PLAN_ROUTE = /^\/api\/v1\/worktrees\/cleanup\/plan$/u;
export const OPERATOR_WORKTREES_CLEANUP_EXECUTE_ROUTE = /^\/api\/v1\/worktrees\/cleanup\/execute$/u;
const PLAN_CHILD_TIMEOUT_MS = 120_000;
const EXECUTE_CHILD_TIMEOUT_MS = 600_000;
/** The child stops starting new work this long before the parent kills its process group. */
const CHILD_DEADLINE_MARGIN_MS = 5_000;
const ARCHIVE_STAGE_TIMEOUT_MS = 120_000;
const SESSION = /^[a-f0-9]{32}$/u;
const WORKTREE_ID = /^wt_[a-f0-9]{64}$/u;

type RefusalCode = 'green_worktree' | 'not_listed' | 'inventory_unavailable' | 'session_not_found' | 'choices_changed' | 'choice_invalid' | 'digest_changed';
const REFUSALS: Readonly<Record<RefusalCode, { readonly status: number; readonly message: string; readonly next_action: string }>> = Object.freeze({
  green_worktree: { status: 422, message: 'A selected worktree is green. Nothing was planned.', next_action: 'Use the one-click clean for a green worktree.' },
  not_listed: { status: 409, message: 'A selected worktree is no longer listed. Nothing was planned.', next_action: 'Reload the worktree list, select again, then send a new request_id.' },
  inventory_unavailable: { status: 503, message: 'The worktree inventory cannot be read. Nothing was changed.', next_action: 'Check the registered repositories, then send a new request_id.' },
  session_not_found: { status: 404, message: 'The cleanup session does not exist. Nothing was changed.', next_action: 'Create a new plan, then send a new request_id.' },
  choices_changed: { status: 409, message: 'The choices do not name each plan item once. Nothing was planned.', next_action: 'Reload the plan, choose for each item, then send a new request_id.' },
  choice_invalid: { status: 422, message: 'A choice does not fit the observed loss of its worktree. Nothing was planned.', next_action: 'Select only archivable paths, and archive the commits of an item that has them.' },
  digest_changed: { status: 409, message: 'The selection does not match the session plan. Nothing was removed.', next_action: 'Reload the plan, authorize again, then send a new request_id.' },
});
const refusal = (code: RefusalCode) => new OperatorWriteRefusal(REFUSALS[code].status, code, REFUSALS[code].message, REFUSALS[code].next_action);

export type CleanupPlanRequest = { readonly ids: readonly string[] } | { readonly session_id: string; readonly choices: readonly CleanupChoice[] };

/** Closed body without `request_id`: `{ ids }` starts a session, `{ session_id, choices }` replaces its plan. */
export function decodeCleanupPlanRequest(fields: Readonly<Record<string, unknown>>): CleanupPlanRequest {
  const keys = Object.keys(fields).sort().join(',');
  if (keys === 'ids') {
    const ids = fields.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > WORKTREE_CLEANUP_MAX_IDS || new Set(ids).size !== ids.length
      || !ids.every(id => typeof id === 'string' && WORKTREE_ID.test(id))) throw new Error('worktree_cleanup_plan_request_invalid');
    return { ids: [...ids as string[]].sort() };
  }
  if (keys !== 'choices,session_id' || typeof fields.session_id !== 'string' || !SESSION.test(fields.session_id)) throw new Error('worktree_cleanup_plan_request_invalid');
  return { session_id: fields.session_id, choices: decodeCleanupChoices(fields.choices) };
}

export type WorktreeProcessProbe = (deadline: number) => WorktreeProcess[] | null;
export interface CleanupRouteOptions {
  readonly env: NodeJS.ProcessEnv;
  /** This directory and everything below it are never removed. */
  readonly caller_cwd: string;
  readonly deadline: number;
  readonly processes?: WorktreeProcessProbe;
  /** Production uses the gh Draft PR publisher of the cleanup archive branch. */
  readonly github?: GithubDraftPrPublisher;
}

interface Located { readonly repo: RepoHarnessRegisteredRepo; readonly common: string; readonly path: string; readonly entry: WorktreeTopologyEntry | undefined }

/** The registered worktrees of the registry, by id. An unreadable repository is reported, not skipped. */
function locate(env: NodeJS.ProcessEnv, deadline: number, ids: ReadonlySet<string>): { found: Map<string, Located>; unreadable: boolean } {
  let repos: readonly RepoHarnessRegisteredRepo[];
  try { repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos; } catch { throw refusal('inventory_unavailable'); }
  const found = new Map<string, Located>();
  let unreadable = false;
  for (const repo of repos) {
    try {
      const common = resolveGitCommonDirectory(repo.path);
      for (const { path, entry } of registeredWorktreePaths(entries(repo.path, { deadline }))) {
        const id = worktreeId(common, path);
        if (ids.has(id)) found.set(id, { repo, common, path, entry });
      }
    } catch { unreadable = true; }
  }
  return { found, unreadable };
}

function scanner(options: CleanupRouteOptions): () => WorktreeProcess[] | null {
  const probe = options.processes ?? worktreeProcesses;
  // Like the collector, the observer does not occupy what it inventories; `caller_cwd` protects its own directory.
  return () => probe(Math.min(options.deadline, Date.now() + 5_000))?.filter(row => row.pid !== process.pid) ?? null;
}

function row(located: Located, id: string, options: CleanupRouteOptions, processes: WorktreeProcess[] | null): WorktreeView {
  return repositoryWorktreeRow({ repo: located.repo, common: located.common, managed_root: managedWorktreeRoot(options.env), id, path: located.path,
    entry: located.entry, size_bytes: null, size_observed_at: null, caller_cwd: options.caller_cwd, env: options.env, deadline: options.deadline, processes });
}

/** Server text. It describes the observation; only the user's choice and approval change what happens. */
function serverAdvice(view: WorktreeView, observed: CleanupObservation['loss'] | CleanupObservationError): CleanupAdvice {
  const facts = observed instanceof CleanupObservationError ? [`Loss observation failed: ${observed.code}.`] : [
    `Changed paths: ${observed!.changed_paths.length}.`, `Ignored entries: ${observed!.ignored.length}.`, `Unpublished commits: ${observed!.commits.length}.`,
  ];
  return { recommendation: 'keep', reason: `The server observed a ${view.judgment} worktree.`,
    evidence: [...view.reasons.map(reason => `Worktree reason: ${reason}.`), ...facts], archive: { git: null, private: null } };
}

/** Pass 1: observe each selected non-green worktree and write a plan in which every item is kept. */
export function createCleanupSessionPlan(ids: readonly string[], options: CleanupRouteOptions): CleanupPlan {
  const { found, unreadable } = locate(options.env, options.deadline, new Set(ids));
  if (found.size !== ids.length) throw refusal(unreadable ? 'inventory_unavailable' : 'not_listed');
  const processes = scanner(options)();
  const inputs: { observation: CleanupObservation; advice: CleanupAdvice; own: CleanupPrivateItem }[] = [];
  for (const id of ids) {
    const located = found.get(id)!, worktree = row(located, id, options, processes);
    if (worktree.judgment === 'green') throw refusal('green_worktree');
    const target: CleanupObservationTarget = { repository: located.repo.path, worktree: located.path, id, kind: 'registered' };
    let observed: CleanupObservation['loss'] | CleanupObservationError;
    try { observed = observeCleanupLoss(target, { env: options.env, deadline: options.deadline }); } catch (error) {
      if (!(error instanceof CleanupObservationError)) throw error;
      observed = error;
    }
    const loss = observed instanceof CleanupObservationError ? null : observed;
    inputs.push({ observation: { worktree, loss }, advice: serverAdvice(worktree, observed), own: { target, loss } });
  }
  const plan = createCleanupPlan(randomBytes(16).toString('hex'), inputs);
  saveCleanupSession(options.env, { plan, items: Object.fromEntries(ids.map((id, index) => [id, inputs[index]!.own])) });
  return plan;
}

/** Pass 2: the same persisted observations and server text, with the user's recommendation and archive per item. */
export function chooseCleanupSessionPlan(sessionId: string, choices: readonly CleanupChoice[], options: Pick<CleanupRouteOptions, 'env'>): CleanupPlan {
  const session = loadSession(options.env, sessionId);
  const byId = new Map(choices.map(choice => [choice.id, choice]));
  if (byId.size !== session.plan.items.length || session.plan.items.some(item => !byId.has(item.worktree.id))) throw refusal('choices_changed');
  let plan: CleanupPlan;
  try {
    plan = createCleanupPlan(sessionId, session.plan.items.map(item => {
      const choice = byId.get(item.worktree.id)!;
      return { observation: { worktree: item.worktree, loss: session.items[item.worktree.id]!.loss },
        advice: { recommendation: choice.recommendation, reason: item.advice.reason, evidence: item.advice.evidence, archive: choice.archive } };
    }));
  } catch {
    // The observations passed this same function in pass 1, so a refusal here comes from the choices.
    throw refusal('choice_invalid');
  }
  saveCleanupSession(options.env, { plan, items: session.items });
  return plan;
}

function loadSession(env: NodeJS.ProcessEnv, sessionId: string) {
  try { return loadCleanupSession(env, sessionId); } catch (error) {
    if (error instanceof CleanupSessionMissing) throw refusal('session_not_found');
    throw error;
  }
}

/** Private artifacts: each staged byte stream still has the manifest's size and hash. */
function verifyPrivateArtifacts(staged: StagedCleanupArchive): void {
  for (const artifact of staged.artifacts.filter(row => row.storage === 'private')) {
    const fd = openSync(join(staged.private_directory!, artifact.path), constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer;
    try { if (!fstatSync(fd).isFile()) throw new Error('cleanup archive preservation changed'); bytes = readFileSync(fd); } finally { closeSync(fd); }
    if (bytes.length !== artifact.size || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw new Error('cleanup archive preservation changed');
  }
}

/**
 * Every commit of the deleted branch that the plan does not archive must still
 * be reachable from a commit that a remote advertises now. A stale tracking ref
 * or a rewritten remote branch therefore proves nothing.
 */
function verifyRemoteCoverage(input: CleanupRemovalInput, env: NodeJS.ProcessEnv): void {
  if (input.loss.head_commit === null) return;
  const git = (args: readonly string[], stdin?: string) => gitExecFileSync(['--no-pager', ...args], {
    cwd: input.target.repository, env: { ...withoutRepositorySelectingGitEnv(env), GIT_TERMINAL_PROMPT: '0' }, gitBin: configuredGitBinary(env),
    timeout: 30_000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', input: stdin, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const advertised = new Set<string>();
  for (const remote of git(['remote']).split('\n').filter(Boolean)) {
    for (const line of git(['ls-remote', '--refs', '--', remote]).split('\n').filter(Boolean)) advertised.add(line.split('\t')[0]!);
  }
  const known = advertised.size === 0 ? [] : git(['cat-file', '--batch-check=%(objectname) %(objecttype)'], [...advertised].join('\n') + '\n')
    .split('\n').filter(line => line.endsWith(' commit')).map(line => line.split(' ')[0]!);
  const archived = new Set(input.loss.commits);
  const uncovered = git(['rev-list', '--stdin'], [input.loss.head_commit, ...known.map(oid => `^${oid}`)].join('\n') + '\n').split('\n').filter(Boolean);
  if (uncovered.some(oid => !archived.has(oid))) throw new Error('cleanup remote preservation unproven');
}

/** Production ports of `executeCleanupPlan` for one persisted session. */
function executionPorts(sessionId: string, options: CleanupRouteOptions): CleanupExecutionPorts {
  const session = loadSession(options.env, sessionId), scan = scanner(options);
  const own = (id: string) => session.items[id]!;
  const staging_root = cleanupStagingDirectory(options.env, sessionId);
  const archive = createCleanupArchivePorts(sessionId, { env: options.env, staging_root, stage_timeout_ms: ARCHIVE_STAGE_TIMEOUT_MS,
    target: id => own(id).target, github: options.github ?? createGithubDraftPrPublisher(options.env, CLEANUP_ARCHIVE_BRANCH) });
  const needsArchive = (item: CleanupPlanItem) => item.advice.recommendation === 'archive_then_delete';
  const removalInput = (item: CleanupPlanItem, archiveRecord: CleanupRemovalInput['archive']): CleanupRemovalInput =>
    ({ session_id: sessionId, target: own(item.worktree.id).target, item, loss: own(item.worktree.id).loss!, archive: archiveRecord });
  return {
    loadPlan: async () => session.plan,
    observe: async id => {
      const target = own(id).target, { found } = locate(options.env, options.deadline, new Set([id]));
      const located = found.get(id);
      if (!located || located.path !== target.worktree || located.repo.path !== target.repository) throw new Error('cleanup target no longer listed');
      return { worktree: row(located, id, options, scan()), loss: observeCleanupLoss(target, { env: options.env, deadline: options.deadline }) };
    },
    reconcile: async (_key, item) => {
      if (!needsArchive(item)) return reconcileCleanupWorktree(removalInput(item, null), options.deadline);
      const record = readCleanupArchiveRecord(options.env, sessionId, item);
      // Removal starts only after this record is on disk, so without it no receipt exists.
      return record === null ? { state: 'absent' } : reconcileCleanupWorktree(removalInput(item, record), options.deadline);
    },
    archiveCommit: archive.archiveCommit,
    archivePush: archive.archivePush,
    archivePr: archive.archivePr,
    remove: async (key, item, verify) => {
      let staged: StagedCleanupArchive | null = null, record: CleanupRemovalInput['archive'] = null;
      if (needsArchive(item)) {
        // Staging is idempotent: with the artifacts present it re-observes the bound loss and returns the same manifest.
        staged = stageCleanupArchive(sessionId, own(item.worktree.id).target, item, { env: options.env, deadline: options.deadline, staging_root });
        if (staged.key !== key) throw new Error('cleanup archive key changed');
        record = { manifest_sha256: staged.manifest_sha256, pr: item.advice.archive.git === null ? null : await archive.archivePublication(key, item) };
        writeCleanupArchiveRecord(options.env, sessionId, item, record);
      }
      const input = removalInput(item, record);
      await removeCleanupWorktree(input, { env: options.env, deadline: options.deadline, caller_cwd: options.caller_cwd, processes: () => scan(), verify,
        verifyPreservation: async value => {
          if (staged !== null) {
            if (value.archive?.manifest_sha256 !== staged.manifest_sha256) throw new Error('cleanup archive preservation changed');
            verifyPrivateArtifacts(staged);
            if (item.advice.archive.git !== null && await archive.archivePublication(key, item) !== value.archive.pr) throw new Error('cleanup archive preservation changed');
          }
          verifyRemoteCoverage(value, options.env);
        } });
    },
  };
}

/** Run the authorized execution of one session plan. A refusal here proves that nothing was removed. */
export async function runAuthorizedCleanup(request: AuthorizedCleanupRequest, options: CleanupRouteOptions): Promise<CleanupExecutionResult> {
  const ports = executionPorts(request.session_id, options);
  let digest: string;
  try { digest = cleanupPlanSelectionDigest(await ports.loadPlan(request.session_id), request.ids); } catch { throw refusal('digest_changed'); }
  if (digest !== request.expected_digest) throw refusal('digest_changed');
  return decodeCleanupExecutionResult(await executeCleanupPlan(request, ports));
}

type ChildRequest = { readonly mode: 'plan'; readonly request: CleanupPlanRequest } | { readonly mode: 'execute'; readonly request: AuthorizedCleanupRequest };
const CHILD_ENTRY = fileURLToPath(import.meta.url);

/** The child prints a refusal code or a result. Any other output or exit is not a refusal: the run records `reconcile_required`. */
export function decodeCleanupRouteChildOutput(mode: ChildRequest['mode'], stdout: string): CleanupPlan | CleanupExecutionResult {
  const value: unknown = JSON.parse(stdout);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('worktree cleanup child output is invalid');
  const output = value as Record<string, unknown>;
  const keys = Object.keys(output).sort().join(',');
  if (keys === 'ok,result' && output.ok === true) return mode === 'plan' ? decodeCleanupPlan(output.result) : decodeCleanupExecutionResult(output.result);
  if (keys === 'ok,refusal' && output.ok === false && typeof output.refusal === 'string' && Object.hasOwn(REFUSALS, output.refusal)) throw refusal(output.refusal as RefusalCode);
  throw new Error('worktree cleanup child output is invalid');
}

export interface CleanupChildOptions { readonly env?: NodeJS.ProcessEnv; readonly run_process?: SetupProcessRunner }

async function runChild(child: ChildRequest, options: CleanupChildOptions): Promise<CleanupPlan | CleanupExecutionResult> {
  const timeoutMs = child.mode === 'plan' ? PLAN_CHILD_TIMEOUT_MS : EXECUTE_CHILD_TIMEOUT_MS;
  const env = withoutRepositorySelectingGitEnv({ ...process.env, ...options.env, GIT_TERMINAL_PROMPT: '0' });
  // Not aborted on server close: a started removal finishes or meets the process-group deadline.
  const result = await (options.run_process ?? runSetupProcess)([CHILD_ENTRY, JSON.stringify(child), String(timeoutMs - CHILD_DEADLINE_MARGIN_MS)],
    { cwd: process.cwd(), env, timeout_ms: timeoutMs, signal: new AbortController().signal, service: 'worktree-cleanup' });
  if (!result.ok) throw new Error(`worktree cleanup child ${result.code}`);
  return decodeCleanupRouteChildOutput(child.mode, result.stdout);
}

/** `POST /api/v1/worktrees/cleanup/plan`: pass 1 `{ ids }` or pass 2 `{ session_id, choices }`. */
export function worktreeCleanupPlanWriteRoute(options: CleanupChildOptions = {}): OperatorWriteRoute {
  return {
    id: 'worktrees_cleanup_plan',
    path: OPERATOR_WORKTREES_CLEANUP_PLAN_ROUTE,
    decode(fields): OperatorWriteOperation {
      const request = decodeCleanupPlanRequest(fields);
      return { operation: 'worktrees_cleanup_plan', target: 'session_id' in request ? `worktree_cleanup_session:${request.session_id}` : 'worktree_cleanup_plan',
        input: request as unknown as JsonValue,
        execute: async () => ({ status: 200, body: await runChild({ mode: 'plan', request }, options) as unknown as JsonValue }) };
    },
  };
}

/** `POST /api/v1/worktrees/cleanup/execute`: the authorized request. It shares the `worktrees` lock with the green clean route. */
export function worktreeCleanupExecuteWriteRoute(options: CleanupChildOptions = {}): OperatorWriteRoute {
  return {
    id: 'worktrees_cleanup_execute',
    path: OPERATOR_WORKTREES_CLEANUP_EXECUTE_ROUTE,
    decode(fields): OperatorWriteOperation {
      const request = decodeAuthorizedCleanupRequest(fields);
      return { operation: 'worktrees_cleanup_execute', target: 'worktrees', input: request as unknown as JsonValue,
        execute: async () => ({ status: 200, body: await runChild({ mode: 'execute', request }, options) as unknown as JsonValue }) };
    },
  };
}

if (import.meta.main) {
  const child = JSON.parse(process.argv[2] ?? '') as ChildRequest;
  const deadlineMs = Number(process.argv[3]);
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) throw new Error('worktree cleanup deadline is invalid');
  const options: CleanupRouteOptions = { env: process.env, caller_cwd: process.cwd(), deadline: Date.now() + deadlineMs };
  let output: unknown;
  try {
    let result: CleanupPlan | CleanupExecutionResult;
    if (child.mode === 'execute') result = await runAuthorizedCleanup(decodeAuthorizedCleanupRequest(child.request), options);
    else {
      const request = decodeCleanupPlanRequest(child.request as unknown as Record<string, unknown>);
      result = 'ids' in request ? createCleanupSessionPlan(request.ids, options) : chooseCleanupSessionPlan(request.session_id, request.choices, options);
    }
    output = { ok: true, result };
  } catch (error) {
    if (!(error instanceof OperatorWriteRefusal)) throw error;
    output = { ok: false, refusal: error.code };
  }
  process.stdout.write(JSON.stringify(output) + '\n', () => process.exit(0));
}
