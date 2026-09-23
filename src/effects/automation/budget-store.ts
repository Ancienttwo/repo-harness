/**
 * The automation budget ledger: reserve before acting, append the authoritative
 * result, and refuse the next operation before any hard limit is exceeded.
 *
 * Everything lives under the Git common directory so linked worktrees of the
 * same clone share one budget. Every mutation for one run runs inside that
 * run's exclusive lock, which is what makes the reservation a real
 * compare-and-set: a bare read-then-write is still a TOCTOU when a second
 * controller process reserves between the read and the write.
 */
import {
  constants,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  linkSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { createHash } from 'crypto';
import { basename, dirname, join, relative, resolve, sep } from 'path';

import {
  AUTOMATION_USAGE_EVENT_KIND,
  observeCampaignTransientRetry,
  CAMPAIGN_STEP_ADMISSION_KIND,
  CAMPAIGN_STEP_COMPLETION_KIND,
  campaignBudgetStepKey,
  campaignProviderForOperation,
  campaignProviderCallReservation,
  campaignProviderOperationReservation,
  type CampaignCloseoutOperation,
  validateCampaignBudgetStepIdentity,
  validateCampaignBudgetStepEvent,
  validateAutomationLedgerEvent,
  sealCampaignBudgetStepEvent,
  foldCampaignBudgetLedger,
  isCampaignAuthoringOperation,
  type AutomationLedgerEventV1,
  type CampaignBudgetStepIdentityV1,
  type CampaignBudgetStepAdmissionV1,
  type CampaignBudgetStepCompletionV1,
  type CampaignBudgetStepEventV1,
  type CampaignBudgetLedgerV1,
  AUTOMATION_ENFORCEMENT_ORDER,
  AUTOMATION_LEDGER_GENESIS,
  AUTOMATION_METRIC_LIMIT_FIELDS,
  AUTOMATION_RESERVATION_KIND,
  AUTOMATION_RUN_EVIDENCE_SCHEMES,
  AUTOMATION_VERIFIED_USAGE_METRICS,
  CAMPAIGN_AUTOMATION_RESERVATION_KIND,
  automationEvidenceScheme,
  assertAutomationEvidenceRef,
  automationOperationReservation,
  automationDigest,
  buildAutomationBudget,
  deriveAutomationConsumption,
  parseContractDelegationBudget,
  addAutomationMetricVectors,
  canonicalAutomationJson,
  chainAutomationLedgerDigest,
  emptyAutomationMetricVector,
  evaluateAutomationReservation,
  foldAutomationLedger,
  requireUnattendedAutomationBudget,
  sealAutomationBudgetCurrent,
  sealCampaignAutomationReservation,
  sealAutomationReservation,
  sealAutomationMetricSupport,
  sealAutomationStopReceipt,
  sealAutomationUsageEvent,
  validateAutomationBudget,
  validateProgramAuthorization,
  validateAutomationBudgetCurrent,
  validateCampaignAutomationReservationContext,
  validateAutomationMetricVector,
  validateAutomationReservation,
  validateAutomationStopReceipt,
  validateAutomationUsageEvent,
  type AutomationBudgetCurrentV1,
  type AutomationBudgetRefusalV1,
  type AutomationBudgetReservationV1,
  type AutomationBudgetStateV1,
  type AutomationBudgetV1,
  type AutomationCountedMetric,
  type AutomationCurrentDrift,
  type AutomationEvidenceRefV1,
  type AutomationInFlightAuthorityV1,
  type AutomationMetricName,
  type AutomationMetricVectorV1,
  type AutomationOperationKind,
  type AutomationOutcome,
  type AutomationStopReceiptV1,
  type AutomationUsageAttributionV1,
  type AutomationUsageEventV1,
  type CampaignAutomationBudgetReservationV1,
  type CampaignAutomationReservationContextV1,
  type CampaignAuthoringOperation,
  type GenericAutomationBudgetReservationV1,
  type ProgramAuthorizationV1,
  type ProgramUnitKind,
} from '../../core/automation/budget';
import {
  assertCampaignAuthorizationForRun,
  campaignAuthoringContextKey,
  campaignAutomationRunId,
  sealCampaignAuthoringTerminal,
  validateCampaignAuthoringTerminal,
  type CampaignAuthoringBudgetTerminalV1,
  type CampaignAuthoringTerminalReason,
} from '../../core/automation/campaign-authoring-budget';
import {
  projectAutomationBudgetSlice,
  type AutomationBudgetBoardSliceV1,
} from '../../core/automation/projection';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

export const AUTOMATION_BUDGET_STORE_RELATIVE_ROOT = 'repo-harness/automation-budget/v1';

/**
 * Time may not run backwards over a run's own durable records. A regression
 * means the host clock is not the authority it claims to be, so the run stops
 * for explicit reconciliation instead of spending against a deadline it can no
 * longer measure.
 */
function assertClockNotRegressed(
  runId: string,
  budgetSha256: string,
  now: string,
  latestObserved: string,
  operation: AutomationOperationKind,
): void {
  if (Date.parse(now) >= Date.parse(latestObserved)) return;
  throw new AutomationBudgetStoreError(
    'automation_budget_clock_regression',
    `automation budget clock regressed: store time ${now} precedes the durable record time ${latestObserved}`,
    Object.freeze({
      protocol: 1 as const,
      kind: 'repo-harness-automation-budget-refusal' as const,
      automation_run_id: runId,
      budget_sha256: budgetSha256,
      refusal_code: 'clock_regression' as const,
      operation,
      idempotency_key: 'clock-regression',
      metric: null,
      limit: null,
      consumed: null,
      reserved: null,
      would_consume: null,
      refused_at: now,
    }),
  );
}

const RUN_ID = /^[0-9a-f]{64}$/u;

import { assertProgramAuthorizationAnchored } from './grant-store';
import {
  automationClockIsInjected,
  automationStoreNow,
  clockIsBelowFilesystemFloor,
  newestModifiedMs,
} from './clock';

/**
 * Every kind of thing this store puts on disk, with the order it is written in
 * and the drift face that covers a crash immediately after it.
 *
 * This exists because a record kind nothing reads is a record kind nothing can
 * recover: `reconciliations/` was written for two rounds before anything folded
 * it, so a crash between the decision and its charge silently lost the
 * decision. Adding a kind means adding a row here, and the meta-test in
 * `tests/unit/issue-282-automation-budget-store.test.ts` fails if the run
 * directory ever holds something this list does not name.
 */
export type AutomationRecordRole = 'durable' | 'derived' | 'projection' | 'transient';

/**
 * A temporary file left by a crash inside a write's critical section. Every
 * publication writes under a dot-prefixed, non-`.json` name and then links or
 * renames it, so a leftover is inert by construction: nothing counts it, folds
 * it, or resolves through it.
 */
export const AUTOMATION_TRANSIENT_ENTRY_PATTERN = /^\.[^/]+\.tmp-\d+-\d+-[0-9a-z]*$/u;

export interface AutomationRecordKindV1 {
  readonly id: string;
  /** Path relative to the run directory, or to the store root for `store` scope. */
  readonly relative_path: string;
  readonly scope: 'run' | 'store';
  readonly role: AutomationRecordRole;
  /** Where this sits in the publication order of one operation. */
  readonly write_order: string;
  /** Faces that cover a crash immediately after this record lands. */
  readonly drift_faces: readonly AutomationCurrentDrift[];
  /** True when `detectAutomationCurrentDrift` counts it against the projection. */
  readonly counted: boolean;
}

export const AUTOMATION_RECORD_KINDS: readonly AutomationRecordKindV1[] = Object.freeze([
  Object.freeze({
    id: 'budget',
    relative_path: 'budgets',
    scope: 'store' as const,
    role: 'durable' as const,
    write_order: 'published first, under the run lock and after drift detection, before any run record cites it',
    drift_faces: Object.freeze([]),
    counted: false,
  }),
  Object.freeze({
    id: 'reservation-index',
    relative_path: 'reservations/by-digest',
    scope: 'run' as const,
    role: 'derived' as const,
    write_order: 'linked before the counted reservation, inside one temp-file critical section',
    drift_faces: Object.freeze([]),
    counted: false,
  }),
  Object.freeze({
    id: 'reservation',
    relative_path: 'reservations',
    scope: 'run' as const,
    role: 'durable' as const,
    write_order: 'linked after its index and before current.json',
    drift_faces: Object.freeze(['unlisted_reservation'] as const),
    counted: true,
  }),
  Object.freeze({
    id: 'ledger-event',
    relative_path: 'events',
    scope: 'run' as const,
    role: 'durable' as const,
    write_order: 'usage follows its reservation/reconciliation; campaign step admission/completion are local charges/outcomes; every event is published before current.json',
    drift_faces: Object.freeze(['unfolded_event'] as const),
    counted: true,
  }),
  Object.freeze({
    id: 'reconciliation',
    relative_path: 'reconciliations',
    scope: 'run' as const,
    role: 'durable' as const,
    write_order: 'published after drift detection and before the usage event it decides',
    drift_faces: Object.freeze(['unconsumed_reconciliation'] as const),
    counted: true,
  }),
  Object.freeze({
    id: 'reconciliation-repair',
    relative_path: 'reconciliations/repairs',
    scope: 'run' as const,
    role: 'durable' as const,
    write_order: 'operator-only evidence repair receipt precedes its usage event and is read on exact replay; usage remains the sole charge',
    drift_faces: Object.freeze(['unconsumed_reconciliation'] as const),
    counted: false,
  }),
  Object.freeze({
    id: 'campaign-terminal',
    relative_path: 'campaign-terminals',
    scope: 'run' as const,
    role: 'durable' as const,
    write_order: 'published under the run lock after every group authoring reservation has a usage event',
    drift_faces: Object.freeze([]),
    counted: false,
  }),
  Object.freeze({
    id: 'stop-receipt',
    relative_path: 'stop-receipt.json',
    scope: 'run' as const,
    role: 'durable' as const,
    write_order: 'published after the charge that exhausted the budget and before current.json',
    drift_faces: Object.freeze(['unadopted_stop_receipt', 'unsealed_exhaustion'] as const),
    counted: false,
  }),
  Object.freeze({
    id: 'current-projection',
    relative_path: 'current.json',
    scope: 'run' as const,
    role: 'projection' as const,
    write_order: 'renamed last, after every durable record of the operation',
    drift_faces: Object.freeze([]),
    counted: false,
  }),
  Object.freeze({
    id: 'temp',
    relative_path: '.<name>.tmp-<pid>-<ms>-<rand>',
    scope: 'run' as const,
    role: 'transient' as const,
    write_order: 'created and then linked or renamed away inside one critical section, and unlinked in its finally; a crash can leave one behind',
    drift_faces: Object.freeze([]),
    counted: false,
  }),
] as const);

/**
 * The persistent run-directory entries the enumeration accounts for. Transient
 * temp files are excluded: they are dot-prefixed, may or may not exist, and a
 * leftover one is inert -- `AUTOMATION_TRANSIENT_ENTRY_PATTERN` is what
 * recognises them.
 */
export const AUTOMATION_RUN_DIRECTORY_ENTRIES: readonly string[] = Object.freeze(
  AUTOMATION_RECORD_KINDS
    .filter((kind) => kind.scope === 'run' && kind.role !== 'transient' && !kind.relative_path.includes('/'))
    .map((kind) => kind.relative_path)
    .sort(),
);

export type AutomationBudgetStoreErrorCode =
  | 'campaign_retry_policy_required'
  | 'campaign_retry_exhausted'
  | 'campaign_retry_backoff'
  | 'automation_budget_clock_regression'
  | 'automation_budget_store_unavailable'
  | 'automation_budget_store_unsafe'
  | 'automation_budget_store_invalid'
  | 'automation_budget_store_not_found'
  | 'automation_budget_store_conflict'
  | 'automation_budget_refused'
  | 'automation_budget_reconciliation_evidence_missing';

export class AutomationBudgetStoreError extends Error {
  constructor(
    readonly code: AutomationBudgetStoreErrorCode,
    message: string,
    readonly refusal: AutomationBudgetRefusalV1 | null = null,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AutomationBudgetStoreError';
  }
}

function fail(code: AutomationBudgetStoreErrorCode, message: string, cause?: unknown): never {
  throw new AutomationBudgetStoreError(code, message, null, cause);
}

interface StorePaths {
  readonly common: string;
  readonly root: string;
  readonly budgets: string;
  readonly runs: string;
  readonly locks: string;
}

interface RunPaths extends StorePaths {
  readonly run: string;
  readonly current: string;
  readonly reservations: string;
  readonly reservationsByDigest: string;
  readonly events: string;
  readonly reconciliations: string;
  readonly campaignTerminals: string;
  readonly stopReceipt: string;
  readonly lockRelative: string;
}

function assertRunId(runId: string): string {
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) {
    fail('automation_budget_store_unsafe', `unsafe automation run id: ${JSON.stringify(runId)}`);
  }
  return runId;
}

function storePaths(repoRoot: string): StorePaths {
  const common = resolve(resolveGitCommonDirectory(repoRoot));
  const root = join(common, AUTOMATION_BUDGET_STORE_RELATIVE_ROOT);
  return Object.freeze({
    common,
    root,
    budgets: join(root, 'budgets'),
    runs: join(root, 'runs'),
    locks: join(root, 'locks'),
  });
}

function runPaths(repoRoot: string, runId: string): RunPaths {
  assertRunId(runId);
  const base = storePaths(repoRoot);
  const run = join(base.runs, runId);
  return Object.freeze({
    ...base,
    run,
    current: join(run, 'current.json'),
    reservations: join(run, 'reservations'),
    // Reservations are stored under their idempotency-key digest, which is what
    // a replay looks up. `by-digest` is a hard-link index of the same inodes
    // under their reservation digest, so resolving one listed open reservation
    // is a single stat and parse instead of a scan of every record. It holds no
    // bytes of its own: it is a second name for one file, not a second copy.
    //
    // Write order (see `writeExclusive`): index first, counted record second,
    // `current.json` last. Invariant: a counted record exists => its index
    // exists. A crash before the counted link leaves an index entry that
    // `jsonEntries` does not count and `current.json` does not reference, which
    // the store already handles as "the record was never written".
    reservationsByDigest: join(run, 'reservations', 'by-digest'),
    events: join(run, 'events'),
    reconciliations: join(run, 'reconciliations'),
    campaignTerminals: join(run, 'campaign-terminals'),
    stopReceipt: join(run, 'stop-receipt.json'),
    lockRelative: `${AUTOMATION_BUDGET_STORE_RELATIVE_ROOT}/locks/${runId}.lock`,
  });
}

function pathSegments(root: string, target: string): string[] {
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || /^[A-Za-z]:/u.test(scoped)) {
    fail('automation_budget_store_unsafe', `automation budget path escapes the Git common directory: ${target}`);
  }
  return scoped.split(sep).filter(Boolean);
}

function syncDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function ensureDirectory(common: string, target: string): void {
  let current = common;
  for (const segment of pathSegments(common, target)) {
    current = join(current, segment);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        fail('automation_budget_store_unsafe', `automation budget directory is unsafe: ${current}`);
      }
      continue;
    } catch (error) {
      if (error instanceof AutomationBudgetStoreError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        fail('automation_budget_store_unavailable', `cannot inspect automation budget directory: ${current}`, error);
      }
    }
    try {
      mkdirSync(current, { mode: 0o700 });
    } catch (mkdirError) {
      if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') {
        fail('automation_budget_store_unavailable', `cannot create automation budget directory: ${current}`, mkdirError);
      }
    }
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('automation_budget_store_unsafe', `automation budget directory is unsafe: ${current}`);
    }
    syncDirectory(dirname(current));
  }
}

function prepareRun(paths: RunPaths): void {
  for (const target of [paths.root, paths.budgets, paths.runs, paths.locks, paths.run, paths.reservations, paths.reservationsByDigest, paths.events, paths.reconciliations, paths.campaignTerminals]) {
    ensureDirectory(paths.common, target);
  }
}

function writeAll(descriptor: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
}

/**
 * Create-once persistence with complete content.
 *
 * The record is written and fsynced under a temporary name that no reader
 * scans, then published with `link`, which is atomic and fails `EEXIST` exactly
 * like `O_EXCL`. Creating the final path directly would make the file visible
 * before its bytes were durable, so a crash could leave an empty or truncated
 * record that nothing can parse and that no same-key retry can replace. Here
 * "the file exists" means "its content is complete"; a leftover temporary file
 * is garbage that no scan counts and the next attempt replaces.
 */
function writeExclusive(path: string, bytes: string, label: string, indexPath?: string): boolean {
  const temp = join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, Buffer.from(bytes, 'utf8'));
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    if (indexPath !== undefined) {
      // Order is the whole guarantee: the index is linked BEFORE the counted
      // name, so "the counted record exists" implies "its index exists". The
      // reverse prefix -- index linked, counted name not yet -- leaves an entry
      // nothing counts, folds, or resolves, which is indistinguishable from the
      // record never having been written. Linking the counted name first would
      // instead produce a counted record with no index, which the digest
      // resolver reports as corruption forever.
      try {
        linkSync(temp, indexPath);
      } catch (error) {
        // The same record digest always carries the same bytes, so an index
        // entry left by an interrupted attempt is already the right one.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      syncDirectory(dirname(indexPath));
    }
    try {
      linkSync(temp, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
    syncDirectory(dirname(path));
    return true;
  } catch (error) {
    return fail('automation_budget_store_unavailable', `cannot persist ${label}`, error);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    try {
      unlinkSync(temp);
    } catch {
      // The temporary file may never have been created, or may already be gone.
    }
  }
}

function writeAtomic(path: string, bytes: string, label: string): void {
  const temp = join(dirname(path), `.${'current'}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, Buffer.from(bytes, 'utf8'));
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temp, path);
    syncDirectory(dirname(path));
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    try {
      unlinkSync(temp);
    } catch {
      // The temp file may never have been created; the original error wins.
    }
    fail('automation_budget_store_unavailable', `cannot persist ${label}`, error);
  }
}

function readRaw(path: string, label: string): string {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail('automation_budget_store_not_found', `${label} is missing`);
    return fail('automation_budget_store_unavailable', `cannot inspect ${label}`, error);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('automation_budget_store_unsafe', `${label} is not a regular file`);
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    return fail('automation_budget_store_unavailable', `cannot read ${label}`, error);
  }
}

function parse<T>(raw: string, validate: (value: T) => T, label: string): T {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return fail('automation_budget_store_invalid', `${label} is not valid JSON`, error);
  }
  try {
    return validate(value as T);
  } catch (error) {
    return fail('automation_budget_store_invalid', `${label} is invalid: ${(error as Error).message}`, error);
  }
}

function bytes(value: unknown): string {
  return `${canonicalAutomationJson(value)}\n`;
}

function keyDigest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The trust boundary.
 *
 * A budget object is only self-consistent; these checks make it *derived*. The
 * task contract is read from the repository and digested here, so a caller
 * cannot hand the store a summary of a contract that says something the
 * contract does not, and a run with no contract has to be granted one
 * explicitly rather than getting one by omission.
 */
function assertBudgetAuthorities(repoRoot: string, budget: AutomationBudgetV1, env: NodeJS.ProcessEnv = process.env): void {
  const grant = budget.authorization;
  if (budget.repository_id !== grant.repository_id) {
    fail('automation_budget_store_invalid', 'automation budget repository_id does not match the grant it cites');
  }
  // Re-anchored on every read, not only at publish: a grant an operator revoked
  // or edited must stop the run at the next verb rather than at the next
  // publication, which may never come.
  assertProgramAuthorizationAnchored(repoRoot, grant, env);
  if (grant.contract_scope === 'contract_less') {
    if (budget.contract_sha256 !== null || budget.contract_limits !== null) {
      fail('automation_budget_store_invalid', 'a contract-less grant cannot carry task-contract limits');
    }
    return;
  }
  const contractRelative = grant.contract_path;
  if (contractRelative === null) fail('automation_budget_store_invalid', 'a task-contract grant must name its contract path');
  // Containment is checked on real paths: a parent directory that is a symlink
  // out of the repository would otherwise pass a purely lexical check.
  const absolute = resolve(repoRoot, contractRelative);
  let realRepoRoot: string;
  let realParent: string;
  try {
    realRepoRoot = realpathSync(resolve(repoRoot));
    realParent = realpathSync(dirname(absolute));
  } catch (error) {
    return fail('automation_budget_store_unavailable', `cannot resolve the task contract path: ${contractRelative}`, error);
  }
  const scoped = relative(realRepoRoot, join(realParent, basename(absolute)));
  if (scoped === '' || scoped === '..' || scoped.startsWith(`..${sep}`) || /^[A-Za-z]:/u.test(scoped)) {
    fail('automation_budget_store_unsafe', `task contract path escapes the repository: ${contractRelative}`);
  }
  // `readRaw` performs the final-segment lstat: a symlinked or non-regular
  // contract file is rejected there, and a missing one reports as missing.
  const text = readRaw(absolute, `task contract ${contractRelative}`);
  const digest = createHash('sha256').update(text, 'utf8').digest('hex');
  if (budget.contract_sha256 !== digest) {
    fail('automation_budget_store_invalid', `automation budget contract_sha256 does not match the bytes of ${contractRelative}`);
  }
  let parsed;
  try {
    parsed = parseContractDelegationBudget(text, contractRelative);
  } catch (error) {
    return fail('automation_budget_store_invalid', `task contract ${contractRelative} delegation budget is unreadable: ${(error as Error).message}`, error);
  }
  if (canonicalAutomationJson(budget.contract_limits) !== canonicalAutomationJson(parsed)) {
    fail('automation_budget_store_invalid', `automation budget contract_limits do not match the delegation budget in ${contractRelative}`);
  }
}

/**
 * Token and cost limits are fail-closed in this slice.
 *
 * Enforcing them needs two things the store does not have yet: provider metric
 * support read from the provider capability authority by revision, and consumed
 * usage that references a provider-attested usage record the store re-reads. A
 * self-asserted number is worse than no limit, so a configured one is refused
 * at preflight instead. See `tasks/todos.md` for the enabling trigger.
 */
function assertTokenLimitsUnenforceable(budget: AutomationBudgetV1): void {
  for (const metric of AUTOMATION_VERIFIED_USAGE_METRICS) {
    if (budget.effective_limits[AUTOMATION_METRIC_LIMIT_FIELDS[metric]] !== null) {
      fail(
        'automation_budget_store_invalid',
        `a hard ${metric} limit is not enforceable: the store has no provider-attested usage authority wired, so the limit is refused rather than treated as advisory`,
      );
    }
  }
  if (budget.metric_support.verified_metrics.length > 0) {
    fail(
      'automation_budget_store_invalid',
      'metric support claims verified provider usage, but the store reads no provider usage authority; declare no verified metrics',
    );
  }
}

export function readAutomationBudget(repoRoot: string, budgetSha256: string, env: NodeJS.ProcessEnv = process.env): AutomationBudgetV1 {
  const paths = storePaths(repoRoot);
  if (!/^[0-9a-f]{64}$/u.test(budgetSha256)) fail('automation_budget_store_unsafe', 'unsafe automation budget digest');
  const budget = parse(readRaw(join(paths.budgets, `${budgetSha256}.json`), 'automation budget'), validateAutomationBudget, 'automation budget');
  if (budget.budget_sha256 !== budgetSha256) fail('automation_budget_store_invalid', 'automation budget digest does not match its path');
  assertTokenLimitsUnenforceable(budget);
  assertBudgetAuthorities(repoRoot, budget, env);
  return budget;
}

function readCurrentOptional(paths: RunPaths): AutomationBudgetCurrentV1 | null {
  if (!existsSync(paths.current)) return null;
  return parse(readRaw(paths.current, 'automation budget current'), validateAutomationBudgetCurrent, 'automation budget current');
}

export interface AutomationReconciliationRecordV1 {
  readonly reservation_sha256: string;
  readonly resolution: AutomationUsageEventV1['resolution'];
  readonly reason: string;
}

/**
 * The reconciliation decision for one reservation, if an operator recorded one.
 * It is a decision, not a charge: the usage event is still what spends. Reading
 * it back is what stops a plain append from overwriting a recorded resolution
 * with a cheaper one after a crash.
 */
function readReconciliationOptional(paths: RunPaths, reservationSha256: string): AutomationReconciliationRecordV1 | null {
  const path = join(paths.reconciliations, `${reservationSha256}.json`);
  if (!existsSync(path)) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readRaw(path, 'automation reconciliation')) as Record<string, unknown>;
  } catch (error) {
    return fail('automation_budget_store_invalid', 'automation reconciliation is not valid JSON', error);
  }
  if (parsed.reservation_sha256 !== reservationSha256 || typeof parsed.resolution !== 'string' || typeof parsed.reason !== 'string') {
    fail('automation_budget_store_invalid', `automation reconciliation ${reservationSha256} is malformed`);
  }
  return Object.freeze({
    reservation_sha256: reservationSha256,
    resolution: parsed.resolution as AutomationUsageEventV1['resolution'],
    reason: parsed.reason,
  });
}

function readStopReceiptOptional(paths: RunPaths): AutomationStopReceiptV1 | null {
  if (!existsSync(paths.stopReceipt)) return null;
  return parse(readRaw(paths.stopReceipt, 'automation stop receipt'), validateAutomationStopReceipt, 'automation stop receipt');
}

export interface AutomationBudgetStatusV1 {
  readonly budget: AutomationBudgetV1;
  /**
   * Durable truth: the stored projection when it agrees with the records, and a
   * read-only re-fold of those records when it does not. Every caller reads
   * this, so no surface reports counts a crash left behind.
   */
  readonly current: AutomationBudgetCurrentV1;
  /** Exactly the bytes on disk, so the projection chain links to a real record. */
  readonly stored_current: AutomationBudgetCurrentV1;
  readonly stop_receipt: AutomationStopReceiptV1 | null;
  /** Which durable record, if any, the stored projection has not adopted yet. */
  readonly drift: AutomationCurrentDrift;
  /** Newest timestamp among the run's durable records, when they were re-folded. */
  readonly latest_record_at: string | null;
}

/**
 * The public read. It never writes, and it never throws on the repairable
 * direction of drift -- a projection that lags a durable record is an expected
 * crash window -- but it does not report stale counts either: those records are
 * re-folded read-only and `current` is that folded truth, with `drift` saying
 * the stored projection has not caught up. The opposite direction, a projection
 * counting records the disk does not have, is corruption and throws.
 */
export function readAutomationBudgetStatus(repoRoot: string, runId: string, env: NodeJS.ProcessEnv = process.env): AutomationBudgetStatusV1 {
  return readAutomationBudgetStatusAt(repoRoot, runId, automationStoreNow(), env);
}

/**
 * The same read against one exact instant. `now` is internal: it comes from the
 * store clock at the top of a read, never from a caller, and exists so a single
 * read renders every time-dependent field from one instant instead of sampling
 * the clock twice and reporting two different moments as one state.
 */
function readAutomationBudgetStatusAt(repoRoot: string, runId: string, now: string, env: NodeJS.ProcessEnv = process.env): AutomationBudgetStatusV1 {
  const paths = runPaths(repoRoot, runId);
  const current = readCurrentOptional(paths);
  if (current === null) fail('automation_budget_store_not_found', `automation run ${runId} has no budget`);
  const budget = readAutomationBudget(repoRoot, current.budget_sha256, env);
  if (budget.automation_run_id !== runId) fail('automation_budget_store_invalid', 'automation budget does not belong to this run');
  for (const entry of jsonEntries(paths.reservations)) {
    const reservation = parse(
      readRaw(join(paths.reservations, entry), 'automation reservation'),
      validateAutomationReservation,
      'automation reservation',
    );
    assertReservationKindForBudget(budget, reservation);
  }
  const receipt = readStopReceiptOptional(paths);
  if (current.stop_receipt_sha256 !== null && receipt === null) {
    fail('automation_budget_store_invalid', 'automation budget current names a stop receipt that is missing');
  }
  if (receipt !== null
    && current.stop_receipt_sha256 !== null
    && current.stop_receipt_sha256 !== receipt.stop_receipt_sha256) {
    fail('automation_budget_store_invalid', 'automation stop receipt does not match the current projection');
  }
  const drift = detectAutomationCurrentDrift(paths, budget, current, now);
  const derived = drift === 'none' ? null : deriveCurrentFromDurableRecords(paths, budget, current, receipt, now);
  return Object.freeze({
    budget,
    current: derived === null ? current : derived.current,
    stored_current: current,
    stop_receipt: receipt,
    drift,
    latest_record_at: derived === null ? null : derived.latest_record_at,
  });
}

/**
 * The one recovery for a durable record `current.json` does not agree with.
 *
 * Every record except `current.json` is create-once and fsynced before the
 * projection is renamed, so a crash can only ever leave the projection behind
 * the durable records -- never ahead of them. That makes `current.json` a
 * derived projection of every durable record kind -- see
 * `AUTOMATION_RECORD_KINDS` -- and the repair is a re-derivation rather than a
 * guess: a reservation with no event is the interrupted operation, an event the
 * projection has not folded in is a charge that already happened, a
 * reconciliation with no event is a decision waiting on its charge, and a stop
 * receipt the projection has not adopted means the run is already stopped.
 * Nothing is ever silently re-minted, and no metric is ever assumed to be zero.
 *
 * Drift is detected by counting directory entries and then resolving each
 * record through the by-digest index, never by re-listing `reservations/` per
 * record. The healthy path is exactly: three `readdir` calls (events,
 * reservations, reconciliations), one `existsSync` for the stop receipt, one
 * `existsSync` per usage event, two `existsSync` per reconciliation, and -- only
 * while an operation is in flight -- one `existsSync` plus one parse for the
 * single open reservation. No record's contents are read except that one. The
 * full re-derivation, which does parse every record, only runs after a crash.
 */
function jsonEntries(directory: string): readonly string[] {
  if (!existsSync(directory)) return Object.freeze([]);
  try {
    return Object.freeze(readdirSync(directory).filter((entry) => entry.endsWith('.json')).sort());
  } catch (error) {
    return fail('automation_budget_store_unavailable', `cannot list ${directory}`, error);
  }
}

function campaignStepEventPath(paths: RunPaths, event: CampaignBudgetStepEventV1): string {
  return join(paths.events, `step-${campaignBudgetStepKey(event)}-${event.kind === CAMPAIGN_STEP_ADMISSION_KIND ? 'admission' : 'completion'}.json`);
}

function readLedgerEvents(paths: RunPaths): readonly AutomationLedgerEventV1[] {
  return jsonEntries(paths.events).map(entry => {
    const event = parse(readRaw(join(paths.events, entry), 'automation ledger event'), validateAutomationLedgerEvent, 'automation ledger event');
    const expected = event.kind === AUTOMATION_USAGE_EVENT_KIND
      ? join(paths.events, `${event.reservation_sha256}.json`) : campaignStepEventPath(paths, event);
    if (join(paths.events, entry) !== expected) fail('automation_budget_store_invalid', 'automation ledger event filename does not bind its identity');
    return event;
  }).sort((a, b) => a.step_index - b.step_index);
}

function readLedgerReservations(paths: RunPaths): readonly AutomationBudgetReservationV1[] {
  return jsonEntries(paths.reservations).map(entry => parse(readRaw(join(paths.reservations, entry), 'automation reservation'), validateAutomationReservation, 'automation reservation'));
}

function campaignLedger(paths: RunPaths, budget: AutomationBudgetV1): CampaignBudgetLedgerV1 {
  return foldStoredCampaignLedger(paths, budget, readLedgerEvents(paths), readLedgerReservations(paths));
}

function foldStoredCampaignLedger(
  paths: RunPaths, budget: AutomationBudgetV1,
  events: readonly AutomationLedgerEventV1[], reservations: readonly AutomationBudgetReservationV1[],
): CampaignBudgetLedgerV1 {
  // Completed steps survive revisions, but a sealed record alone cannot grant
  // authority: only the current budget and its published ancestors may appear.
  const remaining = new Set(events.filter(event => event.kind !== AUTOMATION_USAGE_EVENT_KIND).map(event => event.budget_sha256));
  let revision = budget;
  remaining.delete(revision.budget_sha256);
  while (remaining.size > 0 && revision.supersedes_sha256 !== null) {
    const digest = revision.supersedes_sha256;
    const previous = parse(readRaw(join(paths.budgets, `${digest}.json`), 'campaign budget ancestor'), validateAutomationBudget, 'campaign budget ancestor');
    if (previous.budget_sha256 !== digest || previous.automation_run_id !== budget.automation_run_id
      || previous.authorization.authorization_sha256 !== budget.authorization.authorization_sha256
      || previous.revision !== revision.revision - 1) {
      fail('automation_budget_store_invalid', 'campaign step budget ancestry is invalid');
    }
    remaining.delete(previous.budget_sha256);
    revision = previous;
  }
  if (remaining.size > 0) fail('automation_budget_store_invalid', 'campaign step budget is not a published ancestor');
  return foldCampaignBudgetLedger(budget, events, reservations);
}

/**
 * Which durable record the stored projection has not adopted -- and, crucially,
 * in which direction the two disagree.
 *
 * The write ordering only ever leaves the projection *behind* the records: each
 * record is fsynced and published before `current.json` is renamed. So "more
 * records than the projection counts" is the expected crash window and is
 * repairable by re-folding. The opposite direction -- the projection counting
 * records the disk does not have -- cannot be produced by any write ordering.
 * It means a record was lost, truncated away, or deleted from outside, and
 * re-folding it would rebuild a smaller ledger and silently forgive real spend.
 * That direction is corruption and stays fail-closed on every verb and every
 * read surface; nothing is folded and nothing is written.
 */
export function detectAutomationCurrentDrift(
  paths: RunPaths,
  budget: AutomationBudgetV1,
  current: AutomationBudgetCurrentV1,
  now: string,
): AutomationCurrentDrift {
  // The healthy path is exactly two directory listings plus one stat and parse
  // per open reservation, of which there is at most one.
  const eventNames = jsonEntries(paths.events);
  const events = eventNames.length;
  const usageNames = eventNames.filter(entry => !entry.startsWith('step-'));
  if (budget.authorization.campaign !== null) {
    const records = readLedgerEvents(paths);
    foldStoredCampaignLedger(paths, budget, records, readLedgerReservations(paths));
    let prefix = AUTOMATION_LEDGER_GENESIS;
    for (const event of records.slice(0, current.event_count)) prefix = chainAutomationLedgerDigest(prefix, event.event_sha256);
    if (records.length >= current.event_count && prefix !== current.ledger_sha256) fail('automation_budget_store_invalid', 'campaign ledger contradicts the stored durable prefix');
  } else if (usageNames.length !== events) fail('automation_budget_store_invalid', 'generic ledger cannot contain campaign step events');
  const reservations = jsonEntries(paths.reservations).length;
  if (events < current.event_count) {
    fail(
      'automation_budget_store_invalid',
      `automation ledger is missing usage events: the projection counts ${current.event_count} but ${events} are on disk`,
    );
  }
  const listedOpen = current.open_reservation_sha256s.length;
  // Every usage event was written against a reservation, so there can never be
  // fewer reservation files than events. The projection's own open list is not
  // added here: in the unfolded-event window the same reservation is still
  // listed open while its event already exists, which is one file, not two.
  if (reservations < usageNames.length) {
    fail(
      'automation_budget_store_invalid',
      `automation ledger is missing reservations: ${events} usage events are on disk but only ${reservations} reservations are`,
    );
  }
  // Totals alone are forgeable by coincidence: an orphan reservation from one
  // crash can make up the count of a reservation genuinely lost from under a
  // charged event. Every event names its reservation in its own file name, so
  // each one is resolved through the by-digest index -- one `existsSync` per
  // event against a known path, never a re-listing of `reservations/` -- and a
  // charge whose reservation is gone is corruption.
  for (const entry of usageNames) {
    const digest = entry.replace(/\.json$/u, '');
    if (!existsSync(join(paths.reservationsByDigest, `${digest}.json`))) {
      fail('automation_budget_store_invalid', `automation ledger is missing the reservation ${digest} that a usage event charges`);
    }
  }
  // Counts alone cannot see an open reservation whose own file went missing
  // while an unrelated one appeared, so each listed digest is resolved against
  // the by-digest index: one stat and one parse for the single open
  // reservation, never a scan of every record.
  for (const digest of current.open_reservation_sha256s) {
    const indexed = join(paths.reservationsByDigest, `${digest}.json`);
    if (!existsSync(indexed)) {
      fail('automation_budget_store_invalid', `automation ledger is missing the open reservation ${digest} the projection lists`);
    }
    const stored = parse(readRaw(indexed, 'automation reservation'), validateAutomationReservation, 'automation reservation');
    if (stored.reservation_sha256 !== digest) {
      fail('automation_budget_store_invalid', `automation reservation index entry ${digest} holds a different reservation`);
    }
  }
  // The stop receipt leaves the entry counts of the other two directories
  // untouched, so it has to be probed on its own or the crash window between
  // writing it and renaming the projection is invisible here.
  if (current.stop_receipt_sha256 === null && existsSync(paths.stopReceipt)) return 'unadopted_stop_receipt';
  if (events > current.event_count) return 'unfolded_event';
  if (reservations > usageNames.length + listedOpen) return 'unlisted_reservation';
  // A reconciliation decision with no charge behind it is the crash window
  // between recording the decision and committing the usage event. The
  // reservation stays open and the run stays in reconciliation until the event
  // lands under that exact recorded resolution.
  for (const entry of jsonEntries(paths.reconciliations)) {
    const digest = entry.replace(/\.json$/u, '');
    if (!existsSync(join(paths.reservationsByDigest, `${digest}.json`))) {
      fail('automation_budget_store_invalid', `automation ledger is missing the reservation ${digest} that a reconciliation decides`);
    }
    if (!existsSync(join(paths.events, `${digest}.json`))) return 'unconsumed_reconciliation';
  }
  // The last face has no record of its own. `commitUsage` writes the charge and
  // then seals the receipt, so a crash between the two leaves counts that agree
  // with each other and a run that is over but says it is active. Recomputing
  // the refusal from the counts is the only thing that can see it.
  if (current.stop_receipt_sha256 === null && exhaustionRefusal(budget, current, now) !== null) {
    return 'unsealed_exhaustion';
  }
  return 'none';
}

/**
 * Re-derive the projection from the durable records. This does not write, so
 * the read-only surfaces can render durable counts instead of the stale ones
 * the projection still holds, and the mutating verbs reuse the same derivation
 * before persisting it. It only ever runs on the repairable direction of drift:
 * `detectAutomationCurrentDrift` has already refused the case where records are
 * missing, so this can never rebuild a smaller ledger than the one on disk.
 */
function deriveCurrentFromDurableRecords(
  paths: RunPaths,
  budget: AutomationBudgetV1,
  storedCurrent: AutomationBudgetCurrentV1,
  stopReceipt: AutomationStopReceiptV1 | null,
  derivedAt: string,
): { readonly current: AutomationBudgetCurrentV1; readonly latest_record_at: string | null } {
  const events = readLedgerEvents(paths);
  const reservations = jsonEntries(paths.reservations)
    .map((entry) => parse(readRaw(join(paths.reservations, entry), 'automation reservation'), validateAutomationReservation, 'automation reservation'));
  if (budget.authorization.campaign !== null) foldStoredCampaignLedger(paths, budget, events, reservations);
  const closed = new Set(events.filter((event): event is AutomationUsageEventV1 => event.kind === AUTOMATION_USAGE_EVENT_KIND).map(event => event.reservation_sha256));
  const open = reservations.filter((reservation) => !closed.has(reservation.reservation_sha256));
  // A reconciliation with no event is a decision that has not been charged yet.
  // It does not add consumption -- the event is what spends -- but it does mean
  // the run is waiting on an explicit resolution rather than merely idle.
  const undecided = jsonEntries(paths.reconciliations)
    .map((entry) => entry.replace(/\.json$/u, ''))
    .filter((digest) => !closed.has(digest));
  if (open.length > 1) {
    fail('automation_budget_store_conflict', 'more than one automation reservation is unresolved; this run cannot be reconciled automatically');
  }
  const folded = foldAutomationLedger(events, budget.authorization.campaign !== null);
  let ledger = AUTOMATION_LEDGER_GENESIS;
  for (const event of events) ledger = chainAutomationLedgerDigest(ledger, event.event_sha256);
  const nextStepIndex = folded.last_completed_step_index + 1;
  const held = open[0] ?? null;
  if (held !== null && held.step_index !== nextStepIndex) {
    fail('automation_budget_store_conflict', 'the unresolved automation reservation does not occupy the next controller step');
  }
  const current = sealAutomationBudgetCurrent({
    automation_run_id: storedCurrent.automation_run_id,
    budget_sha256: storedCurrent.budget_sha256,
    // A repaired run is one that was interrupted: the refusal it produces is
    // the same one an open reservation produces, so the next operation is
    // blocked until the interrupted one is appended or reconciled.
    state: stopReceipt !== null
      ? 'budget_exhausted'
      : held === null && undecided.length === 0 ? 'active' : 'reconciliation_required',
    consumed: folded.consumed,
    open_reserved: held === null ? emptyAutomationMetricVector() : held.reserved,
    consecutive_no_progress_steps: folded.consecutive_no_progress_steps,
    last_completed_step_index: folded.last_completed_step_index,
    next_step_index: nextStepIndex,
    open_reservation_sha256s: held === null ? [] : [held.reservation_sha256],
    event_count: folded.event_count,
    ledger_sha256: ledger,
    stop_receipt_sha256: stopReceipt === null ? null : stopReceipt.stop_receipt_sha256,
    previous_current_sha256: storedCurrent.current_sha256,
    updated_at: derivedAt,
  });
  const latest = [
    ...events.map((event) => event.observed_at),
    ...reservations.map((reservation) => reservation.reserved_at),
  ].sort().pop();
  return Object.freeze({ current, latest_record_at: latest ?? null });
}

function repairCurrentFromDurableRecords(
  repoRoot: string,
  paths: RunPaths,
  status: AutomationBudgetStatusV1,
  repairedAt: string,
): AutomationBudgetStatusV1 {
  const derived = deriveCurrentFromDurableRecords(paths, status.budget, status.stored_current, status.stop_receipt, repairedAt);
  const current = derived.current;
  if (derived.latest_record_at !== null) {
    assertClockNotRegressed(status.stored_current.automation_run_id, status.stored_current.budget_sha256, repairedAt, derived.latest_record_at, 'dispatch');
  }
  writeAtomic(paths.current, bytes(current), 'automation budget current');
  // A repair that folds in the last charge may itself reach a hard limit, so the
  // receipt is sealed here rather than left for whichever verb notices next.
  const refusal = status.stop_receipt === null ? exhaustionRefusal(status.budget, current, repairedAt) : null;
  if (refusal !== null) {
    const stopped = persistStopReceipt(paths, status.budget, current, refusal, [], repairedAt);
    return Object.freeze({
      budget: status.budget,
      current: stopped.current,
      stored_current: stopped.current,
      stop_receipt: stopped.receipt,
      drift: 'none' as const,
      latest_record_at: derived.latest_record_at,
    });
  }
  return Object.freeze({
    budget: status.budget,
    current,
    stored_current: current,
    stop_receipt: status.stop_receipt,
    drift: 'none' as const,
    latest_record_at: derived.latest_record_at,
  });
}

/**
 * Every mutating verb enters through here, inside the run lock, so no decision
 * is ever taken against a projection the durable records contradict.
 */
function lockedStatus(repoRoot: string, paths: RunPaths, runId: string, now: string, env: NodeJS.ProcessEnv = process.env): AutomationBudgetStatusV1 {
  const status = readAutomationBudgetStatusAt(repoRoot, runId, now, env);
  assertClockNotRegressed(status.stored_current.automation_run_id, status.stored_current.budget_sha256, now, status.stored_current.updated_at, 'dispatch');
  // The filesystem is host-trusted, so an inode timestamp is a lower bound on
  // real time that a frozen host clock cannot sit below. An installed test
  // clock replaces the host's notion of now wholesale, so the two would be
  // different clocks and the floor is not applied then.
  if (!automationClockIsInjected()
    && clockIsBelowFilesystemFloor(now, newestModifiedMs([paths.current, paths.events, paths.reservations, paths.stopReceipt]))) {
    throw new AutomationBudgetStoreError(
      'automation_budget_clock_regression',
      `automation budget clock ${now} precedes the filesystem floor of this run's durable records`,
    );
  }
  if (status.drift === 'none') return status;
  return repairCurrentFromDurableRecords(repoRoot, paths, status, now);
}

/**
 * The operator repair verb: it runs only the reconciliation every mutating verb
 * already performs under the run lock, so a stopped or expired run can seal the
 * exhaustion receipt its records already prove without invoking a business verb
 * that would reserve, charge or otherwise move the ledger.
 */
export function repairAutomationBudgetDrift(input: {
  readonly repo_root: string;
  readonly automation_run_id: string;
  readonly env?: NodeJS.ProcessEnv;
}): AutomationBudgetStatusV1 {
  const repoRoot = resolve(input.repo_root);
  const paths = runPaths(repoRoot, input.automation_run_id);
  // Repair reconciles an existing ledger; it never creates one. Preparing the
  // run directory first would materialise a store for a run that was never
  // published, so an unknown run fails closed with the same not-found error a
  // read reports and leaves no trace on disk.
  if (!existsSync(paths.current)) {
    fail('automation_budget_store_not_found', `automation run ${input.automation_run_id} has no budget`);
  }
  prepareRun(paths);
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () =>
    lockedStatus(repoRoot, paths, input.automation_run_id, automationStoreNow(), input.env));
}

/**
 * An unattended run may not start without a concrete enforceable budget. There
 * is no unlimited default and no advisory mode.
 */
export function requireUnattendedAutomationRunBudget(repoRoot: string, runId: string, env: NodeJS.ProcessEnv = process.env): AutomationBudgetStatusV1 {
  const paths = runPaths(repoRoot, runId);
  const current = readCurrentOptional(paths);
  requireUnattendedAutomationBudget(current === null ? null : readAutomationBudget(repoRoot, current.budget_sha256, env));
  return readAutomationBudgetStatus(repoRoot, runId, env);
}

/**
 * The read-only operator projection. It takes no time either: the wall-clock
 * row and the drift that decides the rendered state are both measured on the
 * store clock, so asking about the past cannot make an exhausted run look
 * running.
 */
export function readAutomationBudgetBoardSlice(
  repoRoot: string,
  runId: string,
  env: NodeJS.ProcessEnv = process.env,
): AutomationBudgetBoardSliceV1 {
  // One instant for the whole slice. Sampling the clock again for the
  // wall-clock row could straddle the deadline and render a run that the drift
  // check just called exhausted as active with time left, or the reverse.
  const observedAt = automationStoreNow();
  // `status.current` is already the durable truth: the read folds the records
  // when the stored projection lags, so the slice never renders counts a crash
  // left behind. `projection_stale` still says the stored projection has not
  // caught up.
  const status = readAutomationBudgetStatusAt(repoRoot, runId, observedAt, env);
  let campaign: CampaignBudgetLedgerV1 | null = null;
  if (status.budget.authorization.campaign !== null) {
    const paths = runPaths(repoRoot, runId);
    const events = readLedgerEvents(paths);
    const reservations = readLedgerReservations(paths);
    campaign = foldStoredCampaignLedger(paths, status.budget, events, reservations);
    const ledger = events.reduce((digest, event) => chainAutomationLedgerDigest(digest, event.event_sha256), AUTOMATION_LEDGER_GENESIS);
    const closed = new Set(events.filter((event): event is AutomationUsageEventV1 => event.kind === AUTOMATION_USAGE_EVENT_KIND).map(event => event.reservation_sha256));
    const open = reservations.filter(reservation => !closed.has(reservation.reservation_sha256)).map(reservation => reservation.reservation_sha256).sort();
    // Capture may race a writer. Reject mixed generations rather than report
    // new campaign metrics alongside an older current digest or held-call set.
    if (events.length !== status.current.event_count || ledger !== status.current.ledger_sha256
      || canonicalAutomationJson(open) !== canonicalAutomationJson([...status.current.open_reservation_sha256s].sort())) {
      fail('automation_budget_store_conflict', 'campaign budget changed during board read; read again');
    }
  }
  return projectAutomationBudgetSlice({
    budget: status.budget,
    current: status.current,
    stop_receipt: status.stop_receipt,
    drift: status.drift,
    observed_at: observedAt,
    campaign_ledger: campaign,
  });
}

function ledgerState(current: AutomationBudgetCurrentV1): AutomationBudgetStateV1 {
  return Object.freeze({
    consumed: current.consumed,
    open_reserved: current.open_reserved,
    consecutive_no_progress_steps: current.consecutive_no_progress_steps,
    open_reservation_sha256s: current.open_reservation_sha256s,
    state: current.state,
  });
}

// ---------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------

export interface PublishAutomationBudgetInput {
  readonly repo_root: string;
  readonly budget: AutomationBudgetV1;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Minting or revising a budget is a human-authorized act: the grant carries the
 * issuer, the budget carries the creator, and a revision must name the exact
 * revision it supersedes. Nothing in this module raises a limit on its own.
 */
export function publishAutomationBudget(input: PublishAutomationBudgetInput): AutomationBudgetStatusV1 {
  const budget = validateAutomationBudget(input.budget);
  const publishedAt = automationStoreNow();
  assertTokenLimitsUnenforceable(budget);
  // The grant is an authority only if an operator minted it into the harness
  // home; one that travels inside the budget it authorizes is self-issued.
  assertProgramAuthorizationAnchored(resolve(input.repo_root), budget.authorization, input.env);
  assertBudgetAuthorities(resolve(input.repo_root), budget, input.env);
  if (Date.parse(budget.created_at) > Date.parse(publishedAt)) {
    fail('automation_budget_store_invalid', 'an automation budget cannot be created in the future of the store clock');
  }
  const repoRoot = resolve(input.repo_root);
  const paths = runPaths(repoRoot, budget.automation_run_id);
  prepareRun(paths);
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    // Drift is detected before anything is written, so a corrupt run refuses
    // without this call leaving a budget record behind. "No write on
    // corruption" has to hold for the first write too.
    const preexisting = readCurrentOptional(paths);
    const existing = preexisting === null
      ? null
      : lockedStatus(repoRoot, paths, budget.automation_run_id, publishedAt, input.env).current;
    const budgetPath = join(paths.budgets, `${budget.budget_sha256}.json`);
    const encoded = bytes(budget);
    if (!writeExclusive(budgetPath, encoded, 'automation budget') && readRaw(budgetPath, 'automation budget') !== encoded) {
      fail('automation_budget_store_conflict', 'an automation budget with this digest already exists with different bytes');
    }
    if (existing === null) {
      if (budget.revision !== 1) fail('automation_budget_store_conflict', 'the first budget for a run must be revision 1');
      const current = sealAutomationBudgetCurrent({
        automation_run_id: budget.automation_run_id,
        budget_sha256: budget.budget_sha256,
        state: 'active',
        consumed: emptyAutomationMetricVector(),
        open_reserved: emptyAutomationMetricVector(),
        consecutive_no_progress_steps: 0,
        last_completed_step_index: 0,
        next_step_index: 1,
        open_reservation_sha256s: [],
        event_count: 0,
        ledger_sha256: AUTOMATION_LEDGER_GENESIS,
        stop_receipt_sha256: null,
        previous_current_sha256: null,
        updated_at: publishedAt,
      });
      writeAtomic(paths.current, bytes(current), 'automation budget current');
      return Object.freeze({ budget, current, stored_current: current, stop_receipt: null, drift: 'none' as const, latest_record_at: null });
    }
    if (existing.budget_sha256 === budget.budget_sha256) {
      return Object.freeze({ budget, current: existing, stored_current: existing, stop_receipt: readStopReceiptOptional(paths), drift: 'none' as const, latest_record_at: null });
    }
    if (existing.stop_receipt_sha256 !== null) {
      fail('automation_budget_store_conflict', 'an exhausted automation run cannot be revised; mint a new run');
    }
    const previous = readAutomationBudget(repoRoot, existing.budget_sha256, input.env);
    if (previous.authorization.campaign !== null
      && previous.authorization.authorization_sha256 !== budget.authorization.authorization_sha256) {
      fail('automation_budget_store_conflict', 'a campaign automation run cannot be rebound to another authorization');
    }
    if (budget.supersedes_sha256 !== previous.budget_sha256) {
      fail('automation_budget_store_conflict', 'a budget revision must supersede the exact current revision');
    }
    if (budget.revision !== previous.revision + 1) {
      fail('automation_budget_store_conflict', 'a budget revision must increment the revision counter by one');
    }
    // A new revision invalidates every controller decision taken under the old
    // one, and a reservation carries the exact revision that authorized it. A
    // revision published over an in-flight operation would therefore strand a
    // charge that can never land, so the publication waits for the run to be
    // quiescent instead. The ledger itself is revision-independent: consumption
    // already recorded stays recorded across the revision.
    if (existing.open_reservation_sha256s.length > 0) {
      fail(
        'automation_budget_store_conflict',
        'a budget revision cannot be published while an in-flight operation holds a reservation; append or reconcile it first',
      );
    }
    if (previous.authorization.campaign !== null && campaignLedger(paths, previous).active_step !== null) {
      fail(
        'automation_budget_store_conflict',
        'a budget revision cannot be published with an active campaign step; complete it first',
      );
    }
    const current = sealAutomationBudgetCurrent({
      automation_run_id: existing.automation_run_id,
      budget_sha256: budget.budget_sha256,
      state: 'active',
      consumed: existing.consumed,
      open_reserved: existing.open_reserved,
      consecutive_no_progress_steps: existing.consecutive_no_progress_steps,
      last_completed_step_index: existing.last_completed_step_index,
      next_step_index: existing.next_step_index,
      open_reservation_sha256s: existing.open_reservation_sha256s,
      event_count: existing.event_count,
      ledger_sha256: existing.ledger_sha256,
      stop_receipt_sha256: null,
      previous_current_sha256: existing.current_sha256,
      updated_at: publishedAt,
    });
    writeAtomic(paths.current, bytes(current), 'automation budget current');
    return Object.freeze({ budget, current, stored_current: current, stop_receipt: null, drift: 'none' as const, latest_record_at: null });
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

// ---------------------------------------------------------------------------
// Stop receipt
// ---------------------------------------------------------------------------

function persistStopReceipt(
  paths: RunPaths,
  budget: AutomationBudgetV1,
  current: AutomationBudgetCurrentV1,
  refusal: AutomationBudgetRefusalV1,
  inFlight: readonly AutomationInFlightAuthorityV1[],
  issuedAt: string,
): { readonly receipt: AutomationStopReceiptV1; readonly current: AutomationBudgetCurrentV1 } {
  const existing = readStopReceiptOptional(paths);
  if (existing !== null) {
    return Object.freeze({ receipt: existing, current });
  }
  const receipt = sealAutomationStopReceipt({
    budget,
    refusal,
    last_completed_step_index: current.last_completed_step_index,
    in_flight_authority: inFlight,
    ledger_sha256: current.ledger_sha256,
    issued_at: issuedAt,
  });
  const encoded = bytes(receipt);
  if (!writeExclusive(paths.stopReceipt, encoded, 'automation stop receipt')) {
    const stored = parse(readRaw(paths.stopReceipt, 'automation stop receipt'), validateAutomationStopReceipt, 'automation stop receipt');
    return Object.freeze({ receipt: stored, current });
  }
  const next = sealAutomationBudgetCurrent({
    automation_run_id: current.automation_run_id,
    budget_sha256: current.budget_sha256,
    state: 'budget_exhausted',
    consumed: current.consumed,
    open_reserved: current.open_reserved,
    consecutive_no_progress_steps: current.consecutive_no_progress_steps,
    last_completed_step_index: current.last_completed_step_index,
    next_step_index: current.next_step_index,
    open_reservation_sha256s: current.open_reservation_sha256s,
    event_count: current.event_count,
    ledger_sha256: current.ledger_sha256,
    stop_receipt_sha256: receipt.stop_receipt_sha256,
    previous_current_sha256: current.current_sha256,
    updated_at: issuedAt,
  });
  writeAtomic(paths.current, bytes(next), 'automation budget current');
  return Object.freeze({ receipt, current: next });
}

/**
 * Exhaustion after a completed operation: the limit is already reached, so the
 * receipt is published even though no refusal happened yet. Metrics are checked
 * in the fixed enforcement order so the receipt names the same metric on every
 * host.
 */
function exhaustionRefusal(
  budget: AutomationBudgetV1,
  current: AutomationBudgetCurrentV1,
  now: string,
): AutomationBudgetRefusalV1 | null {
  const base = {
    protocol: 1 as const,
    kind: 'repo-harness-automation-budget-refusal' as const,
    automation_run_id: budget.automation_run_id,
    budget_sha256: budget.budget_sha256,
    operation: 'dispatch' as AutomationOperationKind,
    idempotency_key: 'budget-exhaustion',
    refused_at: now,
  };
  for (const metric of AUTOMATION_ENFORCEMENT_ORDER) {
    if (metric === 'wall_clock_seconds') {
      if (Date.parse(now) < Date.parse(budget.deadline_at)) continue;
      const elapsed = Math.max(0, Math.floor((Date.parse(now) - Date.parse(budget.created_at)) / 1000));
      return Object.freeze({
        ...base,
        refusal_code: 'budget_expired' as const,
        metric,
        limit: budget.effective_limits.max_wall_clock_seconds,
        consumed: elapsed,
        reserved: 0,
        would_consume: elapsed,
      });
    }
    if (metric === 'consecutive_no_progress_steps') {
      const limit = budget.effective_limits.max_consecutive_no_progress_steps;
      if (current.consecutive_no_progress_steps < limit) continue;
      return Object.freeze({
        ...base,
        refusal_code: 'budget_limit_exceeded' as const,
        metric,
        limit,
        consumed: current.consecutive_no_progress_steps,
        reserved: 0,
        would_consume: current.consecutive_no_progress_steps + 1,
      });
    }
    const counted = metric as AutomationCountedMetric;
    const limit = budget.effective_limits[AUTOMATION_METRIC_LIMIT_FIELDS[counted]];
    if (limit === null) continue;
    const consumed = current.consumed[counted] ?? 0;
    if (consumed < limit) continue;
    // Campaign acquisitions admit work whose dispatch and completion have
    // separate budgets. Reaching this cap must not stop that admitted work.
    if (budget.authorization.campaign !== null && counted === 'successful_acquisitions' && consumed === limit) continue;
    return Object.freeze({
      ...base,
      refusal_code: 'budget_limit_exceeded' as const,
      metric: metric as AutomationMetricName,
      limit,
      consumed,
      reserved: current.open_reserved[counted] ?? 0,
      would_consume: consumed,
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reserve
// ---------------------------------------------------------------------------

function campaignTerminalPath(paths: RunPaths, campaignId: string, groupNumber: number): string {
  return join(paths.campaignTerminals, `${campaignAuthoringContextKey({ campaign_id: campaignId, group_number: groupNumber as 1 | 2 | 3 })}.json`);
}

function readCampaignTerminalOptional(
  paths: RunPaths,
  campaignId: string,
  groupNumber: 1 | 2 | 3,
): CampaignAuthoringBudgetTerminalV1 | null {
  const path = campaignTerminalPath(paths, campaignId, groupNumber);
  if (!existsSync(path)) return null;
  return parse(readRaw(path, 'campaign authoring terminal'), validateCampaignAuthoringTerminal, 'campaign authoring terminal');
}

interface CampaignGroupLedgerV1 {
  readonly reservations: readonly CampaignAutomationBudgetReservationV1[];
  readonly events: readonly AutomationUsageEventV1[];
  readonly completed_rounds: number;
  readonly held_rounds: number;
  readonly open_provider_invocations: number;
}

function assertReservationKindForBudget(
  budget: AutomationBudgetV1,
  reservation: AutomationBudgetReservationV1,
): void {
  const campaign = budget.authorization.campaign;
  if (campaign === null) {
    if (reservation.kind !== AUTOMATION_RESERVATION_KIND) {
      fail('automation_budget_store_invalid', 'a non-campaign budget cannot contain a campaign reservation');
    }
    return;
  }
  if (reservation.operation === 'provider_invocation') {
    if (reservation.kind !== CAMPAIGN_AUTOMATION_RESERVATION_KIND) {
      fail('automation_budget_store_invalid', 'a campaign provider invocation requires the campaign reservation kind');
    }
    if (reservation.campaign_context.campaign_id !== campaign.campaign_id
      || reservation.campaign_context.group_number > campaign.group_count) {
      fail('automation_budget_store_conflict', 'campaign reservation context does not match its budget grant');
    }
    return;
  }
  if (reservation.kind !== AUTOMATION_RESERVATION_KIND) {
    fail('automation_budget_store_invalid', 'campaign reservation kind is only valid for provider invocations');
  }
}

function assertAdmissionKindForBudget(budget: AutomationBudgetV1, input: ReservationAdmissionInput): void {
  const campaign = budget.authorization.campaign;
  if (campaign === null) {
    if (input.reservation_kind !== 'generic') {
      fail('automation_budget_store_invalid', 'a non-campaign budget cannot admit a campaign reservation');
    }
    return;
  }
  if (input.operation === 'provider_invocation') {
    if (input.reservation_kind !== 'campaign') {
      fail('automation_budget_store_invalid', 'a campaign provider invocation requires the campaign reservation kind');
    }
    return;
  }
  if (input.reservation_kind !== 'generic') {
    fail('automation_budget_store_invalid', 'campaign reservation kind is only valid for provider invocations');
  }
}

function campaignGroupLedger(
  paths: RunPaths,
  context: CampaignAutomationReservationContextV1,
): CampaignGroupLedgerV1 {
  const allReservations = jsonEntries(paths.reservations).map((entry) => (
    parse(readRaw(join(paths.reservations, entry), 'automation reservation'), validateAutomationReservation, 'automation reservation')
  ));
  const groupReservations = allReservations.filter((reservation): reservation is CampaignAutomationBudgetReservationV1 => (
    reservation.kind === CAMPAIGN_AUTOMATION_RESERVATION_KIND
      && reservation.campaign_context.campaign_id === context.campaign_id
      && reservation.campaign_context.group_number === context.group_number
  ));
  for (const reservation of groupReservations) {
    if (reservation.campaign_context.operation !== 'observe_revision' && context.operation !== 'observe_revision' && reservation.campaign_context.intent_sha256 !== context.intent_sha256) {
      fail('automation_budget_store_conflict', 'a campaign group is already bound to a different issue-batch intent');
    }
  }
  const allEvents = groupReservations.flatMap((reservation) => {
    const eventPath = join(paths.events, `${reservation.reservation_sha256}.json`);
    return existsSync(eventPath)
      ? [parse(readRaw(eventPath, 'automation usage event'), validateAutomationUsageEvent, 'automation usage event')]
      : [];
  });
  const eventByReservation = new Map(allEvents.map((event) => [event.reservation_sha256, event]));
  const authoring = groupReservations.filter((reservation) => isCampaignAuthoringOperation(reservation.campaign_context.operation));
  const authoringDigests = new Set(authoring.map((reservation) => reservation.reservation_sha256));
  const authoringEvents = allEvents.filter((event) => authoringDigests.has(event.reservation_sha256));
  let completedRounds = 0;
  let heldRounds = 0;
  for (const reservation of authoring) {
    const event = eventByReservation.get(reservation.reservation_sha256);
    if (event === undefined) heldRounds += 1;
    else if (event.resolution !== 'reconciled_not_started') completedRounds += 1;
  }
  return Object.freeze({
    reservations: Object.freeze(authoring),
    events: Object.freeze(authoringEvents),
    completed_rounds: completedRounds,
    held_rounds: heldRounds,
    open_provider_invocations: groupReservations.length - allEvents.length,
  });
}

function validateCampaignReservationAdmission(
  paths: RunPaths,
  budget: AutomationBudgetV1,
  input: ReservationAdmissionInput,
): CampaignAutomationReservationContextV1 | null {
  const context = input.reservation_kind === 'campaign'
    ? validateCampaignAutomationReservationContext(input.campaign_context)
    : null;
  const campaign = budget.authorization.campaign;
  if (campaign === null) {
    if (context !== null) fail('automation_budget_store_invalid', 'a non-campaign budget cannot carry campaign reservation context');
    return null;
  }
  assertCampaignAuthorizationForRun(budget.authorization, budget.automation_run_id);
  if (input.operation !== 'provider_invocation') {
    if (context !== null) fail('automation_budget_store_invalid', 'campaign context is only valid for provider invocations');
    return null;
  }
  if (context === null) fail('automation_budget_store_invalid', 'a campaign provider invocation requires campaign reservation context');
  if (context.campaign_id !== campaign.campaign_id) fail('automation_budget_store_conflict', 'campaign reservation names a different campaign');
  if (context.group_number > campaign.group_count) fail('automation_budget_store_invalid', 'campaign reservation group_number exceeds the authorized group count');
  if (context.operation === 'observe_revision') {
    const reservations = jsonEntries(paths.reservations).map(entry => parse(readRaw(join(paths.reservations, entry), 'automation reservation'), validateAutomationReservation, 'automation reservation'));
    if (reservations.some(r => r.kind === CAMPAIGN_AUTOMATION_RESERVATION_KIND)) fail('automation_budget_refused', 'revision observation must be the first campaign provider operation');
    return context;
  }
  const terminal = readCampaignTerminalOptional(paths, context.campaign_id, context.group_number);
  if (terminal !== null && terminal.intent_sha256 !== context.intent_sha256) {
    fail('automation_budget_store_conflict', 'a sealed campaign group is bound to a different issue-batch intent');
  }
  const ledger = campaignGroupLedger(paths, context);
  if (isCampaignAuthoringOperation(context.operation)) {
    if (terminal !== null) fail('automation_budget_refused', 'campaign authoring is permanently sealed for this group');
    if (ledger.completed_rounds + ledger.held_rounds >= campaign.max_authoring_rounds_per_group) {
      fail('automation_budget_refused', 'campaign authoring round limit is exhausted for this group');
    }
  }
  return context;
}

export interface ReserveAutomationBudgetInput {
  readonly repo_root: string;
  readonly automation_run_id: string;
  readonly expected_budget_sha256: string;
  readonly idempotency_key: string;
  readonly operation: AutomationOperationKind;
  readonly unit_kind: ProgramUnitKind;
  readonly unit_id: string;
  readonly attempt: number;
  readonly provider: string | null;
  readonly in_flight_authority?: readonly AutomationInFlightAuthorityV1[];
  readonly env?: NodeJS.ProcessEnv;
}

interface CampaignReservationAdmissionInput extends Omit<ReserveAutomationBudgetInput, 'attempt'> {
  readonly reservation_kind: 'campaign';
  readonly attempt: number;
  readonly original_idempotency_key: string;
  readonly campaign_context: CampaignAutomationReservationContextV1;
}

interface GenericReservationAdmissionInput extends ReserveAutomationBudgetInput {
  readonly reservation_kind: 'generic';
}

type ReservationAdmissionInput = GenericReservationAdmissionInput | CampaignReservationAdmissionInput;

/**
 * The one enforcement point. Nothing may claim, dispatch, retry, or call a
 * provider without a reservation returned by this function, and a reservation
 * that would push any hard metric past its limit is refused before the
 * operation runs.
 */
interface AutomationReservationAdmissionV1 {
  readonly reservation: AutomationBudgetReservationV1;
  readonly disposition: 'reserved' | 'replayed';
}

function assertCampaignRetryAdmission(paths: RunPaths, budget: AutomationBudgetV1, now: string): void {
  const campaign = budget.authorization.campaign;
  if (campaign === null) return;
  if (campaign.transient_retry === undefined) fail('campaign_retry_policy_required', 'campaign_retry_policy_required: mint an explicit campaign transient retry authorization before new effects');
  const retry = observeCampaignTransientRetry(readLedgerEvents(paths), campaign.transient_retry, now);
  if (retry.state === 'exhausted') fail('campaign_retry_exhausted', `campaign_retry_exhausted: ${retry.consecutive_failures} consecutive transient failures`);
  if (retry.state === 'backoff') fail('campaign_retry_backoff', `campaign_retry_backoff: next eligible at ${retry.next_eligible_at}`);
}

function reserveAutomationBudgetAdmission(input: ReservationAdmissionInput): AutomationReservationAdmissionV1 {
  const repoRoot = resolve(input.repo_root);
  const paths = runPaths(repoRoot, input.automation_run_id);
  // The counting components come from the operation kind, never from the
  // caller: an acquisition that reserves zero acquisitions is not a smaller
  // request, it is an unmetered one. Token and cost components stay null while
  // no provider-attested usage authority is wired.
  const tokens = { input_tokens: null, output_tokens: null, cost_micros: null };
  const reserved = input.reservation_kind === 'campaign'
    ? campaignProviderOperationReservation(input.campaign_context.operation, tokens)
    : automationOperationReservation(input.operation, tokens);
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    // The deadline decision belongs to the serialized state transition. A
    // caller may wait behind another process long enough to cross the run's
    // deadline, so a timestamp sampled before lock acquisition is stale by
    // construction.
    const reservedAt = automationStoreNow();
    const status = lockedStatus(repoRoot, paths, input.automation_run_id, reservedAt, input.env);
    assertAdmissionKindForBudget(status.budget, input);
    let effectiveIdempotencyKey = input.idempotency_key;
    let effectiveAttempt = input.attempt;
    if (input.reservation_kind === 'campaign') {
      while (true) {
        const candidatePath = join(paths.reservations, `${keyDigest(effectiveIdempotencyKey)}.json`);
        if (!existsSync(candidatePath)) break;
        const prior = parse(readRaw(candidatePath, 'automation reservation'), validateAutomationReservation, 'automation reservation');
        if (prior.kind !== CAMPAIGN_AUTOMATION_RESERVATION_KIND
          || prior.idempotency_key !== effectiveIdempotencyKey
          || prior.operation !== input.operation
          || prior.unit_kind !== input.unit_kind
          || prior.unit_id !== input.unit_id
          || prior.attempt !== effectiveAttempt
          || prior.provider !== input.provider
          || canonicalAutomationJson(prior.campaign_context) !== canonicalAutomationJson(input.campaign_context)) {
          fail('automation_budget_store_conflict', 'campaign reservation retry chain changes its bound operation context');
        }
        const eventPath = join(paths.events, `${prior.reservation_sha256}.json`);
        if (!existsSync(eventPath)) break;
        const event = parse(readRaw(eventPath, 'automation usage event'), validateAutomationUsageEvent, 'automation usage event');
        if (event.resolution !== 'reconciled_not_started') break;
        effectiveAttempt += 1;
        effectiveIdempotencyKey = `campaign-retry:${automationDigest({
          kind: 'repo-harness-campaign-authoring-retry',
          original_idempotency_key: input.original_idempotency_key,
          prior_reservation_sha256: prior.reservation_sha256,
          reconciliation_event_sha256: event.event_sha256,
          attempt: effectiveAttempt,
        })}`;
      }
    }
    const reservationPath = join(paths.reservations, `${keyDigest(effectiveIdempotencyKey)}.json`);
    // A stored reservation is closed, open, or nothing this store may act on.
    // The third case cannot survive `lockedStatus`, so reaching it means the
    // durable records and the projection still disagree: fail closed rather
    // than re-mint a reservation whose headroom is unaccounted for.
    const replay = (): AutomationBudgetReservationV1 | null => {
      if (!existsSync(reservationPath)) return null;
      const stored = parse(readRaw(reservationPath, 'automation reservation'), validateAutomationReservation, 'automation reservation');
      if (stored.idempotency_key !== effectiveIdempotencyKey) {
        fail('automation_budget_store_conflict', 'automation reservation idempotency key collides with a different key');
      }
      if (stored.budget_sha256 !== status.current.budget_sha256) {
        fail('automation_budget_store_conflict', 'automation reservation was granted under a superseded budget revision');
      }
      if (stored.operation !== input.operation
        || stored.unit_kind !== input.unit_kind
        || stored.unit_id !== input.unit_id
        || stored.attempt !== effectiveAttempt
        || stored.provider !== input.provider
        || stored.kind !== (input.reservation_kind === 'campaign'
          ? CAMPAIGN_AUTOMATION_RESERVATION_KIND
          : AUTOMATION_RESERVATION_KIND)
        || (stored.kind === CAMPAIGN_AUTOMATION_RESERVATION_KIND
          && (input.reservation_kind !== 'campaign'
            || canonicalAutomationJson(stored.campaign_context) !== canonicalAutomationJson(input.campaign_context)))) {
        fail('automation_budget_store_conflict', 'automation reservation replay changes its bound operation context');
      }
      if (existsSync(join(paths.events, `${stored.reservation_sha256}.json`))) return stored;
      if (status.current.open_reservation_sha256s.includes(stored.reservation_sha256)) return stored;
      return fail(
        'automation_budget_store_conflict',
        'stored automation reservation is neither open nor charged after reconciliation; refusing to re-mint it',
      );
    };
    const decision = evaluateAutomationReservation({
      budget: status.budget,
      state: ledgerState(status.current),
      expected_budget_sha256: input.expected_budget_sha256,
      operation: input.operation,
      idempotency_key: effectiveIdempotencyKey,
      reserved,
      now: reservedAt,
    });
    if (decision.decision === 'refused') {
      const code = decision.refusal.refusal_code;
      // An interrupted operation must still be replayable by its own key --
      // that is how the crash is resolved. Every other refusal is the budget's
      // answer for this run and a stored key does not reopen it: once a stop
      // receipt exists, nothing proceeds, replay included.
      if (code === 'reconciliation_required') {
        const stored = replay();
        if (stored !== null) return Object.freeze({ reservation: stored, disposition: 'replayed' as const });
      }
      const acquisitionOnlyRefusal = status.budget.authorization.campaign !== null
        && code === 'budget_limit_exceeded'
        && decision.refusal.metric === 'successful_acquisitions';
      if ((code === 'budget_limit_exceeded' && !acquisitionOnlyRefusal) || code === 'budget_expired') {
        persistStopReceipt(
          paths,
          status.budget,
          status.current,
          decision.refusal,
          input.in_flight_authority ?? [],
          reservedAt,
        );
      }
      throw new AutomationBudgetStoreError(
        'automation_budget_refused',
        `automation budget refused ${input.operation}: ${code}${decision.refusal.metric === null ? '' : ` on ${decision.refusal.metric}`}`,
        decision.refusal,
      );
    }
    const replayed = replay();
    if (replayed !== null) return Object.freeze({ reservation: replayed, disposition: 'replayed' as const });
    assertCampaignRetryAdmission(paths, status.budget, reservedAt);
    const campaignContext = validateCampaignReservationAdmission(paths, status.budget, input);
    if (status.budget.authorization.campaign !== null) {
      const ledger = campaignLedger(paths, status.budget);
      if (campaignContext === null) {
        if (ledger.active_step !== null) fail('automation_budget_refused', 'generic reservation cannot bypass the active campaign step');
      } else {
        const step = ledger.active_step;
        if (campaignContext.step_admission_sha256 === null) {
          if (step !== null || input.provider !== 'gpt-pro') fail('automation_budget_refused', 'standalone provider call cannot bypass the active campaign step');
        } else if (step === null || step.event_sha256 !== campaignContext.step_admission_sha256
          || step.group_number !== campaignContext.group_number || step.intent_sha256 !== campaignContext.intent_sha256) {
          fail('automation_budget_refused', 'provider call does not belong to the active campaign step');
        }
        if (input.provider !== campaignProviderForOperation(campaignContext.operation)) fail('automation_budget_store_invalid', 'campaign provider does not match its operation');
        const limit = status.budget.authorization.campaign.max_provider_calls;
        if (ledger.provider_calls + ledger.reserved_provider_calls + campaignProviderCallReservation(campaignContext.operation) > limit) campaignLimitRefusal(paths, status, 'provider_calls', limit, ledger.provider_calls, ledger.reserved_provider_calls, effectiveIdempotencyKey, reservedAt, campaignProviderCallReservation(campaignContext.operation));
      }
    }
    const commonReservation = {
      automation_run_id: status.budget.automation_run_id,
      budget_sha256: status.budget.budget_sha256,
      idempotency_key: effectiveIdempotencyKey,
      operation: input.operation,
      unit_kind: input.unit_kind,
      unit_id: input.unit_id,
      attempt: effectiveAttempt,
      provider: input.provider,
      step_index: status.current.next_step_index,
      reserved,
      reserved_at: reservedAt,
      deadline_at: status.budget.deadline_at,
      previous_ledger_sha256: status.current.ledger_sha256,
    } as const;
    const reservation = input.reservation_kind === 'campaign'
      ? sealCampaignAutomationReservation({ ...commonReservation, campaign_context: campaignContext! })
      : sealAutomationReservation(commonReservation);
    if (!writeExclusive(
      reservationPath,
      bytes(reservation),
      'automation reservation',
      join(paths.reservationsByDigest, `${reservation.reservation_sha256}.json`),
    )) {
      fail('automation_budget_store_conflict', 'automation reservation was created concurrently');
    }
    const next = sealAutomationBudgetCurrent({
      automation_run_id: status.current.automation_run_id,
      budget_sha256: status.current.budget_sha256,
      state: 'active',
      consumed: status.current.consumed,
      open_reserved: reservation.reserved,
      consecutive_no_progress_steps: status.current.consecutive_no_progress_steps,
      last_completed_step_index: status.current.last_completed_step_index,
      next_step_index: status.current.next_step_index,
      open_reservation_sha256s: [reservation.reservation_sha256],
      event_count: status.current.event_count,
      ledger_sha256: status.current.ledger_sha256,
      stop_receipt_sha256: null,
      previous_current_sha256: status.current.current_sha256,
      updated_at: reservedAt,
    });
    writeAtomic(paths.current, bytes(next), 'automation budget current');
    return Object.freeze({ reservation, disposition: 'reserved' as const });
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function reserveAutomationBudget(input: ReserveAutomationBudgetInput): GenericAutomationBudgetReservationV1 {
  const admission = reserveAutomationBudgetAdmission({ ...input, reservation_kind: 'generic' });
  if (admission.reservation.kind !== AUTOMATION_RESERVATION_KIND) {
    return fail('automation_budget_store_invalid', 'generic admission returned a campaign reservation');
  }
  return admission.reservation;
}

export interface BeginCampaignBudgetStepInput extends CampaignBudgetStepIdentityV1 {
  readonly repo_root: string;
  readonly expected_budget_sha256: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly replay_only?: boolean;
}

function assertStepBudgetBinding(input: BeginCampaignBudgetStepInput, status: AutomationBudgetStatusV1): void {
  const identity = validateCampaignBudgetStepIdentity(input);
  const campaign = assertCampaignAuthorizationForRun(status.budget.authorization, identity.automation_run_id);
  if (status.budget.budget_sha256 !== input.expected_budget_sha256) fail('automation_budget_store_conflict', 'campaign step expected budget revision is stale');
  if (identity.campaign_id !== campaign.campaign_id || identity.group_number > campaign.group_count) fail('automation_budget_store_conflict', 'campaign step does not match its authorization');
}

function campaignLimitRefusal(
  paths: RunPaths, status: AutomationBudgetStatusV1, metric: 'controller_steps' | 'provider_calls',
  limit: number, consumed: number, reserved: number, key: string, now: string, requested = 1,
): never {
  const refusal: AutomationBudgetRefusalV1 = Object.freeze({
    protocol: 1, kind: 'repo-harness-automation-budget-refusal',
    automation_run_id: status.budget.automation_run_id, budget_sha256: status.budget.budget_sha256,
    refusal_code: 'budget_limit_exceeded', operation: 'provider_invocation', idempotency_key: key,
    metric, limit, consumed, reserved, would_consume: consumed + reserved + requested, refused_at: now,
  });
  persistStopReceipt(paths, status.budget, status.current, refusal,
    status.current.open_reservation_sha256s.map(digest => ({ authority_kind: 'reservation', authority_id: digest, recovery: 'normal_recovery_required' })), now);
  throw new AutomationBudgetStoreError('automation_budget_refused', `campaign ${metric} limit is exhausted`, refusal);
}

function persistCampaignStepEvent(
  repoRoot: string, paths: RunPaths, status: AutomationBudgetStatusV1, event: CampaignBudgetStepEventV1,
): void {
  if (!writeExclusive(campaignStepEventPath(paths, event), bytes(event), 'campaign budget step event')) {
    fail('automation_budget_store_conflict', 'campaign budget step event was created concurrently');
  }
  // Same repair path as a crash after immutable event publication. A completion
  // is bookkeeping even when an earlier limit already sealed the stop receipt.
  repairCurrentFromDurableRecords(repoRoot, paths, status, event.observed_at);
}

export function beginCampaignBudgetStep(input: BeginCampaignBudgetStepInput): {
  readonly admission: CampaignBudgetStepAdmissionV1; readonly disposition: 'admitted' | 'replayed';
} {
  const repoRoot = resolve(input.repo_root);
  const identity = validateCampaignBudgetStepIdentity(input);
  const paths = runPaths(repoRoot, identity.automation_run_id);
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    const now = automationStoreNow();
    const status = lockedStatus(repoRoot, paths, identity.automation_run_id, now, input.env);
    assertStepBudgetBinding(input, status);
    const records = readLedgerEvents(paths);
    const prior = records.find((event): event is CampaignBudgetStepAdmissionV1 => event.kind === CAMPAIGN_STEP_ADMISSION_KIND && campaignBudgetStepKey(event) === campaignBudgetStepKey(identity));
    if (prior !== undefined) {
      if (prior.budget_sha256 !== input.expected_budget_sha256) fail('automation_budget_store_conflict', 'campaign step replay names a stale admission');
      return Object.freeze({ admission: prior, disposition: 'replayed' as const });
    }
    if (input.replay_only) fail('automation_budget_store_conflict', 'campaign receipt has no prior step admission');
    assertCampaignRetryAdmission(paths, status.budget, now);
    const ledger = campaignLedger(paths, status.budget);
    if (ledger.active_step !== null || status.current.open_reservation_sha256s.length !== 0) fail('automation_budget_refused', 'campaign step reconciliation_required before another admission');
    if (status.stop_receipt !== null || status.current.state === 'budget_exhausted') fail('automation_budget_refused', 'campaign budget_exhausted before step admission');
    const campaign = status.budget.authorization.campaign!;
    if (ledger.controller_steps >= campaign.max_controller_steps) campaignLimitRefusal(paths, status, 'controller_steps', campaign.max_controller_steps, ledger.controller_steps, 0, identity.idempotency_key, now);
    const event = sealCampaignBudgetStepEvent({
      ...identity, kind: CAMPAIGN_STEP_ADMISSION_KIND,
      authorization_id: status.budget.authorization.authorization_id, budget_sha256: status.budget.budget_sha256,
      step_index: status.current.next_step_index, previous_ledger_sha256: status.current.ledger_sha256, observed_at: now,
    }) as CampaignBudgetStepAdmissionV1;
    // Validate the prospective fold before publishing any new authority.
    foldStoredCampaignLedger(paths, status.budget, [...records, event], readLedgerReservations(paths));
    persistCampaignStepEvent(repoRoot, paths, status, event);
    return Object.freeze({ admission: event, disposition: 'admitted' as const });
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export interface CompleteCampaignBudgetStepInput {
  readonly repo_root: string;
  readonly admission: CampaignBudgetStepAdmissionV1;
  readonly outcome: 'progress' | 'no_progress';
  readonly evidence_refs: readonly AutomationEvidenceRefV1[];
  readonly env?: NodeJS.ProcessEnv;
}

function completeCampaignBudgetStepLocked(input: CompleteCampaignBudgetStepInput, repoRoot: string, paths: RunPaths): CampaignBudgetStepCompletionV1 {
  const validated = validateCampaignBudgetStepEvent(input.admission);
  if (validated.kind !== CAMPAIGN_STEP_ADMISSION_KIND) fail('automation_budget_store_invalid', 'campaign completion requires an admission');
  const now = automationStoreNow();
  const status = lockedStatus(repoRoot, paths, validated.automation_run_id, now, input.env);
  assertStepBudgetBinding({ ...validated, repo_root: repoRoot, expected_budget_sha256: validated.budget_sha256 }, status);
  const records = readLedgerEvents(paths);
  const stored = records.find(event => event.event_sha256 === validated.event_sha256);
  if (stored === undefined || canonicalAutomationJson(stored) !== canonicalAutomationJson(validated)) fail('automation_budget_store_conflict', 'campaign completion admission is not durable');
  const prior = records.find((event): event is CampaignBudgetStepCompletionV1 => event.kind === CAMPAIGN_STEP_COMPLETION_KIND && event.admission_sha256 === validated.event_sha256);
  if (prior !== undefined) {
    if (prior.outcome !== input.outcome || canonicalAutomationJson(prior.evidence_refs) !== canonicalAutomationJson(input.evidence_refs)) fail('automation_budget_store_conflict', 'campaign completion replay changes its outcome or evidence');
    return prior;
  }
  if (status.current.open_reservation_sha256s.length !== 0) fail('automation_budget_refused', 'campaign completion requires external reservation reconciliation');
  const ledger = campaignLedger(paths, status.budget);
  if (ledger.active_step?.event_sha256 !== validated.event_sha256) fail('automation_budget_store_conflict', 'campaign admission is not the active step');
  const event = sealCampaignBudgetStepEvent({
    ...validateCampaignBudgetStepIdentity(validated), kind: CAMPAIGN_STEP_COMPLETION_KIND,
    admission_sha256: validated.event_sha256, outcome: input.outcome, evidence_refs: input.evidence_refs,
    authorization_id: validated.authorization_id, budget_sha256: validated.budget_sha256,
    step_index: status.current.next_step_index, previous_ledger_sha256: status.current.ledger_sha256, observed_at: now,
  }) as CampaignBudgetStepCompletionV1;
  foldStoredCampaignLedger(paths, status.budget, [...records, event], readLedgerReservations(paths));
  persistCampaignStepEvent(repoRoot, paths, status, event);
  return event;
}

export function completeCampaignBudgetStep(input: CompleteCampaignBudgetStepInput): CampaignBudgetStepCompletionV1 {
  const repoRoot = resolve(input.repo_root);
  const paths = runPaths(repoRoot, input.admission.automation_run_id);
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => completeCampaignBudgetStepLocked(input, repoRoot, paths),
    { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function readCampaignBudgetLedger(repoRoot: string, runId: string, env: NodeJS.ProcessEnv = process.env): CampaignBudgetLedgerV1 {
  const status = readAutomationBudgetStatus(repoRoot, runId, env);
  return campaignLedger(runPaths(repoRoot, runId), status.budget);
}

export interface ReserveCampaignProviderBudgetInput extends BeginCampaignBudgetStepInput {
  readonly step_admission_sha256: string;
  readonly operation: 'git_read' | 'github_read' | 'github_comment' | 'github_close' | CampaignCloseoutOperation;
  readonly request_sha256: string;
}

export function reserveCampaignProviderBudget(input: ReserveCampaignProviderBudgetInput): CampaignAuthoringBudgetAdmissionV1 {
  const admission = reserveAutomationBudgetAdmission({
    repo_root: input.repo_root, automation_run_id: input.automation_run_id,
    expected_budget_sha256: input.expected_budget_sha256, idempotency_key: input.idempotency_key,
    original_idempotency_key: input.idempotency_key, reservation_kind: 'campaign',
    operation: 'provider_invocation', unit_kind: 'execute', unit_id: `${input.campaign_id}:group:${input.group_number}`,
    attempt: 1, provider: campaignProviderForOperation(input.operation),
    campaign_context: { campaign_id: input.campaign_id, group_number: input.group_number,
      intent_sha256: input.intent_sha256, operation: input.operation,
      step_admission_sha256: input.step_admission_sha256, request_sha256: input.request_sha256 },
    env: input.env,
  });
  if (admission.reservation.kind !== CAMPAIGN_AUTOMATION_RESERVATION_KIND) fail('automation_budget_store_invalid', 'campaign provider admission returned a generic reservation');
  return Object.freeze({ reservation: admission.reservation, disposition: admission.disposition });
}

export interface EnsureCampaignAuthoringBudgetInput {
  readonly repo_root: string;
  readonly authorization: ProgramAuthorizationV1;
  readonly env?: NodeJS.ProcessEnv;
}

function assertCampaignBudgetBinding(status: AutomationBudgetStatusV1, authorization: ProgramAuthorizationV1): void {
  const campaign = authorization.campaign!;
  const expectedGoal = automationDigest({ kind: 'repo-harness-campaign-authoring-goal', repository_id: authorization.repository_id, campaign_id: campaign.campaign_id });
  const expectedRevision = automationDigest({ target_revision: authorization.target_revision, work_graph_revision: authorization.work_graph_revision });
  const expectedCapability = automationDigest({ kind: 'repo-harness-campaign-authoring-metric-support', provider: 'gpt-pro', verified_metrics: [] });
  const budget = status.budget;
  if (budget.authorization.authorization_sha256 !== authorization.authorization_sha256
    || budget.automation_run_id !== campaignAutomationRunId({ repository_id: authorization.repository_id, campaign_id: campaign.campaign_id })
    || budget.goal_id !== expectedGoal
    || budget.goal_revision !== expectedRevision
    || budget.repository_id !== authorization.repository_id
    || budget.engineer_id !== null
    || budget.claim_id !== null
    || budget.contract_sha256 !== null
    || budget.contract_limits !== null
    || budget.metric_support.provider !== 'gpt-pro'
    || budget.metric_support.capability_sha256 !== expectedCapability
    || budget.metric_support.verified_metrics.length !== 0
    || budget.unattended !== true) {
    fail('automation_budget_store_conflict', 'campaign automation run does not match its deterministic authorization binding');
  }
}

export function ensureCampaignAuthoringBudget(input: EnsureCampaignAuthoringBudgetInput): AutomationBudgetStatusV1 {
  const repoRoot = resolve(input.repo_root);
  const authorization = validateProgramAuthorization(input.authorization);
  const campaign = authorization.campaign;
  if (campaign === null) fail('automation_budget_store_invalid', 'campaign authoring requires a campaign authorization');
  const runId = campaignAutomationRunId({
    repository_id: authorization.repository_id,
    campaign_id: campaign.campaign_id,
  });
  assertCampaignAuthorizationForRun(authorization, runId);
  const paths = runPaths(repoRoot, runId);
  const existing = readCurrentOptional(paths);
  if (existing !== null) {
    const status = readAutomationBudgetStatus(repoRoot, runId, input.env);
    assertCampaignBudgetBinding(status, authorization);
    return status;
  }
  const createdAt = automationStoreNow();
  const support = sealAutomationMetricSupport({
    provider: 'gpt-pro',
    capability_sha256: automationDigest({ kind: 'repo-harness-campaign-authoring-metric-support', provider: 'gpt-pro', verified_metrics: [] }),
    verified_metrics: [],
    observed_at: createdAt,
  });
  const budget = buildAutomationBudget({
    automation_run_id: runId,
    goal_id: automationDigest({ kind: 'repo-harness-campaign-authoring-goal', repository_id: authorization.repository_id, campaign_id: campaign.campaign_id }),
    goal_revision: automationDigest({ target_revision: authorization.target_revision, work_graph_revision: authorization.work_graph_revision }),
    repository_id: authorization.repository_id,
    engineer_id: null,
    claim_id: null,
    authorization,
    contract_sha256: null,
    contract_limits: null,
    metric_support: support,
    unattended: true,
    created_by: authorization.issued_by,
    created_at: createdAt,
    supersedes_sha256: null,
    revision: 1,
  });
  try {
    const published = publishAutomationBudget({ repo_root: repoRoot, budget, env: input.env });
    assertCampaignBudgetBinding(published, authorization);
    return published;
  } catch (error) {
    if (!(error instanceof AutomationBudgetStoreError) || error.code !== 'automation_budget_store_conflict') throw error;
    const raced = readAutomationBudgetStatus(repoRoot, runId, input.env);
    assertCampaignBudgetBinding(raced, authorization);
    return raced;
  }
}

/** Bootstrap observation shares the campaign ledger but has no authoring intent. */
export function reserveCampaignRevisionObservationBudget(input: {
  readonly repo_root: string; readonly automation_run_id: string; readonly expected_budget_sha256: string;
  readonly campaign_id: string; readonly request_sha256: string; readonly env?: NodeJS.ProcessEnv;
}): CampaignAuthoringBudgetAdmissionV1 {
  const admission = reserveAutomationBudgetAdmission({
    ...input, idempotency_key: input.request_sha256, original_idempotency_key: input.request_sha256,
    reservation_kind: 'campaign', operation: 'provider_invocation', unit_kind: 'execute',
    unit_id: `${input.campaign_id}:revision-observation`, attempt: 1, provider: 'gpt-pro',
    campaign_context: { campaign_id: input.campaign_id, group_number: 1, intent_sha256: null,
      step_admission_sha256: null, operation: 'observe_revision', request_sha256: input.request_sha256 },
  });
  if (admission.reservation.kind !== CAMPAIGN_AUTOMATION_RESERVATION_KIND) return fail('automation_budget_store_invalid', 'revision observation returned generic reservation');
  return { reservation: admission.reservation, disposition: admission.disposition };
}

export interface ReserveCampaignAuthoringBudgetInput {
  readonly repo_root: string;
  readonly automation_run_id: string;
  readonly expected_budget_sha256: string;
  readonly campaign_id: string;
  readonly group_number: 1 | 2 | 3;
  readonly intent_sha256: string;
  readonly operation: CampaignAuthoringOperation | 'challenge' | 'audit';
  readonly step_admission_sha256?: string | null;
  readonly idempotency_key: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface CampaignAuthoringBudgetAdmissionV1 {
  readonly reservation: CampaignAutomationBudgetReservationV1;
  readonly disposition: 'reserved' | 'replayed';
}

export function reserveCampaignAuthoringBudget(
  input: ReserveCampaignAuthoringBudgetInput,
): CampaignAuthoringBudgetAdmissionV1 {
  const admission = reserveAutomationBudgetAdmission({
    repo_root: input.repo_root,
    automation_run_id: input.automation_run_id,
    expected_budget_sha256: input.expected_budget_sha256,
    idempotency_key: input.idempotency_key,
    original_idempotency_key: input.idempotency_key,
    reservation_kind: 'campaign',
    operation: 'provider_invocation',
    unit_kind: 'execute',
    unit_id: `${input.campaign_id}:group:${input.group_number}`,
    attempt: 1,
    provider: 'gpt-pro',
    campaign_context: {
      campaign_id: input.campaign_id,
      group_number: input.group_number,
      intent_sha256: input.intent_sha256,
      operation: input.operation,
      step_admission_sha256: input.step_admission_sha256 ?? null,
    },
    env: input.env,
  });
  if (admission.reservation.kind !== CAMPAIGN_AUTOMATION_RESERVATION_KIND) {
    return fail('automation_budget_store_invalid', 'campaign admission returned a generic reservation');
  }
  return Object.freeze({ reservation: admission.reservation, disposition: admission.disposition });
}

export interface CampaignAuthoringTerminalBindingInput {
  readonly repo_root: string;
  readonly automation_run_id: string;
  readonly expected_budget_sha256: string;
  readonly campaign_id: string;
  readonly group_number: 1 | 2 | 3;
  readonly intent_sha256: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface SealCampaignAuthoringBudgetInput extends CampaignAuthoringTerminalBindingInput {
  readonly reason: CampaignAuthoringTerminalReason;
  /** Final shadow step is completed under the seal lock; replay must remain the latest ledger event. */
  readonly step_completion?: Pick<CompleteCampaignBudgetStepInput, 'admission' | 'outcome' | 'evidence_refs'>;
}

/** Authoring epoch is a projection of the existing run evidence, never a second counter. */
export function readCampaignAuthoringProgress(input: CampaignAuthoringTerminalBindingInput) {
  const repoRoot = resolve(input.repo_root);
  const paths = runPaths(repoRoot, input.automation_run_id);
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    const status = lockedStatus(repoRoot, paths, input.automation_run_id, automationStoreNow(), input.env);
    const campaign = assertCampaignAuthorizationForRun(status.budget.authorization, input.automation_run_id);
    if (status.budget.budget_sha256 !== input.expected_budget_sha256 || campaign.campaign_id !== input.campaign_id
      || input.group_number > campaign.group_count) fail('automation_budget_store_conflict', 'authoring progress authority differs');
    const ledger = campaignGroupLedger(paths, validateCampaignAutomationReservationContext({ campaign_id: input.campaign_id,
      group_number: input.group_number, intent_sha256: input.intent_sha256, operation: 'initial', step_admission_sha256: null }));
    return Object.freeze({ epoch_sha256: automationDigest({ reservations: ledger.reservations.map(r => r.reservation_sha256).sort(),
      events: ledger.events.map(e => e.event_sha256).sort() }), completed_rounds: ledger.completed_rounds,
      held_rounds: ledger.held_rounds, max_rounds: campaign.max_authoring_rounds_per_group });
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

function evidenceRef(prefix: string, sha256: string): AutomationEvidenceRefV1 {
  return Object.freeze({ ref: `${prefix}:${sha256}`, sha256 });
}

function assertTerminalMatchesLedger(
  paths: RunPaths,
  terminal: CampaignAuthoringBudgetTerminalV1,
  status: AutomationBudgetStatusV1,
  ledger: CampaignGroupLedgerV1,
  binding: Pick<CampaignAuthoringTerminalBindingInput, 'automation_run_id' | 'campaign_id' | 'group_number' | 'intent_sha256'>,
  readonlyContinuation = false,
): void {
  const campaign = status.budget.authorization.campaign;
  if (campaign === null) fail('automation_budget_store_invalid', 'campaign terminal belongs to a non-campaign budget');
  if (status.budget.authorization.authorization_sha256 !== terminal.authorization_sha256) {
    fail('automation_budget_store_conflict', 'campaign terminal authorization is no longer current');
  }
  if (terminal.automation_run_id !== binding.automation_run_id
    || terminal.repository_id !== status.budget.repository_id
    || terminal.campaign_id !== binding.campaign_id
    || terminal.group_number !== binding.group_number
    || terminal.intent_sha256 !== binding.intent_sha256) {
    fail('automation_budget_store_conflict', 'campaign terminal identity binding does not match the requested group');
  }
  if (terminal.budget_sha256 !== status.budget.budget_sha256 || terminal.budget_revision !== status.budget.revision) {
    fail('automation_budget_store_conflict', 'campaign terminal is bound to a stale budget revision');
  }
  if (!readonlyContinuation && terminal.ledger_sha256 !== status.current.ledger_sha256) {
    fail('automation_budget_store_conflict', 'campaign terminal is bound to a stale automation ledger');
  }
  const events = readLedgerEvents(paths);
  const reservations = readLedgerReservations(paths);
  const folded = foldStoredCampaignLedger(paths, status.budget, events, reservations);
  if (status.current.open_reservation_sha256s.length !== 0 || folded.active_step !== null) {
    fail('automation_budget_store_conflict', 'campaign terminal requires a quiescent automation ledger');
  }
  // Preserve the exact sealed prefix. Only fully bound readonly probe steps may extend it.
  let chain = AUTOMATION_LEDGER_GENESIS;
  const matches: number[] = chain === terminal.ledger_sha256 ? [0] : [];
  for (let index = 0; index < events.length; index++) {
    chain = chainAutomationLedgerDigest(chain, events[index]!.event_sha256);
    if (chain === terminal.ledger_sha256) matches.push(index + 1);
  }
  if (chain !== status.current.ledger_sha256 || matches.length !== 1) {
    fail('automation_budget_store_conflict', 'campaign terminal is bound to a stale automation ledger: exact prefix missing');
  }
  const prefixLength = matches[0]!;
  if (foldStoredCampaignLedger(paths, status.budget, events.slice(0, prefixLength), reservations.filter(reservation => reservation.step_index <= prefixLength)).active_step !== null) {
    fail('automation_budget_store_conflict', 'campaign terminal prefix contains an unfinished step');
  }
  const byDigest = new Map(reservations.map(reservation => [reservation.reservation_sha256, reservation]));
  for (const event of events.slice(matches[0]!)) {
    if (event.budget_sha256 !== terminal.budget_sha256 || event.authorization_id !== status.budget.authorization.authorization_id) {
      fail('automation_budget_store_conflict', 'campaign terminal continuation authority differs');
    }
    const context = event.kind === AUTOMATION_USAGE_EVENT_KIND
      ? (() => {
        const reservation = byDigest.get(event.reservation_sha256);
        if (reservation?.kind !== CAMPAIGN_AUTOMATION_RESERVATION_KIND || !['github_read', 'git_read'].includes(reservation.campaign_context.operation)) {
          return fail('automation_budget_store_conflict', 'campaign terminal is bound to a stale automation ledger: successor is not a readonly probe');
        }
        return reservation.campaign_context;
      })()
      : event;
    if (context.campaign_id !== terminal.campaign_id || context.group_number !== terminal.group_number || context.intent_sha256 !== terminal.intent_sha256) {
      fail('automation_budget_store_conflict', 'campaign terminal readonly continuation belongs to another group or intent');
    }
  }
  if (terminal.max_authoring_rounds !== campaign.max_authoring_rounds_per_group) {
    fail('automation_budget_store_conflict', 'campaign terminal round bound does not match current authority');
  }
  if (ledger.open_provider_invocations !== 0 || ledger.held_rounds !== 0 || ledger.reservations.length !== ledger.events.length) {
    fail('automation_budget_store_conflict', 'campaign group is not quiescent');
  }
  if (terminal.completed_authoring_rounds !== ledger.completed_rounds) {
    fail('automation_budget_store_invalid', 'campaign terminal authoring count does not match the ledger');
  }
  const reservationRefs = ledger.reservations.map((entry) => evidenceRef('automation-reservation', entry.reservation_sha256));
  const eventRefs = ledger.events.map((entry) => evidenceRef('automation-event', entry.event_sha256));
  if (canonicalAutomationJson(terminal.reservation_refs) !== canonicalAutomationJson([...reservationRefs].sort((a, b) => a.ref.localeCompare(b.ref)))
    || canonicalAutomationJson(terminal.event_refs) !== canonicalAutomationJson([...eventRefs].sort((a, b) => a.ref.localeCompare(b.ref)))) {
    fail('automation_budget_store_invalid', 'campaign terminal evidence refs do not match the current group ledger');
  }
  if (terminal.reason === 'authoring_exhausted' && terminal.completed_authoring_rounds !== terminal.max_authoring_rounds) {
    fail('automation_budget_store_invalid', 'authoring_exhausted terminal does not prove the exact round count');
  }
}

export function sealCampaignAuthoringBudget(
  input: SealCampaignAuthoringBudgetInput,
): CampaignAuthoringBudgetTerminalV1 {
  const repoRoot = resolve(input.repo_root);
  const paths = runPaths(repoRoot, input.automation_run_id);
  prepareRun(paths);
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    let sealedAt = automationStoreNow();
    let status = lockedStatus(repoRoot, paths, input.automation_run_id, sealedAt, input.env);
    if (status.current.budget_sha256 !== input.expected_budget_sha256) {
      fail('automation_budget_store_conflict', 'campaign terminal expected budget revision is stale');
    }
    const campaign = assertCampaignAuthorizationForRun(status.budget.authorization, input.automation_run_id);
    if (campaign.campaign_id !== input.campaign_id || input.group_number > campaign.group_count) {
      fail('automation_budget_store_conflict', 'campaign terminal binding does not match current authority');
    }
    const context = validateCampaignAutomationReservationContext({
      campaign_id: input.campaign_id,
      group_number: input.group_number,
      intent_sha256: input.intent_sha256,
      operation: 'initial',
      step_admission_sha256: null,
    });
    const ledger = campaignGroupLedger(paths, context);
    if (ledger.open_provider_invocations !== 0 || ledger.held_rounds !== 0 || ledger.reservations.length !== ledger.events.length) {
      fail('automation_budget_store_conflict', 'campaign authoring cannot seal while the group has an unresolved provider invocation');
    }
    if (input.reason === 'authoring_exhausted' && ledger.completed_rounds !== campaign.max_authoring_rounds_per_group) {
      fail('automation_budget_store_invalid', 'authoring_exhausted requires the exact configured number of completed rounds');
    }
    if (input.step_completion) {
      const admission = input.step_completion.admission;
      if (admission.automation_run_id !== input.automation_run_id || admission.campaign_id !== input.campaign_id
        || admission.group_number !== input.group_number || admission.intent_sha256 !== input.intent_sha256
        || input.step_completion.outcome !== 'progress') fail('automation_budget_store_conflict', 'terminal completion binding differs');
      const completion = completeCampaignBudgetStepLocked({ ...input.step_completion, repo_root: repoRoot, env: input.env }, repoRoot, paths);
      sealedAt = automationStoreNow();
      status = lockedStatus(repoRoot, paths, input.automation_run_id, sealedAt, input.env);
      if (status.current.ledger_sha256 !== chainAutomationLedgerDigest(completion.previous_ledger_sha256, completion.event_sha256)
        || status.current.open_reservation_sha256s.length !== 0) fail('automation_budget_store_conflict', 'terminal completion is no longer the latest ledger transition');
    }
    if (campaignLedger(paths, status.budget).active_step !== null) fail('automation_budget_store_conflict', 'campaign terminal requires a completed controller step');
    if (status.current.open_reservation_sha256s.length !== 0) fail('automation_budget_store_conflict', 'campaign authoring cannot seal while the automation ledger is not quiescent');
    const path = campaignTerminalPath(paths, input.campaign_id, input.group_number);
    const existing = readCampaignTerminalOptional(paths, input.campaign_id, input.group_number);
    if (existing !== null) {
      if (existing.intent_sha256 !== input.intent_sha256 || existing.reason !== input.reason) {
        fail('automation_budget_store_conflict', 'campaign group was already sealed with a different binding or reason');
      }
      assertTerminalMatchesLedger(paths, existing, status, ledger, input);
      return existing;
    }
    if (input.reason === 'authoring_exhausted' && ledger.completed_rounds !== campaign.max_authoring_rounds_per_group) {
      fail('automation_budget_store_invalid', 'authoring_exhausted requires the exact configured number of completed rounds');
    }
    const terminal = sealCampaignAuthoringTerminal({
      automation_run_id: input.automation_run_id,
      repository_id: status.budget.repository_id,
      campaign_id: input.campaign_id,
      group_number: input.group_number,
      intent_sha256: input.intent_sha256,
      authorization_sha256: status.budget.authorization.authorization_sha256,
      budget_sha256: status.budget.budget_sha256,
      budget_revision: status.budget.revision,
      max_authoring_rounds: campaign.max_authoring_rounds_per_group,
      completed_authoring_rounds: ledger.completed_rounds,
      reason: input.reason,
      reservation_refs: ledger.reservations.map((entry) => evidenceRef('automation-reservation', entry.reservation_sha256)),
      event_refs: ledger.events.map((entry) => evidenceRef('automation-event', entry.event_sha256)),
      ledger_sha256: status.current.ledger_sha256,
      sealed_at: sealedAt,
    });
    if (!writeExclusive(path, bytes(terminal), 'campaign authoring terminal')) {
      fail('automation_budget_store_conflict', 'campaign authoring terminal was created concurrently');
    }
    return terminal;
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

function readCampaignAuthoringProof(
  input: CampaignAuthoringTerminalBindingInput,
  readonlyContinuation: boolean,
) {
  const repoRoot = resolve(input.repo_root);
  const paths = runPaths(repoRoot, input.automation_run_id);
  if (!existsSync(paths.current)) return null;
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    const status = lockedStatus(repoRoot, paths, input.automation_run_id, automationStoreNow(), input.env);
    if (status.current.budget_sha256 !== input.expected_budget_sha256) {
      fail('automation_budget_store_conflict', 'campaign terminal expected budget revision is stale');
    }
    const campaign = assertCampaignAuthorizationForRun(status.budget.authorization, input.automation_run_id);
    const context = validateCampaignAutomationReservationContext({
      campaign_id: input.campaign_id,
      group_number: input.group_number,
      intent_sha256: input.intent_sha256,
      operation: 'initial',
      step_admission_sha256: null,
    });
    if (campaign.campaign_id !== context.campaign_id || context.group_number > campaign.group_count) {
      fail('automation_budget_store_conflict', 'campaign terminal binding does not match current authority');
    }
    const terminal = readCampaignTerminalOptional(paths, context.campaign_id, context.group_number);
    if (terminal === null) return null;
    if (terminal.intent_sha256 !== input.intent_sha256) fail('automation_budget_store_conflict', 'campaign terminal intent binding differs');
    const ledger = campaignGroupLedger(paths, context);
    assertTerminalMatchesLedger(paths, terminal, status, ledger, input, readonlyContinuation);
    const events = readLedgerEvents(paths);
    let digest = AUTOMATION_LEDGER_GENESIS;
    let afterSeal = digest === terminal.ledger_sha256;
    const completion_event_sha256s: string[] = [];
    for (const event of events) {
      if (afterSeal && event.kind === CAMPAIGN_STEP_COMPLETION_KIND) completion_event_sha256s.push(event.event_sha256);
      digest = chainAutomationLedgerDigest(digest, event.event_sha256);
      if (digest === terminal.ledger_sha256) afterSeal = true;
    }
    return Object.freeze({ terminal, current_ledger_sha256: status.current.ledger_sha256,
      completion_event_sha256s: Object.freeze(completion_event_sha256s) });
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function readCampaignAuthoringBudgetTerminal(input: CampaignAuthoringTerminalBindingInput): CampaignAuthoringBudgetTerminalV1 | null {
  return readCampaignAuthoringProof(input, false)?.terminal ?? null;
}

/** Active adoption only: the seal remains historical; this proof binds its readonly continuation to the current ledger. */
export function readCampaignAuthoringReadonlyContinuation(input: CampaignAuthoringTerminalBindingInput) {
  return readCampaignAuthoringProof(input, true);
}

export interface VerifyCampaignAuthoringBudgetTerminalInput extends CampaignAuthoringTerminalBindingInput {
  readonly terminal: CampaignAuthoringBudgetTerminalV1;
}

export function verifyCampaignAuthoringReadonlyContinuation(input: VerifyCampaignAuthoringBudgetTerminalInput) {
  const expected = validateCampaignAuthoringTerminal(input.terminal);
  const proof = readCampaignAuthoringReadonlyContinuation(input);
  if (proof === null || canonicalAutomationJson(proof.terminal) !== canonicalAutomationJson(expected)) {
    fail('automation_budget_store_conflict', 'campaign authoring continuation seal is missing or differs from stored authority');
  }
  return proof;
}

export function verifyCampaignAuthoringBudgetTerminal(
  input: VerifyCampaignAuthoringBudgetTerminalInput,
): CampaignAuthoringBudgetTerminalV1 {
  const expected = validateCampaignAuthoringTerminal(input.terminal);
  const stored = readCampaignAuthoringBudgetTerminal(input);
  if (stored === null || canonicalAutomationJson(stored) !== canonicalAutomationJson(expected)) {
    fail('automation_budget_store_conflict', 'campaign authoring terminal is missing or differs from the stored authority');
  }
  return stored;
}

// ---------------------------------------------------------------------------
// Append and reconcile
// ---------------------------------------------------------------------------

export interface AutomationUsageResultV1 {
  /** What the host observed. The arithmetic is derived from it, not declared. */
  readonly outcome: AutomationOutcome;
  readonly evidence_refs: readonly AutomationEvidenceRefV1[];
}

export interface AppendAutomationUsageInput extends AutomationUsageResultV1 {
  readonly repo_root: string;
  readonly reservation: AutomationBudgetReservationV1;
  readonly in_flight_authority?: readonly AutomationInFlightAuthorityV1[];
  readonly env?: NodeJS.ProcessEnv;
}

/** Existing settlement is immutable authority, including across producer upgrades. */
export function readAutomationUsageForResult(
  input: Pick<AppendAutomationUsageInput, 'repo_root' | 'reservation' | 'evidence_refs' | 'env'> & { readonly read_only?: true },
): AutomationUsageEventV1 | null {
  const root = resolve(input.repo_root);
  const reservation = validateAutomationReservation(input.reservation);
  const paths = runPaths(root, reservation.automation_run_id);
  const read = () => {
    const storedReservation = parse(readRaw(join(paths.reservationsByDigest, `${reservation.reservation_sha256}.json`), 'automation reservation'), validateAutomationReservation, 'automation reservation');
    if (canonicalAutomationJson(storedReservation) !== canonicalAutomationJson(reservation)) {
      fail('automation_budget_store_conflict', 'result reservation differs from stored authority');
    }
    const path = join(paths.events, `${reservation.reservation_sha256}.json`);
    if (!existsSync(path)) return null;
    const event = parse(readRaw(path, 'automation usage event'), validateAutomationUsageEvent, 'automation usage event');
    if (event.reservation_sha256 !== reservation.reservation_sha256 || event.budget_sha256 !== reservation.budget_sha256
      || event.automation_run_id !== reservation.automation_run_id || event.resolution !== 'observed'
      || canonicalAutomationJson(event.evidence_refs) !== canonicalAutomationJson(input.evidence_refs)) {
      fail('automation_budget_store_conflict', 'stored usage does not bind this exact observed result');
    }
    return event;
  };
  if (input.read_only) {
    readAutomationBudgetStatus(root, reservation.automation_run_id, input.env);
    return read();
  }
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    lockedStatus(root, paths, reservation.automation_run_id, automationStoreNow(), input.env);
    return read();
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export interface AutomationUsageCommitV1 {
  readonly event: AutomationUsageEventV1;
  readonly current: AutomationBudgetCurrentV1;
  readonly stop_receipt: AutomationStopReceiptV1 | null;
}

/**
 * The charge for one resolved operation. A reconciliation that cannot recover
 * the real usage pays the reserved worst case; one that proves the operation
 * never began pays nothing; everything else is derived from the outcome.
 */
function consumedFor(
  reservation: AutomationBudgetReservationV1,
  outcome: AutomationOutcome,
  resolution: AutomationUsageEventV1['resolution'],
): AutomationMetricVectorV1 {
  if (resolution === 'reconciled_reserved') return reservation.reserved;
  if (resolution === 'reconciled_not_started') {
    return validateAutomationMetricVector({
      agent_turns: 0,
      successful_acquisitions: 0,
      runner_invocations: 0,
      provider_failures: 0,
      repair_cycles: 0,
      input_tokens: reservation.reserved.input_tokens === null ? null : 0,
      output_tokens: reservation.reserved.output_tokens === null ? null : 0,
      cost_micros: reservation.reserved.cost_micros === null ? null : 0,
    }, 'consumed');
  }
  return deriveAutomationConsumption(reservation.operation, outcome, reservation.reserved);
}

interface PreparedUsageCommit {
  readonly event: AutomationUsageEventV1;
  readonly status: AutomationBudgetStatusV1;
  readonly replayed: boolean;
}

function prepareUsageCommit(
  paths: RunPaths,
  reservation: AutomationBudgetReservationV1,
  result: AutomationUsageResultV1,
  observedAt: string,
  resolution: AutomationUsageEventV1['resolution'],
  status: AutomationBudgetStatusV1,
): PreparedUsageCommit {
  const storedReservation = parse(readRaw(join(paths.reservationsByDigest, `${reservation.reservation_sha256}.json`), 'automation reservation'), validateAutomationReservation, 'automation reservation');
  if (canonicalAutomationJson(storedReservation) !== canonicalAutomationJson(reservation)) {
    fail('automation_budget_store_conflict', 'usage reservation differs from stored authority');
  }
  // A recorded reconciliation is the decision for this reservation, and it was
  // made durable before any event could be. A later plain append would
  // otherwise charge the caller's cheaper outcome over an operator's recorded
  // one, which is exactly what a crash between the two writes used to allow.
  const decided = readReconciliationOptional(paths, reservation.reservation_sha256);
  if (decided !== null && decided.resolution !== resolution) {
    fail(
      'automation_budget_store_conflict',
      `automation reservation ${reservation.reservation_sha256} was reconciled as ${decided.resolution}; it cannot be charged as ${resolution}`,
    );
  }
  const eventPath = join(paths.events, `${reservation.reservation_sha256}.json`);
  if (existsSync(eventPath)) {
    // Replaying the same key charges once. A replay that claims a different
    // charge is a conflict, not a second event.
    const stored = parse(readRaw(eventPath, 'automation usage event'), validateAutomationUsageEvent, 'automation usage event');
    if (canonicalAutomationJson(stored.consumed) !== canonicalAutomationJson(consumedFor(reservation, result.outcome, resolution))) {
      fail('automation_budget_store_conflict', 'a usage event for this reservation already exists with a different charge');
    }
    return { event: stored, status, replayed: true };
  }
  if (reservation.budget_sha256 !== status.current.budget_sha256) {
    fail('automation_budget_store_conflict', 'automation reservation was granted under a superseded budget revision');
  }
  if (!status.current.open_reservation_sha256s.includes(reservation.reservation_sha256)) {
    fail('automation_budget_store_conflict', 'automation reservation is not open on this run');
  }
  const event = sealAutomationUsageEvent({
    budget: status.budget,
    reservation,
    usage: { input_tokens: null, output_tokens: null, cost_micros: null },
    usage_attribution: null,
    consumed: consumedFor(reservation, result.outcome, resolution),
    outcome: result.outcome,
    resolution,
    evidence_refs: result.evidence_refs,
    observed_at: observedAt,
  });
  return { event, status, replayed: false };
}

function publishUsageCommit(
  paths: RunPaths,
  prepared: PreparedUsageCommit,
  observedAt: string,
  inFlight: readonly AutomationInFlightAuthorityV1[],
): AutomationUsageCommitV1 {
  const { event, status } = prepared;
  if (prepared.replayed) return Object.freeze({ event, current: status.current, stop_receipt: status.stop_receipt });
  const eventPath = join(paths.events, `${event.reservation_sha256}.json`);
  if (!writeExclusive(eventPath, bytes(event), 'automation usage event')) {
    fail('automation_budget_store_conflict', 'automation usage event was created concurrently');
  }
  const consumed = addAutomationMetricVectors(status.current.consumed, event.consumed);
  const streak = status.budget.authorization.campaign !== null ? status.current.consecutive_no_progress_steps
    : event.outcome === 'progress' || event.outcome === 'completed' ? 0 : status.current.consecutive_no_progress_steps + 1;
  const next = sealAutomationBudgetCurrent({
    automation_run_id: status.current.automation_run_id,
    budget_sha256: status.current.budget_sha256,
    state: status.stop_receipt === null ? 'active' : 'budget_exhausted',
    consumed,
    open_reserved: emptyAutomationMetricVector(),
    consecutive_no_progress_steps: streak,
    last_completed_step_index: event.step_index,
    next_step_index: event.step_index + 1,
    open_reservation_sha256s: [],
    event_count: status.current.event_count + 1,
    ledger_sha256: chainAutomationLedgerDigest(status.current.ledger_sha256, event.event_sha256),
    stop_receipt_sha256: status.stop_receipt?.stop_receipt_sha256 ?? null,
    previous_current_sha256: status.current.current_sha256,
    updated_at: observedAt,
  });
  writeAtomic(paths.current, bytes(next), 'automation budget current');
  const refusal = exhaustionRefusal(status.budget, next, observedAt);
  if (refusal === null) {
    return Object.freeze({ event, current: next, stop_receipt: status.stop_receipt });
  }
  const stopped = persistStopReceipt(paths, status.budget, next, refusal, inFlight, observedAt);
  return Object.freeze({ event, current: stopped.current, stop_receipt: stopped.receipt });
}

function commitUsage(
  repoRoot: string,
  paths: RunPaths,
  reservation: AutomationBudgetReservationV1,
  result: AutomationUsageResultV1,
  observedAt: string,
  resolution: AutomationUsageEventV1['resolution'],
  inFlight: readonly AutomationInFlightAuthorityV1[],
  env: NodeJS.ProcessEnv | undefined,
): AutomationUsageCommitV1 {
  const status = lockedStatus(repoRoot, paths, reservation.automation_run_id, observedAt, env);
  return publishUsageCommit(paths, prepareUsageCommit(paths, reservation, result, observedAt, resolution, status), observedAt, inFlight);
}

export function appendAutomationUsage(input: AppendAutomationUsageInput): AutomationUsageCommitV1 {
  const repoRoot = resolve(input.repo_root);
  const reservation = validateAutomationReservation(input.reservation);
  const paths = runPaths(repoRoot, reservation.automation_run_id);
  const observedAt = automationStoreNow();
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => commitUsage(
    repoRoot,
    paths,
    reservation,
    input,
    observedAt,
    'observed',
    input.in_flight_authority ?? [],
    input.env,
  ), { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

/** Persist the adapter observation before its usage event can close the call. */
export function recordCampaignProviderOutcome(input: {
  readonly repo_root: string;
  readonly reservation: CampaignAutomationBudgetReservationV1;
  readonly outcome: 'returned' | 'read_failed' | 'read_transient_failure';
  readonly result_sha256: string;
  readonly env?: NodeJS.ProcessEnv;
}): AutomationUsageCommitV1 {
  const reservation = validateAutomationReservation(input.reservation);
  if (reservation.kind !== CAMPAIGN_AUTOMATION_RESERVATION_KIND
    || !('request_sha256' in reservation.campaign_context)
    || (input.outcome !== 'returned' && input.outcome !== 'read_failed' && input.outcome !== 'read_transient_failure')
    || (input.outcome !== 'returned' && !['github_read', 'git_read'].includes(reservation.campaign_context.operation))
    || typeof input.result_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(input.result_sha256)) {
    fail('automation_budget_store_invalid', 'provider outcome requires an exact GitHub reservation and result digest');
  }
  const repoRoot = resolve(input.repo_root);
  const paths = runPaths(repoRoot, reservation.automation_run_id);
  const requestDigest = reservation.campaign_context.request_sha256;
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    const now = automationStoreNow();
    lockedStatus(repoRoot, paths, reservation.automation_run_id, now, input.env);
    const stored = parse(readRaw(join(paths.reservationsByDigest, `${reservation.reservation_sha256}.json`), 'provider reservation'), validateAutomationReservation, 'provider reservation');
    if (canonicalAutomationJson(stored) !== canonicalAutomationJson(reservation)
      || !readLedgerReservations(paths).some(entry => entry.reservation_sha256 === reservation.reservation_sha256)) {
      fail('automation_budget_store_conflict', 'provider outcome reservation differs from durable authority');
    }
    const basis = {
      protocol: 1, kind: 'repo-harness-campaign-provider-outcome',
      reservation_sha256: reservation.reservation_sha256,
      request_sha256: requestDigest,
      outcome: input.outcome, result_sha256: input.result_sha256,
    };
    const receipt = { ...basis, receipt_sha256: automationDigest(basis) };
    const usageOutcome = input.outcome === 'read_transient_failure' ? 'transient_failure' : input.outcome === 'read_failed' ? 'provider_failure' : 'no_progress';
    const evidenceRefs = [evidenceRef('campaign-provider-outcome', receipt.receipt_sha256)];
    const eventPath = join(paths.events, `${reservation.reservation_sha256}.json`);
    if (existsSync(eventPath)) {
      const event = parse(readRaw(eventPath, 'provider usage'), validateAutomationUsageEvent, 'provider usage');
      if (event.outcome !== usageOutcome || event.resolution !== 'observed'
        || canonicalAutomationJson(event.evidence_refs) !== canonicalAutomationJson(evidenceRefs)) {
        fail('automation_budget_store_conflict', 'provider usage already binds a different observation');
      }
    }
    const directory = join(paths.run, 'campaign-provider-outcomes');
    ensureDirectory(paths.common, directory);
    const path = join(directory, `${reservation.reservation_sha256}.json`);
    if (!writeExclusive(path, bytes(receipt), 'campaign provider outcome')
      && readRaw(path, 'campaign provider outcome') !== bytes(receipt)) {
      fail('automation_budget_store_conflict', 'provider outcome replay changes its durable observation');
    }
    return commitUsage(repoRoot, paths, reservation, {
      outcome: usageOutcome, evidence_refs: evidenceRefs,
    }, now, 'observed', [], input.env);
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export type AutomationReconciliationResolution =
  | 'reconciled_observed'
  | 'reconciled_reserved'
  | 'reconciled_not_started';

export interface ReconcileAutomationReservationInput extends AutomationUsageResultV1 {
  readonly repo_root: string;
  readonly reservation: AutomationBudgetReservationV1;
  readonly resolution: AutomationReconciliationResolution;
  readonly reason: string;
  readonly in_flight_authority?: readonly AutomationInFlightAuthorityV1[];
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Recovery from an interrupted operation, from exact evidence only.
 *
 * There is no zero-usage default: a reconciliation without evidence is
 * refused, `reconciled_not_started` must prove the operation never began, and
 * `reconciled_reserved` charges the full reserved upper bound when the real
 * usage cannot be recovered. Losing an observation therefore costs the worst
 * case, never nothing.
 */
export function reconcileAutomationReservation(
  input: ReconcileAutomationReservationInput,
): AutomationUsageCommitV1 {
  const repoRoot = resolve(input.repo_root);
  const reservation = validateAutomationReservation(input.reservation);
  const paths = runPaths(repoRoot, reservation.automation_run_id);
  if (input.evidence_refs.length === 0) {
    throw new AutomationBudgetStoreError(
      'automation_budget_reconciliation_evidence_missing',
      'reconciling an interrupted automation reservation requires exact evidence; usage is never assumed to be zero',
    );
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length === 0) {
    fail('automation_budget_store_invalid', 'a reconciliation must record why the reservation was interrupted');
  }
  // The charge is derived from the resolution, so the caller chooses which
  // recovery it can prove, never what it costs.
  if (input.resolution === 'reconciled_not_started') {
    // Charging nothing is the one resolution that costs nothing, so it carries
    // the strictest shape requirement this ledger can check today: at least one
    // ref that names the run the operation would have belonged to.
    const named = input.evidence_refs.some(
      (entry) => (AUTOMATION_RUN_EVIDENCE_SCHEMES as readonly string[]).includes(automationEvidenceScheme(entry.ref)),
    );
    if (!named) {
      fail(
        'automation_budget_store_invalid',
        `a not-started reconciliation needs at least one evidence ref naming the run (${AUTOMATION_RUN_EVIDENCE_SCHEMES.join(' or ')})`,
      );
    }
  }
  const reconciledAt = automationStoreNow();
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    // Same rule: the run is classified before its reconciliation record lands,
    // so a corrupt run refuses without gaining a fourth durable record.
    const status = lockedStatus(repoRoot, paths, reservation.automation_run_id, reconciledAt, input.env);
    const prepared = prepareUsageCommit(paths, reservation, input, reconciledAt, input.resolution, status);
    if (prepared.replayed && (prepared.event.resolution !== input.resolution || prepared.event.outcome !== input.outcome
      || canonicalAutomationJson(prepared.event.evidence_refs) !== canonicalAutomationJson(input.evidence_refs))) {
      fail('automation_budget_store_conflict', 'reconciliation differs from the settled usage event');
    }
    const evidence = {
      protocol: 1,
      kind: 'repo-harness-automation-reconciliation',
      automation_run_id: reservation.automation_run_id,
      reservation_sha256: reservation.reservation_sha256,
      resolution: input.resolution,
      reason: input.reason,
      evidence_refs: [...input.evidence_refs],
    };
    const recordPath = join(paths.reconciliations, `${reservation.reservation_sha256}.json`);
    if (!writeExclusive(recordPath, bytes({ ...evidence, reconciled_at: reconciledAt }), 'automation reconciliation')) {
      // A replay lands at a different store time, so the evidence is compared
      // rather than the bytes: the same reservation may only be reconciled with
      // the same resolution, reason and evidence.
      const stored = JSON.parse(readRaw(recordPath, 'automation reconciliation')) as Record<string, unknown>;
      delete stored.reconciled_at;
      if (canonicalAutomationJson(stored) !== canonicalAutomationJson(evidence)) {
        fail('automation_budget_store_conflict', 'this reservation was already reconciled with different evidence');
      }
    }
    return publishUsageCommit(paths, prepared, reconciledAt, input.in_flight_authority ?? []);
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export interface RepairAutomationReconciliationInput extends AutomationUsageResultV1 {
  readonly repo_root: string;
  readonly automation_run_id: string;
  readonly reservation_sha256: string;
  readonly expected_reconciliation_sha256: string;
  readonly repair_reason: string;
  readonly mode: 'dry_run' | 'apply';
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Explicit recovery of malformed evidence digests, never a change of decision.
 * The original record remains immutable; only its full reserved charge can be
 * completed. A repair receipt binds the original bytes to the supplied evidence
 * and is itself referenced by the usage event, including after an interrupted apply.
 */
export function repairAutomationReconciliation(input: RepairAutomationReconciliationInput) {
  if (input.mode !== 'dry_run' && input.mode !== 'apply') fail('automation_budget_store_invalid', 'reconciliation repair requires dry_run or apply');
  if (!RUN_ID.test(input.reservation_sha256) || !RUN_ID.test(input.expected_reconciliation_sha256)) {
    fail('automation_budget_store_invalid', 'reconciliation repair requires exact lowercase hex digests');
  }
  if (typeof input.repair_reason !== 'string' || input.repair_reason.trim().length === 0
    || !Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0) {
    fail('automation_budget_store_invalid', 'reconciliation repair requires a reason and exact corrected evidence');
  }
  const corrected = input.evidence_refs.map((ref, index) => assertAutomationEvidenceRef(ref, `repair evidence_refs[${index}]`));
  const repoRoot = resolve(input.repo_root);
  const paths = runPaths(repoRoot, input.automation_run_id);
  const perform = () => {
    const now = automationStoreNow();
    const status = readAutomationBudgetStatusAt(repoRoot, input.automation_run_id, now, input.env);
    const reservation = parse(readRaw(join(paths.reservationsByDigest, `${input.reservation_sha256}.json`), 'automation reservation'), validateAutomationReservation, 'automation reservation');
    if (reservation.reservation_sha256 !== input.reservation_sha256 || reservation.automation_run_id !== input.automation_run_id) {
      fail('automation_budget_store_conflict', 'reconciliation repair reservation identity differs');
    }
    const raw = readRaw(join(paths.reconciliations, `${input.reservation_sha256}.json`), 'automation reconciliation');
    if (createHash('sha256').update(raw).digest('hex') !== input.expected_reconciliation_sha256) {
      fail('automation_budget_store_conflict', 'reconciliation repair expected record digest differs');
    }
    const original = parse(raw, (value: Record<string, unknown>) => value, 'automation reconciliation');
    const fields = ['protocol', 'kind', 'automation_run_id', 'reservation_sha256', 'resolution', 'reason', 'evidence_refs', 'reconciled_at'];
    if (!original || typeof original !== 'object' || Array.isArray(original)
      || canonicalAutomationJson(Object.keys(original).sort()) !== canonicalAutomationJson(fields.sort())
      || original.protocol !== 1 || original.kind !== 'repo-harness-automation-reconciliation'
      || original.automation_run_id !== input.automation_run_id || original.reservation_sha256 !== input.reservation_sha256
      || original.resolution !== 'reconciled_reserved' || typeof original.reason !== 'string' || original.reason.trim().length === 0
      || typeof original.reconciled_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(original.reconciled_at)
      || Number.isNaN(Date.parse(original.reconciled_at)) || !Array.isArray(original.evidence_refs)) {
      fail('automation_budget_store_invalid', 'repair requires an intact reconciled_reserved decision with malformed evidence digests');
    }
    const oldRefs = original.evidence_refs as AutomationEvidenceRefV1[];
    if (oldRefs.length !== corrected.length || oldRefs.some((ref, index) => !ref || ref.ref !== corrected[index]!.ref)) {
      fail('automation_budget_store_conflict', 'reconciliation repair must preserve the original evidence references');
    }
    let malformed = false;
    try { oldRefs.forEach((ref, index) => assertAutomationEvidenceRef(ref, `original evidence_refs[${index}]`)); }
    catch { malformed = true; }
    if (!malformed) fail('automation_budget_store_conflict', 'valid reconciliation evidence cannot be repaired');

    const directory = join(paths.reconciliations, 'repairs');
    const repairPath = join(directory, `${input.reservation_sha256}.json`);
    const basis = {
      protocol: 1, kind: 'repo-harness-automation-reconciliation-repair',
      automation_run_id: input.automation_run_id, reservation_sha256: input.reservation_sha256,
      reconciliation_sha256: input.expected_reconciliation_sha256,
      repair_reason: input.repair_reason, outcome: input.outcome, evidence_refs: corrected,
    };
    let repair = { ...basis, repaired_at: now, receipt_sha256: automationDigest({ ...basis, repaired_at: now }) };
    const existingRepair = existsSync(repairPath);
    if (existingRepair) {
      const stored = parse(readRaw(repairPath, 'reconciliation repair'), (value: typeof repair) => value, 'reconciliation repair');
      const { receipt_sha256, repaired_at, ...storedBasis } = stored;
      if (canonicalAutomationJson(storedBasis) !== canonicalAutomationJson(basis)
        || typeof repaired_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(repaired_at)
        || Number.isNaN(Date.parse(repaired_at)) || receipt_sha256 !== automationDigest({ ...storedBasis, repaired_at })) {
        fail('automation_budget_store_conflict', 'reconciliation repair replay differs from its immutable receipt');
      }
      repair = stored;
    }
    const result = { outcome: input.outcome, evidence_refs: [...corrected,
      { ref: `repo:automation-reconciliation-repair/${input.automation_run_id}/${input.reservation_sha256}`, sha256: repair.receipt_sha256 }] };
    const prepared = prepareUsageCommit(paths, reservation, result, now, 'reconciled_reserved', status);
    if (prepared.replayed && (!existingRepair || prepared.event.resolution !== 'reconciled_reserved'
      || prepared.event.outcome !== input.outcome || canonicalAutomationJson(prepared.event.evidence_refs) !== canonicalAutomationJson(result.evidence_refs))) {
      fail('automation_budget_store_conflict', 'reconciliation repair cannot replace existing usage');
    }
    if (input.mode === 'dry_run') return Object.freeze({ dry_run: true, replayed: prepared.replayed, repair_receipt: repair, event: prepared.event, commit: null });
    // Input and all immutable replay checks precede even projection repair.
    const locked = lockedStatus(repoRoot, paths, input.automation_run_id, now, input.env);
    const final = prepareUsageCommit(paths, reservation, result, now, 'reconciled_reserved', locked);
    ensureDirectory(paths.common, directory);
    if (!writeExclusive(repairPath, bytes(repair), 'reconciliation repair')
      && readRaw(repairPath, 'reconciliation repair') !== bytes(repair)) {
      fail('automation_budget_store_conflict', 'reconciliation repair receipt was created concurrently');
    }
    const commit = publishUsageCommit(paths, final, now, []);
    return Object.freeze({ dry_run: false, replayed: final.replayed, repair_receipt: repair, event: commit.event, commit });
  };
  if (input.mode === 'dry_run') return perform();
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, perform, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function listAutomationBudgetRuns(repoRoot: string): readonly string[] {
  const paths = storePaths(resolve(repoRoot));
  if (!existsSync(paths.runs)) return Object.freeze([]);
  try {
    return Object.freeze(readdirSync(paths.runs).filter((entry) => RUN_ID.test(entry)).sort());
  } catch (error) {
    return fail('automation_budget_store_unavailable', 'cannot list automation budget runs', error);
  }
}

/** Read a previously admitted operation without re-running admission or minting a reservation. */
export function readAutomationReservationByKey(repoRoot: string, runId: string, idempotencyKey: string, env?: NodeJS.ProcessEnv): AutomationBudgetReservationV1 | null {
  const paths = runPaths(resolve(repoRoot), runId);
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    lockedStatus(resolve(repoRoot), paths, runId, automationStoreNow(), env);
    const path = join(paths.reservations, `${keyDigest(idempotencyKey)}.json`);
    if (!existsSync(path)) return null;
    const value = parse(readRaw(path, 'automation reservation'), validateAutomationReservation, 'automation reservation');
    if (value.idempotency_key !== idempotencyKey || value.automation_run_id !== runId) fail('automation_budget_store_conflict', 'stored reservation lookup identity differs');
    return value;
  });
}

/** Durable read observations share the budget's identity and single unresolved slot. */
export function runCampaignProviderRead<T>(input: ReserveCampaignProviderBudgetInput & {
  readonly observation_mode: 'replay' | 'refresh';
  readonly observation_request_sha256: string;
  readonly invoke: (timeoutMs: number) => T;
  readonly classify_failure: (error: unknown) => 'read_failed' | 'read_transient_failure' | null;
}): T {
  if (input.operation !== 'git_read' && input.operation !== 'github_read') fail('automation_budget_store_invalid', 'read recovery requires a read operation');
  const paths = runPaths(resolve(input.repo_root), input.automation_run_id);
  const identity = automationDigest({ step: input.step_admission_sha256, key: input.idempotency_key });
  return withExclusiveDirectoryLock(paths.common, `${relative(paths.common, paths.run)}/provider-read.lock`, () => {
    const directory = join(paths.run, 'campaign-read-observations');
    ensureDirectory(paths.common, directory);
    const load = <V>(part: string): V | null => {
      const path = join(directory, `${identity}-${part}.json`);
      if (!existsSync(path)) return null;
      const raw = readRaw(path, 'read observation');
      const value = JSON.parse(raw);
      if (value.record_sha256 !== automationDigest(value.record) || raw !== bytes(value)) fail('automation_budget_store_invalid', 'read observation digest differs');
      return value.record as V;
    };
    const save = (part: string, record: unknown) => {
      const path = join(directory, `${identity}-${part}.json`);
      const content = bytes({ record, record_sha256: automationDigest(record) });
      if (!writeExclusive(path, content, 'read observation') && readRaw(path, 'read observation') !== content) fail('automation_budget_store_conflict', 'read request identity differs');
    };
    save('request', { step: input.step_admission_sha256, operation: input.operation, request_sha256: input.request_sha256,
      campaign_id: input.campaign_id, group_number: input.group_number, intent_sha256: input.intent_sha256, budget: input.expected_budget_sha256 });
    type Observation = { outcome: 'returned'; result: T } | { outcome: 'read_failed' | 'read_transient_failure'; detail: string };
    for (let generation = 0; ; generation++) {
      const key = `${identity}:${generation}`;
      const priorRequest = load<{ request_sha256: string }>(`${generation}-request`);
      const observationRequest = priorRequest ?? { request_sha256: input.observation_request_sha256 };
      save(`${generation}-request`, observationRequest);
      if (input.observation_mode === 'replay' && observationRequest.request_sha256 !== input.observation_request_sha256) fail('automation_budget_store_conflict', 'replayed read request differs');
      const request = { ...input, request_sha256: automationDigest({ logical_request: input.request_sha256, observation: observationRequest, generation }), idempotency_key: key };
      const stored = readAutomationReservationByKey(input.repo_root, input.automation_run_id, key, input.env);
      if (stored && (stored.kind !== CAMPAIGN_AUTOMATION_RESERVATION_KIND || !('request_sha256' in stored.campaign_context)
        || stored.campaign_context.request_sha256 !== request.request_sha256 || stored.campaign_context.operation !== input.operation
        || stored.campaign_context.step_admission_sha256 !== input.step_admission_sha256)) fail('automation_budget_store_conflict', 'read reservation binding differs');
      const reservation = stored as CampaignAutomationBudgetReservationV1 | null;
      const observed = load<Observation>(`${generation}-result`);
      const started = load<{ reservation_sha256: string }>(`${generation}-started`);
      if (observed || started) {
        if (!reservation || started?.reservation_sha256 !== reservation.reservation_sha256) fail('automation_budget_store_conflict', 'read observation lost its reservation');
        if (observed) {
          recordCampaignProviderOutcome({ ...input, reservation, outcome: observed.outcome,
            result_sha256: automationDigest(observed.outcome === 'returned' ? observed.result : observed) });
          if (observed.outcome === 'returned' && input.observation_mode === 'replay') return observed.result;
        } else {
          reconcileAutomationReservation({ ...input, reservation, resolution: 'reconciled_reserved', outcome: 'no_progress',
            reason: 'interrupted read observation charged at its reserved upper bound',
            evidence_refs: [{ ref: `controller-run:${input.automation_run_id}`, sha256: automationDigest(started) }] });
        }
        continue;
      }
      if (observationRequest.request_sha256 !== input.observation_request_sha256) {
        if (input.observation_mode !== 'refresh') fail('automation_budget_store_conflict', 'replayed read request differs');
        if (reservation) reconcileAutomationReservation({ ...input, reservation, resolution: 'reconciled_reserved', outcome: 'no_progress',
          reason: 'superseded read reservation charged at its reserved upper bound',
          evidence_refs: [{ ref: `controller-run:${input.automation_run_id}`, sha256: automationDigest(observationRequest) }] });
        continue;
      }
      const admitted = reservation ?? reserveCampaignProviderBudget(request).reservation;
      const status = readAutomationBudgetStatus(input.repo_root, input.automation_run_id, input.env);
      const remaining = Date.parse(admitted.deadline_at) - Date.parse(automationStoreNow());
      if (status.stop_receipt || remaining <= 0 || status.current.open_reservation_sha256s.length !== 1
        || status.current.open_reservation_sha256s[0] !== admitted.reservation_sha256) fail('automation_budget_refused', 'read observation is stopped or no longer owned');
      save(`${generation}-started`, { reservation_sha256: admitted.reservation_sha256 });
      let result: T;
      try { result = input.invoke(Math.min(remaining, 30_000)); }
      catch (error) {
        const outcome = input.classify_failure(error);
        if (outcome) {
          const failure = { outcome, detail: error instanceof Error ? error.message : String(error) };
          save(`${generation}-result`, failure);
          recordCampaignProviderOutcome({ ...input, reservation: admitted, outcome, result_sha256: automationDigest(failure) });
        }
        throw error;
      }
      save(`${generation}-result`, { outcome: 'returned', result });
      recordCampaignProviderOutcome({ ...input, reservation: admitted, outcome: 'returned', result_sha256: automationDigest(result) });
      return result;
    }
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}
