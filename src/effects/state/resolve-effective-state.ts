import { readFileSync, statSync } from 'fs';
import { posix, win32 } from 'path';
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
import {
  commitStateVersionAfter,
  currentStateVersion,
  StateVersionConfirmMismatchError,
  type StateVersionWriteEffects,
} from './git-state-version-store';
import {
  publishEffectiveStateCache,
  type StateCacheWriteEffects,
} from './state-cache';
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
const CAPABILITY_REGISTRY_PATH = '.ai/context/capabilities.json';
const POLICY_PATH = '.ai/harness/policy.json';

type WorkflowPolicy = Readonly<Record<string, unknown>> | null;
const POLICY_FIELD_ABSENT = Symbol('policy-field-absent');

export interface EffectiveStatePublicationEffects {
  readonly cache?: StateCacheWriteEffects;
  readonly version?: StateVersionWriteEffects;
}

function readWorkflowPolicy(cwd: string): WorkflowPolicy {
  const text = readText(cwd, POLICY_PATH);
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`invalid workflow policy JSON: ${POLICY_PATH}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid workflow policy object: ${POLICY_PATH}`);
  }
  const policy = parsed as Readonly<Record<string, unknown>>;
  validateWorkflowPolicy(policy);
  return policy;
}

function policyValue(
  policy: WorkflowPolicy,
  jqPath: string,
): unknown | typeof POLICY_FIELD_ABSENT {
  if (policy === null) return POLICY_FIELD_ABSENT;
  let current: unknown = policy;
  for (const segment of jqPath.split('.').filter(Boolean)) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error(`invalid workflow policy field ${jqPath}: non-object parent`);
    }
    if (!Object.hasOwn(current, segment)) return POLICY_FIELD_ABSENT;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

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

function policyPath(policy: WorkflowPolicy, jqPath: string, fallback: string): string {
  const value = policyValue(policy, jqPath);
  if (value === POLICY_FIELD_ABSENT) return fallback;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`invalid workflow policy path ${jqPath}`);
  }
  const posixPolicyRoot = posix.resolve('/repo', '.ai/harness');
  const posixCandidate = posix.resolve('/repo', value);
  const win32PolicyRoot = win32.resolve('C:\\repo', '.ai/harness').toLowerCase();
  const win32Candidate = win32.resolve('C:\\repo', value).toLowerCase();
  const containedByBothPathGrammars =
    posixCandidate.startsWith(`${posixPolicyRoot}${posix.sep}`) &&
    win32Candidate.startsWith(`${win32PolicyRoot}${win32.sep}`);
  if (
    value.includes('\n') ||
    value.includes('\r') ||
    !value.startsWith('.ai/harness/') ||
    !containedByBothPathGrammars
  ) {
    throw new Error(`unsafe workflow policy path ${jqPath}: ${value}`);
  }
  return value;
}

function policyString(policy: WorkflowPolicy, jqPath: string, fallback: string): string {
  const value = policyValue(policy, jqPath);
  if (value === POLICY_FIELD_ABSENT) return fallback;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`invalid workflow policy string ${jqPath}`);
  }
  return value.trim();
}

function policyBoolean(policy: WorkflowPolicy, jqPath: string, fallback: boolean): boolean {
  const value = policyValue(policy, jqPath);
  if (value === POLICY_FIELD_ABSENT) return fallback;
  if (typeof value !== 'boolean') {
    // A quoted JSON string like "true" would otherwise satisfy the bash
    // reader's `jq -r` unquoting and silently activate solo_operator mode
    // from a type error rather than a deliberate edit -- fail closed here
    // instead of at the point of use.
    throw new Error(`invalid workflow policy boolean ${jqPath}`);
  }
  return value;
}

function validateWorkflowPolicy(policy: WorkflowPolicy): void {
  // Validate every policy field owned by this resolver eagerly. Otherwise a
  // malformed capability or planning field can evade validation on an
  // inspect/no-target call and still publish cache/version authority.
  policyString(policy, '.worktree_strategy.review_base', 'main');
  policyString(policy, '.worktree_strategy.merge_back.target', 'main');
  policyString(policy, '.worktree_strategy.base_branch', 'main');
  policyBoolean(policy, '.external_acceptance.solo_operator', false);
  policyPath(
    policy,
    '.planning.pending_orchestration_file',
    '.ai/harness/planning/pending.json',
  );
  const registryPath = policyValue(policy, '.context.capability_registry_file');
  if (registryPath !== POLICY_FIELD_ABSENT && registryPath !== CAPABILITY_REGISTRY_PATH) {
    throw new Error(
      `invalid workflow policy path .context.capability_registry_file: ${String(registryPath)}`,
    );
  }
}

function planStatusForPendingDraft(cwd: string, planPath: string): string {
  if (!fileExists(cwd, planPath)) return '';
  const state = planStatusFromText(readText(cwd, planPath));
  return state === 'draft' || state === 'annotating' ? state : '';
}

function pendingState(cwd: string, nowMs: number, policy: WorkflowPolicy): 'none' | 'fresh' | 'stale' {
  const pendingPath = policyPath(
    policy,
    '.planning.pending_orchestration_file',
    '.ai/harness/planning/pending.json',
  );
  if (!fileExists(cwd, pendingPath)) return 'none';
  let stat;
  try {
    stat = statSync(repoPath(cwd, pendingPath));
    if (stat.size <= 0) return 'none';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'none';
    throw error;
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
function policyDeclaresCapabilityRegistry(policy: WorkflowPolicy): boolean {
  const declared = policyValue(policy, '.context.capability_registry_file');
  if (declared === POLICY_FIELD_ABSENT) return false;
  if (declared !== CAPABILITY_REGISTRY_PATH) {
    throw new Error('invalid workflow policy path .context.capability_registry_file');
  }
  return true;
}

function capabilityIdsForPaths(
  cwd: string,
  paths: readonly string[],
  policy: WorkflowPolicy,
): CapabilityResolution {
  const text = readText(cwd, CAPABILITY_REGISTRY_PATH);
  const registry = parseCapabilityRegistry(text && text.length > 0 ? text : null, {
    declared: policyDeclaresCapabilityRegistry(policy),
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
  const policy = readWorkflowPolicy(cwd);
  const planPath = state.authoritative_plan?.path ?? null;
  const planText = readText(cwd, planPath);
  return {
    spec: fileExists(cwd, 'docs/spec.md') ? 'present' : 'missing',
    pending: pendingState(cwd, nowMs, policy),
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
  const policy = readWorkflowPolicy(cwd);
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
    policy,
    '.worktree_strategy.review_base',
    policyString(
      policy,
      '.worktree_strategy.merge_back.target',
      policyString(policy, '.worktree_strategy.base_branch', 'main'),
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
      ? capabilityIdsForPaths(cwd, implementationTargetPaths, policy)
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

  // Four typed revisions (LOOP-03/LOOP-08 audit), each computed once here
  // from source hashes this resolver already collected. The review-subject
  // fingerprint moves OUT of authority into its own subject bucket; policy,
  // capability registry, active-sprint marker+file, and task identity move
  // IN. state_revision/state_version below keep their untouched all-source
  // formula byte-for-byte (LSC-05 owns allocation) -- authority_revision is
  // still one of their ingredients, it is just computed differently now.
  const authorityRevision = contentRevision({
    active_plan: sourceHash(cwd, ACTIVE_PLAN_MARKER),
    active_worktree: sourceHash(cwd, ACTIVE_WORKTREE_MARKER),
    plan: planPath ? sourceHash(cwd, planPath) : sha256('missing:plan'),
    contract: contractPath ? sourceHash(cwd, contractPath) : sha256('missing:contract'),
    policy: sourceHash(cwd, POLICY_PATH),
    capability_registry: sourceHash(cwd, CAPABILITY_REGISTRY_PATH),
    active_sprint_marker: sourceHash(cwd, ACTIVE_SPRINT_MARKER),
    active_sprint_file: sprintPath ? sourceHash(cwd, sprintPath) : sha256('missing:active-sprint-file'),
    task_identity: sha256(taskId ?? 'missing:task-id'),
  });
  const subjectRevision = contentRevision({
    review_subject: reviewSubjectSha256 ?? sha256('unavailable:review-subject'),
    target_rev: reviewSubject.status === 'ok' ? sha256(reviewSubject.target_rev) : sha256('unavailable:target-rev'),
  });
  const evidenceRevision = contentRevision({
    checks: checksText !== null ? sha256(checksText) : sha256('missing:checks'),
    review: reviewText !== null ? sha256(reviewText) : sha256('missing:review'),
    // Bound to the subject: evidence recomputed against a new subject is
    // distinguishable from stale evidence even if checks/review bytes match.
    subject_revision: subjectRevision,
  });

  const handoffText = readText(cwd, HANDOFF_PATH);
  const resumeText = readText(cwd, RESUME_PATH);
  const currentText = readText(cwd, CURRENT_SNAPSHOT_PATH);
  const projectionRevision = contentRevision({
    handoff: handoffText !== null ? sha256(handoffText) : sha256('missing:handoff'),
    resume: resumeText !== null ? sha256(resumeText) : sha256('missing:resume'),
    current_snapshot: currentText !== null ? sha256(currentText) : sha256('missing:current-snapshot'),
  });

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
    subjectRevision,
    evidenceRevision,
    projectionRevision,
    stateVersion: 0,
    stateRevision,
    sourceHashes,
  });
}


/**
 * Run one stable-resolve + version-commit attempt. The version lock's
 * `confirmSnapshot` seam re-collects source hashes immediately before the
 * candidate version is computed and compares them against this attempt's own
 * `confirmed.source_hashes`; a mismatch means a source mutated after the
 * stability loop returned but before allocation, so it throws
 * `StateVersionConfirmMismatchError` with no owner write and no cache
 * publish -- `resolveEffectiveState` below decides whether to retry.
 */
function resolveAndCommitEffectiveState(
  cwd: string,
  nowMs: number,
  risk: EffectiveStateRiskInput | undefined,
  publicationEffects: EffectiveStatePublicationEffects | undefined,
): EffectiveState {
  const confirmed = resolveStableEffectiveState(cwd, nowMs, risk);
  let finalized: EffectiveState | null = null;
  commitStateVersionAfter(cwd, confirmed.state_revision, (version) => {
    const candidate = { ...confirmed, state_version: version };
    const publication = publishEffectiveStateCache(cwd, candidate, publicationEffects?.cache);
    finalized = candidate;
    return publication;
  }, publicationEffects?.version, () => {
    const recheck = resolveEffectiveStateUnlocked(cwd, nowMs, { risk });
    return JSON.stringify(recheck.source_hashes) === JSON.stringify(confirmed.source_hashes);
  });
  if (finalized === null) throw new Error('effective-state publication did not produce a final state');
  return finalized;
}

export function resolveEffectiveState(
  cwd = process.cwd(),
  nowMs = Date.now(),
  risk?: EffectiveStateRiskInput,
  publicationEffects?: EffectiveStatePublicationEffects,
): EffectiveState {
  return withStateLock(cwd, () => {
    try {
      return resolveAndCommitEffectiveState(cwd, nowMs, risk, publicationEffects);
    } catch (error) {
      if (!(error instanceof StateVersionConfirmMismatchError)) throw error;
    }
    // One bounded outer retry of the whole stable-resolve + commit sequence:
    // a fresh stability loop re-reads sources (now reflecting whatever
    // mutated the first attempt's confirm window) and a fresh commit attempt
    // re-checks its own window. A second mismatch here means sources kept
    // changing across the retry too, so this reuses the existing
    // stability-exhausted error rather than inventing new vocabulary.
    try {
      return resolveAndCommitEffectiveState(cwd, nowMs, risk, publicationEffects);
    } catch (error) {
      if (error instanceof StateVersionConfirmMismatchError) {
        throw new Error('workflow authority changed repeatedly while resolving effective state');
      }
      throw error;
    }
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
