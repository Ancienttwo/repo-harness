/**
 * Mutation guard — HRD-03 in-process decision handler for `PreToolUse.edit`.
 *
 * Preserves path/private boundaries; workflow stages are advisory.
 * Uses the typed collector for host input and applies private/path boundaries
 * in process. See the historical guard-port notes for the original decisions.
 *
 * Reads as a decision pipeline: `runMutationGuard()` orchestrates one
 * worktree check plus one pass of `runPerPathGuards()` per target path
 * (a single edited file, or every path an `apply_patch` command touches),
 * stopping at the first guard that blocks -- mirroring the scripts'
 * `exit 2` short-circuit exactly, including the old apply_patch recursion's
 * "process paths in order, stop at the first failure" behavior.
 */

import { execFileSync } from 'child_process';
import { appendFileSync, mkdirSync } from 'fs';
import { basename, dirname, join, posix, win32 } from 'path';
import type { EffectiveState } from '../../core/state/types';
import type { WorkflowProfile } from '../../core/workflow/profile';
import { recordCircuitAttempt, type CircuitAttempt } from './circuit-breaker';
import {
  canonicalRepoRelativePath,
  fileExists,
  readText,
  safeRealpath,
} from '../../effects/state/collect-state-inputs';
import { findClaimTokenByUnitRef } from '../../effects/state/coordination-claim-token';
import {
  collectSliceInputs,
  resolveSliceOptions,
} from '../../effects/state/collect-slice-inputs';
import type { WorktreeOwnership } from '../../effects/loop/state-input-collector';
import {
  contractAllowsPath,
} from '../../core/state/artifact-parsers';

// ---------------------------------------------------------------------------
// Public entry surface
// ---------------------------------------------------------------------------

/** Structural subset of `StateInputCollector` this handler consumes. */
export interface MutationGuardCollector {
  getRepoRoot(): string;
  getWorktreeOwnership(): WorktreeOwnership;
  getActivePlanMarker(): string | null;
  getPreEditEffectiveState(targetPaths: readonly string[]): EffectiveState | null;
}

export interface MutationGuardInput {
  readonly collector: MutationGuardCollector;
  /** Raw host event payload (the same bytes `runHook()` would replay to a script's stdin). */
  readonly input?: string | Buffer;
  readonly env?: NodeJS.ProcessEnv;
}

export interface MutationGuardResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function runMutationGuard(opts: MutationGuardInput): MutationGuardResult {
  const repoRoot = opts.collector.getRepoRoot();
  const env = opts.env ?? process.env;
  const payload = parsePayload(opts.input);
  const ctx: Ctx = {
    repoRoot,
    collector: opts.collector,
    env,
    payload,
    stdout: [],
    stderr: [],
    runId: null,
    resolvedProfileHint: null,
    leaseOwnership: null,
  };

  try {
    const applyPatchCommand = stringAt(payload, ['tool_input', 'command']);
    let targetPaths: readonly string[];
    let writePayloadFor: (filePath: string) => string;

    if (applyPatchCommand) {
      const expanded = extractApplyPatchPaths(repoRoot, applyPatchCommand);
      if (expanded.length === 0) {
        applyPatchScopeGuard(ctx);
      }
      targetPaths = expanded;
      // Mirrors the shell recursion's own quirk: a recursively-expanded
      // invocation's payload only ever carries `.tool_input.command` (the
      // full original patch text), never `.content`/`.new_string`/`.text`,
      // so every expanded path's PlanTransitionGuard check scans the WHOLE
      // batch's patch text, not just its own path's slice.
      writePayloadFor = () => applyPatchCommand;
    } else {
      // hook_get_file_path() port: falls back to the CLAUDE_FILE_PATH env
      // var (gate round-1 parity closure) only when none of the four JSON
      // fields resolved -- `git show c6504231:assets/hooks/hook-input.sh`
      // lines 224-241.
      const filePath = normalizeFilePath(repoRoot, firstNonEmpty([
        stringAt(payload, ['file_path']),
        stringAt(payload, ['tool_input', 'file_path']),
        stringAt(payload, ['trigger_file_path']),
        stringAt(payload, ['parent_file_path']),
        env.CLAUDE_FILE_PATH ?? '',
      ]));
      if (!filePath) return finish(ctx, 0);
      targetPaths = [filePath];
      writePayloadFor = () => firstNonEmpty([
        stringAt(payload, ['tool_input', 'content']),
        stringAt(payload, ['tool_input', 'new_string']),
        stringAt(payload, ['tool_input', 'text']),
        stringAt(payload, ['tool_input', 'command']),
      ]);
    }

    for (const filePath of targetPaths) {
      runPerPathGuards(ctx, filePath, targetPaths, writePayloadFor(filePath));
    }

    return finish(ctx, 0);
  } catch (thrown) {
    if (thrown instanceof GuardExit) return finish(ctx, thrown.code);
    throw thrown;
  }
}

function finish(ctx: Ctx, exitCode: number): MutationGuardResult {
  return { exitCode, stdout: ctx.stdout.join(''), stderr: ctx.stderr.join('') };
}

// ---------------------------------------------------------------------------
// Pipeline context and control flow
// ---------------------------------------------------------------------------

interface Ctx {
  readonly repoRoot: string;
  readonly collector: MutationGuardCollector;
  readonly env: NodeJS.ProcessEnv;
  readonly payload: unknown;
  readonly stdout: string[];
  readonly stderr: string[];
  runId: string | null;
  /** The current invocation's own resolved profile, once known (even if the overall resolution is blocked -- matches bash's `${WORKFLOW_PROFILE:-}`). */
  resolvedProfileHint: string | null;
  /**
   * The lease-ownership decision for this event, computed at most once. An
   * `apply_patch` batch runs `runPerPathGuards()` once per target path, but
   * lease ownership is a fact about the TREE, not about a path: recomputing it
   * per path would multiply the armed collection by the batch size while
   * producing the same answer every time.
   */
  leaseOwnership: LeaseOwnershipDecision | null;
}

/** Mirrors a bash `exit N`: unwinds the whole handler immediately. */
class GuardExit {
  constructor(readonly code: number) {}
}

function out(ctx: Ctx, line: string): void {
  ctx.stdout.push(`${line}\n`);
}

function err(ctx: Ctx, line: string): void {
  ctx.stderr.push(`${line}\n`);
}

function outRaw(ctx: Ctx, text: string): void {
  ctx.stdout.push(text);
}

function exit(code: number): never {
  throw new GuardExit(code);
}

// ---------------------------------------------------------------------------
// LeaseOwnershipGuard: early feedback for a sprint-bound execution unit
// ---------------------------------------------------------------------------

/**
 * `pass` covers both "not armed" and "armed and every step held". The two are
 * indistinguishable to the caller by design: an unarmed tree must be affected
 * by exactly nothing, and a passing armed tree must be affected by exactly
 * nothing either.
 */
type LeaseOwnershipDecision =
  | { readonly kind: 'pass' }
  | {
      readonly kind: 'refuse';
      /** Assertable reason token; one per failing step. */
      readonly token: string;
      readonly reason: string;
      readonly fix: string;
    };

function refuse(token: string, reason: string, fix: string): LeaseOwnershipDecision {
  return { kind: 'refuse', token, reason, fix };
}

/**
 * The current branch, or null when HEAD is detached or git refuses. Null never
 * passes the owner-tree comparison: an execution tree that cannot name its own
 * branch cannot prove it is the one the lease names.
 */
function currentBranch(repoRoot: string): string | null {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return branch && branch !== 'HEAD' ? branch : null;
  } catch {
    return null;
  }
}

/**
 * The double predicate, then five steps.
 *
 * ## Arming (verdict C)
 *
 * Claim tokens are write-only: `scripts/sprint-backlog.sh` creates them in
 * `start-task` and nothing in this repository ever deletes one outside the
 * inline release path. "A token exists" therefore does not mean "this tree is
 * executing a sprint row" -- it can mean "this tree ran an inline sprint task
 * once, months ago". Arming on existence alone would permanently arm the
 * primary tree of any repository that ever used the sprint flow and block
 * every subsequent edit against a lease nobody holds.
 *
 * Two conditions defuse that, in cost order:
 *
 * 1. a claim token whose `unit_ref` equals the CURRENT active-plan marker --
 *    a pure filesystem read, and the discriminator that makes a stale token
 *    inert (its `unit_ref` names the plan it was minted for; inline tokens
 *    carry `inline:<sprint>#<index>` and can never equal a plan path);
 * 2. the current tree is a linked worktree -- one `git rev-parse`, paid only
 *    after condition 1 already matched, because `PreToolUse.edit` fires on
 *    every structured write and the unarmed path must stay near-free.
 *
 * ## Failure semantics
 *
 * Pre-arming failure is advisory and passes: this route fires thousands of
 * times a year and must not block on harness IO jitter. Every failure AFTER
 * arming is fail-closed with an explicit `exit(2)`, never an escaping
 * exception -- `runtime.ts` maps a throw to exit 1, which the host reads as
 * fail-open, so a thrown fail-closed intent would invert into its opposite.
 * `WorkflowResolutionUnstableGuard` below is the existing precedent.
 *
 * This is an EARLY FEEDBACK gate, not the publication authority. A `Bash`
 * write bypasses it entirely; `start-task` claim, inline `complete-task`, and
 * `contract-worktree finish` remain the real gates, and nothing here relaxes
 * them.
 */
function computeLeaseOwnership(ctx: Ctx): LeaseOwnershipDecision {
  let unitRef: string | null;
  let token: ReturnType<typeof findClaimTokenByUnitRef>;
  try {
    unitRef = ctx.collector.getActivePlanMarker();
    if (!unitRef) return { kind: 'pass' };
    token = findClaimTokenByUnitRef(ctx.repoRoot, unitRef);
  } catch (error) {
    out(ctx, `[LeaseOwnershipGuard] Advisory: claim-token state could not be read (${describeError(error)}); the lease gate stays inactive for this edit.`);
    return { kind: 'pass' };
  }
  if (token.outcome === 'none') return { kind: 'pass' };
  if (!isLinkedWorktree(ctx.repoRoot)) return { kind: 'pass' };

  // ---- step 1: token uniqueness ------------------------------------------
  if (token.outcome === 'ambiguous') {
    return refuse(
      'lease_claim_token_ambiguous',
      `More than one claim token in this worktree names unit ${unitRef} (${token.matches.join(', ')}); ambiguous ownership cannot be resolved by picking one.`,
      'Remove the claim token that does not belong to this worktree, or run repo-harness state board --json to identify which claim this tree actually owns.',
    );
  }
  const held = token.token;

  let collection;
  try {
    const options = resolveSliceOptions(ctx.repoRoot);
    if (options === null) {
      return refuse(
        'lease_sprint_unresolvable',
        `This worktree holds claim ${held.claim_id} for unit ${unitRef}, but no active sprint marker resolves; the claim cannot be validated against canonical.`,
        'Restore .ai/harness/sprint/active-sprint, or release the stale claim with repo-harness sprint release --claim-id ' + held.claim_id,
      );
    }
    collection = collectSliceInputs(ctx.repoRoot, options);
  } catch (error) {
    return refuse(
      'lease_state_unreadable',
      `This worktree holds claim ${held.claim_id} for unit ${unitRef}, but the coordination state could not be read (${describeError(error)}).`,
      'Resolve the coordination-state read failure, then retry; do not edit against an unverifiable lease.',
    );
  }

  const canonical = collection.tasks.find((task) => task.task_id === held.task_id);
  const record = canonical?.lease.record ?? null;

  // ---- step 2: the common-dir owner record names this tree's claim --------
  if (canonical === undefined || record === null) {
    return refuse(
      'lease_owner_unreadable',
      `This worktree holds claim ${held.claim_id} for task ${held.task_id}, but the shared plane has no readable owner record for it${canonical === undefined ? ' and the row is not on the canonical sprint' : ''}.`,
      `Run repo-harness sprint reconcile --task-id ${held.task_id} --target-ref ${collection.canonical_target.ref} before editing.`,
    );
  }
  if (record.claim_id !== held.claim_id) {
    return refuse(
      'lease_owner_claim_mismatch',
      `Task ${held.task_id} is owned by claim ${record.claim_id}, but this worktree holds claim ${held.claim_id}; the claim moved.`,
      `Stop editing here and continue from the owning worktree, or take the claim over with repo-harness sprint steal --expected-claim-id ${record.claim_id} --reason '<reason>' --session-id '<session-id>'.`,
    );
  }

  // ---- step 3: the lease is bound ----------------------------------------
  if (record.state !== 'bound') {
    const recovery = record.state === 'reviewing' && 'current_publication' in record && record.current_publication !== null
      ? `Reconcile provider integration with repo-harness publication reconcile --task-id ${held.task_id}`
        + ` --expected-claim-id ${record.claim_id} --expected-generation ${record.generation}`
        + ` --publication-id ${record.current_publication.publication_id}`
        + ` --expected-head-sha ${record.current_publication.head_sha} --remote '<remote>', or use publication reopen/takeover/abandon.`
      : record.state === 'completing'
        ? 'Inspect the incomplete closeout with repo-harness publication recover inspect, then explicitly recover reconcile or abort.'
        : `Finish or reconcile the ${record.state} lease before editing (repo-harness sprint reconcile --task-id ${held.task_id} --target-ref ${collection.canonical_target.ref}).`;
    return refuse(
      'lease_state_not_bound',
      `Claim ${held.claim_id} is ${record.state}, not bound; a lease that is not bound names no execution worktree that may write.`,
      record.state === 'reserving'
        ? 'Bind the reservation to this worktree with repo-harness sprint bind before editing.'
        : recovery,
    );
  }

  // ---- step 4: the owner tree is this tree -------------------------------
  const currentTree = safeRealpath(ctx.repoRoot);
  const ownerTree = record.execution_worktree === null ? null : safeRealpath(record.execution_worktree);
  const branch = currentBranch(ctx.repoRoot);
  if (ownerTree !== currentTree || record.branch === null || record.branch !== branch) {
    return refuse(
      'lease_owner_tree_mismatch',
      `Claim ${held.claim_id} is bound to worktree ${record.execution_worktree ?? '(none)'} on branch ${record.branch ?? '(none)'}, but this edit runs in ${currentTree} on branch ${branch ?? '(detached)'}.`,
      'Edit from the worktree and branch the lease names, or rebind the claim to this tree with repo-harness sprint bind.',
    );
  }

  // ---- step 5: the definition has not drifted ----------------------------
  if (record.task_revision !== canonical.task_revision) {
    return refuse(
      'lease_task_revision_drifted',
      `Claim ${held.claim_id} holds task revision ${record.task_revision}, but canonical ${collection.canonical_target.ref} now defines ${canonical.task_revision}; the row's definition changed underneath this claim.`,
      `Re-read the canonical row and reconcile with repo-harness sprint reconcile --task-id ${held.task_id} --target-ref ${collection.canonical_target.ref} before continuing.`,
    );
  }

  return { kind: 'pass' };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ownership precedes scope: this runs before the Effective State resolution
 * because an agent editing under a lease it no longer holds should learn that
 * first, not after a contract-scope verdict that assumes the claim is valid.
 */
function leaseOwnershipGuard(ctx: Ctx, filePath: string): void {
  ctx.leaseOwnership ??= computeLeaseOwnership(ctx);
  const decision = ctx.leaseOwnership;
  if (decision.kind === 'pass') return;
  out(ctx, `[LeaseOwnershipGuard] ${decision.token}: ${filePath}`);
  structuredError(
    ctx,
    'LeaseOwnershipGuard',
    decision.reason,
    decision.fix,
    'contract_failure',
    'advisory',
  );
}

// ---------------------------------------------------------------------------
// worktree-guard.sh port
// ---------------------------------------------------------------------------

function resolveGitDir(repoRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// pre-edit-guard.sh port: per-path guard pipeline
// ---------------------------------------------------------------------------

const TDD_EXCLUSION_PATTERNS: readonly RegExp[] = [
  /\.config\./,
  /\.d\.ts$/,
  /types\.ts$/,
  /constants\./,
  /\.test\./,
  /\.spec\./,
  /__tests__/,
  /__mocks__/,
  /\.stories\./,
];

const ASSET_LAYER_PATTERN = /(^|\/)(interfaces|tests)(\/|$)|(^|\/)docs\/spec\.md$|(^|\/)specs\/|(^|\/)tasks\/contracts\/|(\.contract\.|\.spec\.)/;

function runPerPathGuards(
  ctx: Ctx,
  filePath: string,
  allTargetPaths: readonly string[],
  _writePayload: string,
): void {
  if (isRepoScopedPath(filePath) && canonicalRepoRelativePath(ctx.repoRoot, filePath) !== filePath) {
    out(ctx, `[RepoScopeGuard] Unsafe or out-of-repository target: ${filePath}`);
    structuredError(
      ctx,
      'RepoScopeGuard',
      `${filePath} is not a canonical path contained by the current repository.`,
      'Use a canonical repository-relative path without traversal or symlink escape.',
      'state_violation',
    );
    exit(2);
  }

  if (filePath.startsWith('_ref/')) {
    out(ctx, `[ExternalReferenceGuard] ${filePath} is under _ref/.`);
    structuredError(
      ctx,
      'ExternalReferenceGuard',
      '_ref/ is external comparison material and is not a product edit surface.',
      'Refresh _ref/ from upstream sources when needed, keep it ignored, and do not edit it as repo implementation.',
      'state_violation',
    );
    exit(2);
  }

  if (filePath.startsWith('_ops/')) {
    out(ctx, `[OpsPrivateGuard] ${filePath} is under ignored private operations state.`);
    structuredError(
      ctx,
      'OpsPrivateGuard',
      '_ops/ is local private operations state for secrets, real env files, provider state, artifacts, logs, and scratch files.',
      'Commit deploy/ runbooks, release checklists, scripts, submissions, and env examples; do not write _ops/* through agent edits.',
      'state_violation',
    );
    exit(2);
  }

  if (filePath.startsWith('deploy/')) {
    out(ctx, `[DeployAsset] Deployment operations asset detected: ${filePath}`);
    out(ctx, '  deploy/ is trackable for runbooks, submission materials, release checklists, scripts, ordered SQL, and env examples.');
    out(ctx, '  Follow operations.deploy_sql in .ai/harness/policy.json when configured; otherwise keep SQL directly under deploy/sql/ with 4-digit ascending prefixes.');
  }

  leaseOwnershipGuard(ctx, filePath);

  // Workflow artifacts are observations, never edit permissions.
  let effective: EffectiveState | null = null;
  try {
    effective = ctx.collector.getPreEditEffectiveState(allTargetPaths);
  } catch (error) {
    out(ctx, `[WorkflowObservation] State unavailable: ${describeError(error)}; edit may continue.`);
  }
  ctx.resolvedProfileHint = effective?.workflow_profile ?? null;
  const activeContract = effective?.contract?.path;
  if (activeContract && !contractAllowsPath(activeContract, effective!.allowed_paths, filePath)) {
    out(ctx, `[ContractScopeGuard] Advisory: ${filePath} is outside ${activeContract}; include the scope deviation in the PR.`);
  }
  if (effective?.blockers.length) {
    out(ctx, `[WorkflowObservation] ${effective.blockers.join(', ')}; edit may continue.`);
  }

  // ---- AssetLayer advisory --------------------------------------------------
  if (ASSET_LAYER_PATTERN.test(filePath)) {
    out(ctx, `[AssetLayer] Immutable file detected: ${filePath}`);
    out(ctx, '  Asset-layer file changed; regenerate the downstream projection.');
  }

  // ---- TDD/BDD reminder ------------------------------------------------------
  // Out-of-repo absolute paths (normalizeFilePath's documented fallthrough)
  // are exempt like every other repo-scoped gate above: their test siblings
  // would be read through collect-state-inputs' repoPath sandbox, which
  // throws "unsafe state source path escapes repository" and crashed the
  // whole hook for a mere advisory reminder.
  if (!isRepoScopedPath(filePath)) return;
  if (!/\.(ts|tsx|js|jsx|py)$/.test(filePath)) return;
  if (TDD_EXCLUSION_PATTERNS.some((pattern) => pattern.test(filePath))) return;
  if (/(^|\/)index\.(ts|tsx|js|jsx)$/.test(filePath) && isPureBarrelFile(ctx.repoRoot, filePath)) return;

  if (!tddCandidateExists(ctx.repoRoot, filePath)) {
    if (/\.(tsx|jsx)$/.test(filePath)) {
      out(ctx, `[BDD Guard] No scenario test found for ${basename(filePath)}`);
      out(ctx, '  UI component detected: define Given-When-Then acceptance scenarios first.');
    } else {
      out(ctx, `[TDD Guard] No test file found for ${basename(filePath)}`);
      out(ctx, '  Reminder: write a failing test first, then implement.');
    }
  }
}

function applyPatchScopeGuard(ctx: Ctx): never {
  structuredError(
    ctx,
    'ApplyPatchScopeGuard',
    'Codex apply_patch input did not expose a parseable target path.',
    'Use a standard *** Add/Update/Delete File patch header so every target can be checked before the write.',
    'state_violation',
  );
  exit(2);
}

function isLinkedWorktree(repoRoot: string): boolean {
  return resolveGitDir(repoRoot).includes('.git/worktrees/');
}

// ---------------------------------------------------------------------------
// TDD/BDD candidate + barrel-file detection
// ---------------------------------------------------------------------------

function isPureBarrelFile(repoRoot: string, filePath: string): boolean {
  const content = readText(repoRoot, filePath);
  if (content === null) return false;
  let sawExport = false;
  for (let rawLine of content.split('\n')) {
    let line = rawLine.replace(/\r$/, '').trim();
    if (line === '') continue;
    if (line.startsWith('//')) continue;
    if (line.startsWith('/*')) continue;
    if (line.startsWith('*')) continue;
    if (line === '*/') continue;
    if (/^export(\s+type)?\s/.test(line)) {
      sawExport = true;
      continue;
    }
    return false;
  }
  return sawExport;
}

function tddCandidateExists(repoRoot: string, filePath: string): boolean {
  const lastSlash = filePath.lastIndexOf('/');
  const dir = lastSlash === -1 ? '.' : filePath.slice(0, lastSlash);
  const base = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
  const lastDot = base.lastIndexOf('.');
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1);
  const name = lastDot === -1 ? base : base.slice(0, lastDot);
  const srcToTestsDir = dir.replace('/src/', '/tests/');

  const candidates = [
    `${dir}/${name}.test.${ext}`,
    `${dir}/__tests__/${name}.test.${ext}`,
    `${srcToTestsDir}/${name}.test.${ext}`,
  ];
  return candidates.some((candidate) => fileExists(repoRoot, candidate));
}

// ---------------------------------------------------------------------------
// Path classification helpers
// ---------------------------------------------------------------------------

function isRepoScopedPath(filePath: string): boolean {
  return filePath.length > 0 && !isAbsolutePathInAnyGrammar(filePath);
}

function isAbsolutePathInAnyGrammar(filePath: string): boolean {
  return posix.isAbsolute(filePath)
    || win32.isAbsolute(filePath)
    || /^[A-Za-z]:/.test(filePath);
}

function normalizeFilePath(repoRoot: string, raw: string): string {
  return canonicalRepoRelativePath(repoRoot, raw) ?? raw;
}

// ---------------------------------------------------------------------------
// apply_patch parsing (hook_get_apply_patch_paths port)
// ---------------------------------------------------------------------------

const APPLY_PATCH_FILE_LINE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/;
const APPLY_PATCH_MOVE_LINE = /^\*\*\* Move to: (.+)$/;

function extractApplyPatchPaths(repoRoot: string, command: string): readonly string[] {
  const paths: string[] = [];
  for (const line of command.split('\n')) {
    const fileMatch = APPLY_PATCH_FILE_LINE.exec(line);
    const moveMatch = fileMatch ? null : APPLY_PATCH_MOVE_LINE.exec(line);
    const raw = fileMatch?.[1] ?? moveMatch?.[1];
    if (raw) paths.push(normalizeFilePath(repoRoot, raw));
  }
  return paths;
}

// ---------------------------------------------------------------------------
// JSON payload helpers (hook_get_file_path / hook_get_write_payload port)
// ---------------------------------------------------------------------------

function parsePayload(input: string | Buffer | undefined): unknown {
  if (input === undefined) return {};
  const text = input.toString().trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function stringAt(payload: unknown, path: readonly string[]): string {
  let current: unknown = payload;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : '';
}

function firstNonEmpty(values: readonly string[]): string {
  return values.find((value) => value.length > 0) ?? '';
}

// ---------------------------------------------------------------------------
// Policy reads (workflow_policy_get port; JSON field access only, no validation)
// ---------------------------------------------------------------------------

function policyGet(repoRoot: string, path: readonly string[], fallback: string): string {
  const raw = readText(repoRoot, '.ai/harness/policy.json');
  if (!raw) return fallback;
  try {
    let current: unknown = JSON.parse(raw);
    for (const segment of path) {
      if (current === null || typeof current !== 'object') return fallback;
      current = (current as Record<string, unknown>)[segment];
    }
    return typeof current === 'string' && current.length > 0 ? current : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// hook_structured_error port: message text + failure log + circuit breaker
// ---------------------------------------------------------------------------

type FailureClass = 'missing_artifact' | 'state_violation' | 'contract_failure' | 'quality_gate';

const STRONG_BOUNDARY_GUARDS = new Set([
  'ContractScopeGuard',
  'OpsPrivateGuard',
  'ExternalReferenceGuard',
  'StrictWorktreeGuard',
  'MainLoopDispatchGuard',
]);

const DEFAULT_FAILURE_LOG_FILE = '.ai/harness/failures/latest.jsonl';
const EFFECTIVE_STATE_CACHE_FILE = '.ai/harness/state/effective.json';

/**
 * `workflow_repo_relative_path()` port (gate round-1 parity closure):
 * rejects an override that is empty, absolute, carries a newline/CR, or
 * escapes via `..`; when `allowedPrefix` is set the override must also stay
 * under it. Any rejection silently falls back to `defaultValue` -- matching
 * bash's own silent-fallback shape (no warning, no error either side).
 */
function repoRelativePath(value: string, defaultValue: string, allowedPrefix: string): string {
  if (!value || value.startsWith('/') || value.includes('\n') || value.includes('\r')) return defaultValue;
  if (value === '..' || value.startsWith('../') || value.endsWith('/..') || value.includes('/../')) {
    return defaultValue;
  }
  if (allowedPrefix && !value.startsWith(allowedPrefix)) return defaultValue;
  return value;
}

/**
 * `workflow_failure_log_file()` port (gate round-1 parity closure: this was
 * previously left hardcoded -- see git history for the superseded comment).
 * Verified against base SHA `c6504231` before porting: `pre-edit-guard.sh`
 * sources `lib/workflow-state.sh`
 * (`git show c6504231:assets/hooks/pre-edit-guard.sh` lines 8-12), so
 * `hook_structured_error`'s `hook_failure_log_file()` call resolved through
 * the real `workflow_failure_log_file()` -- which DOES honor policy
 * `.harness.failure_log_file` (`git show
 * c6504231:assets/hooks/lib/workflow-state.sh` lines 77-79, validated by
 * `workflow_repo_relative_path` at lines 49-70) -- for every guard ported
 * from `pre-edit-guard.sh` into this handler. `worktree-guard.sh` never
 * sourced that lib (only `hook-input.sh`), so its own `hook_structured_error`
 * call (`git show c6504231:assets/hooks/worktree-guard.sh` line 29) fell
 * back to the hardcoded default via `hook_failure_log_file()`'s
 * `declare -F workflow_failure_log_file` guard failing -- an artifact of
 * that script's narrower sourcing, not a deliberate opt-out from the
 * override. This merged handler resolves the override the same way for
 * every guard rather than reproducing that bash file-layout accident.
 */
function failureLogFile(repoRoot: string): string {
  const override = policyGet(repoRoot, ['harness', 'failure_log_file'], DEFAULT_FAILURE_LOG_FILE);
  return repoRelativePath(override, DEFAULT_FAILURE_LOG_FILE, '.ai/harness/');
}

function appendFailureRecord(
  repoRoot: string,
  guard: string,
  action: string,
  reason: string,
  fix: string,
  failureClass: FailureClass,
  runId: string,
): void {
  const target = join(repoRoot, failureLogFile(repoRoot));
  mkdirSync(dirname(target), { recursive: true });
  const record = {
    ts: formatIsoWithNumericOffset(new Date()),
    guard,
    action,
    reason,
    fix,
    failure_class: failureClass,
    run_id: runId,
  };
  appendFileSync(target, `${JSON.stringify(record)}\n`);
}

function readEffectiveStateCache(repoRoot: string): Record<string, unknown> | null {
  const raw = readText(repoRoot, EFFECTIVE_STATE_CACHE_FILE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Mirrors bash `date '+%Y-%m-%dT%H:%M:%S%z'` (offset with no colon, e.g. +0800). */
function formatIsoWithNumericOffset(date: Date): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  const offsetMinutesTotal = -date.getTimezoneOffset();
  const offsetSign = offsetMinutesTotal >= 0 ? '+' : '-';
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutesTotal) / 60));
  const offsetMinutes = pad(Math.abs(offsetMinutesTotal) % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${offsetSign}${offsetHours}${offsetMinutes}`
  );
}

function structuredError(
  ctx: Ctx,
  guard: string,
  reason: string,
  fix: string,
  failureClass: FailureClass,
  action: 'block' | 'warn' | 'advisory' = 'block',
): void {
  const runId = getRunId(ctx);
  const strongBoundary = STRONG_BOUNDARY_GUARDS.has(guard)
    || guard.includes('Security')
    || guard.includes('Secret')
    || guard.includes('Destructive');

  let profile = ctx.resolvedProfileHint ?? '';
  let progressToken = 'unknown';
  const cache = readEffectiveStateCache(ctx.repoRoot);
  if (cache) {
    progressToken = typeof cache.progress_token === 'string' ? cache.progress_token : 'unknown';
    if (!profile && typeof cache.workflow_profile === 'string') profile = cache.workflow_profile;
  }
  const normalizedProfile: WorkflowProfile =
    profile === 'routine' || profile === 'high' ? profile : 'high';

  const attempt: CircuitAttempt = {
    kind: 'guard',
    guard,
    reason,
    pathOrAction: fix,
    progressToken,
    fingerprint: `${guard}|${reason}|${fix}`,
    profile: normalizedProfile,
    explicitHighRiskContract: false,
    riskTriggeredConsult: false,
    userRequestedConsult: false,
    strongBoundary,
  };

  let circuitOutput: ReturnType<typeof recordCircuitAttempt> | null = null;
  try {
    circuitOutput = recordCircuitAttempt(ctx.repoRoot, attempt);
  } catch {
    // A circuit-record failure must never itself block (mirrors bash's `|| true`).
  }

  appendFailureRecord(ctx.repoRoot, guard, action, reason, fix, failureClass, runId);

  if (circuitOutput?.tripped) {
    outRaw(ctx, `${JSON.stringify(circuitOutput)}\n`);
    return;
  }

  if (action === 'block') {
    err(ctx, `[${guard}] ${reason}`);
    if (fix) err(ctx, `  Fix: ${fix}`);
  }

  outRaw(ctx, `${JSON.stringify({
    guard,
    action,
    reason,
    fix,
    failure_class: failureClass,
    run_id: runId,
  })}\n`);
}

// ---------------------------------------------------------------------------
// hook_get_run_id port
// ---------------------------------------------------------------------------

function getRunId(ctx: Ctx): string {
  if (ctx.runId) return ctx.runId;

  if (ctx.env.HOOK_RUN_ID) {
    ctx.runId = ctx.env.HOOK_RUN_ID;
    return ctx.runId;
  }

  const payloadRunId = firstNonEmpty([stringAt(ctx.payload, ['run_id']), stringAt(ctx.payload, ['tool_input', 'run_id'])]);
  if (payloadRunId) {
    ctx.runId = payloadRunId;
    return ctx.runId;
  }

  if (ctx.env.CLAUDE_RUN_ID || ctx.env.CODEX_RUN_ID) {
    ctx.runId = (ctx.env.CLAUDE_RUN_ID || ctx.env.CODEX_RUN_ID) as string;
    return ctx.runId;
  }

  const sessionId = getSessionId(ctx);
  if (sessionId) {
    const source = getSessionSource(ctx);
    ctx.runId = `run-${sanitizeToken(source || 'session')}-${sanitizeToken(sessionId)}`;
    return ctx.runId;
  }

  const transcriptPath = getTranscriptPath(ctx);
  if (transcriptPath) {
    ctx.runId = `run-transcript-${sanitizeToken(transcriptPath)}`;
    return ctx.runId;
  }

  ctx.runId = `run-${formatDateStamp(new Date())}-${process.pid}`;
  return ctx.runId;
}

function getSessionId(ctx: Ctx): string {
  if (ctx.env.HOOK_SESSION_ID) return ctx.env.HOOK_SESSION_ID;
  const payloadValue = stringAt(ctx.payload, ['session_id']);
  if (payloadValue) return payloadValue;
  return ctx.env.CLAUDE_SESSION_ID || ctx.env.CODEX_SESSION_ID || '';
}

function getSessionSource(ctx: Ctx): string {
  const payloadValue = stringAt(ctx.payload, ['source']);
  if (payloadValue) return payloadValue;
  return ctx.env.CLAUDE_SESSION_SOURCE || '';
}

function getTranscriptPath(ctx: Ctx): string {
  const payloadValue = stringAt(ctx.payload, ['transcript_path']);
  if (payloadValue) return payloadValue;
  return ctx.env.CLAUDE_TRANSCRIPT_PATH || ctx.env.CODEX_TRANSCRIPT_PATH || '';
}

function sanitizeToken(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .replace(/-{2,}/g, '-');
  return sanitized || 'unknown';
}

function formatDateStamp(date: Date): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}
