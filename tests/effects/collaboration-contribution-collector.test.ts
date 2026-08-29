/**
 * C4's contribution collector: the transaction that turns one run's persisted
 * stdout into visible collaboration state, exactly once, and converges from a
 * crash at any persistence boundary.
 *
 * The fault-injection matrix below is the row's central claim. Each case aborts
 * the transaction at one boundary, then retries the whole thing, and asserts the
 * three invariants that make the boundary safe: one visible commit, one
 * `WorkerResultV1`, and no duplicated signal.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { COLLABORATION_PROTOCOL } from '../../src/core/collaboration/common';
import {
  CONTRIBUTION_COMMIT_EVIDENCE_PREFIX,
  collaborationContributionCommitId,
  collaborationContributionDraftSha256,
  contributionHandoffIdentityKey,
  contributionSignalIdentityKey,
} from '../../src/core/collaboration/contribution';
import { admitCollaborationDelegation } from '../../src/effects/collaboration/admission-bridge';
import {
  collectCollaborationContribution,
  type ContributionCollectorBoundary,
} from '../../src/effects/collaboration/contribution-collector';
import {
  listCollaborationContributionCommits,
  listContributedHandoffIds,
  listContributedSignalIds,
  readCollaborationContributionCommit,
} from '../../src/effects/collaboration/contribution-store';
import { resolveDelegatedWorkerActor } from '../../src/effects/collaboration/actor';
import {
  CONTRIBUTION_OUTPUT_END,
  CONTRIBUTION_OUTPUT_START,
  CollaborationContributionRejection,
  parseContributionDraftFromStdout,
} from '../../src/effects/collaboration/provider-output-adapter';
import { listWorkStateHandoffs } from '../../src/effects/collaboration/handoff-store';
import { listCoordinationSignals } from '../../src/effects/collaboration/signal-store';
import {
  dispatchDelegatedRun,
  readDelegatedRunStatus,
} from '../../src/effects/engineers/delegated-run-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import {
  createCollaborationDelegationFixture,
  delegationParticipant,
  liveParentFor,
  setWorkerStdout,
  type CollaborationDelegationFixture,
} from '../helpers/collaboration-delegation-fixture';
import { deliveryPlaneDigest, removeFixtureRoots } from '../helpers/collaboration-store-fixture';

const sourceRoot = process.cwd();
const roots: string[] = [];

afterEach(() => removeFixtureRoots(roots));

const PROTECTED_PATHS = [
  'common:.repo-harness-read-only-canary-common',
  'worktree:.repo-harness-read-only-canary-worktree',
];

function signalDraft(index: number) {
  return {
    title: `observation ${index}`,
    body: `Body of observation ${index}.`,
    labels: [`slot-${index}`],
    scope_refs: [{ kind: 'free_topic', value: 'collaboration/contribution' }],
    artifact_refs: [],
    reply_to_signal_id: null,
    source_signal_ids: [],
  };
}

function draftPayload(signalCount = 2, withHandoff = true) {
  return {
    protocol: COLLABORATION_PROTOCOL,
    kind: 'repo-harness-collaboration-contribution-draft',
    thread_key: 'collaboration/contribution-collector',
    signals: Array.from({ length: signalCount }, (_, index) => signalDraft(index)),
    handoff: withHandoff
      ? {
          trigger: 'phase_complete',
          goal: 'Report what this read-only run established.',
          completed: ['read the collector transaction'],
          key_findings: ['identity is derived from the run, so a retry converges'],
          attempted_paths: [
            { description: 'resume from a step marker', outcome: 'no marker exists; re-running is the recovery path', evidence_refs: [] },
          ],
          dead_ends: [],
          open_hypotheses: [],
          next_actions: ['publish the commit last'],
          source_signal_ids: [],
          execution_context: { kind: 'none' },
        }
      : null,
    built_on_signal_ids: [],
  };
}

function framed(payload: unknown): string {
  return [
    'The Worker thinks out loud first, and that prose is ignored.',
    CONTRIBUTION_OUTPUT_START,
    JSON.stringify(payload, null, 2),
    CONTRIBUTION_OUTPUT_END,
    'and afterwards, too.',
    '',
  ].join('\n');
}

/** A fixture whose single delegated run has completed with the given stdout. */
function completedRun(stdout: string, mode: string | null = 'shadow'): {
  readonly value: CollaborationDelegationFixture;
  readonly dispatchId: string;
} {
  const value = createCollaborationDelegationFixture(sourceRoot, roots, mode ?? 'shadow');
  setWorkerStdout(value.repoRoot, stdout);
  const participant = delegationParticipant(value, 0);
  const admitted = admitCollaborationDelegation({
    repo_root: value.repoRoot,
    round_index: 0,
    decided_at: '2026-08-30T00:00:02.000Z',
    idempotency_key: participant.idempotency_key,
    observed_at: '2026-08-30T00:00:03.000Z',
    delegation: {
      repo_root: value.repoRoot,
      envelope: participant.envelope,
      role_profile: value.role_profile,
      capability: value.capability,
      execution_packet: participant.packet,
      work_envelope: {} as never,
      claim_actor_receipt: value.claim_actor_receipt,
      decided_at: '2026-08-30T00:00:02.000Z',
      validate_parent: liveParentFor(value),
    },
  });
  const dispatchId = admitted.run!.intent.dispatch_id;
  const dispatched = dispatchDelegatedRun({
    repo_root: value.repoRoot,
    dispatch_id: dispatchId,
    observed_at: '2026-08-30T00:00:04.000Z',
    protected_paths: PROTECTED_PATHS,
  });
  expect(dispatched.current.state).toBe('completed');
  if (mode === null) {
    // The run happened while collaboration was enabled; turning the flag off
    // afterwards is how the "mode gates the collector" case is reached.
    writeFileSync(join(value.repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ collaboration: { mode: 'off' } }, null, 2)}\n`);
  }
  return { value, dispatchId };
}

function workerResultCount(repoRoot: string): number {
  const directory = join(resolveGitCommonDirectory(repoRoot), 'repo-harness/delegated-runs/v1/results');
  return existsSync(directory) ? readdirSync(directory).filter((entry) => entry.endsWith('.json')).length : 0;
}

describe('C4 provider-output adapter', () => {
  test('extracts a draft from framed stdout and ignores the prose around it', () => {
    const draft = parseContributionDraftFromStdout(framed(draftPayload()));
    expect(draft.thread_key).toBe('collaboration/contribution-collector');
    expect(draft.signals).toHaveLength(2);
    expect(draft.handoff?.trigger).toBe('phase_complete');
  });

  test('every unusable output is a typed rejection with a reason from the closed set', () => {
    const cases: readonly [string, string][] = [
      ['no markers at all\n', 'adapter_marker_missing'],
      [`${CONTRIBUTION_OUTPUT_START}\n{}\n`, 'adapter_marker_missing'],
      [`${CONTRIBUTION_OUTPUT_END}\n${CONTRIBUTION_OUTPUT_START}\n{}\n`, 'adapter_marker_ambiguous'],
      [`${framed(draftPayload())}${framed(draftPayload())}`, 'adapter_marker_ambiguous'],
      [[CONTRIBUTION_OUTPUT_START, 'not json', CONTRIBUTION_OUTPUT_END, ''].join('\n'), 'adapter_payload_not_json'],
      [framed({ ...draftPayload(), signals: [], handoff: null }), 'draft_invalid'],
      [framed({ ...draftPayload(), thread_key: 42 }), 'draft_invalid'],
    ];
    for (const [stdout, reason] of cases) {
      let caught: unknown;
      try { parseContributionDraftFromStdout(stdout); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(CollaborationContributionRejection);
      expect((caught as CollaborationContributionRejection).reason).toBe(reason as never);
      expect((caught as CollaborationContributionRejection).adapter_version).toBe('codex-exec-stdout/v1');
    }
  });

  test('a marker that does not own its line is not a marker', () => {
    const stdout = `prose ${CONTRIBUTION_OUTPUT_START}\n{}\n${CONTRIBUTION_OUTPUT_END}\n`;
    expect(() => parseContributionDraftFromStdout(stdout)).toThrow('carries no contribution block');
  });
});

describe('C4 contribution collector', () => {
  test('publishes candidates, one commit and one WorkerResult referencing it', () => {
    const { value, dispatchId } = completedRun(framed(draftPayload()));
    const before = deliveryPlaneDigest(value.repoRoot, 'coordination');
    const collected = collectCollaborationContribution({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      untrusted_claims: ['worker says it read two files'],
      env: value.env,
    });

    expect(collected.created).toBe(true);
    expect(collected.commit.signal_refs).toHaveLength(2);
    expect(collected.commit.handoff_ref).not.toBeNull();
    expect(collected.commit.draft_sha256).toBe(collaborationContributionDraftSha256(collected.draft));
    expect(collected.commit_id).toBe(collaborationContributionCommitId(collected.commit));

    // The WorkerResult references the commit through the evidence-ref slot that
    // already accepted free printable refs. No delegation protocol byte moved.
    const commitRef = collected.result.evidence_refs.find(
      (ref) => ref.ref.startsWith(CONTRIBUTION_COMMIT_EVIDENCE_PREFIX),
    );
    expect(commitRef).toEqual({
      ref: `${CONTRIBUTION_COMMIT_EVIDENCE_PREFIX}${collected.commit_id}`,
      sha256: collected.commit.commit_sha256,
    });
    expect(collected.result.untrusted_claims).toEqual(['worker says it read two files']);
    expect(workerResultCount(value.repoRoot)).toBe(1);

    // The Lease plane did not move.
    expect(deliveryPlaneDigest(value.repoRoot, 'coordination')).toBe(before);
  }, 120_000);

  test('the actor is derived from the run, and a draft cannot name its own author', () => {
    const { value, dispatchId } = completedRun(framed(draftPayload(1, false)));
    const derived = resolveDelegatedWorkerActor(value.repoRoot, dispatchId);
    collectCollaborationContribution({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      untrusted_claims: [],
      env: value.env,
    });
    const [signal] = listCoordinationSignals(value.repoRoot);
    expect(signal.actor).toEqual(derived.actor);
    expect(signal.actor.kind).toBe('delegated_worker');
    // The parent Engineer is read from the envelope the Host wrote, never from
    // the Worker's output.
    expect((signal.actor as { parent_engineer_id: string }).parent_engineer_id).toBe(value.engineer_id);
  }, 120_000);

  test('signal and handoff ids are derived from the run reference and the entry index', () => {
    const { value, dispatchId } = completedRun(framed(draftPayload()));
    const collected = collectCollaborationContribution({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      untrusted_claims: [],
      env: value.env,
    });
    const runRefSha256 = collected.commit.worker_run_ref_sha256;
    const signals = listCoordinationSignals(value.repoRoot);
    for (const [index, ref] of collected.commit.signal_refs.entries()) {
      const signal = signals.find((candidate) => candidate.signal_id === ref.signal_id)!;
      expect(signal).toBeDefined();
      // The identity key is visible in the derivation, not just asserted about.
      expect(contributionSignalIdentityKey(runRefSha256, index)).toBe(`${runRefSha256}#${index}`);
    }
    expect(contributionHandoffIdentityKey(runRefSha256)).toBe(`${runRefSha256}#handoff`);
    expect(listWorkStateHandoffs(value.repoRoot)).toHaveLength(1);
  }, 120_000);

  test('a projection reads only committed contributions', () => {
    const { value, dispatchId } = completedRun(framed(draftPayload()));
    expect(listContributedSignalIds(value.repoRoot).size).toBe(0);
    const collected = collectCollaborationContribution({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      untrusted_claims: [],
      env: value.env,
    });
    expect([...listContributedSignalIds(value.repoRoot)].sort())
      .toEqual(collected.commit.signal_refs.map((ref) => ref.signal_id).sort());
    expect([...listContributedHandoffIds(value.repoRoot)])
      .toEqual([collected.commit.handoff_ref!.handoff_id]);
    expect(readCollaborationContributionCommit(value.repoRoot, collected.commit.worker_run_ref_sha256))
      .toEqual(collected.commit);
  }, 120_000);

  test('an unparsable draft is a typed rejection that still persists a normal WorkerResult', () => {
    const { value, dispatchId } = completedRun('the worker only produced prose\n');
    let caught: unknown;
    try {
      collectCollaborationContribution({
        repo_root: value.repoRoot,
        dispatch_id: dispatchId,
        untrusted_claims: ['prose only'],
        env: value.env,
      });
    } catch (error) { caught = error; }

    expect(caught).toBeInstanceOf(CollaborationContributionRejection);
    expect((caught as CollaborationContributionRejection).reason).toBe('adapter_marker_missing');
    // The run's evidence survives...
    const status = readDelegatedRunStatus(value.repoRoot, dispatchId);
    expect(status.result).not.toBeNull();
    expect(status.result!.untrusted_claims).toEqual(['prose only']);
    expect(workerResultCount(value.repoRoot)).toBe(1);
    // ...and it carries no contribution reference, because there is none.
    expect(status.result!.evidence_refs.some((ref) => ref.ref.startsWith(CONTRIBUTION_COMMIT_EVIDENCE_PREFIX)))
      .toBe(false);
    // Nothing partial is visible, and no empty contribution was synthesised.
    expect(listCoordinationSignals(value.repoRoot)).toHaveLength(0);
    expect(listWorkStateHandoffs(value.repoRoot)).toHaveLength(0);
    expect(listCollaborationContributionCommits(value.repoRoot)).toHaveLength(0);
  }, 120_000);

  test('the collector refuses a run that has not completed', () => {
    const value = createCollaborationDelegationFixture(sourceRoot, roots);
    setWorkerStdout(value.repoRoot, framed(draftPayload()));
    const participant = delegationParticipant(value, 0);
    const admitted = admitCollaborationDelegation({
      repo_root: value.repoRoot,
      round_index: 0,
      decided_at: '2026-08-30T00:00:02.000Z',
      idempotency_key: participant.idempotency_key,
      observed_at: '2026-08-30T00:00:03.000Z',
      delegation: {
        repo_root: value.repoRoot,
        envelope: participant.envelope,
        role_profile: value.role_profile,
        capability: value.capability,
        execution_packet: participant.packet,
        work_envelope: {} as never,
        claim_actor_receipt: value.claim_actor_receipt,
        decided_at: '2026-08-30T00:00:02.000Z',
        validate_parent: liveParentFor(value),
      },
    });
    expect(() => collectCollaborationContribution({
      repo_root: value.repoRoot,
      dispatch_id: admitted.run!.intent.dispatch_id,
      untrusted_claims: [],
      env: value.env,
    })).toThrow('only a completed delegated run');
  }, 120_000);

  test('the collector is gated on collaboration.mode', () => {
    const { value, dispatchId } = completedRun(framed(draftPayload()), null);
    expect(() => collectCollaborationContribution({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      untrusted_claims: [],
      env: value.env,
    })).toThrow('collaboration mutation is disabled');
    expect(listCollaborationContributionCommits(value.repoRoot)).toHaveLength(0);
  }, 120_000);
});

describe('C4 contribution collector fault injection', () => {
  const BOUNDARIES: readonly ContributionCollectorBoundary[] = [
    'after_first_signal',
    'after_last_signal',
    'after_handoff',
    'before_commit',
    'after_commit',
    'before_worker_result',
    'after_worker_result',
  ];

  for (const boundary of BOUNDARIES) {
    test(`a crash ${boundary.replace(/_/g, ' ')} converges on retry`, () => {
      const { value, dispatchId } = completedRun(framed(draftPayload()));
      const collect = (hook?: (at: ContributionCollectorBoundary) => void) => collectCollaborationContribution({
        repo_root: value.repoRoot,
        dispatch_id: dispatchId,
        untrusted_claims: ['one claim'],
        crash_hook: hook,
        env: value.env,
      });

      expect(() => collect((at) => {
        if (at === boundary) throw new Error(`injected crash at ${at}`);
      })).toThrow(`injected crash at ${boundary}`);

      // Whatever landed before the crash, the retry is the whole transaction
      // again. There is no resume marker to be wrong about.
      const retried = collect();

      // One visible commit.
      const commits = listCollaborationContributionCommits(value.repoRoot);
      expect(commits).toHaveLength(1);
      expect(commits[0]).toEqual(retried.commit);
      // One WorkerResult.
      expect(workerResultCount(value.repoRoot)).toBe(1);
      expect(readDelegatedRunStatus(value.repoRoot, dispatchId).result!.result_sha256)
        .toBe(retried.result.result_sha256);
      // Zero duplicate signals: two drafted, two persisted, both committed.
      const signals = listCoordinationSignals(value.repoRoot);
      expect(signals).toHaveLength(2);
      expect(new Set(signals.map((signal) => signal.signal_id)).size).toBe(2);
      expect([...listContributedSignalIds(value.repoRoot)].sort())
        .toEqual(signals.map((signal) => signal.signal_id).sort());
      // One handoff, and it is the committed one.
      const handoffs = listWorkStateHandoffs(value.repoRoot);
      expect(handoffs).toHaveLength(1);
      expect(retried.commit.handoff_ref!.handoff_id).toBe(handoffs[0].handoff_id);
      // A crash after the commit means everything already existed; a retry then
      // creates nothing. Before the commit, the retry finishes the transaction.
      expect(retried.created).toBe(boundary === 'before_commit' || boundary === 'after_first_signal'
        || boundary === 'after_last_signal' || boundary === 'after_handoff');
    }, 120_000);
  }

  test('collecting the same run twice is idempotent without any injected fault', () => {
    const { value, dispatchId } = completedRun(framed(draftPayload()));
    const first = collectCollaborationContribution({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      untrusted_claims: ['one claim'],
      env: value.env,
    });
    const second = collectCollaborationContribution({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      untrusted_claims: ['one claim'],
      env: value.env,
    });
    expect(second.commit).toEqual(first.commit);
    expect(second.result.result_sha256).toBe(first.result.result_sha256);
    expect(second.created).toBe(false);
    expect(listCollaborationContributionCommits(value.repoRoot)).toHaveLength(1);
    expect(workerResultCount(value.repoRoot)).toBe(1);
    expect(listCoordinationSignals(value.repoRoot)).toHaveLength(2);
  }, 120_000);

  test('a second WorkerResult with different bytes is refused rather than filed alongside the first', () => {
    const { value, dispatchId } = completedRun(framed(draftPayload()));
    collectCollaborationContribution({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      untrusted_claims: ['one claim'],
      env: value.env,
    });
    // Same run, different Worker prose. Results are content-addressed, so
    // without the exactly-once guard this would file a second result at a second
    // path and `status()` would silently pick one of them.
    expect(() => collectCollaborationContribution({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      untrusted_claims: ['a different claim'],
      env: value.env,
    })).toThrow('a different WorkerResult is already persisted for this run');
    expect(workerResultCount(value.repoRoot)).toBe(1);
  }, 120_000);
});
