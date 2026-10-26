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
import { sweepManagedWorktrees } from '../../effects/state/coordination-worktree-topology';
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

export type RegisteredSweep =
  | { readonly ran: false; readonly reason: string }
  | { readonly ran: true; readonly report: string | null };

export interface RegisteredRepoResult {
  readonly path: string;
  readonly status: 'ready' | 'applied' | 'skipped' | 'failed';
  readonly reason?: RegisteredRepoSkipReason;
  readonly detail?: string;
  /** Preview only: the repo has init operations or project upgrade items. */
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
  /** The real process cwd. The sweep never removes it or anything below it. */
  readonly callerCwd?: string;
}

const SWEEP_PREVIEW: RegisteredSweep = {
  ran: false,
  reason: 'The managed worktree sweep has no dry-run path; it runs only with --apply.',
};

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

function skipped(path: string, classification: Exclude<Classification, { ready: true }>): RegisteredRepoResult {
  return { path, status: 'skipped', reason: classification.reason, detail: classification.detail };
}

function previewRepo(path: string, opts: RegisteredUpgradeOptions, env: NodeJS.ProcessEnv): RegisteredRepoResult {
  const classification = classifyRepo(path, env);
  if (!classification.ready) return skipped(path, classification);
  const planned = planRepoAdoption({ repo: path, mode: 'standard', explicitRepo: true, env });
  const init: RegisteredInitPreview | undefined = planned.plan && {
    planned: planned.plan.summary.plannedTotal,
    operations: planned.plan.operations.filter((operation) => operation.status === 'planned')
      .map((operation) => ({ kind: operation.kind, ...(operation.path === undefined ? {} : { path: operation.path }) })),
  };
  const upgrade = runUpgrade({ cwd: path, scope: 'project', apply: false, migrateWorktreeTemplate: opts.migrateWorktreeTemplate, env });
  const errors = [
    ...(planned.error ? [`init plan failed: ${planned.error.code} - ${planned.error.message}`] : []),
    ...(upgrade.error ? [`project upgrade check failed: ${upgrade.error}`] : []),
  ];
  if (errors.length > 0) {
    return { path, status: 'failed', ...(init ? { init } : {}), upgrade, sweep: SWEEP_PREVIEW, error: errors.join('; ') };
  }
  return { path, status: 'ready', pending: init!.planned > 0 || upgrade.exitCode !== 0, init, upgrade, sweep: SWEEP_PREVIEW };
}

/**
 * The per-repo write sequence. Preconditions are checked again immediately
 * before the first write; the init transaction then changes the worktree, so
 * later steps do not re-check it. A failed step stops this repo only.
 */
function applyRepo(path: string, opts: RegisteredUpgradeOptions, env: NodeJS.ProcessEnv, callerCwd: string): RegisteredRepoResult {
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

  const upgrade = runUpgrade({ cwd: path, scope: 'project', apply: true, migrateWorktreeTemplate: opts.migrateWorktreeTemplate, env });
  if (upgrade.error) return { path, status: 'failed', init, upgrade, error: `project upgrade failed: ${upgrade.error}` };

  const sweep: RegisteredSweep = { ran: true, report: sweepManagedWorktrees(path, callerCwd, env, { deadlineMs: SWEEP_DEADLINE_MS }) };
  return { path, status: 'applied', init, upgrade, sweep };
}

/**
 * Project upgrade for every registered repo. Targets come from one strict
 * registry snapshot; nothing scans directories. The default is a read-only
 * preview. `apply` needs the preview's registry revision, and each repo is
 * classified, written and reported on its own. Nothing is committed.
 */
export function runRegisteredUpgrade(opts: RegisteredUpgradeOptions = {}): RegisteredUpgradeResult {
  const apply = opts.apply === true;
  const env = opts.env ?? process.env;
  let revision: string | null = null;
  try {
    assertRegistryRevisionFence({ apply, expectedRevision: opts.expectedRevision });
    const snapshot = readRepoHarnessRegistryStrictSnapshot({ env, adoptedOnly: false });
    revision = snapshot.registryRevision;
    assertRegistryRevisionFence({ apply, expectedRevision: opts.expectedRevision }, snapshot);
    const callerCwd = opts.callerCwd ?? process.cwd();
    const repos = snapshot.repos.map((repo): RegisteredRepoResult => {
      try {
        return apply ? applyRepo(repo.path, opts, env, callerCwd) : previewRepo(repo.path, opts, env);
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

export function formatRegisteredUpgradeResult(result: RegisteredUpgradeResult, asJson = false): string {
  if (asJson) return formatJson(result);
  const lines = [
    `${result.apply ? 'Registered upgrade apply' : 'Registered upgrade preview'}. Registry revision: ${result.revision ?? 'unavailable'}`,
  ];
  for (const repo of result.repos) {
    const head = repo.status === 'skipped' ? `skipped (${repo.reason}): ${repo.detail}`
      : repo.status === 'ready' ? `ready; ${repo.pending ? 'pending' : 'up to date'}` : repo.status;
    lines.push(`${repo.path}: ${head}`);
    if (repo.init) lines.push(...formatInit(repo.init));
    if (repo.upgrade) lines.push('  upgrade:', ...indent(formatUpgradeResult(repo.upgrade), '    '));
    if (repo.sweep) {
      if (!repo.sweep.ran) lines.push(`  sweep: not run; ${repo.sweep.reason}`);
      else if (repo.sweep.report === null) lines.push('  sweep: no managed worktrees');
      else lines.push('  sweep:', ...indent(repo.sweep.report, '    '));
    }
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
