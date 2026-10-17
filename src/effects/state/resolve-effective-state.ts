import { assertObservationPath, currentReadonlyObservation, withReadonlyObservation, type ReadonlyObservationIO, observationReadFileSync as readFileSync, observationReaddirSync as readdirSync } from './readonly-observation';
import { statSync } from 'fs';
import { posix, win32 } from 'path';
import { buildReviewSubject, isImplementationSurfacePath, type ReviewSubject } from '../review/diff-fingerprint';
import { owedCapabilityBase } from './owed-capabilities';
import { resolveWorkflowProfile } from '../../core/workflow/profile';
import {
  CAPABILITY_SOURCE_MODES,
  isCapabilityPathOutsideRepo,
  normalizeCapabilityPath,
  parseCapabilityRegistry,
  resolveCapabilityPaths,
  type CapabilityIdentity,
  type CapabilityPathMatch,
  type CapabilityPathResolution,
  type CapabilityRegistryDiagnostic,
  type CapabilityRegistryResolution,
  type CapabilitySourceMode,
} from '../../core/capabilities/registry';
import { capabilityOwnershipBlocker, type CapabilityOwnershipBlocker } from '../../core/capabilities/ownership-blocker';
import { ARCHCONTEXT_IDENTITY_OWNERS, archcontextResolveQueries, resolveArchcontextCapabilityPaths, type ArchcontextOwnerLookup } from '../capabilities/archcontext-owners';
import type {
  CapabilityOwnership,
  EffectiveState,
  EffectiveStateRiskInput,
  StateSnapshot,
} from '../../core/state/types';
import {
  artifactStemFromPlan,
  evidenceContractComplete,
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
const CAPABILITY_NODES_DIR = '.archcontext/model/nodes';
const CAPABILITY_NODE_FILE = /\.ya?ml$/;
const POLICY_PATH = '.ai/harness/policy.json';
// profile_reasons names at most this many unowned paths; the count reason carries the total.
const UNOWNED_PATH_REASON_LIMIT = 20;

export type WorkflowPolicy = Readonly<Record<string, unknown>> | null;
const POLICY_FIELD_ABSENT = Symbol('policy-field-absent');

export interface EffectiveStatePublicationEffects {
  readonly cache?: StateCacheWriteEffects;
  readonly version?: StateVersionWriteEffects;
}

export function readWorkflowPolicy(cwd: string, readSource = (path: string) => readText(cwd, path)): WorkflowPolicy {
  const text = readSource(POLICY_PATH);
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

function policyPath(policy: WorkflowPolicy, jqPath: string, fallback: string, root = '.ai/harness'): string {
  const value = policyValue(policy, jqPath);
  if (value === POLICY_FIELD_ABSENT) return fallback;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`invalid workflow policy path ${jqPath}`);
  }
  const posixPolicyRoot = posix.resolve('/repo', root);
  const posixCandidate = posix.resolve('/repo', value);
  const win32PolicyRoot = win32.resolve('C:\\repo', root).toLowerCase();
  const win32Candidate = win32.resolve('C:\\repo', value).toLowerCase();
  const containedByBothPathGrammars =
    posixCandidate.startsWith(`${posixPolicyRoot}${posix.sep}`) &&
    win32Candidate.startsWith(`${win32PolicyRoot}${win32.sep}`);
  if (
    value.includes('\n') ||
    value.includes('\r') ||
    !value.startsWith(`${root}/`) ||
    !containedByBothPathGrammars
  ) {
    throw new Error(`unsafe workflow policy path ${jqPath}: ${value}`);
  }
  return value;
}

/** The edit guard writes failure records here and `summarize-failures` reads them. No policy override (#692). */
export const FAILURE_LOG_FILE = '.ai/harness/failures/latest.jsonl';

/** Repo-relative workflow paths that the policy may relocate. */
export interface HarnessPaths {
  readonly handoff: string;
  readonly resume: string;
  readonly runsDir: string;
  readonly contextMap: string;
  readonly todoFile: string;
  /** Display text only; nothing reads or writes through it. */
  readonly researchDir: string;
}

/**
 * The one reader of the policy path fields. Each field stays inside its own
 * root. A missing field takes the default; a malformed or escaping one throws.
 */
export function resolveHarnessPaths(cwd: string): HarnessPaths {
  const policy = readWorkflowPolicy(cwd);
  return {
    handoff: policyPath(policy, '.harness.handoff_file', '.ai/harness/handoff/current.md'),
    resume: policyPath(policy, '.handoff_resume.resume_packet_file', '.ai/harness/handoff/resume.md'),
    runsDir: policyPath(policy, '.harness.runs_dir', '.ai/harness/runs'),
    contextMap: policyPath(policy, '.context.map_file', '.ai/context/context-map.json', '.ai/context'),
    todoFile: policyPath(policy, '.tasks.todo_file', 'tasks/todos.md', 'tasks'),
    researchDir: policyString(policy, '.tasks.research_dir', 'docs/researches'),
  };
}

function policyString(policy: WorkflowPolicy, jqPath: string, fallback: string): string {
  const value = policyValue(policy, jqPath);
  if (value === POLICY_FIELD_ABSENT) return fallback;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`invalid workflow policy string ${jqPath}`);
  }
  return value.trim();
}

function validateWorkflowPolicy(policy: WorkflowPolicy): void {
  // Validate every policy field owned by this resolver eagerly. Otherwise a
  // malformed capability or planning field can evade validation on an
  // inspect/no-target call and still publish cache/version authority.
  policyString(policy, '.worktree_strategy.review_base', 'main');
  policyString(policy, '.worktree_strategy.merge_back.target', 'main');
  policyString(policy, '.worktree_strategy.base_branch', 'main');
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
  capabilitySourceMode(policy);
  minimalChangeMode(policy);
}

const MINIMAL_CHANGE_MODES: readonly string[] = ['off', 'advice'];

// No code reads the minimal_change policy. The mode check only rejects the
// retired `enforce` value (and any other unknown value) so an operator
// does not rely on a gate that no longer exists.
function minimalChangeMode(policy: WorkflowPolicy): void {
  const value = policyValue(policy, '.minimal_change.mode');
  if (value === POLICY_FIELD_ABSENT) return;
  if (typeof value === 'string' && MINIMAL_CHANGE_MODES.includes(value)) return;
  throw new Error(`invalid workflow policy value .minimal_change.mode: ${String(value)}`);
}

/**
 * The single capability authority selector, mirroring
 * scripts/capability-resolver.ts. `registry` reads the JSON registry,
 * `archcontext` reads archcontext capability nodes; there is no dual-read and
 * no fallback in either direction, and an unknown value fails closed.
 *
 * `.context.capability_registry_file` only names where the JSON registry lives
 * and is therefore inert under `archcontext` -- the adoption seeders keep
 * writing it as a default for registry-mode repos.
 */
export function capabilitySourceMode(policy: WorkflowPolicy): CapabilitySourceMode {
  const value = policyValue(policy, '.context.capability_source');
  if (value === POLICY_FIELD_ABSENT) return 'registry';
  if (typeof value === 'string' && (CAPABILITY_SOURCE_MODES as readonly string[]).includes(value)) {
    return value as CapabilitySourceMode;
  }
  throw new Error(
    `invalid workflow policy value .context.capability_source: ${String(value)}`,
  );
}

/** Sorted repo-relative node file paths; empty when the directory is absent. */
function archcontextNodePaths(cwd: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(repoPath(cwd, CAPABILITY_NODES_DIR));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter((name) => CAPABILITY_NODE_FILE.test(name))
    .sort()
    .map((name) => `${CAPABILITY_NODES_DIR}/${name}`);
}

/**
 * Content hash of the selected capability authority. Registry mode keeps the
 * single-file hash byte-for-byte; archcontext mode folds the sorted node files
 * into one revision so any node edit still moves authority_revision.
 */
function capabilityAuthorityHash(cwd: string, mode: CapabilitySourceMode, hashSource = (path: string) => sourceHash(cwd, path)): string {
  if (mode === 'registry') return hashSource(CAPABILITY_REGISTRY_PATH);
  const paths = archcontextNodePaths(cwd);
  if (paths.length === 0) return sha256(`missing:${CAPABILITY_NODES_DIR}`);
  return contentRevision(Object.fromEntries(paths.map((path) => [path, hashSource(path)])));
}

/** State-input source paths for the selected capability authority. */
function capabilityAuthoritySourcePaths(cwd: string, mode: CapabilitySourceMode): string[] {
  if (mode === 'registry') return [CAPABILITY_REGISTRY_PATH];
  const paths = archcontextNodePaths(cwd);
  return paths.length > 0 ? paths : [CAPABILITY_NODES_DIR];
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

const HANDOFF_PATH = '.ai/harness/handoff/current.md';
const RESUME_PATH = '.ai/harness/handoff/resume.md';
const CURRENT_SNAPSHOT_PATH = 'tasks/current.md';

/**
 * `source_hashes` keys the stability contract's re-read comparison ignores:
 * high-churn, non-authority surfaces whose instability must not abort
 * resolution (root-cause-prover diagnosis, 2026-07-23 -- see
 * .ai/harness/runs/hook-guard-stability/). These sources are still read
 * once per unlocked resolution and reported in `source_hashes` exactly as
 * before; only their participation in the stability-abort DECISION changes.
 * Workflow-authority surfaces (active-plan/active-worktree
 * markers, the plan, policy, capability registry, and the
 * derived authority_revision) keep the full stability contract unchanged.
 */
const NON_AUTHORITY_SOURCE_HASH_KEYS: ReadonlySet<string> = new Set([
  'review_subject',
  CURRENT_SNAPSHOT_PATH,
  HANDOFF_PATH,
  RESUME_PATH,
]);

/** Projects `sourceHashes` onto the workflow-authority subset the stability
 * contract's re-read comparison uses to decide whether to retry or throw. */
function authoritySourceHashes(
  sourceHashes: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const authority: Record<string, string> = {};
  for (const key of Object.keys(sourceHashes)) {
    if (!NON_AUTHORITY_SOURCE_HASH_KEYS.has(key)) authority[key] = sourceHashes[key];
  }
  return authority;
}

export type CapabilityRegistryStatus = 'valid' | 'absent' | 'invalid';

export interface CapabilityResolution {
  readonly ids: readonly string[];
  readonly registryStatus: CapabilityRegistryStatus;
  /** One match per owned path. Empty when ownership failed. */
  readonly matches: readonly CapabilityPathMatch<CapabilityIdentity>[];
  /** Paths whose owner the authority answered as "none". Empty when ownership failed. */
  readonly unmappedPaths: readonly string[];
  readonly malformedEntryCount: number;
  readonly outOfRepoPathCount: number;
  /** The blocker, with its first diagnostic, when ownership failed. */
  readonly blocker: CapabilityOwnershipBlocker | null;
}

// Policy declares capability registry authority. Adoption and init, plus the
// explicit capability commands, write the registry and its policy reference.
// A declared missing or invalid registry fails closed. Restore the declared
// registry through those writers, or repair its JSON explicitly. Workflow
// diagnostics and ensure-task-workflow do not repair registry contents.
function policyDeclaresCapabilityRegistry(policy: WorkflowPolicy): boolean {
  const declared = policyValue(policy, '.context.capability_registry_file');
  if (declared === POLICY_FIELD_ABSENT) return false;
  if (declared !== CAPABILITY_REGISTRY_PATH) {
    throw new Error('invalid workflow policy path .context.capability_registry_file');
  }
  return true;
}

export function loadRegistryAuthority(cwd: string, policy: WorkflowPolicy, readSource: (path: string) => string | null): CapabilityRegistryResolution {
  const text = readSource(CAPABILITY_REGISTRY_PATH);
  return parseCapabilityRegistry(text && text.length > 0 ? text : null, {
    declared: policyDeclaresCapabilityRegistry(policy),
    repoRoot: cwd,
  });
}

// One resolve runs several unlocked passes. The archctx answer depends only on
// the node files and the queried paths, so a pass with the same inputs reuses a success.
let archcontextResolutionMemo: { key: string; resolution: CapabilityPathResolution<CapabilityIdentity> } | null = null;

/** Under `archcontext`, ArchContext owns path ownership; a failed resolve fails closed. */
function resolveArchcontextPaths(
  cwd: string,
  owners: ArchcontextOwnerLookup<CapabilityIdentity>,
  paths: readonly string[],
  readSource: (path: string) => string | null,
): CapabilityPathResolution<CapabilityIdentity> {
  const nodes = archcontextNodePaths(cwd).map((path) => [path, readSource(path)]);
  // The queries carry each path's directory state, which changes what archctx answers.
  const key = sha256(JSON.stringify([safeRealpath(cwd), nodes, paths, archcontextResolveQueries(cwd, paths)]));
  if (archcontextResolutionMemo?.key === key) return archcontextResolutionMemo.resolution;
  try {
    const resolution = resolveArchcontextCapabilityPaths(cwd, owners, paths);
    // An unavailable answer is not memoized: a later pass outside observation computes it.
    if (resolution.status !== 'unavailable') archcontextResolutionMemo = { key, resolution };
    return resolution;
  } catch (error) {
    // A process failure is not memoized: the next resolve tries archctx again.
    return {
      status: 'unavailable',
      capabilityIds: [],
      matches: [],
      unmappedPaths: [],
      diagnostics: [{ code: 'ARCHCONTEXT_RESOLVE_FAILED', path: CAPABILITY_NODES_DIR, message: (error as Error).message }],
    };
  }
}

/** Resolve one union, then keep each subject's owners and path errors separate. */
function capabilityIdsForPathGroups(
  cwd: string,
  groups: readonly (readonly string[])[],
  policy: WorkflowPolicy,
  readSource = (path: string) => readText(cwd, path),
  select: (paths: readonly string[]) => readonly string[] = (paths) => paths,
): CapabilityResolution[] {
  const mode = capabilitySourceMode(policy);
  const inputs = groups.map((paths) => {
    const inRepoPaths = paths.filter((path) => !isCapabilityPathOutsideRepo(path, cwd));
    return { inRepoPaths, outOfRepoPathCount: paths.length - inRepoPaths.length };
  });
  const invalid = (diagnostics: readonly CapabilityRegistryDiagnostic[], outOfRepoPathCount: number): CapabilityResolution => ({
    ids: [], registryStatus: 'invalid', matches: [], unmappedPaths: [],
    malformedEntryCount: new Set(diagnostics.map((entry) => /^capabilities\[(\d+)\]/.exec(entry.path)?.[1]).filter(Boolean)).size,
    outOfRepoPathCount,
    blocker: capabilityOwnershipBlocker(diagnostics[0]!, mode),
  });
  const registry = mode === 'registry' ? loadRegistryAuthority(cwd, policy, readSource) : null;
  if (registry?.status === 'absent') {
    return inputs.map(({ outOfRepoPathCount }) => ({
      ids: [], registryStatus: 'absent', matches: [], unmappedPaths: [], malformedEntryCount: 0, outOfRepoPathCount, blocker: null,
    }));
  }
  const authorityErrors = registry?.status === 'invalid' ? registry.diagnostics
    : mode === 'archcontext' && archcontextNodePaths(cwd).length === 0
      ? [{ code: 'REGISTRY_MISSING' as const, path: CAPABILITY_NODES_DIR, message: `capability nodes are missing: ${CAPABILITY_NODES_DIR}` }]
      : [];
  if (authorityErrors.length > 0) return inputs.map(({ outOfRepoPathCount }) => invalid(authorityErrors, outOfRepoPathCount));

  const subjects = inputs.map(({ inRepoPaths, outOfRepoPathCount }) => {
    const paths = new Set<string>();
    const diagnostics: CapabilityRegistryDiagnostic[] = [];
    for (const path of select(inRepoPaths)) {
      try { paths.add(normalizeCapabilityPath(path, cwd)); }
      catch (error) { diagnostics.push({ code: 'INVALID_PATH', path: 'path', message: (error as Error).message }); }
    }
    return { paths, diagnostics, outOfRepoPathCount };
  });
  const union = Array.from(new Set(subjects.flatMap(({ paths }) => [...paths]))).sort();
  const resolution: CapabilityPathResolution<CapabilityIdentity> = registry?.status === 'valid'
    ? resolveCapabilityPaths(registry.registry, union, { repoRoot: cwd })
    : union.length === 0
      ? { status: 'valid', capabilityIds: [], matches: [], unmappedPaths: [], diagnostics: [] }
      : resolveArchcontextPaths(cwd, ARCHCONTEXT_IDENTITY_OWNERS, union, readSource);
  return subjects.map(({ paths, diagnostics: pathErrors, outOfRepoPathCount }): CapabilityResolution => {
    const diagnostics = [...pathErrors, ...resolution.diagnostics.filter((entry) => {
      // Empty subjects did not need archctx before this union query either.
      if (paths.size === 0) return false;
      return mode !== 'archcontext' || !['AMBIGUOUS_MATCH', 'ARCHCONTEXT_OWNER_UNKNOWN'].includes(entry.code)
        || paths.has(entry.path);
    })];
    if (diagnostics.length > 0) return invalid(diagnostics, outOfRepoPathCount);
    const matches = resolution.matches.filter((match) => paths.has(match.filePath));
    return {
      ids: Array.from(new Set(matches.map((match) => match.capability.id))).sort(),
      registryStatus: 'valid', matches,
      unmappedPaths: resolution.unmappedPaths.filter((path) => paths.has(path)),
      malformedEntryCount: 0, outOfRepoPathCount, blocker: null,
    };
  });
}

function capabilityIdsForPaths(
  cwd: string,
  paths: readonly string[],
  policy: WorkflowPolicy,
  readSource?: (path: string) => string | null,
  select?: (paths: readonly string[]) => readonly string[],
): CapabilityResolution {
  return capabilityIdsForPathGroups(cwd, [paths], policy, readSource, select)[0]!;
}

/** The owed subject is independent of the subject used for risk and review. */
function owedOwnershipSubject(cwd: string, reviewSubject: ReviewSubject): ReviewSubject {
  if (reviewSubject.status !== 'ok') return reviewSubject;
  const base = owedCapabilityBase(cwd, reviewSubject.target_rev, reviewSubject.head_rev);
  return base.reviewBase === reviewSubject.target_rev
    ? reviewSubject
    : buildReviewSubject(cwd, { targetRef: base.reviewBase });
}

/** Groups the resolved owners by capability. Null when ownership was not computed. */
function capabilityOwnershipFrom(
  resolution: CapabilityResolution | null,
  declared: boolean,
  reviewBase: string | null,
): CapabilityOwnership | null {
  if (!resolution || declared || resolution.registryStatus !== 'valid') return null;
  const byId = new Map<string, { module_document: string; paths: string[] }>();
  for (const match of resolution.matches) {
    const entry = byId.get(match.capability.id) ?? { module_document: match.capability.architecture_module, paths: [] };
    entry.paths.push(match.filePath);
    byId.set(match.capability.id, entry);
  }
  return {
    review_base: reviewBase,
    capability_ids: resolution.ids,
    capabilities: resolution.ids.map((id) => ({ id, ...byId.get(id)! })),
    unowned_paths: resolution.unmappedPaths,
  };
}

/**
 * Owed ownership against `targetRef`, or the policy review base when omitted.
 * A checkout not ahead of that base uses its last manifest checkpoint. The
 * returned review_base keeps the policy target so the owed rule can select
 * the same checkpoint and its Stop delivery key. It reads the same authority and runs
 * the same ownership resolution as `state resolve`, without the state
 * lock, the cache or the version store. Null means the repository declares no
 * capability registry, so nothing is owned. It throws when the review subject
 * or ownership is unavailable.
 */
export function resolveCapabilityOwnership(cwd: string, targetRef?: string): CapabilityOwnership | null {
  const policy = readWorkflowPolicy(cwd);
  const reviewSubject = buildReviewSubject(cwd, { targetRef: targetRef ?? policyReviewBase(policy) });
  if (reviewSubject.status !== 'ok') {
    throw new Error(`review subject is unavailable: ${reviewSubject.reason ?? 'unknown reason'}`);
  }
  const owedSubject = owedOwnershipSubject(cwd, reviewSubject);
  if (owedSubject.status !== 'ok') throw new Error(`owed subject is unavailable: ${owedSubject.reason ?? 'unknown reason'}`);
  const resolution = capabilityIdsForPaths(cwd, owedSubject.paths.filter(isImplementationSurfacePath), policy);
  if (resolution.blocker) {
    throw new Error(`${resolution.blocker.key} ${resolution.blocker.code}: ${resolution.blocker.message}; fix: ${resolution.blocker.fix}`);
  }
  if (resolution.registryStatus === 'absent') return null;
  return capabilityOwnershipFrom(resolution, false, reviewSubject.target_rev)!;
}

export interface CapabilityPathOwner {
  readonly id: string;
  readonly module_document: string;
}

/**
 * The owning capability of each owned repository-relative path. It reads the
 * same authority as `state resolve`, but it builds no review subject, takes no
 * state lock and writes nothing. A path is absent from the map when it is not
 * an implementation surface or has no owner; the map is empty when the
 * repository declares no registry. One call resolves the whole batch, so an
 * archcontext repository starts one `archctx resolve`. `select` narrows the
 * batch after the authority loads and before ownership resolves, so a caller
 * pays for its own filter only when a registry exists. It throws when
 * ownership is unavailable.
 */
export function capabilityOwnersForPaths(
  cwd: string,
  paths: readonly string[],
  select?: (surfaces: readonly string[]) => readonly string[],
): ReadonlyMap<string, CapabilityPathOwner> {
  const owners = new Map<string, CapabilityPathOwner>();
  const surfaces = paths.filter(isImplementationSurfacePath);
  if (surfaces.length === 0) return owners;
  const resolution = capabilityIdsForPaths(cwd, surfaces, readWorkflowPolicy(cwd), undefined, select);
  if (resolution.blocker) {
    throw new Error(`${resolution.blocker.key} ${resolution.blocker.code}: ${resolution.blocker.message}; fix: ${resolution.blocker.fix}`);
  }
  for (const match of resolution.matches) {
    owners.set(match.filePath, { id: match.capability.id, module_document: match.capability.architecture_module });
  }
  return owners;
}

function policyReviewBase(policy: WorkflowPolicy): string {
  return policyString(
    policy,
    '.worktree_strategy.review_base',
    policyString(
      policy,
      '.worktree_strategy.merge_back.target',
      policyString(policy, '.worktree_strategy.base_branch', 'main'),
    ),
  );
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
  cwd: string,
  nowMs: number,
  reviewSubjectFor: ReviewSubjectSlot,
  options: { risk?: EffectiveStateRiskInput },
): EffectiveState {
  const currentWorktree = safeRealpath(cwd);
  // Only these named facts are shared, and only within this unlocked read-only
  // pass. Every subsequent initial/confirmation pass owns a fresh map.
  const captured = currentReadonlyObservation() ? new Map<string, string | null>() : null;
  const readSource = (path: string): string | null => {
    if (captured?.has(path)) { assertObservationPath(repoPath(cwd, path)); return captured.get(path)!; }
    const text = readText(cwd, path);
    captured?.set(path, text);
    return text;
  };
  const hashSource = (path: string): string => {
    const text = readSource(path);
    return text === null ? sha256(`missing:${path}`) : sha256(text);
  };
  const policy = readWorkflowPolicy(cwd, readSource);
  const capabilitySource = capabilitySourceMode(policy);
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
  const reviewSubject = reviewSubjectFor(policyReviewBase(policy));
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
  let owedSubject: ReviewSubject | null = null;
  // Owed ownership is advisory and does not feed state_revision or source_hashes.
  // Bounded observers keep review/risk reads and do not request owed Git history.
  if (!options.risk?.capabilityIds && !currentReadonlyObservation()) {
    try { owedSubject = owedOwnershipSubject(cwd, reviewSubject); }
    catch { /* Architecture diagnostics do not block risk resolution. */ }
  }
  const owedPaths = owedSubject
    ? Array.from(new Set([...explicitTargetPaths, ...(owedSubject.status === 'ok' ? owedSubject.paths : [])])).sort().filter(isImplementationSurfacePath)
    : [];
  const [riskOwnership, owedOwnership] = options.risk?.capabilityIds || (!hasRawTargetPaths && owedPaths.length === 0)
    ? []
    : capabilityIdsForPathGroups(cwd, [implementationTargetPaths, owedPaths], policy, readSource);
  const capabilityResolution: CapabilityResolution | null = options.risk?.capabilityIds
    ? { ids: options.risk.capabilityIds, registryStatus: 'valid', matches: [], unmappedPaths: [], malformedEntryCount: 0, outOfRepoPathCount: 0, blocker: null }
    : hasRawTargetPaths ? riskOwnership! : null;
  const observedCapabilityIds = capabilityResolution?.ids;
  const unmappedCapabilityCount = capabilityResolution?.unmappedPaths.length ?? 0;
  const outOfRepoPathCount = capabilityResolution?.outOfRepoPathCount ?? 0;
  // capabilityCount is always an explicit number (never left undefined) once
  // there are any raw target paths, so an all-workflow-surface batch (whose
  // implementationTargetPaths is empty) resolves the deterministic "known,
  // zero implementation surface" lite floor instead of tripping
  // resolveWorkflowProfile's signals-unavailable fail-closed branch -- that
  // branch exists for the genuinely unknown case (no target paths at all),
  // which stays untouched below.
  // Out-of-repo and unowned paths remain diagnostic-only: neither is a
  // capability, so neither contributes to capabilityCount. A new file next to
  // an owned file must not read as a second capability.
  const declaredCapabilityCount = options.risk?.capabilityCount ?? (
    hasRawTargetPaths ? (observedCapabilityIds?.length ?? 0) : undefined
  );

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
    explicitOverride: options.risk?.explicitOverride,
  });

  const worktreeOwnerIsCurrent = Boolean(owner && safeRealpath(owner) === currentWorktree);
  // Capability registry reasons are appended to profile_reasons alongside
  // resolveWorkflowProfile's own reasons rather than folded into the resolver
  // itself -- the risk-floor ranking formula is untouched; only the reason
  // text is additive.
  const capabilityReasons: string[] = [];
  const capabilityBlocker = capabilityResolution?.blocker ?? null;
  if (capabilityResolution?.registryStatus === 'absent') {
    capabilityReasons.push('capability:registry:absent');
  } else if (capabilityBlocker?.key === 'capability_ownership:unavailable') {
    capabilityReasons.push('capability:ownership:unavailable');
  } else if (capabilityResolution?.registryStatus === 'invalid') {
    capabilityReasons.push('capability:registry:invalid');
  }
  if (capabilityBlocker) capabilityReasons.push(`capability:diagnostic:${capabilityBlocker.code}`);
  if (capabilityResolution && capabilityResolution.malformedEntryCount > 0) {
    capabilityReasons.push(`capability:registry:malformed-entries:${capabilityResolution.malformedEntryCount}`);
  }
  if (unmappedCapabilityCount > 0) {
    capabilityReasons.push(`capability:unowned:${unmappedCapabilityCount}`);
    capabilityReasons.push(...capabilityResolution!.unmappedPaths
      .slice(0, UNOWNED_PATH_REASON_LIMIT)
      .map((path) => `capability:unowned-path:${path}`));
  }
  if (outOfRepoPathCount > 0) {
    capabilityReasons.push(`capability:out-of-repo:${outOfRepoPathCount}`);
  }

  const reviewSubjectSha256 = reviewSubject.status === 'ok' ? reviewSubject.review_subject_sha256 : null;
  const taskId = planPath ? artifactStemFromPlan(planPath, planText) : null;

  // Keep authority, observed Git subject and display projections separate.
  const authorityRevision = contentRevision({
    active_plan: sourceHash(cwd, ACTIVE_PLAN_MARKER),
    active_worktree: sourceHash(cwd, ACTIVE_WORKTREE_MARKER),
    plan: planPath ? sourceHash(cwd, planPath) : sha256('missing:plan'),
    policy: captured ? hashSource(POLICY_PATH) : sourceHash(cwd, POLICY_PATH),
    capability_registry: capabilityAuthorityHash(cwd, capabilitySource, captured ? hashSource : undefined),
    task_identity: sha256(taskId ?? 'missing:task-id'),
  });
  const subjectRevision = contentRevision({
    review_subject: reviewSubjectSha256 ?? sha256('unavailable:review-subject'),
    target_rev: reviewSubject.status === 'ok' ? sha256(reviewSubject.target_rev) : sha256('unavailable:target-rev'),
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
    ...capabilityAuthoritySourcePaths(cwd, capabilitySource),
    ...(planPath ? [planPath] : []),
    HANDOFF_PATH,
    RESUME_PATH,
    CURRENT_SNAPSHOT_PATH,
  ];
  const collected = collectStateInputs(cwd, sourcePaths.filter(path => !captured?.has(path)), {
    ...Object.fromEntries(sourcePaths.filter(path => captured?.has(path)).map(path => [path, hashSource(path)])),
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
    riskResolution,
    requestedWorkflowProfile: options.risk?.explicitOverride ?? null,
    capabilityReasons,
    capabilityBlocker,
    capabilityOwnership: capabilityOwnershipFrom(
      owedSubject ? owedOwnership ?? null : null,
      Boolean(options.risk?.capabilityIds),
      reviewSubject.status === 'ok' ? reviewSubject.target_rev : null,
    ),
    staleSources,
    conflictingSources,
    activeWorktreePath: ACTIVE_WORKTREE_MARKER,
    currentWorktree,
    worktreeOwner: owner,
    worktreeOwnerIsCurrent,
    handoffPath: HANDOFF_PATH,
    handoffText,
    resumePath: RESUME_PATH,
    resumeText,
    currentSnapshotPath: CURRENT_SNAPSHOT_PATH,
    currentSnapshotText: currentText,
    authorityRevision,
    subjectRevision,
    projectionRevision,
    stateVersion: 0,
    stateRevision,
    sourceHashes,
  });
}

/**
 * Builds the Git review subject for one stability pass. A pass asks for the
 * subject with the review base of its own policy read. The slot builds it on
 * the first call, reuses it while the review base stays the same, and builds
 * it again when the review base changes. Each stability pass takes a new slot,
 * so each pass observes Git itself. Nothing is cached across resolutions.
 */
type ReviewSubjectSlot = (targetRef: string) => ReviewSubject;

function reviewSubjectSlot(cwd: string): ReviewSubjectSlot {
  let subject: ReviewSubject | null = null;
  return (targetRef) => {
    if (subject === null || subject.target_ref !== targetRef) subject = buildReviewSubject(cwd, { targetRef });
    return subject;
  };
}

/** Evidence is excluded from authority comparisons. Keep partial states private. */
function resolveAuthoritySourceHashes(
  cwd: string,
  nowMs: number,
  reviewSubjectFor: ReviewSubjectSlot,
  risk?: EffectiveStateRiskInput,
): Readonly<Record<string, string>> {
  return authoritySourceHashes(
    resolveEffectiveStateUnlocked(cwd, nowMs, reviewSubjectFor, { risk }).source_hashes,
  );
}

/**
 * Thrown when the stability contract exhausts its bounded re-reads because an
 * authority source kept changing across them. Sustained concurrent authority
 * churn, not an unresolvable workflow profile, so callers classify this by type
 * and may retry.
 */
export class StateResolutionUnstableError extends Error {
  constructor() {
    super('workflow authority changed repeatedly while resolving effective state');
    this.name = 'StateResolutionUnstableError';
  }
}

/**
 * Run one stable-resolve + version-commit attempt. The version lock's
 * `confirmSnapshot` seam re-collects source hashes immediately before the
 * candidate version is computed and compares them against this attempt's own
 * `confirmed.source_hashes`; a mismatch means a source mutated after the
 * stability loop returned but before allocation, so it throws
 * `StateVersionConfirmMismatchError` with no owner write and no cache
 * publish -- `resolveEffectiveState` below decides whether to retry. The
 * confirm callback reuses the review subject slot of the confirmed pass,
 * because it compares authority hashes for the commit window only. The slot
 * still builds the subject again if the policy review base changed.
 */
function resolveAndCommitEffectiveState(
  cwd: string,
  nowMs: number,
  risk: EffectiveStateRiskInput | undefined,
  publicationEffects: EffectiveStatePublicationEffects | undefined,
): EffectiveState {
  const { state: confirmed, reviewSubjectFor } = resolveStableEffectiveState(cwd, nowMs, risk);
  let finalized: EffectiveState | null = null;
  commitStateVersionAfter(cwd, confirmed.state_revision, (version) => {
    const candidate = { ...confirmed, state_version: version };
    const publication = publishEffectiveStateCache(cwd, candidate, publicationEffects?.cache);
    finalized = candidate;
    return publication;
  }, publicationEffects?.version, () => {
    return JSON.stringify(resolveAuthoritySourceHashes(cwd, nowMs, reviewSubjectFor, risk))
      === JSON.stringify(authoritySourceHashes(confirmed.source_hashes));
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
    // a fresh stability loop re-reads sources and each of its passes observes
    // the review subject again (now reflecting whatever mutated the first
    // attempt's confirm window), and a fresh commit attempt re-checks its own
    // window. A second mismatch here means sources kept changing across the
    // retry too, so this reuses the existing stability-exhausted error rather
    // than inventing new vocabulary.
    try {
      return resolveAndCommitEffectiveState(cwd, nowMs, risk, publicationEffects);
    } catch (error) {
      if (error instanceof StateVersionConfirmMismatchError) {
        throw new StateResolutionUnstableError();
      }
      throw error;
    }
  });
}

export function resolveEffectiveStateReadOnly(
  cwd = process.cwd(),
  nowMs = Date.now(),
  risk?: EffectiveStateRiskInput,
  observation?: ReadonlyObservationIO,
): EffectiveState {
  const collect = () => {
    const { state: confirmed } = resolveStableEffectiveState(cwd, nowMs, risk);
    return { ...confirmed, state_version: currentStateVersion(cwd) };
  };
  return observation ? withReadonlyObservation(observation, collect) : collect();
}

/**
 * One stable attempt. Each stability pass (the authority pass and each
 * confirmed pass) takes a new review subject slot and observes Git once. The
 * published state therefore uses a subject from the same pass as its other
 * reads. The slot of the confirmed pass is returned for the confirm callback.
 */
function resolveStableEffectiveState(
  cwd: string,
  nowMs: number,
  risk?: EffectiveStateRiskInput,
): { state: EffectiveState; reviewSubjectFor: ReviewSubjectSlot } {
  let authority = resolveAuthoritySourceHashes(cwd, nowMs, reviewSubjectSlot(cwd), risk);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reviewSubjectFor = reviewSubjectSlot(cwd);
    const confirmed = resolveEffectiveStateUnlocked(cwd, nowMs, reviewSubjectFor, { risk });
    if (JSON.stringify(authority)
      === JSON.stringify(authoritySourceHashes(confirmed.source_hashes))) {
      return { state: confirmed, reviewSubjectFor };
    }
    authority = authoritySourceHashes(confirmed.source_hashes);
  }
  throw new StateResolutionUnstableError();
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
