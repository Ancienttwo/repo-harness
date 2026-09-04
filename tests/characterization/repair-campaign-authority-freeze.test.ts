/**
 * BRC0 authority freeze for the GPT Pro-seeded bounded repair campaign.
 *
 * Sprint row 1 of `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`
 * promises that the campaign lands *beside* the existing authorities and never
 * inside them.  This file is the falsifier for that promise: it pins the exact
 * canonical bytes the Task, Lease, Acceptance and Publication authorities emit
 * today, and it pins the negative facts the campaign design depends on -- an
 * external Issue is not a Task, a dispatch prompt is not a Claim, the
 * `heartbeat-triage` helper is still discovery-only, `repo-harness-autoplan` is
 * retired, and the campaign capability does not exist yet.
 *
 * If any digest below moves, an authority changed and the campaign rows built
 * on top of it are no longer standing on the surface they were designed
 * against.  Re-deriving the digest to make this file pass is the one repair
 * that is never correct here.
 */

import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';

import {
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  deriveTaskRevision,
  lookupCanonicalTask,
  parseLeaseOwnerRecord,
  projectCanonicalTasks,
  serializeLeaseOwnerRecord,
  type LeaseOwnerRecord,
} from '../../src/core/state/coordination-identity';
import {
  classifyTaskOffer,
  freezeTaskOffer,
  taskOfferRevision,
  FLEET_OFFERS_KIND,
  FLEET_OFFERS_PROTOCOL,
  TASK_OFFER_KIND,
  TASK_OFFER_PROTOCOL,
  type ClassifyTaskOfferInput,
  type FleetOffersV1,
  type TaskOfferV1,
} from '../../src/core/fleet/task-offer';
import { canonicalJson } from '../../src/core/fleet/board';
import { acquireFleetTask, type FleetAcquireDependencies } from '../../src/effects/fleet/acquire';
import type { RepoHarnessRegistrySnapshot } from '../../src/effects/repo-registry';
import {
  buildAcceptanceMatrix,
  canonicalAcceptanceMatrixBytes,
} from '../../src/core/integration/product-acceptance';
import {
  buildPublicationReceipt,
  canonicalPublicationReceiptBytes,
  encodePublicationMarker,
} from '../../src/core/publication/publication-receipt';
import {
  buildProviderIssueObservation,
  canonicalProviderIssueObservationBytes,
  validateProviderIssueObservation,
  type ProviderIssueObservationV1,
} from '../../src/core/external-sources/issue-observation';
import { buildExternalSourceProjection } from '../../src/core/external-sources/projection';
import { buildExternalSourceBindingReceipt } from '../../src/core/external-sources/binding';
import { listLeaseReads, readLease } from '../../src/effects/state/coordination-lease-store';
import { renderAcceptanceProjection, type AcceptanceReceipt } from '../../scripts/acceptance-receipt';
import { RUN_HELP_GROUPS } from '../../src/cli/commands/run';
import { listHelperIds } from '../../src/cli/runtime/helper-runner';

const REPO_ROOT = join(import.meta.dir, '../..');
const FIXTURES = join(REPO_ROOT, 'tests/fixtures/repair-campaign');

/** The PRD is the vocabulary authority; the fixtures may not exceed it. */
const PRD_TEXT = readFileSync(
  join(REPO_ROOT, 'plans/prds/20260902-2238-gpt-pro-seeded-repair-campaign.prd.md'),
  'utf-8',
);

const BASELINE = JSON.parse(readFileSync(join(FIXTURES, 'authority-freeze-baseline.json'), 'utf-8')) as {
  readonly frozen: Record<string, { readonly sha256: string; readonly source: string }>;
};

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf-8').digest('hex')}`;
}

/**
 * `projectCanonicalTasks` and `classifyTaskOffer` return objects, not bytes.
 * Their byte contract is the repository's own canonical serializer in
 * `src/core/fleet/board.ts`; using it here keeps the digest a property of
 * production code rather than of this file's `JSON.stringify` call order.
 */
function canonicalDigest(value: unknown): string {
  return digest(canonicalJson(value));
}

function frozen(id: string): string {
  const entry = BASELINE.frozen[id];
  if (!entry) throw new Error(`authority-freeze-baseline.json has no frozen entry for ${id}`);
  return entry.sha256;
}

// ---------------------------------------------------------------------------
// Fixed authority subjects.  Every value is a literal so the digests below are
// a property of the production serializers alone.
// ---------------------------------------------------------------------------

const REPO_IDENTITY = 'repo_00000000000000c0';
const SPRINT_PATH = 'plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md';

/**
 * The persisted `ID` cells of the freeze subject, verbatim.
 *
 * Under backlog schema 2 a task's identity is read from this column, not
 * derived from its Task text, so these literals *are* the identities the
 * assertions below pin. They are fixture constants on purpose: deriving them
 * from anything would reintroduce the coupling schema 2 removed.
 *
 * Their *values* are the ids this fixture's rows had before the migration --
 * `digest(protocol + repo identity + sprint path + Task cell)` under schema 1 --
 * because that is exactly what `sprint migrate-schema` persists for a real
 * sprint. Freezing the same values keeps `task_id` and every digest built on
 * `task_id` alone unchanged across the re-baseline, so the only bytes that move
 * are the ones that genuinely had to: those carrying a `task_revision`, whose
 * preimage gained the Task cell and the `protocol-v2` domain.
 */
const FROZEN_ROW_IDS = [
  '5c2f33a355674ae7897396785848ab88c4332950ce2083431d45ecab144a8b92',
  '5bac52a43a184c492663fc351fe780f8dc46274fcc1447d3892b06a18eddaee2',
  'a3385f1c38ebecdaae3cfccdd00c0c386ba18d32835411b7f80e8a7c4c2d7126',
] as const;

const SPRINT_TEXT = [
  '# Sprint: freeze subject',
  '',
  '> **Backlog Schema**: 2',
  '',
  '## Backlog',
  '',
  '| # | ID | Status | Task | Mode | Acceptance | Plan |',
  '|---:|---|:---:|---|---|---|---|',
  `| 1 | ${FROZEN_ROW_IDS[0]} | [ ] | BRC0 — Authority freeze | contract | Frozen bytes hold | |`,
  `| 2 | ${FROZEN_ROW_IDS[1]} | [ ] | BRC1 — Dispatch fence | contract | Fence runs once | |`,
  `| 3 | ${FROZEN_ROW_IDS[2]} | [x] | BRC2 — Inline spike | inline | Probe recorded | docs/researches/probe.md |`,
  '',
  '## Execution Log',
  '',
].join('\n');

/**
 * A well-formed task id that no backlog row produced.
 *
 * The negative proofs below need such a value: "an identity invented from an
 * Issue title or a dispatch prompt is not a Task". Schema 2 has no function
 * that turns text into an identity -- that is the whole point -- so the test
 * fabricates one locally and says so. Nothing in `src/` may do this.
 */
function inventedTaskId(text: string): string {
  return createHash('sha256').update(`brc0-invented ${text}`, 'utf-8').digest('hex');
}

const CANONICAL_TASKS = projectCanonicalTasks({
  repoIdentity: REPO_IDENTITY,
  sprintPath: SPRINT_PATH,
  sprintText: SPRINT_TEXT,
});

const CLAIM_ID = '0f5a5cf6-0c26-4a2a-9a2a-2ff5a54e9b01';

const RESERVING_LEASE = buildLeaseOwnerRecord({
  claimId: CLAIM_ID,
  taskId: CANONICAL_TASKS[0]!.task_id,
  taskRevision: CANONICAL_TASKS[0]!.task_revision,
  sprintPath: SPRINT_PATH,
  targetRef: 'refs/heads/main',
  generation: 1,
  sessionId: 'brc0-freeze-session',
  sourceWorktree: '/frozen/source/worktree',
});

const BOUND_LEASE = (() => {
  const transition = bindLeaseRecord(RESERVING_LEASE, {
    claimId: CLAIM_ID,
    executionWorktree: '/frozen/execution/worktree',
    branch: 'codex/brc0-authority-freeze-baseline-characterization',
    unitRef: 'refs/heads/codex/brc0-authority-freeze-baseline-characterization',
  });
  if (!transition.ok) throw new Error(`bind transition must succeed: ${transition.error}`);
  return transition.record;
})();

const ACCEPTANCE_MATRIX = buildAcceptanceMatrix({
  envelope_sha256: `sha256:${'1'.repeat(64)}`,
  rows: [
    { constraint_id: 'campaign.authority.unchanged', evidence_ref: 'tests/characterization/repair-campaign-authority-freeze.test.ts', evidence_sha256: `sha256:${'2'.repeat(64)}`, result: 'pass' },
    { constraint_id: 'campaign.issue.not_task', evidence_ref: 'tests/fixtures/repair-campaign/batch-complete-10.json', evidence_sha256: `sha256:${'3'.repeat(64)}`, result: 'pass' },
  ],
  verifier_receipt_ref: '.ai/harness/checks/latest.json',
  verifier_receipt_sha256: `sha256:${'4'.repeat(64)}`,
});

const ACCEPTANCE_RECEIPT: AcceptanceReceipt = Object.freeze({
  protocol: 2,
  kind: 'repo-harness-acceptance-receipt',
  repository_root: '/frozen/repo',
  contract_file: 'tasks/contracts/frozen.contract.md',
  contract_sha256: `sha256:${'5'.repeat(64)}`,
  goal_file: 'plans/plan-frozen.md',
  goal_sha256: `sha256:${'6'.repeat(64)}`,
  verification_file: '.ai/harness/checks/latest.json',
  verification_evidence_sha256: `sha256:${'7'.repeat(64)}`,
  benchmark_evidence_sha256: `sha256:${'8'.repeat(64)}`,
  subject_sha256: `sha256:${'9'.repeat(64)}`,
  subject_scope: 'normalized-final-content',
  target_ref: 'refs/heads/main',
  target_revision: 'a'.repeat(40),
  reviewed_paths: ['tests/characterization/repair-campaign-authority-freeze.test.ts'],
  disposition: 'external_pass',
  expected_reviewer: 'Codex',
  reviewer: 'Codex',
  source: 'codex-review',
  actor: null,
  summary: 'Frozen acceptance projection subject.',
  findings: [],
  waiver_grant_sha256: null,
  issued_at: '2026-09-03T00:00:00Z',
});

const PUBLICATION_RECEIPT = buildPublicationReceipt({
  repo_id: REPO_IDENTITY,
  task_id: CANONICAL_TASKS[0]!.task_id,
  task_revision: CANONICAL_TASKS[0]!.task_revision,
  claim_id: CLAIM_ID,
  generation: 1,
  target_ref: 'refs/heads/main',
  base_sha: 'b'.repeat(40),
  branch: 'codex/brc0-authority-freeze-baseline-characterization',
  head_sha: 'c'.repeat(40),
  tree_sha: 'd'.repeat(40),
  review_subject_sha256: `sha256:${'e'.repeat(64)}`,
  verification_evidence_sha256: `sha256:${'f'.repeat(64)}`,
  merge_seal_sha256: `sha256:${'0'.repeat(64)}`,
  provider: 'github',
  provider_repo_id: 'ancienttwo/repo-harness',
  pr_number: 291,
  pr_url: 'https://github.com/ancienttwo/repo-harness/pull/291',
  created_at: '2026-09-03T00:00:00Z',
});

const FROZEN_OBSERVATION = buildProviderIssueObservation({
  registered_repository_id: REPO_IDENTITY,
  provider: 'github',
  provider_host: 'github.com',
  provider_repository_id: 'ancienttwo/repo-harness',
  provider_issue_id: '901',
  display_ref: 'ancienttwo/repo-harness#901',
  url: 'https://github.com/ancienttwo/repo-harness/issues/901',
  observed_at: '2026-09-03T02:00:00.000Z',
  provider_created_at: '2026-09-03T01:30:00Z',
  provider_updated_at: '2026-09-03T01:45:00Z',
  state: 'open',
  title: '[rh-campaign:camp_2026090300:g01:s01][bugfix] slot 01 finding',
  body: '<!-- repo-harness-campaign:v1\ncampaign_id=camp_2026090300\ngroup=1\nslot=01\n-->\n\nfrozen body\n',
  labels: [],
  assignees: [],
  comments_policy: 'omitted',
  policy_revision: `sha256:${'0'.repeat(63)}1`,
  eligible: true,
  eligibility_reasons: [],
});

/** Every closed classifier input combination, in a stable order. */
const OFFER_MATRIX: readonly ClassifyTaskOfferInput[] = (() => {
  const leaseStates: readonly ClassifyTaskOfferInput['lease_state'][] = ['available', 'reserving', 'bound', 'completing', 'reviewing', 'released', 'unknown'];
  const modes = ['contract', 'inline', 'unsupported-mode'];
  const planFailures: readonly ClassifyTaskOfferInput['plan_failure'][] = [undefined, 'missing', 'ambiguous', 'not_approved', 'source_mismatch', 'not_projectable', 'contract_missing', 'contract_not_projectable'];
  const plan = {
    plan_path: 'plans/plan-frozen.md',
    contract_path: 'tasks/contracts/frozen.contract.md',
    source_ref: 'sprint:frozen#1',
    plan_sha256: `sha256:${'1'.repeat(64)}`,
    contract_sha256: `sha256:${'2'.repeat(64)}`,
  };
  const inputs: ClassifyTaskOfferInput[] = [];
  for (const accessMode of ['read_write', 'read_only'] as const) {
    for (const rowStatus of ['[ ]', '[x]']) {
      for (const leaseState of leaseStates) {
        for (const mode of modes) {
          for (const consistency of ['stable', 'changed_during_read'] as const) {
            for (const hasPlan of [true, false]) {
              for (const planFailure of planFailures) {
                for (const canonicalAvailable of [true, false]) {
                  inputs.push({
                    repo_access_mode: accessMode,
                    row_status: rowStatus,
                    mode,
                    lease_state: leaseState,
                    snapshot_consistency: consistency,
                    plan: hasPlan ? plan : null,
                    plan_failure: planFailure,
                    canonical_available: canonicalAvailable,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return Object.freeze(inputs);
})();

function fixtureRepo(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

function listFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      if (entry === '.git') continue;
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else found.push(relative(root, full));
    }
  };
  walk(root);
  return found.sort();
}

describe('BRC0 authority freeze: canonical bytes', () => {
  test('Task authority bytes are unchanged', () => {
    expect(canonicalDigest(CANONICAL_TASKS)).toBe(frozen('task.canonical_projection'));
    // Schema 2: identity is the persisted ID cell, read verbatim, not a digest
    // of the Task text. The revision still moves with the Task, Mode and
    // Acceptance cells, which is what stales an offer taken before an edit.
    expect(CANONICAL_TASKS[0]!.task_id).toBe(FROZEN_ROW_IDS[0]);
    expect(CANONICAL_TASKS.map((task) => task.task_id)).toEqual([...FROZEN_ROW_IDS]);
    expect(CANONICAL_TASKS[0]!.task_revision).toBe(deriveTaskRevision({
      taskId: CANONICAL_TASKS[0]!.task_id,
      taskCell: 'BRC0 — Authority freeze',
      modeCell: 'contract',
      acceptanceCell: 'Frozen bytes hold',
    }));
    // A title edit is a rename: identity survives, revision drifts.
    const renamed = projectCanonicalTasks({
      repoIdentity: REPO_IDENTITY,
      sprintPath: SPRINT_PATH,
      sprintText: SPRINT_TEXT.replace('BRC0 — Authority freeze', 'BRC0 — Authority freeze (v2)'),
    });
    expect(renamed[0]!.task_id).toBe(CANONICAL_TASKS[0]!.task_id);
    expect(renamed[0]!.task_revision).not.toBe(CANONICAL_TASKS[0]!.task_revision);
    expect(taskOfferRevision([REPO_IDENTITY, SPRINT_PATH, CANONICAL_TASKS[0]!.task_id, 1, null]))
      .toBe(frozen('task.offer_revision'));
  });

  test('TaskOffer classification is unchanged across the whole closed input matrix', () => {
    const results = OFFER_MATRIX.map((input) => classifyTaskOffer(input));
    // Both `canonical_available` values are in the matrix, so the dedicated
    // `canonical_unavailable` branch cannot change without moving the digest.
    expect(OFFER_MATRIX).toHaveLength(5376);
    expect(OFFER_MATRIX.some((input) => input.canonical_available === false)).toBe(true);
    expect(canonicalDigest(results)).toBe(frozen('task.offer_classification_matrix'));
  });

  test('Lease authority bytes are unchanged for reserving and bound', () => {
    expect(digest(serializeLeaseOwnerRecord(RESERVING_LEASE))).toBe(frozen('lease.reserving_record'));
    expect(digest(serializeLeaseOwnerRecord(BOUND_LEASE))).toBe(frozen('lease.bound_record'));
    // The store's read path must accept exactly the bytes the writer emits.
    expect(parseLeaseOwnerRecord(serializeLeaseOwnerRecord(BOUND_LEASE))).toEqual(BOUND_LEASE as LeaseOwnerRecord);
  });

  test('Acceptance authority bytes are unchanged', () => {
    expect(digest(canonicalAcceptanceMatrixBytes(ACCEPTANCE_MATRIX))).toBe(frozen('acceptance.matrix_bytes'));
    expect(ACCEPTANCE_MATRIX.matrix_sha256).toBe(frozen('acceptance.matrix_sha256'));
    expect(digest(renderAcceptanceProjection(ACCEPTANCE_RECEIPT))).toBe(frozen('acceptance.receipt_projection'));
  });

  test('Publication authority bytes are unchanged', () => {
    expect(digest(canonicalPublicationReceiptBytes(PUBLICATION_RECEIPT))).toBe(frozen('publication.receipt_bytes'));
    expect(PUBLICATION_RECEIPT.publication_id).toBe(frozen('publication.publication_id'));
    expect(digest(encodePublicationMarker(PUBLICATION_RECEIPT))).toBe(frozen('publication.marker'));
  });

  test('External source observation bytes are unchanged', () => {
    expect(digest(canonicalProviderIssueObservationBytes(FROZEN_OBSERVATION))).toBe(frozen('external_source.observation_bytes'));
    expect(FROZEN_OBSERVATION.observation_sha256).toBe(frozen('external_source.observation_sha256'));
  });
});

describe('BRC0 negative freeze: an Issue is not a Task', () => {
  const batch = JSON.parse(readFileSync(join(FIXTURES, 'batch-complete-10.json'), 'utf-8')) as {
    readonly registered_repository_id: string;
    readonly observations: readonly unknown[];
  };

  test('every fixture observation parses through the real intake validator', () => {
    for (const name of readdirSync(FIXTURES).filter((entry) => entry.startsWith('batch-'))) {
      const document = JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8')) as {
        readonly kind: string;
        readonly declared_slots: readonly string[];
        readonly expected_slot_states: Readonly<Record<string, string>>;
        readonly observations: readonly unknown[];
      };
      expect(document.kind).toBe('repo-harness-repair-campaign-provider-batch-fixture');
      expect(document.declared_slots).toHaveLength(10);
      expect(document.observations.length).toBeGreaterThan(0);

      // Every declared slot has a state, and every state is a term the PRD
      // itself writes. The vocabulary is read out of the PRD rather than
      // restated here, so this row cannot authorize its own fixtures.
      expect(Object.keys(document.expected_slot_states).sort()).toEqual([...document.declared_slots].sort());
      for (const state of new Set(Object.values(document.expected_slot_states))) {
        expect(PRD_TEXT).toContain(`\`${state}\``);
      }

      for (const raw of document.observations) {
        const parsed = validateProviderIssueObservation(raw);
        expect(parsed.provider).toBe('github');
        expect(parsed.comments_policy).toBe('omitted');
      }
    }
  });

  test('projecting a full ten-slot batch produces no Task, no sprint row and no lease', () => {
    const observations = batch.observations.map(validateProviderIssueObservation);
    const projection = buildExternalSourceProjection({
      registered_repository_id: batch.registered_repository_id,
      observations,
      receipts: [],
    });

    expect(projection.issues).toHaveLength(10);
    // The projection carries only observation identity. There is no field
    // through which a Task identity, sprint row or lease could arrive.
    const projectionKeys = Object.keys(projection).sort();
    expect(projectionKeys).toEqual(['issues', 'kind', 'latest_attempt', 'latest_complete_refresh', 'protocol', 'registered_repository_id']);
    for (const issue of projection.issues) {
      expect(Object.keys(issue).sort()).toEqual(['latest_observation', 'provider_issue_id', 'provider_repository_id', 'source_drift']);
    }
    const asText = JSON.stringify(projection);
    expect(asText).not.toContain('task_id');
    expect(asText).not.toContain('task_revision');
    expect(asText).not.toContain('claim_id');
    expect(asText).not.toContain('sprint_path');

    // A canonical sprint that never saw the batch still projects exactly its
    // own three rows, so the ten observations added no Task identity.
    expect(projectCanonicalTasks({
      repoIdentity: REPO_IDENTITY,
      sprintPath: SPRINT_PATH,
      sprintText: SPRINT_TEXT,
    })).toHaveLength(3);

    const repo = fixtureRepo('brc0-issue-not-task-');
    expect(listLeaseReads(repo)).toHaveLength(0);
    expect(readLease(repo, CANONICAL_TASKS[0]!.task_id).classification).toBe('available');
  });

  test('external source binding consumes an existing Task and cannot mint one', () => {
    const observation = validateProviderIssueObservation(batch.observations[0]) as ProviderIssueObservationV1;
    const receipt = buildExternalSourceBindingReceipt({
      registered_repository_id: REPO_IDENTITY,
      authorization_revision: 1,
      provider: 'github',
      provider_repository_id: observation.provider_repository_id,
      provider_issue_id: observation.provider_issue_id,
      source_revision: observation.source_revision,
      observation_sha256: observation.observation_sha256,
      canonical_target_ref: 'refs/heads/main',
      canonical_target_commit: 'b'.repeat(40),
      sprint_path: SPRINT_PATH,
      task_id: CANONICAL_TASKS[0]!.task_id,
      task_revision: CANONICAL_TASKS[0]!.task_revision,
      task_ref: 'BRC0 — Authority freeze',
      plan_path: 'plans/plan-frozen.md',
      plan_sha256: `sha256:${'1'.repeat(64)}`,
      contract_path: 'tasks/contracts/frozen.contract.md',
      contract_sha256: `sha256:${'2'.repeat(64)}`,
      bound_at: '2026-09-03T02:10:00.000Z',
    });
    // The receipt only *references* the canonical Task; it is an input, never
    // an output.
    expect(receipt.task_id).toBe(CANONICAL_TASKS[0]!.task_id);
    expect(() => buildExternalSourceBindingReceipt({
      registered_repository_id: REPO_IDENTITY,
      authorization_revision: 1,
      provider: 'github',
      provider_repository_id: observation.provider_repository_id,
      provider_issue_id: observation.provider_issue_id,
      source_revision: observation.source_revision,
      observation_sha256: observation.observation_sha256,
      canonical_target_ref: 'refs/heads/main',
      canonical_target_commit: 'b'.repeat(40),
      sprint_path: SPRINT_PATH,
      task_id: `issue-${observation.provider_issue_id}`,
      task_revision: CANONICAL_TASKS[0]!.task_revision,
      task_ref: 'BRC0 — Authority freeze',
      plan_path: 'plans/plan-frozen.md',
      plan_sha256: `sha256:${'1'.repeat(64)}`,
      contract_path: 'tasks/contracts/frozen.contract.md',
      contract_sha256: `sha256:${'2'.repeat(64)}`,
      bound_at: '2026-09-03T02:10:00.000Z',
    })).toThrow();
  });

  test('canonical lookup, not the binding schema, is what rejects an invented Task identity', () => {
    const observation = validateProviderIssueObservation(batch.observations[0]) as ProviderIssueObservationV1;
    const canonicalSprint = {
      repoIdentity: REPO_IDENTITY,
      sprintPath: SPRINT_PATH,
      sprintText: SPRINT_TEXT,
    };

    // `binding.ts` validates shape only, so a well-formed digest that no
    // backlog row produced still passes its schema. That is exactly why the
    // binding is not the authority: the canonical sprint is.
    const inventedFromIssue = inventedTaskId(
      `Issue #${observation.provider_issue_id}: ${observation.title}`,
    );
    expect(inventedFromIssue).toMatch(/^[0-9a-f]{64}$/);

    const lookup = lookupCanonicalTask(canonicalSprint, inventedFromIssue);
    expect(lookup.ok).toBe(false);
    expect(lookup.ok === false && lookup.error).toContain('no backlog row');

    // A digest that is merely well formed is rejected the same way.
    const wellFormedButUnknown = lookupCanonicalTask(canonicalSprint, 'a'.repeat(64));
    expect(wellFormedButUnknown.ok).toBe(false);

    // Every canonical task id does resolve, so the failure above is the
    // lookup working, not the fixture being empty.
    for (const task of CANONICAL_TASKS) {
      expect(lookupCanonicalTask(canonicalSprint, task.task_id).ok).toBe(true);
    }
  });

  test('the slot marker is the only slot authority; the title prefix is not', () => {
    const marked = JSON.parse(readFileSync(join(FIXTURES, 'batch-missing-marker.json'), 'utf-8')) as {
      readonly expected_unmarked_issue_ids: readonly string[];
      readonly expected_slot_states: Readonly<Record<string, string>>;
      readonly observations: readonly unknown[];
    };
    // The unmarked issue attaches to no slot, so every slot it might have
    // filled stays `missing`.
    expect(marked.expected_slot_states['03']).toBe('missing');
    const unmarked = marked.observations
      .map(validateProviderIssueObservation)
      .filter((entry) => !entry.body.includes('<!-- repo-harness-campaign:v1'));
    expect(unmarked.map((entry) => entry.provider_issue_id)).toEqual([...marked.expected_unmarked_issue_ids]);
    // The title still carries the display convention, which is exactly why the
    // title must not be read during reconciliation.
    for (const entry of unmarked) expect(entry.title).toContain('[rh-campaign:');
  });

  test('the campaign marker carries exactly the three PRD fields and no digest', () => {
    const MARKER = /<!-- repo-harness-campaign:v1\n([\s\S]*?)\n-->/u;
    for (const name of readdirSync(FIXTURES).filter((entry) => entry.startsWith('batch-'))) {
      const document = JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8')) as {
        readonly expected_marked_issue_ids: readonly string[];
        readonly expected_unmarked_issue_ids: readonly string[];
        readonly observations: readonly unknown[];
      };
      const observations = document.observations.map(validateProviderIssueObservation);

      // Marker presence is frozen exactly, not as a floor: deleting a marker
      // from any fixture that declares one fails here.
      const withMarker = observations.filter((entry) => MARKER.test(entry.body));
      const withoutMarker = observations.filter((entry) => !MARKER.test(entry.body));
      expect([...new Set(withMarker.map((entry) => entry.provider_issue_id))].sort())
        .toEqual([...document.expected_marked_issue_ids].sort());
      expect([...new Set(withoutMarker.map((entry) => entry.provider_issue_id))].sort())
        .toEqual([...document.expected_unmarked_issue_ids].sort());

      for (const observation of withMarker) {
        const match = MARKER.exec(observation.body)!;
        const lines = match[1]!.split('\n');
        const keys = lines.map((line) => line.split('=')[0]);
        // Exactly three fields, in the PRD's order, and nothing else.
        expect(keys).toEqual(['campaign_id', 'group', 'slot']);
        for (const line of lines) {
          expect(line).toMatch(/^[a-z_]+=[^=]*$/u);
          const value = line.slice(line.indexOf('=') + 1);
          // No digest may appear in the marker: the model must never be asked
          // to copy a 40- or 64-character hash (PRD Module 3).
          expect(value).not.toMatch(/^sha256:/u);
          expect(value).not.toMatch(/[0-9a-f]{40,}/u);
        }
      }
    }
  });

  test('the same issue observed twice with a different body is source drift', () => {
    const document = JSON.parse(readFileSync(join(FIXTURES, 'batch-source-drift.json'), 'utf-8')) as {
      readonly registered_repository_id: string;
      readonly expected_drift_issue_ids: readonly string[];
      readonly observations: readonly unknown[];
    };
    const projection = buildExternalSourceProjection({
      registered_repository_id: document.registered_repository_id,
      observations: document.observations.map(validateProviderIssueObservation),
      receipts: [],
    });
    expect(projection.issues.filter((issue) => issue.source_drift).map((issue) => issue.provider_issue_id))
      .toEqual([...document.expected_drift_issue_ids]);
  });
});

describe('BRC0 negative freeze: a prompt is not a Claim', () => {
  const PROMPT = 'Worker A 负责 Issue #123，请直接开始修复并提交 PR。';

  test('the offer classifier has no prompt input channel', () => {
    const base: ClassifyTaskOfferInput = {
      repo_access_mode: 'read_write',
      row_status: '[ ]',
      mode: 'contract',
      lease_state: 'available',
      snapshot_consistency: 'stable',
      plan: null,
      canonical_available: true,
    };
    const withPrompt = { ...base, prompt: PROMPT, assignee: 'Worker A', issue: 123 } as ClassifyTaskOfferInput;
    expect(classifyTaskOffer(withPrompt)).toEqual(classifyTaskOffer(base));
    // Without a plan proof the offer is planning_required, never claimable.
    expect(classifyTaskOffer(base).execution_readiness).toBe('planning_required');
  });

  test('a lease record cannot carry a prompt-derived task identity', () => {
    const forged = { ...RESERVING_LEASE, task_id: `issue-123-${PROMPT}` };
    expect(parseLeaseOwnerRecord(JSON.stringify(forged))).toBeNull();
    const extraField = { ...RESERVING_LEASE, assigned_by_prompt: PROMPT };
    expect(parseLeaseOwnerRecord(JSON.stringify(extraField))).toBeNull();
  });

  test('a prompt cannot select an execution-ready offer that the canonical path can', () => {
    const repo = fixtureRepo('brc0-prompt-not-claim-');
    const before = listFiles(repo);

    const REPO_ID = 'repo_1111111111111111';
    const AUTHORIZATION_REVISION = 7;

    const registry: RepoHarnessRegistrySnapshot = Object.freeze({
      registryPath: join(repo, 'registry.json'),
      authorizationRevision: AUTHORIZATION_REVISION,
      repos: Object.freeze([Object.freeze({
        id: REPO_ID,
        path: repo,
        accessMode: 'read_write' as const,
        source: 'manual' as const,
        registeredAt: '2026-09-03T00:00:00.000Z',
        lastSeenAt: '2026-09-03T00:00:00.000Z',
      })]),
    });

    // A genuinely execution-ready offer, classified by the production
    // classifier and revisioned by the production digest. Without this the
    // negatives below would pass merely because the world is empty.
    const planProof = {
      plan_path: 'plans/plan-frozen.md',
      contract_path: 'tasks/contracts/frozen.contract.md',
      source_ref: 'sprint:frozen#1',
      plan_sha256: `sha256:${'1'.repeat(64)}`,
      contract_sha256: `sha256:${'2'.repeat(64)}`,
    };
    const classification = classifyTaskOffer({
      repo_access_mode: 'read_write',
      row_status: '[ ]',
      mode: 'contract',
      lease_state: 'available',
      snapshot_consistency: 'stable',
      plan: planProof,
      canonical_available: true,
    });
    expect(classification.execution_readiness).toBe('execution_ready');

    const offer: TaskOfferV1 = freezeTaskOffer({
      protocol: TASK_OFFER_PROTOCOL,
      kind: TASK_OFFER_KIND,
      repo_id: REPO_ID,
      task_id: CANONICAL_TASKS[0]!.task_id,
      task_revision: CANONICAL_TASKS[0]!.task_revision,
      sprint_path: SPRINT_PATH,
      row_order: 0,
      execution_readiness: classification.execution_readiness,
      snapshot_consistency: 'stable',
      blockers: classification.blockers,
      offer_revision: taskOfferRevision([REPO_ID, CANONICAL_TASKS[0]!.task_id, CANONICAL_TASKS[0]!.task_revision, 0]),
      authorization_revision: AUTHORIZATION_REVISION,
      canonical_target: { ref: 'refs/heads/main', oid: 'b'.repeat(40) },
      plan: planProof,
    });
    const document: FleetOffersV1 = Object.freeze({
      protocol: FLEET_OFFERS_PROTOCOL,
      kind: FLEET_OFFERS_KIND,
      authorization_revision: AUTHORIZATION_REVISION,
      snapshot_consistency: 'stable',
      offer_revision: taskOfferRevision([REPO_ID, offer.offer_revision]),
      offers: Object.freeze([offer]),
    });

    const calls: string[] = [];
    const spy = (name: string) => (...args: unknown[]): never => {
      calls.push(name);
      void args;
      throw new Error(`__spy__${name}`);
    };
    const dependencies = (): Partial<FleetAcquireDependencies> => ({
      readRegistry: () => registry,
      collectOffers: () => document,
      sprintDependencies: (() => ({})) as unknown as FleetAcquireDependencies['sprintDependencies'],
      claim: spy('claim') as unknown as FleetAcquireDependencies['claim'],
      bind: spy('bind') as unknown as FleetAcquireDependencies['bind'],
      release: spy('release') as unknown as FleetAcquireDependencies['release'],
      start: spy('start') as unknown as FleetAcquireDependencies['start'],
      writeToken: spy('writeToken') as unknown as FleetAcquireDependencies['writeToken'],
      project: spy('project') as unknown as FleetAcquireDependencies['project'],
    });

    // Control: the canonical path does reach the first ownership mutation.
    // This is what makes the two negatives below meaningful.
    calls.length = 0;
    expect(() => acquireFleetTask({
      registry_snapshot: registry,
      dependencies: dependencies(),
      session_id: 'brc0-control',
    })).toThrow('__spy__claim');
    expect(calls).toEqual(['claim']);

    // Negative 1: the prompt names a task by its own words. The derived
    // identity matches no offer, so selection fails closed.
    calls.length = 0;
    const promptTask = acquireFleetTask({
      registry_snapshot: registry,
      dependencies: dependencies(),
      session_id: 'brc0-prompt-task',
      assertion: {
        task_id: inventedTaskId(PROMPT),
      },
    });
    expect(promptTask.ok).toBe(false);
    expect(promptTask.ok === false && promptTask.error).toBe('offer_stale');
    expect(calls).toEqual([]);

    // Negative 2: the prompt names an owner. Even with the real task id, an
    // ownership claim the registry does not back selects nothing.
    calls.length = 0;
    const promptOwner = acquireFleetTask({
      registry_snapshot: registry,
      dependencies: dependencies(),
      session_id: 'brc0-prompt-owner',
      assertion: { repo_id: 'Worker A', task_id: offer.task_id },
    });
    expect(promptOwner.ok).toBe(false);
    expect(promptOwner.ok === false && promptOwner.error).toBe('offer_stale');
    expect(calls).toEqual([]);

    expect(listFiles(repo)).toEqual(before);
    expect(listLeaseReads(repo)).toHaveLength(0);
    expect(existsSync(join(repo, '.git/repo-harness/coordination'))).toBe(false);
  });
});

describe('BRC0 negative freeze: heartbeat-triage stays discovery-only', () => {
  const SOURCE = readFileSync(join(REPO_ROOT, 'scripts/heartbeat-triage.sh'), 'utf-8');

  test('the helper source contains no mutation, dispatch or provider verb', () => {
    for (const forbidden of [
      'git commit', 'git push', 'git checkout', 'git branch', 'git worktree', 'git merge',
      'gh pr', 'gh issue', 'gh api',
      'contract-worktree', 'ship-worktrees', 'acceptance-receipt', 'merge-gate',
      'coordination', 'lease', 'claim', 'acquire', 'spawn', 'codex exec', 'claude -p',
    ]) {
      expect(SOURCE).not.toContain(forbidden);
    }
  });

  test('the sprint probe resolves its repository from the helper location, not from --repo', () => {
    // Characterization of a real containment gap, frozen so it cannot change
    // silently: when `.ai/harness/sprint/active-sprint` exists, heartbeat
    // shells out to `sprint-backlog.sh next`, and that helper derives its own
    // repository root from `BASH_SOURCE` unless REPO_HARNESS_TARGET_REPO_ROOT
    // is set. heartbeat-triage sets neither, so that branch reads the helper's
    // repository rather than the one named by `--repo`.
    const helper = readFileSync(join(REPO_ROOT, 'scripts/sprint-backlog.sh'), 'utf-8');
    expect(helper).toContain('SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"');
    expect(helper).toContain('elif REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"');
    expect(SOURCE).not.toContain('REPO_HARNESS_TARGET_REPO_ROOT');
    // The probe is still read-only: heartbeat only ever calls the `next` verb.
    expect(SOURCE).toContain('"$sprint_helper" next');
  });

  test('a real run writes exactly the inbox and its run snapshot', () => {
    const repo = fixtureRepo('brc0-heartbeat-');
    // Run the helper in place, from the repository's own `scripts/`, so the
    // sibling probes it shells out to (`check-task-workflow.sh --strict` and
    // `sprint-backlog.sh next`) are the real ones and their transitive writes,
    // if any, land inside the observed fixture repository.
    const helper = join(REPO_ROOT, 'scripts/heartbeat-triage.sh');
    const before = new Set(listFiles(repo));

    const stdout = execFileSync('bash', [helper, 'run', '--repo', repo, '--run-id', 'brc0-freeze', '--source', 'manual', '--json'], {
      cwd: repo,
      encoding: 'utf-8',
    });

    const created = listFiles(repo).filter((path) => !before.has(path));
    expect(created).toEqual([
      '.ai/harness/runs/brc0-freeze-heartbeat-triage.json',
      '.ai/harness/triage/inbox.md',
    ]);

    const snapshot = JSON.parse(stdout) as {
      readonly kind: string;
      readonly entries: readonly { readonly kind: string; readonly status: string }[];
    };
    expect(snapshot.kind).toBe('repo-harness-heartbeat-triage');
    expect(snapshot.entries.map((entry) => entry.kind).sort()).toEqual(['drift-requests', 'sprint-next', 'workflow-check']);
    // `fail`, not `warning`: the real `check-task-workflow.sh --strict` sibling
    // was found and executed against the fixture, so the write-set assertion
    // above covers that transitive path too.
    const workflowCheck = snapshot.entries.find((entry) => entry.kind === 'workflow-check');
    expect(workflowCheck?.status).toBe('fail');

    // The sprint probe takes the local awk fallback because the fixture has no
    // `.ai/harness/sprint/active-sprint` marker. That branch is fixture-scoped.
    const sprintNext = snapshot.entries.find((entry) => entry.kind === 'sprint-next');
    expect(sprintNext?.status).toBe('info');
    expect(existsSync(join(repo, '.ai/harness/sprint/active-sprint'))).toBe(false);

    // No branch, no commit, no lease: the run leaves git untouched.
    expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repo, encoding: 'utf-8' }).trim()).toBe('');
    expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repo, encoding: 'utf-8' }).trim()).toBe('1');
    expect(listLeaseReads(repo)).toHaveLength(0);
  });
});

describe('BRC0 negative freeze and BRC3 campaign boundary transition', () => {
  test('repo-harness-autoplan is retired with no successor and no helper', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'assets/skill-commands/manifest.json'), 'utf-8')) as {
      readonly retiredPackages: readonly { readonly name: string; readonly replacement: string | null }[];
      readonly packages?: readonly { readonly name: string }[];
    };
    const retired = manifest.retiredPackages.find((entry) => entry.name === 'repo-harness-autoplan');
    expect(retired).toBeDefined();
    expect(retired!.replacement).toBeNull();
    expect((manifest.packages ?? []).some((entry) => entry.name.includes('autoplan'))).toBe(false);

    expect(listHelperIds().some((id) => id.includes('autoplan'))).toBe(false);
    expect(RUN_HELP_GROUPS.flatMap((group) => group.helpers).some((id) => id.includes('autoplan'))).toBe(false);
    expect(existsSync(join(REPO_ROOT, 'scripts/autoplan.sh'))).toBe(false);
    expect(existsSync(join(REPO_ROOT, 'scripts/autoplan.ts'))).toBe(false);
  });

  test('the campaign capability exists but remains disabled by default', () => {
    const policy = JSON.parse(readFileSync(join(REPO_ROOT, '.ai/harness/policy.json'), 'utf-8')) as Record<string, unknown>;
    expect(policy.development_campaign).toEqual({ version: 1, mode: 'off' });

    const nodes = readdirSync(join(REPO_ROOT, '.archcontext/model/nodes'));
    expect(nodes.filter((entry) => entry.includes('development-campaign')).sort()).toEqual([
      'capability.runtime-harness.development-campaign.yaml',
      'component.development-campaign.journal.yaml',
    ]);

    // The two directory-level rows (src/core/automation, src/effects/automation) were
    // removed because automation/ became a shared namespace with the #282 budget ledger.
    for (const path of [
      'src/cli/commands/campaign.ts',
      'src/core/automation/development-campaign.ts',
    ]) {
      expect(existsSync(join(REPO_ROOT, path))).toBe(true);
    }
  });

  test('external_sources.mode is off, which is the campaign hard precondition', () => {
    const policy = JSON.parse(readFileSync(join(REPO_ROOT, '.ai/harness/policy.json'), 'utf-8')) as {
      readonly external_sources: { readonly version: number; readonly mode: string };
    };
    expect(policy.external_sources).toEqual({ version: 1, mode: 'off' });
  });
});

describe('BRC0 protected capabilities', () => {
  const PROTECTED = JSON.parse(readFileSync(join(FIXTURES, 'protected-capabilities.json'), 'utf-8')) as {
    readonly capabilities: readonly { readonly capability_id: string; readonly reason: string }[];
    readonly unmapped_surfaces: readonly { readonly paths: readonly string[]; readonly reason: string }[];
    readonly unmapped_closure: { readonly roots: readonly string[]; readonly exempt_paths: readonly string[] };
    readonly installed_capability: { readonly capability_id: string; readonly node_file: string };
  };

  test('every protected capability id resolves to a real archcontext node', () => {
    expect(PROTECTED.capabilities.length).toBeGreaterThan(0);
    for (const entry of PROTECTED.capabilities) {
      const node = join(REPO_ROOT, '.archcontext/model/nodes', `${entry.capability_id}.yaml`);
      expect(existsSync(node)).toBe(true);
      expect(readFileSync(node, 'utf-8')).toContain(`id: ${entry.capability_id}`);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  test('every unmapped protected surface exists and is still owned by no capability include glob', () => {
    const includeGlobs = readdirSync(join(REPO_ROOT, '.archcontext/model/nodes'))
      .filter((entry) => entry.startsWith('capability.'))
      .flatMap((entry) => {
        const text = readFileSync(join(REPO_ROOT, '.archcontext/model/nodes', entry), 'utf-8');
        const block = /^source:\n(?:.*\n)*?^ {2}include:\n((?: {4}- .*\n)+)/m.exec(text);
        if (!block) return [] as string[];
        return block[1]!.split('\n').filter(Boolean).map((line) => line.trim().replace(/^- /, '').replace(/^"|"$/g, ''));
      });
    const covers = (glob: string, path: string): boolean => {
      if (glob === path) return true;
      if (glob.endsWith('/**')) return path.startsWith(glob.slice(0, -2));
      return false;
    };
    for (const surface of PROTECTED.unmapped_surfaces) {
      expect(surface.reason.length).toBeGreaterThan(0);
      for (const path of surface.paths) {
        expect(existsSync(join(REPO_ROOT, path))).toBe(true);
        expect(includeGlobs.filter((glob) => covers(glob, path))).toEqual([]);
      }
    }
  });

  test('the unmapped protected inventory closes every state and publication directory', () => {
    const walk = (root: string): string[] => readdirSync(join(REPO_ROOT, root), { withFileTypes: true }).flatMap((entry) => {
      const path = `${root}/${entry.name}`;
      return entry.isDirectory() ? walk(path) : [path];
    });
    const protectedPaths = PROTECTED.unmapped_surfaces.flatMap((surface) => surface.paths)
      .filter((path) => PROTECTED.unmapped_closure.roots.some((root) => path.startsWith(`${root}/`)));
    const accounted = [...protectedPaths, ...PROTECTED.unmapped_closure.exempt_paths].sort();
    const actual = PROTECTED.unmapped_closure.roots.flatMap(walk).sort();
    expect(accounted).toEqual(actual);
  });

  test('the campaign capability node is installed and protected against itself', () => {
    expect(existsSync(join(REPO_ROOT, '.archcontext/model/nodes', PROTECTED.installed_capability.node_file))).toBe(true);
    expect(PROTECTED.installed_capability.capability_id).toBe('capability.runtime-harness.development-campaign');
  });
});

describe('BRC0 architecture request', () => {
  const CARD = join(REPO_ROOT, 'docs/architecture/requests/archive/2026/runtime-harness-development-campaign.md');

  test('the drift request declares the campaign boundary', () => {
    expect(existsSync(CARD)).toBe(true);
    const text = readFileSync(CARD, 'utf-8');
    for (const field of ['**Severity**', '**Change Type**', '**Capability ID**', '**Architecture Domain**', '**Architecture Capability**']) {
      expect(text).toContain(field);
    }
    expect(text).toContain('runtime-harness-development-campaign');
    expect(text).toContain('planned-boundary-change');
    expect(text).toContain('src/core/automation/development-campaign.ts');
    expect(dirname(CARD).endsWith('docs/architecture/requests/archive/2026')).toBe(true);
  });

  test('the boundary declaration names the planned entrypoints and the consumed capabilities', () => {
    const snapshot = join(REPO_ROOT, 'docs/architecture/snapshots/2026-09-03-development-campaign-boundary-declaration.md');
    expect(existsSync(snapshot)).toBe(true);
    const text = readFileSync(snapshot, 'utf-8');
    for (const entrypoint of [
      'src/core/automation/development-campaign.ts',
      'src/effects/automation/*',
      'src/cli/commands/campaign.ts',
    ]) {
      expect(text).toContain(entrypoint);
    }
    for (const consumed of [
      'capability.runtime-harness.engineer-scheduling',
      'capability.runtime-harness.collaboration',
      'capability.runtime-harness.external-source-intake',
      'capability.runtime-harness.integration-acceptance',
    ]) {
      expect(text).toContain(consumed);
    }
    expect(text).toContain('> **Status**: Accepted');
  });
});

/**
 * The re-baseline's own falsifier.
 *
 * The freeze above pins bytes the campaign is designed against; this pins the
 * one migration fact the campaign depends on -- that #283 preserved identity
 * rather than reassigning it. If the migrated sprint's `ID` cells ever stop
 * matching the ids recorded in its migration receipt, every Lease, message and
 * binding minted before the migration is pointing at a task that no longer
 * exists, and the acceptance the owner gave for this re-baseline was given
 * against a different fact.
 */
describe('BRC0 re-baseline: the campaign sprint kept its pre-migration identities', () => {
  const CAMPAIGN_SPRINT = 'plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md';
  const CAMPAIGN_RECEIPT = 'plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.schema-migration.v1.json';

  // The values the pre-migration derivation produced, pinned as literals so the
  // assertion cannot drift by reading a rewritten receipt.
  const ROW_1_ID = '23d385b0f0410137fe33517b757689d02fb1741cb495e9a7b6c4262930a81907';
  const ROW_5_ID = '9e7090269d9d457155983885ef1cfea64fc606bfcbfd01d81d3d6a971e18aa29';

  test('rows 1 and 5 carry the exact ids the migration receipt recorded', () => {
    const receipt = JSON.parse(readFileSync(join(REPO_ROOT, CAMPAIGN_RECEIPT), 'utf-8')) as {
      readonly from_schema: number;
      readonly to_schema: number;
      readonly sprint_path: string;
      readonly tasks: readonly { readonly row_index: string; readonly task_id: string }[];
    };
    expect(receipt.from_schema).toBe(1);
    expect(receipt.to_schema).toBe(2);
    expect(receipt.sprint_path).toBe(CAMPAIGN_SPRINT);

    const byRow = new Map(receipt.tasks.map((task) => [task.row_index, task.task_id]));
    expect(byRow.get('1')).toBe(ROW_1_ID);
    expect(byRow.get('5')).toBe(ROW_5_ID);

    // And the sprint on disk agrees with the receipt, row for row.
    const projected = projectCanonicalTasks({
      repoIdentity: 'repo_00000000000000c0',
      sprintPath: CAMPAIGN_SPRINT,
      sprintText: readFileSync(join(REPO_ROOT, CAMPAIGN_SPRINT), 'utf-8'),
    });
    expect(projected[0]!.task_id).toBe(ROW_1_ID);
    expect(projected[4]!.task_id).toBe(ROW_5_ID);
    expect(projected.map((task) => task.task_id))
      .toEqual(receipt.tasks.map((task) => task.task_id));
  });
});
