import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildPublicationReceipt,
  publicationReceiptDigest,
  publicationSha256,
  replacePublicationMarker,
} from '../../src/core/publication/publication-receipt';
import { buildFeedbackDeliveryReceipt, buildFeedbackEvent, buildRepairDispatchProof, deriveReactionToken } from '../../src/core/publication/feedback';
import {
  beginLeaseCompletionRecord,
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  deriveTaskRevision,
  enterReviewingLeaseRecord,
} from '../../src/core/state/coordination-identity';
import {
  FeedbackError,
  observeGitHubFeedback,
  projectPendingFeedbackOffer,
  recordCompletedFeedbackRepair,
  reopenFeedbackRepair,
  showGitHubFeedback,
  takeoverFeedbackRepair,
  type FeedbackObservationInput,
} from '../../src/effects/publication/feedback';
import {
  readFeedbackDeliveryReceipt,
  readReactionAttemptReceipts,
  readRepairDispatchProof,
  feedbackDeliveryReceiptPath,
  repairDispatchProofPath,
  writeFeedbackDeliveryReceipt,
  writeFeedbackEvent,
  writeRepairDispatchProof,
} from '../../src/effects/publication/feedback-store';
import { publicationJournalEvidence, writePublicationReceiptCache } from '../../src/effects/publication/publication-receipt';
import { reopenPublication, takeoverPublication } from '../../src/effects/publication/publication-lifecycle';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import {
  createLeaseDirectory,
  readLease,
  taskLockRelativePath,
  writeLeaseOwnerDurably,
} from '../../src/effects/state/coordination-lease-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const receipt = buildPublicationReceipt({
  repo_id: `sha256:${'0'.repeat(64)}`,
  task_id: '1'.repeat(64),
  task_revision: '2'.repeat(64),
  claim_id: 'claim-feedback', generation: 1,
  target_ref: 'main', base_sha: BASE, branch: 'codex/feedback', head_sha: HEAD, tree_sha: 'c'.repeat(40),
  review_subject_sha256: `sha256:${'3'.repeat(64)}`,
  verification_evidence_sha256: `sha256:${'4'.repeat(64)}`,
  merge_seal_sha256: `sha256:${'5'.repeat(64)}`,
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
  readonly checks: string;
  readonly seal: string;
}

function installRepairFixture(): RepairFixture {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-feedback-repair-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Feedback Repair Test');
  git(root, 'config', 'user.email', 'feedback-repair@test.invalid');
  mkdirSync(join(root, 'plans', 'sprints'), { recursive: true });
  writeFileSync(join(root, REPAIR_SPRINT), [
    '# Sprint: feedback repair', '', '> **Backlog Schema**: 2', '', '## Backlog', '',
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

  const checks = join(root, 'checks.json');
  writeFileSync(checks, '{"status":"pass"}\n');
  const seal = join(root, 'seal.json');
  const subject = `sha256:${'3'.repeat(64)}`;
  writeFileSync(seal, `${JSON.stringify({ protocol: 1, kind: 'repo-harness-merge-seal', base_sha: base, head_sha: head, acceptance_subject_sha256: subject })}\n`);
  const receipt = buildPublicationReceipt({
    repo_id: publicationSha256(resolveGitCommonDirectory(root)), task_id: taskId, task_revision: revision,
    claim_id: 'claim-feedback-repair', generation: 1, target_ref: 'main', base_sha: base,
    branch: 'codex/feedback-repair', head_sha: head, tree_sha: tree,
    review_subject_sha256: subject, verification_evidence_sha256: publicationSha256(readFileSync(checks)),
    merge_seal_sha256: publicationSha256(readFileSync(seal)), provider: 'github',
    provider_repo_id: 'R_feedback_repair', pr_number: 12, pr_url: 'https://example.invalid/pr/12', created_at: '2026-08-23T06:30:00Z',
  });
  writePublicationReceiptCache(root, receipt);
  const owner = buildLeaseOwnerRecord({
    claimId: receipt.claim_id, taskId, taskRevision: revision, sprintPath: REPAIR_SPRINT, targetRef: 'main', generation: 1,
    sessionId: 'feedback-repair-session', sourceWorktree: root,
  });
  const bound = bindLeaseRecord(owner, { claimId: receipt.claim_id, executionWorktree: root, branch: receipt.branch, unitRef: 'plans/plan-feedback-repair.md' });
  if (!bound.ok) throw new Error(bound.error);
  const completing = beginLeaseCompletionRecord(bound.record, { claimId: receipt.claim_id, executionWorktree: root, finishTransactionKey: 'finish-feedback-repair' });
  if (!completing.ok) throw new Error(completing.error);
  const reviewing = enterReviewingLeaseRecord(completing.record, {
    claimId: receipt.claim_id,
    publication: {
      publication_id: receipt.publication_id,
      receipt_sha256: publicationReceiptDigest(receipt),
      head_sha: receipt.head_sha,
      ship_transaction_key: 'ship-feedback-repair',
    },
  });
  if (!reviewing.ok) throw new Error(reviewing.error);
  if (!createLeaseDirectory(root, taskId)) throw new Error('lease creation failed');
  writeLeaseOwnerDurably(root, taskId, reviewing.record);

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
    checks,
    seal,
  };
}

function repairOffer(fixture: RepairFixture) {
  const projected = projectPendingFeedbackOffer({ repo_root: fixture.root, publication_id: fixture.receipt.publication_id });
  if (projected.state !== 'offered') throw new Error('expected a repair offer');
  return projected.offer;
}

function deriveCompletedShipKey(root: string, receipt: RepairFixture['receipt'], originalHead: string): string {
  const transactionRoot = join(resolveGitCommonDirectory(root), 'repo-harness', 'transactions');
  return execFileSync('git', ['hash-object', '--stdin'], {
    cwd: root,
    input: [
      `repo=${transactionRoot}`,
      `worktree=${root}`,
      'operation=ship',
      'plan=',
      'contract=',
      `original_head=${originalHead}`,
      `target_branch=${receipt.target_ref}`,
      `base_sha=${receipt.base_sha}`,
    ].join('\n') + '\n',
    encoding: 'utf-8',
  }).trim();
}

function writeCompletedShipJournal(
  root: string,
  receipt: RepairFixture['receipt'],
  shipKey: string,
  originalHead: string,
  status: 'complete' | 'in_progress' = 'complete',
): void {
  const transactionRoot = join(resolveGitCommonDirectory(root), 'repo-harness', 'transactions');
  const directory = join(transactionRoot, 'ship', shipKey);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'meta.json'), JSON.stringify({
    operation: 'ship', key: shipKey, repo: transactionRoot, worktree: root, branch: receipt.branch,
    plan: '', contract: '', original_head: originalHead, target_branch: receipt.target_ref,
    base_ref: `refs/remotes/origin/${receipt.target_ref}`, base_sha: receipt.base_sha,
  }) + '\n');
  writeFileSync(join(directory, 'status.json'), JSON.stringify({
    operation: 'ship', key: shipKey, status, phases: [
      { phase: 'gate_sealed', ref: receipt.head_sha },
      { phase: 'pushed', ref: receipt.head_sha },
      { phase: 'pr_observed', ref: receipt.head_sha, publication: publicationJournalEvidence(receipt) },
      ...(status === 'complete' ? [{ phase: 'complete', ref: receipt.head_sha }] : []),
    ],
  }) + '\n');
}

function enterCompletionReviewing(
  fixture: RepairFixture,
  source: RepairFixture['receipt'],
  shipStatus: 'complete' | 'in_progress' = 'complete',
) {
  const bound = readLease(fixture.root, fixture.task_id).record;
  if (bound === null || bound.state !== 'bound') throw new Error('fixture expected the repair successor to be bound');
  const originalHead = 'e'.repeat(40);
  const shipKey = deriveCompletedShipKey(fixture.root, source, originalHead);
  writeCompletedShipJournal(fixture.root, source, shipKey, originalHead, shipStatus);
  const completing = beginLeaseCompletionRecord(bound, {
    claimId: source.claim_id, executionWorktree: fixture.root, finishTransactionKey: 'finish-feedback-completion',
  });
  if (!completing.ok) throw new Error(completing.error);
  const reviewing = enterReviewingLeaseRecord(completing.record, {
    claimId: source.claim_id,
    publication: {
      publication_id: source.publication_id,
      receipt_sha256: publicationReceiptDigest(source),
      head_sha: source.head_sha,
      ship_transaction_key: shipKey,
    },
  });
  if (!reviewing.ok) throw new Error(reviewing.error);
  writeLeaseOwnerDurably(fixture.root, fixture.task_id, reviewing.record);
  return { completion: source, ship_key: shipKey };
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

  test('reuses reopen, then delivers pending feedback manually without rolling lease logic into the effect', () => {
    const fixture = installRepairFixture();
    try {
      const result = reopenFeedbackRepair({
        repo_root: fixture.root, offer: repairOffer(fixture), gh_bin: fixture.gh,
        checks_path: fixture.checks, merge_seal_path: fixture.seal, delivered_at: '2026-08-23T06:32:00Z',
      });
      expect(result.lease.state).toBe('bound');
      expect(result.envelope).toMatchObject({ action: 'reopened', claim_id: fixture.receipt.claim_id, generation: 1 });
      expect(readRepairDispatchProof(fixture.root, fixture.receipt.publication_id, result.envelope.repair_id)).toMatchObject({
        phase: 'dispatched', successor_claim_id: fixture.receipt.claim_id, successor_generation: 1, successor_state: 'bound',
      });
      expect(readFeedbackDeliveryReceipt(fixture.root, fixture.receipt.publication_id, 'CHECK_REPAIR_12')).toMatchObject({
        delivery_state: 'delivered', delivery_channel: 'manual', delivered_at: '2026-08-23T06:32:00Z',
      });
      expect(readLease(fixture.root, fixture.task_id).record?.state).toBe('bound');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('requires a delivery receipt for every immutable event before projecting or mutating a repair lifecycle', () => {
    const fixture = installRepairFixture();
    try {
      const offer = repairOffer(fixture);
      const beforeLease = readLease(fixture.root, fixture.task_id).raw;
      writeFeedbackEvent(fixture.root, buildFeedbackEvent({
        provider: 'github', provider_event_id: 'CHECK_WITHOUT_DELIVERY', publication_id: fixture.receipt.publication_id,
        head_sha: fixture.receipt.head_sha, failing_check_ids: ['CHECK_WITHOUT_DELIVERY'],
        failing_checks: [{ id: 'CHECK_WITHOUT_DELIVERY', conclusion: 'FAILURE' }], unresolved_review_thread_ids: [],
        changes_requested_review_ids: [], mergeability: 'MERGEABLE',
        summary: 'orphaned immutable event', provider_url: fixture.receipt.pr_url, observed_at: '2026-08-23T06:32:01Z',
      }));
      for (const action of [
        () => projectPendingFeedbackOffer({ repo_root: fixture.root, publication_id: fixture.receipt.publication_id }),
        () => reopenFeedbackRepair({
          repo_root: fixture.root, offer, delivered_at: '2026-08-23T06:32:02Z',
        }),
      ]) {
        try {
          action();
          throw new Error('expected incomplete feedback to fail closed');
        } catch (error) {
          expect(error).toBeInstanceOf(FeedbackError);
          expect((error as FeedbackError).code).toBe('feedback_incomplete');
        }
      }
      expect(readLease(fixture.root, fixture.task_id).raw).toBe(beforeLease);
      expect(readFeedbackDeliveryReceipt(fixture.root, fixture.receipt.publication_id, 'CHECK_REPAIR_12')).toMatchObject({
        delivery_state: 'pending', delivery_channel: 'none',
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('reuses takeover and leaves the lifecycle endpoint reserving while delivering publication feedback', () => {
    const fixture = installRepairFixture();
    try {
      const result = takeoverFeedbackRepair({
        repo_root: fixture.root, offer: repairOffer(fixture), gh_bin: fixture.gh,
        checks_path: fixture.checks, merge_seal_path: fixture.seal, reason: 'repair CI failure',
        session_id: 'replacement-session', new_claim_id: 'claim-feedback-replacement', source_worktree: fixture.root,
        delivered_at: '2026-08-23T06:33:00Z',
      });
      expect(result.lease).toMatchObject({ state: 'reserving', claim_id: 'claim-feedback-replacement', generation: 2 });
      expect(result.envelope).toMatchObject({ action: 'taken_over', claim_id: 'claim-feedback-replacement', generation: 2 });
      expect(readRepairDispatchProof(fixture.root, fixture.receipt.publication_id, result.envelope.repair_id)).toMatchObject({
        phase: 'dispatched', successor_claim_id: 'claim-feedback-replacement', successor_generation: 2, successor_state: 'reserving',
      });
      expect(readFeedbackDeliveryReceipt(fixture.root, fixture.receipt.publication_id, 'CHECK_REPAIR_12')).toMatchObject({
        delivery_state: 'delivered', delivery_channel: 'manual',
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('recovers a prepared takeover from its observed reserving successor despite a retry claim id', () => {
    const fixture = installRepairFixture();
    try {
      const offer = repairOffer(fixture);
      const sourceLease = readLease(fixture.root, fixture.task_id).record;
      if (sourceLease === null || sourceLease.state !== 'reviewing' || sourceLease.current_publication === null) {
        throw new Error('fixture expected reviewing source lease');
      }
      const prepared = buildRepairDispatchProof({
        publication_id: fixture.receipt.publication_id,
        receipt_sha256: sourceLease.current_publication.receipt_sha256,
        task_id: fixture.receipt.task_id, task_revision: fixture.receipt.task_revision,
        claim_id: fixture.receipt.claim_id, generation: fixture.receipt.generation,
        head_sha: fixture.receipt.head_sha, ship_transaction_key: sourceLease.current_publication.ship_transaction_key,
        feedback_revision: offer.feedback_revision,
        before_reaction_token: deriveReactionToken({
          publication_id: fixture.receipt.publication_id, head_sha: fixture.receipt.head_sha,
          failing_checks: [{ id: 'CHECK_REPAIR_12', conclusion: 'FAILURE' }], unresolved_review_thread_ids: [],
          mergeability: 'MERGEABLE',
        }),
        action: 'explicit_takeover', phase: 'prepared',
        successor_claim_id: null, successor_generation: null, successor_state: null,
      });
      writeRepairDispatchProof(fixture.root, fixture.receipt.publication_id, prepared);
      takeoverPublication({
        repo_root: fixture.root, task_id: fixture.task_id, expected_claim_id: fixture.receipt.claim_id,
        expected_generation: fixture.receipt.generation, publication_id: fixture.receipt.publication_id,
        expected_head_sha: fixture.receipt.head_sha, reason: 'first takeover', session_id: 'first-session',
        new_claim_id: 'claim-first-takeover', source_worktree: fixture.root, gh_bin: fixture.gh,
        checks_path: fixture.checks, merge_seal_path: fixture.seal,
      });
      const recovered = takeoverFeedbackRepair({
        repo_root: fixture.root, offer, reason: 'retry must not choose successor', session_id: 'retry-session',
        new_claim_id: 'claim-retry-uuid', source_worktree: fixture.root, delivered_at: '2026-08-23T06:33:10Z',
      });
      expect(recovered.lease).toMatchObject({ state: 'reserving', claim_id: 'claim-first-takeover', generation: 2 });
      expect(recovered.envelope.claim_id).toBe('claim-first-takeover');
      expect(readRepairDispatchProof(fixture.root, fixture.receipt.publication_id, prepared.repair_id)).toMatchObject({
        phase: 'dispatched', successor_claim_id: 'claim-first-takeover', successor_generation: 2, successor_state: 'reserving',
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a forged task B before initial dispatch can touch its lock or durable evidence, while task A dispatches', () => {
    const fixture = installRepairFixture();
    try {
      const offer = repairOffer(fixture);
      const foreignReceipt = buildPublicationReceipt({
        repo_id: fixture.receipt.repo_id,
        task_id: fixture.foreign_task_id,
        task_revision: fixture.foreign_task_revision,
        claim_id: 'claim-foreign-task', generation: 1,
        target_ref: fixture.receipt.target_ref, base_sha: fixture.receipt.base_sha,
        branch: 'codex/foreign-task', head_sha: fixture.receipt.head_sha, tree_sha: fixture.receipt.tree_sha,
        review_subject_sha256: fixture.receipt.review_subject_sha256,
        verification_evidence_sha256: fixture.receipt.verification_evidence_sha256,
        merge_seal_sha256: fixture.receipt.merge_seal_sha256,
        provider: 'github', provider_repo_id: fixture.receipt.provider_repo_id,
        pr_number: 13, pr_url: 'https://example.invalid/pr/13', created_at: '2026-08-23T06:33:11Z',
      });
      writePublicationReceiptCache(fixture.root, foreignReceipt);
      const foreignLease = buildLeaseOwnerRecord({
        claimId: foreignReceipt.claim_id,
        taskId: fixture.foreign_task_id,
        taskRevision: fixture.foreign_task_revision,
        sprintPath: REPAIR_SPRINT,
        targetRef: foreignReceipt.target_ref,
        generation: foreignReceipt.generation,
        sessionId: 'foreign-task-session',
        sourceWorktree: fixture.root,
      });
      if (!createLeaseDirectory(fixture.root, fixture.foreign_task_id)) throw new Error('foreign lease creation failed');
      writeLeaseOwnerDurably(fixture.root, fixture.foreign_task_id, foreignLease);
      const foreignEvent = buildFeedbackEvent({
        provider: 'github', provider_event_id: 'CHECK_FOREIGN_13', publication_id: foreignReceipt.publication_id,
        head_sha: foreignReceipt.head_sha, failing_check_ids: ['CHECK_FOREIGN_13'],
        failing_checks: [{ id: 'CHECK_FOREIGN_13', conclusion: 'FAILURE' }],
        unresolved_review_thread_ids: [], changes_requested_review_ids: [], mergeability: 'MERGEABLE',
        summary: 'foreign check failed', provider_url: foreignReceipt.pr_url, observed_at: '2026-08-23T06:33:12Z',
      });
      writeFeedbackEvent(fixture.root, foreignEvent);
      writeFeedbackDeliveryReceipt(fixture.root, foreignReceipt.publication_id, buildFeedbackDeliveryReceipt({
        provider_event_id: foreignEvent.provider_event_id, delivery_state: 'pending', delivery_channel: 'none',
        delivered_at: null, acknowledged_at: null, superseded_at: null,
      }));
      const foreignProof = buildRepairDispatchProof({
        publication_id: foreignReceipt.publication_id,
        receipt_sha256: publicationReceiptDigest(foreignReceipt),
        task_id: foreignReceipt.task_id, task_revision: foreignReceipt.task_revision,
        claim_id: foreignReceipt.claim_id, generation: foreignReceipt.generation,
        head_sha: foreignReceipt.head_sha, ship_transaction_key: 'ship-foreign-feedback',
        feedback_revision: publicationSha256('foreign feedback revision'),
        before_reaction_token: deriveReactionToken({
          publication_id: foreignReceipt.publication_id, head_sha: foreignReceipt.head_sha,
          failing_checks: [{ id: 'CHECK_FOREIGN_13', conclusion: 'FAILURE' }], unresolved_review_thread_ids: [],
          mergeability: 'MERGEABLE',
        }),
        action: 'explicit_takeover', phase: 'prepared',
        successor_claim_id: null, successor_generation: null, successor_state: null,
      });
      writeRepairDispatchProof(fixture.root, foreignReceipt.publication_id, foreignProof);

      const foreignLeaseBefore = readLease(fixture.root, fixture.foreign_task_id).raw;
      const foreignProofPath = repairDispatchProofPath(fixture.root, foreignReceipt.publication_id, foreignProof.repair_id);
      const foreignDeliveryPath = feedbackDeliveryReceiptPath(fixture.root, foreignReceipt.publication_id, foreignEvent.provider_event_id);
      const foreignProofBefore = readFileSync(foreignProofPath, 'utf-8');
      const foreignDeliveryBefore = readFileSync(foreignDeliveryPath, 'utf-8');
      const foreignLockPath = join(resolveGitCommonDirectory(fixture.root), taskLockRelativePath(fixture.foreign_task_id));
      expect(existsSync(foreignLockPath)).toBe(false);

      const forged = { ...offer, task_id: fixture.foreign_task_id };
      try {
        takeoverFeedbackRepair({
          repo_root: fixture.root, offer: forged, reason: 'foreign task must not dispatch source', session_id: 'foreign-session',
          new_claim_id: 'claim-foreign-retry', source_worktree: fixture.root, delivered_at: '2026-08-23T06:33:15Z',
        });
        throw new Error('expected cross-task dispatch rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(FeedbackError);
        expect((error as FeedbackError).code).toBe('repair_offer_stale');
      }
      expect(readLease(fixture.root, fixture.foreign_task_id).raw).toBe(foreignLeaseBefore);
      expect(readFileSync(foreignProofPath, 'utf-8')).toBe(foreignProofBefore);
      expect(readFileSync(foreignDeliveryPath, 'utf-8')).toBe(foreignDeliveryBefore);
      expect(existsSync(foreignLockPath)).toBe(false);

      const dispatched = takeoverFeedbackRepair({
        repo_root: fixture.root, offer, gh_bin: fixture.gh, checks_path: fixture.checks, merge_seal_path: fixture.seal,
        reason: 'source task dispatch', session_id: 'source-session',
        new_claim_id: 'claim-source-takeover', source_worktree: fixture.root, delivered_at: '2026-08-23T06:33:16Z',
      });
      expect(dispatched.lease).toMatchObject({ state: 'reserving', claim_id: 'claim-source-takeover', generation: 2 });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('fails closed when a prepared takeover recovery observes the wrong successor generation', () => {
    const fixture = installRepairFixture();
    try {
      const offer = repairOffer(fixture);
      const sourceLease = readLease(fixture.root, fixture.task_id).record;
      if (sourceLease === null || sourceLease.state !== 'reviewing' || sourceLease.current_publication === null) {
        throw new Error('fixture expected reviewing source lease');
      }
      const prepared = buildRepairDispatchProof({
        publication_id: fixture.receipt.publication_id,
        receipt_sha256: sourceLease.current_publication.receipt_sha256,
        task_id: fixture.receipt.task_id, task_revision: fixture.receipt.task_revision,
        claim_id: fixture.receipt.claim_id, generation: fixture.receipt.generation,
        head_sha: fixture.receipt.head_sha, ship_transaction_key: sourceLease.current_publication.ship_transaction_key,
        feedback_revision: offer.feedback_revision,
        before_reaction_token: deriveReactionToken({
          publication_id: fixture.receipt.publication_id, head_sha: fixture.receipt.head_sha,
          failing_checks: [{ id: 'CHECK_REPAIR_12', conclusion: 'FAILURE' }], unresolved_review_thread_ids: [],
          mergeability: 'MERGEABLE',
        }),
        action: 'explicit_takeover', phase: 'prepared',
        successor_claim_id: null, successor_generation: null, successor_state: null,
      });
      writeRepairDispatchProof(fixture.root, fixture.receipt.publication_id, prepared);
      const successor = takeoverPublication({
        repo_root: fixture.root, task_id: fixture.task_id, expected_claim_id: fixture.receipt.claim_id,
        expected_generation: fixture.receipt.generation, publication_id: fixture.receipt.publication_id,
        expected_head_sha: fixture.receipt.head_sha, reason: 'first takeover', session_id: 'first-session',
        new_claim_id: 'claim-first-takeover', source_worktree: fixture.root, gh_bin: fixture.gh,
        checks_path: fixture.checks, merge_seal_path: fixture.seal,
      });
      writeLeaseOwnerDurably(fixture.root, fixture.task_id, { ...successor, generation: successor.generation + 1 });
      try {
        takeoverFeedbackRepair({
          repo_root: fixture.root, offer, reason: 'retry must reject wrong successor', session_id: 'retry-session',
          new_claim_id: 'claim-retry-uuid', source_worktree: fixture.root, delivered_at: '2026-08-23T06:33:20Z',
        });
        throw new Error('expected wrong successor rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(FeedbackError);
        expect((error as FeedbackError).code).toBe('repair_offer_stale');
      }
      expect(readRepairDispatchProof(fixture.root, fixture.receipt.publication_id, prepared.repair_id)).toMatchObject({ phase: 'prepared' });
      expect(readFeedbackDeliveryReceipt(fixture.root, fixture.receipt.publication_id, 'CHECK_REPAIR_12')).toMatchObject({
        delivery_state: 'pending', delivery_channel: 'none',
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a completion request without a dispatched repair proof', () => {
    const fixture = installRepairFixture();
    try {
      expect(() => recordCompletedFeedbackRepair({
        repo_root: fixture.root,
        publication_id: fixture.receipt.publication_id,
        repair_id: `sha256:${'f'.repeat(64)}`,
        recorded_at: '2026-08-23T06:34:00Z',
      })).toThrow(FeedbackError);
      expect(readReactionAttemptReceipts(fixture.root, fixture.receipt.publication_id)).toEqual([]);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('recovers a prepared proof after the lifecycle write and promotes only its exact successor', () => {
    const fixture = installRepairFixture();
    try {
      const offer = repairOffer(fixture);
      const sourceLease = readLease(fixture.root, fixture.task_id).record;
      if (sourceLease === null || sourceLease.state !== 'reviewing' || sourceLease.current_publication === null) {
        throw new Error('fixture expected reviewing source lease');
      }
      const token = deriveReactionToken({
        publication_id: fixture.receipt.publication_id, head_sha: fixture.receipt.head_sha,
        failing_checks: [{ id: 'CHECK_REPAIR_12', conclusion: 'FAILURE' }], unresolved_review_thread_ids: [],
        mergeability: 'MERGEABLE',
      });
      const prepared = buildRepairDispatchProof({
        publication_id: fixture.receipt.publication_id,
        receipt_sha256: sourceLease.current_publication.receipt_sha256,
        task_id: fixture.receipt.task_id, task_revision: fixture.receipt.task_revision,
        claim_id: fixture.receipt.claim_id, generation: fixture.receipt.generation,
        head_sha: fixture.receipt.head_sha, ship_transaction_key: sourceLease.current_publication.ship_transaction_key,
        feedback_revision: offer.feedback_revision, before_reaction_token: token, action: 'resume_same_owner',
        phase: 'prepared', successor_claim_id: null, successor_generation: null, successor_state: null,
      });
      writeRepairDispatchProof(fixture.root, fixture.receipt.publication_id, prepared);
      reopenPublication({
        repo_root: fixture.root, task_id: fixture.task_id, claim_id: fixture.receipt.claim_id,
        expected_generation: fixture.receipt.generation, publication_id: fixture.receipt.publication_id,
        expected_head_sha: fixture.receipt.head_sha, gh_bin: fixture.gh,
        checks_path: fixture.checks, merge_seal_path: fixture.seal,
      });
      const recovered = reopenFeedbackRepair({
        repo_root: fixture.root, offer, delivered_at: '2026-08-23T06:32:30Z',
      });
      expect(recovered.envelope.repair_id).toBe(prepared.repair_id);
      expect(readRepairDispatchProof(fixture.root, fixture.receipt.publication_id, prepared.repair_id)).toMatchObject({
        phase: 'dispatched', successor_claim_id: fixture.receipt.claim_id, successor_generation: 1, successor_state: 'bound',
      });
      expect(readFeedbackDeliveryReceipt(fixture.root, fixture.receipt.publication_id, 'CHECK_REPAIR_12')).toMatchObject({
        delivery_state: 'delivered', delivery_channel: 'manual', delivered_at: '2026-08-23T06:32:30Z',
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('records one completion only after a distinct verified final ship, including a same-head re-ship', () => {
    const fixture = installRepairFixture();
    try {
      const dispatch = reopenFeedbackRepair({
        repo_root: fixture.root, offer: repairOffer(fixture), gh_bin: fixture.gh,
        checks_path: fixture.checks, merge_seal_path: fixture.seal, delivered_at: '2026-08-23T06:33:30Z',
      });
      expect(() => recordCompletedFeedbackRepair({
        repo_root: fixture.root, publication_id: fixture.receipt.publication_id,
        repair_id: dispatch.envelope.repair_id, recorded_at: '2026-08-23T06:34:00Z',
      })).toThrow(FeedbackError);
      expect(readReactionAttemptReceipts(fixture.root, fixture.receipt.publication_id)).toEqual([]);
      const final = enterCompletionReviewing(fixture, fixture.receipt);
      expect(final.completion.head_sha).toBe(fixture.receipt.head_sha);
      const first = recordCompletedFeedbackRepair({
        repo_root: fixture.root, publication_id: fixture.receipt.publication_id,
        repair_id: dispatch.envelope.repair_id, recorded_at: '2026-08-23T06:34:01Z',
      });
      expect(first).toMatchObject({
        outcome: 'completed', repair_id: dispatch.envelope.repair_id,
        successor_claim_id: fixture.receipt.claim_id, successor_generation: 1,
        completion_publication_id: final.completion.publication_id,
        completion_ship_transaction_key: final.ship_key,
      });
      const retried = recordCompletedFeedbackRepair({
        repo_root: fixture.root, publication_id: fixture.receipt.publication_id,
        repair_id: dispatch.envelope.repair_id, recorded_at: '2026-08-23T06:34:02Z',
      });
      expect(retried).toEqual(first);
      expect(readReactionAttemptReceipts(fixture.root, fixture.receipt.publication_id)).toEqual([first]);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a reviewing successor whose distinct final ship journal is not complete', () => {
    const fixture = installRepairFixture();
    try {
      const dispatch = reopenFeedbackRepair({
        repo_root: fixture.root, offer: repairOffer(fixture), gh_bin: fixture.gh,
        checks_path: fixture.checks, merge_seal_path: fixture.seal, delivered_at: '2026-08-23T06:33:40Z',
      });
      enterCompletionReviewing(fixture, fixture.receipt, 'in_progress');
      try {
        recordCompletedFeedbackRepair({
          repo_root: fixture.root, publication_id: fixture.receipt.publication_id,
          repair_id: dispatch.envelope.repair_id, recorded_at: '2026-08-23T06:34:03Z',
        });
        throw new Error('expected incomplete final ship journal rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(FeedbackError);
        expect((error as FeedbackError).code).toBe('repair_completion_unverified');
      }
      expect(readReactionAttemptReceipts(fixture.root, fixture.receipt.publication_id)).toEqual([]);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
