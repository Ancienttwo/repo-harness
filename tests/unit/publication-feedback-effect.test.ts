import { describe, expect, test } from 'bun:test';
import { readFileSync, rmSync } from 'node:fs';
import { admittedFeedbackFixture } from '../helpers/admitted-feedback-fixture';
import { buildFeedbackDeliveryReceipt, buildFeedbackEvent } from '../../src/core/publication/feedback';
import { FeedbackError, observeGitHubFeedback, showGitHubFeedback, type FeedbackSubject, type FeedbackObservationInput } from '../../src/effects/fleet/provider-feedback';
import { readFeedbackDeliveryReceipt, readReactionAttemptReceipts, writeFeedbackDeliveryReceipt, writeFeedbackEvent } from '../../src/effects/publication/feedback-store';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const receipt: FeedbackSubject = {
  publication_id: `sha256:${'1'.repeat(64)}`, task_id: '1'.repeat(64), repository_id: '123',
  issue_id: '903', campaign_id: 'review', claim: { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-1', revision: `sha256:${'2'.repeat(64)}` },
  admission_sha256: `sha256:${'3'.repeat(64)}`, head_sha: HEAD, base_sha: BASE, pr_number: 7,
  selection: { repository: 'acme/widgets', provider_repository_id: '123', pr_number: 7, expected_head_sha: HEAD, expected_base_sha: BASE },
};

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
    if (args[0] === 'repo' && args[1] === 'view') return { status: 0, stdout: JSON.stringify({ id: 'R_feedback', nameWithOwner: 'acme/widgets' }) };
    if (args[0] === 'api' && args[1] === 'repos/acme/widgets') return { status: 0, stdout: JSON.stringify({ id: 123, node_id: 'R_feedback', full_name: 'acme/widgets' }) };
    if (args[0] === 'pr' && args[1] === 'view') {
      prReads += 1;
      const mergeStateStatus = overrides.mergeability === undefined ? 'MERGEABLE' : overrides.mergeability;
      return {
        status: 0,
        stdout: JSON.stringify({
          number: receipt.pr_number, url: 'https://example.invalid/pr/7', state: 'OPEN', isDraft: false,
          headRefOid: overrides.changed_head && prReads > 1 ? 'd'.repeat(40) : HEAD,
          headRefName: 'codex/feedback', baseRefOid: BASE, baseRefName: 'main', reviewDecision: null,
          ...(mergeStateStatus === null ? {} : { mergeable: mergeStateStatus }),
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

async function installRepairFixture() {
  const fixture = await admittedFeedbackFixture(12);
  const receipt = { ...fixture.subject, pr_url: 'https://example.invalid/pr/12' };
  const event = buildFeedbackEvent({
    provider: 'github', provider_event_id: 'CHECK_REPAIR_12', publication_id: receipt.publication_id, head_sha: receipt.head_sha,
    failing_check_ids: ['CHECK_REPAIR_12'], failing_checks: [{ id: 'CHECK_REPAIR_12', conclusion: 'FAILURE' }],
    unresolved_review_thread_ids: [], changes_requested_review_ids: [], mergeability: 'MERGEABLE', summary: 'check failed',
    provider_url: receipt.pr_url, observed_at: '2026-08-23T06:31:00Z',
  });
  writeFeedbackEvent(fixture.root, event);
  writeFeedbackDeliveryReceipt(fixture.root, receipt.publication_id, buildFeedbackDeliveryReceipt({
    provider_event_id: event.provider_event_id, delivery_state: 'pending', delivery_channel: 'none',
    delivered_at: null, acknowledged_at: null, superseded_at: null,
  }));
  const identityRunner: NonNullable<FeedbackObservationInput['gh_runner']> = args => {
    if (args[0] === 'repo') return { status: 0, stdout: JSON.stringify({ id: 'R_feedback', nameWithOwner: 'acme/widgets' }) };
    if (args[0] === 'pr') return { status: 0, stdout: JSON.stringify({ number: 12, url: receipt.pr_url,
      state: 'OPEN', isDraft: false, headRefOid: receipt.head_sha, baseRefOid: receipt.base_sha,
      headRefName: 'main', baseRefName: 'main', mergeable: 'MERGEABLE', reviewDecision: null }) };
    if (args[1] === 'repos/acme/widgets') return { status: 0, stdout: JSON.stringify({ id: 123, node_id: 'R_feedback', full_name: 'acme/widgets' }) };
    return { status: 2, stdout: '' };
  };
  return { ...fixture, receipt, identityRunner };
}

describe('feedback repair lifecycle integration', () => {
  test('fetches a selected provider object on demand without persisting its untrusted body', async () => {
    const fixture = await installRepairFixture();
    try {
      const threadEvent = buildFeedbackEvent({
        provider: 'github', provider_event_id: 'THREAD_REPAIR_12', publication_id: fixture.receipt.publication_id,
        head_sha: fixture.receipt.head_sha, failing_check_ids: [], failing_checks: [], unresolved_review_thread_ids: ['THREAD_REPAIR_12'],
        changes_requested_review_ids: [], mergeability: 'MERGEABLE',
        summary: 'unresolved thread', provider_url: fixture.receipt.pr_url, observed_at: '2026-08-23T06:31:01Z',
      });
      writeFeedbackEvent(fixture.root, threadEvent);
      const beforeBinding = readFileSync(fixture.bindingPath, 'utf8');
      const beforeDelivery = readFeedbackDeliveryReceipt(fixture.root, fixture.receipt.publication_id, 'CHECK_REPAIR_12');
      const result = showGitHubFeedback({
        ...fixture.input,
        publication_id: fixture.receipt.publication_id,
        provider_event_id: 'CHECK_REPAIR_12',
        gh_runner: (args) => {
          const identity = fixture.identityRunner(args);
          if (identity.status === 0) return identity;
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
      expect(readFileSync(fixture.bindingPath, 'utf8')).toBe(beforeBinding);
      expect(readFeedbackDeliveryReceipt(fixture.root, fixture.receipt.publication_id, 'CHECK_REPAIR_12')).toEqual(beforeDelivery);
      expect(readReactionAttemptReceipts(fixture.root, fixture.receipt.publication_id)).toEqual([]);
      expect(() => showGitHubFeedback({
        ...fixture.input, publication_id: fixture.receipt.publication_id, provider_event_id: 'CHECK_REPAIR_12',
        gh_runner: (args) => fixture.identityRunner(args).status === 0 ? fixture.identityRunner(args) : ({ status: 0, stdout: JSON.stringify({ data: { node: { name: 'not an ID' } } }) }),
      })).toThrow(FeedbackError);
      expect(() => showGitHubFeedback({
        ...fixture.input, publication_id: fixture.receipt.publication_id, provider_event_id: 'CHECK_REPAIR_12',
        gh_runner: (args) => fixture.identityRunner(args).status === 0 ? fixture.identityRunner(args) : ({ status: 0, stdout: JSON.stringify({ data: { node: { id: 'CHECK_REPAIR_12', state: 'CHANGES_REQUESTED' } } }) }),
      })).toThrow(FeedbackError);
      expect(() => showGitHubFeedback({
        ...fixture.input, publication_id: fixture.receipt.publication_id, provider_event_id: 'THREAD_REPAIR_12',
        gh_runner: (args) => fixture.identityRunner(args).status === 0 ? fixture.identityRunner(args) : ({
          status: 0,
          stdout: JSON.stringify({ data: { node: {
            id: 'THREAD_REPAIR_12', isResolved: false,
            comments: { pageInfo: { hasNextPage: true, endCursor: null }, nodes: [] },
          } } }),
        }),
      })).toThrow(FeedbackError);
      expect(() => showGitHubFeedback({
        ...fixture.input, publication_id: fixture.receipt.publication_id, provider_event_id: 'missing',
        gh_runner: (args) => fixture.identityRunner(args).status === 0 ? fixture.identityRunner(args) : ({ status: 2, stdout: '', stderr: 'must not run' }),
      })).toThrow('provider feedback event is unavailable');
      expect(readFileSync(fixture.bindingPath, 'utf8')).toBe(beforeBinding);
      expect(readReactionAttemptReceipts(fixture.root, fixture.receipt.publication_id)).toEqual([]);
      expect(readFeedbackDeliveryReceipt(fixture.root, fixture.receipt.publication_id, 'CHECK_REPAIR_12')).toEqual(beforeDelivery);
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

});
