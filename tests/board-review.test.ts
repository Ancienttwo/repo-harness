import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planReview, type ReviewDecisionV1 } from '../src/core/board/review';
import { executeReview, withReviewLock, type ReviewPorts } from '../src/effects/board/review';
import { HerdrCoreError } from '../src/effects/terminal/herdr-core';
import type { BoardPullRequestV1, BoardV1 } from '../src/core/board/board';
import type { BoardCommentPageV1, BoardCommentV1 } from '../src/core/board/source';

const SHA = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
type Tier = 'low' | 'medium' | 'high' | null;
const pr = (number: number, extra: Partial<BoardPullRequestV1> = {}): BoardPullRequestV1 => ({
  number, url: '', state: 'open', is_draft: false, base_ref: 'main', base_sha: SHA, head_ref: `feat/${number}`, head_sha: SHA, head_committed_at: '', merged_at: null,
  closes: [number * 10], refs: [], files: [], required_check: { status: 'success', completed_at: '' }, acceptance: { status: 'not_accepted' }, merge_readiness: null,
  tier: 'medium', claude_review: 'not_required', ...extra,
});
const board = (prs: BoardPullRequestV1[]): BoardV1 => ({ pull_requests: prs }) as unknown as BoardV1;
const comment = (body: string, url = 'https://example.test/c'): BoardCommentV1 => ({ url, created_at: '2026-11-09T10:00:00Z', author_association: 'OWNER', body });
const marker = (head: string, url = 'https://example.test/m1') => comment(`repo-harness review start\nSubject: ${head}`, url);
const record = (head: string) => comment(`repo-harness acceptance record\n\n| Round | Role | Subject | Verdict |\n|---|---|---|---|\n| 1 | pi | \`${head}\` | FAIL: 1 P1 |`);
const page = (...comments: BoardCommentV1[]): BoardCommentPageV1 => ({ truncated: false, comments });

function plan(prs: BoardPullRequestV1[], comments: BoardCommentPageV1 = page()): readonly ReviewDecisionV1[] {
  return planReview({ board: board(prs), comments: new Map(prs.map(entry => [entry.number, comments])) });
}
const label = (decisions: readonly ReviewDecisionV1[]) => decisions.map(decision => decision.action === 'skip' ? `${decision.pr}:${decision.reason}` : `${decision.pr}:start`);

test('a ready, green pull request starts; every other state is skipped with its reason', () => {
  expect(label(plan([
    pr(1), pr(2, { is_draft: true }), pr(3, { required_check: { status: 'failure', completed_at: '' } }),
    pr(4, { acceptance: { status: 'accepted', via: 'record', accepted_at: '', evidence_url: '' } }), pr(5, { tier: 'low' }), pr(6, { state: 'closed' }),
    pr(7, { acceptance: { status: 'unknown', reason: 'comments_truncated', evidence_url: null } }),
  ]))).toEqual(['1:start', '2:draft', '3:ci_not_green', '4:accepted', '5:accepted', '6:not_open', '7:acceptance_unknown']);
});

test('an unknown tier is reviewed as High and carries the second-review flag from the board', () => {
  const [start] = plan([pr(1, { tier: null, claude_review: 'pending' })]);
  expect(start).toMatchObject({ action: 'start', tier: 'high', second_reviewer_required: true });
  expect(plan([pr(1, { tier: 'high', claude_review: 'recorded' })])[0]).toMatchObject({ second_reviewer_required: false });
});

test('a start marker covers its head; a truncated or missing comment page starts nothing', () => {
  expect(label(plan([pr(1)], page(marker(SHA))))).toEqual(['1:started']);
  expect(label(planReview({ board: board([pr(1)]), comments: new Map() }))).toEqual(['1:started']);
  expect(label(plan([pr(1)], { truncated: true, comments: [] }))).toEqual(['1:started']);
});

test('a released marker frees its head', () => {
  const released = comment('repo-harness review start status\nClaim: https://example.test/m1\nStatus: released', 'https://example.test/s');
  expect(label(plan([pr(1)], page(marker(SHA), released)))).toEqual(['1:start']);
});

test('the delta base is an earlier head that has an acceptance record; otherwise the review is full', () => {
  const base = (comments: BoardCommentPageV1) => (plan([pr(1)], comments)[0] as Extract<ReviewDecisionV1, { action: 'start' }>).delta_from;
  expect(base(page(marker(OLD)))).toBeNull();
  expect(base(page(marker(OLD), record(OLD)))).toBe(OLD);
});

function ports(overrides: Partial<ReviewPorts> = {}): ReviewPorts & { comments: string[]; tabs: Record<string, unknown>[] } {
  const comments: string[] = [];
  const tabs: Record<string, unknown>[] = [];
  return {
    comments, tabs,
    worktree: () => ({ path: '/tmp/w' }),
    comment: (_pr, body) => { comments.push(body); return `https://example.test/c${comments.length}`; },
    openTab: args => { tabs.push(args); },
    launch: async () => ({ argv: ['agent'], tab: 'review', runtime: 'claude' }),
    ...overrides,
  };
}
const high = plan([pr(1)]);
const context = { repositoryId: '1', parent: 100, space: 's', dry_run: false };

test('the gatekeeper opens its tab with the launch argv in the writer worktree, after the head marker', async () => {
  const p = ports();
  const result = await executeReview(high, context, p);
  expect(result.started).toMatchObject([{ pr: 1 }]);
  expect(p.comments[0]).toContain(`Subject: ${SHA}`);
  expect(p.tabs[0]).toMatchObject({ argv: ['agent'], folder: '/tmp/w', name: 'review', space: 's' });
});

test('a dry run, and a worktree off the head, write no marker and open no seat', async () => {
  const dry = ports();
  await executeReview(high, { ...context, dry_run: true }, dry);
  const off = ports({ worktree: () => ({ refusal: 'not at head' }) });
  expect(await executeReview(high, context, off)).toMatchObject({ started: [], refused: [{ pr: 1, reason: 'not at head' }] });
  expect([dry.comments, dry.tabs, off.comments, off.tabs]).toEqual([[], [], [], []]);
});

test('a launch that sent nothing releases the marker; an ambiguous one keeps it', async () => {
  const failing = (reason: 'missing' | 'timeout') => ports({ openTab: () => { throw new HerdrCoreError('herdr-app', reason); } });
  const notSent = failing('missing');
  await expect(executeReview(high, context, notSent)).rejects.toThrow();
  expect(notSent.comments[1]).toContain('Claim: https://example.test/c1\nStatus: released');
  const unknown = failing('timeout');
  await expect(executeReview(high, context, unknown)).rejects.toThrow('launch_unknown');
  expect(unknown.comments).toHaveLength(1);
});

test('a second run under the held repository lock starts nothing', async () => {
  const env = { ...process.env, REPO_HARNESS_HOME: mkdtempSync(join(tmpdir(), 'review-lock-')) };
  let ran = 0;
  expect(await withReviewLock('1', async () => withReviewLock('1', async () => { ran += 1; return 'inner'; }, env), env)).toBeNull();
  expect(ran).toBe(0);
  expect(await withReviewLock('1', async () => 'ok', env)).toBe('ok');
});
