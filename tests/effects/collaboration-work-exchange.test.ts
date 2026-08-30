/**
 * C6 — the collaborative Work Exchange collector.
 *
 * Acceptance for sprint row C6, collection half: the same stores rebuild a
 * byte-identical snapshot; an existing `EngineerOfferV1` and its `offer_revision`
 * survive the projection unchanged; a source that moves between the two reads is
 * reported as `changed_during_read`; an unreadable additive source is reported as
 * `degraded`; an unreadable signal shard fails the collection closed; and a
 * `bound_task` execution context that will not prove is withheld rather than
 * flagged. Collecting writes nothing.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

import {
  CollaborationError,
  collaborationActorLineage,
  type CollaborationActorRefV1,
} from '../../src/core/collaboration/common';
import { validateCollaborativeWorkExchangeSnapshot } from '../../src/core/collaboration/work-exchange';
import {
  buildEngineerOfferCandidate,
  projectWorkGraph,
  validateWorkGraph,
  type EngineerOfferV1,
} from '../../src/core/engineers/scheduling';
import {
  engineerPrincipalAuthorization,
  resolveModuleEngineerActor,
} from '../../src/effects/collaboration/actor';
import { adoptWorkStateHandoff } from '../../src/effects/collaboration/adoption-store';
import { publishWorkStateHandoff } from '../../src/effects/collaboration/handoff-store';
import { COLLABORATION_HANDOFFS_SHARD } from '../../src/effects/collaboration/handoff-store';
import { collaborationStorePaths } from '../../src/effects/collaboration/record-store';
import { COLLABORATION_SIGNALS_SHARD, publishCoordinationSignal } from '../../src/effects/collaboration/signal-store';
import {
  canonicalCollaborativeWorkExchangeBytes,
  collectCollaborativeWorkExchange,
} from '../../src/effects/collaboration/work-exchange';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import {
  COLLABORATION_ENGINEER,
  createCollaborationFixture,
  removeFixtureRoots,
  type CollaborationFixture as Fixture,
} from '../helpers/collaboration-store-fixture';

const sourceRoot = process.cwd();
const roots: string[] = [];
const DIGEST = `sha256:${'a'.repeat(64)}`;
const CAPABILITY = 'capability.runtime-harness.collaboration';

afterEach(() => removeFixtureRoots(roots));

function fixture(mode: string | null = 'shadow'): Fixture {
  return createCollaborationFixture(sourceRoot, roots, mode, 'repo-harness-c6-exchange');
}

function repositoryIdOf(value: Fixture): string {
  return repoHarnessRepoIdFor(realpathSync(value.repoRoot));
}

/** The actor the store would derive for one fixture authorization. */
function collaborationEngineerActor(value: Fixture, index: number): CollaborationActorRefV1 {
  return resolveModuleEngineerActor(
    realpathSync(value.repoRoot),
    value.actors[index]!.authorization_id,
    value.env,
  ).actor;
}

/**
 * A real `EngineerOfferV1`, built through the scheduling authority's own
 * constructors from a real projected Work Graph. Hand-writing the record would
 * let the projection be tested against a shape the scheduler never produces,
 * which is the drift the "carry it verbatim" rule exists to prevent.
 */
function offer(repositoryId: string, workPackageId: string, taskSeed: string): EngineerOfferV1 {
  const projected = projectWorkGraph(
    validateWorkGraph({
      protocol: 1,
      kind: 'repo-harness-work-graph',
      repository_id: repositoryId,
      sprint_path: 'plans/sprints/demo.sprint.md',
      lane: 'engineering-v2',
      work_packages: [{
        work_package_id: workPackageId,
        task_ref: `task ${workPackageId}`,
        primary_capability: CAPABILITY,
        depends_on: [],
        priority: 50,
        concurrency: { scope: 'repo', key: 'release' },
        execution_surface: 'contract',
        integration_group: null,
        required_acceptance: [{
          gate: 'module',
          policy_id: 'module-default',
          policy_ref: 'plans/policies/module-default.json',
          policy_revision: DIGEST,
        }],
        rollback_boundary: {
          kind: 'work_package',
          boundary_id: `${repositoryId}:${workPackageId}`,
          boundary_ref: `plans/rollback/${workPackageId}.json`,
          boundary_revision: DIGEST,
        },
      }],
    }),
    [{
      task_id: taskSeed.repeat(64),
      task_revision: '2'.repeat(64),
      task_ref: `task ${workPackageId}`,
      status: '[ ]',
      row_order: 1,
    }],
  );
  const candidate = buildEngineerOfferCandidate({
    graph: projected,
    work_package: projected.work_packages[0]!,
    engineer: {
      engineer_id: COLLABORATION_ENGINEER,
      capability_id: CAPABILITY,
      engineer_contract_revision: DIGEST,
      max_active_claims: 1,
    },
    binding: { state: 'active', binding_id: '11111111-1111-4111-8111-111111111111', binding_generation: 1 },
    fleet_offer: {
      execution_readiness: 'execution_ready',
      snapshot_consistency: 'stable',
      task_id: taskSeed.repeat(64),
      task_revision: '2'.repeat(64),
      offer_revision: DIGEST,
      authorization_revision: 7,
    },
    dependencies: [],
    concurrency_available: true,
    concurrency_revision: DIGEST,
    active_claims: 0,
  });
  if (!candidate.eligible) throw new Error(`fixture offer was excluded: ${candidate.exclusion.blockers.join(', ')}`);
  return candidate.offer;
}

function publishSignal(value: Fixture, key: string, threadKey: string, actorIndex = 0): string {
  return publishCoordinationSignal({
    repo_root: value.repoRoot,
    authorization: engineerPrincipalAuthorization(value.actors[actorIndex]!.authorization_id),
    destination: { kind: 'public' },
    idempotency_key: key,
    thread_key: threadKey,
    reply_to_signal_id: null,
    scope_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: `sha256:${'7'.repeat(64)}` }],
    labels: ['NEED-REPRO'],
    title: `observation ${key}`,
    body: `body for ${key}`,
    artifact_refs: [],
    source_signal_ids: [],
    supersedes_signal_id: null,
    recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T09:00:00.000Z' },
    env: value.env,
  }).signal.signal_id;
}

function publishHandoff(
  value: Fixture,
  key: string,
  threadKey: string,
  executionContext: Parameters<typeof publishWorkStateHandoff>[0]['execution_context'],
): string {
  return publishWorkStateHandoff({
    repo_root: value.repoRoot,
    authorization: engineerPrincipalAuthorization(value.actors[0]!.authorization_id),
    destination: { kind: 'public' },
    idempotency_key: key,
    thread_key: threadKey,
    scope_refs: [{ kind: 'free_topic', value: threadKey }],
    trigger: 'budget_low',
    goal: `carry ${key} forward`,
    completed: ['reproduced once'],
    key_findings: ['the loser reconciles'],
    attempted_paths: [{ description: 'raised the timeout', outcome: 'no change', evidence_refs: [] }],
    dead_ends: ['it is not the timeout'],
    open_hypotheses: ['the publish is not durable'],
    next_actions: ['instrument the link step'],
    source_signal_ids: [],
    execution_context: executionContext,
    supersedes_handoff_id: null,
    recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T09:10:00.000Z' },
    env: value.env,
  }).handoff.handoff_id;
}

/** Every byte under the Git common directory, so a write of any kind is visible. */
function commonDirectoryDigest(repoRoot: string): string {
  const root = realpathSync(resolveGitCommonDirectory(repoRoot));
  const hash = createHash('sha256');
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const absolute = join(directory, entry.name);
      hash.update(`${entry.isDirectory() ? 'd' : 'f'} ${relative(root, absolute)} `);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) hash.update(readFileSync(absolute));
    }
  };
  walk(root);
  return `sha256:${hash.digest('hex')}`;
}

function collect(value: Fixture, offers: readonly EngineerOfferV1[] = []) {
  return collectCollaborativeWorkExchange({
    repo_root: value.repoRoot,
    read_execution_offers: () => offers,
  });
}

describe('C6 collaborative work exchange collection', () => {
  test('the same stores rebuild a byte-identical snapshot', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    publishSignal(value, 'signal-b', 'merge-gate-flake', 1);
    publishSignal(value, 'signal-c', 'archctx-drain');
    publishHandoff(value, 'handoff-a', 'merge-gate-flake', { kind: 'none' });
    const offers = [
      offer(repositoryIdOf(value), 'wp-alpha', '3'),
      offer(repositoryIdOf(value), 'wp-beta', '4'),
    ];

    const first = collect(value, offers);
    // Reversed on the way in: the projection's order must be a property of the
    // records, not of the array the caller happened to hand over.
    const second = collect(value, [...offers].reverse());

    expect(first.snapshot_consistency).toBe('stable');
    expect(second.snapshot_consistency).toBe('stable');
    expect(first.snapshot.snapshot_sha256).toBe(second.snapshot.snapshot_sha256);
    expect(canonicalCollaborativeWorkExchangeBytes(first.snapshot))
      .toBe(canonicalCollaborativeWorkExchangeBytes(second.snapshot));
    // The record round-trips through its own validator, so the digest is a
    // property of the bytes rather than of the object that produced them.
    expect(validateCollaborativeWorkExchangeSnapshot(
      JSON.parse(canonicalCollaborativeWorkExchangeBytes(first.snapshot)),
    ).snapshot_sha256).toBe(first.snapshot.snapshot_sha256);
  });

  test('every acceptance projection is present and derived from the real stores', () => {
    const value = fixture();
    const signalA = publishSignal(value, 'signal-a', 'merge-gate-flake');
    publishSignal(value, 'signal-b', 'archctx-drain', 1);
    const handoffId = publishHandoff(value, 'handoff-a', 'merge-gate-flake', { kind: 'none' });
    adoptWorkStateHandoff({
      repo_root: value.repoRoot,
      authorization: engineerPrincipalAuthorization(value.actors[1]!.authorization_id),
      handoff_id: handoffId,
      context_packet_sha256: `sha256:${'c'.repeat(64)}`,
      recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T09:20:00.000Z' },
      env: value.env,
    });

    const collection = collect(value, [offer(repositoryIdOf(value), 'wp-alpha', '3')]);
    const snapshot = collection.snapshot;

    expect(snapshot.execution_offers).toHaveLength(1);
    // Built through C1's own lineage rule rather than by spelling the separator
    // here: the separator is an implementation detail of that rule, and a test
    // that hard-codes it would pass against a lineage the rest of the repository
    // would not recognise.
    expect([...snapshot.active_participants].map((participant) => participant.actor_lineage).sort())
      .toEqual([
        collaborationActorLineage(collaborationEngineerActor(value, 0)),
        collaborationActorLineage(collaborationEngineerActor(value, 1)),
      ].sort());
    // Two signal authors plus one handoff author who is also a signal author.
    expect(snapshot.active_participants.map((participant) => participant.signal_count).sort())
      .toEqual([1, 1]);
    expect(snapshot.active_participants.filter((participant) => participant.handoff_count === 1))
      .toHaveLength(1);
    expect([...snapshot.threads].map((thread) => thread.thread_key).sort())
      .toEqual(['archctx-drain', 'merge-gate-flake']);
    expect(snapshot.relevant_signals.map((summary) => summary.signal_id)).toContain(signalA);
    expect(snapshot.open_handoffs).toHaveLength(1);
    expect(snapshot.open_handoffs[0]!.handoff_id).toBe(handoffId);
    // The C2 seam, now carrying a real adoption count from the C3 store.
    expect(snapshot.open_handoffs[0]!.adoption_count).toBe(1);
    expect(collection.handoff_facts).toEqual([
      { thread_key: 'merge-gate-flake', handoff_id: handoffId, adoption_count: 1 },
    ]);
    expect(snapshot.threads.find((thread) => thread.thread_key === 'merge-gate-flake')!.adoption_count).toBe(1);
    expect(snapshot.contribution_opportunities.length).toBeGreaterThan(0);
    expect(snapshot.snapshot_consistency).toBe('stable');
  });

  test('an existing engineer offer and its revision are carried through unchanged', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const original = offer(repositoryIdOf(value), 'wp-alpha', '3');

    const projected = collect(value, [original]).snapshot.execution_offers[0]!;

    // Byte identity, not field-by-field agreement: a projection that rebuilt the
    // record from its parts could agree on every field this test names and still
    // have dropped one it does not.
    expect(JSON.stringify(projected.offer)).toBe(JSON.stringify(original));
    expect(projected.offer.offer_revision).toBe(original.offer_revision);
    expect(projected.offer_revision).toBe(original.offer_revision);
  });

  test('a source changing between the two reads is reported as changed_during_read', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const late = offer(repositoryIdOf(value), 'wp-alpha', '3');

    let reads = 0;
    const collection = collectCollaborativeWorkExchange({
      repo_root: value.repoRoot,
      // The offer source is the seam a test can move deterministically between
      // the collector's two reads, which is the condition the mark describes.
      read_execution_offers: () => {
        reads += 1;
        return reads === 1 ? [] : [late];
      },
    });

    expect(reads).toBe(2);
    expect(collection.snapshot_consistency).toBe('changed_during_read');
    expect(collection.changed_sources).toEqual(['execution_offers']);
    expect(collection.snapshot.snapshot_consistency).toBe('changed_during_read');
    // Built from the second read, never from a merge of the two.
    expect(collection.snapshot.execution_offers).toHaveLength(1);
  });

  test('an unreadable additive shard is reported as degraded', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    publishHandoff(value, 'handoff-a', 'merge-gate-flake', { kind: 'none' });
    const handoffShard = collaborationStorePaths(realpathSync(value.repoRoot), COLLABORATION_HANDOFFS_SHARD).shard;
    writeFileSync(join(handoffShard, 'not-a-record.json'), '{}\n');

    const collection = collect(value);

    expect(collection.snapshot_consistency).toBe('degraded');
    expect(collection.degraded_sources).toEqual(['handoffs']);
    expect(collection.snapshot.snapshot_consistency).toBe('degraded');
    // Marked, not silently smaller: the handoff is absent and the mark is what
    // stops that absence being read as "there are none".
    expect(collection.snapshot.open_handoffs).toEqual([]);
  });

  test('an unreadable signal shard fails the collection closed', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const signalShard = collaborationStorePaths(realpathSync(value.repoRoot), COLLABORATION_SIGNALS_SHARD).shard;
    writeFileSync(join(signalShard, 'not-a-record.json'), '{}\n');

    let raised: unknown = null;
    try {
      collect(value);
    } catch (error) {
      raised = error;
    }
    expect(raised).toBeInstanceOf(CollaborationError);
    expect((raised as CollaborationError).code).toBe('collaboration_unavailable');
    expect((raised as Error).message).toContain('no snapshot can be derived');
  });

  test('an unprovable bound_task execution context is withheld, not flagged', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    // A forged branch of exactly the shape C4's delegated-worker contribution
    // path can persist: every field is well-formed, and the freeze receipt it
    // names resolves to nothing.
    const handoffId = publishHandoff(value, 'handoff-a', 'merge-gate-flake', {
      kind: 'bound_task',
      task_id: 'a'.repeat(64),
      task_revision: 'b'.repeat(64),
      claim_id: '9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a',
      lease_generation: 7,
      work_envelope_sha256: `sha256:${'8'.repeat(64)}`,
      task_freeze_receipt_sha256: `sha256:${'9'.repeat(64)}`,
    });

    const snapshot = collect(value).snapshot;
    const summary = snapshot.open_handoffs.find((entry) => entry.handoff_id === handoffId)!;

    // The knowledge still projects; the unproven claim does not.
    expect(summary.goal).toContain('handoff-a');
    expect(summary.execution_context).toBeNull();
    expect(snapshot.unverified_execution_context_count).toBe(1);
    // Nothing anywhere in the snapshot repeats the forged Claim or generation.
    expect(JSON.stringify(snapshot)).not.toContain('9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a');
  });

  test('a non-bound_task execution context needs no proof and passes through', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const handoffId = publishHandoff(value, 'handoff-a', 'merge-gate-flake', {
      kind: 'delegated_worker',
      worker_run_ref_sha256: `sha256:${'a'.repeat(64)}`,
      worker_result_sha256: `sha256:${'b'.repeat(64)}`,
    });

    const snapshot = collect(value).snapshot;
    const summary = snapshot.open_handoffs.find((entry) => entry.handoff_id === handoffId)!;

    expect(summary.execution_context).toEqual({
      kind: 'delegated_worker',
      worker_run_ref_sha256: `sha256:${'a'.repeat(64)}`,
      worker_result_sha256: `sha256:${'b'.repeat(64)}`,
    });
    expect(snapshot.unverified_execution_context_count).toBe(0);
  });

  test('collecting writes nothing', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    publishHandoff(value, 'handoff-a', 'merge-gate-flake', { kind: 'none' });
    const offers = [offer(repositoryIdOf(value), 'wp-alpha', '3')];

    const before = commonDirectoryDigest(value.repoRoot);
    collect(value, offers);
    collect(value, offers);

    expect(commonDirectoryDigest(value.repoRoot)).toBe(before);
  });
});
