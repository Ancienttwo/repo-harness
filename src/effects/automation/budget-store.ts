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
  renameSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { createHash } from 'crypto';
import { dirname, join, relative, resolve, sep } from 'path';

import {
  AUTOMATION_ENFORCEMENT_ORDER,
  AUTOMATION_LEDGER_GENESIS,
  AUTOMATION_METRIC_LIMIT_FIELDS,
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

const RUN_ID = /^[0-9a-f]{64}$/u;

export type AutomationBudgetStoreErrorCode =
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
  for (const target of [paths.root, paths.budgets, paths.runs, paths.locks, paths.run, paths.reservations, paths.events, paths.reconciliations]) {
    ensureDirectory(paths.common, target);
  }
}

function writeAll(descriptor: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
}

/** Create-once persistence: an immutable record is written or it already exists. */
function writeExclusive(path: string, bytes: string, label: string): boolean {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, Buffer.from(bytes, 'utf8'));
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    syncDirectory(dirname(path));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    fail('automation_budget_store_unavailable', `cannot persist ${label}`, error);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  return fail('automation_budget_store_unavailable', `cannot persist ${label}`);
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

export function readAutomationBudget(repoRoot: string, budgetSha256: string): AutomationBudgetV1 {
  const paths = storePaths(repoRoot);
  if (!/^[0-9a-f]{64}$/u.test(budgetSha256)) fail('automation_budget_store_unsafe', 'unsafe automation budget digest');
  const budget = parse(readRaw(join(paths.budgets, `${budgetSha256}.json`), 'automation budget'), validateAutomationBudget, 'automation budget');
  if (budget.budget_sha256 !== budgetSha256) fail('automation_budget_store_invalid', 'automation budget digest does not match its path');
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
  readonly current: AutomationBudgetCurrentV1;
  readonly stop_receipt: AutomationStopReceiptV1 | null;
}

export function readAutomationBudgetStatus(repoRoot: string, runId: string): AutomationBudgetStatusV1 {
  const paths = runPaths(repoRoot, runId);
  const current = readCurrentOptional(paths);
  if (current === null) fail('automation_budget_store_not_found', `automation run ${runId} has no budget`);
  const budget = readAutomationBudget(repoRoot, current.budget_sha256);
  if (budget.automation_run_id !== runId) fail('automation_budget_store_invalid', 'automation budget does not belong to this run');
  const receipt = readStopReceiptOptional(paths);
  if (current.stop_receipt_sha256 !== null && receipt === null) {
    fail('automation_budget_store_invalid', 'automation budget current names a stop receipt that is missing');
  }
  if (receipt !== null && current.stop_receipt_sha256 !== receipt.stop_receipt_sha256) {
    fail('automation_budget_store_invalid', 'automation stop receipt does not match the current projection');
  }
  return Object.freeze({ budget, current, stop_receipt: receipt });
}

/**
 * The one recovery for a durable record `current.json` does not agree with.
 *
 * Every record except `current.json` is create-once and fsynced before the
 * projection is renamed, so a crash can only ever leave the projection behind
 * the durable records -- never ahead of them. That makes `current.json` a
 * derived projection of `reservations/` and `events/`, and the repair is a
 * re-derivation rather than a guess: a reservation with no event is the
 * interrupted operation, an event the projection has not folded in is a charge
 * that already happened. Nothing is ever silently re-minted, and no metric is
 * ever assumed to be zero.
 *
 * Drift is detected by counting directory entries, which costs two `readdir`
 * calls on the healthy path; the full re-derivation only runs after a crash.
 */
export type AutomationCurrentDrift = 'none' | 'unlisted_reservation' | 'unfolded_event';

function jsonEntries(directory: string): readonly string[] {
  if (!existsSync(directory)) return Object.freeze([]);
  try {
    return Object.freeze(readdirSync(directory).filter((entry) => entry.endsWith('.json')).sort());
  } catch (error) {
    return fail('automation_budget_store_unavailable', `cannot list ${directory}`, error);
  }
}

export function detectAutomationCurrentDrift(
  paths: RunPaths,
  current: AutomationBudgetCurrentV1,
): AutomationCurrentDrift {
  const events = jsonEntries(paths.events).length;
  if (events !== current.event_count) return 'unfolded_event';
  if (jsonEntries(paths.reservations).length !== events + current.open_reservation_sha256s.length) {
    return 'unlisted_reservation';
  }
  return 'none';
}

function repairCurrentFromDurableRecords(
  repoRoot: string,
  paths: RunPaths,
  status: AutomationBudgetStatusV1,
  repairedAt: string,
): AutomationBudgetStatusV1 {
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
    automation_run_id: status.current.automation_run_id,
    budget_sha256: status.current.budget_sha256,
    // A repaired run is one that was interrupted: the refusal it produces is
    // the same one an open reservation produces, so the next operation is
    // blocked until the interrupted one is appended or reconciled.
    state: status.stop_receipt !== null ? 'budget_exhausted' : held === null ? 'active' : 'reconciliation_required',
    consumed: folded.consumed,
    open_reserved: held === null ? emptyAutomationMetricVector() : held.reserved,
    consecutive_no_progress_steps: folded.consecutive_no_progress_steps,
    last_completed_step_index: folded.last_completed_step_index,
    next_step_index: nextStepIndex,
    open_reservation_sha256s: held === null ? [] : [held.reservation_sha256],
    event_count: folded.event_count,
    ledger_sha256: ledger,
    stop_receipt_sha256: status.stop_receipt === null ? null : status.stop_receipt.stop_receipt_sha256,
    previous_current_sha256: status.current.current_sha256,
    updated_at: repairedAt,
  });
  writeAtomic(paths.current, bytes(current), 'automation budget current');
  return Object.freeze({ budget: status.budget, current, stop_receipt: status.stop_receipt });
}

/**
 * Every mutating verb enters through here, inside the run lock, so no decision
 * is ever taken against a projection the durable records contradict.
 */
function lockedStatus(repoRoot: string, paths: RunPaths, runId: string, now: string): AutomationBudgetStatusV1 {
  const status = readAutomationBudgetStatus(repoRoot, runId);
  if (detectAutomationCurrentDrift(paths, status.current) === 'none') return status;
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

export function readAutomationBudgetBoardSlice(
  repoRoot: string,
  runId: string,
  observedAt: string,
): AutomationBudgetBoardSliceV1 {
  const status = readAutomationBudgetStatus(repoRoot, runId);
  return projectAutomationBudgetSlice({
    budget: status.budget,
    current: status.current,
    stop_receipt: status.stop_receipt,
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
  readonly published_at: string;
}

/**
 * Minting or revising a budget is a human-authorized act: the grant carries the
 * issuer, the budget carries the creator, and a revision must name the exact
 * revision it supersedes. Nothing in this module raises a limit on its own.
 */
export function publishAutomationBudget(input: PublishAutomationBudgetInput): AutomationBudgetStatusV1 {
  const budget = validateAutomationBudget(input.budget);
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
    const existing = preexisting === null || detectAutomationCurrentDrift(paths, preexisting) === 'none'
      ? preexisting
      : repairCurrentFromDurableRecords(
        repoRoot,
        paths,
        readAutomationBudgetStatus(repoRoot, budget.automation_run_id),
        input.published_at,
      ).current;
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
        updated_at: input.published_at,
      });
      writeAtomic(paths.current, bytes(current), 'automation budget current');
      return Object.freeze({ budget, current, stop_receipt: null });
    }
    if (existing.budget_sha256 === budget.budget_sha256) {
      return Object.freeze({ budget, current: existing, stop_receipt: readStopReceiptOptional(paths) });
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
      updated_at: input.published_at,
    });
    writeAtomic(paths.current, bytes(current), 'automation budget current');
    return Object.freeze({ budget, current, stop_receipt: null });
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
  readonly reserved: AutomationMetricVectorV1;
  readonly reserved_at: string;
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
  const reserved = validateAutomationMetricVector(input.reserved, 'reserved');
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    const status = lockedStatus(repoRoot, paths, input.automation_run_id, input.reserved_at);
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
      now: input.reserved_at,
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
          input.reserved_at,
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
      reserved_at: input.reserved_at,
      deadline_at: status.budget.deadline_at,
      previous_ledger_sha256: status.current.ledger_sha256,
    });
    if (!writeExclusive(reservationPath, bytes(reservation), 'automation reservation')) {
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
      updated_at: input.reserved_at,
    });
    writeAtomic(paths.current, bytes(next), 'automation budget current');
    return reservation;
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

// ---------------------------------------------------------------------------
// Append and reconcile
// ---------------------------------------------------------------------------

export interface AutomationUsageResultV1 {
  readonly usage: AutomationUsageEventV1['usage'];
  readonly usage_attribution: AutomationUsageAttributionV1 | null;
  readonly consumed: AutomationMetricVectorV1;
  readonly outcome: AutomationOutcome;
  readonly evidence_refs: readonly AutomationEvidenceRefV1[];
  readonly observed_at: string;
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

function commitUsage(
  repoRoot: string,
  paths: RunPaths,
  reservation: AutomationBudgetReservationV1,
  result: AutomationUsageResultV1,
  resolution: AutomationUsageEventV1['resolution'],
  inFlight: readonly AutomationInFlightAuthorityV1[],
): AutomationUsageCommitV1 {
  const status = lockedStatus(repoRoot, paths, reservation.automation_run_id, result.observed_at);
  const eventPath = join(paths.events, `${reservation.reservation_sha256}.json`);
  if (existsSync(eventPath)) {
    // Replaying the same key charges once. A replay that claims a different
    // charge is a conflict, not a second event.
    const stored = parse(readRaw(eventPath, 'automation usage event'), validateAutomationUsageEvent, 'automation usage event');
    if (canonicalAutomationJson(stored.consumed) !== canonicalAutomationJson(validateAutomationMetricVector(result.consumed, 'consumed'))
      || canonicalAutomationJson(stored.usage) !== canonicalAutomationJson(result.usage)) {
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
    usage: result.usage,
    usage_attribution: result.usage_attribution,
    consumed: result.consumed,
    outcome: result.outcome,
    resolution,
    evidence_refs: result.evidence_refs,
    observed_at: result.observed_at,
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
    updated_at: result.observed_at,
  });
  writeAtomic(paths.current, bytes(next), 'automation budget current');
  const refusal = exhaustionRefusal(status.budget, next, result.observed_at);
  if (refusal === null) {
    return Object.freeze({ event, current: next, stop_receipt: null });
  }
  const stopped = persistStopReceipt(paths, status.budget, next, refusal, inFlight, result.observed_at);
  return Object.freeze({ event, current: stopped.current, stop_receipt: stopped.receipt });
}

export function appendAutomationUsage(input: AppendAutomationUsageInput): AutomationUsageCommitV1 {
  const repoRoot = resolve(input.repo_root);
  const reservation = validateAutomationReservation(input.reservation);
  const paths = runPaths(repoRoot, reservation.automation_run_id);
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => commitUsage(
    repoRoot,
    paths,
    reservation,
    input,
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
  const consumed = validateAutomationMetricVector(input.consumed, 'consumed');
  if (input.resolution === 'reconciled_reserved'
    && canonicalAutomationJson(consumed) !== canonicalAutomationJson(reservation.reserved)) {
    fail('automation_budget_store_invalid', 'a reserved-worst-case reconciliation must charge the full reserved vector');
  }
  if (input.resolution === 'reconciled_not_started') {
    const zeroed = validateAutomationMetricVector({
      agent_turns: 0,
      successful_acquisitions: 0,
      runner_invocations: 0,
      provider_failures: 0,
      repair_cycles: 0,
      input_tokens: reservation.reserved.input_tokens === null ? null : 0,
      output_tokens: reservation.reserved.output_tokens === null ? null : 0,
      cost_micros: reservation.reserved.cost_micros === null ? null : 0,
    }, 'consumed');
    if (canonicalAutomationJson(consumed) !== canonicalAutomationJson(zeroed)) {
      fail('automation_budget_store_invalid', 'a not-started reconciliation must charge nothing and must be proven by evidence');
    }
  }
  return withExclusiveDirectoryLock(paths.common, paths.lockRelative, () => {
    const record = {
      protocol: 1,
      kind: 'repo-harness-automation-reconciliation',
      automation_run_id: reservation.automation_run_id,
      reservation_sha256: reservation.reservation_sha256,
      resolution: input.resolution,
      reason: input.reason,
      evidence_refs: [...input.evidence_refs],
      reconciled_at: input.observed_at,
    };
    const recordPath = join(paths.reconciliations, `${reservation.reservation_sha256}.json`);
    const encoded = bytes(record);
    if (!writeExclusive(recordPath, encoded, 'automation reconciliation') && readRaw(recordPath, 'automation reconciliation') !== encoded) {
      fail('automation_budget_store_conflict', 'this reservation was already reconciled with different evidence');
    }
    return commitUsage(repoRoot, paths, reservation, input, input.resolution, input.in_flight_authority ?? []);
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
