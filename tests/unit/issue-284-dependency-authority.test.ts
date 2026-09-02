import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { canonicalEngineerJson, engineerSha256 } from '../../src/core/engineers/profile-binding';
import {
  WORK_PACKAGE_DEPENDENCY_STATES,
  projectWorkGraph,
  validateWorkGraph,
  type ProjectedWorkGraphV1,
  type ProjectedWorkPackageV1,
  type WorkPackageDependencyState,
  type WorkPackageDependencyV1,
} from '../../src/core/engineers/scheduling';
import {
  buildPublicationIntegrationObservation,
  canonicalPublicationIntegrationObservationBytes,
  publicationPointerFromReceipt,
} from '../../src/core/publication/publication-lifecycle';
import {
  buildPublicationReceipt,
  publicationReceiptDigest,
  publicationSha256,
} from '../../src/core/publication/publication-receipt';
import {
  beginLeaseCompletionRecord,
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  enterReviewingLeaseRecord,
  projectCanonicalTasks,
} from '../../src/core/state/coordination-identity';
import {
  resolveDependencyAuthority,
  type DependencyAuthorityInput,
  type DependencyAuthorityReaders,
  type DependencyAuthorityRepositoryRead,
} from '../../src/effects/engineers/dependency-authority';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import {
  createAcceptanceMatrix,
  createIntegrationContract,
  createIntegrationEnvelope,
  createProductAcceptanceProjection,
  listProductAcceptanceProjections,
} from '../../src/effects/integration/product-acceptance';
import { readPublicationIntegrationObservations } from '../../src/effects/publication/publication-lifecycle';
import { writePublicationReceiptCache } from '../../src/effects/publication/publication-receipt';
import {
  createLeaseDirectory,
  writeLeaseOwnerDurably,
} from '../../src/effects/state/coordination-lease-store';
import {
  collectEngineerOffers,
  type EngineerSchedulingDependencies,
} from '../../src/effects/engineers/scheduling';
import { acquireScheduledEngineerTask } from '../../src/effects/engineers/scheduling-acquire';
import type { EngineerPrincipalV1 } from '../../src/core/engineers/principal-claim';
import type { RepoHarnessRegisteredRepo, RepoHarnessRegistrySnapshot } from '../../src/effects/repo-registry';
import {
  CONSUMED_RECEIPT_KEYS,
  acceptanceReceiptPath,
  authorityFingerprint,
  userWaiverGrantPath,
  validateAcceptanceReceiptAgainstPolicy,
  type AcceptanceReceipt,
  type UserWaiverGrant,
} from '../../scripts/acceptance-receipt';

const REPO_ID = 'repo_0123456789abcdef';
const OTHER_REPO_ID = 'repo_fedcba9876543210';
const CAPABILITY = 'capability.workflow-engine.contract-assets';
const SPRINT = 'plans/sprints/demo.sprint.md';
const CONTRACT_REF = 'tasks/contracts/wp-a.contract.md';
const PRD_REF = 'plans/prds/product.md';
const GOAL_REF = 'plans/plan-wp-a.md';
const CONTRACT_NO_WAIVER_REF = 'tasks/contracts/wp-a-sealed.contract.md';
const OWNER = 'ancienttwo';
const CONTRACT_TEXT = [
  '# Task Contract: wp-a',
  '',
  '> **Status**: Active',
  `> **Owner**: ${OWNER}`,
  '',
  '## Goal',
  '',
  'Deliver wp-a.',
  '',
  '## Acceptance Policy',
  '',
  '```json',
  '{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}',
  '```',
  '',
].join('\n');
const CONTRACT_NO_WAIVER_TEXT = CONTRACT_TEXT
  .replace('# Task Contract: wp-a', '# Task Contract: wp-a (sealed)')
  .replace('"user_waiver":"allowed"', '"user_waiver":"forbidden"');
const GOAL_TEXT = '# Plan: wp-a\n\n> **Status**: Approved\n\n## Approach\n\nDeliver wp-a.\n';
const PRD_TEXT = '# Product\n\n> **Status**: Approved\n';
const POLICY_BYTES = '{"policy":1}\n';
const ROLLBACK_A = '{"rollback":"a"}\n';
const ROLLBACK_B = '{"rollback":"b"}\n';
const SPRINT_TEXT = `# Sprint: demo

## Backlog

| # | Status | Task | Mode | Acceptance | Plan |
|---|---|---|---|---|---|
| 1 | [x] | task A | contract | accepted A | (pending) |
| 2 | [ ] | task B | contract | accepted B | (pending) |

## Execution Log
`;

const roots: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function writeRepoFile(root: string, relative: string, content: string): void {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function moduleAuthority(revision = engineerSha256(CONTRACT_TEXT)): WorkPackageDependencyV1['acceptance_authority'] {
  return { authority_kind: 'module_acceptance', subject_ref: CONTRACT_REF, subject_revision: revision };
}

function moduleAuthorityFor(ref: string, text: string): WorkPackageDependencyV1['acceptance_authority'] {
  return { authority_kind: 'module_acceptance', subject_ref: ref, subject_revision: engineerSha256(text) };
}

function productAuthority(revision = engineerSha256(PRD_TEXT)): WorkPackageDependencyV1['acceptance_authority'] {
  return { authority_kind: 'product_acceptance', subject_ref: PRD_REF, subject_revision: revision };
}

function dependency(state: WorkPackageDependencyState, repositoryId = REPO_ID): WorkPackageDependencyV1 {
  return {
    repository_id: repositoryId,
    work_package_id: 'wp-a',
    required_state: state,
    acceptance_authority: state === 'module_accepted'
      ? moduleAuthority()
      : state === 'product_accepted' ? productAuthority() : null,
  };
}

function workGraphJson(state: WorkPackageDependencyState = 'canonical_done', repositoryId = REPO_ID): unknown {
  const definition = (id: string, taskRef: string, dependsOn: unknown[]) => ({
    work_package_id: id,
    task_ref: taskRef,
    primary_capability: CAPABILITY,
    depends_on: dependsOn,
    priority: id === 'wp-b' ? 90 : 10,
    concurrency: { scope: 'repo', key: id },
    execution_surface: 'contract',
    integration_group: null,
    required_acceptance: [{
      gate: 'module',
      policy_id: 'module-default',
      policy_ref: 'plans/policies/module.json',
      policy_revision: engineerSha256(POLICY_BYTES),
    }],
    rollback_boundary: {
      kind: 'work_package',
      boundary_id: `${repositoryId}:${id}`,
      boundary_ref: `plans/rollback/${id}.json`,
      boundary_revision: engineerSha256(id === 'wp-a' ? ROLLBACK_A : ROLLBACK_B),
    },
  });
  return {
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: repositoryId,
    sprint_path: SPRINT,
    lane: 'engineering-v2',
    work_packages: [
      definition('wp-a', 'task A', []),
      definition('wp-b', 'task B', [dependency(state, repositoryId)]),
    ],
  };
}

interface Fixture {
  readonly root: string;
  readonly commit: string;
  readonly graph: ProjectedWorkGraphV1;
  readonly target: ProjectedWorkPackageV1;
  readonly registry: RepoHarnessRegistrySnapshot;
  readonly repo: RepoHarnessRegisteredRepo;
  readonly reads: readonly DependencyAuthorityRepositoryRead[];
  readonly identity: string;
}

function repository(id: string, path: string, accessMode: RepoHarnessRegisteredRepo['accessMode'] = 'read_write'): RepoHarnessRegisteredRepo {
  return {
    id,
    path,
    accessMode,
    source: 'adopted' as RepoHarnessRegisteredRepo['source'],
    registeredAt: '2026-09-02T00:00:00.000Z',
    lastSeenAt: '2026-09-02T00:00:00.000Z',
  };
}

function projectFixtureGraph(root: string, sprintText = SPRINT_TEXT, repositoryId = REPO_ID): ProjectedWorkGraphV1 {
  const tasks = projectCanonicalTasks({
    repoIdentity: realpathSync(resolveGitCommonDirectory(root)),
    sprintPath: SPRINT,
    sprintText,
  }).map((task, index) => ({
    task_id: task.task_id,
    task_revision: task.task_revision,
    task_ref: task.row.task,
    status: task.row.status,
    row_order: index + 1,
  }));
  return projectWorkGraph(validateWorkGraph(workGraphJson('canonical_done', repositoryId)), tasks);
}

function fixture(): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'issue-284-')));
  roots.push(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Issue 284');
  git(root, 'config', 'user.email', 'issue284@test.invalid');
  writeRepoFile(root, SPRINT, SPRINT_TEXT);
  writeRepoFile(root, 'plans/sprints/demo.work-graph.v1.json', `${JSON.stringify(workGraphJson(), null, 2)}\n`);
  writeRepoFile(root, 'plans/policies/module.json', POLICY_BYTES);
  writeRepoFile(root, 'plans/rollback/wp-a.json', ROLLBACK_A);
  writeRepoFile(root, 'plans/rollback/wp-b.json', ROLLBACK_B);
  writeRepoFile(root, CONTRACT_REF, CONTRACT_TEXT);
  writeRepoFile(root, CONTRACT_NO_WAIVER_REF, CONTRACT_NO_WAIVER_TEXT);
  writeRepoFile(root, GOAL_REF, GOAL_TEXT);
  writeRepoFile(root, PRD_REF, PRD_TEXT);
  writeRepoFile(root, 'docs/spec.md', '# Source spec\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  const commit = git(root, 'rev-parse', 'HEAD');
  const graph = projectFixtureGraph(root);
  const repo = repository(REPO_ID, root);
  const registry: RepoHarnessRegistrySnapshot = {
    registryPath: join(root, 'registry.json'),
    authorizationRevision: 3,
    repos: [repo],
  };
  return {
    root,
    commit,
    graph,
    target: graph.work_packages.find((item) => item.work_package_id === 'wp-a')!,
    registry,
    repo,
    reads: [{ repo, commit, graph }],
    identity: publicationSha256(realpathSync(resolveGitCommonDirectory(root))),
  };
}

/**
 * Moves the target and the projected graph member together. The resolver
 * requires the target to be the exact graph member its edge names, so a test
 * that moves only one of the two would be exercising the pairing guard rather
 * than the state it means to exercise.
 */
function retargeted(
  subject: Fixture,
  patch: Partial<ProjectedWorkPackageV1>,
): Pick<DependencyAuthorityInput, 'target' | 'reads'> {
  const target = Object.freeze({ ...subject.target, ...patch }) as ProjectedWorkPackageV1;
  const graph: ProjectedWorkGraphV1 = Object.freeze({
    ...subject.graph,
    work_packages: Object.freeze(subject.graph.work_packages.map((item) => (
      item.work_package_id === target.work_package_id ? target : item
    ))),
  });
  return { target, reads: [{ repo: subject.repo, commit: subject.commit, graph }] };
}

function gitShow(root: string, commit: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, encoding: 'utf8' });
  } catch {
    return null;
  }
}

function input(
  subject: Fixture,
  state: WorkPackageDependencyState,
  overrides: Partial<DependencyAuthorityInput> = {},
): DependencyAuthorityInput {
  return {
    dependency: dependency(state),
    target: subject.target,
    reads: subject.reads,
    registry: subject.registry,
    env: { HOME: subject.root },
    readFileAtCommit: (repoRoot, commit, path) => gitShow(repoRoot, commit, path),
    readers: { readCanonicalTargetRef: () => 'main' },
    ...overrides,
  };
}

function acceptanceReceipt(subject: Fixture, overrides: Partial<AcceptanceReceipt> = {}): AcceptanceReceipt {
  return {
    protocol: 2,
    kind: 'repo-harness-acceptance-receipt',
    repository_root: subject.root,
    contract_file: CONTRACT_REF,
    contract_sha256: authorityFingerprint(CONTRACT_TEXT),
    goal_file: GOAL_REF,
    goal_sha256: authorityFingerprint(GOAL_TEXT),
    verification_file: '.ai/harness/checks/latest.json',
    verification_evidence_sha256: `sha256:${'c'.repeat(64)}`,
    benchmark_evidence_sha256: 'not-applicable',
    subject_sha256: `sha256:${'d'.repeat(64)}`,
    subject_scope: 'normalized-final-content',
    target_ref: 'main',
    target_revision: subject.commit,
    reviewed_paths: ['src/effects/engineers/dependency-authority.ts'],
    disposition: 'external_pass',
    expected_reviewer: 'Codex',
    reviewer: 'Codex',
    source: 'codex-review',
    actor: null,
    summary: 'accepted wp-a',
    findings: [],
    waiver_grant_sha256: null,
    issued_at: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

/** Writes the receipt through the real authority path so the real validator reads it. */
function writeAcceptanceReceipt(subject: Fixture, receipt: AcceptanceReceipt, authorityHome = subject.root): void {
  const path = acceptanceReceiptPath(subject.root, authorityHome, true);
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
}

function waiverGrant(subject: Fixture, overrides: Partial<UserWaiverGrant> = {}): UserWaiverGrant {
  return {
    protocol: 1,
    kind: 'repo-harness-user-waiver-grant',
    repository_root: subject.root,
    contract_file: CONTRACT_REF,
    contract_sha256: authorityFingerprint(CONTRACT_TEXT),
    goal_file: GOAL_REF,
    goal_sha256: authorityFingerprint(GOAL_TEXT),
    actor: OWNER,
    scope: 'contract-authority',
    summary: 'owner waived wp-a',
    issued_at: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

function writeWaiverGrant(subject: Fixture, grant: UserWaiverGrant): void {
  writeFileSync(userWaiverGrantPath(subject.root, subject.root, true), `${JSON.stringify(grant, null, 2)}\n`);
}

function waivedReceipt(subject: Fixture, grant: UserWaiverGrant, overrides: Partial<AcceptanceReceipt> = {}): AcceptanceReceipt {
  return acceptanceReceipt(subject, {
    disposition: 'user_waiver',
    reviewer: 'User',
    source: 'user-waiver',
    actor: OWNER,
    summary: grant.summary,
    waiver_grant_sha256: engineerSha256(stableJson(grant)),
    ...overrides,
  });
}

/** Mirrors scripts/acceptance-receipt.ts#stableJson so the fingerprint matches. */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function reviewingPublication(subject: Fixture, head: string, base: string, number: number): ReturnType<typeof buildPublicationReceipt> {
  const receipt = buildPublicationReceipt({
    repo_id: subject.identity,
    task_id: subject.target.task_id,
    task_revision: subject.target.task_revision,
    claim_id: `claim-${number}`,
    generation: 1,
    target_ref: 'main',
    base_sha: base,
    branch: 'main',
    head_sha: head,
    tree_sha: git(subject.root, 'rev-parse', `${head}^{tree}`),
    review_subject_sha256: `sha256:${'5'.repeat(64)}`,
    verification_evidence_sha256: `sha256:${'6'.repeat(64)}`,
    merge_seal_sha256: `sha256:${'7'.repeat(64)}`,
    provider: 'github',
    provider_repo_id: 'R_issue284',
    pr_number: number,
    pr_url: `https://example.invalid/pr/${number}`,
    created_at: `2026-09-02T00:00:0${number}Z`,
  });
  writePublicationReceiptCache(subject.root, receipt);
  const owner = buildLeaseOwnerRecord({
    claimId: `claim-${number}`,
    taskId: subject.target.task_id,
    taskRevision: subject.target.task_revision,
    sprintPath: SPRINT,
    targetRef: 'main',
    generation: 1,
    sessionId: `session-${number}`,
    sourceWorktree: subject.root,
  });
  const bound = bindLeaseRecord(owner, {
    claimId: owner.claim_id,
    executionWorktree: subject.root,
    branch: 'main',
    unitRef: `plans/plan-${number}.md`,
  });
  if (!bound.ok) throw new Error(bound.error);
  const completing = beginLeaseCompletionRecord(bound.record, {
    claimId: owner.claim_id,
    executionWorktree: subject.root,
    finishTransactionKey: null,
  });
  if (!completing.ok) throw new Error(completing.error);
  const reviewing = enterReviewingLeaseRecord(completing.record, {
    claimId: owner.claim_id,
    publication: publicationPointerFromReceipt(receipt, `ship-${number}`),
  });
  if (!reviewing.ok) throw new Error(reviewing.error);
  if (!createLeaseDirectory(subject.root, subject.target.task_id)) throw new Error('lease election failed');
  writeLeaseOwnerDurably(subject.root, subject.target.task_id, reviewing.record);
  return receipt;
}

/** Persists an integration observation exactly where the publication authority stores it. */
function persistObservation(
  subject: Fixture,
  receipt: ReturnType<typeof buildPublicationReceipt>,
  overrides: { readonly task_revision?: string } = {},
): ReturnType<typeof buildPublicationIntegrationObservation> {
  const observation = buildPublicationIntegrationObservation({
    publication_id: receipt.publication_id,
    receipt_sha256: publicationReceiptDigest(receipt),
    task_id: receipt.task_id,
    task_revision: overrides.task_revision ?? receipt.task_revision,
    claim_id: receipt.claim_id,
    generation: receipt.generation,
    head_sha: receipt.head_sha,
    target_ref: receipt.target_ref,
    fetched_target_oid: receipt.head_sha,
    observation_ref: `refs/repo-harness/observations/publication/${receipt.publication_id.slice('sha256:'.length)}/${receipt.head_sha}`,
    provider_pr_number: receipt.pr_number,
    provider_state: 'MERGED',
    provider_merged_at: '2026-09-02T00:00:00Z',
    integration_state: 'merged',
  });
  const path = join(
    resolveGitCommonDirectory(subject.root),
    'repo-harness/publications/v1/integration',
    observation.publication_id.slice('sha256:'.length),
    `${observation.observation_id.slice('sha256:'.length)}.json`,
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${canonicalPublicationIntegrationObservationBytes(observation)}\n`);
  return observation;
}

const ENGINEER = `engineer:${CAPABILITY}`;
const CONTRACT_REVISION = `sha256:${'a'.repeat(64)}`;
const BINDING = '11111111-1111-4111-8111-111111111111';

function principal(): EngineerPrincipalV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-engineer-principal',
    repository_id: REPO_ID,
    engineer_id: ENGINEER,
    binding_id: BINDING,
    binding_generation: 1,
    engineer_contract_revision: CONTRACT_REVISION,
    carrier: 'mcp_oauth',
    auth_subject: '22222222-2222-4222-8222-222222222222',
    provider: 'unknown',
    provider_thread_id: null,
  };
}

function schedulingDependencies(subject: Fixture, state: WorkPackageDependencyState): Partial<EngineerSchedulingDependencies> {
  const carrier = `${JSON.stringify(workGraphJson(state), null, 2)}\n`;
  const identity = realpathSync(resolveGitCommonDirectory(subject.root));
  const taskB = subject.graph.work_packages.find((item) => item.work_package_id === 'wp-b')!;
  return {
    readRegistry: () => subject.registry,
    readActiveSprintPath: () => SPRINT,
    readCanonicalTargetRef: () => 'main',
    readCanonicalSprint: () => ({ ok: true, commit: subject.commit, text: SPRINT_TEXT }),
    readFileAtCommit: (repoRoot, commit, path) => (
      path.endsWith('.work-graph.v1.json') ? carrier : gitShow(repoRoot, commit, path)
    ),
    repoIdentity: () => identity,
    resolveCapability: () => ({ capability: {} as never, capability_revision: CONTRACT_REVISION }) as never,
    loadProfile: () => ({
      profile: { engineer_id: ENGINEER, capability_id: CAPABILITY, max_active_claims: 2 },
      engineer_contract_revision: CONTRACT_REVISION,
    }) as never,
    readBinding: () => ({
      current: { state: 'active', current_binding_id: BINDING, binding_generation: 1 },
      binding: {}, event: {}, genesis: false,
    }) as never,
    collectFleetOffers: () => ({
      protocol: 1,
      kind: 'repo-harness-fleet-offers',
      authorization_revision: 3,
      snapshot_consistency: 'stable',
      offer_revision: `sha256:${'b'.repeat(64)}`,
      offers: [{
        repo_id: REPO_ID,
        task_id: taskB.task_id,
        task_revision: taskB.task_revision,
        execution_readiness: 'execution_ready',
        snapshot_consistency: 'stable',
        offer_revision: `sha256:${'c'.repeat(64)}`,
        authorization_revision: 3,
      }],
    }) as never,
    listLiveClaims: () => [],
    dependencyReaders: { resolveAuthorityHome: () => subject.root },
  };
}

function offers(subject: Fixture, state: WorkPackageDependencyState) {
  return collectEngineerOffers({
    repo_root: subject.root,
    principal: principal(),
    registry_snapshot: subject.registry,
    dependencies: schedulingDependencies(subject, state),
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('issue #284 closed dependency authority', () => {
  test('every declared dependency state has an adapter and no state falls through', () => {
    expect([...WORK_PACKAGE_DEPENDENCY_STATES].sort()).toEqual([
      'canonical_done', 'module_accepted', 'product_accepted', 'publication_integrated',
    ]);
    const subject = fixture();
    for (const state of WORK_PACKAGE_DEPENDENCY_STATES) {
      const resolved = resolveDependencyAuthority(input(subject, state));
      expect(['satisfied', 'unsatisfied', 'authority_unavailable']).toContain(resolved.status);
      expect(resolved.status === 'authority_unavailable'
        ? resolved.authority_revision === null
        : /^sha256:[0-9a-f]{64}$/u.test(String(resolved.authority_revision))).toBe(true);
    }
    expect(() => resolveDependencyAuthority(input(subject, 'canonical_done', {
      dependency: { ...dependency('canonical_done'), required_state: 'ledger_closed' as WorkPackageDependencyState },
    }))).toThrow('unsupported dependency state has no authority adapter');
  });

  test('canonical_done resolves positive, negative, unavailable and stale evidence', () => {
    const subject = fixture();
    const ready = resolveDependencyAuthority(input(subject, 'canonical_done'));
    expect(ready.status).toBe('satisfied');
    expect(ready.evidence_refs.map((entry) => entry.ref))
      .toEqual([`canonical-task:${REPO_ID}:${subject.target.task_id}`]);

    const open = resolveDependencyAuthority(input(subject, 'canonical_done', {
      ...retargeted(subject, { task_status: '[ ]' }),
    }));
    expect(open.status).toBe('unsatisfied');
    expect(open.authority_revision).not.toBe(ready.authority_revision);

    const revoked = resolveDependencyAuthority(input(subject, 'canonical_done', {
      registry: { ...subject.registry, repos: [repository(REPO_ID, subject.root, 'read_only')] },
    }));
    expect(revoked.status).toBe('authority_unavailable');
    expect(revoked.authority_revision).toBeNull();

    const moved = resolveDependencyAuthority(input(subject, 'canonical_done', {
      ...retargeted(subject, { task_revision: 'f'.repeat(64) }),
    }));
    expect(moved.status).toBe('satisfied');
    expect(moved.authority_revision).not.toBe(ready.authority_revision);
  });

  test('module_accepted binds one exact AcceptanceReceipt subject', () => {
    const subject = fixture();
    expect(resolveDependencyAuthority(input(subject, 'module_accepted')).status).toBe('authority_unavailable');

    writeAcceptanceReceipt(subject, acceptanceReceipt(subject));
    const accepted = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(accepted.status).toBe('satisfied');
    expect(accepted.evidence_refs.map((entry) => entry.ref)).toContain(`acceptance-receipt:${subject.identity}`);
    expect(accepted.evidence_refs.map((entry) => entry.ref)).toContain(`acceptance-subject:${CONTRACT_REF}`);

    writeAcceptanceReceipt(subject, acceptanceReceipt(subject, {
      contract_file: 'tasks/contracts/other.contract.md',
    }));
    const otherSubject = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(otherSubject.status).toBe('unsatisfied');
    expect(otherSubject.authority_revision).not.toBe(accepted.authority_revision);

    writeAcceptanceReceipt(subject, acceptanceReceipt(subject, {
      disposition: 'reject',
      findings: [{ severity: 'P0', message: 'blocked' }],
    }));
    expect(resolveDependencyAuthority(input(subject, 'module_accepted')).status).toBe('unsatisfied');

    writeAcceptanceReceipt(subject, acceptanceReceipt(subject, { repository_root: join(subject.root, 'elsewhere') }));
    expect(resolveDependencyAuthority(input(subject, 'module_accepted')).status).toBe('unsatisfied');
  });

  test('module_accepted rejects a receipt bound to superseded contract bytes', () => {
    const subject = fixture();
    writeAcceptanceReceipt(subject, acceptanceReceipt(subject, {
      contract_sha256: authorityFingerprint('# Task Contract: wp-a\n\n> **Status**: Active\n\n## Goal\n\nSomething else.\n'),
    }));
    expect(resolveDependencyAuthority(input(subject, 'module_accepted')).status).toBe('unsatisfied');

    // A declared subject revision that no longer matches the committed bytes is
    // an unreadable authority, never a passing acceptance.
    writeAcceptanceReceipt(subject, acceptanceReceipt(subject));
    const staleDeclaration = resolveDependencyAuthority(input(subject, 'module_accepted', {
      dependency: { ...dependency('module_accepted'), acceptance_authority: moduleAuthority(`sha256:${'e'.repeat(64)}`) },
    }));
    expect(staleDeclaration.status).toBe('authority_unavailable');
    expect(staleDeclaration.authority_revision).toBeNull();
  });

  test('module_accepted authority_revision moves when the receipt bytes move', () => {
    const subject = fixture();
    writeAcceptanceReceipt(subject, acceptanceReceipt(subject));
    const before = resolveDependencyAuthority(input(subject, 'module_accepted'));
    writeAcceptanceReceipt(subject, acceptanceReceipt(subject, { summary: 'accepted wp-a again' }));
    const after = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(after.status).toBe('satisfied');
    expect(after.authority_revision).not.toBe(before.authority_revision);
  });

  test('publication_integrated needs the immutable observation, not a merged-looking Git state', () => {
    const subject = fixture();
    const base = subject.commit;
    writeRepoFile(subject.root, 'feature.txt', 'feature\n');
    git(subject.root, 'add', 'feature.txt');
    git(subject.root, 'commit', '-m', 'feature');
    const head = git(subject.root, 'rev-parse', 'HEAD');
    const receipt = reviewingPublication(subject, head, base, 1);

    const reviewing = resolveDependencyAuthority(input(subject, 'publication_integrated'));
    expect(reviewing.status).toBe('unsatisfied');
    expect(reviewing.evidence_refs.map((entry) => entry.ref))
      .toEqual([`publication-lease:${subject.target.task_id}`]);

    const observation = persistObservation(subject, receipt);
    expect(readPublicationIntegrationObservations(subject.root, subject.target.task_id, subject.target.task_revision))
      .toEqual([observation]);
    const integrated = resolveDependencyAuthority(input(subject, 'publication_integrated'));
    expect(integrated.status).toBe('satisfied');
    expect(integrated.evidence_refs.map((entry) => entry.ref))
      .toContain(`publication-integration-observation:${observation.observation_id}`);
    expect(integrated.authority_revision).not.toBe(reviewing.authority_revision);

    // The same observation no longer answers a moved task revision.
    const moved = resolveDependencyAuthority(input(subject, 'publication_integrated', {
      ...retargeted(subject, { task_revision: 'a'.repeat(64) }),
    }));
    expect(moved.status).toBe('unsatisfied');

    const unreadable = resolveDependencyAuthority(input(subject, 'publication_integrated', {
      readers: {
        readCanonicalTargetRef: () => 'main',
        readLease: () => { throw new Error('lease store unavailable'); },
      } as Partial<DependencyAuthorityReaders>,
    }));
    expect(unreadable.status).toBe('authority_unavailable');
    expect(unreadable.authority_revision).toBeNull();
  });

  test('publication_integrated rejects an observation whose receipt no longer matches', () => {
    const subject = fixture();
    const base = subject.commit;
    writeRepoFile(subject.root, 'feature.txt', 'feature\n');
    git(subject.root, 'add', 'feature.txt');
    git(subject.root, 'commit', '-m', 'feature');
    const head = git(subject.root, 'rev-parse', 'HEAD');
    const receipt = reviewingPublication(subject, head, base, 1);
    persistObservation(subject, receipt);
    const detached = resolveDependencyAuthority(input(subject, 'publication_integrated', {
      readers: {
        readCanonicalTargetRef: () => 'main',
        readPublicationReceipt: () => null,
      } as Partial<DependencyAuthorityReaders>,
    }));
    expect(detached.status).toBe('unsatisfied');
  });

  test('product_accepted needs an exact ME-4C projection and never reuses a module receipt', async () => {
    const subject = fixture();
    const base = subject.commit;
    writeRepoFile(subject.root, 'module-a.txt', 'A\n');
    writeRepoFile(subject.root, 'docs/evidence/constraint-a.json', '{"pass":true}\n');
    writeRepoFile(subject.root, 'docs/evidence/verifier.json', '{"verdict":"pass"}\n');
    git(subject.root, 'add', '.');
    git(subject.root, 'commit', '-m', 'candidate');
    const head = git(subject.root, 'rev-parse', 'HEAD');
    reviewingPublication(subject, head, base, 1);

    writeAcceptanceReceipt(subject, acceptanceReceipt(subject));
    expect(resolveDependencyAuthority(input(subject, 'module_accepted')).status).toBe('satisfied');
    const withoutProduct = resolveDependencyAuthority(input(subject, 'product_accepted'));
    expect(withoutProduct.status).toBe('unsatisfied');

    const contract = createIntegrationContract({ repo_root: subject.root }, {
      approved_prd_ref: PRD_REF,
      source_spec_ref: 'docs/spec.md',
      integration_group: 'issue-284',
      required_work_packages: [{
        work_package_id: subject.target.task_id,
        work_package_revision: subject.target.task_revision,
      }],
      required_constraints: ['constraint-a'],
    });
    const envelope = createIntegrationEnvelope({ repo_root: subject.root }, {
      contract_sha256: contract.contract_sha256,
      base_sha: base,
      final_head_sha: head,
    });
    const matrix = createAcceptanceMatrix({ repo_root: subject.root }, {
      contract_sha256: contract.contract_sha256,
      envelope_sha256: envelope.envelope_sha256,
      rows: [{ constraint_id: 'constraint-a', evidence_ref: 'docs/evidence/constraint-a.json', result: 'pass' }],
      verifier_receipt_ref: 'docs/evidence/verifier.json',
    });
    const receipt = acceptanceReceipt(subject, { target_revision: base });
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    const projection = await createProductAcceptanceProjection(
      { repo_root: subject.root, authority_home: subject.root },
      {
        contract_sha256: contract.contract_sha256,
        envelope_sha256: envelope.envelope_sha256,
        matrix_sha256: matrix.matrix_sha256,
      },
      { verify_acceptance: async () => receipt, read_acceptance_receipt_bytes: () => receiptBytes },
    );
    expect(listProductAcceptanceProjections(subject.root)).toEqual([projection]);

    const accepted = resolveDependencyAuthority(input(subject, 'product_accepted'));
    expect(accepted.status).toBe('satisfied');
    expect(accepted.evidence_refs.map((entry) => entry.ref))
      .toContain(`product-acceptance-projection:${projection.projection_sha256}`);
    expect(accepted.authority_revision).not.toBe(withoutProduct.authority_revision);

    const movedTarget = resolveDependencyAuthority(input(subject, 'product_accepted', {
      ...retargeted(subject, { task_revision: 'b'.repeat(64) }),
    }));
    expect(movedTarget.status).toBe('unsatisfied');

    const otherRequirement = resolveDependencyAuthority(input(subject, 'product_accepted', {
      dependency: {
        ...dependency('product_accepted'),
        acceptance_authority: { authority_kind: 'product_acceptance', subject_ref: 'docs/spec.md', subject_revision: engineerSha256('# Source spec\n') },
      },
    }));
    expect(otherRequirement.status).toBe('unsatisfied');

    const unreadable = resolveDependencyAuthority(input(subject, 'product_accepted', {
      readers: {
        readCanonicalTargetRef: () => 'main',
        readProductAcceptanceProjections: () => { throw new Error('product store unavailable'); },
      } as Partial<DependencyAuthorityReaders>,
    }));
    expect(unreadable.status).toBe('authority_unavailable');
    expect(unreadable.authority_revision).toBeNull();
  });

  test('cross-repository dependencies bind repository identity and never read a same-named local path', () => {
    const local = fixture();
    const remote = fixture();
    // Same repository-relative contract path, deliberately different bytes.
    writeRepoFile(local.root, CONTRACT_REF, '# Task Contract: wp-a\n\n> **Status**: Active\n\n## Goal\n\nLocal decoy.\n');
    git(local.root, 'add', CONTRACT_REF);
    git(local.root, 'commit', '-m', 'local decoy');
    const localCommit = git(local.root, 'rev-parse', 'HEAD');
    writeAcceptanceReceipt(local, acceptanceReceipt(local, {
      contract_sha256: authorityFingerprint('# Task Contract: wp-a\n\n> **Status**: Active\n\n## Goal\n\nLocal decoy.\n'),
    }));
    writeAcceptanceReceipt(remote, acceptanceReceipt(remote));

    const localRepo = repository(REPO_ID, local.root);
    const remoteRepo = repository(OTHER_REPO_ID, remote.root);
    // The remote repository owns its own Work Graph identity; the resolver
    // requires the target to be that graph's exact member.
    const remoteGraph = projectFixtureGraph(remote.root, SPRINT_TEXT, OTHER_REPO_ID);
    const remoteTarget = remoteGraph.work_packages.find((item) => item.work_package_id === 'wp-a')!;
    const registry: RepoHarnessRegistrySnapshot = {
      registryPath: join(local.root, 'registry.json'),
      authorizationRevision: 3,
      repos: [localRepo, remoteRepo],
    };
    const reads: readonly DependencyAuthorityRepositoryRead[] = [
      { repo: localRepo, commit: localCommit, graph: local.graph },
      { repo: remoteRepo, commit: remote.commit, graph: remoteGraph },
    ];
    const crossInput: DependencyAuthorityInput = {
      dependency: dependency('module_accepted', OTHER_REPO_ID),
      target: remoteTarget,
      reads,
      registry,
      env: { HOME: remote.root },
      readFileAtCommit: (repoRoot, commit, path) => gitShow(repoRoot, commit, path),
      readers: { readCanonicalTargetRef: () => 'main' },
    };
    const resolved = resolveDependencyAuthority(crossInput);
    expect(resolved.status).toBe('satisfied');
    expect(resolved.evidence_refs.map((entry) => entry.ref)).toContain(`acceptance-receipt:${remote.identity}`);
    expect(resolved.evidence_refs.map((entry) => entry.ref)).not.toContain(`acceptance-receipt:${local.identity}`);

    // A receipt claiming another repository root is not this repository's acceptance.
    writeAcceptanceReceipt(remote, acceptanceReceipt(remote, { repository_root: local.root }));
    expect(resolveDependencyAuthority(crossInput).status).toBe('unsatisfied');

    // Authorization revocation is unavailable, never satisfied.
    writeAcceptanceReceipt(remote, acceptanceReceipt(remote));
    const revoked = resolveDependencyAuthority({
      ...crossInput,
      registry: { ...registry, repos: [localRepo, repository(OTHER_REPO_ID, remote.root, 'read_only')] },
    });
    expect(revoked.status).toBe('authority_unavailable');
    expect(revoked.authority_revision).toBeNull();

    // A registry authorization movement stales the prior observation.
    const bumped = resolveDependencyAuthority({ ...crossInput, registry: { ...registry, authorizationRevision: 4 } });
    expect(bumped.status).toBe('satisfied');
    expect(bumped.authority_revision).not.toBe(resolved.authority_revision);
  });

  test('an unregistered dependency repository never resolves through the local worktree', () => {
    const subject = fixture();
    writeAcceptanceReceipt(subject, acceptanceReceipt(subject));
    const resolved = resolveDependencyAuthority(input(subject, 'module_accepted', {
      dependency: dependency('module_accepted', OTHER_REPO_ID),
    }));
    expect(resolved.status).toBe('authority_unavailable');
    expect(resolved.authority_revision).toBeNull();
    expect(resolved.evidence_refs).toEqual([]);
  });

  test('board exclusions separate dependency_not_ready from dependency_authority_unavailable', () => {
    const subject = fixture();
    const unavailable = offers(subject, 'module_accepted');
    expect(unavailable.offers).toEqual([]);
    expect(unavailable.exclusions.find((item) => item.work_package_id === 'wp-b')?.blockers)
      .toEqual(['dependency_authority_unavailable']);

    writeAcceptanceReceipt(subject, acceptanceReceipt(subject, { contract_file: 'tasks/contracts/other.contract.md' }));
    const notReady = offers(subject, 'module_accepted');
    expect(notReady.offers).toEqual([]);
    expect(notReady.exclusions.find((item) => item.work_package_id === 'wp-b')?.blockers)
      .toEqual(['dependency_not_ready']);

    writeAcceptanceReceipt(subject, acceptanceReceipt(subject));
    const ready = offers(subject, 'module_accepted');
    expect(ready.offers.map((offer) => offer.work_package_id)).toEqual(['wp-b']);
    expect(ready.offers[0]!.dependency_revision).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  test('acquire revalidates the asserted offer after the dependency authority moves', () => {
    const subject = fixture();
    writeAcceptanceReceipt(subject, acceptanceReceipt(subject));
    const deps = schedulingDependencies(subject, 'module_accepted');
    const document = offers(subject, 'module_accepted');
    const offer = document.offers[0]!;
    const assertion = {
      offer_revision: offer.offer_revision,
      work_package_id: offer.work_package_id,
      work_package_revision: offer.work_package_revision,
      work_graph_revision: offer.work_graph_revision,
      task_id: offer.task_id,
      task_revision: offer.task_revision,
      dependency_revision: offer.dependency_revision,
      concurrency_revision: offer.concurrency_revision,
      binding_id: offer.binding_id,
      binding_generation: offer.binding_generation,
      engineer_contract_revision: offer.engineer_contract_revision,
      fleet_offer_revision: offer.fleet_offer_revision,
      authorization_revision: offer.authorization_revision,
    };
    const acquireDependencies = {
      collectOffers: (options: Parameters<typeof collectEngineerOffers>[0]) => collectEngineerOffers({
        ...options,
        registry_snapshot: subject.registry,
        dependencies: deps,
      }),
      acquire: () => ({ ok: true, envelope: {} as never, receipt: {} as never }) as never,
      withConcurrencyLock: <T>(_root: string, _key: string, run: () => T): T => run(),
    };
    const acquired = acquireScheduledEngineerTask({
      repo_root: subject.root,
      principal: principal(),
      assertion,
      dependencies: acquireDependencies,
    });
    expect(acquired.ok).toBe(true);

    writeAcceptanceReceipt(subject, acceptanceReceipt(subject, { summary: 'accepted wp-a again' }));
    const stale = acquireScheduledEngineerTask({
      repo_root: subject.root,
      principal: principal(),
      assertion,
      dependencies: acquireDependencies,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error('expected a stale offer');
    expect(stale.error).toBe('engineer_offer_stale');
  });

  test('the resolver refuses a target that is not the exact Work Package its edge names', () => {
    const subject = fixture();
    writeAcceptanceReceipt(subject, acceptanceReceipt(subject));
    const otherWorkPackage = subject.graph.work_packages.find((item) => item.work_package_id === 'wp-b')!;
    const mismatches: readonly { readonly label: string; readonly patch: Partial<DependencyAuthorityInput> }[] = [
      { label: 'mismatched work_package_id', patch: { target: otherWorkPackage } },
      {
        label: 'cross-repository target',
        patch: { target: { ...subject.target, repository_id: OTHER_REPO_ID } as ProjectedWorkPackageV1 },
      },
      {
        label: 'stale work_package_revision',
        patch: { target: { ...subject.target, work_package_revision: `sha256:${'9'.repeat(64)}` } as ProjectedWorkPackageV1 },
      },
    ];
    for (const state of WORK_PACKAGE_DEPENDENCY_STATES) {
      const paired = resolveDependencyAuthority(input(subject, state));
      expect(paired.evidence_refs.some((entry) => entry.ref.startsWith('dependency-target-mismatch:'))).toBe(false);
      for (const mismatch of mismatches) {
        const resolved = resolveDependencyAuthority(input(subject, state, mismatch.patch));
        expect([state, mismatch.label, resolved.status]).toEqual([state, mismatch.label, 'authority_unavailable']);
        expect(resolved.authority_revision).toBeNull();
        expect(resolved.evidence_refs.map((entry) => entry.ref))
          .toEqual([`dependency-target-mismatch:${REPO_ID}:wp-a`]);
      }
    }
    // Positive control: the exact pair still reaches the real adapters.
    expect(resolveDependencyAuthority(input(subject, 'canonical_done')).status).toBe('satisfied');
    expect(resolveDependencyAuthority(input(subject, 'module_accepted')).status).toBe('satisfied');
  });

  test('a completed unrelated target cannot satisfy another edge', () => {
    const subject = fixture();
    const openWorkPackage = subject.graph.work_packages.find((item) => item.work_package_id === 'wp-b')!;
    const edgeToOpen: WorkPackageDependencyV1 = {
      repository_id: REPO_ID,
      work_package_id: 'wp-b',
      required_state: 'canonical_done',
      acceptance_authority: null,
    };
    expect(subject.target.task_status).toBe('[x]');
    expect(openWorkPackage.task_status).toBe('[ ]');
    expect(resolveDependencyAuthority(input(subject, 'canonical_done', {
      dependency: edgeToOpen,
      target: openWorkPackage,
    })).status).toBe('unsatisfied');

    const smuggled = resolveDependencyAuthority(input(subject, 'canonical_done', {
      dependency: edgeToOpen,
      target: subject.target,
    }));
    expect(smuggled.status).toBe('authority_unavailable');
    expect(smuggled.authority_revision).toBeNull();
    expect(smuggled.evidence_refs.map((entry) => entry.ref))
      .toEqual([`dependency-target-mismatch:${REPO_ID}:wp-b`]);
  });

  test('the shared acceptance validator consumes every AcceptanceReceipt key', () => {
    const subject = fixture();
    const valid = acceptanceReceipt(subject);
    const base = {
      receipt: valid,
      repositoryRoot: subject.root,
      expectedContractFile: CONTRACT_REF,
      contractContent: CONTRACT_TEXT,
      goalContent: GOAL_TEXT,
      waiverGrant: null,
    };
    expect(validateAcceptanceReceiptAgainstPolicy(base)).toEqual({ ok: true });
    expect([...Object.keys(valid)].sort()).toEqual([...CONSUMED_RECEIPT_KEYS].sort());

    // Deliberate-break probe: every declared key must be able to refuse.
    const breaks: Record<keyof AcceptanceReceipt, unknown> = {
      protocol: 1,
      kind: 'repo-harness-other-receipt',
      repository_root: join(subject.root, 'elsewhere'),
      contract_file: 'tasks/contracts/other.contract.md',
      contract_sha256: authorityFingerprint('# other\n'),
      goal_file: '../escape.md',
      goal_sha256: authorityFingerprint('# other goal\n'),
      verification_file: '/etc/passwd',
      verification_evidence_sha256: 'not-a-digest',
      benchmark_evidence_sha256: '',
      subject_sha256: 'not-a-digest',
      subject_scope: 'raw-diff',
      target_ref: '',
      target_revision: 'zzzz',
      reviewed_paths: ['../escape.ts'],
      disposition: 'reject',
      expected_reviewer: 'Claude',
      reviewer: 'Claude',
      source: 'claude-review',
      actor: 'someone-else',
      summary: '   ',
      findings: [{ severity: 'P0', message: 'blocked' }],
      waiver_grant_sha256: `sha256:${'e'.repeat(64)}`,
      issued_at: 'not-a-timestamp',
    };
    for (const key of CONSUMED_RECEIPT_KEYS) {
      const broken = { ...valid, [key]: breaks[key] } as AcceptanceReceipt;
      const verdict = validateAcceptanceReceiptAgainstPolicy({ ...base, receipt: broken });
      expect([key, verdict.ok]).toEqual([key, false]);
    }
  });

  test('module_accepted refuses a receipt the acceptance policy itself would refuse', () => {
    const subject = fixture();
    const exact = input(subject, 'module_accepted');

    writeAcceptanceReceipt(subject, acceptanceReceipt(subject));
    expect(resolveDependencyAuthority(exact).status).toBe('satisfied');

    // Policy is {reviewer: Codex, source: codex-review}; a Claude external_pass
    // is structurally valid and must still fail the contract's own policy.
    writeAcceptanceReceipt(subject, acceptanceReceipt(subject, {
      expected_reviewer: 'Claude',
      reviewer: 'Claude',
      source: 'claude-review',
    }));
    expect(resolveDependencyAuthority(exact).status).toBe('unsatisfied');

    writeAcceptanceReceipt(subject, acceptanceReceipt(subject, {
      reviewer: 'Claude',
      source: 'claude-review',
    }));
    expect(resolveDependencyAuthority(exact).status).toBe('unsatisfied');

    writeAcceptanceReceipt(subject, acceptanceReceipt(subject, {
      goal_sha256: authorityFingerprint('# Plan: wp-a\n\n> **Status**: Approved\n\n## Approach\n\nSomething else.\n'),
    }));
    expect(resolveDependencyAuthority(exact).status).toBe('unsatisfied');
  });

  test('module_accepted enforces the waiver policy and the exact grant fingerprint', () => {
    const subject = fixture();
    const grant = waiverGrant(subject);
    writeWaiverGrant(subject, grant);
    writeAcceptanceReceipt(subject, waivedReceipt(subject, grant));
    const exact = input(subject, 'module_accepted');
    expect(resolveDependencyAuthority(exact).status).toBe('satisfied');

    // A grant whose bytes moved no longer matches the receipt fingerprint.
    writeWaiverGrant(subject, waiverGrant(subject, { summary: 'owner waived wp-a again' }));
    expect(resolveDependencyAuthority(exact).status).toBe('unsatisfied');

    // The sealed contract forbids user waiver; the same receipt shape must fail.
    writeWaiverGrant(subject, waiverGrant(subject, {
      contract_file: CONTRACT_NO_WAIVER_REF,
      contract_sha256: authorityFingerprint(CONTRACT_NO_WAIVER_TEXT),
    }));
    const sealedGrant = waiverGrant(subject, {
      contract_file: CONTRACT_NO_WAIVER_REF,
      contract_sha256: authorityFingerprint(CONTRACT_NO_WAIVER_TEXT),
    });
    writeAcceptanceReceipt(subject, waivedReceipt(subject, sealedGrant, {
      contract_file: CONTRACT_NO_WAIVER_REF,
      contract_sha256: authorityFingerprint(CONTRACT_NO_WAIVER_TEXT),
    }));
    const sealed = input(subject, 'module_accepted', {
      dependency: {
        ...dependency('module_accepted'),
        acceptance_authority: moduleAuthorityFor(CONTRACT_NO_WAIVER_REF, CONTRACT_NO_WAIVER_TEXT),
      },
    });
    expect(resolveDependencyAuthority(sealed).status).toBe('unsatisfied');

    // A missing grant for a user_waiver receipt is an unreadable authority.
    rmSync(userWaiverGrantPath(subject.root, subject.root), { force: true });
    writeAcceptanceReceipt(subject, waivedReceipt(subject, grant));
    const missing = resolveDependencyAuthority(exact);
    expect(missing.status).toBe('authority_unavailable');
    expect(missing.authority_revision).toBeNull();
  });

  test('the evidence projection is the only input to authority_revision', () => {
    const subject = fixture();
    writeAcceptanceReceipt(subject, acceptanceReceipt(subject));
    const first = resolveDependencyAuthority(input(subject, 'module_accepted'));
    const second = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(second.authority_revision).toBe(first.authority_revision);
    expect(first.authority_revision).toBe(engineerSha256(canonicalEngineerJson(JSON.parse(canonicalEngineerJson({
      protocol: 1,
      kind: 'repo-harness-dependency-authority-observation',
      dependency: {
        repository_id: REPO_ID,
        work_package_id: 'wp-a',
        required_state: 'module_accepted',
        acceptance_authority: moduleAuthority(),
      },
      registry: { authorization_revision: 3, access_mode: 'read_write', registered: true },
      target: {
        repository_id: subject.target.repository_id,
        sprint_path: subject.target.sprint_path,
        work_package_id: subject.target.work_package_id,
        work_package_revision: subject.target.work_package_revision,
        task_id: subject.target.task_id,
        task_revision: subject.target.task_revision,
        task_status: subject.target.task_status,
      },
      status: 'satisfied',
      evidence_refs: first.evidence_refs,
    })))));
  });
});
