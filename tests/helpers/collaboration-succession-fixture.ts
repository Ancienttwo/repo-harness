/**
 * A disposable repository carrying both halves of a bound-task succession: the
 * three authenticated Module Engineers `createCollaborationFixture()` builds, and
 * a *real* bound task on top of one of them — persisted Lease, published
 * ClaimActorReceipt, exact WorkEnvelope on disk and verification evidence bound
 * to the current review subject.
 *
 * Real matters here. `inspectBoundTask()` observes Git: HEAD, the tree, the
 * binary diff, an untracked inventory with filesystem entry types, the checks
 * file and the notes' Open Questions section, twice, and refuses if anything
 * moved between the reads. A stubbed claim receipt of the shape
 * `collaboration-delegation-fixture.ts` uses would let the succession tests pass
 * without a single one of those observations happening, which is precisely the
 * evidence C5 claims to bind.
 *
 * The composition is one-directional: this file adds to the shared collaboration
 * fixture and changes nothing in it, so C1-C4's repositories are unaffected.
 */
import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { join } from 'path';

import { buildClaimActorReceipt, validateEngineerPrincipal, type ClaimActorReceiptV1 } from '../../src/core/engineers/principal-claim';
import { bindLeaseRecord, buildLeaseOwnerRecord, type LeaseOwnerRecord } from '../../src/core/state/coordination-identity';
import { publishClaimActorReceipt } from '../../src/effects/engineers/claim-actor-store';
import { readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { buildReviewSubject } from '../../src/effects/review/diff-fingerprint';
import {
  createLeaseDirectory,
  leaseOwnerPath,
  writeLeaseOwnerDurably,
} from '../../src/effects/state/coordination-lease-store';
import {
  COLLABORATION_ENGINEER,
  createCollaborationFixture,
  type CollaborationFixture,
} from './collaboration-store-fixture';

export const SUCCESSION_TASK_ID = 'c'.repeat(64);
export const SUCCESSION_TASK_REVISION = 'd'.repeat(64);
export const SUCCESSION_CLAIM_ID = '5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a';
export const SUCCESSOR_CLAIM_ID = '6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b';
export const SUCCESSION_UNIT_REF = 'plans/plan-succession.md';
export const SUCCESSION_SPRINT_PATH = 'plans/sprints/succession.sprint.md';

export interface CollaborationSuccessionFixture extends CollaborationFixture {
  /** The bound executor: the Engineer holding the live Claim on the task below. */
  readonly executor_id: string;
  readonly repository_id: string;
  readonly task_id: string;
  readonly claim_id: string;
  readonly lease_path: string;
  readonly claim_actor_receipt: ClaimActorReceiptV1;
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();
}

/**
 * The exact WorkEnvelope the Claim receipt is derived from. It is written to
 * disk and committed because `readTaskFreezeSnapshot()` reads it back from
 * `.ai/harness/handoff/work-envelope.json` and digests the bytes; an in-memory
 * envelope would leave `work_envelope_bytes_sha256` describing a file that does
 * not exist.
 */
function workEnvelope(repoRoot: string, repositoryId: string, headOid: string) {
  return {
    protocol: 1 as const,
    kind: 'repo-harness-work-envelope' as const,
    repo_id: repositoryId,
    task_id: SUCCESSION_TASK_ID,
    task_revision: SUCCESSION_TASK_REVISION,
    sprint_path: SUCCESSION_SPRINT_PATH,
    claim_id: SUCCESSION_CLAIM_ID,
    generation: 1,
    worktree_path: repoRoot,
    branch: 'main',
    unit_ref: SUCCESSION_UNIT_REF,
    authorization_revision: 1,
    offer_revision: `sha256:${'7'.repeat(64)}`,
    canonical_target: { ref: 'main', oid: headOid },
    plan: {
      plan_path: SUCCESSION_UNIT_REF,
      contract_path: 'tasks/contracts/succession.contract.md',
      source_ref: 'main',
      plan_sha256: `sha256:${'8'.repeat(64)}`,
      contract_sha256: `sha256:${'9'.repeat(64)}`,
    },
    claim_token: {
      path: '.ai/harness/claim-token',
      claim_id: SUCCESSION_CLAIM_ID,
      task_id: SUCCESSION_TASK_ID,
      sprint: SUCCESSION_SPRINT_PATH,
      task: 'succession',
      unit_ref: SUCCESSION_UNIT_REF,
    },
  };
}

/**
 * Verification evidence bound to the current review subject. `checksObservation()`
 * recomputes the subject from Git and compares four fields, so a hand-written
 * constant would classify as `checks_unverified` and the fixture could never
 * produce a clean bound task to contrast the dirty one against.
 */
export function writeVerifiedChecks(repoRoot: string): void {
  const subject = buildReviewSubject(repoRoot, { targetRef: 'main' });
  if (subject.status !== 'ok') throw new Error(`review subject unavailable: ${subject.reason}`);
  writeFileSync(join(repoRoot, '.ai/harness/checks/latest.json'), `${JSON.stringify({
    status: 'pass',
    contract: { file: 'tasks/contracts/succession.contract.md' },
    review_subject_sha256: subject.review_subject_sha256,
    change_assessment: {
      assessment: {
        review_subject_sha256: subject.review_subject_sha256,
        target_ref: subject.target_ref,
        target_revision: subject.target_rev,
      },
    },
  })}\n`);
}

export function readLeaseOwnerRecord(repoRoot: string): LeaseOwnerRecord {
  return JSON.parse(readFileSync(leaseOwnerPath(repoRoot, SUCCESSION_TASK_ID), 'utf8')) as LeaseOwnerRecord;
}

/**
 * Publish a ClaimActorReceipt for one Engineer against one lease generation.
 * The successor uses this after its takeover: acquiring execution authority is
 * exactly "the Lease names my claim and I published the receipt for it", and the
 * succession gate reads nothing else.
 */
export function publishClaimActorFor(
  fixture: CollaborationSuccessionFixture,
  engineerId: string,
  claimId: string,
  generation: number,
  boundAt: string,
): ClaimActorReceiptV1 {
  const profile = loadEngineerProfile(fixture.repoRoot, engineerId);
  const binding = readEngineerBindingStatus(fixture.repoRoot, engineerId, profile.engineer_contract_revision).binding!;
  const actor = fixture.actors.find((candidate) => candidate.engineer_id === engineerId)!;
  // Read back the committed envelope rather than rebuilding it. `readTaskFreezeSnapshot()`
  // digests the file on disk and compares it with the receipt, so a rebuilt
  // envelope -- even one differing only in the HEAD it was stamped at -- makes
  // every freeze fail as `claim actor receipt does not match WorkEnvelope`.
  const envelope = {
    ...(JSON.parse(readFileSync(
      join(fixture.repoRoot, '.ai/harness/handoff/work-envelope.json'),
      'utf8',
    )) as ReturnType<typeof workEnvelope>),
    claim_id: claimId,
    generation,
    claim_token: {
      path: '.ai/harness/claim-token',
      claim_id: claimId,
      task_id: SUCCESSION_TASK_ID,
      sprint: SUCCESSION_SPRINT_PATH,
      task: 'succession',
      unit_ref: SUCCESSION_UNIT_REF,
    },
  };
  const principal = validateEngineerPrincipal({
    protocol: 1,
    kind: 'repo-harness-engineer-principal',
    repository_id: fixture.repository_id,
    engineer_id: engineerId,
    binding_id: binding.binding_id,
    binding_generation: binding.binding_generation,
    engineer_contract_revision: profile.engineer_contract_revision,
    carrier: 'mcp_oauth',
    auth_subject: actor.authorization_id,
    provider: binding.provider,
    provider_thread_id: binding.provider_thread_id,
  });
  return publishClaimActorReceipt(fixture.repoRoot, buildClaimActorReceipt({
    envelope,
    principal,
    session_id: `engineer:${binding.binding_id}`,
    bound_at: boundAt,
  }));
}

export function createCollaborationSuccessionFixture(
  sourceRoot: string,
  roots: string[],
  mode: string | null = 'shadow',
): CollaborationSuccessionFixture {
  const base = createCollaborationFixture(sourceRoot, roots, mode, 'repo-harness-c5');
  const repoRoot = realpathSync(base.repoRoot);
  const repositoryId = repoHarnessRepoIdFor(repoRoot);

  mkdirSync(join(repoRoot, 'plans'), { recursive: true });
  mkdirSync(join(repoRoot, 'tasks/contracts'), { recursive: true });
  mkdirSync(join(repoRoot, 'tasks/notes'), { recursive: true });
  mkdirSync(join(repoRoot, '.ai/harness/checks'), { recursive: true });
  mkdirSync(join(repoRoot, '.ai/harness/handoff'), { recursive: true });
  // The checks file is runtime evidence, not tracked state; leaving it untracked
  // would report the bound task as `untracked_present` on every inspection.
  writeFileSync(join(repoRoot, '.gitignore'), '.ai/harness/checks/\n');
  writeFileSync(join(repoRoot, SUCCESSION_UNIT_REF), '# Plan: succession\n');
  writeFileSync(join(repoRoot, 'tasks/contracts/succession.contract.md'), '# Contract: succession\n');
  writeFileSync(
    join(repoRoot, 'tasks/notes/succession.notes.md'),
    '# Notes\n\n## Open Questions\n\n- None.\n\n## Evidence Links\n',
  );
  // The shared fixture writes only `collaboration.mode`; the freeze read needs a
  // review base to resolve the verification subject against.
  const policyPath = join(repoRoot, '.ai/harness/policy.json');
  const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as Record<string, unknown>;
  writeFileSync(policyPath, `${JSON.stringify({
    ...policy,
    worktree_strategy: { review_base: 'main' },
  }, null, 2)}\n`);
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'succession fixture']);

  const envelope = workEnvelope(repoRoot, repositoryId, git(repoRoot, ['rev-parse', 'HEAD']));
  writeFileSync(join(repoRoot, '.ai/harness/handoff/work-envelope.json'), `${JSON.stringify(envelope)}\n`);
  git(repoRoot, ['add', '.ai/harness/handoff/work-envelope.json']);
  git(repoRoot, ['commit', '-qm', 'persist exact work envelope']);
  writeVerifiedChecks(repoRoot);

  const profile = loadEngineerProfile(repoRoot, COLLABORATION_ENGINEER);
  const binding = readEngineerBindingStatus(repoRoot, COLLABORATION_ENGINEER, profile.engineer_contract_revision).binding!;
  const claimed = buildLeaseOwnerRecord({
    claimId: SUCCESSION_CLAIM_ID,
    taskId: SUCCESSION_TASK_ID,
    taskRevision: SUCCESSION_TASK_REVISION,
    sprintPath: SUCCESSION_SPRINT_PATH,
    targetRef: 'main',
    generation: 1,
    sessionId: `engineer:${binding.binding_id}`,
    sourceWorktree: repoRoot,
  });
  const bound = bindLeaseRecord(claimed, {
    claimId: SUCCESSION_CLAIM_ID,
    executionWorktree: repoRoot,
    branch: 'main',
    unitRef: SUCCESSION_UNIT_REF,
  });
  if (!bound.ok) throw new Error(bound.error);
  if (!createLeaseDirectory(repoRoot, SUCCESSION_TASK_ID)) throw new Error('lease election failed');
  writeLeaseOwnerDurably(repoRoot, SUCCESSION_TASK_ID, bound.record);

  const fixture: CollaborationSuccessionFixture = Object.freeze({
    ...base,
    repoRoot,
    executor_id: COLLABORATION_ENGINEER,
    repository_id: repositoryId,
    task_id: SUCCESSION_TASK_ID,
    claim_id: SUCCESSION_CLAIM_ID,
    lease_path: leaseOwnerPath(repoRoot, SUCCESSION_TASK_ID),
    claim_actor_receipt: undefined as unknown as ClaimActorReceiptV1,
  });
  const receipt = publishClaimActorFor(
    fixture,
    COLLABORATION_ENGINEER,
    SUCCESSION_CLAIM_ID,
    1,
    '2026-08-30T00:01:00.000Z',
  );
  return Object.freeze({ ...fixture, claim_actor_receipt: receipt });
}
