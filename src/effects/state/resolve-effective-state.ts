import { readFileSync, statSync } from 'fs';
import { buildReviewSubject, isImplementationSurfacePath } from '../review/diff-fingerprint';
import { resolveWorkflowProfile, type WorkflowProfile } from '../../core/workflow/profile';
import {
  parseCapabilityRegistry,
  resolveCapabilityPaths,
} from '../../core/capabilities/registry';
import type {
  EffectiveState,
  EffectiveStateRiskInput,
  StateSnapshot,
} from '../../core/state/types';
import {
  artifactStemFromPlan,
  evidenceContractComplete,
  markdownHeader,
  planContractRelationshipConflicts,
  planSlugFromPath,
  planStatusFromText,
} from '../../core/state/artifact-parsers';
import { projectEffectiveState } from '../../core/state/project-effective-state';
import {
  projectStateSnapshot,
  type StateSnapshotCompatibilityFacts,
} from '../../core/state/project-state-snapshot';
import { allocateStateVersion, currentStateVersion } from './git-state-version-store';
import { writeEffectiveStateCache } from './state-cache';
import { withStateLock } from './state-lock';
import {
  collectStateInputs,
  contentRevision,
  fileExists,
  readText,
  readTrimmed,
  repoPath,
  safeRealpath,
  sha256,
  sourceHash,
} from './collect-state-inputs';

const ACTIVE_PLAN_MARKER = '.ai/harness/active-plan';
const ACTIVE_WORKTREE_MARKER = '.ai/harness/active-worktree';

function preferredOrLegacyPath(
  cwd: string,
  preferred: string,
  legacy: string,
): string {
  if (fileExists(cwd, preferred) || !fileExists(cwd, legacy)) return preferred;
  return legacy;
}

function deriveContractPath(cwd: string, planPath: string, planText: string | null): string | null {
  const stem = artifactStemFromPlan(planPath, planText);
  const slug = planSlugFromPath(planPath);
  if (!stem || !slug) return null;
  return preferredOrLegacyPath(
    cwd,
    `tasks/contracts/${stem}.contract.md`,
    `tasks/contracts/${slug}.contract.md`,
  );
}

function policyPath(cwd: string, jqPath: string, fallback: string): string {
  let policy: unknown;
  try {
    policy = JSON.parse(readFileSync(repoPath(cwd, '.ai/harness/policy.json'), 'utf-8'));
  } catch {
    return fallback;
  }
  const value = jqPath
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, policy);
  if (typeof value !== 'string' || value.length === 0) return fallback;
  if (
    value.startsWith('/') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.split('/').includes('..') ||
    !value.startsWith('.ai/harness/')
  ) {
    return fallback;
  }
  return value;
}

function policyString(cwd: string, jqPath: string, fallback: string): string {
  try {
    const policy = JSON.parse(readFileSync(repoPath(cwd, '.ai/harness/policy.json'), 'utf-8')) as unknown;
    const value = jqPath.split('.').filter(Boolean).reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, policy);
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  } catch {
    return fallback;
  }
}

function planStatusForPendingDraft(cwd: string, planPath: string): string {
  if (!fileExists(cwd, planPath)) return '';
  const state = planStatusFromText(readText(cwd, planPath));
  return state === 'draft' || state === 'annotating' ? state : '';
}

function pendingState(cwd: string, nowMs: number): 'none' | 'fresh' | 'stale' {
  const pendingPath = policyPath(
    cwd,
    '.planning.pending_orchestration_file',
    '.ai/harness/planning/pending.json',
  );
  if (!fileExists(cwd, pendingPath)) return 'none';
  let stat;
  try {
    stat = statSync(repoPath(cwd, pendingPath));
    if (stat.size <= 0) return 'none';
  } catch {
    return 'none';
  }
  const ageSeconds = Math.max(0, Math.floor((nowMs - stat.mtimeMs) / 1000));
  if (ageSeconds <= 259200) return 'fresh';
  let parsed: { draft_plan_path?: unknown } = {};
  try {
    parsed = JSON.parse(readFileSync(repoPath(cwd, pendingPath), 'utf-8'));
  } catch {
    return 'stale';
  }
  const draftPath =
    typeof parsed.draft_plan_path === 'string' ? parsed.draft_plan_path : '';
  if (
    draftPath &&
    planStatusForPendingDraft(cwd, draftPath) &&
    ageSeconds <= 604800
  ) {
    return 'fresh';
  }
  return 'stale';
}

const ACTIVE_SPRINT_MARKER = '.ai/harness/sprint/active-sprint';
const HANDOFF_PATH = '.ai/harness/handoff/current.md';
const RESUME_PATH = '.ai/harness/handoff/resume.md';
const CURRENT_SNAPSHOT_PATH = 'tasks/current.md';
const CHECKS_PATH = '.ai/harness/checks/latest.json';

export type CapabilityRegistryStatus = 'valid' | 'absent' | 'invalid';

export interface CapabilityResolution {
  readonly ids: readonly string[];
  readonly registryStatus: CapabilityRegistryStatus;
  readonly unmappedPaths: readonly string[];
  readonly malformedEntryCount: number;
}

const CAPABILITY_REGISTRY_PATH = '.ai/context/capabilities.json';
const POLICY_PATH = '.ai/harness/policy.json';

// Deterministic "declared" signal for a missing registry file: a repo commits
// to the capability-registry system by naming it in policy.json's
// .context.capability_registry_file (written by ensure-task-workflow.sh /
// project-init-lib.sh at adoption time; see
// tests/create-project-dirs.runtime.test.ts). A repo that never adopted the
// system has no such reference, so a missing capabilities.json there is
// "absent" (today's no-signal behavior, unchanged). A repo that DID declare
// it but whose registry file is missing is "invalid" -- fail closed with a
// structured blocker instead of a silent capabilityCount=0. Repair: rerun
// `repo-harness run check-task-workflow` (ensure-task-workflow.sh scaffolds a
// default capabilities.json when the declared path is missing) or hand-fix
// corrupt JSON directly.
function policyDeclaresCapabilityRegistry(cwd: string): boolean {
  try {
    const policy = JSON.parse(readFileSync(repoPath(cwd, '.ai/harness/policy.json'), 'utf-8')) as {
      context?: { capability_registry_file?: unknown };
    };
    const declared = policy.context?.capability_registry_file;
    return typeof declared === 'string' && declared.trim().length > 0;
  } catch {
    return false;
  }
}

function capabilityIdsForPaths(cwd: string, paths: readonly string[]): CapabilityResolution {
  const text = readText(cwd, CAPABILITY_REGISTRY_PATH);
  const registry = parseCapabilityRegistry(text && text.length > 0 ? text : null, {
    declared: policyDeclaresCapabilityRegistry(cwd),
    repoRoot: cwd,
  });
  if (registry.status === 'absent') {
    return { ids: [], registryStatus: 'absent', unmappedPaths: [], malformedEntryCount: 0 };
  }
  if (registry.status === 'invalid') {
    const malformedEntries = new Set(
      registry.diagnostics
        .map((entry) => /^capabilities\[(\d+)\]/.exec(entry.path)?.[1])
        .filter((index): index is string => Boolean(index)),
    );
    return {
      ids: [],
      registryStatus: 'invalid',
      unmappedPaths: [...paths],
      malformedEntryCount: malformedEntries.size,
    };
  }
  const resolution = resolveCapabilityPaths(registry.registry, paths, { repoRoot: cwd });
  return {
    ids: resolution.capabilityIds,
    registryStatus: resolution.status,
    unmappedPaths: resolution.unmappedPaths,
    malformedEntryCount: 0,
  };
}

function deriveReviewPath(
  planPath: string,
  planText: string | null,
  contractText: string | null,
): string | null {
  const explicit = contractText ? markdownHeader(contractText, 'Review File') : null;
  if (explicit) return explicit;
  const stem = artifactStemFromPlan(planPath, planText);
  return stem ? `tasks/reviews/${stem}.review.md` : null;
}

function collectStateSnapshotFacts(
  state: EffectiveState,
  cwd: string,
  nowMs: number,
): StateSnapshotCompatibilityFacts {
  const planPath = state.authoritative_plan?.path ?? null;
  const planText = readText(cwd, planPath);
  return {
    spec: fileExists(cwd, 'docs/spec.md') ? 'present' : 'missing',
    pending: pendingState(cwd, nowMs),
    activePlanMarker: readTrimmed(cwd, ACTIVE_PLAN_MARKER),
    contractPath: planPath ? deriveContractPath(cwd, planPath, planText) : null,
    evidence: planPath
      ? evidenceContractComplete(planText) ? 'complete' : 'incomplete'
      : 'unchecked',
  };
}

/**
 * Resolve all workflow projections into one fail-closed, versioned state model.
 * Markdown remains the human-editable authority; the JSON cache is only an
 * ignored, atomically replaced read model and never feeds authority back in.
 */
function resolveEffectiveStateUnlocked(
  cwd = process.cwd(),
  nowMs = Date.now(),
  options: { risk?: EffectiveStateRiskInput },
): EffectiveState {
  const currentWorktree = safeRealpath(cwd);
  const preferredMarker = readTrimmed(cwd, ACTIVE_PLAN_MARKER);
  const owner = readTrimmed(cwd, ACTIVE_WORKTREE_MARKER);
  const conflictingSources: string[] = [];
  const staleSources: string[] = [];
  let planPath = preferredMarker;

  if (planPath && !fileExists(cwd, planPath)) {
    staleSources.push('active_plan_marker');
    planPath = null;
  }
  if (owner && safeRealpath(owner) !== currentWorktree) {
    conflictingSources.push('worktree_owner');
    planPath = null;
  }

  const planText = readText(cwd, planPath);
  const planStatus = planPath ? planStatusFromText(planText) : 'none';
  const contractPath = planPath ? deriveContractPath(cwd, planPath, planText) : null;
  const contractText = readText(cwd, contractPath);
  conflictingSources.push(...planContractRelationshipConflicts(
    planPath,
    contractPath,
    planText,
    contractText,
  ));

  const targetBranch = policyString(
    cwd,
    '.worktree_strategy.review_base',
    policyString(
      cwd,
      '.worktree_strategy.merge_back.target',
      policyString(cwd, '.worktree_strategy.base_branch', 'main'),
    ),
  );
  const reviewSubject = buildReviewSubject(cwd, { targetRef: targetBranch });
  const explicitTargetPaths = options.risk?.targetPaths ?? [];
  const implementationDiffPaths = reviewSubject.status === 'ok' ? reviewSubject.paths : [];
  const rawTargetPaths = Array.from(new Set([...explicitTargetPaths, ...implementationDiffPaths])).sort();
  const hasRawTargetPaths = rawTargetPaths.length > 0;

  // C2: medium-scope, cross-capability, and strict-token signals count only
  // implementation surfaces. Workflow-surface paths (plans/tasks/docs/.ai/
  // .claude/.codex + markdown) are ceremony/administrative edits that stay
  // editable without an active plan (pre-edit-guard.sh's
  // is_workflow_surface_path already exempts them from the plan/strict
  // gates); counting them toward the risk floor previously inflated a
  // docs-only session's internally resolved profile even though the gates
  // themselves stayed silent about it -- and once ceremony guidance keys off
  // the resolved profile (Phase B2), the inflated profile surfaces the wrong
  // guidance.
  const implementationTargetPaths = rawTargetPaths.filter(isImplementationSurfacePath);
  const observedTargetPaths = hasRawTargetPaths ? implementationTargetPaths : undefined;

  // C1: structured, fail-closed capability registry resolution. A registry
  // the caller declared explicitly is trusted as-is; otherwise resolve it
  // from the implementation-surface path set (capabilityIdsForPaths' contract
  // is stated in terms of "implementation paths").
  const capabilityResolution: CapabilityResolution | null = options.risk?.capabilityIds
    ? { ids: options.risk.capabilityIds, registryStatus: 'valid', unmappedPaths: [], malformedEntryCount: 0 }
    : hasRawTargetPaths
      ? capabilityIdsForPaths(cwd, implementationTargetPaths)
      : null;
  const observedCapabilityIds = capabilityResolution?.ids;
  const unmappedCapabilityCount = capabilityResolution?.unmappedPaths.length ?? 0;
  // capabilityCount is always an explicit number (never left undefined) once
  // there are any raw target paths, so an all-workflow-surface batch (whose
  // implementationTargetPaths is empty) resolves the deterministic "known,
  // zero implementation surface" lite floor instead of tripping
  // resolveWorkflowProfile's signals-unavailable fail-closed branch -- that
  // branch exists for the genuinely unknown case (no target paths at all),
  // which stays untouched below.
  const declaredCapabilityCount = options.risk?.capabilityCount ?? (
    hasRawTargetPaths
      ? (observedCapabilityIds?.length ?? 0) + (unmappedCapabilityCount > 0 ? 1 : 0)
      : undefined
  );

  const contractOverride = contractText ? markdownHeader(contractText, 'Workflow Profile') : null;
  const riskResolution = resolveWorkflowProfile({
    targetPaths: observedTargetPaths,
    // C2 filters workflow-surface paths (docs/*, *.md, ...) out of
    // observedTargetPaths before medium-scope/cross-capability counting, but
    // a workflow-surface path can still carry a real strict-category token
    // (e.g. docs/auth/runbook.md) -- strictScanPaths carries the pre-filter
    // raw batch so resolveWorkflowProfile's strict-token scan sees it, while
    // targetPathCount/mediumScope/crossCapability stay on the filtered set.
    strictScanPaths: rawTargetPaths,
    capabilityIds: observedCapabilityIds,
    capabilityCount: declaredCapabilityCount,
    operationKind: options.risk?.operationKind ?? (
      observedTargetPaths && observedTargetPaths.length > 0 ? 'edit' : planPath ? undefined : 'inspect'
    ),
    explicitOverride: options.risk?.explicitOverride ?? (contractOverride as WorkflowProfile | null) ?? undefined,
  });

  // Capability registry reasons are appended to profile_reasons alongside
  // resolveWorkflowProfile's own reasons rather than folded into the resolver
  // itself -- the risk-floor ranking formula is untouched; only the reason
  // text is additive.
  const capabilityReasons: string[] = [];
  if (capabilityResolution?.registryStatus === 'absent') {
    capabilityReasons.push('capability:registry:absent');
  } else if (capabilityResolution?.registryStatus === 'invalid') {
    capabilityReasons.push('capability:registry:invalid');
  }
  if (capabilityResolution && capabilityResolution.malformedEntryCount > 0) {
    capabilityReasons.push(`capability:registry:malformed-entries:${capabilityResolution.malformedEntryCount}`);
  }
  if (unmappedCapabilityCount > 0) {
    capabilityReasons.push(`capability:unmapped:${unmappedCapabilityCount}`);
  }

  const reviewPath = planPath ? deriveReviewPath(planPath, planText, contractText) : null;
  const reviewText = readText(cwd, reviewPath);
  const reviewSubjectSha256 = reviewSubject.status === 'ok' ? reviewSubject.review_subject_sha256 : null;
  const checksText = readText(cwd, CHECKS_PATH);
  const sprintPath = readTrimmed(cwd, ACTIVE_SPRINT_MARKER);
  const taskId = planPath ? artifactStemFromPlan(planPath, planText) : null;
  const authorityRevision = contentRevision({
    active_plan: sourceHash(cwd, ACTIVE_PLAN_MARKER),
    active_worktree: sourceHash(cwd, ACTIVE_WORKTREE_MARKER),
    plan: planPath ? sourceHash(cwd, planPath) : sha256('missing:plan'),
    contract: contractPath ? sourceHash(cwd, contractPath) : sha256('missing:contract'),
    review_subject: reviewSubjectSha256 ?? sha256('unavailable:review-subject'),
  });

  const handoffText = readText(cwd, HANDOFF_PATH);
  const resumeText = readText(cwd, RESUME_PATH);
  const currentText = readText(cwd, CURRENT_SNAPSHOT_PATH);

  const sourcePaths = [
    ACTIVE_PLAN_MARKER,
    ACTIVE_WORKTREE_MARKER,
    POLICY_PATH,
    CAPABILITY_REGISTRY_PATH,
    ...(planPath ? [planPath] : []),
    ...(contractPath ? [contractPath] : []),
    ...(reviewPath ? [reviewPath] : []),
    CHECKS_PATH,
    ACTIVE_SPRINT_MARKER,
    ...(sprintPath ? [sprintPath] : []),
    HANDOFF_PATH,
    RESUME_PATH,
    CURRENT_SNAPSHOT_PATH,
  ];
  const collected = collectStateInputs(cwd, sourcePaths, {
    ...(reviewSubjectSha256 ? { review_subject: reviewSubjectSha256 } : {}),
    authority_revision: authorityRevision,
  });
  const sourceHashes = collected.sourceHashes;
  const stateRevision = collected.stateRevision;
  return projectEffectiveState({
    nowMs,
    taskId,
    planPath,
    planStatus,
    planText,
    contractPath,
    contractText,
    riskResolution,
    contractOverride,
    capabilityReasons,
    capabilityRegistryInvalid: capabilityResolution?.registryStatus === 'invalid',
    staleSources,
    conflictingSources,
    reviewPath,
    reviewText,
    reviewSubject: {
      available: reviewSubject.status === 'ok',
      reviewSubjectSha256: reviewSubject.status === 'ok'
        ? reviewSubject.review_subject_sha256
        : null,
      targetRevision: reviewSubject.status === 'ok' ? reviewSubject.target_rev : null,
      targetOverlapCount: reviewSubject.status === 'ok' ? reviewSubject.target_overlap_count : 0,
    },
    checksPath: CHECKS_PATH,
    checksText,
    sprintPath,
    sprintExists: Boolean(sprintPath && fileExists(cwd, sprintPath)),
    activeWorktreePath: ACTIVE_WORKTREE_MARKER,
    currentWorktree,
    worktreeOwner: owner,
    worktreeOwnerIsCurrent: Boolean(owner && safeRealpath(owner) === currentWorktree),
    handoffPath: HANDOFF_PATH,
    handoffText,
    resumePath: RESUME_PATH,
    resumeText,
    currentSnapshotPath: CURRENT_SNAPSHOT_PATH,
    currentSnapshotText: currentText,
    authorityRevision,
    stateVersion: 0,
    stateRevision,
    sourceHashes,
  });
}


export function resolveEffectiveState(
  cwd = process.cwd(),
  nowMs = Date.now(),
  risk?: EffectiveStateRiskInput,
): EffectiveState {
  return withStateLock(cwd, () => {
    const confirmed = resolveStableEffectiveState(cwd, nowMs, risk);
    const finalized = {
      ...confirmed,
      state_version: allocateStateVersion(cwd, confirmed.state_revision),
    };
    writeEffectiveStateCache(cwd, finalized);
    return finalized;
  });
}

export function resolveEffectiveStateReadOnly(
  cwd = process.cwd(),
  nowMs = Date.now(),
  risk?: EffectiveStateRiskInput,
): EffectiveState {
  const confirmed = resolveStableEffectiveState(cwd, nowMs, risk);
  return { ...confirmed, state_version: currentStateVersion(cwd) };
}

function resolveStableEffectiveState(
  cwd: string,
  nowMs: number,
  risk?: EffectiveStateRiskInput,
): EffectiveState {
  let state = resolveEffectiveStateUnlocked(cwd, nowMs, { risk });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const confirmed = resolveEffectiveStateUnlocked(cwd, nowMs, { risk });
    if (JSON.stringify(state.source_hashes) === JSON.stringify(confirmed.source_hashes)) {
      return confirmed;
    }
    state = confirmed;
  }
  throw new Error('workflow authority changed repeatedly while resolving effective state');
}

export function buildStateSnapshotFromEffectiveState(
  state: EffectiveState,
  cwd = process.cwd(),
  nowMs = Date.now(),
): StateSnapshot {
  return projectStateSnapshot(state, collectStateSnapshotFacts(state, cwd, nowMs));
}

export function buildStateSnapshot(
  cwd = process.cwd(),
  nowMs = Date.now(),
): StateSnapshot {
  const state = resolveEffectiveStateReadOnly(cwd, nowMs, {
    targetPaths: [],
    operationKind: 'inspect',
  });
  return buildStateSnapshotFromEffectiveState(state, cwd, nowMs);
}
