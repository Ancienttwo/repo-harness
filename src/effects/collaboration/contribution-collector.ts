/**
 * The Host contribution collector — one delegated run's output becoming visible
 * collaboration state, exactly once.
 *
 * Sprint row C4. The transaction, in the order the PRD freezes it:
 *
 * ```text
 * read the draft from the exact persisted stdout (versioned adapter)
 * -> validate the whole draft
 * -> derive every id from WorkerRunRef + entry index
 * -> build every candidate in full, before any write
 * -> publish candidates immutably
 * -> publish one CollaborationContributionCommitV1 (the visibility boundary)
 * -> construct the single WorkerResultV1, referencing that commit
 * ```
 *
 * **Why it converges.** Every write in that list is content-addressed under an
 * identity derived from the run, not from the moment of writing: the signal ids
 * come from `<run_ref>#<index>`, the handoff id from `<run_ref>#handoff`, the
 * commit id from the run reference alone, and the recorded time from the process
 * receipt's own `observed_at` rather than from a clock. A retry after a crash at
 * *any* boundary therefore recomputes byte-identical records, and each store's
 * create-once branch reconciles them instead of appending. There is no
 * "resume from step N" state anywhere below, because there is nothing to resume:
 * re-running the whole transaction is the recovery path.
 *
 * **Why the commit is last.** Candidates are ordinary signals and handoffs. What
 * makes them a contribution is being named by a commit, and a projection reads
 * only committed contributions. So a crash before the commit leaves records that
 * no reader can see, and the retry publishes the same records and then the
 * commit; a crash after the commit leaves a complete contribution, and the retry
 * reconciles every write to what is already there.
 *
 * **Why a parse failure still persists a WorkerResult.** An unusable output is a
 * real run outcome, and the run's evidence has to survive it. What must not
 * survive is any appearance of contribution: no candidate is written, no commit
 * exists, and the result carries no commit reference. The collector never
 * synthesises an empty draft to keep the flow going.
 *
 * Zero delivery-plane write (D1): the signal, handoff and commit stores are
 * collaboration-plane, and the `WorkerResultV1` is written through the existing
 * `collectDelegatedRunResult()`, which is the delegation plane writing its own
 * evidence exactly as it did before this row.
 */
import { realpathSync } from 'fs';

import {
  CollaborationError,
  type CollaborationMode,
} from '../../core/collaboration/common';
import {
  buildCollaborationContributionCommit,
  canonicalCollaborationContributionCommitBytes,
  collaborationContributionDraftSha256,
  contributionCommitEvidenceRef,
  contributionHandoffIdentityKey,
  contributionSignalIdentityKey,
  deriveCollaborationContributionCommitId,
  type CollaborationContributionCommitV1,
  type CollaborationContributionDraftV1,
  type ContributionHandoffRefV1,
  type ContributionSignalRefV1,
} from '../../core/collaboration/contribution';
import { type WorkerResultV1 } from '../../core/engineers/delegation';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import {
  collectDelegatedRunResult,
  readDelegatedRunRunRef,
  readDelegatedRunStatus,
} from '../engineers/delegated-run-store';
import { delegatedRunAuthorization, resolveDelegatedWorkerActor } from './actor';
import { assertCollaborationMutationEnabled } from './feature-flag';
import { COLLABORATION_HANDOFFS_SHARD, HANDOFF_CODEC, publishWorkStateHandoff } from './handoff-store';
import {
  CollaborationContributionRejection,
  readContributionDraftFromPersistedOutput,
} from './provider-output-adapter';
import { CONTRIBUTION_COMMIT_CODEC, contributionStorePaths } from './contribution-store';
import {
  collaborationDestinationPaths,
  collaborationInvalidStore,
  collaborationLockRelativePath,
  collaborationRecordPath,
  ensureCollaborationDirectory,
  listCollaborationRecords,
  promoteCollaborationCandidate,
  publishCollaborationRecordDurably,
  readCollaborationRecord,
  type CollaborationPublishDestinationV1,
  type CollaborationRecordCodec,
} from './record-store';
import { COLLABORATION_SIGNALS_SHARD, SIGNAL_CODEC, publishCoordinationSignal } from './signal-store';

/** Frozen once: the collector promotes into the public shards and nowhere else. */
const PUBLIC_DESTINATION: CollaborationPublishDestinationV1 = Object.freeze({ kind: 'public' as const });

/**
 * Every persistence boundary this transaction crosses, named here rather than in
 * a test so the convergence and invisibility claims are stated where the writes
 * are. Each one is a point a Host can die at, and each is covered by
 * `tests/effects/collaboration-contribution-collector.test.ts`.
 */
export type ContributionCollectorBoundary =
  | 'after_first_candidate'
  | 'after_last_candidate'
  | 'after_handoff_candidate'
  | 'before_commit'
  | 'after_commit'
  | 'after_first_promotion'
  | 'after_last_promotion'
  | 'before_worker_result'
  | 'after_worker_result';

export interface CollectCollaborationContributionInput {
  readonly repo_root: string;
  readonly dispatch_id: string;
  /** Worker prose, carried onto the `WorkerResultV1` as evidence only. */
  readonly untrusted_claims: readonly string[];
  /**
   * Fail-closed fault injection. It can abort the transaction at a boundary; it
   * cannot manufacture a record, and a hook that returns normally changes
   * nothing.
   */
  readonly crash_hook?: (boundary: ContributionCollectorBoundary) => void;
  readonly env?: NodeJS.ProcessEnv;
}

export interface CollectCollaborationContributionResult {
  readonly commit: CollaborationContributionCommitV1;
  readonly commit_id: string;
  readonly draft: CollaborationContributionDraftV1;
  readonly result: WorkerResultV1;
  /** False when the whole transaction reconciled to records that already existed. */
  readonly created: boolean;
  readonly mode: CollaborationMode;
}

function requireCompletedRun(root: string, dispatchId: string): {
  readonly runRefSha256: string;
  readonly processReceiptSha256: string;
} {
  const status = readDelegatedRunStatus(root, dispatchId);
  if (status.current.state !== 'completed'
    || status.current.worker_run_ref === null
    || status.current.process_receipt_sha256 === null) {
    throw new CollaborationError(
      'collaboration_invalid',
      `only a completed delegated run has a contribution to collect: ${dispatchId}`,
    );
  }
  const runRef = readDelegatedRunRunRef(root, status.current.worker_run_ref);
  return Object.freeze({
    runRefSha256: runRef.run_ref_sha256,
    processReceiptSha256: status.current.process_receipt_sha256,
  });
}

export function collectCollaborationContribution(
  input: CollectCollaborationContributionInput,
): CollectCollaborationContributionResult {
  const root = realpathSync(input.repo_root);
  const mode = assertCollaborationMutationEnabled(root);
  const run = requireCompletedRun(root, input.dispatch_id);

  let parsed: ReturnType<typeof readContributionDraftFromPersistedOutput>;
  try {
    parsed = readContributionDraftFromPersistedOutput(root, run.processReceiptSha256);
  } catch (error) {
    if (!(error instanceof CollaborationContributionRejection)) throw error;
    // The run happened and its evidence must survive; the contribution did not.
    // The result is the ordinary one, with no commit reference and nothing
    // partially visible behind it.
    collectDelegatedRunResult({
      repo_root: root,
      dispatch_id: input.dispatch_id,
      untrusted_claims: input.untrusted_claims,
      contribution_refs: [],
    });
    throw error;
  }

  const { draft, observed_at: observedAt } = parsed;
  const draftSha256 = collaborationContributionDraftSha256(draft);
  const authorization = delegatedRunAuthorization(input.dispatch_id);
  // Derived here only to fail early and loudly if the run's provenance does not
  // join; the stores derive it again for themselves, from the same records.
  resolveDelegatedWorkerActor(root, input.dispatch_id);

  const commitId = deriveCollaborationContributionCommitId(run.runRefSha256);
  const paths = contributionStorePaths(root);
  ensureCollaborationDirectory(paths.common, paths.shard);

  return withExclusiveDirectoryLock(
    paths.common,
    collaborationLockRelativePath('contribution', run.runRefSha256),
    () => publishContribution({
      root,
      dispatch_id: input.dispatch_id,
      untrusted_claims: input.untrusted_claims,
      crash_hook: input.crash_hook,
      env: input.env,
      draft,
      draft_sha256: draftSha256,
      observed_at: observedAt,
      run_ref_sha256: run.runRefSha256,
      commit_id: commitId,
      authorization,
      paths,
      mode,
    }),
  );
}

interface PublishContributionInput {
  readonly root: string;
  readonly dispatch_id: string;
  readonly untrusted_claims: readonly string[];
  readonly crash_hook?: (boundary: ContributionCollectorBoundary) => void;
  readonly env?: NodeJS.ProcessEnv;
  readonly draft: CollaborationContributionDraftV1;
  readonly draft_sha256: string;
  readonly observed_at: string;
  readonly run_ref_sha256: string;
  readonly commit_id: string;
  readonly authorization: ReturnType<typeof delegatedRunAuthorization>;
  readonly paths: ReturnType<typeof contributionStorePaths>;
  readonly mode: CollaborationMode;
}

/**
 * The whole write side of the transaction, in one named top-level function.
 *
 * ## Ordering: stage invisibly, commit, then promote
 *
 * ```text
 * 1. stage every candidate under contribution-candidates/<run>/{signals,handoffs}/
 * 2. publish the CollaborationContributionCommitV1
 * 3. promote each candidate into signals/ and handoffs/ by link
 * 4. construct the single WorkerResultV1
 * ```
 *
 * The commit is written *before* promotion, and that ordering is the whole
 * point. It makes one invariant hold at every instant, including inside every
 * crash window:
 *
 * > **Every publicly readable Worker record is already committed.**
 *
 * The earlier shape published candidates straight into the public shards and
 * relied on readers filtering by commit. That is a reader-side obligation, and a
 * crash during staging left Worker records permanently readable by
 * `listCoordinationSignals()` with no commit referencing them and no recall path
 * in an append-only store. Here invisibility is a property of *where* a candidate
 * lives, so a reader that forgets a filter cannot leak an uncommitted record.
 *
 * ## Crash windows
 *
 * | Window | Public state | Residue | Resolution |
 * |---|---|---|---|
 * | during staging (1) | nothing | candidates only, which no public reader opens | retry re-stages to identical bytes at identical names; reconciles |
 * | after staging, before the commit lands (2) | nothing | candidates only | retry publishes the commit and promotes |
 * | after the commit, mid-promotion (3) | the records promoted so far, all of them committed | none that is both public and uncommitted | retry promotes the rest; `EEXIST` on the ones already promoted |
 * | after promotion, before the WorkerResult (4) | complete and committed | none | retry reconciles every write and constructs the result |
 * | after the WorkerResult (5) | complete and committed | none | retry is fully idempotent |
 *
 * Every window self-heals on retry, and no window is publicly readable without
 * its commit. The window this ordering accepts is the mirror image: in (3) a
 * commit can name a record that is not public yet, so a reader following
 * `commit.signal_refs` may find one missing. That is transient, it closes on the
 * next collection of the same run, and it is the honest trade — the alternative
 * ordering makes uncommitted records publicly visible instead, which is the
 * failure this row exists to remove.
 *
 * Convergence is structural rather than procedural. There is no resume marker
 * anywhere below, because every identity is derived from the run: signal ids from
 * `<run_ref>#<index>`, the handoff from `<run_ref>#handoff`, the commit from the
 * run reference alone, and the recorded time from the process receipt's own
 * `observed_at`. Re-running the whole transaction *is* the recovery path.
 *
 * It is a named top-level function rather than an inline lock callback so the
 * edges out of it — the two stores, the commit publish, the promotions and the
 * single `WorkerResultV1` — are direct calls a reader, and the architecture flow
 * proof, can follow.
 */
function publishContribution(
  input: PublishContributionInput,
): CollectCollaborationContributionResult {
  const {
    root, draft, observed_at: observedAt, run_ref_sha256: runRefSha256,
    commit_id: commitId, authorization, paths, mode,
  } = input;
  const destination: CollaborationPublishDestinationV1 = Object.freeze({
    kind: 'contribution_candidate' as const,
    worker_run_ref_sha256: runRefSha256,
  });

  // Step 1. Nothing written here is publicly readable, so the longest phase of
  // the transaction — one write per drafted entry — cannot leak a record.
  const signalRefs: ContributionSignalRefV1[] = [];
  for (const [index, signalDraft] of draft.signals.entries()) {
    const published = publishCoordinationSignal({
      repo_root: root,
      authorization,
      destination,
      idempotency_key: contributionSignalIdentityKey(runRefSha256, index),
      thread_key: draft.thread_key,
      reply_to_signal_id: signalDraft.reply_to_signal_id,
      scope_refs: signalDraft.scope_refs,
      labels: signalDraft.labels,
      title: signalDraft.title,
      body: signalDraft.body,
      artifact_refs: signalDraft.artifact_refs,
      source_signal_ids: signalDraft.source_signal_ids,
      // A contribution is a first publication, never a revision of somebody
      // else's record. Superseding is the author's own later act.
      supersedes_signal_id: null,
      recorded_time: { kind: 'persisted_observation', observed_at: observedAt },
      env: input.env,
    });
    signalRefs.push(Object.freeze({
      signal_id: published.signal.signal_id,
      signal_sha256: published.signal.signal_sha256,
    }));
    if (index === 0) input.crash_hook?.('after_first_candidate');
    if (index === draft.signals.length - 1) input.crash_hook?.('after_last_candidate');
  }

  let handoffRef: ContributionHandoffRefV1 | null = null;
  if (draft.handoff !== null) {
    const published = publishWorkStateHandoff({
      repo_root: root,
      authorization,
      destination,
      idempotency_key: contributionHandoffIdentityKey(runRefSha256),
      thread_key: draft.thread_key,
      scope_refs: draft.signals[0]?.scope_refs ?? [],
      trigger: draft.handoff.trigger,
      goal: draft.handoff.goal,
      completed: draft.handoff.completed,
      key_findings: draft.handoff.key_findings,
      attempted_paths: draft.handoff.attempted_paths,
      dead_ends: draft.handoff.dead_ends,
      open_hypotheses: draft.handoff.open_hypotheses,
      next_actions: draft.handoff.next_actions,
      source_signal_ids: draft.handoff.source_signal_ids,
      execution_context: draft.handoff.execution_context,
      supersedes_handoff_id: null,
      recorded_time: { kind: 'persisted_observation', observed_at: observedAt },
      env: input.env,
    });
    handoffRef = Object.freeze({
      handoff_id: published.handoff.handoff_id,
      handoff_sha256: published.handoff.handoff_sha256,
    });
    input.crash_hook?.('after_handoff_candidate');
  }

  const signalCandidates = collaborationDestinationPaths(root, COLLABORATION_SIGNALS_SHARD, destination);
  const handoffCandidates = collaborationDestinationPaths(root, COLLABORATION_HANDOFFS_SHARD, destination);
  // Nothing outside the draft may ride into a public shard on this transaction.
  // The candidate area is listed with the same fail-closed rule a public shard
  // gets, so an entry nobody staged fails the store rather than being promoted.
  assertCandidateAreaHolds(signalCandidates, SIGNAL_CODEC, 'signal_id', signalRefs.map((ref) => ref.signal_id));
  assertCandidateAreaHolds(handoffCandidates, HANDOFF_CODEC, 'handoff_id', handoffRef === null ? [] : [handoffRef.handoff_id]);

  const commit = buildCollaborationContributionCommit({
    worker_run_ref_sha256: runRefSha256,
    draft_sha256: input.draft_sha256,
    signal_refs: signalRefs,
    handoff_ref: handoffRef,
    committed_at: observedAt,
  });
  const bytes = canonicalCollaborationContributionCommitBytes(commit);

  // Step 2. The visibility boundary lands before anything it names is public.
  input.crash_hook?.('before_commit');
  let created = false;
  const existing = readCollaborationRecord(paths, CONTRIBUTION_COMMIT_CODEC, commitId, 'contribution_commit_id');
  if (existing) {
    if (canonicalCollaborationContributionCommitBytes(existing) !== bytes) {
      throw new CollaborationError(
        'collaboration_conflict',
        `contribution commit ${commitId} already exists with different bytes`,
      );
    }
  } else {
    const file = collaborationRecordPath(paths, commitId, 'contribution_commit_id');
    try {
      publishCollaborationRecordDurably(paths.shard, file, bytes);
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Another process won the link. Reconcile against its bytes rather than
      // reporting a spurious conflict.
      const won = readCollaborationRecord(paths, CONTRIBUTION_COMMIT_CODEC, commitId, 'contribution_commit_id');
      if (!won) collaborationInvalidStore(`contribution commit ${commitId} vanished after publication`);
      if (canonicalCollaborationContributionCommitBytes(won) !== bytes) {
        throw new CollaborationError(
          'collaboration_conflict',
          `contribution commit ${commitId} already exists with different bytes`,
        );
      }
    }
  }
  input.crash_hook?.('after_commit');

  // Step 3. Every record promoted from here is one the commit above already
  // names, which is what makes "nothing publicly readable is uncommitted" hold
  // part-way through this loop as well as at the end of it.
  const publicSignals = collaborationDestinationPaths(root, COLLABORATION_SIGNALS_SHARD, PUBLIC_DESTINATION);
  const publicHandoffs = collaborationDestinationPaths(root, COLLABORATION_HANDOFFS_SHARD, PUBLIC_DESTINATION);
  for (const [index, ref] of commit.signal_refs.entries()) {
    promoteCollaborationCandidate(signalCandidates, publicSignals, SIGNAL_CODEC, ref.signal_id, 'signal_id');
    if (index === 0) input.crash_hook?.('after_first_promotion');
  }
  if (commit.handoff_ref !== null) {
    promoteCollaborationCandidate(
      handoffCandidates,
      publicHandoffs,
      HANDOFF_CODEC,
      commit.handoff_ref.handoff_id,
      'handoff_id',
    );
  }
  input.crash_hook?.('after_last_promotion');

  // Step 4. Exactly one `WorkerResultV1` per run: `collectDelegatedRunResult()`
  // refuses a second result that differs from the one already persisted, so the
  // retry either lands the same bytes or fails loudly rather than leaving two
  // results a reader would have to choose between.
  input.crash_hook?.('before_worker_result');
  const collected = collectDelegatedRunResult({
    repo_root: root,
    dispatch_id: input.dispatch_id,
    untrusted_claims: input.untrusted_claims,
    contribution_refs: [contributionCommitEvidenceRef(commit)],
  });
  input.crash_hook?.('after_worker_result');
  if (collected.result === null) {
    collaborationInvalidStore(`delegated run produced no WorkerResult: ${input.dispatch_id}`);
  }

  return Object.freeze({
    commit,
    commit_id: commitId,
    draft,
    result: collected.result,
    created,
    mode,
  });
}

/**
 * Prove a run's candidate area holds exactly the records this transaction
 * staged, before any of them is promoted.
 *
 * `listCollaborationRecords()` already fails the store closed on an entry that
 * is neither a 64-hex record nor this store's own staging residue, so a foreign
 * file in the candidate area never reaches the comparison below. What this adds
 * is the other half: a *well-formed* record nobody staged must not ride into a
 * public shard on someone else's transaction.
 */
function assertCandidateAreaHolds<T>(
  candidates: ReturnType<typeof collaborationDestinationPaths>,
  codec: CollaborationRecordCodec<T>,
  field: string,
  expected: readonly string[],
): void {
  const found = listCollaborationRecords(candidates, codec, field)
    .map((record) => codec.identityOf(record))
    .sort();
  const wanted = [...expected].sort();
  if (found.length !== wanted.length || found.some((id, index) => id !== wanted[index])) {
    collaborationInvalidStore(
      `${codec.label} candidate area does not hold exactly this contribution: expected ${wanted.join(', ') || '(none)'}, found ${found.join(', ') || '(none)'}`,
    );
  }
}

