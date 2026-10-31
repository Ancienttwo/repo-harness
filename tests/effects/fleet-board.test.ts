import { observeReviewIssueGoal } from '../../src/effects/admission/issue-goal';
import { readReviewAdmissionSource } from '../../src/effects/admission/admission-source';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { revokeActiveReviewAdmission } from '../../src/effects/admission/admission-store';
import { buildProviderIssueObservation, buildExternalSourceRefreshReceipt } from '../../src/core/external-sources/issue-observation';
import { writeProviderIssueObservation, writeExternalSourceRefreshReceipt } from '../../src/effects/external-sources/store';
import type { FleetBoardPullRequestSelection } from '../../src/effects/fleet/board';
import { fixtureTaskId } from '../helpers/sprint-fixture';
import { describe, expect, onTestFinished, test } from 'bun:test';
import { execFileSync } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  collectFleetBoard,
  createFleetProviderObservationLimiter,
  productionFleetBoardDependencies,
  watchFleetBoard,
  type FleetBoardDependencies,
} from '../../src/effects/fleet/board';
import { AgentRuntimeEffectStoreError } from '../../src/effects/engineers/agent-runtime-effect-store';
import { TaskInboxError } from '../../src/effects/fleet/task-inbox';
import type { FleetBoardCardInputV2 } from '../../src/core/fleet/board';
import {
  repoHarnessRepoIdFor,
  type RepoHarnessRegisteredRepo,
  type RepoHarnessRegistryStrictSnapshot,
} from '../../src/effects/repo-registry';
import { buildReviewSubject } from '../../src/effects/review/diff-fingerprint';

function repo(index: number): RepoHarnessRegisteredRepo {
  return {
    id: `repo-${String(index).padStart(2, '0')}`,
    path: `/fixtures/repo-${index}`,
    accessMode: index % 2 === 0 ? 'read_write' : 'read_only',
    source: 'manual',
    registeredAt: '2026-08-23T00:00:00.000Z',
    lastSeenAt: '2026-08-23T00:00:00.000Z',
  };
}

function registry(repos: readonly RepoHarnessRegisteredRepo[]): RepoHarnessRegistryStrictSnapshot {
  return {
    registryPath: '/fixtures/registered-repos.json', authorizationRevision: 7,
    registryRevision: 'sha256:registry', repos,
  };
}

function card(index: number): FleetBoardCardInputV2 {
  return { provider_repository_id: '1001', provider_issue_id: String(2000 + index), issue_state: 'open', issue_revision: `sha256:${'b'.repeat(64)}`,
    execution_status: 'observed', execution: null, task_id: null, task_label: `fixture row ${index}`, task_index: index,
    merge_readiness: null, execution_readiness: null, readiness_blockers: null,
    feedback: { observation_status: 'unavailable', pending_count: 0, no_progress: false, repair_actions: [] },
    inbox: { observation_status: 'unavailable', unread_count: 0, addressed_to_current_claim: false, delivery_state: 'pending', runtime_reachability: 'unknown', effect_sha256: null, delivery_evidence: null, failure_class: null },
    snapshot_consistency: 'stable', error: null };
}
function seedIssues(root: string, repositoryId: string, titles: readonly string[], eligibilityReasons: readonly string[] = [], firstIssueNumber = 1, observedAt = '2026-08-31T00:00:00.000Z'): void {
  const digest = `sha256:${'a'.repeat(64)}`;
  const issues = titles.map((title, index) => buildProviderIssueObservation({ registered_repository_id: repositoryId, provider: 'github', provider_host: 'github.com',
    provider_repository_id: '1001', provider_issue_id: String(2001 + index), display_ref: `example/fleet#${firstIssueNumber + index}`, url: `https://github.com/example/fleet/issues/${firstIssueNumber + index}`,
    observed_at: observedAt, provider_created_at: null, provider_updated_at: null, state: 'open', title, body: 'goal', labels: [], assignees: [],
    comments_policy: 'omitted', policy_revision: digest, eligible: eligibilityReasons.length === 0, eligibility_reasons: [...eligibilityReasons].sort() }));
  issues.forEach(issue => writeProviderIssueObservation(root, issue));
  writeExternalSourceRefreshReceipt(root, buildExternalSourceRefreshReceipt({ receipt_id: 'complete', registered_repository_id: repositoryId, provider: 'github', provider_host: 'github.com',
    provider_repository_id: '1001', provider_display_ref: 'example/fleet', policy_revision: digest, started_at: observedAt, completed_at: new Date(Date.parse(observedAt) + 1000).toISOString(),
    outcome: 'complete', pages_fetched: 1, issues_seen: issues.length, observations_written: issues.length, limits: { max_pages: 2, max_issues: 1000, max_body_bytes: 1000, max_total_bytes: 1000000, deadline_ms: 1000 },
    source_revisions: issues.map(issue => issue.source_revision).sort(), failure: null }));
}
function registerFixture(root: string): RepoHarnessRegisteredRepo {
  const entry: RepoHarnessRegisteredRepo = { id: repoHarnessRepoIdFor(realpathSync(root)), path: realpathSync(root), accessMode: 'read_only', source: 'manual',
    registeredAt: '2026-08-23T00:00:00.000Z', lastSeenAt: '2026-08-23T00:00:00.000Z' };
  const home = mkdtempSync(join(tmpdir(), 'provider-board-registry-')), previous = process.env.REPO_HARNESS_HOME;
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [entry] }));
  process.env.REPO_HARNESS_HOME = home;
  onTestFinished(() => { if (previous === undefined) delete process.env.REPO_HARNESS_HOME; else process.env.REPO_HARNESS_HOME = previous; rmSync(home, { recursive: true, force: true }); });
  return entry;
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function shellSingleQuoted(value: string): string {
  return `'${value.replace(/'/gu, "'\\\"'\\\"'")}'`;
}

function createReviewingProviderFixture(
  workspaceRoot: string,
  cards: number,
  options: { readonly foreign_repository_for?: number } = {},
): { readonly repo: RepoHarnessRegisteredRepo; readonly gh_bin: string; readonly counter_dir: string; readonly pull_requests: readonly FleetBoardPullRequestSelection[] } {
  const root = join(workspaceRoot, 'repo');
  mkdirSync(root);
  const sprintPath = 'plans/sprints/fleet-provider.sprint.md';
  const taskNames = Array.from({ length: cards }, (_, index) => `observe provider card ${index + 1}`);
  git(root, 'init', '-b', 'main');
  git(root, 'remote', 'add', 'origin', 'https://github.com/example/fleet.git');
  git(root, 'config', 'user.name', 'Fleet Provider Test');
  git(root, 'config', 'user.email', 'fleet-provider@test.invalid');
  mkdirSync(join(root, '.ai/harness/sprint'), { recursive: true });
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/sprint/active-sprint'), `${sprintPath}\n`);
  writeFileSync(join(root, sprintPath), [
    '# Fleet provider fixture', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    ...taskNames.map((task, index) => `| ${index + 1} | ${fixtureTaskId(`${task}`)} | [ ] | ${task} | inline | provider observation remains read only | (pending) |`),
    '',
  ].join('\n'));
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'switch', '-c', 'codex/fleet-provider');
  writeFileSync(join(root, 'feature.txt'), 'provider\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'provider fixture');
  const head = git(root, 'rev-parse', 'HEAD');
  const entry = registerFixture(root);
  seedIssues(root, entry.id, taskNames);
  const providerCases: string[] = [];
  for (const [index] of taskNames.entries()) {
    const providerPr = JSON.stringify({
      number: index + 1, url: `https://github.com/example/fleet/pull/${index + 1}`, state: 'OPEN', isDraft: false,
      headRefOid: head, headRefName: 'codex/fleet-provider', baseRefOid: base, baseRefName: 'main',
      body: '', reviewDecision: null, changedFiles: 0, mergeable: 'MERGEABLE',
    });
    providerCases.push(`  ${index + 1}) printf '%s\\n' ${shellSingleQuoted(providerPr)} ;;`);
  }
  // Provider telemetry must not change the repository subject sampled by readiness.
  const counterDir = join(workspaceRoot, 'provider-counter');
  mkdirSync(counterDir);
  writeFileSync(join(counterDir, 'active'), '0\n');
  writeFileSync(join(counterDir, 'maximum'), '0\n');
  const ghBin = join(workspaceRoot, 'fake-gh.sh');
  writeFileSync(ghBin, [
    '#!/bin/sh', 'set -eu', 'counter="${FLEET_PROVIDER_COUNTER_DIR:?}"',
    'lock() { while ! mkdir "$counter/lock" 2>/dev/null; do sleep 0.002; done; }',
    'unlock() { rmdir "$counter/lock"; }',
    'lock', 'active=$(cat "$counter/active")', 'active=$((active + 1))', 'printf "%s\\n" "$active" > "$counter/active"',
    'maximum=$(cat "$counter/maximum")', 'if [ "$active" -gt "$maximum" ]; then printf "%s\\n" "$active" > "$counter/maximum"; fi', 'unlock',
    'cleanup() { lock; active=$(cat "$counter/active"); printf "%s\\n" "$((active - 1))" > "$counter/active"; unlock; }',
    'trap cleanup EXIT INT TERM', 'printf "%s\\n" "$*" >> "$counter/calls"', 'sleep 0.04',
    'if [ "$1" = "repo" ] && [ "$2" = "view" ]; then printf "%s\\n" \'{"id":"R_fleet_provider","nameWithOwner":"example/fleet"}\'; exit 0; fi',
    'if [ "$1" = "pr" ] && [ "$2" = "view" ]; then case "$3" in', ...providerCases, '  *) exit 2 ;;', 'esac; exit 0; fi',
    'if [ "$1" = "api" ] && [ "$2" = "repos/example/fleet" ]; then printf "%s\\n" \'{"id":1001,"node_id":"R_fleet_provider","full_name":"example/fleet","default_branch":"main"}\'; exit 0; fi',
    ...taskNames.flatMap((_, index) => {
      const number = index + 1;
      const checks = [{ name: 'Required / CI', bucket: 'pass', link: `https://github.com/example/fleet/actions/runs/${number}/job/1` }];
      const run = { path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: head, pull_requests: [{ number, head: { sha: head }, base: { sha: base } }], status: 'completed', conclusion: 'success' };
      const reviews = { data: { node: { id: 'R_fleet_provider', pullRequest: { number, headRefOid: head, baseRefOid: base, reviewDecision: null, latestOpinionatedReviews: { pageInfo: { hasNextPage: false }, nodes: [] }, reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] } } } } };
      return [
        `if [ "$1" = "pr" ] && [ "$2" = "checks" ] && [ "$3" = "${number}" ]; then printf '%s\\n' ${shellSingleQuoted(JSON.stringify(checks))}; exit 0; fi`,
        `if [ "$1" = "api" ] && [ "$2" = "repos/example/fleet/actions/runs/${number}" ]; then printf '%s\\n' ${shellSingleQuoted(JSON.stringify(run))}; exit 0; fi`,
        `if [ "$1" = "api" ] && [ "$2" = "graphql" ]; then for arg in "$@"; do if [ "$arg" = "number=${number}" ]; then printf '%s\\n' ${shellSingleQuoted(JSON.stringify(reviews))}; exit 0; fi; done; fi`,
      ];
    }),
    'case "$2" in repos/example/fleet/contents/*) printf "%s\\n" \'{"status":"404"}\'; exit 1 ;; esac',
    'exit 2',
  ].join('\n'));
  chmodSync(ghBin, 0o755);
  return {
    repo: entry,
    gh_bin: ghBin,
    counter_dir: counterDir,
    pull_requests: taskNames.map((task, index) => ({ repository_id: entry.id, provider_issue_id: String(2001 + index),
      pull_request: { repository: options.foreign_repository_for === index + 1 ? 'example/foreign' : 'example/fleet', provider_repository_id: '1001', pr_number: index + 1, expected_head_sha: head, expected_base_sha: base } })),
  };
}

function createPlainBoardFixture(root: string, rows: number, repoId: string, firstIssueNumber = 1): RepoHarnessRegisteredRepo {
  const sprintPath = 'plans/sprints/fleet-plain.sprint.md';
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fleet Plain Test');
  git(root, 'config', 'user.email', 'fleet-plain@test.invalid');
  mkdirSync(join(root, '.ai/harness/sprint'), { recursive: true });
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/sprint/active-sprint'), `${sprintPath}\n`);
  const rowNames = Array.from({ length: rows }, (_, index) => `observe plain card ${index + 1}`);
  writeFileSync(join(root, sprintPath), [
    '# Fleet plain fixture', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    ...rowNames.map((task, index) => `| ${index + 1} | ${fixtureTaskId(task)} | [ ] | ${task} | inline | plain observation remains read only | (pending) |`),
    '',
  ].join('\n'));
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'plain fixture');
  const entry = registerFixture(root);
  seedIssues(root, entry.id, rowNames, [], firstIssueNumber);
  return entry;
}

describe('fleet board collector', () => {
  test.each(['labels', 'issue_numbers'] as const)('admission source keeps the %s discovery policy and cannot select an issue by itself', selectionKind => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'fleet-selected-source-')));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, '.ai/harness'), { recursive: true });
    const path = join(root, '.ai/harness/policy.json');
    const bytes = JSON.stringify({ external_sources: { version: 1, mode: 'manual', github: {
      enabled: true, repository: 'acme/widgets',
      selection: selectionKind === 'labels' ? { kind: 'labels', labels_all: ['ready'], assignees_any: [] }
        : { kind: 'issue_numbers', issue_numbers: [902, 903] },
      limits: { max_pages: 1, max_issues: 10, max_body_bytes: 4096, max_total_bytes: 8192, deadline_ms: 5000 },
    } } });
    writeFileSync(path, bytes);
    const values = { 'repository-id': '1001', 'issue-id': '2001', 'campaign-id': 'review',
      'grant-sha256': `sha256:${'a'.repeat(64)}`, 'policy-sha256': `sha256:${'b'.repeat(64)}`, actor: 'owner' };
    const issue = { id: '2001', number: 903, html_url: 'https://github.com/acme/widgets/issues/903', state: 'open',
      title: 'Approved goal', body: 'Selected issue only', updated_at: '2026-10-25T00:00:00Z' };
    const calls: string[][] = [];
    const runner = (args: readonly string[]) => {
      calls.push([...args]);
      return { stdout: JSON.stringify(args.includes('repos/acme/widgets/issues/903') ? issue
        : { id: '1001', full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' }) };
    };
    const unscoped = readReviewAdmissionSource(root, values);
    expect(() => observeReviewIssueGoal({ policy: unscoped.issuePolicy, repository_id: '1001', issue_id: '2001', runner })).toThrow('review_goal_requires_one_issue');
    expect(calls).toHaveLength(0);
    expect(readFileSync(path, 'utf8')).toBe(bytes);
  });

  test.each([['inline', 'labels'], ['contract', 'issue_numbers']] as const)('selects a fresh explicit %s campaign through the real %s policy reader', async (executionMode, selectionKind) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'fleet-admitted-mode-')));
    const authorityHome = realpathSync(mkdtempSync(join(tmpdir(), 'fleet-admitted-home-')));
    onTestFinished(() => { rmSync(root, { recursive: true, force: true }); rmSync(authorityHome, { recursive: true, force: true }); });
    const registered = createPlainBoardFixture(root, 1, 'unused', 903);
    const entry = { ...registered, accessMode: 'read_write' as const };
    const approved = seedReviewAdmissionFixture(root, authorityHome, { repositoryId: '1001', issueId: '2001', executionMode });
    const policyPath = join(root, '.ai/harness/policy.json');
    const policyBytes = JSON.stringify({ external_sources: { version: 1, mode: 'manual', github: {
      enabled: true, repository: 'acme/widgets',
      selection: selectionKind === 'labels' ? { kind: 'labels', labels_all: ['ready'], assignees_any: [] }
        : { kind: 'issue_numbers', issue_numbers: [902, 903] },
      limits: { max_pages: 2, max_issues: 10, max_body_bytes: 4096, max_total_bytes: 8192, deadline_ms: 5000 },
    } } });
    writeFileSync(policyPath, policyBytes);
    const association = { repository_id: entry.id, provider_repository_id: '1001', provider_issue_id: '2001',
      admission: { campaign_id: approved.admission.campaign_id, grant_sha256: approved.grant,
        policy_sha256: approved.admission.policy.policy_sha256, actor_id: approved.admission.actor_id } };
    let reads = 0;
    const dependencies: FleetBoardDependencies = { ...productionFleetBoardDependencies,
      read_registry: () => registry([entry]),
      read_admission_source: (selectedRoot, values) => {
        expect(realpathSync(selectedRoot)).toBe(root);
        expect(values).toEqual({ 'repository-id': '1001', 'issue-id': '2001', 'campaign-id': association.admission.campaign_id,
          'grant-sha256': approved.grant, 'policy-sha256': association.admission.policy_sha256, actor: association.admission.actor_id });
        const source = readReviewAdmissionSource(selectedRoot, values);
        expect(source.issuePolicy).toMatchObject({ mode: 'manual', github: { repository: 'acme/widgets',
          selection: { kind: selectionKind },
          limits: { max_pages: 2, max_issues: 10, max_body_bytes: 4096, max_total_bytes: 8192, deadline_ms: 5000 } } });
        // Only the account-owned test home and offline provider transport are injected.
        return { ...source, authorityHome, runner: (args, options) => {
          reads++; expect(options.timeout_ms).toBeGreaterThan(0); expect(options.timeout_ms).toBeLessThanOrEqual(30_000);
          // The approved record, not the discovery policy, selects the one provider issue.
          expect(args.filter(arg => arg.startsWith('repos/'))).toEqual([expect.stringMatching(/^repos\/acme\/widgets(\/issues\/903)?$/)]);
          return approved.source.runner!(args, options);
        } };
      } };
    const without = await collectFleetBoard({}, dependencies);
    expect(without.repositories[0]!.cards[0]!.placement.kind).toBe('unclassified');
    expect(without.snapshot_consistency).toBe('degraded');
    expect(reads).toBe(0);
    const result = await collectFleetBoard({ admission_associations: [association] }, dependencies);
    expect(result.repositories[0]!.cards[0]).toMatchObject({
      execution_readiness: executionMode === 'inline' ? 'inline_ready' : 'execution_ready', readiness_blockers: [],
      placement: executionMode === 'inline' ? { kind: 'alternate_workflow', workflow: 'inline' } : { kind: 'column', column: 'available' },
    });
    expect(reads).toBe(8);
    expect(readFileSync(policyPath, 'utf8')).toBe(policyBytes);
    approved.issue.id = '2002';
    const wrongIssue = await collectFleetBoard({ admission_associations: [association] }, dependencies);
    expect(wrongIssue.repositories[0]!.cards[0]).toMatchObject({ execution_readiness: null,
      placement: { kind: 'unclassified', reason: 'readiness_unavailable' } });
    approved.issue.id = '2001';
    reads = 0;
    const readOnly = await collectFleetBoard({ admission_associations: [association] }, { ...dependencies, read_registry: () => registry([registered]) });
    expect(readOnly.repositories[0]!.cards[0]!.placement.kind).toBe('preparation');
    expect(reads).toBe(0);
    // This is a later provider refresh, not a same-time competing snapshot.
    seedIssues(root, entry.id, ['ineligible'], ['missing_label:ready'], 903, '2026-08-31T00:01:00.000Z');
    const ineligible = await collectFleetBoard({ admission_associations: [association] }, dependencies);
    expect(ineligible.repositories[0]!.cards[0]!.placement.kind).toBe('preparation');
    expect(ineligible.repositories[0]!.cards[0]!.readiness_blockers).toEqual([
      { code: 'provider_ineligible', attention_owner: 'user', eligibility_reasons: ['missing_label:ready'] },
    ]);
    expect(reads).toBe(0);
  });

  test.each(['revoked', 'stale', 'goal_changed', 'changed_during_read', 'provider_unavailable'] as const)('keeps %s campaign authority unclassified', async failure => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'fleet-admitted-refusal-')));
    const authorityHome = realpathSync(mkdtempSync(join(tmpdir(), 'fleet-admitted-home-')));
    onTestFinished(() => { rmSync(root, { recursive: true, force: true }); rmSync(authorityHome, { recursive: true, force: true }); });
    const entry = { ...createPlainBoardFixture(root, 1, 'unused'), accessMode: 'read_write' as const };
    const approved = seedReviewAdmissionFixture(root, authorityHome, { repositoryId: '1001', issueId: '2001', executionMode: 'inline' });
    const association = { repository_id: entry.id, provider_repository_id: '1001', provider_issue_id: '2001',
      admission: { campaign_id: approved.admission.campaign_id, grant_sha256: approved.grant,
        policy_sha256: approved.admission.policy.policy_sha256, actor_id: approved.admission.actor_id } };
    if (failure === 'revoked') revokeActiveReviewAdmission({ repoRoot: root, authorityHome, repository_id: '1001', issue_id: '2001',
      campaign_id: approved.admission.campaign_id, expectedRevision: 1, expectedGrantSha256: approved.grant });
    if (failure === 'stale') seedReviewAdmissionFixture(root, authorityHome, { repositoryId: '1001', issueId: '2001', executionMode: 'contract' });
    if (failure === 'goal_changed') approved.issue.body = 'different provider goal';
    let issueReads = 0;
    const result = await collectFleetBoard({ admission_associations: [association] }, {
      ...productionFleetBoardDependencies, read_registry: () => registry([entry]),
      read_admission_source: () => ({ ...approved.source, runner: (args, options) => {
        if (failure === 'provider_unavailable') throw new Error('offline provider failure');
        if (args.includes('repos/acme/widgets/issues/903') && ++issueReads === 3 && failure === 'changed_during_read') {
          approved.issue.body = 'goal changes between board observations';
        }
        return approved.source.runner!(args, options);
      } }),
    });
    expect(result.repositories[0]!.cards[0]).toMatchObject({ execution_readiness: null, readiness_blockers: null,
      placement: { kind: 'unclassified', reason: 'readiness_unavailable' } });
    if (failure === 'changed_during_read') expect(result.repositories[0]!.cards[0]!.snapshot_consistency).toBe('changed_during_read');
  });

  test('rejects duplicate and foreign admission associations before provider observations', async () => {
    const association = { repository_id: 'repo-01', provider_repository_id: '1001', provider_issue_id: '2001',
      admission: { campaign_id: 'review', grant_sha256: `sha256:${'a'.repeat(64)}`, policy_sha256: `sha256:${'b'.repeat(64)}`, actor_id: 'owner' } };
    const dependencies: FleetBoardDependencies = { read_registry: () => registry([repo(1)]),
      collect_repository: async () => { throw new Error('must not collect a foreign association'); } };
    await expect(collectFleetBoard({ admission_associations: [association, association] }, dependencies)).rejects.toMatchObject({ code: 'fleet_board_argument_invalid' });
    await expect(collectFleetBoard({ admission_associations: [{ ...association, repository_id: 'foreign' }] }, dependencies)).rejects.toMatchObject({ code: 'fleet_board_argument_invalid' });
  });

  test.each([['read_only', 'inline', []], ['read_write', 'inline', []], ['read_write', 'contract', []], ['read_write', 'contract', ['missing_label:ready', 'assignee_not_allowed']]] as const)('real collector projects %s access and provider eligibility independently of retired %s mode', async (accessMode, mode, eligibilityReasons) => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-board-real-'));
    const repoRoot = join(root, 'repo');
    const home = join(root, 'home');
    const sprintPath = 'plans/sprints/fleet-board.sprint.md';
    try {
      mkdirSync(join(repoRoot, '.ai/harness/sprint'), { recursive: true });
      mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
      mkdirSync(home, { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{"worktree_strategy":{"merge_back":{"target":"main"}}}\n');
      writeFileSync(join(repoRoot, '.ai/harness/sprint/active-sprint'), `${sprintPath}\n`);
      writeFileSync(join(repoRoot, sprintPath), [
        '# Fleet fixture', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '',
        '| # | ID | Status | Task | Mode | Acceptance | Plan |',
        '|---|----|--------|------|------|------------|------|',
        `| 1 | ${fixtureTaskId('inspect one registered repository')} | [ ] | inspect one registered repository | ${mode} | projection is read only | (pending) |`, '',
      ].join('\n'));
      execFileSync('git', ['init', '-b', 'main'], { cwd: repoRoot, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.name', 'Fleet Board Test'], { cwd: repoRoot, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.email', 'fleet-board@test.invalid'], { cwd: repoRoot, encoding: 'utf8' });
      execFileSync('git', ['add', '.'], { cwd: repoRoot, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoRoot, encoding: 'utf8' });
      const canonicalRepoRoot = realpathSync(repoRoot);
      const repositoryId = repoHarnessRepoIdFor(canonicalRepoRoot);
      writeFileSync(join(home, 'registered-repos.json'), `${JSON.stringify({
        version: 1, authorizationRevision: 1, repos: [{
          id: repositoryId, path: canonicalRepoRoot, accessMode, source: 'manual',
          registeredAt: '2026-08-23T00:00:00.000Z', lastSeenAt: '2026-08-23T00:00:00.000Z',
        }],
      })}\n`);
      seedIssues(repoRoot, repositoryId, ['inspect one registered repository'], eligibilityReasons);
      // The current approved mode is explicit and independent of the retired row.
      const approved = seedReviewAdmissionFixture(repoRoot, home, { repositoryId: '1001', issueId: '2001', executionMode: 'contract' });
      const association = { repository_id: repositoryId, provider_repository_id: '1001', provider_issue_id: '2001',
        admission: { campaign_id: approved.admission.campaign_id, grant_sha256: approved.grant,
          policy_sha256: approved.admission.policy.policy_sha256, actor_id: approved.admission.actor_id } };
      const registryBefore = readFileSync(join(home, 'registered-repos.json'), 'utf8');
      const statusBefore = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
      // Real Git and readiness reads share process startup with the file pool.
      const result = await collectFleetBoard({ env: { ...process.env, REPO_HARNESS_HOME: home }, timeout_ms: 15_000, admission_associations: [association] },
        { ...productionFleetBoardDependencies, read_admission_source: () => approved.source });
      expect(result.repositories[0]).toMatchObject({ repository_id: repositoryId, status: 'ok' });
      expect(result.repositories[0]?.cards).toHaveLength(1);
      // The label is the digest's own preimage: the same sprint row cell the
      // task id was derived from, not a second description of the work.
      expect(result.repositories[0]?.cards[0]).toMatchObject({
        task_label: 'inspect one registered repository',
        task_index: 1,
      });
      expect(result.snapshot_consistency).toBe('stable');
      expect(result.counts.known_tasks).toBe(1);
      expect(result.repositories[0]?.cards[0]).toMatchObject({ issue_state: 'open',
        placement: accessMode === 'read_only' || eligibilityReasons.length > 0 ? { kind: 'preparation' } : { kind: 'column', column: 'available' },
        task_id: null, execution: null,
        readiness_blockers: accessMode === 'read_only' ? [{ code: 'repo_read_only', attention_owner: 'user' }]
          : eligibilityReasons.length ? [{ code: 'provider_ineligible', attention_owner: 'user', eligibility_reasons: [...eligibilityReasons].sort() }] : [],
      });
      expect(readFileSync(join(home, 'registered-repos.json'), 'utf8')).toBe(registryBefore);
      expect(execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' })).toBe(statusBefore);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  // The 15-second collector bound needs setup and assertion time as well.
  }, 30_000);

  test('bounds ten independent repository reads and isolates the damaged tenth row', async () => {
    const repos = Array.from({ length: 10 }, (_, index) => repo(index));
    let active = 0;
    let maximum = 0;
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry(repos),
      collect_repository: async (entry) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active -= 1;
        if (entry.id === 'repo-09') throw new Error('fixture authority unreadable');
        return {
          repository_id: entry.id, repo_root: entry.path, access_mode: entry.accessMode,
          status: 'ok', snapshot_consistency: 'stable', cards: [card(Number(entry.id.slice(-2)))], error: null,
        };
      },
    };
    const result = await collectFleetBoard({ max_concurrency: 4, timeout_ms: 1_000, observed_at: '2026-08-23T00:00:00.000Z' }, dependencies);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(result.repositories).toHaveLength(10);
    expect(result.repositories.filter((entry) => entry.status === 'ok')).toHaveLength(9);
    expect(result.repositories.find((entry) => entry.repository_id === 'repo-09')).toMatchObject({
      status: 'unreadable', error: { code: 'repo_board_unavailable' },
    });
    expect(result.counts.available).toBe(0);
    expect(result.counts.unclassified).toBe(9);
    expect(result.counts.unreadable).toBe(1);
  });

  test('publishes a changed Fleet verdict when a collector returns a torn card under a stable repository read', async () => {
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry([repo(0)]),
      collect_repository: async (entry) => ({
        repository_id: entry.id,
        repo_root: entry.path,
        access_mode: entry.accessMode,
        status: 'ok',
        snapshot_consistency: 'stable',
        cards: [{ ...card(0), execution_readiness: 'execution_ready', readiness_blockers: [], snapshot_consistency: 'changed_during_read' }],
        error: null,
      }),
    };

    const result = await collectFleetBoard({ timeout_ms: 1_000 }, dependencies);
    expect(result.repositories[0]?.snapshot_consistency).toBe('changed_during_read');
    expect(result.snapshot_consistency).toBe('changed_during_read');
  });

  test('uses one fleet round deadline, drains abort cleanup, and marks every unfinished repository as timed out', async () => {
    const repos = Array.from({ length: 10 }, (_, index) => repo(index));
    let starts = 0;
    let cleanupFinished = 0;
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry(repos),
      collect_repository: async (entry, _registry, options) => {
        starts += 1;
        await new Promise<void>((resolve) => {
          const onAbort = () => {
            clearTimeout(timer);
            setTimeout(() => {
              cleanupFinished += 1;
              resolve();
            }, 20);
          };
          const timer = setTimeout(() => {
            options.signal.removeEventListener('abort', onAbort);
            resolve();
          }, 650);
          options.signal.addEventListener('abort', onAbort, { once: true });
        });
        return {
          repository_id: entry.id, repo_root: entry.path, access_mode: entry.accessMode,
          status: 'ok', snapshot_consistency: 'stable', cards: [card(Number(entry.id.slice(-2)))], error: null,
        };
      },
    };
    const startedAt = Date.now();
    const result = await collectFleetBoard({ max_concurrency: 4, timeout_ms: 1_000 }, dependencies);
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(1_500);
    expect(starts).toBe(8);
    expect(cleanupFinished).toBe(4);
    expect(result.repositories.filter((entry) => entry.status === 'ok')).toHaveLength(4);
    expect(result.repositories.filter((entry) => entry.error?.code === 'repo_collection_timeout')).toHaveLength(6);
  }, 5_000);

  test('does not start providers when synchronous enumeration consumes the fleet round deadline', async () => {
    let collectionCalls = 0;
    const dependencies: FleetBoardDependencies = {
      read_registry: () => {
        const until = Date.now() + 1_050;
        while (Date.now() < until) { /* model a blocking authority read */ }
        return registry([repo(0)]);
      },
      collect_repository: async () => {
        collectionCalls += 1;
        throw new Error('provider observation must not start after the deadline');
      },
    };
    const result = await collectFleetBoard({ timeout_ms: 1_000 }, dependencies);
    expect(collectionCalls).toBe(0);
    expect(result.repositories[0]?.error).toEqual({
      code: 'repo_collection_timeout', message: 'repository collection exceeded the fleet round deadline',
    });
  }, 5_000);

  test('refuses a foreign PR association before querying its provider', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-board-foreign-pr-'));
    try {
      const fixture = createReviewingProviderFixture(root, 1);
      const selected = fixture.pull_requests[0]!;
      const snapshot = await collectFleetBoard({ pull_requests: [{ ...selected, pull_request: {
        ...selected.pull_request, repository: 'example/foreign', provider_repository_id: '2002',
      } }], timeout_ms: 30_000 }, {
        read_registry: () => registry([fixture.repo]),
        collect_repository: productionFleetBoardDependencies.collect_repository,
      });
      expect(snapshot.repositories[0]?.error?.code).toBe('repo_readiness_unavailable');
      expect(existsSync(join(fixture.counter_dir, 'calls'))).toBe(false);
      expect(readFileSync(join(fixture.counter_dir, 'active'), 'utf8').trim()).toBe('0');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('bounds real readiness provider children across reviewing cards with the fleet limiter', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-board-provider-limit-'));
    const previousGhBin = process.env.REPO_HARNESS_GH_BIN;
    const previousCounter = process.env.FLEET_PROVIDER_COUNTER_DIR;
    const controller = new AbortController();
    let collection: Promise<
      { snapshot: Awaited<ReturnType<typeof collectFleetBoard>> } | { error: unknown }
    > | undefined;
    // Bun's test deadline does not cancel the async body. Drain it before
    // restoring its environment or removing files that provider children use.
    onTestFinished(async () => {
      controller.abort();
      await collection;
      if (previousGhBin === undefined) delete process.env.REPO_HARNESS_GH_BIN;
      else process.env.REPO_HARNESS_GH_BIN = previousGhBin;
      if (previousCounter === undefined) delete process.env.FLEET_PROVIDER_COUNTER_DIR;
      else process.env.FLEET_PROVIDER_COUNTER_DIR = previousCounter;
      rmSync(root, { recursive: true, force: true });
    }, 35_000);
    const fixture = createReviewingProviderFixture(root, 4);
    const subjectBefore = buildReviewSubject(fixture.repo.path);
    expect(subjectBefore.status).toBe('ok');
    process.env.REPO_HARNESS_GH_BIN = fixture.gh_bin;
    process.env.FLEET_PROVIDER_COUNTER_DIR = fixture.counter_dir;
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry([fixture.repo]),
      collect_repository: productionFleetBoardDependencies.collect_repository,
    };
    collection = collectFleetBoard({ pull_requests: fixture.pull_requests, max_concurrency: 2, timeout_ms: 30_000, signal: controller.signal }, dependencies)
      .then(snapshot => ({ snapshot }), error => ({ error }));
    const outcome = await collection;
    if (controller.signal.aborted) return;
    if ('error' in outcome) throw outcome.error;
    expect(outcome.snapshot.repositories[0]).toMatchObject({ status: 'ok' });
    expect(outcome.snapshot.repositories[0]?.cards).toHaveLength(4);
    for (const card of outcome.snapshot.repositories[0]!.cards) {
      const selected = fixture.pull_requests.find(selection => selection.provider_issue_id === card.provider_issue_id)!;
      expect(card.merge_readiness).toMatchObject({ protocol: 2, ...selected.pull_request, ready: true, blockers: [] });
    }
    const calls = readFileSync(join(fixture.counter_dir, 'calls'), 'utf8');
    expect(calls).toContain('api repos/example/fleet ');
    for (let number = 1; number <= 4; number += 1) {
      expect(calls).toContain(`pr checks ${number} `);
      expect(calls).toContain(`api repos/example/fleet/actions/runs/${number} `);
      expect(calls).toContain(`number=${number}`);
      expect(calls.split('\n').filter(line => line.startsWith(`pr view ${number} `)).length).toBeGreaterThanOrEqual(2);
    }


    expect(Number.parseInt(readFileSync(join(fixture.counter_dir, 'maximum'), 'utf8'), 10)).toBe(2);
    expect(readFileSync(join(fixture.counter_dir, 'active'), 'utf8').trim()).toBe('0');
    expect(buildReviewSubject(fixture.repo.path)).toEqual(subjectBefore);
  }, 30_000);

  test('does not start a repository observation after the outer signal wins before synchronous collection', async () => {
    const controller = new AbortController();
    let collectionCalls = 0;
    const dependencies: FleetBoardDependencies = {
      read_registry: () => {
        controller.abort();
        return registry([repo(0)]);
      },
      collect_repository: async () => {
        collectionCalls += 1;
        throw new Error('provider observation must not start');
      },
    };
    await expect(collectFleetBoard({ signal: controller.signal, timeout_ms: 1_000 }, dependencies)).rejects.toMatchObject({
      code: 'fleet_watch_aborted_before_first_snapshot',
    });
    expect(collectionCalls).toBe(0);
  });

  test('redacts provider stderr and repository paths from isolated rows', async () => {
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry([repo(0)]),
      collect_repository: async () => {
        throw new Error('gh stderr /private/provider-root token=super-secret');
      },
    };
    const result = await collectFleetBoard({ timeout_ms: 1_000 }, dependencies);
    const rendered = JSON.stringify(result);
    expect(result.repositories[0]?.error).toEqual({
      code: 'repo_board_unavailable', message: 'repository board observation is unavailable',
    });
    expect(rendered).not.toContain('/private/provider-root');
    expect(rendered).not.toContain('super-secret');
    expect(rendered).not.toContain('gh stderr');
  });

  test('keeps Agent Runtime effect-store failures distinct from Task Inbox failures', async () => {
    const collectWith = async (error: Error) => collectFleetBoard({ timeout_ms: 1_000 }, {
      read_registry: () => registry([repo(0)]),
      collect_repository: async () => { throw error; },
    });
    const runtime = await collectWith(new AgentRuntimeEffectStoreError(
      'agent_runtime_effect_unreadable',
      'runtime store /private/runtime-effects secret=redacted',
    ));
    const inbox = await collectWith(new TaskInboxError(
      'task_message_unreadable',
      'task inbox /private/task-inbox secret=redacted',
    ));

    expect(runtime.repositories[0]?.error).toEqual({
      code: 'repo_runtime_effect_unreadable',
      message: 'repository Agent Runtime effect store is unavailable',
    });
    expect(inbox.repositories[0]?.error).toEqual({
      code: 'repo_inbox_unreadable',
      message: 'repository inbox observation is unavailable',
    });
    expect(runtime.repositories[0]?.error?.code).not.toBe(inbox.repositories[0]?.error?.code);
    expect(JSON.stringify(runtime)).not.toContain('/private/runtime-effects');
    expect(JSON.stringify(runtime)).not.toContain('secret=redacted');
    expect(JSON.stringify(inbox)).not.toContain('/private/task-inbox');
    expect(JSON.stringify(inbox)).not.toContain('secret=redacted');
  });

  test('contains one card-internal observation failure and keeps every sibling card of that repository', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-board-card-containment-'));
    const previousGhBin = process.env.REPO_HARNESS_GH_BIN;
    const previousCounter = process.env.FLEET_PROVIDER_COUNTER_DIR;
    try {
      const fixture = createReviewingProviderFixture(root, 2, { foreign_repository_for: 2 });
      process.env.REPO_HARNESS_GH_BIN = fixture.gh_bin;
      process.env.FLEET_PROVIDER_COUNTER_DIR = fixture.counter_dir;
      const result = await collectFleetBoard({ pull_requests: fixture.pull_requests, max_concurrency: 2, timeout_ms: 30_000 }, {
        read_registry: () => registry([fixture.repo]),
        collect_repository: productionFleetBoardDependencies.collect_repository,
      });
      const repository = result.repositories[0]!;

      expect(repository.status).toBe('ok');
      expect(repository.cards).toHaveLength(2);
      const failed = repository.cards.filter((entry) => entry.error !== null);
      const readable = repository.cards.filter((entry) => entry.error === null);
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({
        placement: { kind: 'unclassified', reason: 'observation_failed' },
        merge_readiness: null,
        execution_readiness: 'unsupported', readiness_blockers: [{ code: 'repo_read_only', attention_owner: 'user' }],
        error: { code: 'repo_readiness_unavailable', message: 'repository readiness observation is unavailable' },
      });
      expect(failed[0]?.blocker_codes).toEqual([]);
      expect(readable).toHaveLength(1);
      // No admitted execution was supplied: neither issue can claim a runtime delivery observation.
      for (const entry of repository.cards) expect(entry.inbox).toMatchObject({ observation_status: 'unavailable', delivery_evidence: null });
      expect(readable[0]?.placement.kind).toBe('column');
      expect(repository.snapshot_consistency).toBe('degraded');
      expect(result.counts.unclassified).toBe(1);
      expect(result.counts.unreadable).toBe(0);
      expect(JSON.stringify(result)).not.toContain('receipt is unavailable');
    } finally {
      if (previousGhBin === undefined) delete process.env.REPO_HARNESS_GH_BIN;
      else process.env.REPO_HARNESS_GH_BIN = previousGhBin;
      if (previousCounter === undefined) delete process.env.FLEET_PROVIDER_COUNTER_DIR;
      else process.env.FLEET_PROVIDER_COUNTER_DIR = previousCounter;
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  test('keeps a repository that completed its observation even when the round clock passed the deadline', async () => {
    const repos = [repo(0), repo(1)];
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry(repos),
      // The first repository holds the event loop past the round deadline and
      // still finishes: the deadline timer cannot have preempted it.
      collect_repository: async (entry, _registry, options) => {
        const until = Date.now() + options.timeout_ms + 50;
        while (Date.now() < until) { /* model a blocking synchronous repository */ }
        return {
          repository_id: entry.id, repo_root: entry.path, access_mode: entry.accessMode,
          status: 'ok', snapshot_consistency: 'stable', cards: [card(Number(entry.id.slice(-2)))], error: null,
        };
      },
    };

    const result = await collectFleetBoard({ max_concurrency: 1, timeout_ms: 1_000 }, dependencies);
    expect(result.repositories.find((entry) => entry.repository_id === 'repo-00')).toMatchObject({ status: 'ok' });
    expect(result.repositories.find((entry) => entry.repository_id === 'repo-00')?.cards).toHaveLength(1);
    expect(result.repositories.find((entry) => entry.repository_id === 'repo-01')).toMatchObject({
      status: 'unreadable', error: { code: 'repo_collection_timeout' },
    });
  }, 10_000);

  test('returns to the event loop while collecting one repository so the round deadline can preempt it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-board-yield-'));
    try {
      const entry = createPlainBoardFixture(root, 40, 'repo-yield');
      const dependencies: FleetBoardDependencies = {
        read_registry: () => registry([entry]),
        collect_repository: productionFleetBoardDependencies.collect_repository,
      };
      let ticks = 0;
      const ticker = setInterval(() => { ticks += 1; }, 1);
      try {
        const result = await collectFleetBoard({ max_concurrency: 1, timeout_ms: 30_000 }, dependencies);
        expect(result.repositories[0]?.cards).toHaveLength(40);
      } finally {
        clearInterval(ticker);
      }
      expect(ticks).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  test('never publishes a free provider slot between waking a waiter and admitting it', async () => {
    const limiter = createFleetProviderObservationLimiter(1);
    let active = 0;
    let maximum = 0;
    const observe = async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
    };
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const held = limiter.run(() => first);
    const waiting = limiter.run(observe);
    // Runs in the same resolution turn as the limiter's own release, which is
    // exactly the window a decrement-then-wake release leaves open.
    const admitted = first.then(() => limiter.run(observe));
    resolveFirst();

    await Promise.all([held, waiting, admitted]);
    expect(maximum).toBe(1);
  });

  if (process.platform !== 'win32') {
    test('accepts a registered path under a symlinked ancestor and rejects a symlinked repository leaf', async () => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'fleet-board-authority-')));
      try {
        mkdirSync(join(root, 'actual'), { recursive: true });
        symlinkSync(join(root, 'actual'), join(root, 'aliased'));
        const repoRoot = join(root, 'aliased', 'repo');
        mkdirSync(repoRoot, { recursive: true });
        const entry = createPlainBoardFixture(repoRoot, 1, 'repo-aliased');
        const aliased: RepoHarnessRegisteredRepo = { ...entry, path: repoRoot };

        const underSymlinkedAncestor = await collectFleetBoard({ timeout_ms: 5_000 }, {
          read_registry: () => registry([aliased]),
          collect_repository: productionFleetBoardDependencies.collect_repository,
        });
        expect(underSymlinkedAncestor.repositories[0]).toMatchObject({ status: 'ok' });
        expect(underSymlinkedAncestor.repositories[0]?.cards).toHaveLength(1);

        const withTrailingSeparator = await collectFleetBoard({ timeout_ms: 5_000 }, {
          read_registry: () => registry([{ ...aliased, path: `${repoRoot}/` }]),
          collect_repository: productionFleetBoardDependencies.collect_repository,
        });
        expect(withTrailingSeparator.repositories[0]).toMatchObject({ status: 'ok' });

        const leaf = join(root, 'repo-leaf-link');
        symlinkSync(repoRoot, leaf);
        const symlinkedLeaf = await collectFleetBoard({ timeout_ms: 5_000 }, {
          read_registry: () => registry([{ ...aliased, id: 'repo-leaf', path: leaf }]),
          collect_repository: productionFleetBoardDependencies.collect_repository,
        });
        expect(symlinkedLeaf.repositories[0]).toMatchObject({
          status: 'unreadable', error: { code: 'repo_authority_invalid' },
        });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }, 30_000);
  }

  test('watch emits immediate sequential snapshots with monotonic sequence and no overlap', async () => {
    const controller = new AbortController();
    const repos = [repo(0)];
    let active = 0;
    let overlap = false;
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry(repos),
      collect_repository: async (entry) => {
        active += 1;
        overlap ||= active > 1;
        await Promise.resolve();
        active -= 1;
        return {
          repository_id: entry.id, repo_root: entry.path, access_mode: entry.accessMode,
          status: 'ok', snapshot_consistency: 'stable', cards: [card(1)], error: null,
        };
      },
    };
    const iterator = watchFleetBoard({ interval_ms: 1_000, timeout_ms: 1_000, signal: controller.signal }, dependencies);
    const first = await iterator.next();
    expect(first.value?.sequence).toBe(1);
    const second = await iterator.next();
    expect(second.value?.sequence).toBe(2);
    const third = await iterator.next();
    expect(third.value?.sequence).toBe(3);
    controller.abort();
    expect((await iterator.next()).done).toBe(true);
    expect(overlap).toBe(false);
  }, 10_000);
});

describe('exact repository Fleet collection', () => {
  test('selects read-only A before providers and never collects unrelated B', async () => {
    const a = repo(1), b = repo(2);
    const seen: string[] = [];
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry([a, b]),
      collect_repository: async (entry) => {
        seen.push(entry.id);
        if (entry.id === b.id) throw new Error('unreadable unrelated root');
        return { repository_id: entry.id, repo_root: entry.path, access_mode: entry.accessMode,
          status: 'ok', snapshot_consistency: 'stable', cards: [card(1)], error: null };
      },
    };
    const result = await collectFleetBoard({ repository_id: a.id }, dependencies);
    expect(seen).toEqual([a.id]);
    expect(result.repositories.map((entry) => entry.repository_id)).toEqual([a.id]);
    expect(result.repositories[0]?.access_mode).toBe('read_only');
    await expect(collectFleetBoard({ repository_id: 'missing' }, dependencies)).rejects.toMatchObject({ code: 'fleet_repository_not_found' });
    await expect(collectFleetBoard({ repository_id: '../root' }, dependencies)).rejects.toMatchObject({ code: 'fleet_board_argument_invalid' });
    expect(seen).toEqual([a.id]);
  });

  test('strict registry failure remains fatal before selected repository observation', async () => {
    let calls = 0;
    await expect(collectFleetBoard({ repository_id: repo(1).id }, {
      read_registry: () => { throw new Error('malformed global authority'); },
      collect_repository: async () => { calls += 1; throw new Error('must not observe'); },
    })).rejects.toMatchObject({ code: 'fleet_registry_unavailable' });
    expect(calls).toBe(0);
  });
});

test('real scoped collector reads healthy A while B is missing without changing either authority', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fleet-scoped-real-'));
  const healthyRoot = join(root, 'healthy');
  const home = join(root, 'home');
  mkdirSync(healthyRoot); mkdirSync(home);
  try {
    const a = createPlainBoardFixture(healthyRoot, 1, repoHarnessRepoIdFor(realpathSync(healthyRoot)));
    const missingPath = join(realpathSync(root), 'missing');
    const b = { ...repo(2), id: repoHarnessRepoIdFor(missingPath), path: missingPath };
    const file = join(home, 'registered-repos.json');
    writeFileSync(file, JSON.stringify({ version: 1, authorizationRevision: 1, repos: [a, b] }));
    const before = readFileSync(file, 'utf8');
    const status = git(healthyRoot, 'status', '--porcelain');
    const result = await collectFleetBoard({ env: { REPO_HARNESS_HOME: home }, repository_id: a.id, timeout_ms: 5_000 });
    expect(result.repositories).toHaveLength(1);
    expect(result.repositories[0]).toMatchObject({ repository_id: a.id, status: 'ok', access_mode: 'read_only' });
    expect(result.counts.known_tasks).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(git(healthyRoot, 'status', '--porcelain')).toBe(status);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
