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
  AUTOMATION_ENFORCEMENT_ORDER,
  AUTOMATION_LEDGER_GENESIS,
  AUTOMATION_METRIC_LIMIT_FIELDS,
  AUTOMATION_RUN_EVIDENCE_SCHEMES,
  AUTOMATION_VERIFIED_USAGE_METRICS,
  automationEvidenceScheme,
  automationOperationReservation,
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
  sealAutomationReservation,
  sealAutomationStopReceipt,
  sealAutomationUsageEvent,
  validateAutomationBudget,
  validateAutomationBudgetCurrent,
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
  type ProgramUnitKind,
} from '../../core/automation/budget';
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

export type AutomationBudgetStoreErrorCode =
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
  for (const target of [paths.root, paths.budgets, paths.runs, paths.locks, paths.run, paths.reservations, paths.reservationsByDigest, paths.events, paths.reconciliations]) {
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
function assertBudgetAuthorities(repoRoot: string, budget: AutomationBudgetV1): void {
  const grant = budget.authorization;
  if (budget.repository_id !== grant.repository_id) {
    fail('automation_budget_store_invalid', 'automation budget repository_id does not match the grant it cites');
  }
  // Re-anchored on every read, not only at publish: a grant an operator revoked
  // or edited must stop the run at the next verb rather than at the next
  // publication, which may never come.
  assertProgramAuthorizationAnchored(repoRoot, grant);
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

export function readAutomationBudget(repoRoot: string, budgetSha256: string): AutomationBudgetV1 {
  const paths = storePaths(repoRoot);
  if (!/^[0-9a-f]{64}$/u.test(budgetSha256)) fail('automation_budget_store_unsafe', 'unsafe automation budget digest');
  const budget = parse(readRaw(join(paths.budgets, `${budgetSha256}.json`), 'automation budget'), validateAutomationBudget, 'automation budget');
  if (budget.budget_sha256 !== budgetSha256) fail('automation_budget_store_invalid', 'automation budget digest does not match its path');
  assertTokenLimitsUnenforceable(budget);
  assertBudgetAuthorities(repoRoot, budget);
  return budget;
}

function readCurrentOptional(paths: RunPaths): AutomationBudgetCurrentV1 | null {
  if (!existsSync(paths.current)) return null;
  return parse(readRaw(paths.current, 'automation budget current'), validateAutomationBudgetCurrent, 'automation budget current');
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
export function readAutomationBudgetStatus(repoRoot: string, runId: string): AutomationBudgetStatusV1 {
  return readAutomationBudgetStatusAt(repoRoot, runId, automationStoreNow());
}

/**
 * The same read against one exact instant. `now` is internal: it comes from the
 * store clock at the top of a read, never from a caller, and exists so a single
 * read renders every time-dependent field from one instant instead of sampling
 * the clock twice and reporting two different moments as one state.
 */
function readAutomationBudgetStatusAt(repoRoot: string, runId: string, now: string): AutomationBudgetStatusV1 {
  const paths = runPaths(repoRoot, runId);
  const current = readCurrentOptional(paths);
  if (current === null) fail('automation_budget_store_not_found', `automation run ${runId} has no budget`);
  const budget = readAutomationBudget(repoRoot, current.budget_sha256);
  if (budget.automation_run_id !== runId) fail('automation_budget_store_invalid', 'automation budget does not belong to this run');
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
  const derived = drift === 'none' ? null : deriveCurrentFromDurableRecords(paths, current, receipt, now);
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
 * derived projection of all three durable record kinds -- `reservations/`,
 * `events/`, and `stop-receipt.json` -- and the repair is a re-derivation
 * rather than a guess: a reservation with no event is the interrupted
 * operation, an event the projection has not folded in is a charge that already
 * happened, and a stop receipt the projection has not adopted means the run is
 * already stopped. Nothing is ever silently re-minted, and no metric is ever
 * assumed to be zero.
 *
 * Drift is detected by counting directory entries and resolving each listed
 * open reservation through the by-digest index. The healthy path is two
 * `readdir` calls plus, while an operation is in flight, one `stat` and one
 * parse for the single open reservation -- never a scan of every record. The
 * full re-derivation only runs after a crash.
 */
function jsonEntries(directory: string): readonly string[] {
  if (!existsSync(directory)) return Object.freeze([]);
  try {
    return Object.freeze(readdirSync(directory).filter((entry) => entry.endsWith('.json')).sort());
  } catch (error) {
    return fail('automation_budget_store_unavailable', `cannot list ${directory}`, error);
  }
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
  const events = jsonEntries(paths.events).length;
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
  if (reservations < events) {
    fail(
      'automation_budget_store_invalid',
      `automation ledger is missing reservations: ${events} usage events are on disk but only ${reservations} reservations are`,
    );
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
  if (reservations > events + listedOpen) return 'unlisted_reservation';
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
  storedCurrent: AutomationBudgetCurrentV1,
  stopReceipt: AutomationStopReceiptV1 | null,
  derivedAt: string,
): { readonly current: AutomationBudgetCurrentV1; readonly latest_record_at: string | null } {
  const events = jsonEntries(paths.events)
    .map((entry) => parse(readRaw(join(paths.events, entry), 'automation usage event'), validateAutomationUsageEvent, 'automation usage event'))
    .sort((left, right) => left.step_index - right.step_index);
  const reservations = jsonEntries(paths.reservations)
    .map((entry) => parse(readRaw(join(paths.reservations, entry), 'automation reservation'), validateAutomationReservation, 'automation reservation'));
  const closed = new Set(events.map((event) => event.reservation_sha256));
  const open = reservations.filter((reservation) => !closed.has(reservation.reservation_sha256));
  if (open.length > 1) {
    fail('automation_budget_store_conflict', 'more than one automation reservation is unresolved; this run cannot be reconciled automatically');
  }
  const folded = foldAutomationLedger(events);
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
    state: stopReceipt !== null ? 'budget_exhausted' : held === null ? 'active' : 'reconciliation_required',
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
  const derived = deriveCurrentFromDurableRecords(paths, status.stored_current, status.stop_receipt, repairedAt);
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
function lockedStatus(repoRoot: string, paths: RunPaths, runId: string, now: string): AutomationBudgetStatusV1 {
  const status = readAutomationBudgetStatusAt(repoRoot, runId, now);
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
 * An unattended run may not start without a concrete enforceable budget. There
 * is no unlimited default and no advisory mode.
 */
export function requireUnattendedAutomationRunBudget(repoRoot: string, runId: string): AutomationBudgetStatusV1 {
  const paths = runPaths(repoRoot, runId);
  const current = readCurrentOptional(paths);
  requireUnattendedAutomationBudget(current === null ? null : readAutomationBudget(repoRoot, current.budget_sha256));
  return readAutomationBudgetStatus(repoRoot, runId);
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
): AutomationBudgetBoardSliceV1 {
  // One instant for the whole slice. Sampling the clock again for the
  // wall-clock row could straddle the deadline and render a run that the drift
  // check just called exhausted as active with time left, or the reverse.
  const observedAt = automationStoreNow();
  // `status.current` is already the durable truth: the read folds the records
  // when the stored projection lags, so the slice never renders counts a crash
  // left behind. `projection_stale` still says the stored projection has not
  // caught up.
  const status = readAutomationBudgetStatusAt(repoRoot, runId, observedAt);
  return projectAutomationBudgetSlice({
    budget: status.budget,
    current: status.current,
    stop_receipt: status.stop_receipt,
    drift: status.drift,
    observed_at: observedAt,
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
  assertProgramAuthorizationAnchored(resolve(input.repo_root), budget.authorization);
  assertBudgetAuthorities(resolve(input.repo_root), budget);
  if (Date.parse(budget.created_at) > Date.parse(publishedAt)) {
    fail('automation_budget_store_invalid', 'an automation budget cannot be created in the future of the store clock');
  }
  const repoRoot = resolve(input.repo_root);
  const paths = runPaths(repoRoot, budget.automation_run_id);
  prepareRun(paths);
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    const budgetPath = join(paths.budgets, `${budget.budget_sha256}.json`);
    const encoded = bytes(budget);
    if (!writeExclusive(budgetPath, encoded, 'automation budget') && readRaw(budgetPath, 'automation budget') !== encoded) {
      fail('automation_budget_store_conflict', 'an automation budget with this digest already exists with different bytes');
    }
    const preexisting = readCurrentOptional(paths);
    const existing = preexisting === null
      ? null
      : lockedStatus(repoRoot, paths, budget.automation_run_id, publishedAt).current;
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
    const previous = readAutomationBudget(repoRoot, existing.budget_sha256);
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
}

/**
 * The one enforcement point. Nothing may claim, dispatch, retry, or call a
 * provider without a reservation returned by this function, and a reservation
 * that would push any hard metric past its limit is refused before the
 * operation runs.
 */
export function reserveAutomationBudget(input: ReserveAutomationBudgetInput): AutomationBudgetReservationV1 {
  const repoRoot = resolve(input.repo_root);
  const paths = runPaths(repoRoot, input.automation_run_id);
  const reservedAt = automationStoreNow();
  // The counting components come from the operation kind, never from the
  // caller: an acquisition that reserves zero acquisitions is not a smaller
  // request, it is an unmetered one. Token and cost components stay null while
  // no provider-attested usage authority is wired.
  const reserved = automationOperationReservation(input.operation, {
    input_tokens: null,
    output_tokens: null,
    cost_micros: null,
  });
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    const status = lockedStatus(repoRoot, paths, input.automation_run_id, reservedAt);
    const reservationPath = join(paths.reservations, `${keyDigest(input.idempotency_key)}.json`);
    // A stored reservation is closed, open, or nothing this store may act on.
    // The third case cannot survive `lockedStatus`, so reaching it means the
    // durable records and the projection still disagree: fail closed rather
    // than re-mint a reservation whose headroom is unaccounted for.
    const replay = (): AutomationBudgetReservationV1 | null => {
      if (!existsSync(reservationPath)) return null;
      const stored = parse(readRaw(reservationPath, 'automation reservation'), validateAutomationReservation, 'automation reservation');
      if (stored.idempotency_key !== input.idempotency_key) {
        fail('automation_budget_store_conflict', 'automation reservation idempotency key collides with a different key');
      }
      if (stored.budget_sha256 !== status.current.budget_sha256) {
        fail('automation_budget_store_conflict', 'automation reservation was granted under a superseded budget revision');
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
      idempotency_key: input.idempotency_key,
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
        if (stored !== null) return stored;
      }
      if (code === 'budget_limit_exceeded' || code === 'budget_expired') {
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
    if (replayed !== null) return replayed;
    const reservation = sealAutomationReservation({
      automation_run_id: status.budget.automation_run_id,
      budget_sha256: status.budget.budget_sha256,
      idempotency_key: input.idempotency_key,
      operation: input.operation,
      unit_kind: input.unit_kind,
      unit_id: input.unit_id,
      attempt: input.attempt,
      provider: input.provider,
      step_index: status.current.next_step_index,
      reserved,
      reserved_at: reservedAt,
      deadline_at: status.budget.deadline_at,
      previous_ledger_sha256: status.current.ledger_sha256,
    });
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
    return reservation;
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
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

function commitUsage(
  repoRoot: string,
  paths: RunPaths,
  reservation: AutomationBudgetReservationV1,
  result: AutomationUsageResultV1,
  observedAt: string,
  resolution: AutomationUsageEventV1['resolution'],
  inFlight: readonly AutomationInFlightAuthorityV1[],
): AutomationUsageCommitV1 {
  const status = lockedStatus(repoRoot, paths, reservation.automation_run_id, observedAt);
  const eventPath = join(paths.events, `${reservation.reservation_sha256}.json`);
  if (existsSync(eventPath)) {
    // Replaying the same key charges once. A replay that claims a different
    // charge is a conflict, not a second event.
    const stored = parse(readRaw(eventPath, 'automation usage event'), validateAutomationUsageEvent, 'automation usage event');
    if (canonicalAutomationJson(stored.consumed) !== canonicalAutomationJson(consumedFor(reservation, result.outcome, resolution))) {
      fail('automation_budget_store_conflict', 'a usage event for this reservation already exists with a different charge');
    }
    return Object.freeze({ event: stored, current: status.current, stop_receipt: status.stop_receipt });
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
  if (!writeExclusive(eventPath, bytes(event), 'automation usage event')) {
    fail('automation_budget_store_conflict', 'automation usage event was created concurrently');
  }
  const consumed = addAutomationMetricVectors(status.current.consumed, event.consumed);
  const streak = event.outcome === 'progress' || event.outcome === 'completed'
    ? 0
    : status.current.consecutive_no_progress_steps + 1;
  const next = sealAutomationBudgetCurrent({
    automation_run_id: status.current.automation_run_id,
    budget_sha256: status.current.budget_sha256,
    state: 'active',
    consumed,
    open_reserved: emptyAutomationMetricVector(),
    consecutive_no_progress_steps: streak,
    last_completed_step_index: event.step_index,
    next_step_index: event.step_index + 1,
    open_reservation_sha256s: [],
    event_count: status.current.event_count + 1,
    ledger_sha256: chainAutomationLedgerDigest(status.current.ledger_sha256, event.event_sha256),
    stop_receipt_sha256: null,
    previous_current_sha256: status.current.current_sha256,
    updated_at: observedAt,
  });
  writeAtomic(paths.current, bytes(next), 'automation budget current');
  const refusal = exhaustionRefusal(status.budget, next, observedAt);
  if (refusal === null) {
    return Object.freeze({ event, current: next, stop_receipt: null });
  }
  const stopped = persistStopReceipt(paths, status.budget, next, refusal, inFlight, observedAt);
  return Object.freeze({ event, current: stopped.current, stop_receipt: stopped.receipt });
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
  ), { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
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
    return commitUsage(repoRoot, paths, reservation, input, reconciledAt, input.resolution, input.in_flight_authority ?? []);
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
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
