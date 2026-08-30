import { lstatSync, realpathSync } from 'fs';

import {
  projectFleetBoardSnapshot,
  fleetBoardErrorMessage,
  type FleetBoardCardInputV1,
  type FleetBoardErrorCode,
  type FleetBoardFeedbackSummaryV1,
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
import { FeedbackError, projectPendingFeedbackOffer, type PendingFeedbackOffer } from '../publication/feedback';
import { readFeedbackEvents } from '../publication/feedback-store';
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

function assertRepositoryAuthority(repo: RepoHarnessRegisteredRepo): void {
  let stat;
  try {
    stat = lstatSync(repo.path);
  } catch (error) {
    throw new FleetRepositoryError('repo_unreadable', `cannot inspect registry repository ${repo.id}`, error);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new FleetRepositoryError('repo_authority_invalid', `registry repository ${repo.id} is not a direct directory authority`);
  }
  let resolved: string;
  try {
    resolved = realpathSync(repo.path);
  } catch (error) {
    throw new FleetRepositoryError('repo_unreadable', `cannot resolve registry repository ${repo.id}`, error);
  }
  if (resolved !== repo.path) {
    throw new FleetRepositoryError('repo_authority_invalid', `registry repository ${repo.id} canonical path changed`);
  }
}

function feedbackSummary(repoRoot: string, publicationId: string): FleetBoardFeedbackSummaryV1 {
  const projection: PendingFeedbackOffer = projectPendingFeedbackOffer({ repo_root: repoRoot, publication_id: publicationId });
  const pendingCount = readFeedbackEvents(repoRoot, publicationId).length;
  if (projection.state === 'none') {
    return Object.freeze({ pending_count: pendingCount, no_progress: false, repair_actions: Object.freeze([]) });
  }
  if (projection.state === 'no_progress') {
    return Object.freeze({ pending_count: pendingCount, no_progress: true, repair_actions: Object.freeze([]) });
  }
  return Object.freeze({
    pending_count: pendingCount,
    no_progress: false,
    repair_actions: Object.freeze([...projection.offer.allowed_actions]),
  });
}

function emptyFeedback(): FleetBoardFeedbackSummaryV1 {
  return Object.freeze({ pending_count: 0, no_progress: false, repair_actions: Object.freeze([]) });
}

function mapRepositoryError(error: unknown): FleetBoardErrorCode {
  if (error instanceof FleetRepositoryError) return error.code;
  if (error instanceof TaskInboxError) return 'repo_inbox_unreadable';
  if (error instanceof AgentRuntimeEffectStoreError) return 'repo_inbox_unreadable';
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
): Promise<FleetBoardCardInputV1> {
  assertCollectionActive(options.signal, options.deadline_exceeded);
  const currentPublication = card.claim?.current_publication ?? null;
  let readiness = null;
  let feedback = emptyFeedback();
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
    feedback = feedbackSummary(repo.path, currentPublication.publication_id);
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
    snapshot_consistency: cardInputConsistency(boardConsistency, inbox.snapshot_consistency),
  });
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
): 'stable' | 'changed_during_read' {
  return board === 'stable' && inbox === 'stable' ? 'stable' : 'changed_during_read';
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
    const cards = await collectBounded(board.cards, options.max_concurrency, async (card) => cardInput(
      repo,
      card,
      offers,
      { ...options, signal: controller.signal },
      board.snapshot_consistency,
      runtimeEffects,
    ));
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

function createFleetProviderObservationLimiter(maxConcurrency: number): FleetProviderObservationLimiter {
  let active = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return Object.freeze({
    async run<T>(observe: () => Promise<T>): Promise<T> {
      if (active >= maxConcurrency) await new Promise<void>((resolve) => waiting.push(resolve));
      active += 1;
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
  const deadline = setTimeout(() => {
    deadlineExceeded = true;
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
      if (deadlineExceededNow() || controller.signal.aborted) {
        return repositoryError(
          repo,
          deadlineExceededNow() ? 'repo_collection_timeout' : 'repo_board_unavailable',
          new Error(deadlineExceededNow() ? 'fleet collection round deadline exceeded' : 'fleet collection was aborted'),
        );
      }
      try {
        const collected = await dependencies.collect_repository(repo, registry, {
          now_ms: nowMs,
          timeout_ms: timeoutMs,
          max_concurrency: maxConcurrency,
          signal: controller.signal,
          deadline_exceeded: deadlineExceededNow,
          provider_limiter: providerLimiter,
        });
        return deadlineExceededNow()
          ? repositoryError(repo, 'repo_collection_timeout', new Error('fleet collection round deadline exceeded'))
          : collected;
      } catch (error) {
        return repositoryError(repo, deadlineExceededNow() ? 'repo_collection_timeout' : mapRepositoryError(error), error);
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
