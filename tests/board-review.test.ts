import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planReview, type ReviewDecisionV1 } from '../src/core/board/review';
import { executeReview, withReviewLock, type ReviewPorts } from '../src/effects/board/review';
import { HerdrCoreError } from '../src/effects/terminal/herdr-core';
import type { BoardPullRequestV1, BoardV1 } from '../src/core/board/board';
import type { BoardCommentPageV1, BoardCommentV1 } from '../src/core/board/source';
import type { SeatRouteV1 } from '../src/core/board/seat-routing';
import { DEFAULT_SEATS_CONFIG, type SeatConfigV1 } from '../src/core/board/seats-settings';

const SHA = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const pr = (number: number, extra: Partial<BoardPullRequestV1> = {}): BoardPullRequestV1 => ({
  number, url: '', state: 'open', is_draft: false, base_ref: 'main', base_sha: SHA, head_ref: `feat/${number}`, head_sha: SHA, head_committed_at: '', merged_at: null,
  closes: [number * 10], refs: [], files: [], required_check: { status: 'success', completed_at: '' }, acceptance: { status: 'not_accepted' }, merge_readiness: null, merge_readiness_observed_at: null,
  tier: 'high', claude_review: 'not_required', writer_family: null, merge_hold: { status: 'none' }, ...extra,
});
const board = (prs: BoardPullRequestV1[], holds: { issue: number; reason: string }[] = []): BoardV1 =>
  ({ pull_requests: prs, parent: { number: 1 }, plan: { status: 'observed', block: { holds } } }) as unknown as BoardV1;
const comment = (body: string, url = 'https://example.test/c'): BoardCommentV1 => ({ url, created_at: '2026-11-09T10:00:00Z', author_association: 'OWNER', body });
const marker = (head: string, url = 'https://example.test/m1', seat = 'gatekeeper') => comment(`repo-harness review start\nSubject: ${head}\nSeat: ${seat}`, url);
const record = (head: string, role = 'pi') => comment(`repo-harness acceptance record\n\n| Round | Role | Subject | Verdict |\n|---|---|---|---|\n| 1 | ${role} | \`${head}\` | FAIL: 1 P1 |`);
const page = (...comments: BoardCommentV1[]): BoardCommentPageV1 => ({ truncated: false, comments });

const GATEKEEPER: SeatRouteV1 = { id: 'gatekeeper', seat: DEFAULT_SEATS_CONFIG.gatekeeper, line: 'gatekeeper: gatekeeper (codex gpt-6.1-terra high)' };
function plan(prs: BoardPullRequestV1[], comments: BoardCommentPageV1 = page(), holds: { issue: number; reason: string }[] = [], gatekeeper = GATEKEEPER): readonly ReviewDecisionV1[] {
  return planReview({ board: board(prs, holds), comments: new Map(prs.map(entry => [entry.number, comments])), gatekeeper });
}
const label = (decisions: readonly ReviewDecisionV1[]) => decisions.map(decision => decision.action === 'skip' ? `${decision.pr}:${decision.reason}` : `${decision.pr}:start`);

test('a ready, green pull request starts; every other state is skipped with its reason', () => {
  expect(label(plan([
    pr(1), pr(2, { is_draft: true }), pr(3, { required_check: { status: 'failure', completed_at: '' } }),
    pr(4, { acceptance: { status: 'accepted', via: 'record', accepted_at: '', evidence_url: '' } }), pr(5, { tier: 'low' }), pr(6, { state: 'closed' }),
    pr(7, { acceptance: { status: 'unknown', reason: 'comments_truncated', evidence_url: null } }),
  ]))).toEqual(['1:start', '2:draft', '3:ci_not_green', '4:accepted', '5:accepted', '6:not_open', '7:acceptance_unknown']);
});

const seatsOf = (decision: ReviewDecisionV1 | undefined) => decision?.action === 'start' ? decision.seats.map(entry => entry.seat) : [];

test('an unknown tier is reviewed as High; a pending Claude review adds the reviewer seat', () => {
  const [start] = plan([pr(1, { tier: null, claude_review: 'pending' })]);
  expect(start).toMatchObject({ action: 'start', tier: 'high' });
  expect(seatsOf(start)).toEqual(['gatekeeper', 'reviewer']);
  expect(seatsOf(plan([pr(1, { tier: 'high', claude_review: 'recorded' })])[0])).toEqual(['gatekeeper']);
});

test('a Medium head starts the one seat of the other family than the writer; an unknown writer family starts none', () => {
  const medium = (writer_family: BoardPullRequestV1['writer_family']) => plan([pr(1, { tier: 'medium', writer_family })]);
  expect(medium('anthropic')[0]).toMatchObject({ action: 'start', seats: [{ seat: 'gatekeeper' }] });
  expect(medium('openai')[0]).toMatchObject({ action: 'start', seats: [{ seat: 'reviewer' }] });
  expect(label(medium(null))).toEqual(['1:writer_family_unknown']);
});

test('a pull request that links a plan-held issue is skipped; the others still start', () => {
  expect(label(plan([pr(1), pr(2)], page(), [{ issue: 10, reason: 'owner decision' }]))).toEqual(['1:plan_hold', '2:start']);
});

test('an unobserved plan skips every pull request', () => {
  const unplanned = { ...board([pr(1), pr(2)]), plan: { status: 'absent', truncated: false } } as unknown as BoardV1;
  const comments = new Map([[1, page()], [2, page()]]);
  expect(label(planReview({ board: unplanned, comments, gatekeeper: GATEKEEPER }))).toEqual(['1:plan_unavailable', '2:plan_unavailable']);
});

test('a marker covers one seat: a started gatekeeper leaves the reviewer to start, and a marker without a seat covers none', () => {
  const pending = pr(1, { claude_review: 'pending' });
  expect(seatsOf(plan([pending], page(marker(SHA)))[0])).toEqual(['reviewer']);
  expect(label(plan([pending], page(marker(SHA), marker(SHA, 'https://example.test/m2', 'reviewer'))))).toEqual(['1:started']);
  expect(seatsOf(plan([pr(1)], page(comment(`repo-harness review start\nSubject: ${SHA}`)))[0])).toEqual(['gatekeeper']);
});

test('a start marker covers its head; a truncated or missing comment page starts nothing', () => {
  expect(label(plan([pr(1)], page(marker(SHA))))).toEqual(['1:started']);
  expect(label(planReview({ board: board([pr(1)]), comments: new Map(), gatekeeper: GATEKEEPER }))).toEqual(['1:started']);
  expect(label(plan([pr(1)], { truncated: true, comments: [] }))).toEqual(['1:started']);
});

test('a released marker frees its head', () => {
  const released = comment('repo-harness review start status\nClaim: https://example.test/m1\nStatus: released', 'https://example.test/s');
  expect(label(plan([pr(1)], page(marker(SHA), released)))).toEqual(['1:start']);
});

test('the delta base of a seat is an earlier head that its own family reviewed; otherwise the seat reviews the whole diff', () => {
  const bases = (comments: BoardCommentPageV1) => (plan([pr(1, { claude_review: 'pending' })], comments)[0] as Extract<ReviewDecisionV1, { action: 'start' }>).seats.map(entry => entry.delta_from);
  const reviewerMarker = marker(OLD, 'https://example.test/m2', 'reviewer');
  expect(bases(page(marker(OLD)))).toEqual([null, null]);
  expect(bases(page(marker(OLD), record(OLD)))).toEqual([OLD, null]);
  // A gatekeeper row alone gives the reviewer no base, and a Claude row alone gives the gatekeeper none.
  expect(bases(page(marker(OLD), reviewerMarker, record(OLD, 'claude (opus)')))).toEqual([null, OLD]);
  expect(bases(page(marker(OLD), record(OLD, 'acceptor')))).toEqual([null, null]);
});

function ports(overrides: Partial<ReviewPorts> = {}): ReviewPorts & { comments: string[]; tabs: Record<string, unknown>[] } {
  const comments: string[] = [];
  const tabs: Record<string, unknown>[] = [];
  return {
    comments, tabs,
    worktree: () => ({ path: '/tmp/w' }),
    comment: (_pr, body) => { comments.push(body); return `https://example.test/c${comments.length}`; },
    openTab: args => { tabs.push(args); },
    launch: async seat => ({ argv: ['agent'], tab: 'review', runtime: seat === 'reviewer' ? 'claude' : 'codex' }),
    ...overrides,
  };
}
const high = plan([pr(1)]);
const context = { repositoryId: '1', parent: 100, space: 's', dry_run: false };

test('each required seat opens its tab with its launch argv in the writer worktree, after its own marker', async () => {
  const seats: string[] = [];
  const p = ports({ launch: async seat => { seats.push(seat); return { argv: [seat], tab: seat, runtime: seat === 'reviewer' ? 'claude' : 'codex' }; } });
  const result = await executeReview(plan([pr(1, { claude_review: 'pending' })]), context, p);
  expect(result.started).toMatchObject([{ pr: 1, seat: 'gatekeeper' }, { pr: 1, seat: 'reviewer' }]);
  expect(seats).toEqual(['gatekeeper', 'reviewer']);
  expect(p.comments[0]).toContain(`Subject: ${SHA}\nSeat: gatekeeper`);
  expect(p.comments[1]).toContain('Seat: reviewer');
  expect(p.tabs[1]).toMatchObject({ argv: ['reviewer'], folder: '/tmp/w', name: 'reviewer', space: 's' });
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

test('a reviewer seat that does not launch Claude posts no marker and opens no tab', async () => {
  const p = ports({ launch: async seat => ({ argv: [seat], tab: seat, runtime: 'codex' }) });
  const result = await executeReview(plan([pr(1, { claude_review: 'pending' })]), context, p);
  expect(result.started).toMatchObject([{ seat: 'gatekeeper' }]);
  expect(result.refused).toMatchObject([{ pr: 1, reason: expect.stringContaining('reviewer_not_claude') }]);
  expect([p.comments.length, p.tabs.length]).toEqual([1, 1]);
});

test('the gatekeeper starts only when the effective gatekeeper is of another known family than the writer, and not Claude where the head needs that', () => {
  const route = (seat: SeatConfigV1, id: SeatRouteV1['id'] = 'gatekeeper-fallback'): SeatRouteV1 => (id === null ? { id, line: 'gatekeeper: none (chatgpt exhausted)' } : { id, seat, line: `gatekeeper: ${id}` });
  const pi = route({ ...DEFAULT_SEATS_CONFIG.gatekeeper, runtime: 'pi', model: 'magpie/cursor/deepseek-v41-flash-1017', effort: null });
  const claude = route({ ...DEFAULT_SEATS_CONFIG.reviewer });
  const medium = pr(1, { tier: 'medium', writer_family: 'anthropic' });
  expect(label(plan([medium], page(), [], pi))).toEqual(['1:start']);
  expect(plan([medium], page(), [], claude)[0]).toMatchObject({ action: 'skip', reason: 'review_family_unavailable', detail: 'the gatekeeper family anthropic is the writer family; gatekeeper: gatekeeper-fallback' });
  // A High head with a pending Claude review needs a non-Claude gatekeeper; one with no second review takes a Claude gatekeeper.
  expect(label(plan([pr(1, { claude_review: 'pending' }), pr(2)], page(), [], claude))).toEqual(['1:review_family_unavailable', '2:start']);
  expect(label(plan([pr(1, { tier: 'high', writer_family: 'openai' })], page(), [], route({ ...DEFAULT_SEATS_CONFIG.gatekeeper, model: null })))).toEqual(['1:review_family_unavailable']);
  expect(plan([pr(1)], page(), [], route(DEFAULT_SEATS_CONFIG.gatekeeper, null))[0]).toMatchObject({ reason: 'review_family_unavailable', detail: 'no gatekeeper seat can launch; gatekeeper: none (chatgpt exhausted)' });
  // A Medium head of another writer family starts the Claude reviewer, which the gatekeeper check does not touch.
  expect(label(plan([pr(1, { tier: 'medium', writer_family: 'openai' })], page(), [], route(DEFAULT_SEATS_CONFIG.gatekeeper, null)))).toEqual(['1:start']);
});

test('a reviewer that sent nothing releases its own marker and leaves the started gatekeeper alone', async () => {
  let tabs = 0;
  const p = ports({ openTab: () => { tabs += 1; if (tabs === 2) throw new HerdrCoreError('herdr-app', 'missing'); } });
  await expect(executeReview(plan([pr(1, { claude_review: 'pending' })]), context, p)).rejects.toThrow();
  expect(p.comments).toHaveLength(3);
  expect(p.comments[2]).toContain('Claim: https://example.test/c2\nStatus: released');
});

test('a second run under the held repository lock starts nothing', async () => {
  const env = { ...process.env, REPO_HARNESS_HOME: mkdtempSync(join(tmpdir(), 'review-lock-')) };
  let ran = 0;
  expect(await withReviewLock('1', async () => withReviewLock('1', async () => { ran += 1; return 'inner'; }, env), env)).toBeNull();
  expect(ran).toBe(0);
  expect(await withReviewLock('1', async () => 'ok', env)).toBe('ok');
});
