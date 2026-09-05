import { createHash } from 'crypto';
import { lstatSync, realpathSync } from 'fs';
import { sep } from 'path';

import {
  projectFleetBoardSnapshot,
  fleetBoardErrorMessage,
  type FleetBoardCardInputV1,
  type FleetBoardErrorCode,
  type FleetBoardFeedbackSummaryV1,
  type FleetBoardInboxSummaryV1,
  type FleetBoardProjectionInputV1,
  type FleetBoardSnapshotV1,
  type FleetRepositoryBoardInputV1,
} from '../../core/fleet/board';
import type { TaskOfferV1 } from '../../core/fleet/task-offer';
import {
  collectRepoTaskOffers,
  FleetOffersError,
} from './acquire';
import {
  readRepoHarnessRegistryStrictSnapshot,
  RepoHarnessRegistryStrictError,
  type RepoHarnessRegisteredRepo,
  type RepoHarnessRegistryStrictSnapshot,
} from '../repo-registry';
import { readActiveSprintPath, readCanonicalTargetRef } from '../state/collect-board-inputs';
import { resolveBoard } from '../state/resolve-board';
import {
  resolvePublicationReadinessAbortable,
  MergeReadinessError,
  type AbortablePublicationReadinessInput,
} from '../publication/merge-readiness';
import { FeedbackError, projectFleetFeedback } from '../publication/feedback';
import { summarizeTaskInboxForFleet, TaskInboxError } from './task-inbox';
import { observeAgentRuntimeEffects, projectTaskAgentRuntimeState, AgentRuntimeEffectStoreError, type AgentRuntimeEffectStatus } from '../engineers/agent-runtime-effect-store';

export type FleetBoardFatalErrorCode =
  | 'fleet_registry_unavailable'
  | 'fleet_registry_invalid'
  | 'fleet_board_argument_invalid'
  | 'fleet_watch_aborted_before_first_snapshot';

export class FleetBoardError extends Error {
  constructor(readonly code: FleetBoardFatalErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FleetBoardError';
  }
}

class FleetRepositoryError extends Error {
  constructor(readonly code: FleetBoardErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FleetRepositoryError';
  }
}

export interface FleetBoardCollectorOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly sequence?: number;
  readonly observed_at?: string;
  readonly now_ms?: number;
  readonly max_concurrency?: number;
  readonly timeout_ms?: number;
  readonly signal?: AbortSignal;
}

export interface FleetProviderObservationLimiter {
  /** The round-scoped limit shared by every reviewing-card provider observation. */
  run<T>(observe: () => Promise<T>): Promise<T>;
}

export interface FleetRepositoryCollectionOptions extends Required<Pick<FleetBoardCollectorOptions, 'now_ms' | 'timeout_ms'>> {
  readonly max_concurrency: number;
  readonly signal: AbortSignal;
  readonly deadline_exceeded: () => boolean;
  readonly provider_limiter: FleetProviderObservationLimiter;
}

export interface FleetBoardDependencies {
  readonly read_registry: (input: { readonly env?: NodeJS.ProcessEnv }) => RepoHarnessRegistryStrictSnapshot;
  readonly collect_repository: (
    repo: RepoHarnessRegisteredRepo,
    registry: RepoHarnessRegistryStrictSnapshot,
    options: FleetRepositoryCollectionOptions,
  ) => Promise<FleetRepositoryBoardInputV1>;
}

function positiveInteger(value: number | undefined, name: string, minimum: number, maximum: number): number {
  const result = value ?? (name === 'max-concurrency' ? 4 : 30_000);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new FleetBoardError('fleet_board_argument_invalid', `${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return result;
}

function repositoryError(repo: RepoHarnessRegisteredRepo, code: FleetBoardErrorCode, error: unknown): FleetRepositoryBoardInputV1 {
  // Keep the raw cause only in the rejected promise / process diagnostics. A
  // snapshot is a portable public artifact and must not carry paths or stderr.
  void error;
  return Object.freeze({
    repository_id: repo.id,
    repo_root: repo.path,
    access_mode: repo.accessMode,
    status: 'unreadable',
    snapshot_consistency: 'degraded',
    cards: Object.freeze([]),
    error: Object.freeze({ code, message: fleetBoardErrorMessage(code) }),
  });
}

/** A trailing separator would make `lstatSync` follow a symlinked leaf. */
function registeredAuthorityPath(path: string): string {
  let normalized = path;
  while (normalized.length > 1 && (normalized.endsWith(sep) || normalized.endsWith('/'))) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * The invariant this protects is that the registry entry itself names a real
 * directory rather than a symlink someone can repoint. A registered path may
 * legitimately sit under a symlinked ancestor (macOS `/tmp` and `/var`) or
 * carry a trailing separator, so comparing the resolved path against the
 * registered string rejects valid authorities without protecting anything.
 */
function assertRepositoryAuthority(repo: RepoHarnessRegisteredRepo): void {
  const path = registeredAuthorityPath(repo.path);
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw new FleetRepositoryError('repo_unreadable', `cannot inspect registry repository ${repo.id}`, error);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new FleetRepositoryError('repo_authority_invalid', `registry repository ${repo.id} is not a direct directory authority`);
  }
  try {
    // Resolvability probe only: the authority invariant is the lstat above, and
    // the resolved path is deliberately discarded.
    realpathSync(path);
  } catch (error) {
    throw new FleetRepositoryError('repo_unreadable', `cannot resolve registry repository ${repo.id}`, error);
  }
}

function feedbackSummary(repoRoot: string, publicationId: string): {
  readonly summary: FleetBoardFeedbackSummaryV1;
  readonly snapshot_consistency: 'stable' | 'changed_during_read';
} {
  const projection = projectFleetFeedback({ repo_root: repoRoot, publication_id: publicationId });
  return Object.freeze({
    summary: Object.freeze({
      pending_count: projection.pending_count,
      no_progress: projection.no_progress,
      repair_actions: projection.repair_actions,
    }),
    snapshot_consistency: projection.snapshot_consistency,
  });
}

function emptyFeedback(): FleetBoardFeedbackSummaryV1 {
  return Object.freeze({ pending_count: 0, no_progress: false, repair_actions: Object.freeze([]) });
}

function emptyInbox(): FleetBoardInboxSummaryV1 {
  return Object.freeze({
    unread_count: 0,
    addressed_to_current_claim: false,
    delivery_state: 'pending',
    runtime_reachability: 'unknown',
    effect_sha256: null,
    failure_class: null,
  });
}

/** Identity of one Agent Runtime effect-store read, for A/B tear detection. */
function runtimeEffectsRevision(statuses: readonly AgentRuntimeEffectStatus[]): string {
  return createHash('sha256').update(JSON.stringify(statuses), 'utf-8').digest('hex');
}

/**
 * One macrotask boundary. A repository's card phase is otherwise a chain of
 * already-resolved promises, so the round's deadline timer and abort could not
 * run until the whole repository finished holding the event loop.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => { setImmediate(resolve); });
}

function mapRepositoryError(error: unknown): FleetBoardErrorCode {
  if (error instanceof FleetRepositoryError) return error.code;
  if (error instanceof TaskInboxError) return 'repo_inbox_unreadable';
  if (error instanceof AgentRuntimeEffectStoreError) return 'repo_runtime_effect_unreadable';
  if (error instanceof FeedbackError) return 'repo_feedback_unreadable';
  if (error instanceof MergeReadinessError) {
    return error.code === 'receipt_unavailable' || error.code === 'publication_claim_mismatch' || error.code === 'publication_pointer_mismatch'
      ? 'repo_publication_unreadable'
      : 'repo_readiness_unavailable';
  }
  if (error instanceof FleetOffersError) return error.code === 'repo_unavailable' ? 'repo_unreadable' : 'repo_board_unavailable';
  return 'repo_board_unavailable';
}

function offerIndex(offers: readonly TaskOfferV1[]): ReadonlyMap<string, TaskOfferV1> {
  return new Map(offers.map((offer) => [offer.task_id, offer]));
}

function collectionAbortError(deadlineExceeded: () => boolean): FleetRepositoryError | FleetBoardError {
  if (deadlineExceeded()) {
    return new FleetRepositoryError('repo_collection_timeout', 'fleet collection round deadline exceeded');
  }
  return new FleetBoardError('fleet_watch_aborted_before_first_snapshot', 'fleet collection was aborted');
}

function assertCollectionActive(signal: AbortSignal, deadlineExceeded: () => boolean): void {
  if (deadlineExceeded() || signal.aborted) throw collectionAbortError(deadlineExceeded);
}

async function cardInput(
  repo: RepoHarnessRegisteredRepo,
  card: ReturnType<typeof resolveBoard>['cards'][number],
  offers: ReadonlyMap<string, TaskOfferV1>,
  options: FleetRepositoryCollectionOptions,
  boardConsistency: 'stable' | 'changed_during_read',
  runtimeEffects: readonly AgentRuntimeEffectStatus[],
  runtimeRevision: string,
): Promise<FleetBoardCardInputV1> {
  await yieldToEventLoop();
  assertCollectionActive(options.signal, options.deadline_exceeded);
  const currentPublication = card.claim?.current_publication ?? null;
  let readiness = null;
  let feedback = emptyFeedback();
  let feedbackConsistency: 'stable' | 'changed_during_read' = 'stable';
  if (card.lease_state === 'reviewing' && currentPublication !== null) {
    const input: AbortablePublicationReadinessInput = {
      repo_root: repo.path,
      publication_id: currentPublication.publication_id,
      gh_bin: process.env.REPO_HARNESS_GH_BIN,
      git_bin: process.env.REPO_HARNESS_GIT_BIN,
      now_ms: options.now_ms,
      signal: options.signal,
    };
    // The resolver owns individual gh child lifetime. The fleet round owns the
    // shared cardinality limit, so many reviewing cards cannot burst providers.
    readiness = await options.provider_limiter.run(async () => {
      assertCollectionActive(options.signal, options.deadline_exceeded);
      return resolvePublicationReadinessAbortable(input);
    });
    assertCollectionActive(options.signal, options.deadline_exceeded);
    const feedbackProjection = feedbackSummary(repo.path, currentPublication.publication_id);
    feedback = feedbackProjection.summary;
    feedbackConsistency = feedbackProjection.snapshot_consistency;
  }
  assertCollectionActive(options.signal, options.deadline_exceeded);
  const inbox = summarizeTaskInboxForFleet({
    repo_root: repo.path,
    task_id: card.task_id,
    task_revision: card.task_revision,
    current_claim: card.claim === null ? null : { claim_id: card.claim.claim_id, generation: card.claim.generation },
  });
  const runtime = projectTaskAgentRuntimeState({
    repo_root: repo.path,
    task_id: card.task_id,
    task_revision: card.task_revision,
    current_claim: card.claim === null ? null : { claim_id: card.claim.claim_id, generation: card.claim.generation },
    statuses: runtimeEffects,
  });
  // The runtime statuses were read once for the repository but joined against
  // this card's receipts just now; re-reading the store is what makes a torn
  // join observable instead of silently labelled stable.
  const runtimeConsistency = runtimeEffectsRevision(observeAgentRuntimeEffects(repo.path)) === runtimeRevision
    ? 'stable'
    : 'changed_during_read';
  return Object.freeze({
    task_id: card.task_id,
    task_revision: card.task_revision,
    task_label: rowTaskLabel(card.task),
    task_index: rowTaskIndex(card.row_index),
    task_state: card.task_state,
    lease_state: card.lease_state,
    claim_id: card.claim?.claim_id ?? null,
    generation: card.claim?.generation ?? null,
    current_publication: currentPublication === null ? null : {
      publication_id: currentPublication.publication_id,
      head_sha: currentPublication.head_sha,
    },
    merge_readiness: readiness,
    execution_readiness: offers.get(card.task_id)?.execution_readiness ?? null,
    feedback,
    inbox: Object.freeze({
      unread_count: inbox.unread_count,
      addressed_to_current_claim: inbox.addressed_to_current_claim,
      ...runtime,
    }),
    snapshot_consistency: cardInputConsistency(boardConsistency, inbox.snapshot_consistency, feedbackConsistency, runtimeConsistency),
    error: null,
  });
}

/**
 * A card whose own observation threw keeps only what the board already proved
 * -- identity, row cells, lease pointer -- and reports every observation-derived
 * field in its empty form. Nothing is invented to fill the failed read.
 */
function failedCardInput(
  card: ReturnType<typeof resolveBoard>['cards'][number],
  boardConsistency: 'stable' | 'changed_during_read',
  code: FleetBoardErrorCode,
): FleetBoardCardInputV1 {
  const currentPublication = card.claim?.current_publication ?? null;
  return Object.freeze({
    task_id: card.task_id,
    task_revision: card.task_revision,
    task_label: rowTaskLabel(card.task),
    task_index: rowTaskIndex(card.row_index),
    task_state: card.task_state,
    lease_state: card.lease_state,
    claim_id: card.claim?.claim_id ?? null,
    generation: card.claim?.generation ?? null,
    current_publication: currentPublication === null ? null : {
      publication_id: currentPublication.publication_id,
      head_sha: currentPublication.head_sha,
    },
    merge_readiness: null,
    execution_readiness: null,
    feedback: emptyFeedback(),
    inbox: emptyInbox(),
    snapshot_consistency: boardConsistency,
    error: Object.freeze({ code, message: fleetBoardErrorMessage(code) }),
  });
}

/** Round-level preemption is never contained at the card boundary. */
function isCollectionPreemption(error: unknown): boolean {
  return error instanceof FleetBoardError
    || (error instanceof FleetRepositoryError && error.code === 'repo_collection_timeout');
}

/**
 * `projectBoard` flattens a missing canonical row into empty cells, so the
 * fleet card restores the distinction the board erased: an empty cell is "no
 * row to name", not a label. Neither value is re-derived from the task digest.
 */
function rowTaskLabel(task: string): string | null {
  return task === '' ? null : task;
}

function rowTaskIndex(rowIndex: string): number | null {
  return /^[0-9]+$/u.test(rowIndex) ? Number.parseInt(rowIndex, 10) : null;
}

function cardInputConsistency(
  board: 'stable' | 'changed_during_read',
  inbox: 'stable' | 'changed_during_read',
  feedback: 'stable' | 'changed_during_read',
  runtime: 'stable' | 'changed_during_read',
): 'stable' | 'changed_during_read' {
  return board === 'stable' && inbox === 'stable' && feedback === 'stable' && runtime === 'stable'
    ? 'stable'
    : 'changed_during_read';
}

async function collectRepository(
  repo: RepoHarnessRegisteredRepo,
  registry: RepoHarnessRegistryStrictSnapshot,
  options: FleetRepositoryCollectionOptions,
): Promise<FleetRepositoryBoardInputV1> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) controller.abort();
  try {
    // Controller creation deliberately precedes every synchronous board/offer
    // read so an already-arrived outer abort cannot start a provider child.
    assertCollectionActive(controller.signal, options.deadline_exceeded);
    assertRepositoryAuthority(repo);
    assertCollectionActive(controller.signal, options.deadline_exceeded);
    const sprintPath = readActiveSprintPath(repo.path);
    assertCollectionActive(controller.signal, options.deadline_exceeded);
    if (sprintPath === null) {
      return Object.freeze({
        repository_id: repo.id,
        repo_root: repo.path,
        access_mode: repo.accessMode,
        status: 'ok',
        snapshot_consistency: 'stable',
        cards: Object.freeze([]),
        error: null,
      });
    }
    const targetRef = readCanonicalTargetRef(repo.path);
    assertCollectionActive(controller.signal, options.deadline_exceeded);
    const board = resolveBoard(repo.path, { sprintPath, targetRef, nowMs: options.now_ms });
    assertCollectionActive(controller.signal, options.deadline_exceeded);
    const offered = collectRepoTaskOffers(repo, registry, { now_ms: options.now_ms });
    assertCollectionActive(controller.signal, options.deadline_exceeded);
    const offers = offerIndex(offered?.offers ?? []);
    const runtimeEffects = observeAgentRuntimeEffects(repo.path);
    const runtimeRevision = runtimeEffectsRevision(runtimeEffects);
    const cardOptions = { ...options, signal: controller.signal };
    const cards = await collectBounded(board.cards, options.max_concurrency, async (card) => {
      try {
        return await cardInput(repo, card, offers, cardOptions, board.snapshot_consistency, runtimeEffects, runtimeRevision);
      } catch (error) {
        // One damaged card is one damaged card. Only round preemption, which
        // owns no card of its own, still fails the whole repository.
        if (isCollectionPreemption(error)) throw error;
        return failedCardInput(card, board.snapshot_consistency, mapRepositoryError(error));
      }
    });
    assertCollectionActive(controller.signal, options.deadline_exceeded);
    return Object.freeze({
      repository_id: repo.id,
      repo_root: repo.path,
      access_mode: repo.accessMode,
      status: 'ok',
      snapshot_consistency: board.snapshot_consistency,
      cards: Object.freeze(cards),
      error: null,
    });
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
}

export const productionFleetBoardDependencies: FleetBoardDependencies = Object.freeze({
  read_registry: (input: { readonly env?: NodeJS.ProcessEnv }) => readRepoHarnessRegistryStrictSnapshot({ env: input.env, adoptedOnly: false }),
  collect_repository: collectRepository,
});

async function collectBounded<T, U>(
  values: readonly T[],
  maxConcurrency: number,
  collect: (value: T) => Promise<U>,
): Promise<U[]> {
  const output = new Array<U>(values.length);
  let cursor = 0;
  let failed = false;
  let failure: unknown;
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      try {
        output[index] = await collect(values[index]!);
      } catch (error) {
        // Drain every started/queued observation before returning an error. This
        // is what lets a deadline wait for provider child cleanup instead of
        // emitting a snapshot while a rejected sibling is still alive.
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(maxConcurrency, values.length) }, worker));
  if (failed) throw failure;
  return output;
}

export function createFleetProviderObservationLimiter(maxConcurrency: number): FleetProviderObservationLimiter {
  let active = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    // Hand the slot straight to the waiter. Decrementing first publishes a
    // free slot that a later run() can take before the woken waiter resumes,
    // which admits one observation more than the round's cap.
    const next = waiting.shift();
    if (next === undefined) active -= 1;
    else next();
  };
  return Object.freeze({
    async run<T>(observe: () => Promise<T>): Promise<T> {
      if (active >= maxConcurrency) await new Promise<void>((resolve) => waiting.push(resolve));
      else active += 1;
      try {
        return await observe();
      } finally {
        release();
      }
    },
  });
}

/**
 * Collect a deterministic read-only fleet snapshot. Registry failure is fatal;
 * each repository is otherwise an independent observation so one damaged root
 * cannot hide healthy rows or create a cross-repository atomicity claim.
 */
export async function collectFleetBoard(
  options: FleetBoardCollectorOptions = {},
  dependencies: FleetBoardDependencies = productionFleetBoardDependencies,
): Promise<FleetBoardSnapshotV1> {
  const maxConcurrency = positiveInteger(options.max_concurrency, 'max-concurrency', 1, 16);
  const timeoutMs = positiveInteger(options.timeout_ms, 'timeout-ms', 1_000, 30_000);
  const sequence = options.sequence ?? 1;
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new FleetBoardError('fleet_board_argument_invalid', 'sequence must be a positive integer');
  }
  if (options.signal?.aborted) {
    throw new FleetBoardError('fleet_watch_aborted_before_first_snapshot', 'fleet collection was aborted before its first snapshot');
  }
  const controller = new AbortController();
  let deadlineExceeded = false;
  const deadlineAt = Date.now() + timeoutMs;
  const deadlineExceededNow = () => deadlineExceeded || Date.now() >= deadlineAt;
  const nowMs = options.now_ms ?? Date.now();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const inFlight = new Set<object>();
  const preempted = new Set<object>();
  const deadline = setTimeout(() => {
    deadlineExceeded = true;
    // Only repositories still observing when the round aborts lose their
    // result; one that already returned holds a complete observation.
    for (const token of inFlight) preempted.add(token);
    controller.abort();
  }, timeoutMs);
  try {
    assertCollectionActive(controller.signal, deadlineExceededNow);
    let registry: RepoHarnessRegistryStrictSnapshot;
    try {
      registry = dependencies.read_registry({ env: options.env });
    } catch (error) {
      if (error instanceof RepoHarnessRegistryStrictError) throw new FleetBoardError(error.code, error.message, error);
      throw new FleetBoardError('fleet_registry_unavailable', 'cannot read fleet registry authority', error);
    }
    if (deadlineExceededNow()) {
      return projectFleetBoardSnapshot({
        registry_revision: registry.registryRevision,
        sequence,
        observed_at: options.observed_at ?? new Date(nowMs).toISOString(),
        repositories: registry.repos.map((repo) => repositoryError(
          repo,
          'repo_collection_timeout',
          new Error('fleet collection round deadline exceeded'),
        )),
      });
    }
    assertCollectionActive(controller.signal, deadlineExceededNow);
    const providerLimiter = createFleetProviderObservationLimiter(maxConcurrency);
    const repositories = await collectBounded(registry.repos, maxConcurrency, async (repo) => {
      await yieldToEventLoop();
      if (deadlineExceededNow() || controller.signal.aborted) {
        return repositoryError(
          repo,
          deadlineExceededNow() ? 'repo_collection_timeout' : 'repo_board_unavailable',
          new Error(deadlineExceededNow() ? 'fleet collection round deadline exceeded' : 'fleet collection was aborted'),
        );
      }
      const token = {};
      inFlight.add(token);
      try {
        const collected = await dependencies.collect_repository(repo, registry, {
          now_ms: nowMs,
          timeout_ms: timeoutMs,
          max_concurrency: maxConcurrency,
          signal: controller.signal,
          deadline_exceeded: deadlineExceededNow,
          provider_limiter: providerLimiter,
        });
        return preempted.has(token)
          ? repositoryError(repo, 'repo_collection_timeout', new Error('fleet collection round deadline exceeded'))
          : collected;
      } catch (error) {
        return repositoryError(repo, deadlineExceededNow() ? 'repo_collection_timeout' : mapRepositoryError(error), error);
      } finally {
        inFlight.delete(token);
      }
    });
    if (options.signal?.aborted) throw collectionAbortError(() => false);
    const input: FleetBoardProjectionInputV1 = {
      registry_revision: registry.registryRevision,
      sequence,
      observed_at: options.observed_at ?? new Date(nowMs).toISOString(),
      repositories,
    };
    return projectFleetBoardSnapshot(input);
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', abort);
  }
}

export interface FleetBoardWatchOptions extends Omit<FleetBoardCollectorOptions, 'sequence' | 'observed_at'> {
  readonly interval_ms?: number;
}

function sleepAbortable(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** Immediate, sequential JSONL-ready snapshots; collection rounds never overlap. */
export async function* watchFleetBoard(
  options: FleetBoardWatchOptions = {},
  dependencies: FleetBoardDependencies = productionFleetBoardDependencies,
): AsyncGenerator<FleetBoardSnapshotV1> {
  const intervalMs = positiveInteger(options.interval_ms ?? 30_000, 'interval-ms', 1_000, 300_000);
  let sequence = 1;
  while (!options.signal?.aborted) {
    let snapshot: FleetBoardSnapshotV1;
    try {
      snapshot = await collectFleetBoard({ ...options, sequence }, dependencies);
    } catch (error) {
      if (options.signal?.aborted) return;
      throw error;
    }
    yield snapshot;
    sequence += 1;
    await sleepAbortable(intervalMs, options.signal);
  }
}
