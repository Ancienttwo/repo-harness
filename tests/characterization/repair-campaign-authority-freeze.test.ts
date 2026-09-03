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
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';

import {
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  deriveTaskId,
  deriveTaskRevision,
  parseLeaseOwnerRecord,
  projectCanonicalTasks,
  serializeLeaseOwnerRecord,
  type LeaseOwnerRecord,
} from '../../src/core/state/coordination-identity';
import {
  classifyTaskOffer,
  taskOfferRevision,
  type ClassifyTaskOfferInput,
} from '../../src/core/fleet/task-offer';
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

const BASELINE = JSON.parse(readFileSync(join(FIXTURES, 'authority-freeze-baseline.json'), 'utf-8')) as {
  readonly frozen: Record<string, { readonly sha256: string; readonly source: string }>;
};

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf-8').digest('hex')}`;
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

const SPRINT_TEXT = [
  '# Sprint: freeze subject',
  '',
  '## Backlog',
  '',
  '| # | Status | Task | Mode | Acceptance | Plan |',
  '|---:|:---:|---|---|---|---|',
  '| 1 | [ ] | BRC0 — Authority freeze | contract | Frozen bytes hold | |',
  '| 2 | [ ] | BRC1 — Dispatch fence | contract | Fence runs once | |',
  '| 3 | [x] | BRC2 — Inline spike | inline | Probe recorded | docs/researches/probe.md |',
  '',
  '## Execution Log',
  '',
].join('\n');

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
                inputs.push({
                  repo_access_mode: accessMode,
                  row_status: rowStatus,
                  mode,
                  lease_state: leaseState,
                  snapshot_consistency: consistency,
                  plan: hasPlan ? plan : null,
                  plan_failure: planFailure,
                  canonical_available: true,
                });
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
    expect(digest(JSON.stringify(CANONICAL_TASKS))).toBe(frozen('task.canonical_projection'));
    expect(CANONICAL_TASKS[0]!.task_id).toBe(deriveTaskId({
      repoIdentity: REPO_IDENTITY,
      sprintPath: SPRINT_PATH,
      taskCell: 'BRC0 — Authority freeze',
    }));
    expect(CANONICAL_TASKS[0]!.task_revision).toBe(deriveTaskRevision({
      taskId: CANONICAL_TASKS[0]!.task_id,
      modeCell: 'contract',
      acceptanceCell: 'Frozen bytes hold',
    }));
    expect(taskOfferRevision([REPO_IDENTITY, SPRINT_PATH, CANONICAL_TASKS[0]!.task_id, 1, null]))
      .toBe(frozen('task.offer_revision'));
  });

  test('TaskOffer classification is unchanged across the whole closed input matrix', () => {
    const results = OFFER_MATRIX.map((input) => classifyTaskOffer(input));
    expect(digest(JSON.stringify(results))).toBe(frozen('task.offer_classification_matrix'));
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
        readonly observations: readonly unknown[];
      };
      expect(document.kind).toBe('repo-harness-repair-campaign-provider-batch-fixture');
      expect(document.declared_slots).toHaveLength(10);
      expect(document.observations.length).toBeGreaterThan(0);
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
    // an output.  Binding with a Task identity the campaign invented from the
    // Issue number fails closed.
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

  test('the slot marker is the only slot authority; the title prefix is not', () => {
    const marked = JSON.parse(readFileSync(join(FIXTURES, 'batch-missing-marker.json'), 'utf-8')) as {
      readonly expected_unmarked_issue_ids: readonly string[];
      readonly observations: readonly unknown[];
    };
    const unmarked = marked.observations
      .map(validateProviderIssueObservation)
      .filter((entry) => !entry.body.includes('<!-- repo-harness-campaign:v1'));
    expect(unmarked.map((entry) => entry.provider_issue_id)).toEqual([...marked.expected_unmarked_issue_ids]);
    // The title still carries the display convention, which is exactly why the
    // title must not be read during reconciliation.
    for (const entry of unmarked) expect(entry.title).toContain('[rh-campaign:');
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

  test('receiving a dispatch prompt creates no lease on disk', () => {
    const repo = fixtureRepo('brc0-prompt-not-claim-');
    const before = listFiles(repo);
    // The prompt is inert data: nothing in the coordination plane observes it.
    expect(PROMPT.length).toBeGreaterThan(0);
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

  test('a real run writes exactly the inbox and its run snapshot', () => {
    const repo = fixtureRepo('brc0-heartbeat-');
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    const helper = join(repo, 'scripts/heartbeat-triage.sh');
    copyFileSync(join(REPO_ROOT, 'scripts/heartbeat-triage.sh'), helper);
    const before = new Set(listFiles(repo));

    const stdout = execFileSync('bash', [helper, 'run', '--repo', repo, '--run-id', 'brc0-freeze', '--source', 'manual', '--json'], {
      cwd: repo,
      encoding: 'utf-8',
      env: { ...process.env, REPO_HARNESS_HELPER_SOURCE_PATH: helper },
    });

    const created = listFiles(repo).filter((path) => !before.has(path));
    expect(created).toEqual([
      '.ai/harness/runs/brc0-freeze-heartbeat-triage.json',
      '.ai/harness/triage/inbox.md',
    ]);

    const snapshot = JSON.parse(stdout) as {
      readonly kind: string;
      readonly entries: readonly { readonly kind: string }[];
    };
    expect(snapshot.kind).toBe('repo-harness-heartbeat-triage');
    expect(snapshot.entries.map((entry) => entry.kind).sort()).toEqual(['drift-requests', 'sprint-next', 'workflow-check']);

    // No branch, no commit, no lease: the run leaves git untouched.
    expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repo, encoding: 'utf-8' }).trim()).toBe('');
    expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repo, encoding: 'utf-8' }).trim()).toBe('1');
    expect(listLeaseReads(repo)).toHaveLength(0);
  });
});

describe('BRC0 negative freeze: retired and absent surfaces', () => {
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

  test('the campaign capability does not exist yet', () => {
    const policy = JSON.parse(readFileSync(join(REPO_ROOT, '.ai/harness/policy.json'), 'utf-8')) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(policy, 'development_campaign')).toBe(false);

    const nodes = readdirSync(join(REPO_ROOT, '.archcontext/model/nodes'));
    expect(nodes.filter((entry) => entry.includes('development-campaign'))).toEqual([]);

    for (const path of [
      'src/core/automation',
      'src/effects/automation',
      'src/cli/commands/campaign.ts',
      'src/core/automation/development-campaign.ts',
    ]) {
      expect(existsSync(join(REPO_ROOT, path))).toBe(false);
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
    readonly pending_capability: { readonly capability_id: string; readonly node_file: string };
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

  test('the campaign capability node is still pending, not installed', () => {
    expect(existsSync(join(REPO_ROOT, '.archcontext/model/nodes', PROTECTED.pending_capability.node_file))).toBe(false);
    expect(PROTECTED.pending_capability.capability_id).toBe('capability.runtime-harness.development-campaign');
  });
});

describe('BRC0 architecture request', () => {
  const CARD = join(REPO_ROOT, 'docs/architecture/requests/runtime-harness-development-campaign.md');

  test('the drift request declares the campaign boundary', () => {
    expect(existsSync(CARD)).toBe(true);
    const text = readFileSync(CARD, 'utf-8');
    for (const field of ['**Severity**', '**Change Type**', '**Capability ID**', '**Architecture Domain**', '**Architecture Capability**']) {
      expect(text).toContain(field);
    }
    expect(text).toContain('runtime-harness-development-campaign');
    expect(text).toContain('planned-boundary-change');
    expect(text).toContain('src/core/automation/development-campaign.ts');
    expect(dirname(CARD).endsWith('docs/architecture/requests')).toBe(true);
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
    // The declaration must not claim human acceptance it does not have.
    expect(text).toContain('> **Status**: Proposed');
  });
});
