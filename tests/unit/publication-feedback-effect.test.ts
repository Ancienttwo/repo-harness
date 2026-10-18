import { seedLeaseDirectory, writeHistoricalLease, completingLeaseFixture, reviewingLeaseFixture, boundLeaseFixture, fixtureTaskId } from '../helpers/sprint-fixture';
import { seedPublicationReceipt } from '../helpers/publication-fixture';
import { candidate } from '../../scripts/merge-gate';
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildPublicationReceipt,
  publicationReceiptDigest,
  publicationSha256,
  replacePublicationMarker,
} from '../../src/core/publication/publication-receipt';
import { buildFeedbackDeliveryReceipt, buildFeedbackEvent } from '../../src/core/publication/feedback';
import { buildLeaseOwnerRecord, deriveTaskRevision } from '../../src/core/state/coordination-identity';
import { FeedbackError, observeGitHubFeedback, projectPendingFeedbackOffer, showGitHubFeedback, type FeedbackObservationInput } from '../../src/effects/publication/feedback';
import { readFeedbackDeliveryReceipt, readReactionAttemptReceipts, writeFeedbackDeliveryReceipt, writeFeedbackEvent } from '../../src/effects/publication/feedback-store';
import { readLease } from '../../src/effects/state/coordination-lease-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const receipt = buildPublicationReceipt({
  repo_id: `sha256:${'0'.repeat(64)}`,
  task_id: '1'.repeat(64),
  task_revision: '2'.repeat(64),
  claim_id: 'claim-feedback', generation: 1,
  target_ref: 'main', base_sha: BASE, branch: 'codex/feedback', head_sha: HEAD, tree_sha: 'c'.repeat(40),
  candidate_diff_fingerprint: `sha256:${'3'.repeat(64)}`,
  provider: 'github', provider_repo_id: 'R_feedback', pr_number: 7,
  pr_url: 'https://example.invalid/pr/7', created_at: '2026-08-23T00:00:00Z',
});

function runner(overrides: {
  readonly truncated_reviews?: boolean;
  readonly truncated_changes_requested_reviews?: boolean;
  readonly missing_changes_requested_review_id?: boolean;
  readonly unknown_review_state?: boolean;
  readonly graph_errors?: boolean;
  readonly repeated_check_suite_cursor?: boolean;
  readonly unbounded_check_suite_pages?: boolean;
  readonly incomplete_check_conclusion?: 'FAILURE' | 'UNKNOWN';
  readonly changed_head?: boolean;
  readonly changes_requested?: boolean;
  readonly mergeability?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | null;
} = {}): NonNullable<FeedbackObservationInput['gh_runner']> {
  let prReads = 0;
  let checkSuitePages = 0;
  return (args) => {
    const query = args.find((entry) => entry.startsWith('query='));
    if (args[0] === 'repo' && args[1] === 'view') return { status: 0, stdout: JSON.stringify({ id: receipt.provider_repo_id }) };
    if (args[0] === 'pr' && args[1] === 'view') {
      prReads += 1;
      const mergeStateStatus = overrides.mergeability === undefined ? 'MERGEABLE' : overrides.mergeability;
      return {
        status: 0,
        stdout: JSON.stringify({
          number: receipt.pr_number, url: receipt.pr_url, state: 'OPEN', isDraft: false,
          headRefOid: overrides.changed_head && prReads > 1 ? 'd'.repeat(40) : HEAD,
          headRefName: receipt.branch, baseRefOid: BASE, baseRefName: receipt.target_ref,
          ...(mergeStateStatus === null ? {} : { mergeStateStatus }),
        }),
      };
    }
    if (args[0] === 'api' && args[1] === 'graphql' && overrides.graph_errors) {
      return { status: 0, stdout: JSON.stringify({ errors: [{ message: 'provider refused query' }] }) };
    }
    if (args[0] === 'api' && args[1] === 'graphql' && query?.includes('checkSuites')) {
      checkSuitePages += 1;
      if (overrides.repeated_check_suite_cursor || overrides.unbounded_check_suite_pages) {
        return { status: 0, stdout: JSON.stringify({
          data: { node: { pullRequest: { commits: { nodes: [{ commit: {
            oid: HEAD,
            checkSuites: {
              pageInfo: {
                hasNextPage: true,
                endCursor: overrides.repeated_check_suite_cursor ? 'suite-cursor' : `suite-cursor-${checkSuitePages}`,
              },
              nodes: [],
            },
          } }] } } } },
        }) };
      }
      return { status: 0, stdout: JSON.stringify({
        data: { node: { pullRequest: { commits: { nodes: [{ commit: {
          oid: HEAD,
          checkSuites: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'SUITE_1' }] },
        } }] } } } },
      }) };
    }
    if (args[0] === 'api' && args[1] === 'graphql' && query?.includes('checkRuns')) {
      return { status: 0, stdout: JSON.stringify({
        data: { node: { checkRuns: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{
          id: 'CHECK_1',
          status: overrides.incomplete_check_conclusion ? 'IN_PROGRESS' : 'COMPLETED',
          conclusion: overrides.incomplete_check_conclusion ?? 'FAILURE',
          completedAt: '2026-08-23T00:00:01Z',
        }] } } },
      }) };
    }
    if (args[0] === 'api' && args[1] === 'graphql' && query?.includes('reviewThreads')) {
      return { status: 0, stdout: JSON.stringify({
        data: { node: { pullRequest: { reviewThreads: {
          pageInfo: { hasNextPage: overrides.truncated_reviews ?? false, endCursor: null },
          nodes: [{ id: 'THREAD_1', isResolved: false, updatedAt: '2026-08-23T00:00:02Z' }],
        } } } },
      }) };
    }
    if (args[0] === 'api' && args[1] === 'graphql' && query?.includes('reviews(first:100')) {
      return { status: 0, stdout: JSON.stringify({
        data: { node: { pullRequest: { reviews: {
          pageInfo: { hasNextPage: overrides.truncated_changes_requested_reviews ?? false, endCursor: null },
          nodes: [{
            id: overrides.missing_changes_requested_review_id ? undefined : 'REVIEW_1',
            state: overrides.unknown_review_state ? 'UNKNOWN' : overrides.changes_requested ? 'CHANGES_REQUESTED' : 'APPROVED',
            submittedAt: '2026-08-23T00:00:03Z',
          }],
        } } } },
      }) };
    }
    return { status: 2, stdout: '', stderr: `unexpected gh arguments: ${args.join(' ')}` };
  };
}

describe('GitHub provider feedback observation', () => {
  test('uses exact provider object IDs and complete page observations', () => {
    const events = observeGitHubFeedback(receipt, { repo_root: '/tmp', gh_runner: runner() });
    expect(events.map((event) => event.provider_event_id)).toEqual(['CHECK_1', 'THREAD_1']);
    expect(events[0]?.failing_check_ids).toEqual(['CHECK_1']);
    expect(events[0]?.failing_checks).toEqual([{ id: 'CHECK_1', conclusion: 'FAILURE' }]);
    expect(events[1]?.unresolved_review_thread_ids).toEqual(['THREAD_1']);
    expect(events.every((event) => event.mergeability === 'MERGEABLE')).toBe(true);
    expect(events.every((event) => event.head_sha === HEAD)).toBe(true);
  });

  test('fails closed for pagination truncation and a provider head torn read', () => {
    expect(() => observeGitHubFeedback(receipt, { repo_root: '/tmp', gh_runner: runner({ truncated_reviews: true }) }))
      .toThrow(FeedbackError);
    try {
      observeGitHubFeedback(receipt, { repo_root: '/tmp', gh_runner: runner({ truncated_reviews: true }) });
      throw new Error('expected observation to fail');
    } catch (error) {
      expect((error as FeedbackError).code).toBe('feedback_provider_incomplete');
    }

    expect(() => observeGitHubFeedback(receipt, { repo_root: '/tmp', gh_runner: runner({ changed_head: true }) }))
      .toThrow('provider identity changed during feedback observation');
  });

  test('turns each changes-requested review object into an immutable provider event', () => {
    const events = observeGitHubFeedback(receipt, { repo_root: '/tmp', gh_runner: runner({ changes_requested: true }) });
    expect(events.map((event) => event.provider_event_id)).toEqual(['CHECK_1', 'THREAD_1', 'REVIEW_1']);
    expect(events[2]).toMatchObject({
      provider_event_id: 'REVIEW_1', failing_check_ids: [], failing_checks: [], unresolved_review_thread_ids: [],
      changes_requested_review_ids: ['REVIEW_1'], mergeability: 'MERGEABLE',
      summary: 'GitHub review REVIEW_1 requested changes',
    });
  });

  test('fails closed when changes-requested review pagination, identity, or state is incomplete', () => {
    for (const overrides of [
      { truncated_changes_requested_reviews: true },
      { missing_changes_requested_review_id: true, changes_requested: true },
      { unknown_review_state: true },
    ]) {
      expect(() => observeGitHubFeedback(receipt, { repo_root: '/tmp', gh_runner: runner(overrides) })).toThrow(FeedbackError);
    }
  });

  test('fails closed for GraphQL errors, cyclic or unbounded cursors, and incomplete check conclusions', () => {
    for (const overrides of [
      { graph_errors: true },
      { repeated_check_suite_cursor: true },
      { unbounded_check_suite_pages: true },
      { incomplete_check_conclusion: 'FAILURE' as const },
      { incomplete_check_conclusion: 'UNKNOWN' as const },
      { mergeability: 'UNKNOWN' as const },
      { mergeability: null },
    ]) {
      try {
        observeGitHubFeedback(receipt, { repo_root: '/tmp', gh_runner: runner(overrides) });
        throw new Error('expected observation to fail closed');
      } catch (error) {
        expect(error).toBeInstanceOf(FeedbackError);
        expect((error as FeedbackError).code).toMatch(/feedback_provider_(incomplete|shape_invalid)/);
      }
    }
  });
});

const REPAIR_SPRINT = 'plans/sprints/feedback-repair.sprint.md';
const REPAIR_TASK = 'repair publication feedback';
const FOREIGN_REPAIR_TASK = 'foreign task feedback sentinel';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim();
}

interface RepairFixture {
  readonly root: string;
  readonly receipt: ReturnType<typeof buildPublicationReceipt>;
  readonly task_id: string;
  readonly foreign_task_id: string;
  readonly foreign_task_revision: string;
  readonly gh: string;
}

function installRepairFixture(): RepairFixture {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-feedback-repair-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Feedback Repair Test');
  git(root, 'config', 'user.email', 'feedback-repair@test.invalid');
  mkdirSync(join(root, 'plans', 'sprints'), { recursive: true });
  writeFileSync(join(root, REPAIR_SPRINT), [
    '# Sprint: feedback repair', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    `| 1 | ${fixtureTaskId(`${REPAIR_TASK}`)} | [ ] | ${REPAIR_TASK} | contract | feedback repair tests | (pending) |`,
    `| 2 | ${fixtureTaskId(`${FOREIGN_REPAIR_TASK}`)} | [ ] | ${FOREIGN_REPAIR_TASK} | contract | foreign repair sentinel tests | (pending) |`, '',
  ].join('\n'));
  writeFileSync(join(root, 'README.md'), 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  const taskId = fixtureTaskId(REPAIR_TASK);
  const revision = deriveTaskRevision({ taskCell: REPAIR_TASK, taskId, modeCell: 'contract', acceptanceCell: 'feedback repair tests' });
  const foreignTaskId = fixtureTaskId(FOREIGN_REPAIR_TASK);
  const foreignTaskRevision = deriveTaskRevision({ taskCell: FOREIGN_REPAIR_TASK, taskId: foreignTaskId, modeCell: 'contract', acceptanceCell: 'foreign repair sentinel tests' });
  git(root, 'switch', '-c', 'codex/feedback-repair');
  writeFileSync(join(root, 'repair.txt'), 'candidate\n');
  git(root, 'add', 'repair.txt');
  git(root, 'commit', '-m', 'candidate');
  const head = git(root, 'rev-parse', 'HEAD');
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');

  const receipt = buildPublicationReceipt({
    repo_id: publicationSha256(resolveGitCommonDirectory(root)), task_id: taskId, task_revision: revision,
    claim_id: 'claim-feedback-repair', generation: 1, target_ref: 'main', base_sha: base,
    branch: 'codex/feedback-repair', head_sha: head, tree_sha: tree,
    candidate_diff_fingerprint: candidate(root, 'main').diffFingerprint,
    provider: 'github',
    provider_repo_id: 'R_feedback_repair', pr_number: 12, pr_url: 'https://example.invalid/pr/12', created_at: '2026-08-23T06:30:00Z',
  });
  seedPublicationReceipt(root, receipt);
  const owner = buildLeaseOwnerRecord({
    claimId: receipt.claim_id, taskId, taskRevision: revision, sprintPath: REPAIR_SPRINT, targetRef: 'main', generation: 1,
    sessionId: 'feedback-repair-session', sourceWorktree: root,
  });
  const bound = boundLeaseFixture(owner, { executionWorktree: root, branch: receipt.branch, unitRef: 'plans/plan-feedback-repair.md' });
  const completing = completingLeaseFixture(bound, { claimId: receipt.claim_id, executionWorktree: root, finishTransactionKey: 'finish-feedback-repair' });
  if (!completing.ok) throw new Error(completing.error);
  const reviewing = reviewingLeaseFixture(completing.record, {
    claimId: receipt.claim_id,
    publication: {
      publication_id: receipt.publication_id,
      receipt_sha256: publicationReceiptDigest(receipt),
      head_sha: receipt.head_sha,
      ship_transaction_key: 'ship-feedback-repair',
    },
  });
  if (!reviewing.ok) throw new Error(reviewing.error);
  if (!seedLeaseDirectory(root, taskId)) throw new Error('lease creation failed');
  writeHistoricalLease(root, taskId, reviewing.record);

  const body = join(root, 'pr.md');
  writeFileSync(body, replacePublicationMarker('feedback repair\n', receipt));
  const gh = join(root, 'fake-gh.sh');
  writeFileSync(gh, [
    '#!/bin/bash', 'set -euo pipefail',
    'body="$(jq -Rs . < "$GH_BODY")"',
    `pr="{\\"number\\":12,\\"url\\":\\"https://example.invalid/pr/12\\",\\"headRefOid\\":\\"${head}\\",\\"headRefName\\":\\"codex/feedback-repair\\",\\"baseRefName\\":\\"main\\",\\"baseRefOid\\":\\"${base}\\",\\"mergeStateStatus\\":\\"MERGEABLE\\",\\"body\\":$body,\\"createdAt\\":\\"2026-08-23T06:30:00Z\\"}"`,
    'if [[ "$1 $2" == "repo view" ]]; then printf \'{"id":"R_feedback_repair"}\\n\'; exit 0; fi',
    'if [[ "$1 $2" == "pr view" ]]; then printf \'%s\\n\' "$pr"; exit 0; fi',
    'echo "unexpected gh invocation: $*" >&2; exit 2',
  ].join('\n'));
  chmodSync(gh, 0o755);
  process.env.GH_BODY = body;

  const event = buildFeedbackEvent({
    provider: 'github', provider_event_id: 'CHECK_REPAIR_12', publication_id: receipt.publication_id, head_sha: receipt.head_sha,
    failing_check_ids: ['CHECK_REPAIR_12'], failing_checks: [{ id: 'CHECK_REPAIR_12', conclusion: 'FAILURE' }],
    unresolved_review_thread_ids: [], changes_requested_review_ids: [], mergeability: 'MERGEABLE', summary: 'check failed',
    provider_url: receipt.pr_url, observed_at: '2026-08-23T06:31:00Z',
  });
  writeFeedbackEvent(root, event);
  writeFeedbackDeliveryReceipt(root, receipt.publication_id, buildFeedbackDeliveryReceipt({
    provider_event_id: event.provider_event_id, delivery_state: 'pending', delivery_channel: 'none',
    delivered_at: null, acknowledged_at: null, superseded_at: null,
  }));
  return {
    root,
    receipt,
    task_id: taskId,
    foreign_task_id: foreignTaskId,
    foreign_task_revision: foreignTaskRevision,
    gh,
  };
}

function repairOffer(fixture: RepairFixture) {
  const projected = projectPendingFeedbackOffer({ repo_root: fixture.root, publication_id: fixture.receipt.publication_id });
  if (projected.state !== 'offered') throw new Error('expected a repair offer');
  return projected.offer;
}

describe('feedback repair lifecycle integration', () => {
  test('fetches a selected provider object on demand without persisting its untrusted body', () => {
    const fixture = installRepairFixture();
    try {
      const threadEvent = buildFeedbackEvent({
        provider: 'github', provider_event_id: 'THREAD_REPAIR_12', publication_id: fixture.receipt.publication_id,
        head_sha: fixture.receipt.head_sha, failing_check_ids: [], failing_checks: [], unresolved_review_thread_ids: ['THREAD_REPAIR_12'],
        changes_requested_review_ids: [], mergeability: 'MERGEABLE',
        summary: 'unresolved thread', provider_url: fixture.receipt.pr_url, observed_at: '2026-08-23T06:31:01Z',
      });
      writeFeedbackEvent(fixture.root, threadEvent);
      const beforeLease = readLease(fixture.root, fixture.task_id).raw;
      const beforeDelivery = readFeedbackDeliveryReceipt(fixture.root, fixture.receipt.publication_id, 'CHECK_REPAIR_12');
      const result = showGitHubFeedback({
        repo_root: fixture.root,
        publication_id: fixture.receipt.publication_id,
        provider_event_id: 'CHECK_REPAIR_12',
        gh_runner: (args) => {
          const query = args.find((entry) => entry.startsWith('query='));
          if (query?.includes('on CheckRun')) {
            return {
              status: 0,
              stdout: JSON.stringify({ data: { node: {
                id: 'CHECK_REPAIR_12', name: 'unit', detailsUrl: 'https://example.invalid/check/12',
                status: 'COMPLETED', conclusion: 'FAILURE',
                output: { title: 'unit failed', summary: 'assertion failed', text: 'private-looking provider output' },
              } } }),
            };
          }
          return { status: 2, stdout: '', stderr: `unexpected gh arguments: ${args.join(' ')}` };
        },
      });
      expect(result).toEqual({
        provider_event_id: 'CHECK_REPAIR_12', provider_url: fixture.receipt.pr_url,
        body: 'name: unit\nstatus: COMPLETED\nconclusion: FAILURE\ndetails_url: https://example.invalid/check/12\ntitle: unit failed\nsummary: assertion failed\ntext: private-looking provider output',
        untrusted: true,
      });
      expect(readLease(fixture.root, fixture.task_id).raw).toBe(beforeLease);
      expect(readFeedbackDeliveryReceipt(fixture.root, fixture.receipt.publication_id, 'CHECK_REPAIR_12')).toEqual(beforeDelivery);
      expect(readReactionAttemptReceipts(fixture.root, fixture.receipt.publication_id)).toEqual([]);
      expect(() => showGitHubFeedback({
        repo_root: fixture.root, publication_id: fixture.receipt.publication_id, provider_event_id: 'CHECK_REPAIR_12',
        gh_runner: () => ({ status: 0, stdout: JSON.stringify({ data: { node: { name: 'not an ID' } } }) }),
      })).toThrow(FeedbackError);
      expect(() => showGitHubFeedback({
        repo_root: fixture.root, publication_id: fixture.receipt.publication_id, provider_event_id: 'CHECK_REPAIR_12',
        gh_runner: () => ({ status: 0, stdout: JSON.stringify({ data: { node: { id: 'CHECK_REPAIR_12', state: 'CHANGES_REQUESTED' } } }) }),
      })).toThrow(FeedbackError);
      expect(() => showGitHubFeedback({
        repo_root: fixture.root, publication_id: fixture.receipt.publication_id, provider_event_id: 'THREAD_REPAIR_12',
        gh_runner: () => ({
          status: 0,
          stdout: JSON.stringify({ data: { node: {
            id: 'THREAD_REPAIR_12', isResolved: false,
            comments: { pageInfo: { hasNextPage: true, endCursor: null }, nodes: [] },
          } } }),
        }),
      })).toThrow(FeedbackError);
      expect(() => showGitHubFeedback({
        repo_root: fixture.root, publication_id: fixture.receipt.publication_id, provider_event_id: 'missing',
        gh_runner: () => ({ status: 2, stdout: '', stderr: 'must not run' }),
      })).toThrow('provider feedback event is unavailable');
      expect(readLease(fixture.root, fixture.task_id).raw).toBe(beforeLease);
      expect(readReactionAttemptReceipts(fixture.root, fixture.receipt.publication_id)).toEqual([]);
      expect(readFeedbackDeliveryReceipt(fixture.root, fixture.receipt.publication_id, 'CHECK_REPAIR_12')).toEqual(beforeDelivery);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

});
