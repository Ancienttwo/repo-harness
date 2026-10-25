import { createHash } from 'crypto';
import { lstatSync, realpathSync } from 'fs';
import { sep } from 'path';

import {
  projectFleetBoardSnapshot,
  fleetBoardErrorMessage,
  type FleetBoardCardInputV2,
  type FleetBoardErrorCode,
  type FleetBoardFeedbackSummaryV1,
  type FleetBoardInboxSummaryV1,
  type FleetBoardProjectionInputV2,
  type FleetBoardSnapshotV2,
  type FleetRepositoryBoardInputV2,
} from '../../core/fleet/board';
import {
  readRepoHarnessRegistryStrictSnapshot,
  RepoHarnessRegistryStrictError,
  type RepoHarnessRegisteredRepo,
  type RepoHarnessRegistryStrictSnapshot,
} from '../repo-registry';
import { resolveProviderBoard } from '../state/collect-provider-board-inputs';
import type { ProviderBoardCardV2 } from '../../core/state/provider-board';
import type { OperatorTaskSession } from '../../core/operator/task-sessions';
import { observeOperatorTaskDiffSource } from '../operator/task-diff';
import { readReviewAdmissionSource } from '../review/admission-source';
import {
  assertLocalPullRequestRepository,
  collectPullRequestMergeReadinessAbortable,
  validatePullRequestSelection,
  MergeReadinessError,
  type AbortablePullRequestReadinessInput,
} from '../publication/merge-readiness';
import { FeedbackError, projectFleetFeedback, prepareFeedbackSubject } from '../publication/feedback';
import { summarizeTaskInboxForFleet, TaskInboxError } from './task-inbox';
import { observeAgentRuntimeEffects, projectTaskAgentRuntimeState, AgentRuntimeEffectStoreError, type AgentRuntimeEffectStatus } from '../engineers/agent-runtime-effect-store';

export type FleetBoardFatalErrorCode =
  | 'fleet_registry_unavailable'
  | 'fleet_registry_invalid'
  | 'fleet_repository_not_found'
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

/** task_id associates a row for display only; provider identity is the authority. */
export interface FleetBoardPullRequestSelection {
  readonly repository_id: string;
  readonly provider_issue_id: string;
  readonly task_id?: string;
  readonly pull_request: import('../../core/publication/merge-readiness').PullRequestSelectionV2;
}

export interface FleetBoardCollectorOptions {
  readonly pull_requests?: readonly FleetBoardPullRequestSelection[];
  /** Exact registered identity, selected before any repository/provider observation. */
  readonly repository_id?: string;
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
  readonly env?: NodeJS.ProcessEnv;
  readonly pull_requests?: readonly FleetBoardPullRequestSelection[];
}

export interface FleetBoardDependencies {
  readonly read_registry: (input: { readonly env?: NodeJS.ProcessEnv }) => RepoHarnessRegistryStrictSnapshot;
  readonly collect_repository: (
    repo: RepoHarnessRegisteredRepo,
    registry: RepoHarnessRegistryStrictSnapshot,
    options: FleetRepositoryCollectionOptions,
  ) => Promise<FleetRepositoryBoardInputV2>;
}

function positiveInteger(value: number | undefined, name: string, minimum: number, maximum: number): number {
  const result = value ?? (name === 'max-concurrency' ? 4 : 30_000);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new FleetBoardError('fleet_board_argument_invalid', `${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return result;
}

function repositoryError(repo: RepoHarnessRegisteredRepo, code: FleetBoardErrorCode, error: unknown): FleetRepositoryBoardInputV2 {
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

function emptyFeedback(): FleetBoardFeedbackSummaryV1 {
  return Object.freeze({ observation_status: 'unavailable', pending_count: 0, no_progress: false, repair_actions: Object.freeze([]) });
}

function emptyInbox(): FleetBoardInboxSummaryV1 {
  return Object.freeze({
    observation_status: 'unavailable',
    unread_count: 0,
    addressed_to_current_claim: false,
    delivery_state: 'pending',
    runtime_reachability: 'unknown',
    effect_sha256: null,
    failure_class: null,
    delivery_evidence: null,
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
    return 'repo_readiness_unavailable';
  }
  return 'repo_board_unavailable';
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

function baseCard(card: ProviderBoardCardV2, execution: OperatorTaskSession | null, consistency: 'stable' | 'changed_during_read'): FleetBoardCardInputV2 {
  return { provider_repository_id: card.provider_repository_id, provider_issue_id: card.provider_issue_id,
    issue_state: card.issue_status === 'observed' ? card.issue!.state : null, issue_revision: card.issue?.source_revision ?? null,
    execution_status: card.execution_status, execution, task_id: execution?.selector.task ?? null,
    task_label: card.issue?.title ?? null, task_index: card.issue ? Number(/#(\d+)$/u.exec(card.issue.display_ref)?.[1]) || null : null,
    merge_readiness: null, execution_readiness: null, readiness_blockers: null,
    feedback: emptyFeedback(), inbox: emptyInbox(), snapshot_consistency: consistency, error: null };
}
async function cardInput(repo: RepoHarnessRegisteredRepo, card: ProviderBoardCardV2, execution: OperatorTaskSession | null,
  options: FleetRepositoryCollectionOptions, consistency: 'stable' | 'changed_during_read',
  runtimeEffects: readonly AgentRuntimeEffectStatus[], runtimeRevision: string): Promise<FleetBoardCardInputV2> {
  await yieldToEventLoop();
  assertCollectionActive(options.signal, options.deadline_exceeded);
  const base = baseCard(card, execution, consistency);
  const selections = (options.pull_requests ?? []).filter(value => value.repository_id === repo.id
    && value.provider_issue_id === card.provider_issue_id && value.pull_request.provider_repository_id === card.provider_repository_id);
  if (selections.length > 1) throw new MergeReadinessError('provider_data_incomplete', 'board issue requires one explicit PR association');
  let readiness = null;
  if (selections.length === 1) {
    const selection = selections[0]!.pull_request;
    assertLocalPullRequestRepository(repo.path, selection.repository);
    readiness = await options.provider_limiter.run(async () => {
      assertCollectionActive(options.signal, options.deadline_exceeded);
      return collectPullRequestMergeReadinessAbortable({ ...selection, repo_root: repo.path, gh_bin: process.env.REPO_HARNESS_GH_BIN, signal: options.signal });
    });
    assertCollectionActive(options.signal, options.deadline_exceeded);
  }
  let inbox = base.inbox, feedback = base.feedback;
  let observedConsistency = consistency;
  // Arbitrary runtime labels are valid sessions but cannot address the stable task inbox.
  if (execution && /^[0-9a-f]{64}$/u.test(execution.selector.task)) {
    const current_claim = { reference: execution.selector.claim_ref, revision: execution.selector.claim_revision };
    const input = { repo_root: repo.path, task_id: execution.selector.task, admission_sha256: execution.admission_sha256, current_claim };
    const messages = summarizeTaskInboxForFleet(input);
    const runtime = projectTaskAgentRuntimeState({ ...input, session_binding_sha256: execution.selector.session_binding_sha256, statuses: runtimeEffects, env: options.env });
    inbox = { observation_status: 'observed', unread_count: messages.unread_count, addressed_to_current_claim: messages.addressed_to_current_claim, ...runtime };
    if (messages.snapshot_consistency !== 'stable') observedConsistency = 'changed_during_read';
    if (selections.length === 1) {
      const observed = observeOperatorTaskDiffSource({ ...execution.selector, env: options.env });
      if (observed.approval.admission_sha256 !== execution.admission_sha256) throw new FeedbackError('publication_claim_mismatch', 'session admission changed');
      const source = readReviewAdmissionSource(observed.sourceRoot, { 'repository-id': execution.selector.provider_repository_id,
        'issue-id': execution.selector.issue_id, 'campaign-id': execution.selector.campaign_id, 'grant-sha256': execution.selector.grant_sha256,
        'policy-sha256': execution.selector.policy_sha256, actor: execution.selector.actor_id });
      const feedbackInput = { repo_root: repo.path, selection: selections[0]!.pull_request,
        source: { authority: { source, claim: current_claim, engineer_profile: observed.identity.engineer_profile }, session: { task: execution.selector.task, role: execution.selector.role } } };
      const subject = prepareFeedbackSubject(feedbackInput);
      const projection = projectFleetFeedback({ ...feedbackInput, publication_id: subject.publication_id });
      feedback = { observation_status: 'observed', pending_count: projection.pending_count, no_progress: projection.no_progress, repair_actions: projection.repair_actions };
      if (projection.snapshot_consistency !== 'stable') observedConsistency = 'changed_during_read';
    }
  }
  if (runtimeEffectsRevision(observeAgentRuntimeEffects(repo.path)) !== runtimeRevision) observedConsistency = 'changed_during_read';
  return { ...base, merge_readiness: readiness, inbox, feedback, snapshot_consistency: observedConsistency };
}
function isCollectionPreemption(error: unknown): boolean {
  return error instanceof FleetBoardError || (error instanceof FleetRepositoryError && error.code === 'repo_collection_timeout');
}
async function collectRepository(repo: RepoHarnessRegisteredRepo, registry: RepoHarnessRegistryStrictSnapshot,
  options: FleetRepositoryCollectionOptions): Promise<FleetRepositoryBoardInputV2> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) controller.abort();
  try {
    assertCollectionActive(controller.signal, options.deadline_exceeded);
    assertRepositoryAuthority(repo);
    const board = resolveProviderBoard({ repository_id: repo.id, env: options.env });
    assertCollectionActive(controller.signal, options.deadline_exceeded);
    for (const association of options.pull_requests ?? []) {
      if (association.repository_id !== repo.id) continue;
      const card = board.cards.find(card => card.provider_repository_id === association.pull_request.provider_repository_id && card.provider_issue_id === association.provider_issue_id);
      if (!card || (association.task_id !== undefined && !card.sessions.some(session => session.selector.task === association.task_id))) {
        throw new FleetRepositoryError('repo_readiness_unavailable', 'selected PR has no exact provider issue display association');
      }
    }
    const runtimeEffects = observeAgentRuntimeEffects(repo.path), runtimeRevision = runtimeEffectsRevision(runtimeEffects);
    const rows = board.cards.flatMap<{ card: ProviderBoardCardV2; execution: OperatorTaskSession | null }>(card => card.sessions.length ? card.sessions.map(execution => ({ card, execution })) : [{ card, execution: null }]);
    const cards = await collectBounded(rows, options.max_concurrency, async ({ card, execution }) => {
      try { return await cardInput(repo, card, execution, { ...options, signal: controller.signal }, board.snapshot_consistency, runtimeEffects, runtimeRevision); }
      catch (error) {
        if (isCollectionPreemption(error)) throw error;
        const code = mapRepositoryError(error);
        return { ...baseCard(card, execution, board.snapshot_consistency), error: { code, message: fleetBoardErrorMessage(code) } };
      }
    });
    assertCollectionActive(controller.signal, options.deadline_exceeded);
    return { repository_id: repo.id, repo_root: repo.path, access_mode: repo.accessMode, status: 'ok',
      snapshot_consistency: board.source_status === 'unavailable' ? 'degraded' : board.snapshot_consistency,
      cards, error: board.source_status === 'unavailable' ? { code: 'repo_board_unavailable', message: fleetBoardErrorMessage('repo_board_unavailable') } : null };
  } finally { options.signal.removeEventListener('abort', abort); }
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
): Promise<FleetBoardSnapshotV2> {
  if (options.repository_id !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(options.repository_id)) {
    throw new FleetBoardError('fleet_board_argument_invalid', 'invalid repository selector');
  }
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
      for (const association of options.pull_requests ?? []) {
        if (!registry.repos.some(repo => repo.id === association.repository_id)
          || (options.repository_id !== undefined && options.repository_id !== association.repository_id)) throw new FleetBoardError('fleet_board_argument_invalid', 'PR association selects a repository outside this board');
        if (!/^[1-9][0-9]*$/u.test(association.provider_issue_id)) throw new FleetBoardError('fleet_board_argument_invalid', 'explicit provider issue identity is required');
        validatePullRequestSelection(association.pull_request);
      }

    } catch (error) {
      if (error instanceof FleetBoardError) throw error;
      if (error instanceof MergeReadinessError) throw new FleetBoardError('fleet_board_argument_invalid', error.message, error);
      if (error instanceof RepoHarnessRegistryStrictError) throw new FleetBoardError(error.code, error.message, error);
      throw new FleetBoardError('fleet_registry_unavailable', 'cannot read fleet registry authority', error);
    }
    const selected = options.repository_id === undefined ? registry.repos : registry.repos.filter((repo) => repo.id === options.repository_id);
    if (options.repository_id !== undefined && selected.length !== 1) {
      throw new FleetBoardError('fleet_repository_not_found', 'repository is not registered');
    }
    if (deadlineExceededNow()) {
      return projectFleetBoardSnapshot({
        registry_revision: registry.registryRevision,
        sequence,
        observed_at: options.observed_at ?? new Date(nowMs).toISOString(),
        repositories: selected.map((repo) => repositoryError(
          repo,
          'repo_collection_timeout',
          new Error('fleet collection round deadline exceeded'),
        )),
      });
    }
    assertCollectionActive(controller.signal, deadlineExceededNow);
    const providerLimiter = createFleetProviderObservationLimiter(maxConcurrency);
    const repositories = await collectBounded(selected, maxConcurrency, async (repo) => {
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
          pull_requests: options.pull_requests, env: options.env,
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
    const input: FleetBoardProjectionInputV2 = {
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
): AsyncGenerator<FleetBoardSnapshotV2> {
  const intervalMs = positiveInteger(options.interval_ms ?? 30_000, 'interval-ms', 1_000, 300_000);
  let sequence = 1;
  while (!options.signal?.aborted) {
    let snapshot: FleetBoardSnapshotV2;
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
