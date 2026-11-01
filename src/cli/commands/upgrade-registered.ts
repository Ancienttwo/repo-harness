import { createHash } from 'crypto';
import { lstatSync, readFileSync } from 'fs';
import { join } from 'path';
import { formatJson } from '../installer/shared';
import { gitSpawnSync } from '../../effects/git/runner';
import {
  assertRegistryRevisionFence,
  isRepoHarnessAdoptedPath,
  readRepoHarnessRegistryStrictSnapshot,
  repoCheckoutProbeEnv,
  repoHarnessCheckoutRejection,
} from '../../effects/repo-registry';
import { boundSweepSteps, planManagedWorktreeSweep, sweepManagedWorktrees, type WorktreeSweepPlan } from '../../effects/state/coordination-worktree-topology';
import { planRepoAdoption, runAdoptionApply } from './adoption-plan';
import { formatUpgradeResult, runUpgrade, type UpgradeResult } from './upgrade';

/** Same budget as the sweep that `contract-worktree start` runs. */
const SWEEP_DEADLINE_MS = 30_000;

export type RegisteredRepoSkipReason =
  | 'path_missing'
  | 'path_unreadable'
  | 'not_primary_checkout'
  | 'not_adopted'
  | 'default_branch_unknown'
  | 'not_default_branch'
  | 'dirty_worktree'
  | 'git_probe_failed';

export interface RegisteredInitPreview {
  readonly planned: number;
  readonly operations: readonly { readonly kind: string; readonly path?: string }[];
}

export interface RegisteredInitApply {
  readonly ok: boolean;
  readonly planned: number;
  readonly applied: number;
  readonly failed: number;
  readonly transaction?: string;
  readonly rollbackOk?: boolean;
  readonly errors?: readonly string[];
}

/** Preview: the sweep plan, null when there is nothing to sweep. Apply: the sweep report. */
export type RegisteredSweep =
  | { readonly ran: false; readonly plan: WorktreeSweepPlan | null }
  | { readonly ran: false; readonly error: string }
  | { readonly ran: true; readonly report: string | null };

export interface RegisteredRepoResult {
  readonly path: string;
  readonly status: 'ready' | 'applied' | 'skipped' | 'failed';
  readonly reason?: RegisteredRepoSkipReason;
  readonly detail?: string;
  /** Preview only: the repo has init operations or pending project upgrade work, including a removable or deferred legacy worktree. */
  readonly pending?: boolean;
  readonly init?: RegisteredInitPreview | RegisteredInitApply;
  readonly upgrade?: UpgradeResult;
  readonly sweep?: RegisteredSweep;
  readonly error?: string;
}

export interface RegisteredUpgradeResult {
  readonly revision: string | null;
  readonly apply: boolean;
  readonly exitCode: 0 | 1 | 2;
  readonly repos: readonly RegisteredRepoResult[];
  readonly error?: string;
}

export interface RegisteredUpgradeOptions {
  readonly apply?: boolean;
  readonly expectedRevision?: string;
  readonly migrateWorktreeTemplate?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  /** The real process cwd. The sweep and the legacy worktree cleanup never remove it or anything below it. */
  readonly callerCwd?: string;
}

type Classification =
  | { readonly ready: true }
  | { readonly ready: false; readonly reason: RegisteredRepoSkipReason; readonly detail: string };

function skip(reason: RegisteredRepoSkipReason, detail: string): Classification {
  return { ready: false, reason, detail };
}

function git(path: string, args: readonly string[], env: NodeJS.ProcessEnv) {
  return gitSpawnSync(args, { cwd: path, env: repoCheckoutProbeEnv(env), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function gitFailure(result: ReturnType<typeof git>): string {
  return result.error?.message ?? (result.stderr.trim() || `git exited with status ${result.status}`);
}

/** The policy owns the default branch. A missing or invalid value is never guessed. */
function policyDefaultBranch(path: string): { readonly branch: string } | { readonly error: string } {
  let policy: unknown;
  try { policy = JSON.parse(readFileSync(join(path, '.ai', 'harness', 'policy.json'), 'utf-8')); }
  catch (error) { return { error: `.ai/harness/policy.json is unreadable: ${error instanceof Error ? error.message : String(error)}` }; }
  const strategy = policy && typeof policy === 'object' ? (policy as { worktree_strategy?: unknown }).worktree_strategy : undefined;
  const branch = strategy && typeof strategy === 'object' ? (strategy as { base_branch?: unknown }).base_branch : undefined;
  if (typeof branch !== 'string' || branch.trim() === '') return { error: 'worktree_strategy.base_branch is missing or not a non-empty string' };
  return { branch: branch.trim() };
}

/** Read-only. `--no-optional-locks` keeps `git status` from refreshing the index. */
function classifyRepo(path: string, env: NodeJS.ProcessEnv): Classification {
  try {
    lstatSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT' || code === 'ENOTDIR'
      ? skip('path_missing', `${path} does not exist`)
      : skip('path_unreadable', `${path} cannot be inspected (${code ?? 'probe_failed'})`);
  }
  const rejection = repoHarnessCheckoutRejection(path, env);
  if (rejection) return skip(rejection.reason, rejection.message);
  if (!isRepoHarnessAdoptedPath(path)) return skip('not_adopted', `${path} is not repo-harness adopted`);
  const base = policyDefaultBranch(path);
  if ('error' in base) return skip('default_branch_unknown', base.error);
  const head = git(path, ['symbolic-ref', '--quiet', '--short', 'HEAD'], env);
  if (head.error || (head.status !== 0 && head.status !== 1)) return skip('git_probe_failed', `cannot read the current branch: ${gitFailure(head)}`);
  if (head.status === 1) return skip('not_default_branch', `HEAD is detached; the default branch is ${base.branch}`);
  const current = head.stdout.trim();
  if (current !== base.branch) return skip('not_default_branch', `current branch is ${current}; the default branch is ${base.branch}`);
  // The flags override `status.showUntrackedFiles` and `diff.ignoreSubmodules` from user config.
  const status = git(path, ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=normal', '--ignore-submodules=none'], env);
  if (status.error || status.status !== 0) return skip('git_probe_failed', `cannot read the worktree status: ${gitFailure(status)}`);
  if (status.stdout.trim() !== '') return skip('dirty_worktree', `${status.stdout.trim().split('\n').length} changed or untracked paths`);
  return { ready: true };
}

/** Each repo's classification and sweep plan. The plan revision binds every sweep plan, so apply runs only previewed steps. */
type RepoPlan =
  | { readonly classification: Classification; readonly sweep?: Exclude<RegisteredSweep, { ran: true }> }
  | { readonly error: string };

const NO_STEPS: WorktreeSweepPlan = { target_oid: null, items: [] };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function planRepo(path: string, env: NodeJS.ProcessEnv, callerCwd: string): RepoPlan {
  try {
    const classification = classifyRepo(path, env);
    if (!classification.ready) return { classification };
    try { return { classification, sweep: { ran: false, plan: planManagedWorktreeSweep(path, callerCwd, env, { deadlineMs: SWEEP_DEADLINE_MS }) } }; }
    catch (error) { return { classification, sweep: { ran: false, error: `sweep plan failed: ${message(error)}` } }; }
  } catch (error) { return { error: message(error) }; }
}

/** The plan that binds an apply sweep. A skipped repo or a failed plan approves no sweep step. */
function approvedSweep(plan: RepoPlan): WorktreeSweepPlan {
  return 'classification' in plan && plan.sweep && 'plan' in plan.sweep && plan.sweep.plan ? plan.sweep.plan : NO_STEPS;
}

/** Repo classification is checked again before each write, so the revision binds only the registry and the sweep steps. */
function planRevision(registryRevision: string, repos: readonly { readonly path: string }[], plans: readonly RepoPlan[]): string {
  const sweeps = plans.map((plan, index) => ({ path: repos[index]!.path, sweep: boundSweepSteps(approvedSweep(plan)) }));
  return `sha256:${createHash('sha256').update(JSON.stringify({ registry: registryRevision, repos: sweeps })).digest('hex')}`;
}

function skipped(path: string, classification: Exclude<Classification, { ready: true }>): RegisteredRepoResult {
  return { path, status: 'skipped', reason: classification.reason, detail: classification.detail };
}

function previewRepo(path: string, opts: RegisteredUpgradeOptions, env: NodeJS.ProcessEnv, callerCwd: string, plan: RepoPlan): RegisteredRepoResult {
  if ('error' in plan) throw new Error(plan.error);
  const { classification, sweep } = plan;
  if (!classification.ready) return skipped(path, classification);
  const planned = planRepoAdoption({ repo: path, mode: 'standard', explicitRepo: true, env });
  const init: RegisteredInitPreview | undefined = planned.plan && {
    planned: planned.plan.summary.plannedTotal,
    operations: planned.plan.operations.filter((operation) => operation.status === 'planned')
      .map((operation) => ({ kind: operation.kind, ...(operation.path === undefined ? {} : { path: operation.path }) })),
  };
  const upgrade = runUpgrade({ cwd: path, callerCwd, scope: 'project', apply: false, migrateWorktreeTemplate: opts.migrateWorktreeTemplate, env });
  const errors = [
    ...(planned.error ? [`init plan failed: ${planned.error.code} - ${planned.error.message}`] : []),
    ...(upgrade.error ? [`project upgrade check failed: ${upgrade.error}`] : []),
  ];
  if (errors.length > 0) {
    return { path, status: 'failed', ...(init ? { init } : {}), upgrade, sweep, error: errors.join('; ') };
  }
  // A preview upgrade exits 1 for every pending item: leftovers, a template rewrite and a removable or deferred legacy worktree.
  const sweepSteps = sweep && 'plan' in sweep ? boundSweepSteps(sweep.plan).steps.length : 0;
  return { path, status: 'ready', pending: init!.planned > 0 || upgrade.exitCode !== 0 || sweepSteps > 0, init, upgrade, sweep };
}

/**
 * The per-repo write sequence. Preconditions are checked again immediately
 * before the first write; the init transaction then changes the worktree, so
 * later steps do not re-check it. A failed step stops this repo only.
 */
function applyRepo(path: string, opts: RegisteredUpgradeOptions, env: NodeJS.ProcessEnv, callerCwd: string, approved: WorktreeSweepPlan): RegisteredRepoResult {
  const classification = classifyRepo(path, env);
  if (!classification.ready) return skipped(path, classification);

  const adoption = runAdoptionApply({ repo: path, mode: 'standard', explicitRepo: true, env }).report;
  const results = adoption.apply?.results ?? [];
  const errors = [
    ...(adoption.errors ?? []).map((error) => `${error.code} - ${error.message}`),
    ...results.filter((result) => result.status === 'failed').map((result) => `${result.id}${result.error ? ` - ${result.error}` : ''}`),
    ...(adoption.registration && !adoption.registration.registered && adoption.registration.reason !== 'already registered'
      ? [`registry: ${adoption.registration.reason ?? 'not registered'}`] : []),
  ];
  const plannedOperations = (adoption.plan as { summary?: { plannedTotal?: unknown } }).summary?.plannedTotal;
  const init: RegisteredInitApply = {
    ok: adoption.ok,
    planned: typeof plannedOperations === 'number' ? plannedOperations : 0,
    applied: results.filter((result) => result.status === 'applied').length,
    failed: results.filter((result) => result.status === 'failed').length,
    ...(adoption.apply?.transactionManifestPath ? { transaction: adoption.apply.transactionManifestPath } : {}),
    ...(adoption.apply?.rollback ? { rollbackOk: adoption.apply.rollback.ok } : {}),
    ...(errors.length > 0 ? { errors } : {}),
  };
  if (!adoption.ok) return { path, status: 'failed', init, error: `init refresh failed: ${errors.join('; ') || 'not ok'}` };

  // The upgrade also removes provable legacy sibling worktrees; the sweep then handles the managed root.
  const upgrade = runUpgrade({ cwd: path, callerCwd, scope: 'project', apply: true, migrateWorktreeTemplate: opts.migrateWorktreeTemplate, env });
  if (upgrade.error) return { path, status: 'failed', init, upgrade, error: `project upgrade failed: ${upgrade.error}` };

  const sweep: RegisteredSweep = { ran: true, report: sweepManagedWorktrees(path, callerCwd, env, { deadlineMs: SWEEP_DEADLINE_MS, approved }) };
  return { path, status: 'applied', init, upgrade, sweep };
}

/**
 * Project upgrade for every registered repo. Targets come from one strict
 * registry snapshot; nothing scans directories. The default is a read-only
 * preview. `apply` needs the preview's plan revision, which binds the registry
 * revision and every sweep plan; each repo is classified, written and reported
 * on its own. Nothing is committed.
 */
export function runRegisteredUpgrade(opts: RegisteredUpgradeOptions = {}): RegisteredUpgradeResult {
  const apply = opts.apply === true;
  const env = opts.env ?? process.env;
  let revision: string | null = null;
  try {
    assertRegistryRevisionFence({ apply, expectedRevision: opts.expectedRevision });
    const snapshot = readRepoHarnessRegistryStrictSnapshot({ env, adoptedOnly: false });
    const callerCwd = opts.callerCwd ?? process.cwd();
    const plans = snapshot.repos.map((repo) => planRepo(repo.path, env, callerCwd));
    revision = planRevision(snapshot.registryRevision, snapshot.repos, plans);
    if (opts.expectedRevision !== undefined && opts.expectedRevision !== revision) {
      throw new Error('registry or worktree sweep plan changed; preview again before applying');
    }
    const repos = snapshot.repos.map((repo, index): RegisteredRepoResult => {
      const plan = plans[index]!;
      try {
        if (!apply) return previewRepo(repo.path, opts, env, callerCwd, plan);
        return applyRepo(repo.path, opts, env, callerCwd, approvedSweep(plan));
      } catch (error) {
        return { path: repo.path, status: 'failed', error: error instanceof Error ? error.message : String(error) };
      }
    });
    const failed = repos.some((repo) => repo.status === 'failed');
    const pending = repos.some((repo) => repo.pending === true);
    return { revision, apply, exitCode: failed || pending ? 1 : 0, repos };
  } catch (error) {
    return { revision, apply, exitCode: 2, repos: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function indent(text: string, prefix: string): string[] {
  return text.trimEnd().split('\n').map((line) => `${prefix}${line}`);
}

function formatInit(init: RegisteredInitPreview | RegisteredInitApply): string[] {
  if ('operations' in init) {
    return [`  init: ${init.planned} planned operations`,
      ...init.operations.map((operation) => `    ${operation.kind}${operation.path === undefined ? '' : ` ${operation.path}`}`)];
  }
  const lines = [`  init: ${init.ok ? 'ok' : 'failed'}; ${init.planned} planned, ${init.applied} applied, ${init.failed} failed`];
  if (init.transaction) lines.push(`    rollback: repo-harness init rollback --transaction ${init.transaction}`);
  if (init.rollbackOk !== undefined) lines.push(`    automatic rollback: ${init.rollbackOk ? 'complete' : 'incomplete'}`);
  for (const error of init.errors ?? []) lines.push(`    error: ${error}`);
  return lines;
}

function formatSweep(sweep: RegisteredSweep): string[] {
  if (sweep.ran) return sweep.report === null ? ['  sweep: no managed worktrees'] : ['  sweep:', ...indent(sweep.report, '    ')];
  if ('error' in sweep) return [`  sweep: ${sweep.error}; apply takes no sweep step`];
  if (sweep.plan === null) return ['  sweep: no managed worktrees'];
  return [`  sweep plan: target ${sweep.plan.target_oid ?? 'none'}`, ...sweep.plan.items.map((item) =>
    `    ${item.action} ${item.path}${item.branch ? ` (${item.branch})` : ''}${item.reason ? `: ${item.reason}` : ''}`)];
}

export function formatRegisteredUpgradeResult(result: RegisteredUpgradeResult, asJson = false): string {
  if (asJson) return formatJson(result);
  const lines = [
    `${result.apply ? 'Registered upgrade apply' : 'Registered upgrade preview'}. Plan revision: ${result.revision ?? 'unavailable'}`,
  ];
  for (const repo of result.repos) {
    const head = repo.status === 'skipped' ? `skipped (${repo.reason}): ${repo.detail}`
      : repo.status === 'ready' ? `ready; ${repo.pending ? 'pending' : 'up to date'}` : repo.status;
    lines.push(`${repo.path}: ${head}`);
    if (repo.init) lines.push(...formatInit(repo.init));
    if (repo.upgrade) lines.push('  upgrade:', ...indent(formatUpgradeResult(repo.upgrade), '    '));
    if (repo.sweep) lines.push(...formatSweep(repo.sweep));
    if (repo.error) lines.push(`  failed: ${repo.error}`);
  }
  if (result.repos.length === 0 && !result.error) lines.push('No registered repos.');
  if (result.error) lines.push(`Failed: ${result.error}`);
  else if (!result.apply && result.revision) {
    lines.push(`Apply: repo-harness upgrade --registered --apply --expected-revision ${result.revision}`);
  }
  if (result.apply && !result.error) lines.push('Nothing was committed. Review and commit each repo.');
  return `${lines.join('\n')}\n`;
}
