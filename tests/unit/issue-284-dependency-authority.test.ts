import type { RequiredPullRequestV2 } from '../../src/core/integration/product-acceptance';
import { observeSelectedPullRequest, type IntegrationAcceptanceEnvironment } from '../../src/effects/integration/product-acceptance';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { observeActiveReviewAdmission } from '../../src/effects/review/issue-goal';
import { createReviewAdmission } from '../../src/core/review/authority-context';
import { FIXTURE_SCHEMA_HEADER, fixtureBacklogTable, fixtureTaskId } from '../helpers/sprint-fixture';
import { executeAdmittedVerification } from '../../src/effects/evidence/verification-execution';
import { prepareChangeAssessment } from '../../src/effects/review/change-assessment';
import { recordFixtureAcceptance } from '../helpers/repo-fixture';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, sep } from 'path';

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
import { publicationSha256 } from '../../src/core/publication/publication-receipt';
import { projectCanonicalTasks } from '../../src/core/state/coordination-identity';
import {
  OBSERVATION_PATH_RULE_COVERAGE,
  defaultDependencyAuthorityReaders,
  resolveDependencyAuthority,
  type DependencyAuthorityInput,
  type DependencyAuthorityReaders,
  type DependencyAuthorityRepositoryRead,
} from '../../src/effects/engineers/dependency-authority';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { osAccountHome } from '../../src/effects/runtime/os-account-home';
import {
  createAcceptanceMatrix,
  createIntegrationContract,
  createIntegrationEnvelope,
  createProductAcceptanceProjection,
  listProductAcceptanceProjections,
} from '../../src/effects/integration/product-acceptance';
import { repoHarnessRegisteredReposPath, type RepoHarnessRegisteredRepo, type RepoHarnessRegistrySnapshot } from '../../src/effects/repo-registry';
import {
  ACCEPTANCE_VALIDATOR_RULE_IDS,
  CONSUMED_RECEIPT_KEYS,
  acceptanceReceiptPath,
  userWaiverGrantPath,
  acceptanceVerificationObservationPath,
  acceptanceVerificationObservationSubjectKey,
  authorityFingerprint,
  recordAcceptance,
  recordUserWaiverAcceptance,
  recordUserWaiverGrant,
  validateAcceptanceReceiptAgainstPolicy,
  writeAcceptanceVerificationObservation,
  type AcceptanceReceipt,
  type AcceptanceVerificationObservationV1,
  type UserWaiverGrant,
} from '../../scripts/acceptance-receipt';
import { withEmptyVerificationPlan } from '../helpers/verification-plan-fixture';

const REPO_ID = 'repo_0123456789abcdef';
const OTHER_REPO_ID = 'repo_fedcba9876543210';
const CAPABILITY = 'capability.workflow-engine.contract-assets';
const SPRINT = 'plans/sprints/demo.sprint.md';
const CONTRACT_REF = 'tasks/contracts/wp-a.contract.md';
const SELECTOR_REF = 'plans/review/wp-a.admission.json';
const approvals = new Map<string, ReturnType<typeof seedReviewAdmissionFixture>>();
function approval(root: string) { const value = approvals.get(root); if (!value) throw new Error('missing test approval'); return value; }
function selector(root: string) {
  const { admission, source } = approval(root);
  return { protocol: 1, provider_repository_id: source.repository_id, issue_id: source.issue_id, campaign_id: source.campaign_id,
    admission_sha256: admission.admission_sha256, grant_sha256: source.expectedGrantSha256, policy_sha256: source.expectedPolicySha256, actor_id: source.expectedActor };
}
function selectorBytes(root: string) { return JSON.stringify(selector(root)) + '\n'; }
function reference(root: string) { return moduleAuthorityFor(SELECTOR_REF, selectorBytes(root)); }
function admissionReaders(root: string, home: string): Partial<DependencyAuthorityReaders> {
  return { readCanonicalTargetRef: () => 'main', resolveAuthorityHome: () => home, readIssuePolicy: () => approval(root).policy,
    observeReviewAdmission: input => observeActiveReviewAdmission({ ...input, runner: approval(root).source.runner }) };
}
const PRD_REF = 'plans/prds/product.md';
const GOAL_REF = 'plans/plan-wp-a.md';
const CONTRACT_NO_WAIVER_REF = 'tasks/contracts/wp-a-sealed.contract.md';
const OWNER = 'ancienttwo';
const CONTRACT_TEXT = withEmptyVerificationPlan([
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
  '{"protocol":2,"reviewer":"Codex","source":"generic-review","user_waiver":"allowed"}',
  '```',
  '',
].join('\n'));
const CONTRACT_NO_WAIVER_TEXT = CONTRACT_TEXT
  .replace('# Task Contract: wp-a', '# Task Contract: wp-a (sealed)')
  .replace('"user_waiver":"allowed"', '"user_waiver":"forbidden"');
const GOAL_TEXT = '# Plan: wp-a\n\n> **Status**: Approved\n\n## Approach\n\nDeliver wp-a.\n';
const PRD_TEXT = '# Product\n\n> **Status**: Approved\n';
const POLICY_BYTES = '{"policy":1}\n';
const ROLLBACK_A = '{"rollback":"a"}\n';
const ROLLBACK_B = '{"rollback":"b"}\n';
const SPRINT_TEXT = `# Sprint: demo

${FIXTURE_SCHEMA_HEADER}

## Backlog

${fixtureBacklogTable([
  { index: 1, status: '[x]', task: 'task A', acceptance: 'accepted A' },
  { index: 2, task: 'task B', acceptance: 'accepted B' },
]).join('\n')}

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
      : state === 'product_accepted' ? productAuthority() : state === 'publication_integrated' ? { authority_kind: 'provider_integration', subject_ref: 'plans/integration/wp-a.json', subject_revision: engineerSha256('{}') } : null,
  };
}

function workGraphJson(state: WorkPackageDependencyState = 'canonical_done', repositoryId = REPO_ID): unknown {
  const definition = (id: string, taskRef: string, dependsOn: unknown[]) => ({
    work_package_id: id,
    task_id: fixtureTaskId(taskRef),
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
    retry_policy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'exponential', initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } as const,
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
  readonly home: string;
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
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'dependency-approval-')));
  roots.push(root, home);
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
  approvals.set(root, seedReviewAdmissionFixture(root, home, { reviewer: 'Codex', userWaiver: 'allowed', actor: OWNER }));
  writeRepoFile(root, SELECTOR_REF, selectorBytes(root));
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
    home,
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

function providerRunner(provider: Map<number, { selection: RequiredPullRequestV2; merge: string; tree: string }>): NonNullable<IntegrationAcceptanceEnvironment['gh_runner']> {
  const response = (value: unknown, status = 0) => ({ status, stdout: JSON.stringify(value) });
  return args => {
    const command = `${args[0]} ${args[1]}`;
    if (command === 'repo view') return response({ id: 'R_me4c_fixture', nameWithOwner: 'example/product' });
    if (args[0] === 'api' && args[1]?.includes('/contents/')) return response({ status: '404', message: 'Not Found' }, 1);
    if (args[0] === 'api' && args[1]?.includes('/issues/')) return response({ node_id: 'I_product', number: 903 });
    const number = args[0] === 'pr' ? Number(args[2]) : command === 'api graphql'
      ? Number(args.find(arg => arg.startsWith('number='))?.slice(7))
      : Number(args[1]?.match(/(?:pulls|runs)\/(\d+)$/)?.[1]);
    const item = provider.get(number);
    if (args[0] === 'api' && args[1]?.includes('/git/commits/')) {
      const commit = args[1].split('/').at(-1);
      const entry = [...provider.values()].find(value => value.merge === commit);
      if (!entry) throw new Error('unexpected merge commit');
      return response({ sha: entry.merge, tree: { sha: entry.tree }, parents: [{ sha: entry.selection.expected_base_sha }] });
    }
    if (!item) throw new Error(`unexpected provider args: ${args.join(' ')}`);
    const selection = item.selection;
    if (command === 'pr view') return response({ number, url: `https://github.com/example/product/pull/${number}`,
      state: 'MERGED', isDraft: false, headRefOid: selection.expected_head_sha, headRefName: `feature-${number}`,
      baseRefOid: selection.expected_base_sha, baseRefName: 'main', body: '', reviewDecision: 'APPROVED', mergeable: 'UNKNOWN' });
    if (command === 'pr checks') return response([{ name: 'Required / CI', bucket: 'pass', link: `https://github.com/example/product/actions/runs/${number}/job/1` }]);
    if (command === 'api graphql') return response({ data: { node: { id: selection.provider_repository_id, pullRequest: {
      number, headRefOid: selection.expected_head_sha, baseRefOid: selection.expected_base_sha, reviewDecision: 'APPROVED',
      latestOpinionatedReviews: { pageInfo: { hasNextPage: false }, nodes: [] },
      reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
    } } } });
    if (args[1]?.includes('/actions/runs/')) return response({ path: '.github/workflows/ci.yml', event: 'pull_request',
      head_sha: selection.expected_head_sha, pull_requests: [{ number, head: { sha: selection.expected_head_sha }, base: { sha: selection.expected_base_sha } }],
      status: 'completed', conclusion: 'success' });
    if (args[1]?.includes('/pulls/')) return response({ number, merged: true, merge_commit_sha: item.merge,
      head: { sha: selection.expected_head_sha }, base: { sha: selection.expected_base_sha, ref: 'main', repo: { node_id: selection.provider_repository_id } } });
    throw new Error(`unexpected provider args: ${args.join(' ')}`);
  };
}

function providerFixture(subject: Fixture, head: string, base: string) {
  const selection: RequiredPullRequestV2 = { provider_repository_id: 'R_me4c_fixture', repository: 'example/product',
    issue_id: 'I_product', issue_number: 903, pr_number: 1, expected_head_sha: head, expected_base_sha: base };
  const tree = git(subject.root, 'rev-parse', `${head}^{tree}`);
  const provider = new Map([[1, { selection, merge: head, tree }]]);
  const environment = { repo_root: subject.root, gh_runner: providerRunner(provider) };
  return { selection, tree, provider, environment };
}

function integrationInput(subject: Fixture, state: 'publication_integrated' | 'product_accepted',
  provider: ReturnType<typeof providerFixture>, product: { projection_sha256: string; approved_prd_ref: string; approved_prd_sha256: string } | null = null): DependencyAuthorityInput {
  const selector = { protocol: 2, task_id: subject.target.task_id, task_revision: subject.target.task_revision,
    final_head_sha: provider.provider.get(1)!.merge, final_tree_sha: provider.tree, required_pull_requests: [provider.selection], product };
  const path = 'plans/integration/wp-a.json';
  const bytes = `${JSON.stringify(selector)}\n`;
  writeRepoFile(subject.root, path, bytes);
  git(subject.root, 'add', path); git(subject.root, 'commit', '-m', 'select exact provider integration');
  const commit = git(subject.root, 'rev-parse', 'HEAD');
  return input(subject, state, { dependency: { ...dependency(state), acceptance_authority: {
    authority_kind: state === 'publication_integrated' ? 'provider_integration' : 'product_acceptance', subject_ref: path, subject_revision: engineerSha256(bytes) } },
    reads: subject.reads.map(read => ({ ...read, commit })),
    readers: { ...admissionReaders(subject.root, subject.home), observeIntegration: (_env, ...args) => observeSelectedPullRequest(provider.environment, ...args) } });
}

function input(
  subject: Fixture,
  state: WorkPackageDependencyState,
  overrides: Partial<DependencyAuthorityInput> = {},
): DependencyAuthorityInput {
  return {
    dependency: { ...dependency(state), ...(state === 'module_accepted' ? { acceptance_authority: reference(subject.root) } : {}) },
    target: subject.target,
    reads: subject.reads,
    registry: subject.registry,
    readFileAtCommit: (repoRoot, commit, path) => gitShow(repoRoot, commit, path),
    readers: admissionReaders(subject.root, subject.home),
    ...overrides,
  };
}

function acceptanceReceipt(subject: Fixture, overrides: Partial<AcceptanceReceipt> = {}): AcceptanceReceipt {
  return {
    protocol: 3,
    kind: 'repo-harness-acceptance-receipt',
    repository_root: subject.root,
    campaign_sha256: approval(subject.root).admission.campaign_sha256,
    admission_sha256: approval(subject.root).admission.admission_sha256,
    grant_sha256: approval(subject.root).grant,
    goal_sha256: approval(subject.root).admission.goal.revision,
    verification_file: '.ai/harness/runs/acceptance.report.json',
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
    source: 'generic-review',
    request_id: 'fixture-request', context_sha256: `sha256:${'1'.repeat(64)}`, result_sha256: `sha256:${'2'.repeat(64)}`, actual_harness: 'codex', actual_role: 'deep-reasoner', actual_model: 'fixture-model',
    actor: null,
    summary: 'accepted wp-a',
    findings: [],
    waiver_grant_sha256: null,
    issued_at: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

/** Writes the receipt through the real authority path so the real validator reads it. */
function writeAcceptanceReceipt(subject: Fixture, receipt: AcceptanceReceipt, authorityHome = subject.home): void {
  const path = acceptanceReceiptPath(subject.root, authorityHome, true);
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
}

function waiverAuthorization(subject: Pick<Fixture, 'root'>, summary: string) {
  const active = approval(subject.root), admission = active.admission;
  return { protocol: 1 as const, kind: 'repo-harness-upstream-waiver-authorization' as const,
    action: 'human-approved-user-waiver' as const, authorization_ref: 'fixture-separate-user-waiver', bot_id: 'fixture-bot',
    repository_root: subject.root, repository_id: admission.repository_id, issue_id: admission.issue_id, campaign_id: admission.campaign_id,
    campaign_sha256: admission.campaign_sha256, admission_sha256: admission.admission_sha256,
    grant_sha256: active.grant, goal_sha256: admission.goal.revision, actor: admission.actor_id, summary, expires_at: Date.now() + 3_600_000 };
}

function waiverGrant(subject: Fixture, overrides: Partial<UserWaiverGrant> = {}): UserWaiverGrant {
  return {
    protocol: 3,
    kind: 'repo-harness-user-waiver-grant',
    repository_root: subject.root,
    campaign_sha256: approval(subject.root).admission.campaign_sha256,
    admission_sha256: approval(subject.root).admission.admission_sha256,
    grant_sha256: approval(subject.root).grant,
    goal_sha256: approval(subject.root).admission.goal.revision,
    actor: OWNER,
    scope: 'admission-authority',
    summary: 'owner waived wp-a',
    authorization: waiverAuthorization(subject, 'owner waived wp-a'),
    issued_at: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

function waivedReceipt(subject: Fixture, grant: UserWaiverGrant, overrides: Partial<AcceptanceReceipt> = {}): AcceptanceReceipt {
  return acceptanceReceipt(subject, {
    disposition: 'user_waiver',
    reviewer: 'User',
    source: 'user-waiver',
    request_id: null, context_sha256: null, result_sha256: null, actual_harness: null, actual_role: null, actual_model: null,
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

/** Synthetic record-time observation fixture. The real record-path test below
 * independently proves that genuine execution can produce this authority. */
function recordAcceptanceObservation(
  subject: Fixture,
  receipt: AcceptanceReceipt = acceptanceReceipt(subject),
): AcceptanceVerificationObservationV1 {
  writeAcceptanceReceipt(subject, receipt);
  return writeAcceptanceVerificationObservation({
    root: subject.root,
    authorityHome: subject.home,
    receipt,
  });
}

function observationPathFor(subject: Fixture, receipt: AcceptanceReceipt = acceptanceReceipt(subject)): string {
  return acceptanceVerificationObservationPath(
    subject.root,
    subject.home,
    receipt.campaign_sha256,
    receipt.admission_sha256,
  );
}

const ENGINEER = `engineer:${CAPABILITY}`;
const CONTRACT_REVISION = `sha256:${'a'.repeat(64)}`;
const BINDING = '11111111-1111-4111-8111-111111111111';

const RECORD_CONTRACT_REF = 'tasks/contracts/demo.contract.md';
const RECORD_GOAL_REF = 'plans/plan-demo.md';
const RECORD_REPO_ID = 'repo_abcdef0123456789';

interface RecordFixture {
  readonly root: string;
  readonly home: string;
  readonly commit: string;
}

function recordContractText(): string {
  return [
    '# Task Contract: demo',
    '',
    '> **Status**: Active',
    `> **Plan**: ${RECORD_GOAL_REF}`,
    '> **Owner**: kito',
    '',
    '## Allowed Paths', '', '```yaml', 'allowed_paths:', '  - "*"','```', '',
    '## Evidence Requirements', '', '```yaml', 'evidence_requirements:', '  benchmark: not_applicable', '```', '',
    '## Verification Plan', '', '```json', JSON.stringify({protocol:1,checks:[{id:'feature-content',kind:'command',command:'grep -qx candidate feature.txt',cwd:'.',phase:'verification',cost:'normal',evidence_policy:'current_exact',necessity:'Validate the tracked candidate file.',inputs:{env:[]}}]}), '```', '',
    '## Acceptance Policy',
    '',
    '```json',
    '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}',
    '```',
    '',
    '## Change Assessment',
    '',
    '```json',
    '{"protocol":1,"oracles":[]}',
    '```',
    '',
  ].join('\n');
}

function recordChecks(root: string): void {
  const report = executeAdmittedVerification({ repoRoot: root, authority: approval(root).source, reportFile: '.ai/harness/runs/acceptance.report.json' });
  if (!report.passed) throw new Error('genuine candidate check did not pass');
  const prepared = prepareChangeAssessment({ repoRoot: root, authority: approval(root).source });
  const basis = { schema: 'repo-harness-change-assessment-evidence.v1', status: 'pass', assessment: prepared.assessment, selection_packet: prepared.packet };
  writeRepoFile(root, '.ai/harness/checks/change-assessment.latest.json', JSON.stringify({ ...basis, evidence_sha256: engineerSha256(stableJson(basis)) }, null, 2) + '\n');
}

/** A minimal repository the real acceptance record path can run against. */
function recordFixture(options: { readonly extraCandidateFile?: string } = {}): RecordFixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'issue-284-record-')));
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'issue-284-home-')));
  roots.push(root, home);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Issue 284');
  git(root, 'config', 'user.email', 'issue284@test.invalid');
  writeRepoFile(root, '.gitignore', '.ai/harness/checks/\n.ai/harness/runs/\n.ai/harness/evidence/\n-checks.json\n');
  writeRepoFile(root, '.ai/harness/policy.json', `${JSON.stringify({
    worktree_strategy: { review_base: 'main' },
    merge_gate: { enabled: true, rule: 'fixture' },
  }, null, 2)}\n`);
  writeRepoFile(root, 'base.txt', 'base\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'base');
  git(root, 'checkout', '-b', 'codex/demo');
  writeRepoFile(root, 'feature.txt', 'candidate\n');
  if (options.extraCandidateFile !== undefined) writeRepoFile(root, options.extraCandidateFile, 'candidate\n');
  writeRepoFile(root, RECORD_GOAL_REF, '# Plan: demo\n\n> **Status**: Executing\n');
  writeRepoFile(root, RECORD_CONTRACT_REF, recordContractText());
  writeRepoFile(root, 'tasks/reviews/demo.review.md', '# Review\n\n> **Recommendation**: pass\n');
  approvals.set(root, seedReviewAdmissionFixture(root, home, { reviewer: 'Claude', userWaiver: 'allowed', actor: 'kito', oracles: [],
    plan: { protocol: 1, checks: [{ id: 'feature-content', kind: 'command', command: 'grep -qx candidate feature.txt', cwd: '.', phase: 'verification',
      cost: 'normal', evidence_policy: 'current_exact', necessity: 'Check candidate.', inputs: { env: [] } }] } }));
  writeRepoFile(root, SELECTOR_REF, selectorBytes(root));
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'candidate');
  recordChecks(root);
  return { root, home, commit: git(root, 'rev-parse', 'HEAD') };
}

function recordExternalPass(
  fixtureValue: RecordFixture,
  overrides: { readonly verification?: string } = {},
): ReturnType<typeof recordAcceptance> {
  return recordFixtureAcceptance({
    root: fixtureValue.root,
    authorityHome: fixtureValue.home,
    authority: approval(fixtureValue.root).source,
    verification: overrides.verification ?? '.ai/harness/runs/acceptance.report.json',
    disposition: 'external_pass',
    reviewer: 'Claude',
    source: 'generic-review',
    actor: null,
    summary: 'candidate accepted',
    findings: [],
  });
}

function recordObservationPath(fixtureValue: RecordFixture): string {
  return acceptanceVerificationObservationPath(
    fixtureValue.root,
    fixtureValue.home,
    approval(fixtureValue.root).admission.campaign_sha256,
    approval(fixtureValue.root).admission.admission_sha256,
  );
}

/** Points the resolver at the record fixture repository and its committed contract. */
function recordResolverInput(fixtureValue: RecordFixture): DependencyAuthorityInput {
  const selectorContent = gitShow(fixtureValue.root, fixtureValue.commit, SELECTOR_REF)!;
  const definition = {
    work_package_id: 'wp-demo',
    task_id: '7'.repeat(64),
    primary_capability: CAPABILITY,
    depends_on: [],
    priority: 10,
    concurrency: { scope: 'repo', key: 'wp-demo' },
    execution_surface: 'contract',
    integration_group: null,
    required_acceptance: [{
      gate: 'module',
      policy_id: 'module-default',
      policy_ref: 'plans/policies/module.json',
      policy_revision: engineerSha256(POLICY_BYTES),
    }],
    retry_policy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'exponential', initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } as const,
    rollback_boundary: {
      kind: 'work_package',
      boundary_id: `${RECORD_REPO_ID}:wp-demo`,
      boundary_ref: 'plans/rollback/wp-demo.json',
      boundary_revision: engineerSha256(ROLLBACK_A),
    },
  };
  const graph = projectWorkGraph(validateWorkGraph({
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: RECORD_REPO_ID,
    sprint_path: SPRINT,
    lane: 'engineering-v2',
    work_packages: [definition],
  }), [{
    task_id: '7'.repeat(64),
    task_revision: '8'.repeat(64),
    task_ref: 'task demo',
    status: '[x]',
    row_order: 1,
  }]);
  const repo = repository(RECORD_REPO_ID, fixtureValue.root);
  return {
    dependency: {
      repository_id: RECORD_REPO_ID,
      work_package_id: 'wp-demo',
      required_state: 'module_accepted',
      acceptance_authority: {
        authority_kind: 'module_acceptance',
        subject_ref: SELECTOR_REF,
        subject_revision: engineerSha256(selectorContent),
      },
    },
    target: graph.work_packages[0]!,
    reads: [{ repo, commit: fixtureValue.commit, graph }],
    registry: { registryPath: join(fixtureValue.root, 'registry.json'), authorizationRevision: 3, repos: [repo] },
    readFileAtCommit: (repoRoot, commit, path) => gitShow(repoRoot, commit, path),
    readers: admissionReaders(fixtureValue.root, fixtureValue.home),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  approvals.clear();
});

describe('issue #284 closed dependency authority', () => {
  // The account-database lookup is POSIX-only; Windows falls back to userInfo().
  test.skipIf(process.platform === 'win32')('a launch-time HOME and harness home override move the registry but never the gate authority home', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'issue-912-')));
    roots.push(root);
    const account = join(root, 'account');
    const harnessHome = join(account, '.repo-harness');
    mkdirSync(harnessHome, { recursive: true });
    // Bun derives os.userInfo().homedir from the launch HOME, so only a child
    // process launched with the fixture HOME exercises the real resolver.
    const code = [
      `const { repoHarnessRegisteredReposPath } = await import(${JSON.stringify(join(import.meta.dir, '../../src/effects/repo-registry.ts'))});`,
      `const { defaultDependencyAuthorityReaders } = await import(${JSON.stringify(join(import.meta.dir, '../../src/effects/engineers/dependency-authority.ts'))});`,
      `const { acceptanceReceiptPath } = await import(${JSON.stringify(join(import.meta.dir, '../../scripts/acceptance-receipt.ts'))});`,
      'const authorityHome = defaultDependencyAuthorityReaders().resolveAuthorityHome();',
      `console.log(JSON.stringify({ registry: repoHarnessRegisteredReposPath(), authorityHome, gates: acceptanceReceiptPath(${JSON.stringify(root)}, authorityHome) }));`,
    ].join('\n');
    const child = Bun.spawnSync([process.execPath, '-e', code], {
      env: { ...process.env, HOME: account, REPO_HARNESS_HOME: harnessHome },
      stdout: 'pipe', stderr: 'pipe',
    });
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    const observed = JSON.parse(child.stdout.toString()) as { registry: string; authorityHome: string; gates: string };
    expect(observed.registry).toBe(join(harnessHome, 'registered-repos.json'));
    expect(observed.authorityHome).toBe(realpathSync(osAccountHome()));
    expect(observed.authorityHome.startsWith(root + sep)).toBe(false);
    expect(observed.gates.startsWith(join(observed.authorityHome, '.repo-harness', 'gates') + sep)).toBe(true);
    expect(observed.gates.startsWith(root + sep)).toBe(false);
    expect(observed.gates).not.toContain(join('.repo-harness', '.repo-harness'));
  });

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

  test('the real record paths refuse a receipt the shared validator would refuse', async () => {
    // A verification file the record path accepts (it only rejects paths that
    // escape the repository) but the shared validator refuses.
    const dashVerification = recordFixture();
    writeFileSync(join(dashVerification.root, '-checks.json'), readFileSync(join(dashVerification.root, '.ai/harness/runs/acceptance.report.json')));
    await expect(recordExternalPass(dashVerification, { verification: '-checks.json' }))
      .rejects.toThrow('AcceptanceReceipt verification_file is unsafe');
    expect(existsSync(acceptanceReceiptPath(dashVerification.root, dashVerification.home))).toBe(false);
    expect(existsSync(recordObservationPath(dashVerification))).toBe(false);

    // A reviewed path the diff genuinely produces and the validator refuses.
    const dashReviewed = recordFixture({ extraCandidateFile: '-feature.ts' });
    await expect(recordExternalPass(dashReviewed))
      .rejects.toThrow('AcceptanceReceipt reviewed_paths are invalid');
    expect(existsSync(acceptanceReceiptPath(dashReviewed.root, dashReviewed.home))).toBe(false);
    expect(existsSync(recordObservationPath(dashReviewed))).toBe(false);

    // The waiver record path runs the same rule set.
    const waived = recordFixture();
    recordUserWaiverGrant({
      root: waived.root,
      authorityHome: waived.home,
      authority: approval(waived.root).source,
      actor: 'kito',
      summary: 'owner waived the candidate',
      authorization: waiverAuthorization(waived, 'owner waived the candidate'),
    });
    writeFileSync(join(waived.root, '-checks.json'), readFileSync(join(waived.root, '.ai/harness/runs/acceptance.report.json')));
    await expect(recordUserWaiverAcceptance({
      root: waived.root,
      authorityHome: waived.home,
      authority: approval(waived.root).source,
      verification: '-checks.json',
    })).rejects.toThrow('AcceptanceReceipt verification_file is unsafe');
    expect(existsSync(acceptanceReceiptPath(waived.root, waived.home))).toBe(false);
    expect(existsSync(recordObservationPath(waived))).toBe(false);
  });

  test('an observation written by the real record path is accepted by the resolver', async () => {
    const record = recordFixture();
    const receipt = await recordExternalPass(record);
    expect(receipt.disposition).toBe('external_pass');
    expect(existsSync(recordObservationPath(record))).toBe(true);

    const resolved = resolveDependencyAuthority(recordResolverInput(record));
    expect(resolved.status).toBe('satisfied');
    expect(resolved.evidence_refs.map((entry) => entry.ref)).toContain('acceptance-disposition:external_pass');
    expect(resolved.evidence_refs.some((entry) => entry.ref.startsWith('acceptance-observation:sha256:'))).toBe(true);
  });

  test('every acceptance validator rule has a declared observation-path mechanism', () => {
    expect([...Object.keys(OBSERVATION_PATH_RULE_COVERAGE)].sort())
      .toEqual([...ACCEPTANCE_VALIDATOR_RULE_IDS].sort());
    for (const [rule, mechanism] of Object.entries(OBSERVATION_PATH_RULE_COVERAGE)) {
      expect([rule, ['record_time', 'subject_key', 'resolver'].includes(mechanism)]).toEqual([rule, true]);
    }
    // The one rule the authority does not enforce before writing must be the
    // resolver's own, or a recorded rejection reaches scheduling.
    expect(OBSERVATION_PATH_RULE_COVERAGE.disposition_not_reject).toBe('resolver');
  });

  test('module_accepted reads the acceptance authority\'s verified observation', () => {
    const subject = fixture();
    // The gate store has no observations directory at all.
    expect(existsSync(observationPathFor(subject))).toBe(false);
    const absent = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(absent.status).toBe('authority_unavailable');
    expect(absent.authority_revision).toBeNull();

    const observation = recordAcceptanceObservation(subject);
    const accepted = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(accepted.status).toBe('satisfied');
    expect(accepted.evidence_refs.map((entry) => entry.ref))
      .toContain(`acceptance-observation:${observation.observation_id}`);
    expect(accepted.evidence_refs.map((entry) => entry.ref)).toContain('acceptance-goal:R_provider:I_903');

    // Re-recording the same subject overwrites one file rather than growing a bag.
    const rerecorded = recordAcceptanceObservation(subject);
    expect(rerecorded.observation_id).toBe(observation.observation_id);
    expect(readdirSync(dirname(observationPathFor(subject)))).toEqual([
      `${acceptanceVerificationObservationSubjectKey(approval(subject.root).admission.campaign_sha256, approval(subject.root).admission.admission_sha256).slice('sha256:'.length)}.json`,
    ]);
    expect(resolveDependencyAuthority(input(subject, 'module_accepted')).status).toBe('satisfied');

    // A different acceptance for the same subject moves the observation id and
    // therefore the dependency revision.
    const moved = recordAcceptanceObservation(subject, acceptanceReceipt(subject, { summary: 'accepted wp-a again' }));
    expect(moved.observation_id).not.toBe(observation.observation_id);
    const after = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(after.status).toBe('satisfied');
    expect(after.authority_revision).not.toBe(accepted.authority_revision);
  });

  test('module_accepted gates on the observed disposition', () => {
    const subject = fixture();

    // A recorded rejection is a readable negative, never an acceptance.
    recordAcceptanceObservation(subject, acceptanceReceipt(subject, {
      disposition: 'reject',
      findings: [{ severity: 'P0', message: 'blocked' }],
    }));
    const rejected = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(rejected.status).toBe('unsatisfied');
    expect(rejected.evidence_refs.map((entry) => entry.ref)).toContain('acceptance-disposition:reject');

    const grant = waiverGrant(subject);
    const grantPath = userWaiverGrantPath(subject.root, subject.home, true);
    writeFileSync(grantPath, `${JSON.stringify(grant)}\n`);
    recordAcceptanceObservation(subject, waivedReceipt(subject, grant));
    const waived = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(waived.status).toBe('satisfied');
    expect(waived.evidence_refs.map((entry) => entry.ref)).toContain('acceptance-disposition:user_waiver');
    const clock = spyOn(Date, 'now').mockReturnValue(grant.authorization.expires_at + 1);
    try {
      const expired = resolveDependencyAuthority(input(subject, 'module_accepted'));
      expect(expired.status).toBe('authority_unavailable');
      expect(expired.authority_revision).toBeNull();
    } finally { clock.mockRestore(); }
    expect(resolveDependencyAuthority(input(subject, 'module_accepted')).status).toBe('satisfied');
    rmSync(grantPath);
    const revoked = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(revoked.status).toBe('authority_unavailable');
    expect(revoked.authority_revision).toBeNull();


    recordAcceptanceObservation(subject);
    expect(resolveDependencyAuthority(input(subject, 'module_accepted')).status).toBe('satisfied');

    // A disposition outside the passing whitelist fails closed even when the
    // observation is otherwise validly signed by the authority's own writer.
    const forged = writeAcceptanceVerificationObservation({
      root: subject.root,
      authorityHome: subject.home,
      receipt: { ...acceptanceReceipt(subject), disposition: 'conditional_pass' as AcceptanceReceipt['disposition'] },
    });
    expect(forged.disposition).toBe('conditional_pass' as AcceptanceReceipt['disposition']);
    const unknown = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(unknown.status).not.toBe('satisfied');
  });

  test('live issue changes and revoked grants invalidate stored positive observations', () => {
    const changedGoal = fixture();
    recordAcceptanceObservation(changedGoal);
    expect(resolveDependencyAuthority(input(changedGoal, 'module_accepted')).status).toBe('satisfied');
    approval(changedGoal.root).issue.body = 'Goal changed after approval';
    expect(resolveDependencyAuthority(input(changedGoal, 'module_accepted')).status).toBe('authority_unavailable');

    const revoked = fixture();
    recordAcceptanceObservation(revoked);
    expect(resolveDependencyAuthority(input(revoked, 'module_accepted')).status).toBe('satisfied');
    writeFileSync(join(approval(revoked.root).directory, 'active.json'), JSON.stringify({ protocol: 1, revision: 2, grant_sha256: null }), { mode: 0o600 });
    expect(resolveDependencyAuthority(input(revoked, 'module_accepted')).status).toBe('authority_unavailable');
    expect(existsSync(observationPathFor(revoked))).toBe(true);
  });

  test('committed selector pins exact admission and ignores working-tree selector edits', () => {
    const subject = fixture();
    recordAcceptanceObservation(subject);
    const original = input(subject, 'module_accepted');
    writeRepoFile(subject.root, SELECTOR_REF, JSON.stringify({ ...selector(subject.root), admission_sha256: engineerSha256('different admission') }));
    expect(resolveDependencyAuthority(original).status).toBe('satisfied');
    const changed = JSON.stringify({ ...selector(subject.root), admission_sha256: engineerSha256('different admission') });
    const moved = resolveDependencyAuthority({ ...original,
      dependency: { ...original.dependency, acceptance_authority: moduleAuthorityFor(SELECTOR_REF, changed) },
      readFileAtCommit: (root, commit, path) => path === SELECTOR_REF ? changed : gitShow(root, commit, path),
    });
    expect(moved.status).toBe('authority_unavailable');
    const forgedRevision = resolveDependencyAuthority({ ...original,
      dependency: { ...original.dependency, acceptance_authority: moduleAuthorityFor(SELECTOR_REF, 'unmatched committed bytes') },
    });
    expect(forgedRevision.status).toBe('authority_unavailable');
  });

  test('legacy contract text cannot serve as an admission selector', () => {
    const subject = fixture();
    recordAcceptanceObservation(subject);
    const accepted = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(accepted.status).toBe('satisfied');

    const changed = CONTRACT_TEXT.replace('Deliver wp-a.', 'Deliver something else.');
    const stale = resolveDependencyAuthority(input(subject, 'module_accepted', {
      dependency: {
        ...dependency('module_accepted'),
        acceptance_authority: moduleAuthorityFor(CONTRACT_REF, changed),
      },
      readFileAtCommit: (repoRoot, commit, path) => (path === CONTRACT_REF ? changed : gitShow(repoRoot, commit, path)),
    }));
    expect(stale.status).toBe('authority_unavailable');
    expect(stale.authority_revision).toBeNull();
    expect(stale.authority_revision).not.toBe(accepted.authority_revision);
  });

  test('a forged or misfiled observation is unavailable, never accepted', () => {
    const subject = fixture();
    const observation = recordAcceptanceObservation(subject);
    const path = observationPathFor(subject);
    const exact = input(subject, 'module_accepted');
    expect(resolveDependencyAuthority(exact).status).toBe('satisfied');

    const forgedId = { ...observation, observation_id: `sha256:${'1'.repeat(64)}` };
    writeFileSync(path, `${JSON.stringify(forgedId)}\n`);
    expect(resolveDependencyAuthority(exact).status).toBe('authority_unavailable');

    // Semantically identical but not the authority's canonical byte order.
    writeFileSync(path, `${JSON.stringify(observation, null, 2)}\n`);
    expect(resolveDependencyAuthority(exact).status).toBe('authority_unavailable');

    // Correct bytes under the wrong subject key are never reachable and never
    // resolve when the reader is pointed at that key.
    recordAcceptanceObservation(subject);
    const misfiled = join(dirname(path), `${'0'.repeat(64)}.json`);
    copyFileSync(path, misfiled);
    rmSync(path, { force: true });
    expect(resolveDependencyAuthority(exact).status).toBe('authority_unavailable');
  });

  test('verifyAcceptance keeps the acceptance policy rule set this branch extracted', () => {
    const subject = fixture();
    const valid = acceptanceReceipt(subject);
    const base = {
      receipt: valid,
      repositoryRoot: subject.root,
      admission: approval(subject.root).admission,
      grantSha256: approval(subject.root).grant,
      waiverGrant: null,
    };
    expect(validateAcceptanceReceiptAgainstPolicy(base)).toEqual({ ok: true });

    // Frozen domain policy is {reviewer: Codex, source: generic-review}; retired labels never satisfy it.
    expect(validateAcceptanceReceiptAgainstPolicy({
      ...base,
      receipt: { ...valid, expected_reviewer: 'Claude', reviewer: 'Claude', source: 'generic-review' },
    }).ok).toBe(false);
    expect(validateAcceptanceReceiptAgainstPolicy({
      ...base,
      receipt: { ...valid, source: 'claude-review' } as unknown as AcceptanceReceipt,
    }).ok).toBe(false);
    for (const source of ['claude-review','codex-review']) {
      expect(validateAcceptanceReceiptAgainstPolicy({ ...base,receipt: { ...valid,source } as AcceptanceReceipt }).ok).toBe(false);
    }
    expect(validateAcceptanceReceiptAgainstPolicy({
      ...base,
      admission: { ...base.admission, goal: { ...base.admission.goal, revision: engineerSha256('other goal') } },
    }).ok).toBe(false);

    const grant = waiverGrant(subject);
    const waived = waivedReceipt(subject, grant);
    expect(validateAcceptanceReceiptAgainstPolicy({ ...base, receipt: waived, waiverGrant: grant }).ok).toBe(true);
    expect(validateAcceptanceReceiptAgainstPolicy({
      ...base,
      receipt: waived,
      waiverGrant: waiverGrant(subject, { summary: 'owner waived wp-a again' }),
    }).ok).toBe(false);
    expect(validateAcceptanceReceiptAgainstPolicy({ ...base, receipt: waived, waiverGrant: null }).ok).toBe(false);
    const { protocol: _protocol, kind: _kind, campaign_sha256: _campaign, admission_sha256: _admission, ...sealedInput } = approval(subject.root).admission;
    const sealedAdmission = createReviewAdmission({ ...sealedInput, allowed_paths: [...sealedInput.allowed_paths],
      verification_plan: JSON.parse(JSON.stringify(sealedInput.verification_plan)),
      policy: { ...approval(subject.root).admission.policy, user_waiver: 'forbidden' } });
    const sealedGrant = waiverGrant(subject, { admission_sha256: sealedAdmission.admission_sha256 });
    expect(validateAcceptanceReceiptAgainstPolicy({ ...base, admission: sealedAdmission,
      receipt: waivedReceipt(subject, sealedGrant, { admission_sha256: sealedAdmission.admission_sha256 }),
      waiverGrant: sealedGrant }).ok).toBe(false);
  });

  test('publication_integrated requires committed exact provider evidence and refuses moved selections', () => {
    const subject = fixture();
    const base = subject.commit;
    writeRepoFile(subject.root, 'feature.txt', 'feature\n');
    git(subject.root, 'add', 'feature.txt'); git(subject.root, 'commit', '-m', 'feature');
    const head = git(subject.root, 'rev-parse', 'HEAD');
    const provider = providerFixture(subject, head, base);
    const exact = integrationInput(subject, 'publication_integrated', provider);
    const integrated = resolveDependencyAuthority(exact);
    expect(integrated.status).toBe('satisfied');
    expect(integrated.evidence_refs.map(entry => entry.ref)).toContain(`provider-integration:${head}`);
    const movedTarget = retargeted(subject, { task_revision: 'a'.repeat(64) });
    const moved = resolveDependencyAuthority({ ...exact, ...movedTarget, reads: movedTarget.reads.map(read => ({ ...read, commit: exact.reads[0]!.commit })) });
    expect(moved.status).toBe('authority_unavailable');
    provider.provider.get(1)!.tree = 'f'.repeat(40);
    const unreadable = resolveDependencyAuthority(exact);
    expect(unreadable.status).toBe('authority_unavailable');
    expect(unreadable.authority_revision).toBeNull();
    expect(resolveDependencyAuthority({ ...exact, dependency: { ...exact.dependency, acceptance_authority: null } }).status).toBe('authority_unavailable');
  });

  test('publication_integrated refuses a merge outside the selected candidate', () => {
    const subject = fixture();
    const provider = providerFixture(subject, subject.commit, subject.commit);
    const exact = integrationInput(subject, 'publication_integrated', provider);
    provider.provider.get(1)!.merge = git(subject.root, 'commit-tree', provider.tree, '-p', subject.commit, '-m', 'unrelated merge');
    expect(resolveDependencyAuthority(exact).status).toBe('authority_unavailable');
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
    const provider = providerFixture(subject, head, base);

    recordAcceptanceObservation(subject);
    expect(resolveDependencyAuthority(input(subject, 'module_accepted')).status).toBe('satisfied');
    const withoutProduct = resolveDependencyAuthority(input(subject, 'product_accepted'));
    expect(withoutProduct.status).toBe('authority_unavailable');

    const contract = createIntegrationContract({ repo_root: subject.root }, {
      approved_prd_ref: PRD_REF,
      source_spec_ref: 'docs/spec.md',
      integration_group: 'issue-284',
      required_pull_requests: [provider.selection],
      required_constraints: ['constraint-a'],
    });
    const envelope = createIntegrationEnvelope(provider.environment, {
      contract_sha256: contract.contract_sha256,
      base_sha: base,
      final_head_sha: head,
      final_tree_sha: provider.tree,
    });
    const matrix = createAcceptanceMatrix(provider.environment, {
      contract_sha256: contract.contract_sha256,
      envelope_sha256: envelope.envelope_sha256,
      rows: [{ constraint_id: 'constraint-a', evidence_ref: 'docs/evidence/constraint-a.json', result: 'pass' }],
      verifier_receipt_ref: 'docs/evidence/verifier.json',
    });
    const receipt = acceptanceReceipt(subject, { target_revision: base });
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    const projection = await createProductAcceptanceProjection(
      { ...provider.environment, authority_home: subject.root },
      {
        contract_sha256: contract.contract_sha256,
        envelope_sha256: envelope.envelope_sha256,
        matrix_sha256: matrix.matrix_sha256,
        review_authority: approvals.get(subject.root)!.source,
      },
      { verify_acceptance: async () => receipt, read_acceptance_receipt_bytes: () => receiptBytes },
    );
    expect(listProductAcceptanceProjections(subject.root)).toEqual([projection]);

    const exact = integrationInput(subject, 'product_accepted', provider, { projection_sha256: projection.projection_sha256,
      approved_prd_ref: PRD_REF, approved_prd_sha256: engineerSha256(PRD_TEXT) });
    const withReceipt = { ...exact, readers: { ...exact.readers, readAcceptanceReceiptBytes: () => receiptBytes } };
    const accepted = resolveDependencyAuthority(withReceipt);
    expect(accepted.status).toBe('satisfied');
    expect(accepted.evidence_refs.map((entry) => entry.ref))
      .toContain(`product-acceptance-projection:${projection.projection_sha256}`);
    expect(accepted.authority_revision).not.toBe(withoutProduct.authority_revision);

    const moved = retargeted(subject, { task_revision: 'b'.repeat(64) });
    const movedTarget = resolveDependencyAuthority({ ...withReceipt, ...moved, reads: moved.reads.map(read => ({ ...read, commit: exact.reads[0]!.commit })) });
    expect(movedTarget.status).toBe('authority_unavailable');

    const otherRequirement = resolveDependencyAuthority(input(subject, 'product_accepted', {
      dependency: {
        ...dependency('product_accepted'),
        acceptance_authority: { authority_kind: 'product_acceptance', subject_ref: 'docs/spec.md', subject_revision: engineerSha256('# Source spec\n') },
      },
    }));
    expect(otherRequirement.status).toBe('authority_unavailable');

    const unreadable = resolveDependencyAuthority({ ...withReceipt,
      readers: { ...withReceipt.readers, readProductAcceptanceProjection: () => { throw new Error('product store unavailable'); } },
    });
    expect(resolveDependencyAuthority({ ...withReceipt, readers: { ...withReceipt.readers,
      readAcceptanceReceiptBytes: () => Buffer.from('{"substituted":true}\n') } }).status).toBe('authority_unavailable');
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
    recordAcceptanceObservation(local, acceptanceReceipt(local, {
      admission_sha256: engineerSha256('Local decoy'),
    }));
    recordAcceptanceObservation(remote);

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
      dependency: { ...dependency('module_accepted', OTHER_REPO_ID), acceptance_authority: reference(remote.root) },
      target: remoteTarget,
      reads,
      registry,
      readFileAtCommit: (repoRoot, commit, path) => gitShow(repoRoot, commit, path),
      readers: admissionReaders(remote.root, remote.home),
    };
    const resolved = resolveDependencyAuthority(crossInput);
    expect(resolved.status).toBe('satisfied');
    // The remote repository's own observation answered; the same-named local
    // contract path was never opened.
    const remoteObservation = readFileSync(observationPathFor(remote), 'utf-8');
    expect(resolved.evidence_refs.map((entry) => entry.ref))
      .toContain(`acceptance-observation:${(JSON.parse(remoteObservation) as AcceptanceVerificationObservationV1).observation_id}`);
    expect(remoteObservation).not.toEqual(readFileSync(observationPathFor(local, acceptanceReceipt(local, {
      admission_sha256: engineerSha256('Local decoy'),
    })), 'utf-8'));

    // Cross-repository replay: repo A's observation bytes copied verbatim into
    // repo B's gate store bind repo A's root and can never answer for repo B.
    const replayed = observationPathFor(remote);
    rmSync(replayed, { force: true });
    recordAcceptanceObservation(local);
    copyFileSync(observationPathFor(local), replayed);
    const replay = resolveDependencyAuthority(crossInput);
    expect(replay.status).toBe('authority_unavailable');
    expect(replay.authority_revision).toBeNull();

    // Authorization revocation is unavailable, never satisfied.
    rmSync(replayed, { force: true });
    recordAcceptanceObservation(remote);
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
    recordAcceptanceObservation(subject);
    const resolved = resolveDependencyAuthority(input(subject, 'module_accepted', {
      dependency: dependency('module_accepted', OTHER_REPO_ID),
    }));
    expect(resolved.status).toBe('authority_unavailable');
    expect(resolved.authority_revision).toBeNull();
    expect(resolved.evidence_refs).toEqual([]);
  });

  test('the resolver refuses a target that is not the exact Work Package its edge names', () => {
    const subject = fixture();
    recordAcceptanceObservation(subject);
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
      admission: approval(subject.root).admission,
      grantSha256: approval(subject.root).grant,
      waiverGrant: null,
    };
    expect(validateAcceptanceReceiptAgainstPolicy(base)).toEqual({ ok: true });
    expect([...Object.keys(valid)].sort()).toEqual([...CONSUMED_RECEIPT_KEYS].sort());

    // Deliberate-break probe: every declared key must be able to refuse.
    const breaks: Record<keyof AcceptanceReceipt, unknown> = {
      protocol: 1,
      kind: 'repo-harness-other-receipt',
      repository_root: join(subject.root, 'elsewhere'),
      campaign_sha256: engineerSha256('other campaign'),
      admission_sha256: engineerSha256('other admission'),
      grant_sha256: '../escape.md',
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
      source: 'codex-review',
      request_id: '', context_sha256: 'not-a-digest', result_sha256: 'not-a-digest', actual_harness: 'claude', actual_role: 'fast-worker', actual_model: '',
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

  test('an archive-projected contract subject cannot borrow the accepted contract fingerprint', () => {
    const subject = fixture();
    recordAcceptanceObservation(subject);
    // authorityFingerprint() normalizes the archive envelope away, so these
    // bytes hash to the accepted contract's digest while never having been
    // sealed as an archive projection.
    const forged = [
      '> **Archived**: 2026-09-02 21:01',
      '> **Related Plan**: plans/archive/plan-wp-a.md',
      '> **Outcome**: Completed',
      '> **Lifecycle**: contract',
      '> **Parent Run ID**: run-issue-284',
      '> **Archive Projection V1**: `tasks/contracts/wp-a.contract.md` => `tasks/archive/contract-20260902-2101-wp-a.md`',
      '> **Archive Projection V1**: `plans/plan-wp-a.md` => `plans/archive/plan-wp-a.md`',
      '',
      CONTRACT_TEXT,
    ].join('\n');
    expect(authorityFingerprint(forged)).toBe(authorityFingerprint(CONTRACT_TEXT));

    const resolved = resolveDependencyAuthority(input(subject, 'module_accepted', {
      dependency: {
        ...dependency('module_accepted'),
        acceptance_authority: moduleAuthorityFor(CONTRACT_REF, forged),
      },
      readFileAtCommit: (repoRoot, commit, path) => (
        path === CONTRACT_REF ? forged : gitShow(repoRoot, commit, path)
      ),
    }));
    expect(resolved.status).toBe('authority_unavailable');
    expect(resolved.authority_revision).toBeNull();
  });

  test('the authority revision binds the canonical target commit', () => {
    const subject = fixture();
    recordAcceptanceObservation(subject);
    const first = resolveDependencyAuthority(input(subject, 'module_accepted'));
    const second = resolveDependencyAuthority(input(subject, 'module_accepted'));
    expect(second.authority_revision).toBe(first.authority_revision);
    const moved = resolveDependencyAuthority(input(subject, 'module_accepted', {
      reads: subject.reads.map((read) => ({ ...read, commit: 'f'.repeat(40) })),
      readFileAtCommit: (repoRoot, _commit, path) => gitShow(repoRoot, subject.commit, path),
    }));
    expect(moved.authority_revision).not.toBe(first.authority_revision);
    expect(first.authority_revision).toBe(engineerSha256(canonicalEngineerJson(JSON.parse(canonicalEngineerJson({
      protocol: 1,
      kind: 'repo-harness-dependency-authority-observation',
      dependency: {
        repository_id: REPO_ID,
        work_package_id: 'wp-a',
        required_state: 'module_accepted',
        acceptance_authority: reference(subject.root),
      },
      registry: { authorization_revision: 3, access_mode: 'read_write', registered: true },
      canonical_commit: subject.commit,
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
