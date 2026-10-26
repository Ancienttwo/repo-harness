import { afterEach, describe, expect, test, spyOn } from 'bun:test';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { admittedFeedbackFixture } from '../helpers/admitted-feedback-fixture';
import { buildProgram } from '../../src/cli/index';
import * as admissionSource from '../../src/effects/admission/admission-source';
import { revokeReviewAdmission } from '../../src/effects/admission/admission-store';
import { seedReactionReceipt } from '../helpers/publication-fixture';
import { buildReactionAttemptReceipt, deriveReactionToken } from '../../src/core/publication/feedback';
import { feedbackEventPath, readFeedbackDeliveryReceipts, readFeedbackEvents } from '../../src/effects/publication/feedback-store';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fakeGh(root: string, head: string, base: string): string {
  const path = join(root, 'fake-gh.ts');
  writeFileSync(path, `#!/usr/bin/env bun
const args = Bun.argv.slice(2);
const query = args.find((value) => value.startsWith('query=')) ?? '';
const body = process.env.GH_BODY_FILE ? await Bun.file(process.env.GH_BODY_FILE).text() : '';
const observedHead = process.env.GH_HEAD_OVERRIDE ?? '${head}';
let value;
if (args[0] === 'repo' && args[1] === 'view') {
  value = { id: 'R_feedback_cli', nameWithOwner: 'acme/widgets' };
} else if (args[0] === 'api' && args[1] === 'repos/acme/widgets') {
  value = { id: 123, node_id: 'R_feedback_cli', full_name: 'acme/widgets', default_branch: 'main' };
} else if (args[0] === 'pr' && args[1] === 'view') {
  value = {
    number: 7,
    url: 'https://example.invalid/pr/7',
    state: 'OPEN',
    isDraft: false,
    headRefOid: observedHead,
    headRefName: 'codex/feedback-cli',
    baseRefOid: '${base}',
    baseRefName: 'main',
    mergeable: 'CONFLICTING', reviewDecision: null,
    body,
    createdAt: '2026-08-23T00:00:00Z',
    mergedAt: null,
    mergeCommit: null,
  };
} else if (query.includes('checkSuites')) {
  value = { data: { node: { pullRequest: { commits: { nodes: [{ commit: {
    oid: observedHead,
    checkSuites: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'SUITE_1' }] },
  } }] } } } } };
} else if (query.includes('checkRuns')) {
  value = { data: { node: { checkRuns: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{
    id: 'CHECK_1', status: 'COMPLETED', conclusion: 'FAILURE', completedAt: '2026-08-23T00:00:01Z',
  }] } } } };
} else if (query.includes('CheckRun')) {
  value = { data: { node: {
    id: 'CHECK_1', name: 'provider-check', detailsUrl: 'https://example.invalid/check/1',
    status: 'COMPLETED', conclusion: 'FAILURE',
    output: { title: 'Untrusted provider title', summary: 'UNTRUSTED-CHECK-BODY', text: null },
  } } };
} else if (query.includes('reviews(')) {
  value = { data: { node: { pullRequest: { reviews: {
    pageInfo: { hasNextPage: false, endCursor: null }, nodes: [],
  } } } } };
} else if (query.includes('reviewThreads')) {
  value = { data: { node: { pullRequest: { reviewThreads: {
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [{ id: 'THREAD_1', isResolved: false, updatedAt: '2026-08-23T00:00:02Z' }],
  } } } } };
} else {
  process.stderr.write('unexpected gh arguments: ' + args.join(' ') + '\\n');
  process.exit(2);
}
process.stdout.write(JSON.stringify(value));
`, { mode: 0o755 });
  chmodSync(path, 0o755);
  return path;
}

async function fixture() {
  const inbox = await admittedFeedbackFixture(7);
  roots.push(inbox.directory);
  const contextPath = join(inbox.root, 'feedback-context.json');
  const admission = inbox.approved.admission;
  writeFileSync(contextPath, JSON.stringify({ admission: { repository_id: admission.repository_id,
    issue_id: admission.issue_id, campaign_id: admission.campaign_id, grant_sha256: inbox.approved.grant,
    policy_sha256: admission.policy.policy_sha256, actor_id: admission.actor_id },
    claim: inbox.source.authority.claim, session: inbox.source.session, selection: inbox.selection }));
  return { ...inbox, contextPath, publicationId: inbox.publication_id, headSha: inbox.head,
    fakeGh: fakeGh(inbox.root, inbox.head, inbox.base) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function runCli(fixture: Fixture, args: readonly string[]) {
  // Inject only the authority location and offline issue transport. The effect still
  // reads the real active approval, immutable admission, binding and HEAD fences.
  const source = spyOn(admissionSource, 'readReviewAdmissionSource').mockReturnValue(fixture.source.authority.source);
  const cwd = process.cwd(), exitCode = process.exitCode;
  const gh = process.env.REPO_HARNESS_GH_BIN, git = process.env.REPO_HARNESS_GIT_BIN;
  let stdout = '', stderr = '';
  const out = spyOn(process.stdout, 'write').mockImplementation((chunk: any) => { stdout += String(chunk); return true; });
  const err = spyOn(process.stderr, 'write').mockImplementation((chunk: any) => { stderr += String(chunk); return true; });
  try {
    process.chdir(fixture.root); process.exitCode = 0;
    process.env.REPO_HARNESS_GH_BIN = fixture.fakeGh; process.env.REPO_HARNESS_GIT_BIN = 'git';
    // These feedback actions are synchronous: parseAsync completion is the barrier.
    const program = buildProgram();
    await program.parseAsync(['bun', 'repo-harness', ...args, '--context', fixture.contextPath]);
    return { status: Number(process.exitCode ?? 0), stdout, stderr };
  } finally {
    out.mockRestore(); err.mockRestore(); source.mockRestore(); process.chdir(cwd); process.exitCode = exitCode;
    if (gh === undefined) delete process.env.REPO_HARNESS_GH_BIN; else process.env.REPO_HARNESS_GH_BIN = gh;
    if (git === undefined) delete process.env.REPO_HARNESS_GIT_BIN; else process.env.REPO_HARNESS_GIT_BIN = git;
  }
}

// Historical reaction wire records remain inputs to the no-progress read model.
function appendCompletedReaction(subject: Fixture, token: string, recordedAt: string): void {
  seedReactionReceipt(subject.root, subject.publicationId, buildReactionAttemptReceipt({
    publication_id: subject.publicationId, repair_id: `sha256:${'8'.repeat(64)}`,
    successor_claim_id: 'historical-feedback-claim', successor_generation: 1,
    completion_publication_id: subject.publicationId, completion_receipt_sha256: `sha256:${'3'.repeat(64)}`,
    completion_head_sha: subject.headSha, completion_ship_transaction_key: `completion-${recordedAt}`,
    before_reaction_token: token, after_reaction_token: token, outcome: 'completed', recorded_at: recordedAt,
  }));
}

describe('fleet feedback CLI', () => {
  test('intake derives its subject from explicit admitted context when publication ID is omitted', async () => {
    const subject = await fixture();
    const result = await runCli(subject, ['fleet', 'feedback', 'intake', '--json']);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      publication_id: subject.publicationId,
      event_count: 2,
    });
  });

  test('intake rejects revoked admission before persistence', async () => {
    const subject = await fixture();
    revokeReviewAdmission({ repoRoot: subject.root, authorityHome: subject.home, repository_id: subject.admission.identity.repository_id, issue_id: subject.admission.identity.issue_id, campaign_id: subject.admission.identity.campaign_id, expectedRevision: 1 });
    const result = await runCli(subject, ['fleet', 'feedback', 'intake', '--json']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: 'provider_unavailable',
      message: expect.stringContaining('review_admission_revoked_or_replaced'),
    });
    expect(readFeedbackEvents(subject.root, subject.publicationId)).toEqual([]);
  });

  test('intake rejects a publication ID from a different explicit subject', async () => {
    const subject = await fixture();

    const result = await runCli(subject, ['fleet', 'feedback', 'intake', '--json', '--publication-id', `sha256:${'9'.repeat(64)}`]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: 'provider_unavailable',
      message: expect.stringContaining('publication-id differs'),
    });
    expect(readFeedbackEvents(subject.root, subject.publicationId)).toEqual([]);
  });

  test('intake emits JSON and retries the same provider snapshot idempotently', async () => {
    const subject = await fixture();
    const args = ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId];
    const first = await runCli(subject, args);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stderr).toBe('');
    expect(JSON.parse(first.stdout)).toMatchObject({ ok: true, publication_id: subject.publicationId, event_count: 2 });

    const second = await runCli(subject, args);
    expect(second.status, second.stderr).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({ ok: true, event_count: 2 });
    expect(readFeedbackEvents(subject.root, subject.publicationId)).toHaveLength(2);
    expect(readFeedbackDeliveryReceipts(subject.root, subject.publicationId)).toHaveLength(2);
  });

  test('offers projects a repair and reports user attention after two completed same-token attempts', async () => {
    const subject = await fixture();
    const intake = await runCli(subject, ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId]);
    expect(intake.status, intake.stderr).toBe(0);
    const offered = await runCli(subject, ['fleet', 'feedback', 'offers', '--json', '--publication-id', subject.publicationId]);
    expect(offered.status, offered.stderr).toBe(0);
    expect(JSON.parse(offered.stdout)).toMatchObject({ state: 'offered', attention_owner: 'agent' });

    const events = readFeedbackEvents(subject.root, subject.publicationId);
    const token = deriveReactionToken({
      publication_id: subject.publicationId,
      head_sha: subject.headSha,
      failing_checks: events.flatMap((event) => event.failing_checks),
      unresolved_review_thread_ids: events.flatMap((event) => event.unresolved_review_thread_ids),
      mergeability: events[0]?.mergeability ?? 'CONFLICTING',
    });
    for (const recordedAt of ['2026-08-23T00:03:00Z', '2026-08-23T00:04:00Z']) {
      appendCompletedReaction(subject, token, recordedAt);
    }
    const halted = await runCli(subject, ['fleet', 'feedback', 'offers', '--json', '--publication-id', subject.publicationId]);
    expect(halted.status, halted.stderr).toBe(0);
    expect(JSON.parse(halted.stdout)).toMatchObject({
      state: 'no_progress',
      attention_owner: 'user',
      publication_id: subject.publicationId,
      reaction_token: token,
    });
  });

  test('acknowledges a pending delivery through the manual channel', async () => {
    const subject = await fixture();
    const intake = await runCli(subject, ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId]);
    expect(intake.status, intake.stderr).toBe(0);
    const ack = await runCli(subject, [
      'fleet', 'feedback', 'ack', '--json', '--publication-id', subject.publicationId, '--provider-event-id', 'CHECK_1',
    ]);
    expect(ack.status, ack.stderr).toBe(0);
    expect(JSON.parse(ack.stdout)).toMatchObject({
      ok: true,
      receipt: { provider_event_id: 'CHECK_1', delivery_state: 'acknowledged', delivery_channel: 'manual' },
    });
  });

  test('shows provider body as untrusted without persisting it', async () => {
    const subject = await fixture();
    const intake = await runCli(subject, ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId]);
    expect(intake.status, intake.stderr).toBe(0);
    const eventPath = feedbackEventPath(subject.root, subject.publicationId, 'CHECK_1');
    const before = readFileSync(eventPath, 'utf8');
    const shown = await runCli(subject, [
      'fleet', 'feedback', 'show', '--json',
      '--publication-id', subject.publicationId,
      '--provider-event-id', 'CHECK_1',
    ]);
    expect(shown.status, shown.stderr).toBe(0);
    expect(JSON.parse(shown.stdout)).toMatchObject({
      ok: true,
      provider_event_id: 'CHECK_1',
      untrusted: true,
      body: expect.stringContaining('UNTRUSTED-CHECK-BODY'),
    });
    const after = readFileSync(eventPath, 'utf8');
    expect(after).toBe(before);
    expect(after).not.toContain('UNTRUSTED-CHECK-BODY');
  });

  test('returns argument errors as exit 2 before invoking the effect', async () => {
    const subject = await fixture();
    const result = await runCli(subject, ['fleet', 'feedback', 'ack', '--json', '--publication-id', subject.publicationId]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, error: 'invalid_argument' });
  });

});
