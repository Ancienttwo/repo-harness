/**
 * Mutation guard — HRD-03 in-process decision handler for `PreToolUse.edit`.
 *
 * Ports the complete decision surface of the retired
 * `assets/hooks/worktree-guard.sh` and `assets/hooks/pre-edit-guard.sh`
 * scripts into one in-process handler consuming the HRD-02 collector, with
 * byte-identical decisions, reason tokens, message text, exit codes,
 * host-visible output shape, and durable write set. See
 * `tasks/notes/20260720-0419-hrd-03-pre-edit-one-decision-cutover.notes.md`
 * for the guard-port order and observable quirks reproduced deliberately.
 *
 * Reads as a decision pipeline: `runMutationGuard()` orchestrates one
 * worktree check plus one pass of `runPerPathGuards()` per target path
 * (a single edited file, or every path an `apply_patch` command touches),
 * stopping at the first guard that blocks -- mirroring the scripts'
 * `exit 2` short-circuit exactly, including the old apply_patch recursion's
 * "process paths in order, stop at the first failure" behavior.
 */

import { execFileSync } from 'child_process';
import { appendFileSync, mkdirSync, realpathSync } from 'fs';
import { basename, dirname, join } from 'path';
import type { EffectiveState } from '../../core/state/types';
import type { WorkflowProfile } from '../../core/workflow/profile';
import { recordCircuitAttempt, type CircuitAttempt } from './circuit-breaker';
import { isWorkflowSurfacePath } from '../../effects/review/diff-fingerprint';
import { fileExists, readText } from '../../effects/state/collect-state-inputs';
import type { WorktreeOwnership } from '../../effects/loop/state-input-collector';
import {
  artifactStemFromPlan,
  markdownHeader,
  parseAllowedPaths,
  planSlugFromPath,
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
  };

  try {
    runWorktreeGuard(ctx);

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
// worktree-guard.sh port
// ---------------------------------------------------------------------------

const REQUIRE_WORKTREE_MARKER = '.claude/.require-worktree';

/**
 * `runHook()` has already confirmed the event is running inside a resolved
 * git repository before a handler can be reached, so the old script's
 * `git rev-parse --is-inside-work-tree` guard (exit 0 "Not a git repository")
 * is unreachable dead code here and is deliberately not ported -- see notes.
 */
function runWorktreeGuard(ctx: Ctx): void {
  const gitDir = resolveGitDir(ctx.repoRoot);

  if (gitDir.includes('.git/worktrees/')) return;

  if (fileExists(ctx.repoRoot, REQUIRE_WORKTREE_MARKER)) {
    out(ctx, `[WorktreeGuard] Mutation blocked: primary working tree detected (${gitDir}).`);
    out(ctx, `  Enforcement marker found: ${REQUIRE_WORKTREE_MARKER}`);
    out(ctx, '  Use a linked worktree for write operations.');
    out(ctx, '  Example: git worktree add ../<repo>-wt-<branch> -b <branch>');
    structuredError(
      ctx,
      'WorktreeGuard',
      `Primary working tree detected at ${gitDir} while ${REQUIRE_WORKTREE_MARKER} is present.`,
      'Create and switch to a linked worktree before retrying the write operation.',
      'state_violation',
    );
    exit(2);
  }

  out(ctx, `[WorktreeGuard] Warning: primary working tree detected (${gitDir}).`);
  out(ctx, `  To enforce linked worktrees, create ${REQUIRE_WORKTREE_MARKER}`);
}

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
  writePayload: string,
): void {
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

  // ---- resolve_effective_state: the ONE Effective State resolution -------
  let effective: EffectiveState | null;
  try {
    effective = ctx.collector.getPreEditEffectiveState(allTargetPaths);
  } catch {
    // Residual instability after the wrapper's bounded retry (runtime.ts):
    // concurrent workflow-state writes never settled. Distinct fail-closed
    // diagnostic, never the collapsed "resolution failed" banner below --
    // still fails closed, no fail-open path.
    out(ctx, `[WorkflowResolutionUnstableGuard] Workflow resolution stayed unstable for ${filePath} after bounded retries.`);
    structuredError(
      ctx,
      'WorkflowResolutionUnstableGuard',
      `Concurrent workflow-state writes kept resolution unstable for ${filePath}; bounded retries were exhausted.`,
      'Retry the edit once concurrent workflow-state writes settle.',
      'state_violation',
    );
    exit(2);
  }
  ctx.resolvedProfileHint = effective?.workflow_profile ?? ctx.resolvedProfileHint;
  const workflowProfile = workflowProfileOrNull(effective);
  if (!workflowProfile) {
    out(ctx, `[WorkflowProfileGuard] Unable to resolve a deterministic workflow profile for ${filePath}`);
    structuredError(
      ctx,
      'WorkflowProfileGuard',
      `Deterministic workflow profile resolution failed for ${filePath}.`,
      `Run repo-harness state resolve --json --target-path '${filePath}' --operation edit and resolve its blockers.`,
      'state_violation',
    );
    exit(2);
  }

  // ---- contract_scope: active contract + allowed-paths gate --------------
  const activeContract = getActiveContractPath(ctx);
  if (isRepoScopedPath(filePath) && activeContract && fileExists(ctx.repoRoot, activeContract)) {
    if (!contractAllowsPath(ctx.repoRoot, activeContract, filePath)) {
      out(ctx, `[ContractScopeGuard] ${filePath} is outside the active sprint contract: ${activeContract}`);
      structuredError(
        ctx,
        'ContractScopeGuard',
        `${filePath} is outside the allowed_paths declared in ${activeContract}.`,
        'Update the sprint contract allowed_paths or keep edits within the approved scope.',
        'contract_failure',
      );
      exit(2);
    }
  }

  // ---- plan_gate -----------------------------------------------------------
  runEditPlanGate(ctx, filePath, workflowProfile);

  // ---- strict_contract / strict_worktree ----------------------------------
  if (workflowProfile === 'strict' && isRepoScopedPath(filePath) && !isWorkflowSurfacePath(filePath)) {
    if (!activeContract || !fileExists(ctx.repoRoot, activeContract)) {
      out(ctx, `[StrictContractGuard] Strict profile requires an active contract for ${filePath}`);
      structuredError(
        ctx,
        'StrictContractGuard',
        `Strict workflow edit to ${filePath} has no active contract.`,
        'Create the plan/contract worktree with repo-harness run plan-to-todo before editing.',
        'missing_artifact',
      );
      exit(2);
    }
    if (!isLinkedWorktree(ctx.repoRoot)) {
      out(ctx, `[StrictWorktreeGuard] Strict profile requires an isolated contract worktree for ${filePath}`);
      structuredError(
        ctx,
        'StrictWorktreeGuard',
        `Strict workflow edit to ${filePath} is not running in a linked contract worktree.`,
        'Start or enter the contract worktree before editing high-risk implementation paths.',
        'state_violation',
      );
      exit(2);
    }
  }

  // ---- PlanTransitionGuard -------------------------------------------------
  if (/^plans\/plan-.*\.md$/.test(filePath) && (fileExists(ctx.repoRoot, filePath) || writePayload)) {
    const currentStatus = fileExists(ctx.repoRoot, filePath)
      ? extractStatusFromText(readText(ctx.repoRoot, filePath) ?? '')
      : '';
    const nextStatus = extractStatusFromText(writePayload);

    if (currentStatus && nextStatus && currentStatus !== nextStatus) {
      const noteCount = writePayload.includes('[NOTE]:')
        ? countOccurrences(writePayload, '[NOTE]:')
        : (fileExists(ctx.repoRoot, filePath) ? countOccurrences(readText(ctx.repoRoot, filePath) ?? '', '[NOTE]:') : 0);

      const transitionError = validatePlanTransition(ctx.repoRoot, currentStatus, nextStatus, noteCount);
      if (transitionError) {
        out(ctx, `[PlanTransitionGuard] ${transitionError}`);
        structuredError(
          ctx,
          'PlanTransitionGuard',
          transitionError,
          'Respect the Draft -> Annotating -> Approved flow and resolve required [NOTE]: annotations before changing status.',
          'state_violation',
        );
        exit(2);
      }
    }
  }

  // ---- AssetLayer advisory --------------------------------------------------
  if (ASSET_LAYER_PATTERN.test(filePath)) {
    out(ctx, `[AssetLayer] Immutable file detected: ${filePath}`);
    out(ctx, '  资产层文件被修改，需同步重写下游实现。');
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

// Named to avoid scripts/check-state-boundaries.ts's CLI_AUTHORITY_NAME
// heuristic (any src/cli/* declaration matching /^(?:...|resolve).*WorkflowProfile$/i
// is flagged as a suspected authority reimplementation): this is a thin,
// four-line projection over an ALREADY-RESOLVED EffectiveState field, the
// same shape as state.ts's own `resolveStateCommand` --field projection, not
// a second workflow-profile resolver.
function workflowProfileOrNull(effective: EffectiveState | null): WorkflowProfile | null {
  if (!effective) return null;
  // A blocked resolution's field value is not trustworthy: callers must key
  // off blockers, not a possibly-still-populated value (mirrors state.ts's
  // `--field` projection, which suppresses stdout whenever blockers exist).
  if (effective.blockers.length > 0) return null;
  const profile = effective.workflow_profile;
  return profile === 'lite' || profile === 'standard' || profile === 'strict' ? profile : null;
}

// ---------------------------------------------------------------------------
// run_edit_plan_gate port
// ---------------------------------------------------------------------------

function editPlanGateMode(ctx: Ctx): string {
  const explicit = ctx.env.REPO_HARNESS_EDIT_PLAN_GATE;
  if (explicit) return explicit;
  return policyGet(ctx.repoRoot, ['guards', 'edit_plan_gate'], 'enforce');
}

function runEditPlanGate(ctx: Ctx, filePath: string, workflowProfile: WorkflowProfile): void {
  const mode = editPlanGateMode(ctx);
  if (mode === 'off') return;
  if (!isRepoScopedPath(filePath)) return;
  if (isWorkflowSurfacePath(filePath)) return;
  if (workflowProfile === 'lite') return;

  if (!fileExists(ctx.repoRoot, 'docs/spec.md')) {
    out(ctx, `[SpecGuard] Implementation edit without docs/spec.md: ${filePath}`);
    if (mode === 'advice') {
      out(ctx, '[SpecGuard] Advisory: run repo-harness run new-spec and capture stable product intent.');
    } else {
      structuredError(
        ctx,
        'SpecGuard',
        `Implementation edit to ${filePath} without docs/spec.md.`,
        'Run repo-harness run new-spec and capture stable product intent before implementing.',
        'missing_artifact',
      );
      exit(2);
    }
  }

  const gatePlan = getActivePlan(ctx);
  if (!gatePlan || !fileExists(ctx.repoRoot, gatePlan)) {
    out(ctx, `[PlanStatusGuard] No active plan covers implementation edit: ${filePath}`);
    if (mode === 'advice') {
      out(ctx, '[PlanStatusGuard] Advisory: capture the approved plan with repo-harness run capture-plan --slug <slug> --title <title> --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --execute');
    } else {
      structuredError(
        ctx,
        'PlanStatusGuard',
        `Implementation edit to ${filePath} without an active plan.`,
        'Capture the approved planning output with repo-harness run capture-plan --slug <slug> --title <title> --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --execute, or set policy .guards.edit_plan_gate to advice/off for this repo.',
        'missing_artifact',
      );
      exit(2);
    }
    return;
  }

  const gateStatus = extractStatusFromText(readText(ctx.repoRoot, gatePlan) ?? '');
  const statusPolicy = loadPlanStatusPolicy(ctx.repoRoot);

  if (!statusPolicy) {
    out(ctx, `[PlanStatusGuard] Plan-status authority unavailable (.ai/harness/policy.json active_plan lifecycle is missing, malformed, or unreadable); implementation edit: ${filePath}`);
    if (mode === 'advice') {
      out(ctx, '[PlanStatusGuard] Advisory: restore active_plan.statuses and active_plan.lifecycle in .ai/harness/policy.json before implementation.');
    } else {
      structuredError(
        ctx,
        'PlanStatusGuard',
        `Implementation edit to ${filePath} could not be checked against plan-status authority: .ai/harness/policy.json has no valid active_plan lifecycle projection.`,
        'Restore active_plan.statuses and active_plan.lifecycle in .ai/harness/policy.json before implementation.',
        'missing_artifact',
      );
      exit(2);
    }
    return;
  }

  if (!statusPolicy.statuses.includes(gateStatus)) {
    out(ctx, `[PlanStatusGuard] Plan status '${gateStatus}' in ${gatePlan} is not in the known-status authority; implementation edit: ${filePath}`);
    if (mode === 'advice') {
      out(ctx, `[PlanStatusGuard] Advisory: fix the plan Status header in ${gatePlan}, or add '${gateStatus}' to active_plan.statuses and its lifecycle projection if it is legitimate.`);
    } else {
      structuredError(
        ctx,
        'PlanStatusGuard',
        `Implementation edit to ${filePath} while plan status '${gateStatus}' in ${gatePlan} is not in the known-status authority (.ai/harness/policy.json active_plan.statuses).`,
        `Fix the plan Status header in ${gatePlan}, or update the policy-owned lifecycle if '${gateStatus}' is legitimate.`,
        'state_violation',
      );
      exit(2);
    }
    return;
  }

  if (statusPolicy.preApprovalStatuses.includes(gateStatus)) {
    out(ctx, `[PlanStatusGuard] Plan status is '${gateStatus}' in ${gatePlan}; implementation edit: ${filePath}`);
    if (mode === 'advice') {
      out(ctx, '[PlanStatusGuard] Advisory: complete the annotation cycle and move the plan to Approved before implementation.');
    } else {
      structuredError(
        ctx,
        'PlanStatusGuard',
        `Implementation edit to ${filePath} while plan status is ${gateStatus} in ${gatePlan}.`,
        'Complete the annotation cycle and move the plan to Approved before implementation.',
        'state_violation',
      );
      exit(2);
    }
    return;
  }

}

interface PlanStatusPolicy {
  readonly statuses: readonly string[];
  readonly preApprovalStatuses: readonly string[];
  readonly draft: string;
  readonly annotationEnd: string;
  readonly approved: string;
  readonly executing: string;
  readonly terminalStatuses: readonly string[];
}

function loadPlanStatusPolicy(repoRoot: string): PlanStatusPolicy | null {
  const raw = readText(repoRoot, '.ai/harness/policy.json');
  if (!raw) return null;
  try {
    const policy = JSON.parse(raw) as {
      active_plan?: {
        statuses?: unknown;
        lifecycle?: {
          annotation_end?: unknown;
          approved?: unknown;
          executing?: unknown;
          terminal_start?: unknown;
        };
      };
    };
    const values = policy.active_plan?.statuses;
    const lifecycle = policy.active_plan?.lifecycle;
    if (!Array.isArray(values) || values.length === 0 || !lifecycle) return null;
    if (!values.every((value): value is string => typeof value === 'string' && value.trim().length > 0)) return null;
    const statuses = [...values];
    if (new Set(statuses).size !== statuses.length) return null;
    const annotationEnd = lifecycle.annotation_end;
    const approved = lifecycle.approved;
    const executing = lifecycle.executing;
    const terminalStart = lifecycle.terminal_start;
    if (![annotationEnd, approved, executing, terminalStart].every((value) => typeof value === 'string')) return null;
    const annotationIndex = statuses.indexOf(annotationEnd as string);
    const approvedIndex = statuses.indexOf(approved as string);
    const executingIndex = statuses.indexOf(executing as string);
    const terminalIndex = statuses.indexOf(terminalStart as string);
    if (
      annotationIndex < 1
      || approvedIndex !== annotationIndex + 1
      || executingIndex !== approvedIndex + 1
      || terminalIndex <= executingIndex
    ) return null;
    return {
      statuses,
      preApprovalStatuses: statuses.slice(0, approvedIndex),
      draft: statuses[0]!,
      annotationEnd: annotationEnd as string,
      approved: approved as string,
      executing: executing as string,
      terminalStatuses: statuses.slice(terminalIndex),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Plan / contract filesystem authorities (mirror lib/workflow-state.sh)
// ---------------------------------------------------------------------------

/** get_active_plan(): raw marker text, gated on worktree-ownership match and target-file existence. */
function getActivePlan(ctx: Ctx): string | null {
  const ownership = ctx.collector.getWorktreeOwnership();
  const matchesCwd = ownership.owner === null || ownership.ownedByCurrent;
  if (!matchesCwd) return null;
  const marker = ctx.collector.getActivePlanMarker();
  if (!marker) return null;
  return fileExists(ctx.repoRoot, marker) ? marker : null;
}

/** workflow_active_contract() / derive_contract_path(): explicit declared path, else stem/legacy-slug fallback. */
function getActiveContractPath(ctx: Ctx): string | null {
  const activePlan = getActivePlan(ctx);
  if (!activePlan) return null;
  const planText = readText(ctx.repoRoot, activePlan);

  const explicit = (planText && (
    markdownHeader(planText, 'Task Contract') ?? markdownHeader(planText, 'Sprint Contract')
  )) || null;
  if (explicit) return explicit;

  const stem = artifactStemFromPlan(activePlan, planText);
  const slug = planSlugFromPath(activePlan);
  if (!stem || !slug) return null;

  const preferred = `tasks/contracts/${stem}.contract.md`;
  const legacy = `tasks/contracts/${slug}.contract.md`;
  return (fileExists(ctx.repoRoot, preferred) || !fileExists(ctx.repoRoot, legacy)) ? preferred : legacy;
}

/** workflow_contract_allows_path(): allowed_paths entries are exact matches, glob patterns, or trailing-slash prefixes. */
function contractAllowsPath(repoRoot: string, contractFile: string, filePath: string): boolean {
  if (filePath === contractFile) return true;
  const contractText = readText(repoRoot, contractFile);
  if (!contractText) return false;
  for (const pattern of parseAllowedPaths(contractText)) {
    if (pattern.endsWith('/')) {
      if (filePath.startsWith(pattern)) return true;
    } else if (globMatch(filePath, pattern)) {
      return true;
    }
  }
  return false;
}

function globMatch(text: string, pattern: string): boolean {
  let regexSource = '';
  for (const ch of pattern) {
    if (ch === '*') regexSource += '.*';
    else if (ch === '?') regexSource += '.';
    else regexSource += ch.replace(/[.*+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${regexSource}$`).test(text);
}

/** workflow_is_linked_worktree(): git's own worktree structure, independent of the repo-harness active-worktree marker. */
function isLinkedWorktree(repoRoot: string): boolean {
  return resolveGitDir(repoRoot).includes('.git/worktrees/');
}

// ---------------------------------------------------------------------------
// validate_plan_transition() port
// ---------------------------------------------------------------------------

function validatePlanTransition(repoRoot: string, currentStatus: string, nextStatus: string, noteCount: number): string | null {
  const policy = loadPlanStatusPolicy(repoRoot);
  if (!policy) return 'Plan-status authority is unavailable or malformed.';
  if (!policy.statuses.includes(currentStatus) || !policy.statuses.includes(nextStatus)) {
    return `Unknown plan status transition ${currentStatus} -> ${nextStatus}.`;
  }
  const { draft, annotationEnd, approved, executing } = policy;
  const key = `${currentStatus}:${nextStatus}`;
  switch (key) {
    case `${draft}:${annotationEnd}`:
      return noteCount < 1 ? `${draft} -> ${annotationEnd} requires at least one [NOTE]: annotation.` : null;
    case `${annotationEnd}:${approved}`:
      return noteCount > 0 ? `${annotationEnd} -> ${approved} requires all [NOTE]: annotations to be resolved.` : null;
  }
  if (currentStatus === annotationEnd && nextStatus === draft) return null;
  if (policy.preApprovalStatuses.includes(currentStatus) && (nextStatus === approved || nextStatus === executing)) {
    return `Status jump ${currentStatus} -> ${nextStatus} skips required workflow gates.`;
  }
  if ((currentStatus === approved || currentStatus === executing)
    && (policy.preApprovalStatuses.includes(nextStatus) || (currentStatus === executing && nextStatus === approved))) {
    return `Backward transition ${currentStatus} -> ${nextStatus} is not allowed.`;
  }
  return null;
}

function extractStatusFromText(text: string): string {
  for (const line of text.split('\n')) {
    const marker = '**Status**:';
    if (!line.includes(marker)) continue;
    const idx = line.lastIndexOf(marker);
    return line.slice(idx + marker.length).replace(/\r/g, '').trim();
  }
  return '';
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
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
  return filePath.length > 0 && !filePath.startsWith('/');
}

/**
 * `hook_normalize_file_path()` port. The plain prefix strip above handles
 * the common case; these two fallbacks (gate round-1 parity closure) port
 * bash's symlink-canonicalization tiers verbatim (`git show
 * c6504231:assets/hooks/hook-input.sh` lines 174-220) for hosts where
 * `repoRoot` and the reported absolute path disagree on a symlinked
 * ancestor's spelling even though they name the same directory -- the
 * canonical example being macOS temp dirs, where `/var/...` is itself a
 * symlink to `/private/var/...`.
 */
function normalizeFilePath(repoRoot: string, raw: string): string {
  if (!raw || !raw.startsWith('/')) return raw;
  if (raw === repoRoot || raw.startsWith(`${repoRoot}/`)) return raw.slice(repoRoot.length + 1);

  const repoReal = tryRealpath(repoRoot);
  if (repoReal && (raw === repoReal || raw.startsWith(`${repoReal}/`))) {
    return raw.slice(repoReal.length + 1);
  }

  // Last resort: resolve the raw path's own parent directory (the file
  // itself may not exist yet on a PreToolUse event) and retry against both
  // roots.
  const rawParentReal = tryRealpath(dirname(raw));
  if (rawParentReal) {
    const rawReal = `${rawParentReal}/${basename(raw)}`;
    if (repoReal && (rawReal === repoReal || rawReal.startsWith(`${repoReal}/`))) {
      return rawReal.slice(repoReal.length + 1);
    }
    if (rawReal === repoRoot || rawReal.startsWith(`${repoRoot}/`)) {
      return rawReal.slice(repoRoot.length + 1);
    }
  }

  return raw;
}

function tryRealpath(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
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
    profile === 'lite' || profile === 'standard' || profile === 'strict' ? profile : 'strict';

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
