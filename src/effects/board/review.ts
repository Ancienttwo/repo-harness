import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { collectBoard, type BoardCollectInput, BoardCollectError, readRepositoryId, runGhText } from './collect';
import { planReview, REVIEW_START_HEADER, REVIEW_START_STATUS_HEADER, type ReviewDecisionV1, type ReviewSeatStartV1 } from '../../core/board/review';
import type { BoardCommentPageV1 } from '../../core/board/source';
import type { SeatConfigV1, SeatId } from '../../core/board/seats-settings';
import type { SeatRouteV1 } from '../../core/board/seat-routing';
import { gitSpawnSync, withoutRepositorySelectingGitEnv } from '../git/runner';
import { HerdrCoreError, herdrAppDo } from '../terminal/herdr-core';
import { acquireExclusiveDirectoryLock, ExclusiveLockContentionError } from '../locking/exclusive-directory-lock';
import { repoHarnessHome } from '../repo-harness-home';
import { effectiveGatekeeper, seatAccountQuotas } from '../../core/board/seat-routing';
import { readSeatsConfiguration } from './seats-configuration';
import { readQuotaReport } from './quota';

type StartDecision = Extract<ReviewDecisionV1, { action: 'start' }>;

/**
 * What `seatLaunch` (the `seats argv` command) answers for one review seat; the command layer owns it, so the caller passes it in.
 * `gatekeeper` is the effective gatekeeper that the plan checked: the launch starts that seat and reads quota no second time.
 */
export type ReviewLaunch = (seat: SeatId, labels: { readonly repositoryId: string; readonly pr: string; readonly parent: string }, cwd: string, gatekeeper: SeatRouteV1) =>
  Promise<{ readonly argv: readonly string[]; readonly tab: string | null; readonly runtime: SeatConfigV1['runtime'] }>;

export interface ReviewInput extends Pick<BoardCollectInput, 'repo_root' | 'parent' | 'host'> {
  /** The Herdr space that receives the review tabs. */
  readonly space: string;
  readonly launch: ReviewLaunch;
  /** Plan only: no marker, no seat. */
  readonly dry_run: boolean;
  /** Review this pull request only. */
  readonly pr?: number;
  /** Called at each start and refusal as it happens, so a caller keeps the completed ones when a later step throws. */
  readonly observe?: ReviewObserver;
}

export type ReviewObserver = (event: { readonly kind: 'started'; readonly pr: number; readonly seat: ReviewSeatStartV1['seat']; readonly marker_url: string } | { readonly kind: 'refused'; readonly pr: number; readonly reason: string }) => void;

/** The writes and reads of one start. Each is a process boundary, so tests replace them. */
export interface ReviewPorts {
  /** The directory of the worktree whose branch is `head_ref` and whose HEAD is `head_sha`, or the reason there is none. */
  readonly worktree: (head_ref: string, head_sha: string) => { readonly path: string } | { readonly refusal: string };
  /** Posts a pull request comment and returns its URL. */
  readonly comment: (pr: number, body: string) => string;
  readonly openTab: (args: Readonly<Record<string, unknown>>) => void;
  readonly launch: ReviewLaunch;
}

export interface ReviewResultV1 {
  readonly decisions: readonly ReviewDecisionV1[];
  readonly started: readonly { readonly pr: number; readonly seat: ReviewSeatStartV1['seat']; readonly marker_url: string }[];
  readonly refused: readonly { readonly pr: number; readonly reason: string }[];
}

/** Every comment of one pull request: `--paginate` returns the whole thread, so the page is never truncated. */
function readComments(input: Pick<ReviewInput, 'repo_root'>, pr: number): BoardCommentPageV1 {
  const pages = JSON.parse(runGhText(input, ['api', '--hostname', 'github.com', '--paginate', '--slurp', `repos/{owner}/{repo}/issues/${pr}/comments?per_page=100`])) as
    { html_url: string; created_at: string; author_association: string; body: string }[][];
  return { truncated: false, comments: pages.flat().map(({ html_url, created_at, author_association, body }) => ({ url: html_url, created_at, author_association, body })) };
}

function worktreeAt(input: Pick<ReviewInput, 'repo_root'>, headRef: string, headSha: string): { readonly path: string } | { readonly refusal: string } {
  const run = gitSpawnSync(['worktree', 'list', '--porcelain'], { cwd: input.repo_root, env: withoutRepositorySelectingGitEnv(), encoding: 'utf8' });
  if (run.error !== undefined || run.status !== 0) return { refusal: 'git did not list the worktrees' };
  const block = run.stdout.split('\n\n').find(entry => entry.split('\n').includes(`branch refs/heads/${headRef}`));
  const path = block?.split('\n').find(line => line.startsWith('worktree '))?.slice('worktree '.length);
  if (path === undefined) return { refusal: `no worktree has the branch ${headRef}` };
  const head = gitSpawnSync(['rev-parse', 'HEAD'], { cwd: path, env: withoutRepositorySelectingGitEnv(), encoding: 'utf8' });
  if (head.error !== undefined || head.status !== 0) return { refusal: `git could not read HEAD of the worktree of ${headRef}` };
  return head.stdout.trim() === headSha ? { path } : { refusal: `the worktree of ${headRef} is at ${head.stdout.trim()}, not at the PR head ${headSha}` };
}

function markerBody(decision: StartDecision, start: ReviewSeatStartV1): string {
  const reading = start.delta_from === null ? 'full review' : `delta review since ${start.delta_from}`;
  return [REVIEW_START_HEADER, `Subject: ${decision.head_sha}`, `Seat: ${start.seat}`, `PR: #${decision.pr}`, `Reading: ${reading}`].join('\n');
}

function packet(decision: StartDecision, start: ReviewSeatStartV1): string {
  const scope = start.delta_from === null
    ? 'Review the whole diff.'
    : `This is a delta review. Review the hunks that changed since ${start.delta_from} and the sibling cases of each earlier finding.`;
  return `Task: review PR #${decision.pr} at head ${decision.head_sha} (tier ${decision.tier}), as the ${start.seat} of repo-harness-issue-flow. The worktree is at that head. ${scope} Read the PR body, the issue and the recorded evidence first: gh pr view ${decision.pr} --comments. You are read-only: print your acceptance receipt block (repo-harness-review-publish-receipt, subject_sha ${decision.head_sha}) in this pane and report to the orchestrator.`;
}

/** Failures that stop `tab.new` before it sends a request. Any other failure may follow a created tab. */
const NOT_SENT: ReadonlySet<string> = new Set(['missing', 'nested', 'invalid_labels', 'invalid_address']);

/**
 * Start each required seat of each `start` decision: refuse unless the writer's worktree is at the head, then post the seat's head
 * marker and open its tab. A launch that failed before any request releases that seat's marker only, so a retry starts that seat
 * without a second one of the other. A launch that may have created the tab keeps its marker and stops, because a retry could
 * start a second seat of that role for the head.
 */
export async function executeReview(decisions: readonly ReviewDecisionV1[], context: { readonly repositoryId: string; readonly parent: number; readonly space: string; readonly dry_run: boolean; readonly gatekeeper: SeatRouteV1; readonly observe?: ReviewObserver }, ports: ReviewPorts): Promise<Omit<ReviewResultV1, 'decisions'>> {
  const started: Array<ReviewResultV1['started'][number]> = [];
  const refused: Array<ReviewResultV1['refused'][number]> = [];
  if (context.dry_run) return { started, refused };
  const refuse = (pr: number, reason: string) => { refused.push({ pr, reason }); context.observe?.({ kind: 'refused', pr, reason }); };
  for (const decision of decisions) {
    if (decision.action !== 'start') continue;
    const worktree = ports.worktree(decision.head_ref, decision.head_sha);
    if ('refusal' in worktree) {
      refuse(decision.pr, worktree.refusal);
      continue;
    }
    for (const start of decision.seats) {
      // The launch is read before the marker: a configuration error then leaves no marker, so a retry works once it is fixed.
      const launch = await ports.launch(start.seat, { repositoryId: context.repositoryId, pr: String(decision.pr), parent: String(context.parent) }, worktree.path, context.gatekeeper);
      // Only a Claude review records the verdict that the board waits for, so another runtime would leave the head pending behind its own marker.
      if (start.seat === 'reviewer' && launch.runtime !== 'claude') {
        refuse(decision.pr, `reviewer_not_claude: the reviewer seat launches ${launch.runtime}; set its runtime to claude`);
        continue;
      }
      const markerUrl = ports.comment(decision.pr, markerBody(decision, start));
      try {
        ports.openTab({ ...(launch.tab === null ? {} : { name: launch.tab }), space: context.space, folder: worktree.path, argv: launch.argv, task: packet(decision, start) });
      } catch (error) {
        if (!(error instanceof HerdrCoreError) || NOT_SENT.has(error.reason)) {
          ports.comment(decision.pr, `${REVIEW_START_STATUS_HEADER}\nClaim: ${markerUrl}\nStatus: released`);
          throw error;
        }
        throw new BoardCollectError(`launch_unknown for the ${start.seat} of PR #${decision.pr}: ${error.message}. The marker ${markerUrl} stays; check hc ls for the tab before a retry`);
      }
      started.push({ pr: decision.pr, seat: start.seat, marker_url: markerUrl });
      context.observe?.({ kind: 'started', pr: decision.pr, seat: start.seat, marker_url: markerUrl });
    }
  }
  return { started, refused };
}

/** One start run per repository at a time: two runs that read the same markers would both start the head. Null when another run holds the lock. */
export async function withReviewLock<T>(repositoryId: string, run: () => Promise<T>, env: NodeJS.ProcessEnv = process.env): Promise<T | null> {
  let lock;
  const root = join(repoHarnessHome(env), 'board');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  try {
    lock = acquireExclusiveDirectoryLock(root, `review-start-${repositoryId}.lock`, { waitTimeoutMs: 1, reclaimStaleOwner: true });
  } catch (error) {
    if (error instanceof ExclusiveLockContentionError) return null;
    throw error;
  }
  try {
    lock.assertOwned();
    return await run();
  } finally {
    lock.release();
  }
}

/** Plan the review start of one parent's pull requests and, unless `dry_run`, execute it. The board is read inside the lock, so the eligibility that the plan acts on is current. */
export async function runReview(input: ReviewInput): Promise<ReviewResultV1> {
  const repositoryId = String(readRepositoryId(input));
  const result = await withReviewLock(repositoryId, async () => {
    const board = collectBoard({ repo_root: input.repo_root, parent: input.parent, host: input.host });
    if (input.pr !== undefined && !board.pull_requests.some(pr => pr.number === input.pr)) throw new BoardCollectError(`#${input.pr} is not a pull request of #${input.parent}`);
    const open = board.pull_requests.filter(pr => (input.pr === undefined || pr.number === input.pr) && pr.state === 'open' && !pr.is_draft && pr.required_check.status === 'success' && pr.acceptance.status === 'not_accepted');
    const comments = new Map(open.map(pr => [pr.number, readComments(input, pr.number)]));
    const { seats } = readSeatsConfiguration(process.env);
    // The same projection that `seatLaunch` uses for `seats argv gatekeeper`, so the family check names the seat that launches.
    const gatekeeper = effectiveGatekeeper(seats, seatAccountQuotas((await readQuotaReport(process.env)).accounts, seats.routing));
    const decisions = planReview({ board, comments, gatekeeper }).filter(decision => input.pr === undefined || decision.pr === input.pr);
    return { decisions, ...await executeReview(decisions, { repositoryId, parent: input.parent, space: input.space, dry_run: input.dry_run, gatekeeper, observe: input.observe }, {
      worktree: (ref, sha) => worktreeAt(input, ref, sha),
      comment: (pr, body) => runGhText(input, ['pr', 'comment', String(pr), '--body-file', '-'], body),
      openTab: args => { herdrAppDo('tab.new', args); },
      launch: input.launch,
    }) };
  });
  if (result === null) throw new BoardCollectError('another board review run holds the lock of this repository; nothing was started');
  return result;
}
