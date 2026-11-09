import { afterEach, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initGitRepo, run, tmpWorkspace } from './helpers/repo-fixture';
import { evaluateBoardAttention, type BoardRuleId } from '../src/core/board/attention';
import { WINDOW_WITH_WORKERS_MS, WINDOW_WITHOUT_WORKERS_MS, planAttentionDeliveries } from '../src/core/board/attention-delivery';
import { attentionLogPath, attentionWatchDoctorCheck, runAttentionWindow, serviceTerminalRepository, startAttentionWatch } from '../src/effects/board/attention-watch';
import { decodeBoard, type BoardHostPortsV1, type BoardTerminalV1, type BoardV1 } from '../src/core/board/board';
import { decodePlanBlock, PlanBlockError } from '../src/core/board/plan-block';
import { decodeReviewHazards, pathHazardHits } from '../src/core/board/hazards';
import type { PullRequestReadinessV2 } from '../src/core/publication/merge-readiness';
import { collectBoard, readLocalRepositoryId, type BoardCollectInput } from '../src/effects/board/collect';
import { runBoardMerge } from '../src/effects/board/merge';
import { boardMergeDecisions } from '../src/core/board/merge';
import { runBoardCloseout, stopCodegraphServers } from '../src/effects/board/closeout';
import type { RunArchctxProcess } from '../src/core/architecture/contracts';
import { errorEnvelope } from 'archctx-contracts';
import { githubRemoteRepository } from '../src/core/board/source';
import { renderDependencyMigrationPlan } from '../src/core/board/dependency-migration';
import { applyDependencyMigration, planDependencyMigration, runDependencyMigration } from '../src/effects/board/dependency-migration';
import { attentionHostPorts, boardHostPorts } from '../src/effects/terminal/herdr-core';
import { ADVISOR_TRANSCRIPT_LINE_WITHHELD, AdvisorSeatError, advisorSeatSendFailure, advisorTranscriptLines, advisorTurnState, decodeAdvisorSeatTranscript, readAdvisorSeat, seatStatusMessage, SEAT_STATUS_MESSAGE_MAX_CHARS, sendToAdvisorSeat } from '../src/core/board/advisor-seat';
import { decodeBoardParents, type BoardParentsV1 } from '../src/core/board/parents';
import { BoardSourceError } from '../src/core/board/source';
import { HC_MIN_VERSION } from '../src/core/terminal/herdr-pin';
import { BoardParentsError, collectBoardParents } from '../src/effects/board/parents';
import { hcStatusClass, ISSUE_FLOW_WORKER_LIMIT } from '../src/core/board/desk';
import { boardSummary, decodeBoardSummaries } from '../src/core/board/summary';
import boardParentsFixture from '../src/operator-web/fixtures/board-parents.json';

// Recorded on 2026-11-03: the two GraphQL reads of parent #1474 with the collector's own queries, the newest
// scheduled ci.yml run (cut to the fields the collector reads), and `hc ls --json` / `hc get --json` of five seat
// terminals on an isolated hc 0.1.17 core. t5 carries the repository label of another repository with the same parent.
const FIXTURES = join(import.meta.dir, 'fixtures/board');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
type Json = Record<string, any>;

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

// The blocked worker t1 last changed its status at 2026-11-02T23:18:42.936Z; the replay runs 11 minutes later.
const REPLAY_NOW = new Date(1_793_661_522_936 + 11 * 60_000);
// hc-ls.json is the unfiltered list. `ls --label` keeps the rows whose recorded labels match, as the live core did.
const HC = `#!${process.execPath}
const { readFileSync } = require('fs');
const args = process.argv.slice(2);
const gets = readFileSync(process.env.FIXTURES + '/hc-get.jsonl', 'utf8').trim().split('\\n').map(line => JSON.parse(line));
const labels = address => gets.find(get => get.address === address).labels;
if (args[0] === '--version') console.log('hc ' + process.env.HC_VERSION);
else if (args[0] === 'ls') {
  const wanted = args.flatMap((arg, at) => (args[at - 1] === '--label' ? [arg.split('=')] : []));
  const list = JSON.parse(readFileSync(process.env.FIXTURES + '/hc-ls.json', 'utf8'));
  console.log(JSON.stringify({ ...list, terminals: list.terminals.filter(row => wanted.every(([key, value]) => labels(row.address)[key] === value)) }));
} else if (args[0] === 'get') console.log(JSON.stringify(gets.find(get => get.address === args.at(-1))));
else process.exit(2);
`;

interface Replay {
  readonly parent?: (data: Json) => void;
  readonly pulls?: (data: Json) => void;
  /** Edits the recorded `archctx resolve` results of the open pull request files. */
  readonly owners?: (results: Json[]) => void;
  /** Replaces the recorded archctx process. */
  readonly archctx?: RunArchctxProcess;
  /** Replaces the hc host that replays the recorded terminals. */
  readonly host?: BoardHostPortsV1;
  /** The answer to the policy file read of the default branch; the default is a 404. */
  readonly policy?: GhAnswer;
  /** The version that the fake hc reports; the recorded core reported 0.1.17. */
  readonly hcVersion?: string;
  readonly now?: Date;
  /** The open pull requests whose readiness is ready; the default is #1491. */
  readonly ready?: readonly number[];
}

function issueNode(data: Json, number: number): Json {
  return data.repository.issue.subIssues.nodes.find((node: Json) => node.number === number);
}

function comment(body: string, createdAt: string): Json {
  return { url: `https://github.com/Ancienttwo/repo-harness/issues/1#issuecomment-${Date.parse(createdAt)}`, createdAt, authorAssociation: 'OWNER', body };
}

// `gh api` of an absent path, as the live CLI answers it: exit 1, the JSON body on stdout, the message on stderr.
const POLICY_ABSENT = { status: 1, stdout: '{"message":"Not Found","status":"404"}', stderr: 'gh: Not Found (HTTP 404)' };

function replay(options: Replay = {}): BoardV1 {
  return collectBoard(replayInput(options));
}

function replayInput(options: Replay): BoardCollectInput {
  const root = tmpWorkspace('board'); roots.push(root);
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'bin/hc'), HC); chmodSync(join(root, 'bin/hc'), 0o755);
  const parent = JSON.parse(fixture('parent-1474.graphql.json')); options.parent?.(parent.data);
  const pulls = JSON.parse(fixture('pull-requests-1474.graphql.json')); options.pulls?.(pulls.data);
  const resolved = JSON.parse(fixture('archctx-resolve-1474.json')); options.owners?.(resolved.data.results);
  const answer = (value: unknown) => ({ status: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value) });
  return {
    repo_root: root,
    parent: 1474,
    now: () => options.now ?? REPLAY_NOW,
    host: options.host ?? boardHostPorts({ env: { PATH: `${join(root, 'bin')}:/bin:/usr/bin`, FIXTURES, HC_VERSION: options.hcVersion ?? '0.1.19' } }),
    gh_runner: (args) => {
      if (args[0] === 'repo') return answer({ nameWithOwner: 'Ancienttwo/repo-harness' });
      if (args[1] === 'graphql') return answer(args.some(arg => arg.includes('subIssues')) ? parent : pulls);
      if (args.some(arg => arg.includes('actions/workflows/ci.yml/runs'))) return answer(fixture('daily-run.json'));
      if (args.includes('repos/Ancienttwo/repo-harness/contents/.ai/harness/policy.json?ref=main')) return options.policy ?? POLICY_ABSENT;
      if (args.includes('repos/{owner}/{repo}')) return answer({ id: 1_000_001 });
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    },
    // #1491 is the only PR that the recorded data shows as accepted; the readiness projection has its own suite.
    readiness: (selection) => ({ ...selection, protocol: 2, kind: 'repo-harness-pull-request-readiness', ready: (options.ready ?? [1491]).includes(selection.pr_number), blockers: [] }) as unknown as PullRequestReadinessV2,
    // archctx 0.11.2 at d0f4223f4 on the files of the open PRs. A request gets the recorded result of each of its
    // paths, in its order; exit 2 when one is ambiguous. An unrecorded path fails the test.
    archctx: {
      run: options.archctx ?? ((_binary, args) => {
        if (args[0] !== 'resolve' || args[1] !== '--paths-from') throw new Error(`unexpected archctx call: ${args.join(' ')}`);
        const results = readFileSync(args[2]!, 'utf8').trim().split('\n').map((path) => {
          const result = resolved.data.results.find((entry: Json) => entry.path === path);
          if (result === undefined) throw new Error(`no recorded archctx result for ${path}`);
          return result;
        });
        const status = results.some((result: Json) => result.ambiguous) ? 2 : 0;
        return { status, signal: null, stdout: JSON.stringify({ ...resolved, data: { results } }), stderr: '' };
      }),
    },
  };
}

function rules(board: BoardV1): BoardRuleId[] {
  return evaluateBoardAttention(board).findings.map(finding => finding.rule);
}

test('Low acceptance uses the effective tier of every linked issue: a Low closing issue with a High or unobserved ref is not accepted by tier', () => {
  const green = { name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z' };
  const via = (refs: string) => replay({
    parent: (data) => { issueNode(data, 1479).labels.nodes.push({ name: 'tier:low' }); issueNode(data, 1476).labels.nodes.push({ name: 'tier:high' }); },
    pulls: (data) => {
      const { pr1494 } = data.repository;
      pr1494.body += refs;
      pr1494.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push(green);
    },
  }).pull_requests.find(pr => pr.number === 1494)!.acceptance.status;
  expect([via(''), via('\nRefs #1476\n'), via('\nRefs #1460\n')]).toEqual(['accepted', 'not_accepted', 'not_accepted']);
});

test('claude_review: only a branch-bound writer claim that names Claude, with every linked tier observed, skips the second review; a Claude record row for the head settles it', () => {
  const claim = (runtime: string, branch: string) => comment(`repo-harness issue claim\nStatus: active\nRole: writer\nBranch: ${branch}\nRuntime: ${runtime}`, '2026-11-02T10:00:00Z');
  const record = (sha: string, role: string) => `repo-harness acceptance record\n\n| Round | Role | Subject | Verdict |\n|---|---|---|---|\n| 1 | ${role}, read-only | \`${sha}\` | PASS: 0 P1 |\n`;
  const board = replay({
    parent: (data) => {
      for (const [number, runtime, branch] of [[1475, 'claude', 'feat/1475-hc-transport'], [1479, 'claude', 'feat/1479-notify-relay'], [1476, 'codex', 'feat/1476-sessions-herdr-core']] as const) {
        const node = issueNode(data, number);
        node.labels.nodes.push({ name: 'tier:high' });
        node.comments.nodes.push(claim(runtime, branch));
      }
    },
    pulls: (data) => {
      const { pr1494, pr1499 } = data.repository;
      pr1494.body += '\nCloses #1460\n';
      pr1499.comments.nodes.push(comment(record(pr1499.headRefOid, 'claude (opus)'), '2026-11-02T22:00:00Z'));
    },
  });
  // #1494 also closes #1460, outside the board: its tier is unknown and counts as High, so the claude claim is not enough.
  expect(board.pull_requests.map(pr => [pr.number, pr.tier, pr.claude_review])).toEqual([[1491, 'high', 'not_required'], [1494, null, 'pending'], [1499, 'high', 'recorded']]);
  // A10 reads the open, non-draft #1491: a Claude writer claim gives no finding; a Codex claim with no Claude row does.
  expect(evaluateBoardAttention(board).findings.filter(finding => finding.rule === 'A10')).toEqual([]);
  const codex = replay({
    parent: (data) => {
      const node = issueNode(data, 1475);
      node.labels.nodes.push({ name: 'tier:high' });
      node.comments.nodes.push(claim('codex', 'feat/1475-hc-transport'));
    },
  });
  expect(evaluateBoardAttention(codex).findings.filter(finding => finding.rule === 'A10').map(finding => finding.pull_requests)).toEqual([[1491]]);
});

test('replay: the recorded #1474 reads project to a board, and its findings come from the recorded state', () => {
  const board = replay();
  expect(decodeBoard(JSON.parse(JSON.stringify(board)))).toEqual(board);
  expect(board.items.map(item => [item.number, item.pull_requests])).toEqual([
    [1475, [1491]], [1476, [1499]], [1477, []], [1478, []], [1479, [1494]], [1480, []], [1481, []], [1482, []], [1483, []],
  ]);
  // #1462 and #1492 cross-reference sub-issues but close #1460 and #1490: a mention is not a link.
  expect(board.pull_requests.map(pr => [pr.number, pr.base_ref, pr.required_check.status])).toEqual([
    [1491, 'main', 'success'], [1494, 'feat/1475-hc-transport', 'missing'], [1499, 'feat/1475-hc-transport', 'missing'],
  ]);
  // The round-6 record is a subject line, not a table row (rounds above 3 have no receipt).
  expect(board.pull_requests[0]!.acceptance).toMatchObject({ status: 'accepted', via: 'record', accepted_at: '2026-11-02T21:12:35Z' });
  expect(board.plan).toMatchObject({ status: 'unavailable', reason: 'plan block invalid: the plan comment has 0 fenced json blocks, expected 1' });
  expect(board.daily_run).toMatchObject({ status: 'observed', conclusion: 'failure', open_repair_issues: [] });
  expect(board.tooling).toEqual({ hc: { status: 'observed', version: '0.1.19', min_version: HC_MIN_VERSION }, herdr_app: { status: 'not_pinned' } });
  expect(board.execution.status === 'observed' && board.execution.terminals.map(terminal => terminal.seat_status === 'observed'
    ? [terminal.address, terminal.seat, terminal.issue, terminal.status, terminal.agent] : [terminal.address, terminal.reason, terminal.agent])).toEqual([
    ['t1', 'worker', 1476, 'blocked', 'codex'], ['t2', 'worker', 1475, 'done', 'claude-code'],
    ['t3', 'orchestrator', null, 'idle', null], ['t4', 'seat_label_missing', 'sleep'],
  ]);
  // One hc core holds seats of two repositories with parent #1474; each board reads only its own repository id.
  const foreign = replay({ parent: (data) => { data.repository.databaseId = 987654321; } });
  expect(foreign.execution.status === 'observed' && foreign.execution.terminals.map(terminal => terminal.address)).toEqual(['t5']);
  // No terminal carries both labels: the seats are not labelled, which is not "no stuck seats".
  expect(replay({ parent: (data) => { data.repository.databaseId = 1; } }).execution).toEqual({ status: 'unavailable', reason: 'no_seat_terminals' });

  const attention = evaluateBoardAttention(board);
  expect(attention.findings.map(finding => [finding.rule, finding.route, finding.pull_requests, finding.terminals])).toEqual([
    ['A1', 'orchestrator', [1491], []],
    ['A3', 'orchestrator', [], ['t1']],
    ['A7', 'orchestrator', [], []],
    ['A10', 'orchestrator', [1491], []],
    ['R2', 'advisor', [1494, 1499], []],
  ]);
  // t4 has no seat label: the board does not guess its seat. The plan comment has no block, so R1 and R4 wait.
  // #1494 and #1499 change `.github/` and their items carry no tier label, so R3 waits.
  // #1494 and #1499 change several capabilities, so R5 waits too, and names their unowned paths. #1491 changes
  // one capability and its own model node file (owned by contract-assets), which R5 does not count.
  expect(attention.unevaluated.map(entry => [entry.rule, entry.reason, entry.subject])).toEqual([
    ['A3', 'seat_label_missing', 't4'],
    ['A4', 'seat_label_missing', 't4'],
    ['R1', 'plan_unavailable', 'https://github.com/Ancienttwo/repo-harness/issues/1474#issuecomment-6588782468'],
    ['R3', 'tier_label_missing', '#1494 #1479'],
    ['R3', 'tier_label_missing', '#1499 #1476'],
    ['R4', 'plan_unavailable', null],
    ['R5', 'tier_label_missing', '#1494 #1479 .ai/harness/policy.json (unowned) src/effects/terminal/herdr-decision.ts (unowned)'],
    ['R5', 'tier_label_missing', '#1499 #1476 .ai/harness/policy.json (unowned) src/core/sessions/task-sessions.ts (unowned)'],
  ]);
});

test('attention rules and delivery windows recognize all worker seat kinds', () => {
  const board = replay();
  if (board.execution.status !== 'observed') throw new Error('the replay observes the seats');
  const [blocked, done] = board.execution.terminals;
  for (const seat of ['worker', 'worker-deep', 'worker-important', 'worker-important-fast', 'worker-light', 'orchestrator', 'worker-custom']) {
    const terminals = [{ ...blocked!, seat }, { ...done!, seat }] as BoardTerminalV1[];
    const candidate: BoardV1 = { ...board, items: board.items.map(item => item.number === 1475 ? { ...item, claim_status: { status_kind: 'none' } } : item), execution: { status: 'observed', terminals } };
    const attention = evaluateBoardAttention(candidate);
    const worker = seat !== 'orchestrator' && seat !== 'worker-custom';
    expect(attention.findings.filter(finding => finding.rule === 'A3' || finding.rule === 'A4').map(finding => finding.rule)).toEqual(worker ? ['A3', 'A4'] : []);
    expect(planAttentionDeliveries(candidate, attention, 0).window_ms).toBe(worker ? WINDOW_WITH_WORKERS_MS : WINDOW_WITHOUT_WORKERS_MS);
  }
});

test('board summary counts the recorded PRs, planned issue members and orchestrator findings', () => {
  const board = replay();
  expect(boardSummary(board)).toEqual({ queue: 0, ci_failures: 0, batch: { accepted: null, size: null }, current_batch: null, needs_you: 4, worker_limit: ISSUE_FLOW_WORKER_LIMIT,
    seats: { status: 'observed', stalled: 0, desks: [
      { seat: 'worker', agent: 'codex', issue: 1476, pr: 1499, state: 'blocked' }, { seat: 'worker', agent: 'claude-code', issue: 1475, pr: 1491, state: 'done' },
    ] } });
  const block = { protocol: 1, kind: 'repo-harness.plan', merge_order: [], holds: [], batches: [[1475, 1476], [1477, 1479]], seat_limits: { worker: 4 } } as const;
  const planned: BoardV1 = { ...board, plan: { status: 'observed', comment_url: 'https://github.com/plan', created_at: board.observed_at, revision: 1,
    block },
    pull_requests: board.pull_requests.map(pr => pr.number === 1494 ? { ...pr, required_check: { status: 'failure', completed_at: board.observed_at } }
      : pr.number === 1499 ? { ...pr, state: 'closed' } : pr) };
  expect(boardSummary(planned)).toMatchObject({ queue: 0, ci_failures: 1, batch: { accepted: 1, size: 4 }, current_batch: { accepted: 1, size: 2 }, worker_limit: 4 });
  const accepted = planned.pull_requests.find(pr => pr.number === 1491)!;
  const reopened: BoardV1 = { ...planned,
    items: planned.items.map(item => item.number === 1475 ? { ...item, pull_requests: [1491, 1500] } : item),
    pull_requests: [...planned.pull_requests.map(pr => pr.number === 1491 ? { ...pr, state: 'closed' as const } : pr),
      { ...accepted, number: 1500, state: 'open', acceptance: { status: 'not_accepted' } }],
  };
  expect(boardSummary(reopened)).toMatchObject({ queue: 1, batch: { accepted: 0, size: 4 } });
  expect(boardSummary({ ...reopened, pull_requests: reopened.pull_requests.map(pr => pr.number === 1500
    ? { ...pr, required_check: { status: 'pending' } } : pr) }).queue).toBe(0);
  const observedPlan = (batches: readonly (readonly number[])[]): BoardV1['plan'] => ({ status: 'observed', comment_url: 'https://github.com/plan', created_at: board.observed_at, revision: 1, block: { ...block, batches } });
  // One exact row per plan state.
  for (const [plan, batch, current_batch, worker_limit] of [
    [observedPlan(block.batches), { accepted: 1, size: 4 }, { accepted: 1, size: 2 }, 4],
    [observedPlan([]), { accepted: 0, size: 0 }, null, 4],
    [{ status: 'absent', truncated: false }, { accepted: null, size: null }, null, ISSUE_FLOW_WORKER_LIMIT],
    [{ status: 'unavailable', comment_url: 'https://github.com/plan', reason: 'plan block invalid' }, { accepted: null, size: null }, null, ISSUE_FLOW_WORKER_LIMIT],
  ] as const) {
    const summary = boardSummary({ ...planned, plan });
    expect(summary.batch).toEqual(batch);
    expect(summary.current_batch).toEqual(current_batch);
    expect(summary.worker_limit).toBe(worker_limit);
  }
  // The current batch is the first with an unmerged member, and a merged member no longer counts as accepted.
  const merged = (issues: readonly number[]): BoardV1 => { const numbers = planned.items.filter(item => issues.includes(item.number)).flatMap(item => item.pull_requests);
    return { ...planned, pull_requests: planned.pull_requests.map(pr => numbers.includes(pr.number) ? { ...pr, state: 'merged' as const } : pr) }; };
  expect(boardSummary(merged([1475])).current_batch).toEqual({ accepted: 0, size: 2 });
  expect(boardSummary(merged([1475, 1476])).current_batch).toEqual({ accepted: 0, size: 2 });
  expect(boardSummary({ ...merged([1475, 1476]), plan: observedPlan([[1475, 1476]]) }).current_batch).toBeNull();
});

test('board summary gives each live seat outside the stage the desk state of the room rules', () => {
  const board = replay();
  if (board.execution.status !== 'observed') throw new Error('the replay observes the seats');
  const seat = board.execution.terminals[0]!, pr = board.pull_requests.find(entry => entry.number === 1499)!, item = board.items.find(entry => entry.number === 1476)!;
  const check = (required_check: BoardV1['pull_requests'][number]['required_check']) => ({ ...pr, state: 'open' as const, acceptance: { status: 'not_accepted' as const }, required_check });
  const completed = { completed_at: board.observed_at };
  const known = { status_kind: 'unknown' } as const, none = { status_kind: 'none' } as const;
  for (const [state, labels, status, source, claim_status] of [
    ['blocked', { issue: null, pr: null }, 'blocked', check({ status: 'failure', ...completed }), none],
    ['error', {}, 'error', check({ status: 'failure', ...completed }), none],
    ['unknown', { issue: null, pr: null }, 'working', check({ status: 'failure', ...completed }), none],
    ['unknown', { issue: null, pr: null }, 'done', check({ status: 'missing' }), known],
    ['ci_failed', {}, 'working', check({ status: 'failure', ...completed }), none],
    ['ci_pending', {}, 'working', check({ status: 'pending' }), none],
    ['acceptance_queue', {}, 'working', check({ status: 'success', ...completed }), none],
    ['no_claim_status', {}, 'working', check({ status: 'missing' }), none],
    ['coding', {}, 'working', check({ status: 'missing' }), known],
    ['done', {}, 'done', check({ status: 'missing' }), known],
    ['no_claim_status', {}, 'done', check({ status: 'missing' }), none],
    ['idle', {}, 'idle', check({ status: 'missing' }), known],
    ['idle', {}, null, check({ status: 'missing' }), known],
    ['idle', {}, 'thinking', check({ status: 'missing' }), known],
  ] as const) {
    const terminal = { ...seat, ...labels, status } as BoardTerminalV1;
    const one: BoardV1 = { ...board, pull_requests: [source], items: [{ ...item, claim_status }], execution: { status: 'observed', terminals: [terminal] } };
    expect(boardSummary(one).seats).toEqual({ status: 'observed', stalled: state === 'no_claim_status' ? 1 : 0,
      desks: [{ seat: 'worker', agent: 'codex', issue: 'issue' in labels ? null : 1476, pr: 'pr' in labels ? null : 1499, state }] });
  }
  const finished = { ...seat, state: 'finished' } as BoardTerminalV1, advisor = { ...seat, seat: 'advisor' } as BoardTerminalV1;
  expect(boardSummary({ ...board, execution: { status: 'observed', terminals: [finished, advisor] } }).seats).toEqual({ status: 'observed', desks: [], stalled: 0 });
  expect(boardSummary({ ...board, execution: { status: 'unavailable', reason: 'no_seat_terminals' } }).seats).toEqual({ status: 'unavailable', reason: 'no_seat_terminals' });
});

test('one classifier reads the hc status word for the desk rules and the advisor turn', () => {
  for (const [word, reading, turn] of [
    ['working', 'working', 'running'], ['blocked', 'blocked', 'running'], ['error', 'error', 'unknown'], ['done', 'done', 'over'], ['idle', 'idle', 'over'],
    [null, 'unreported', 'unknown'], ['thinking', 'other', 'unknown'],
  ] as const) expect([word, hcStatusClass(word), advisorTurnState(word)]).toEqual([word, reading, turn]);
});

test('the seat status message is one redacted line of at most 200 characters', () => {
  const token = `ghp_${'a'.repeat(30)}`;
  for (const [message, line] of [
    [null, null], [' \n ', null], ['waits for\n  review\t#12', 'waits for review #12'],
    [`push failed: ${token}`, 'push failed: ghp_[REDACTED]'],
    ['b'.repeat(SEAT_STATUS_MESSAGE_MAX_CHARS + 1), 'b'.repeat(SEAT_STATUS_MESSAGE_MAX_CHARS)],
    // The redaction runs before the cut, so a token over the cut is replaced and not cut in half.
    [`${'b'.repeat(190)} ${token}`, `${'b'.repeat(190)} ghp_[REDA`],
    ['b'.repeat(1001), ADVISOR_TRANSCRIPT_LINE_WITHHELD],
    // The join makes an assignment, and the cut turns the safe value `none` into `no`.
    ['TOKEN\n=abc', ADVISOR_TRANSCRIPT_LINE_WITHHELD],
    [`${'b'.repeat(191)} TOKEN=none`, ADVISOR_TRANSCRIPT_LINE_WITHHELD],
    ['-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----', Array(3).fill(ADVISOR_TRANSCRIPT_LINE_WITHHELD).join(' ')],
  ] as const) expect(seatStatusMessage(message)).toBe(line);
});

test('one strict summary decoder checks snapshots and route rows', () => {
  const row = { parent: 1474, status: 'observed', observed_at: REPLAY_NOW.toISOString(),
    summary: { queue: 2, ci_failures: 0, batch: { accepted: 1, size: 2 }, current_batch: { accepted: 1, size: 2 }, needs_you: 3, worker_limit: 6,
      seats: { status: 'observed', stalled: 1, desks: [{ seat: 'worker', agent: null, issue: 1475, pr: null, state: 'no_claim_status' }, { seat: 'worker', agent: 'codex', issue: null, pr: 1499, state: 'coding' }] } } } as const;
  const response = { protocol: 3, kind: 'repo-harness.board-summaries', repository_id: 'repo-a', parents: [row] } as const;
  expect(decodeBoardSummaries(response)).toEqual(response);
  expect(decodeBoardSummaries({ ...response, parents: [{ parent: 1474, status: 'not_read' }, { parent: 1651, status: 'unavailable', reason: 'snapshot_invalid' }] }).parents).toHaveLength(2);
  const summary = (fields: Record<string, unknown>) => ({ ...row, summary: { ...row.summary, ...fields } });
  const desk = row.summary.seats.desks[0];
  const desks = (...rows: readonly unknown[]) => summary({ seats: { status: 'observed', stalled: 0, desks: rows } });
  expect(decodeBoardSummaries({ ...response, parents: [summary({ current_batch: null, seats: { status: 'unavailable', reason: 'no_seat_terminals' } })] }).parents).toHaveLength(1);
  for (const invalid of [{ ...response, protocol: 1 }, { ...response, kind: 'other' }, { ...response, repository_id: '../a' },
    { ...response, extra: 1 }, { ...response, parents: [row, row] }, ...[
      { ...row, observed_at: 'yesterday' }, { ...row, observed_at: '2026-02-31T00:00:00Z' }, { ...row, parent: 0 }, { ...row, extra: 1 },
      { ...row, summary: { ...row.summary, queue: -1 } }, { ...row, summary: { ...row.summary, needs_you: 0.5 } },
      { ...row, summary: { ...row.summary, batch: { accepted: 3, size: 2 } } },
      { ...row, summary: { ...row.summary, batch: { accepted: null, size: 2 } } },
      summary({ current_batch: { accepted: 3, size: 2 } }), summary({ current_batch: { accepted: null, size: null } }), summary({ current_batch: undefined }),
      summary({ worker_limit: 0 }), summary({ worker_limit: null }), summary({ seats: null }), summary({ seats: { status: 'other' } }),
      summary({ seats: { status: 'unavailable', reason: '' } }), summary({ seats: { status: 'observed', desks: [desk], stalled: 0 } }),
      summary({ seats: { status: 'observed', desks: {}, stalled: 0 } }), desks({ ...desk, address: 't1' }), desks({ ...desk, seat: '' }), desks({ ...desk, state: 'away' }),
      desks({ ...desk, issue: 0 }), desks({ ...desk, pr: '1499' }), desks({ ...desk, agent: 1 }),
      { parent: 1474, status: 'unavailable', reason: '' }, { parent: 1474, status: 'not_read', summary: row.summary },
    ].map(parent => ({ ...response, parents: [parent] }))]) expect(() => decodeBoardSummaries(invalid)).toThrow('board summaries invalid');
});

test('decoders refuse an unknown protocol or kind', () => {
  expect(() => decodeBoard({ protocol: 2, kind: 'repo-harness.board' })).toThrow('unsupported board protocol: 2');
  expect(() => decodeBoard({ protocol: 1, kind: 'repo-harness.board' })).toThrow('unsupported board protocol: 1');
  expect(() => decodeBoard({ protocol: 3, kind: 'fleet_board_snapshot' })).toThrow('unsupported board kind: fleet_board_snapshot');
  const block = (value: Json) => `repo-harness plan\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n`;
  const valid = { protocol: 1, kind: 'repo-harness.plan', merge_order: [1475], holds: [], batches: [], seat_limits: { worker: 3 } } as const;
  expect(decodePlanBlock(block(valid))).toEqual(valid);
  expect(() => decodePlanBlock(block({ ...valid, protocol: 2 }))).toThrow(new PlanBlockError('unsupported protocol 2'));
  expect(() => decodePlanBlock(block({ ...valid, kind: 'plan' }))).toThrow(new PlanBlockError('unsupported kind "plan"'));
  expect(() => decodePlanBlock(block({ ...valid, waves: [] }))).toThrow(PlanBlockError);
});

test('decoders refuse a missing or invalid plan revision, merge policy or seat branch; null is the explicit unknown', () => {
  const recorded = JSON.parse(JSON.stringify(replay()));
  const plan = (revision: unknown) => ({ ...recorded, plan: { status: 'observed', comment_url: 'https://github.com/plan', created_at: recorded.observed_at, revision, block: {} } });
  const seat = (branch: unknown) => [{ ...recorded.execution.terminals[0], branch }];
  const board = (branch: unknown) => ({ ...recorded, execution: { status: 'observed', terminals: seat(branch) } });
  const parents = (branch: unknown) => ({ ...boardParentsFixture, seats: seat(branch) });
  const { acceptance_merge: _dropped, ...noPolicy } = recorded;
  for (const invalid of [plan(undefined), plan(0), plan(1.5), plan('1'), noPolicy, { ...recorded, acceptance_merge: 'maybe' }, board(undefined), board('')]) {
    expect(() => decodeBoard(invalid)).toThrow('invalid board');
  }
  for (const valid of [plan(null), plan(7), { ...recorded, acceptance_merge: 'unknown' }, board(null), board('main')]) expect(decodeBoard(valid)).toEqual(valid);
  for (const invalid of [parents(undefined), parents(''), { ...parents(null), seats: undefined }]) expect(() => decodeBoardParents(invalid)).toThrow('board seat');
  expect(decodeBoardParents(parents('main')).seats[0]!.branch).toBe('main');
  // A status message that leaves the server is one redacted line within the limit, and null is no message.
  const message = (status_msg: unknown) => ({ ...boardParentsFixture, seats: [{ ...recorded.execution.terminals[0], status_msg }] });
  for (const invalid of [undefined, 7, 'a\nb', 'c'.repeat(SEAT_STATUS_MESSAGE_MAX_CHARS + 1), `ghp_${'a'.repeat(30)}`]) expect(() => decodeBoardParents(message(invalid))).toThrow('invalid board seat status message on t1');
  for (const valid of [null, 'c'.repeat(SEAT_STATUS_MESSAGE_MAX_CHARS)]) expect(decodeBoardParents(message(valid)).seats[0]!.status_msg).toBe(valid);
  expect(() => decodeBoard({ ...recorded, execution: { status: 'observed', terminals: message('a\nb').seats } })).toThrow('invalid board seat status message on t1');
});

test('plan revision: the ordinal of the newest plan comment among the write-access plan comments, and null on a truncated read', () => {
  const block = { protocol: 1, kind: 'repo-harness.plan', merge_order: [], holds: [], batches: [], seat_limits: { worker: 3 } };
  const plan = (at: string, body = `repo-harness plan\n\n\`\`\`json\n${JSON.stringify(block)}\n\`\`\`\n`) => comment(body, at);
  const revision = (nodes: Json[], truncated = false) => {
    const board = replay({ parent: (data) => { data.repository.issue.comments = { pageInfo: { hasPreviousPage: truncated }, nodes }; } });
    return board.plan.status === 'observed' ? board.plan.revision : board.plan.status;
  };
  const [first, second, third] = [plan('2026-11-01T00:00:00Z'), plan('2026-11-02T00:00:00Z'), plan('2026-11-03T00:00:00Z')];
  const invalid = plan('2026-11-01T12:00:00Z', 'repo-harness plan\n\nno block');
  const request = { ...plan('2026-11-04T00:00:00Z'), authorAssociation: 'NONE' };
  expect([
    revision([first]), revision([first, second, third]), revision([first, invalid, third]), revision([first, second, request]),
    revision([first, second], true), revision([first, invalid]), revision([]),
  ]).toEqual([1, 3, 3, 2, null, 'unavailable', 'absent']);
});

const POLICY_ON = { status: 0, stdout: JSON.stringify({ type: 'file', path: '.ai/harness/policy.json', encoding: 'base64', content: Buffer.from('{"publication":{"acceptance_merge":"on"}}').toString('base64') }) };

/** #1491 (closes #1475) is accepted by record, green and ready; the plan orders #1475 first and #1475 is tier:medium. */
function mergeReplay(edit: { parent?: (data: Json) => void; pulls?: (data: Json) => void; order?: number[]; holds?: Json[] } = {}, options: Replay = {}): Replay {
  return {
    policy: POLICY_ON,
    ...options,
    parent: (data) => {
      const block = { protocol: 1, kind: 'repo-harness.plan', merge_order: edit.order ?? [1475, 1479], holds: edit.holds ?? [], batches: [], seat_limits: { worker: 4 } };
      data.repository.issue.comments.nodes.push(comment(`repo-harness plan\n\n\`\`\`json\n${JSON.stringify(block)}\n\`\`\``, '2026-11-02T22:00:00Z'));
      issueNode(data, 1475).labels.nodes.push({ name: 'tier:medium' });
      edit.parent?.(data);
    },
    pulls: edit.pulls,
  };
}

function mergeReason(edit: Parameters<typeof mergeReplay>[0] = {}, options: Replay = {}, pr = 1491): string {
  const decision = boardMergeDecisions(replay(mergeReplay(edit, options))).find(entry => entry.pr === pr)!;
  return decision.eligible ? 'eligible' : decision.reason;
}

test('board merge: an accepted, green, ready PR first in plan order is eligible, A11 wakes the orchestrator, and the merge pins its head and base', () => {
  const board = replay(mergeReplay());
  expect(evaluateBoardAttention(board).findings.filter(finding => finding.rule === 'A11').map(finding => [finding.pull_requests, finding.message]))
    .toEqual([[[1491], 'eligible: run repo-harness board merge --parent 1474 --pr 1491']]);
  const pr = board.pull_requests.find(entry => entry.number === 1491)!;
  const calls: Json[] = [];
  const merge = (input: Json) => { calls.push(input); return { exit_code: 0, document: { ok: true } } as never; };
  const merged = runBoardMerge({ ...replayInput(mergeReplay()), pr: null, dry_run: false, merge });
  expect([merged.target, merged.exit_code]).toEqual([1491, 0]);
  expect(calls.map(call => [call.pr_number, call.expected_head_sha, call.expected_base_sha, call.provider_repository_id, call.repository]))
    .toEqual([[1491, pr.head_sha, pr.base_sha, '1000001', 'Ancienttwo/repo-harness']]);
  const dry = runBoardMerge({ ...replayInput(mergeReplay()), pr: 1491, dry_run: true, merge });
  const refused = runBoardMerge({ ...replayInput(mergeReplay()), pr: 1494, dry_run: false, merge });
  expect([dry.target, dry.exit_code, refused.target, refused.exit_code, calls.length]).toEqual([1491, 0, null, 4, 1]);
});

test('board merge: hold records narrow the merge; a newer release on the same thread ends a hold', () => {
  const hold = (body: string, at: string) => comment(body, at);
  const onPr = (...bodies: [string, string][]) => ({ pulls: (data: Json) => { data.repository.pr1491.comments.nodes.push(...bodies.map(([body, at]) => hold(body, at))); } });
  const onParent = (body: string, truncated = false) => ({ parent: (data: Json) => {
    data.repository.issue.comments.nodes.push(hold(body, '2026-11-02T21:00:00Z'));
    data.repository.issue.comments.pageInfo.hasPreviousPage = truncated;
  } });
  expect([
    mergeReason(onPr(['repo-harness merge hold\nReason: owner said stop', '2026-11-02T21:00:00Z'])),
    mergeReason(onPr(['repo-harness merge hold\nReason: owner said stop', '2026-11-02T21:00:00Z'], ['repo-harness merge hold released', '2026-11-02T21:30:00Z'])),
    mergeReason(onParent('repo-harness merge hold\nIssues: #1479')),
    mergeReason(onParent('repo-harness merge hold')),
    mergeReason({ parent: (data) => { data.repository.issue.comments.pageInfo.hasPreviousPage = true; } }),
  ]).toEqual(['held', 'eligible', 'eligible', 'held', 'hold_unknown']);
});

test('board merge: plan holds, plan order, the provisional Low path, a missing Claude review, readiness and the policy switch each refuse', () => {
  const lowGreen = {
    parent: (data: Json) => { issueNode(data, 1479).labels.nodes.push({ name: 'tier:low' }); },
    pulls: (data: Json) => {
      const { pr1494 } = data.repository;
      pr1494.isDraft = false;
      pr1494.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push({ name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z' });
    },
  };
  expect([
    mergeReason({ holds: [{ issue: 1475, reason: 'owner item' }] }),
    mergeReason({ order: [1479, 1475] }),
    mergeReason({ order: [1479] }),
    mergeReason({ ...lowGreen, order: [1479, 1475] }, {}, 1494),
    mergeReason({ parent: (data) => { issueNode(data, 1475).labels.nodes = []; } }),
    mergeReason({}, { ready: [] }),
    mergeReason({}, { policy: POLICY_ABSENT }),
  ]).toEqual(['plan_hold', 'merge_order', 'not_in_merge_order', 'not_accepted', 'claude_review_pending', 'not_ready', 'acceptance_merge_off']);
  // The Low PR is accepted on the provisional tier_low path, which an unattended merge does not take.
  expect(replay(mergeReplay({ ...lowGreen, order: [1479, 1475] })).pull_requests.find(pr => pr.number === 1494)!.acceptance).toMatchObject({ status: 'accepted', via: 'tier_low' });
});

test('merge policy: the policy file of the default branch through the one parser; only an absent file or key reads as off', () => {
  const file = (text: string) => ({ status: 0, stdout: JSON.stringify({ type: 'file', path: '.ai/harness/policy.json', encoding: 'base64', content: Buffer.from(text).toString('base64') }) });
  const cases: readonly (readonly [GhAnswer | undefined, string])[] = [
    [file('{"publication":{"acceptance_merge":"on"}}'), 'on'],
    [file('{"publication":{"acceptance_merge":"off"}}'), 'off'],
    [file('{"publication":{}}'), 'off'],
    [file('{}'), 'off'],
    [undefined, 'off'],
    // The parser refuses: not JSON, a bad switch value, an unknown publication field.
    [file('{'), 'unknown'],
    [file('{"publication":{"acceptance_merge":"maybe"}}'), 'unknown'],
    [file('{"publication":{"other":true}}'), 'unknown'],
    // The read fails: a directory at the path, a 404 body with a success status, a server error, no JSON body, a killed gh.
    [{ status: 0, stdout: '[]' }, 'unknown'],
    [{ status: 0, stdout: '{"status":"404"}' }, 'unknown'],
    [{ status: 1, stdout: '{"message":"Server Error","status":"500"}' }, 'unknown'],
    [{ status: 1, stdout: '' }, 'unknown'],
    [{ status: 137, stdout: '{"status":"404"}' }, 'unknown'],
  ];
  expect(cases.map(([policy]) => replay({ policy }).acceptance_merge)).toEqual(cases.map(([, expected]) => expected) as BoardV1['acceptance_merge'][]);
});

test('seat branch: git in the terminal directory on both reads; each unreadable directory gives null and no path reaches the payload', () => {
  const branched = tmpWorkspace('board-seat-branch'); roots.push(branched);
  initGitRepo(branched);
  run('git', ['checkout', '-q', '-b', 'feat/1806-seat'], branched);
  const detached = tmpWorkspace('board-seat-detached'); roots.push(detached);
  initGitRepo(detached);
  run('git', ['commit', '-q', '--allow-empty', '-m', 'one'], detached);
  run('git', ['checkout', '-q', '--detach'], detached);
  const plain = tmpWorkspace('board-seat-plain'); roots.push(plain);
  const directories: Readonly<Record<string, string | undefined>> = { t1: branched, t2: detached, t3: plain, t4: join(plain, 'gone'), t5: undefined };
  const terminal = (cwd: string | undefined) => ({ cwd, labels: { 'repo-harness.repository': '1186405141', 'repo-harness.seat': 'worker', 'repo-harness.parent': '1474' } });
  const hc = watchHc({ FAKE_LS: Object.keys(directories).map(address => ({ address, state: 'live' })),
    FAKE_TERMINALS: Object.fromEntries(Object.entries(directories).map(([address, cwd]) => [address, terminal(cwd)])) });
  const expected = [['t1', 'feat/1806-seat'], ['t2', null], ['t3', null], ['t4', null], ['t5', null]];
  const execution = replay({ host: boardHostPorts(hc.options) }).execution;
  expect(execution.status === 'observed' && execution.terminals.map(seat => [seat.address, seat.branch])).toEqual(expected);
  const list = collectBoardParents({ repo_root: hc.root, now: () => REPLAY_NOW, host: boardHostPorts(hc.options), gh_runner: () => ({ status: 0, stdout: fixture('open-issues.graphql.json') }) });
  expect(list.seats.map(seat => [seat.address, seat.branch])).toEqual(expected);
  expect(JSON.stringify([execution, list])).not.toContain(plain);
  expect(JSON.stringify([execution, list])).not.toContain(branched);
});

test('board seats CLI: includes seats without a parent and keeps the repository seat fields and branches', () => {
  const labels = { 'repo-harness.repository': '1186405141', 'repo-harness.seat': 'worker', 'repo-harness.issue': '1941', 'repo-harness.pr': '1942' };
  const hc = watchHc({
    FAKE_LS: ['t1', 't2', 't3', 't4', 't5'].map(address => ({ address, state: 'live' })),
    FAKE_TERMINALS: {
      t1: { labels },
      t2: { labels: { ...labels, 'repo-harness.parent': '1900' } },
      t3: { labels: { ...labels, 'repo-harness.repository': '99' } },
      t4: { labels: { ...labels, 'repo-harness.service': 'attention' } },
      t5: { labels: { 'repo-harness.repository': '1186405141' } },
    },
  });
  initGitRepo(hc.root);
  const terminals = JSON.parse(hc.options.env.FAKE_TERMINALS);
  terminals.t1.cwd = hc.root;
  const result = run(process.execPath, [join(import.meta.dir, '../src/cli/index.ts'), 'board', 'seats', '--json'], hc.root,
    { ...hc.options.env, FAKE_TERMINALS: JSON.stringify(terminals), REPO_HARNESS_GH_BIN: seatsGh(hc.root) });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  const document = JSON.parse(result.stdout);
  expect([document.protocol, document.kind, document.repository_id]).toEqual([1, 'repo-harness.board-seats', '1186405141']);
  expect(document.seats.map((seat: Json) => [seat.address, seat.seat, seat.issue, seat.pr, seat.parent, seat.branch]))
    .toEqual([['t1', 'worker', 1941, 1942, null, 'main'], ['t2', 'worker', 1941, 1942, '1900', null]]);
  expect(result.stdout).not.toContain(hc.root);
});

function seatsGh(root: string): string {
  const path = join(root, 'bin/gh');
  writeFileSync(path, `#!${process.execPath}\nif (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['api', '--hostname', 'github.com', 'repos/{owner}/{repo}'])) process.exit(2);\nconsole.log('{"id":1186405141}');\n`);
  chmodSync(path, 0o755);
  return path;
}

test('board seats CLI: an hc read failure returns the parents command error shape and no document', () => {
  const hc = watchHc();
  writeFileSync(join(hc.root, 'bin/hc'), `#!${process.execPath}\nprocess.exit(9);\n`);
  const result = run(process.execPath, [join(import.meta.dir, '../src/cli/index.ts'), 'board', 'seats', '--json'], hc.root,
    { ...hc.options.env, REPO_HARNESS_GH_BIN: seatsGh(hc.root) });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(JSON.parse(result.stderr)).toEqual({ ok: false, error: 'BoardSeatsError', code: 'seats_hc_failed', message: expect.any(String) });
});

type GhAnswer = { readonly status: number; readonly stdout: string; readonly stderr?: string };

/** The parent list collector on the recorded hc core; `hc: false` leaves hc off PATH. */
function replayParents(gh: (args: readonly string[]) => GhAnswer, hc = true): BoardParentsV1 {
  const root = tmpWorkspace('board-parents'); roots.push(root);
  mkdirSync(join(root, 'bin'));
  if (hc) { writeFileSync(join(root, 'bin/hc'), HC); chmodSync(join(root, 'bin/hc'), 0o755); }
  return collectBoardParents({ repo_root: root, now: () => REPLAY_NOW, gh_runner: gh, host: boardHostPorts({ env: { PATH: `${join(root, 'bin')}:/bin:/usr/bin`, FIXTURES } }) });
}

test('parent list: one paginated issue read and one hc list give the open parents with progress and live seats, seats first', () => {
  // Recorded on 2026-11-04: `gh api graphql --paginate --slurp` with OPEN_ISSUES_QUERY on Ancienttwo/repo-harness, one page
  // of twelve open issues; #1651 is the only one with sub-issues. #1474 is closed now, so the replay adds it as an older
  // open parent, because the recorded seat terminals name it.
  const pages = JSON.parse(fixture('open-issues.graphql.json'));
  const repository = pages[0].data.repository;
  repository.issues.nodes.push({ number: 1474, title: 'herdr-core 迁移：退役 classic herdr CLI（G37）', url: 'https://github.com/Ancienttwo/repo-harness/issues/1474', updatedAt: '2026-11-02T23:00:00Z', subIssuesSummary: { total: 9, completed: 2 } });
  const calls: (readonly string[])[] = [];
  const answer = (value: unknown) => (args: readonly string[]): GhAnswer => { calls.push(args); return { status: 0, stdout: JSON.stringify(value) }; };
  const list = replayParents(answer(pages));
  expect(decodeBoardParents(JSON.parse(JSON.stringify(list)))).toEqual(list);
  // The operator-web fixture is this list.
  expect(list).toEqual(decodeBoardParents(boardParentsFixture));
  expect(list.repository).toBe('Ancienttwo/repo-harness');
  // t1-t3 have a seat label; t4 has none, and t5 is a seat of another repository with the same parent.
  expect(list.parents.map(parent => [parent.number, `${parent.sub_issues.completed}/${parent.sub_issues.total}`, parent.seats])).toEqual([[1474, '2/9', 3], [1651, '3/9', 0]]);
  // The seats list keeps every seat terminal of the repository with its hc agent kind, status word and raw parent label.
  expect(list.seats.map(seat => [seat.address, seat.seat_status === 'observed' && [seat.seat, seat.issue, seat.pr], seat.parent, seat.agent, seat.status]))
    .toEqual([['t1', ['worker', 1476, 1499], '1474', 'codex', 'blocked'], ['t2', ['worker', 1475, 1491], '1474', 'claude-code', 'done'], ['t3', ['orchestrator', null, null], '1474', null, 'idle']]);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.filter(arg => !arg.startsWith('query='))).toEqual(['api', 'graphql', '--hostname', 'github.com', '--paginate', '--slurp', '-f', '-F', 'owner={owner}', '-F', 'name={repo}']);
  // Two pages give the same list as one.
  const page = (nodes: unknown[], hasNextPage: boolean) => ({ data: { repository: { ...repository, issues: { pageInfo: { hasNextPage, endCursor: 'c' }, nodes } } } });
  const split = [page(repository.issues.nodes.slice(0, 6), true), page(repository.issues.nodes.slice(6), false)];
  expect(replayParents(answer(split)).parents).toEqual(list.parents);

  // Each failed read is the whole result: no empty list and no partial list.
  const failure = (run: () => unknown) => { try { run(); return 'no error'; } catch (error) { return error instanceof BoardParentsError ? error.code : (error as Error).name; } };
  expect([
    failure(() => replayParents(() => ({ status: 1, stdout: '', stderr: 'HTTP 502' }))),
    failure(() => replayParents(answer([split[0]]))),
    failure(() => replayParents(answer(pages), false)),
  ]).toEqual(['parents_github_failed', new BoardSourceError('').name, 'parents_hc_failed']);
});

// The round-4 records of #1499 (PASS) and #1494 (FAIL) as posted: bare SHAs in the subject cell.
const ROUND_4_PASS_1499 = "repo-harness acceptance record\nAgent: Claude Code (claude-opus-5-5) coordinator, session d2630775\n\n| Round | Seat | Subject | Verdict |\n|---|---|---|---|\n| 4 | acceptor (gatekeeper, fresh Claude context, read-only) | d1558fa061febe0f5f299f91a2c59ecd7d2d97f5 | PASS: 0 P0-P2, 1 P3 |\n\nModel relation: same-family\nThe receipt tool takes rounds 1-3 only, so this comment holds round 4. Round 3 (Codex, different family) found no P0-P2 at 23627c4f5.\n\nDelta d1558fa06 (3 files) and merge 50f8f0157 (remerge-diff empty; merge-tree into main 619f7178d is clean). cx1499-r3-changelog-release-placement fixed: the diff against main adds only an `[Unreleased]` / `Breaking` section with the #1476 entry above `[0.25.2]`. cx1499-r3-owner-address-authority fixed: the address regex exists once (`herdr-core.ts:93`), used by `address()` and the owner check through `isHcAddress`. check:type exit 0; check:state-boundaries OK (533 files); herdr-task-lifecycle 8 pass after `bun run build:oar-review-host` (a fresh worktree has no `dist/oar-review-host.js`; CI builds it), herdr-core-transport 9, closeout-notify 7, the 9 other files of the PR body and generic-review 50 pass; each lifecycle core used its own HC_SESSION and HOME and was stopped. CI run 41533760984 green. No changed test, no compatibility code, no attribution.\n- rv1499-r4-oar-host-build-precondition, P3: the PR body's local verification omits `bun run build:oar-review-host` before the lifecycle test.\n\nDecision: accepted at d1558fa06. Merge hold per #1474 issuecomment-6589728962 (after the 0.25.2 release prep merge).\n";
const ROUND_4_FAIL_1494 = "repo-harness acceptance record\nAgent: Claude Code (claude-opus-5-5) coordinator, session d2630775\n\n| Round | Seat | Subject | Verdict |\n|---|---|---|---|\n| 4 | acceptor (gatekeeper, fresh Claude context, read-only) | 5c5139981b0bc5a620e3b2cd0605d61e4c76991d | FAIL: 1 P2, 1 P3 |\n\nModel relation: same-family\nThe receipt tool takes rounds 1-3 only, so this comment holds round 4.\n\nDelta 5c5139981 and merge aa8b6c3cc (remerge-diff empty). The round 3 fix is correct: the doctor relay check passes `hcOptions()`, and the doctor test fails without it. check:type pass; check:state-boundaries pass (533 files); `tests/cli/doctor.test.ts` 48/48 in 3 runs (the worker's earlier 2 failures did not reproduce); the 13 other affected files pass with the PR body counts; CI green.\n\nFindings (sibling sweep of hc calls in the changed files):\n- rv1494-r4-status-forwards-notify-secrets, P2, `src/effects/operator/notify-status.ts:80`: `readNotifyChannelStatus` passes `{ ...process.env, ...input.env }` unscrubbed to `hcListAsync`. A probe with a fake hc showed `WEBHOOK_URL` and `TELEGRAM_BOT_TOKEN` in the child env. The PR Risk section says this read starts a stopped core, so that core keeps the values and later terminals inherit them. Fix: move the `NOTIFY_SECRET_KEYS` scrub into one exported helper beside `NOTIFY_SECRET_KEYS` in `notify-relay.ts`; use it in `hcOptions()` and for the hc env here; extend one case in `tests/effects/operator-notify-status.test.ts` with an env-dumping fake hc.\n- rv1494-r4-relay-events-env-unscrubbed, P3, `src/cli/commands/herdr.ts:197` and `notify-relay.ts:254`: the relay passes `process.env` to `hcEvents`. A hand run from a shell that exports the values can start a core that keeps them. Use the same helper.\n\nDecision: not accepted at 5c5139981. The writer fixes both items with the one helper. Round 5 needs the owner's approval: rounds 1-4 all failed, which reaches the fix-and-review cap.\n";

test('acceptance: round-4 records with bare SHAs, an unparsed record, and a Low closing issue outside the board', () => {
  const green = { name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z' };
  const board = replay({
    parent: (data) => { for (const number of [1476, 1479]) issueNode(data, number).labels.nodes.push({ name: 'tier:low' }); },
    pulls: (data) => {
      const { pr1491, pr1494, pr1499 } = data.repository;
      pr1491.comments.nodes.push(comment(`repo-harness acceptance record\nSubject: commit ${pr1491.headRefOid} (PR head adds a merge of main): PASS.\n`, '2026-11-02T22:00:00Z'));
      // Both close a tier:low item and #1460, which is outside the board, and both pass Required / CI.
      for (const pr of [pr1494, pr1499]) {
        pr.body += '\nCloses #1460\n';
        pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push(green);
      }
      pr1494.headRefOid = pr1494.commits.nodes[0].commit.oid = '5c5139981b0bc5a620e3b2cd0605d61e4c76991d';
      pr1494.comments.nodes.push(comment(ROUND_4_FAIL_1494, '2026-11-02T22:22:04Z'));
      pr1499.headRefOid = pr1499.commits.nodes[0].commit.oid = 'd1558fa061febe0f5f299f91a2c59ecd7d2d97f5';
      pr1499.comments.nodes.push(comment(ROUND_4_PASS_1499, '2026-11-02T22:31:58Z'));
    },
  });
  // #1494: the FAIL row parses, and the unread tier of #1460 withholds the Low path. #1499: the PASS row accepts.
  expect(board.pull_requests.map(pr => [pr.number, pr.acceptance.status, 'via' in pr.acceptance ? pr.acceptance.via : 'reason' in pr.acceptance ? pr.acceptance.reason : null])).toEqual([
    [1491, 'unknown', 'acceptance_record_unparsed'], [1494, 'not_accepted', null], [1499, 'accepted', 'record'],
  ]);
  expect(evaluateBoardAttention(board).unevaluated.filter(entry => entry.subject === '#1491').map(entry => entry.rule)).toEqual(['A1', 'A2']);
});

// One round is one subject SHA: both reviews of a High round are rows of round 1 on one head (#1538).
test('acceptance: every record on the head counts, and one FAIL withholds acceptance', () => {
  const record = (sha: string, verdict: 'PASS' | 'FAIL') => `repo-harness acceptance record\n\n| Round | Role | Subject | Verdict |\n|---|---|---|---|\n| 1 | acceptor | ${sha} | ${verdict} |\n`;
  const board = replay({
    pulls: (data) => {
      const { pr1491, pr1494, pr1499 } = data.repository;
      // #1491 keeps its PASS on the head, but older comments exist outside the read.
      pr1491.comments.pageInfo.hasPreviousPage = true;
      pr1494.headRefOid = pr1494.commits.nodes[0].commit.oid = 'a'.repeat(40);
      pr1494.comments.nodes.push(comment(record('a'.repeat(40), 'PASS'), '2026-11-03T00:24:00Z'), comment(record('a'.repeat(40), 'PASS'), '2026-11-03T00:27:00Z'));
      pr1499.headRefOid = pr1499.commits.nodes[0].commit.oid = 'b'.repeat(40);
      pr1499.comments.nodes.push(comment(record('b'.repeat(40), 'FAIL'), '2026-11-03T00:24:00Z'), comment(record('b'.repeat(40), 'PASS'), '2026-11-03T00:27:00Z'));
    },
  });
  expect(board.pull_requests.map(pr => [pr.number, pr.acceptance])).toEqual([
    [1491, { status: 'unknown', reason: 'comments_truncated', evidence_url: null }],
    [1494, { status: 'accepted', via: 'record', accepted_at: '2026-11-03T00:27:00Z', evidence_url: 'https://github.com/Ancienttwo/repo-harness/issues/1#issuecomment-1793665620000' }],
    [1499, { status: 'not_accepted' }],
  ]);
});

test('one hit for each rule that the recorded state does not trigger', () => {
  const later = new Date('2026-11-03T02:00:00Z');
  const plan = { protocol: 1, kind: 'repo-harness.plan', merge_order: [1475, 1476], holds: [], batches: [], seat_limits: { worker: 3 } };
  const board = replay({
    now: later,
    hcVersion: '0.1.15',
    parent: (data) => {
      data.repository.issue.comments.nodes.push(comment(`repo-harness plan\n\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\`\n`, '2026-11-02T23:00:00Z'));
      issueNode(data, 1475).comments.nodes.push(comment('repo-harness issue claim status\nClaim: x\nStatus: done\nPR: #1491 head 20e2cbd2\n', '2026-11-02T21:50:00Z'));
      issueNode(data, 1477).comments.nodes.push(comment('repo-harness issue claim status\nClaim: x\nStatus: done\nPR: #1460 head 0123abcd\n', '2026-11-02T21:50:00Z'));
      issueNode(data, 1477).blockedBy.nodes.push({ number: 1490, state: 'CLOSED' });
      issueNode(data, 1478).blockedBy.nodes.push({ number: 1480, state: 'OPEN' });
      issueNode(data, 1480).blockedBy.nodes.push({ number: 1478, state: 'OPEN' });
      issueNode(data, 1476).labels.nodes.push({ name: 'tier:low' });
      issueNode(data, 1479).labels.nodes.push({ name: 'tier:medium' });
    },
    pulls: (data) => {
      const pr1499 = data.repository.pr1499;
      pr1499.baseRefName = 'main';
      pr1499.isDraft = false;
      pr1499.files = { totalCount: 1, nodes: [{ path: 'src/effects/terminal/task-session.ts' }] };
      pr1499.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push({ name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z' });
      // A newer commit than the claim status on #1475, while its worker t13 reports done.
      data.repository.pr1491.commits.nodes[0].commit.committedDate = '2026-11-02T22:00:00Z';
    },
  });
  const hits = rules(board);
  for (const rule of ['A2', 'A4', 'A5', 'A6', 'A8', 'R1', 'R3', 'R4', 'R5'] as const) expect(hits).toContain(rule);
  const findings = evaluateBoardAttention(board).findings;
  expect(findings.find(finding => finding.rule === 'A8')?.message).toBe(`hc client 0.1.15 is below the repo-harness floor ${HC_MIN_VERSION}; run hc update --version ${HC_MIN_VERSION}`);
  expect(findings.find(finding => finding.rule === 'A2')?.pull_requests).toEqual([1491, 1499]);
  expect(findings.filter(finding => finding.rule === 'A6').map(finding => finding.issues)).toEqual([[1477, 1490], [1478, 1480]]);
  expect(findings.find(finding => finding.rule === 'R1')?.issues).toEqual([1477, 1478, 1479, 1480, 1481, 1482, 1483]);
  // R3: #1494 changes `.github/` for tier:medium #1479. #1499 (tier:low #1476) changes no hazard path. A tier:high item is no hit.
  expect(findings.filter(finding => finding.rule === 'R3').map(finding => [finding.pull_requests, finding.issues])).toEqual([[[1494], [1479]]]);
  const high = { ...board, items: board.items.map(item => (item.number === 1479 ? { ...item, tier: 'high' as const } : item)) };
  expect(rules(high)).not.toContain('R3');
  // A pull request without a complete file list is unevaluated, never a miss.
  const partial = evaluateBoardAttention({ ...board, pull_requests: board.pull_requests.map(pr => (pr.number === 1494 ? { ...pr, files: null } : pr)) });
  expect(partial.findings.map(finding => finding.rule)).not.toContain('R3');
  expect(partial.unevaluated.filter(entry => entry.rule === 'R3').map(entry => [entry.reason, entry.subject])).toEqual([['files_incomplete', '#1494']]);
  // A malformed hazard list fails at decode.
  const row = { id: 'ci-config', text: 'Changes CI.', path_visible: true, paths: ['.github/**'] };
  const list = (...hazards: object[]) => ({ hazards_version: 'repo-harness.review-hazards.v1', hazards });
  for (const [value, error] of [
    [{ ...list(row), hazards_version: 'repo-harness.review-hazards.v2' }, 'hazards_version'],
    [list(), 'hazards'],
    [list({ ...row, paths: undefined }), 'hazard fields'],
    [list({ ...row, path_visible: false }), 'hazard fields'],
    [list({ ...row, paths: [] }), 'ci-config paths'],
    [list({ ...row, paths: ['../x'] }), 'ci-config paths'],
    [list({ ...row, text: 'a | b' }), 'ci-config text'],
    [list(row, row), 'duplicate hazard id ci-config'],
  ] as const) expect(() => decodeReviewHazards(JSON.parse(JSON.stringify(value)))).toThrow(`review hazards invalid: ${error}`);
  // `**` matches zero or more whole segments, `*` stays inside one segment; the other hazards need a reviewer.
  expect(pathHazardHits(['.github/workflows/ci.yml', 'docs/.github/x', 'Dockerfile', 'ops/web/Dockerfile.dev', 'ops/api.Dockerfile', 'bun.lock', 'pkg/a/yarn.lock', 'bun.lock.bak', 'install.sh']))
    .toEqual([
      { hazard: 'ci-config', path: '.github/workflows/ci.yml' },
      { hazard: 'container-build', path: 'Dockerfile' }, { hazard: 'container-build', path: 'ops/web/Dockerfile.dev' }, { hazard: 'container-build', path: 'ops/api.Dockerfile' },
      { hazard: 'dependency', path: 'bun.lock' }, { hazard: 'dependency', path: 'pkg/a/yarn.lock' },
    ]);

  // A rule that cannot read its input lists the subject: no status time, no issue label, an issue or a claim PR off the board.
  const [blocked, done] = board.execution.status === 'observed' ? board.execution.terminals : [];
  const terminals = [{ ...blocked!, status_ms: null }, { ...done!, issue: 1460 }, { ...done!, address: 't9', issue: null }] as BoardTerminalV1[];
  expect(evaluateBoardAttention({ ...board, execution: { status: 'observed', terminals } }).unevaluated
    .filter(entry => ['A3', 'A4', 'A5'].includes(entry.rule)).map(entry => [entry.rule, entry.reason, entry.subject])).toEqual([
    ['A3', 'status_time_missing', 't1'], ['A4', 'issue_off_board', 't2'], ['A4', 'issue_label_missing', 't9'], ['A5', 'claim_pr_off_board', '#1477'],
  ]);
  // A9: a live seat of a merged pull request is reported; a finished one is not.
  const merged = evaluateBoardAttention({ ...board, pull_requests: board.pull_requests.map(pr => (pr.number === 1494 ? { ...pr, state: 'merged' as const } : pr)),
    execution: { status: 'observed', terminals: [{ ...done!, pr: 1494 }, { ...done!, address: 't9', pr: 1494, state: 'finished' }] as BoardTerminalV1[] } });
  expect(merged.findings.filter(finding => finding.rule === 'A9').map(finding => [finding.terminals, finding.pull_requests])).toEqual([[['t2'], [1494]]]);
});

test('R5: two owning capabilities among the counted paths are a High signal; an unowned or ambiguous path is always reported', () => {
  // Recorded owners: task-agent-host, operator; .ai/harness/policy.json is unowned. task-sessions.ts is made ambiguous below.
  const [task, operator, unowned, ambiguous] = ['src/effects/terminal/task-session.ts', 'src/operator-web/i18n.ts', '.ai/harness/policy.json', 'src/core/sessions/task-sessions.ts'];
  const edit = (path: string, result: Json) => (results: Json[]) => {
    const index = results.findIndex(entry => entry.path === path);
    results.splice(index === -1 ? results.length : index, index === -1 ? 0 : 1, { path, matched: false, ambiguous: false, owningCapabilityId: null, ...result });
  };
  const makeAmbiguous = edit(ambiguous, { ambiguous: true, candidates: ['capability.a.b', 'capability.c.d'] });
  // `tier` null: #1476 has no tier label. `incomplete`: the read returns fewer files than the PR changes.
  const r5 = (files: string[], options: Replay = {}, tier: string | null = 'tier:low', incomplete = false): string[] => {
    const attention = evaluateBoardAttention(replay({
      ...options,
      owners: (results) => { makeAmbiguous(results); options.owners?.(results); },
      parent: (data) => { if (tier !== null) issueNode(data, 1476).labels.nodes.push({ name: tier }); },
      pulls: (data) => { data.repository.pr1499.files = { totalCount: files.length + (incomplete ? 1 : 0), nodes: files.map(path => ({ path })) }; },
    }));
    return [
      ...attention.findings.filter(finding => finding.rule === 'R5' && finding.pull_requests.includes(1499)).map(finding => finding.message),
      // #1494 keeps its recorded files and no tier label; this case reads #1499 and the board-wide entries.
      ...attention.unevaluated.filter(entry => entry.rule === 'R5' && (entry.subject === null || entry.subject.startsWith('#1499')))
        .map(entry => `${entry.reason}: ${entry.subject}`),
    ];
  };
  const hit = `#1499 changes 2 capabilities (capability.runtime-harness.operator, capability.runtime-harness.task-agent-host), a High signal, but #1476 is tier:low`;
  const timedOut: RunArchctxProcess = () => ({ status: null, signal: null, stdout: '', stderr: '', timedOut: true });
  const rejected: RunArchctxProcess = () => ({ status: 1, signal: null, stdout: JSON.stringify(errorEnvelope('resolve', 'AC_SCHEMA_INVALID', 'boom')), stderr: '' });
  // Tier {below High, High} x unknown path {none, unowned, ambiguous} x owned capabilities {0, 1, 2}:
  // every unknown path is in the result; the tier decides only the finding.
  const owned = [['tests/herdr-task-lifecycle.test.ts'], [task], [task, operator]] as const;
  for (const [tier, unknown, count, expected] of [
    ['tier:low', null, 0, []],
    ['tier:low', null, 1, []],
    ['tier:low', null, 2, [hit]],
    ['tier:low', unowned, 0, [`owner_undetermined: #1499 ${unowned} (unowned)`]],
    ['tier:low', unowned, 1, [`owner_undetermined: #1499 ${unowned} (unowned)`]],
    ['tier:low', unowned, 2, [`${hit}; 1 path with no single owner: ${unowned} (unowned)`]],
    ['tier:low', ambiguous, 0, [`owner_undetermined: #1499 ${ambiguous} (ambiguous)`]],
    ['tier:low', ambiguous, 1, [`owner_undetermined: #1499 ${ambiguous} (ambiguous)`]],
    ['tier:low', ambiguous, 2, [`${hit}; 1 path with no single owner: ${ambiguous} (ambiguous)`]],
    ['tier:high', null, 0, []],
    ['tier:high', null, 1, []],
    ['tier:high', null, 2, []],
    ['tier:high', unowned, 0, [`owner_undetermined: #1499 ${unowned} (unowned)`]],
    ['tier:high', unowned, 1, [`owner_undetermined: #1499 ${unowned} (unowned)`]],
    ['tier:high', unowned, 2, [`owner_unknown: #1499 ${unowned} (unowned)`]],
    ['tier:high', ambiguous, 0, [`owner_undetermined: #1499 ${ambiguous} (ambiguous)`]],
    ['tier:high', ambiguous, 1, [`owner_undetermined: #1499 ${ambiguous} (ambiguous)`]],
    ['tier:high', ambiguous, 2, [`owner_unknown: #1499 ${ambiguous} (ambiguous)`]],
  ] as const) expect(r5([...owned[count], ...(unknown === null ? [] : [unknown])], {}, tier)).toEqual([...expected]);
  for (const [files, options, expected, tier, incomplete] of [
    // The recorded ambiguity of admitted-task-context.ts is between two components of the operator capability.
    [[task, 'src/core/operator/admitted-task-context.ts'], {}, [hit]],
    [[task, operator, unowned, ambiguous], {}, [`${hit}; 2 paths with no single owner: ${unowned} (unowned), ${ambiguous} (ambiguous)`]],
    [[task, operator, unowned, ambiguous], {}, [`owner_unknown: #1499 ${unowned} (unowned) ${ambiguous} (ambiguous)`], 'tier:high'],
    // Without a tier label, the unevaluated entry names the unknown path too.
    [[task, operator, unowned], {}, [`tier_label_missing: #1499 #1476 ${unowned} (unowned)`], null],
    [[task, operator], {}, ['files_incomplete: #1499'], 'tier:low', true],
    // Tests, docs, the model and root Markdown do not count; each has another recorded owner.
    [[task, 'src/effects/terminal/herdr.ts', 'tests/herdr-task-lifecycle.test.ts', 'docs/spec.md', '.archcontext/model/nodes/capability.runtime-harness.task-agent-host.yaml', 'README.md'],
      { owners: edit('README.md', { matched: true, stableId: 'capability.public-surface.root-router', owningCapabilityId: 'capability.public-surface.root-router' }) }, []],
    [[task, operator], { archctx: timedOut }, ['RH_ARCHCTX_TIMEOUT: null']],
    [[task, operator], { archctx: rejected }, ['ARCHCONTEXT_MODEL_REJECTED: null']],
  ] as const) expect(r5([...files], options, tier, incomplete)).toEqual([...expected]);
});

test('A2 finds a batch behind an overlapping pull request, and a plan hold removes a PR from A1, A2 and R4', () => {
  const green = { name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z' };
  const findings = (holds: number[]) => evaluateBoardAttention(replay({
    now: new Date('2026-11-03T02:00:00Z'),
    owners: (results) => { results.push(...['a', 'b'].map(path => ({ path, matched: false, ambiguous: false, owningCapabilityId: null }))); },
    parent: (data) => {
      const plan = { protocol: 1, kind: 'repo-harness.plan', merge_order: [1475, 1476, 1479], holds: holds.map(issue => ({ issue, reason: 'held' })), batches: [], seat_limits: { worker: 3 } };
      data.repository.issue.comments.nodes.push(comment(`repo-harness plan\n\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\`\n`, '2026-11-02T23:00:00Z'));
      for (const number of [1476, 1479]) issueNode(data, number).labels.nodes.push({ name: 'tier:low' });
    },
    pulls: (data) => {
      // #1491 changes a and b, #1494 a, #1499 b: only #1494 and #1499 can batch.
      for (const [pr, paths] of [[data.repository.pr1491, ['a', 'b']], [data.repository.pr1494, ['a']], [data.repository.pr1499, ['b']]] as const) {
        pr.files = { totalCount: paths.length, nodes: paths.map(path => ({ path })) };
        if (pr.number === 1491) continue;
        Object.assign(pr, { baseRefName: 'main', isDraft: false });
        pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push(green);
      }
    },
  })).findings.filter(finding => ['A1', 'A2', 'R4'].includes(finding.rule)).map(finding => [finding.rule, finding.pull_requests]);
  expect(findings([])).toEqual([['A1', [1491]], ['A2', [1494, 1499]], ['R4', [1491]], ['R4', [1494]], ['R4', [1499]]]);
  expect(findings([1475, 1479])).toEqual([['R4', [1499]]]);
});

test('R2 does not count docs/CHANGELOG.md as a shared file', () => {
  const r2 = (first: string[], second: string[]) => evaluateBoardAttention(replay({
    owners: (results) => { results.push(...[...first, ...second].map(path => ({ path, matched: false, ambiguous: false, owningCapabilityId: null }))); },
    pulls: (data) => {
      for (const [pr, paths] of [[data.repository.pr1494, first], [data.repository.pr1499, second]] as const) pr.files = { totalCount: paths.length, nodes: paths.map(path => ({ path })) };
    },
  })).findings.filter(finding => finding.rule === 'R2').map(finding => finding.message);
  expect(r2(['docs/CHANGELOG.md'], ['docs/CHANGELOG.md'])).toEqual([]);
  expect(r2(['docs/CHANGELOG.md', 'src/a.ts'], ['docs/CHANGELOG.md', 'src/a.ts'])).toEqual(['#1494 and #1499 both change src/a.ts with no dependency edge']);
});

// A fake hc for the watcher: every call is logged; `get` answers from FAKE_TERMINALS, `wait` from FAKE_WAITS by address.
const WATCH_HC = `#!${process.execPath}
const { appendFileSync } = require('fs');
const args = process.argv.slice(2);
appendFileSync(process.env.HC_LOG, JSON.stringify(args) + '\\n');
const terminals = JSON.parse(process.env.FAKE_TERMINALS);
const address = args.at(-1);
const out = value => console.log(JSON.stringify(value));
if (args[0] === 'get') {
  // FAKE_FINISH_AT: the address finishes at its nth get call.
  const finishAt = JSON.parse(process.env.FAKE_FINISH_AT || '{}')[address];
  const gets = require('fs').readFileSync(process.env.HC_LOG, 'utf8').split('\\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call[0] === 'get' && call.at(-1) === address).length;
  const killed = require('fs').readFileSync(process.env.HC_LOG, 'utf8').split('\\n').filter(Boolean).map(line => JSON.parse(line)).some(call => call[0] === 'kill' && call.at(-1) === address);
  out({ address, state: killed || (finishAt && gets >= finishAt) ? 'finished' : 'live', turn: 1, labels: { 'repo-harness.seat': 'x' }, ...terminals[address] });
}
else if (args[0] === 'send' && process.env.FAKE_SEND_FAIL) { process.stderr.write(JSON.stringify({ error: { kind: 'blocked', message: 'blocked' } })); process.exit(9); }
else if (args[0] === 'send') out({ started: true, turn: 2 });
else if (args[0] === 'read') out(JSON.parse(process.env.FAKE_READ));
else if (args[0] === 'kill') out({ address, state: 'finished', turn: 1, labels: { 'repo-harness.seat': 'x' } });
else if (args[0] === 'rm' && process.env.FAKE_RM_FAIL) { process.stderr.write(JSON.stringify({ error: { kind: 'blocked', message: 'rm failed' } })); process.exit(9); }
else if (args[0] === 'rm') out({ removed: address });
else if (args[0] === 'wait') out({ terminal: address, turn: 2, ...JSON.parse(process.env.FAKE_WAITS)[address] });
// As the live core: ls --label keeps the rows whose labels carry every pair.
else if (args[0] === 'ls') out({ terminals: JSON.parse(process.env.FAKE_LS).filter(row => args.every((arg, at) => args[at - 1] !== '--label'
  || (terminals[row.address]?.labels ?? {})[arg.slice(0, arg.indexOf('='))] === arg.slice(arg.indexOf('=') + 1))) });
else if (args[0] === 'run') out({ address: 't20', state: 'live' });
else process.exit(2);
`;

function watchHc(env: Json = {}) {
  const root = tmpWorkspace('board-watch'); roots.push(root);
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'bin/hc'), WATCH_HC); chmodSync(join(root, 'bin/hc'), 0o755);
  const log = join(root, 'hc.log');
  writeFileSync(log, '');
  const options = { env: { PATH: `${join(root, 'bin')}:/bin:/usr/bin`, HC_LOG: log, FAKE_TERMINALS: '{}', FAKE_WAITS: '{}', FAKE_LS: '[]',
    ...Object.fromEntries(Object.entries(env).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])) } };
  return { root, options, host: attentionHostPorts(options), calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as string[]) };
}

test('watch window: idle sends at once, blocked waits, working sends at window end, and the advisor cap reads all repository logs', async () => {
  const board = replay();
  const seat = (address: string, seatName: string, status: string | null) =>
    ({ address, name: null, agent: null, state: 'live', status, status_kind: null, status_msg: null, status_ms: null, turn: 1, branch: null, seat_status: 'observed', seat: seatName, issue: null, pr: null }) as BoardTerminalV1;
  const terminals = [seat('t1', 'worker', 'working'), seat('t3', 'orchestrator', 'idle'), seat('t6', 'orchestrator', 'blocked'),
    seat('t7', 'orchestrator', 'blocked'), seat('t8', 'orchestrator', 'working'), seat('t9', 'advisor', 'done'), seat('t10', 'orchestrator', 'blocked'),
    seat('t11', 'orchestrator', 'blocked'), seat('t12', 'orchestrator', 'blocked')];
  const watched = { ...board, execution: { status: 'observed', terminals } } as BoardV1;
  const hc = watchHc({
    // `get` at the window end: t6 is still blocked, t10 became idle, t11 is finished (its program exited), and t12 finishes at its third get: the wait's address check, the post-wait check, then the window end.
    FAKE_TERMINALS: { t3: {}, t6: { status: { state: 'blocked' } }, t7: {}, t8: {}, t9: {}, t10: { status: { state: 'idle' } },
      t11: { state: 'finished', status: { state: 'blocked' } }, t12: { status: { state: 'blocked' } } },
    FAKE_FINISH_AT: { t12: 3 },
    // The live hc 0.1.18 wait lines. A live terminal that stopped working ends the wait with reason `status` (t7 idle, t6 and t10 blocked);
    // a program exit ends it with reason `exit` and an exit code (t11).
    FAKE_WAITS: { t6: { ended: true, reason: 'status', status: 'blocked', exit_code: null, signal: null, children: [] },
      t7: { ended: true, reason: 'status', status: 'idle', exit_code: null, signal: null, children: [] },
      t10: { ended: true, reason: 'status', status: 'blocked', exit_code: null, signal: null, children: [] },
      t11: { ended: true, reason: 'exit', status: null, exit_code: 0, signal: null, children: [] },
      t12: { ended: true, reason: 'status', status: 'blocked', exit_code: null, signal: null, children: [] } },
  });
  const logPath = attentionLogPath(1186405141, 1474, { REPO_HARNESS_HOME: hc.root });
  expect(logPath).toBe(join(hc.root, 'board/attention-1186405141-1474.jsonl'));
  // Seven advisor wakes across two parents in the last 24 hours, one 25 hours ago.
  const start = REPLAY_NOW.getTime();
  mkdirSync(join(hc.root, 'board'));
  const otherLogPath = attentionLogPath(1186405141, 1475, { REPO_HARNESS_HOME: hc.root });
  const history = [...Array.from({ length: 7 }, (_, at) => start - (at % 4 + 1) * 3_600_000), start - 25 * 3_600_000].map((time, at) => ({
    at: new Date(time).toISOString(), window: String(time), parent: at < 4 ? 1474 : 1475,
    kind: 'send', route: 'advisor', terminal: 't9', rules: ['R2'], outcome: 'sent', detail: null,
  }));
  writeFileSync(logPath, history.slice(0, 4).map(record => JSON.stringify(record)).join('\n') + '\n');
  writeFileSync(otherLogPath, history.slice(4).map(record => JSON.stringify(record)).join('\n') + '\n');
  writeFileSync(attentionLogPath(11864051410, 1474, { REPO_HARNESS_HOME: hc.root }), history.map(record => JSON.stringify(record)).join('\n') + '\n');
  let clock = start;
  const slept: number[] = [];
  const window = () => runAttentionWindow({ parent: 1474, deliver: true, log_path: logPath, collect: () => watched, host: hc.host,
    now: () => new Date(clock), sleep: async (ms) => { slept.push(ms); clock += ms; } });

  await window();
  expect(slept).toEqual([WINDOW_WITH_WORKERS_MS]);
  // One line per seat terminal: all findings of its route in this window.
  const orchestrator = '[rh-attention] #1474 A1: #1491 is accepted and ready, unmerged for 137 min; A7: the daily full run is failure (https://github.com/Ancienttwo/repo-harness/actions/runs/41358255043) and no CI repair issue is open; A10: #1491 is of unknown tier (counted as High) and has no Claude review of 20e2cbd21; start the Claude reviewer seat';
  expect(hc.calls().filter(args => args[0] !== 'get')).toEqual([
    ['send', '--json', '--', 't3', orchestrator],
    ['send', '--json', '--', 't9', expect.stringMatching(/^\[rh-attention\] #1474 R2: #1494 and #1499 both change .+ with no dependency edge$/u)],
    ['wait', '--json', '--timeout', '900', '--', 't6'],
    ['wait', '--json', '--timeout', '900', '--', 't7'],
    ['send', '--json', '--', 't7', orchestrator],
    ['wait', '--json', '--timeout', '900', '--', 't10'],
    ['wait', '--json', '--timeout', '900', '--', 't11'],
    ['wait', '--json', '--timeout', '900', '--', 't12'],
    ['send', '--json', '--', 't10', orchestrator],
    ['send', '--json', '--', 't8', orchestrator],
  ]);
  const records = () => readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(4).map(line => JSON.parse(line));
  expect(records().filter(record => record.kind === 'send').map(record => [record.terminal, record.outcome, record.at])).toEqual([
    ['t3', 'sent', REPLAY_NOW.toISOString()], ['t9', 'sent', REPLAY_NOW.toISOString()], ['t7', 'sent', REPLAY_NOW.toISOString()],
    ['t11', 'terminal_ended', REPLAY_NOW.toISOString()],
    ['t6', 'skipped_blocked', new Date(start + WINDOW_WITH_WORKERS_MS).toISOString()], ['t10', 'sent', new Date(start + WINDOW_WITH_WORKERS_MS).toISOString()],
    ['t12', 'terminal_ended', new Date(start + WINDOW_WITH_WORKERS_MS).toISOString()],
    ['t8', 'sent', new Date(start + WINDOW_WITH_WORKERS_MS).toISOString()],
  ]);
  expect(records().filter(record => record.kind === 'finding').map(record => record.rule)).toEqual(['A1', 'A7', 'A10', 'R2']);

  await runAttentionWindow({ parent: 1475, deliver: true, log_path: otherLogPath, collect: () => ({ ...watched, parent: { ...watched.parent, number: 1475 } }), host: hc.host,
    now: () => new Date(clock), sleep: async () => {} });
  const otherRecords = readFileSync(otherLogPath, 'utf8').split('\n').filter(Boolean).slice(4).map(line => JSON.parse(line));
  expect(otherRecords.filter(record => record.kind === 'skip').map(record => [record.route, record.reason])).toEqual([['advisor', 'advisor_daily_cap']]);
  expect(otherRecords.filter(record => record.kind === 'send' && record.route === 'orchestrator' && record.outcome === 'sent')).toHaveLength(4);
  expect(hc.calls().filter(args => args[0] === 'send' && args.at(-2) === 't9')).toHaveLength(1);

  // The next window: the advisor has eight wakes in 24 hours, and no worker runs, so the window is 60 minutes.
  terminals[0] = { ...terminals[0]!, state: 'finished' };
  await window();
  expect(slept.at(-1)).toBe(WINDOW_WITHOUT_WORKERS_MS);
  expect(records().filter(record => record.kind === 'skip').map(record => [record.route, record.reason])).toEqual([['advisor', 'advisor_daily_cap']]);
  // Without observed seat terminals, the skip names the board's execution reason.
  expect(planAttentionDeliveries({ ...board, execution: { status: 'unavailable', reason: 'no_seat_terminals' } }, evaluateBoardAttention(watched), 0).skipped)
    .toEqual([{ route: 'orchestrator', reason: 'no_seat_terminals' }, { route: 'advisor', reason: 'no_seat_terminals' }]);
});

test('watch service: --watch refuses a terminal without the service labels; start runs one watcher; doctor reads the labels', () => {
  const labels = { 'repo-harness.service': 'attention', 'repo-harness.repository': '1186405141', 'repo-harness.parent': '1503' };
  const inside = watchHc({ HC_TERMINAL_ID: 't5', FAKE_TERMINALS: { t5: { labels } } });
  expect(serviceTerminalRepository(1503, inside.host)).toBe(1186405141);
  expect(() => serviceTerminalRepository(1504, inside.host)).toThrow('does not carry the repository and parent #1504 labels');
  expect(() => serviceTerminalRepository(1503, watchHc({ HC_TERMINAL_ID: 't5' }).host)).toThrow('terminal t5 has no attention service label');
  expect(() => serviceTerminalRepository(1503, watchHc().host)).toThrow('HC_TERMINAL_ID is not set');

  const start = (ls: Json[]) => {
    const hc = watchHc({ FAKE_LS: ls, FAKE_TERMINALS: { t5: { labels } } });
    return [startAttentionWatch({ parent: 1503, repository_id: 1186405141, repo_root: '/repo', cli: ['bun', 'cli.ts'], host: hc.host }), hc.calls()];
  };
  expect(start([])).toEqual([{ address: 't20', started: true }, [
    ['ls', '--json', '--label', 'repo-harness.service=attention', '--label', 'repo-harness.repository=1186405141', '--label', 'repo-harness.parent=1503', '--all'],
    ['run', '--json', '--bg', '--label', 'repo-harness.service=attention', '--label', 'repo-harness.repository=1186405141', '--label', 'repo-harness.parent=1503',
      '--cwd', '/repo', '--no-parent', '--', 'bun', 'cli.ts', 'board', 'attention', '--parent', '1503', '--watch', '--deliver'],
  ]]);
  expect(start([{ address: 't5', state: 'live' }])[0]).toEqual({ address: 't5', started: false });

  // The board of the same parent in hc: the watcher is not a seat terminal.
  const seats = watchHc({ FAKE_LS: [{ address: 't5', state: 'live' }, { address: 't3', state: 'live' }],
    FAKE_TERMINALS: { t5: { labels }, t3: { labels: { 'repo-harness.seat': 'orchestrator', 'repo-harness.repository': '1186405141', 'repo-harness.parent': '1503' } } } });
  const read = boardHostPorts(seats.options).seatTerminals('1186405141');
  expect(read.status === 'observed' && read.terminals.map(terminal => terminal.address)).toEqual(['t3']);
  expect(seats.calls().filter(args => args[0] === 'ls')).toEqual([['ls', '--json', '--label', 'repo-harness.repository=1186405141']]);

  // The closeout listing adds finished terminals (#2021). A kill that finished the terminal before a failed rm leaves it for the retry, which removes it with rm only.
  const retry = watchHc({ FAKE_RM_FAIL: '1', FAKE_LS: [{ address: 't3', state: 'live' }],
    FAKE_TERMINALS: { t3: { labels: { 'repo-harness.seat': 'worker', 'repo-harness.repository': '1186405141' } } } });
  expect(boardHostPorts(retry.options).closeTerminal('t3')).toEqual({ status: 'unavailable', reason: 'hc_failed' });
  const retryPorts = boardHostPorts({ env: { ...retry.options.env, FAKE_RM_FAIL: '', FAKE_LS: JSON.stringify([{ address: 't3', state: 'finished' }]) } });
  const finished = retryPorts.closeoutTerminals('1186405141');
  expect(finished.status === 'observed' && finished.terminals.map(terminal => [terminal.address, terminal.state])).toEqual([['t3', 'finished']]);
  expect(retryPorts.closeTerminal('t3')).toEqual({ status: 'closed' });
  expect(retry.calls().filter(args => ['ls', 'kill', 'rm'].includes(args[0]!))).toEqual([
    ['kill', '--json', '--', 't3'], ['rm', '--json', '--', 't3'], ['ls', '--json', '--label', 'repo-harness.repository=1186405141', '--all'], ['rm', '--json', '--', 't3']]);

  // One orchestrator and one advisor serve the repository (#1780): the room of every parent shows them, with or
  // without a parent label. A worker shows only in the room of its parent label; a terminal of another repository never.
  const room = (repository: string, labels: Json) => ({ labels: { 'repo-harness.repository': repository, ...labels } });
  const agents: Json = { t5: 'bun', t7: 'claude', t11: 'codex', t12: 'claude', t16: 'claude', t17: 'codex', t18: 'claude', t19: 'claude', t21: 'codex' };
  const repositoryTerminals = watchHc({
    FAKE_LS: ['t5', 't7', 't11', 't12', 't16', 't17', 't18', 't19', 't21'].map(address => ({ address, state: 'live', agent: agents[address] })),
    FAKE_TERMINALS: {
      // t5 is the attention watcher of this repository; t21 is a seat with an invalid pr label.
      t5: { labels: { ...labels, 'repo-harness.repository': '1186405141' } }, t21: room('1186405141', { 'repo-harness.seat': 'worker', 'repo-harness.pr': 'x' }),
      t7: { ...room('1186405141', { 'repo-harness.seat': 'orchestrator' }), status: { state: 'blocked', msg: `push failed:\nghp_${'a'.repeat(30)}` } }, t11: room('1186405141', { 'repo-harness.seat': 'advisor' }),
      t12: room('1186405141', { 'repo-harness.seat': 'orchestrator', 'repo-harness.parent': '1503' }),
      t16: room('1186405141', { 'repo-harness.seat': 'worker', 'repo-harness.parent': '1474', 'repo-harness.issue': '1721' }),
      t17: room('1186405141', { 'repo-harness.seat': 'worker', 'repo-harness.parent': '1503', 'repo-harness.issue': '1773' }),
      t18: room('1186405141', { 'repo-harness.seat': 'worker', 'repo-harness.issue': '1774' }),
      t19: room('987654321', { 'repo-harness.seat': 'advisor' }),
    },
  });
  const office = replay({ host: boardHostPorts(repositoryTerminals.options) }).execution;
  expect(office.status === 'observed' && office.terminals.map(terminal => [terminal.address, terminal.seat_status === 'observed' && terminal.seat]))
    .toEqual([['t7', 'orchestrator'], ['t11', 'advisor'], ['t12', 'orchestrator'], ['t16', 'worker']]);
  // hc `status.msg` reaches the board as one redacted line, and a status without one gives null.
  expect(office.status === 'observed' && office.terminals.slice(0, 2).map(terminal => terminal.status_msg)).toEqual(['push failed: ghp_[REDACTED]', null]);
  // The parent list of the repository keeps every seat, with or without a parent label (#1785); the watcher and the
  // other repository never show, and an invalid label shows as such.
  const officeSeats = collectBoardParents({ repo_root: repositoryTerminals.root, now: () => REPLAY_NOW, host: boardHostPorts(repositoryTerminals.options),
    gh_runner: () => ({ status: 0, stdout: fixture('open-issues.graphql.json') }) }).seats;
  expect(officeSeats.map(seat => [seat.address, seat.seat_status === 'observed' ? [seat.seat, seat.issue] : seat.reason, seat.parent, seat.agent])).toEqual([
    ['t7', ['orchestrator', null], null, 'claude'], ['t11', ['advisor', null], null, 'codex'], ['t12', ['orchestrator', null], '1503', 'claude'],
    ['t16', ['worker', 1721], '1474', 'claude'], ['t17', ['worker', 1773], '1503', 'codex'], ['t18', ['worker', 1774], null, 'claude'],
    ['t21', 'seat_label_invalid', null, 'codex']]);

  // Doctor runs in repository 1186405141. t6 is the watcher of another repository with the same parent.
  const other = { ...labels, 'repo-harness.repository': '987654321' };
  const doctor = (watchers: Record<string, Json>) => attentionWatchDoctorCheck(watchHc({
    FAKE_LS: Object.entries(watchers).map(([address, terminal]) => ({ address, state: terminal.state })), FAKE_TERMINALS: watchers,
  }).host, () => 1186405141);
  expect(doctor({ t5: { labels, state: 'live' } })).toMatchObject({ status: 'ok', detail: 'The attention watcher of repository 1186405141 #1503 is live.' });
  const stopped = { status: 'warn', detail: 'The attention watcher of repository 1186405141 #1503 is not live (attention_stopped). Run in the checkout of repository 1186405141: repo-harness board attention start --parent 1503' };
  expect(doctor({ t5: { labels, state: 'finished' } })).toMatchObject(stopped);
  expect(doctor({ t5: { labels, state: 'finished' }, t6: { labels: other, state: 'live' } })).toMatchObject(stopped);
  expect(doctor({ t6: { labels: other, state: 'live' } })).toMatchObject({ status: 'na', detail: 'No attention watcher was started for repository 1186405141.' });
  expect(doctor({})).toMatchObject({ status: 'na', detail: 'No attention watcher was started.' });
  expect(attentionWatchDoctorCheck(attentionHostPorts({ env: { PATH: '/nonexistent' } }), () => 1186405141)).toMatchObject({ status: 'na', detail: 'hc is not installed.' });
  // A checkout without a GitHub remote cannot have a watcher, and gh is not asked; a GitHub remote reads the id from gh.
  const checkout = tmpWorkspace('board-remote'); roots.push(checkout);
  initGitRepo(checkout);
  expect(run('git', ['remote', 'add', 'mirror', 'https://example.com/repo-harness.git'], checkout).status).toBe(0);
  const local = () => attentionWatchDoctorCheck(watchHc({ FAKE_LS: [{ address: 't5', state: 'live' }], FAKE_TERMINALS: { t5: { labels } } }).host,
    () => readLocalRepositoryId({ repo_root: checkout, gh_runner: () => ({ status: 0, stdout: JSON.stringify({ id: 1186405141 }) }) }, url => githubRemoteRepository(url) !== null));
  expect(local()).toMatchObject({ status: 'na', detail: 'This checkout has no GitHub remote, so it has no attention watcher.' });
  expect(run('git', ['remote', 'add', 'origin', 'git@github.com:Ancienttwo/repo-harness.git'], checkout).status).toBe(0);
  expect(local()).toMatchObject({ status: 'ok' });
});

// One-shot dependency migration (#1504): a stateful gh stub answers the reads and records every write.
// Node ids are `I<n>` for issues of the parent's repository; `blocked_by` seeds links to other node ids.
interface MigrationSubIssue {
  readonly number: number;
  readonly state: 'OPEN' | 'CLOSED';
  readonly body: string;
  readonly repository?: string;
  readonly blocked_by?: readonly string[];
}

function migrationStub(initial: readonly MigrationSubIssue[], missing: readonly number[] = []) {
  const subIssues = [...initial];
  const labels = new Set<string>();
  let blockerReads = 0;
  let calls = 0;
  const edges = new Set(subIssues.flatMap(node => (node.blocked_by ?? []).map(blocker => `I${node.number}:${blocker}`)));
  const writes: string[] = [];
  const answer = (value: unknown) => ({ status: 0, stdout: JSON.stringify(value) });
  const number = (id: string) => Number(id.replace(/^[A-Z]+/u, ''));
  const runner = (args: readonly string[]) => {
    calls += 1;
    if (args[0] === 'repo') return answer({ nameWithOwner: 'Ancienttwo/repo-harness' });
    if (args.includes('POST')) {
      const name = args.find(arg => arg.startsWith('name='))!.slice(5);
      labels.add(name); writes.push(`label ${name}`);
      return answer({ name });
    }
    const query = args.find(arg => arg.startsWith('query='))!.slice(6);
    const variable = (key: string) => args.find(arg => arg.startsWith(`${key}=`))!.slice(key.length + 1);
    if (query.includes('addBlockedBy')) {
      edges.add(`${variable('issue')}:${variable('blocker')}`); writes.push(`#${number(variable('issue'))} blocked by #${number(variable('blocker'))}`);
      return answer({ data: { addBlockedBy: { issue: { number: number(variable('issue')) } } } });
    }
    if (query.includes('subIssues')) {
      const repository: Json = { issue: { subIssues: { pageInfo: { hasNextPage: false }, nodes: subIssues.map(node => ({
        id: `I${node.number}`, number: node.number, state: node.state, body: node.body,
        repository: { nameWithOwner: node.repository ?? 'Ancienttwo/repo-harness' },
        blockedBy: { pageInfo: { hasNextPage: false }, nodes: [...edges].filter(edge => edge.startsWith(`I${node.number}:`))
          .map(edge => ({ id: edge.split(':')[1], number: number(edge.split(':')[1]!) })) },
      })) } } };
      ['tier:low', 'tier:medium', 'tier:high'].forEach((name, index) => { repository[`t${index}`] = labels.has(name) ? { name } : null; });
      return answer({ data: { repository } });
    }
    blockerReads += 1;
    const repository = Object.fromEntries([...query.matchAll(/b([0-9]+): issue/gu)]
      .map(match => [`b${match[1]}`, missing.includes(Number(match[1])) ? null : { id: `I${match[1]}`, number: Number(match[1]) }]));
    return answer({ data: { repository } });
  };
  const input = { repo_root: '/nonexistent', parent: 1503, gh_runner: runner };
  // `plan` is the run without --write. `migrate` is `--write --plan <digest>`: a fresh plan, the digest check, then exactly its writes;
  // without a digest it uses the fresh plan's own, as a person who checked that same list would.
  return {
    runner, writes, blockerReads: () => blockerReads, calls: () => calls, plan: () => planDependencyMigration(input),
    command: (flags: { readonly write: boolean; readonly plan: string | undefined }) => runDependencyMigration(input, flags),
    edit: (number: number, body: string) => { subIssues.splice(subIssues.findIndex(node => node.number === number), 1, { ...subIssues.find(node => node.number === number)!, body }); },
    migrate: (digest?: string) => { const plan = planDependencyMigration(input); return applyDependencyMigration(input, plan, digest ?? plan.digest); },
    apply: (digest: string | undefined) => applyDependencyMigration(input, planDependencyMigration(input), digest),
  };
}

const MIGRATION_SUB_ISSUES: readonly MigrationSubIssue[] = [
  { number: 1508, state: 'OPEN', body: '## Goal\nConsole board.\n\n## Depends on\nDepends on #1505 board core\nEarly start: not allowed\n\n## Out of scope\n- #1507 owns the deletion' },
  { number: 1509, state: 'OPEN', body: '## 依赖\n#1505；#1473（启动时写席位标签）、#1476 合入后再做。\n风险：High（验收链路）。\n---\n_Generated in #9_' },
  { number: 1510, state: 'OPEN', body: 'Watcher.\n依赖：#1505\n' },
  // An existing link to #1505 of another repository is not the local #1505 link.
  { number: 1512, state: 'OPEN', body: 'Depends on #1505\n', blocked_by: ['FOREIGN1505'] },
  { number: 1490, state: 'CLOSED', body: '## Depends on\nDepends on #1505\n' },
];

test('migrate-dependencies turns the dependency lines of open sub-issues into blocked-by links and creates the tier labels', () => {
  const stub = migrationStub(MIGRATION_SUB_ISSUES);
  const result = stub.migrate();
  expect(result.edges.map(edge => [edge.issue, edge.blocker, edge.line_number, edge.result])).toEqual([
    [1508, 1505, 5, 'created'],
    [1509, 1505, 2, 'created'], [1509, 1473, 2, 'created'], [1509, 1476, 2, 'created'],
    [1510, 1505, 2, 'created'],
    [1512, 1505, 1, 'created'],
  ]);
  expect(result.skipped).toEqual([{ issue: 1509, line_number: 3, line: '风险：High（验收链路）。' }]);
  expect(result.labels).toEqual([
    { name: 'tier:low', result: 'created' }, { name: 'tier:medium', result: 'created' }, { name: 'tier:high', result: 'created' }]);
  // Lines after a heading or `---` and the closed sub-issue #1490 give no link.
  expect(stub.writes).toEqual(['label tier:low', 'label tier:medium', 'label tier:high', '#1508 blocked by #1505',
    '#1509 blocked by #1505', '#1509 blocked by #1473', '#1509 blocked by #1476', '#1510 blocked by #1505', '#1512 blocked by #1505']);
});

test('migrate-dependencies without --write prints the whole plan and writes nothing', () => {
  const stub = migrationStub(MIGRATION_SUB_ISSUES);
  const text = renderDependencyMigrationPlan(stub.plan());
  expect(stub.writes).toEqual([]);
  for (const line of ['create label tier:low', 'create #1508 blocked by #1505 (line 5: Depends on #1505 board core)',
    'create #1512 blocked by #1505 (line 1: Depends on #1505)', 'skip #1509 line 3: 风险：High（验收链路）。', '--write makes 9 writes',
    `plan digest: ${stub.plan().digest} (apply with --write --plan ${stub.plan().digest})`]) {
    expect(text).toContain(line);
  }
  const refused = migrationStub([...MIGRATION_SUB_ISSUES, { number: 1505, state: 'OPEN', body: '- Example:\n\n      Depends on #7\n' }]);
  const stopped = renderDependencyMigrationPlan(refused.plan());
  expect(refused.writes).toEqual([]);
  expect(stopped).toContain('refuse #1505 line 3: Depends on #7');
  expect(stopped).toContain('--write stops before any write: dependency_line_ambiguous');
});

test('a second migrate-dependencies run writes nothing and reports every link and label as existing', () => {
  const stub = migrationStub(MIGRATION_SUB_ISSUES);
  stub.migrate();
  const writes = stub.writes.length;
  const second = stub.migrate();
  expect(stub.writes.length).toBe(writes);
  expect([...second.edges, ...second.labels].every(entry => entry.result === 'exists')).toBe(true);
  expect(second.edges).toHaveLength(6);
});

test('migrate-dependencies stops before any write on an unparsable line, a declaration in a possible code position, another heading form or a sub-issue of another repository', () => {
  const open = (number: number, body: string): MigrationSubIssue => ({ number, state: 'OPEN', body });
  // [added sub-issues, error code, the lines the message names]; an ambiguous stop names exactly those lines.
  const stops: readonly [readonly MigrationSubIssue[], string, readonly string[]][] = [
    [[open(1505, '## 依赖\n\n无。席位标签来自 #1473 和 #1476；合入前执行轴为 unavailable。\n')], 'dependency_line_unparsed', ['#1505 line 3']],
    [[open(1505, 'Depends on other/repo#7\n')], 'dependency_line_unparsed', ['#1505 line 1']],
    [[open(1505, '#### 依赖\n#1473\n')], 'dependency_line_unparsed', ['#1505 line 1']],
    // Refusals (owner rule M24): a code or HTML marker anywhere in the body, leading whitespace, or a wide list marker.
    [[open(1505, '- Example:\n\n    ```\n    Depends on #7\n    ```\n')], 'dependency_line_ambiguous', ['#1505 line 4: Depends on #7']],
    [[open(1505, '- Example:\n\n      Depends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 3: Depends on #7']],
    [[open(1505, '````markdown\n```\nDepends on #7\n````\n')], 'dependency_line_ambiguous', ['#1505 line 3: Depends on #7']],
    [[open(1505, '```\n    ```\nDepends on #7\n```\n')], 'dependency_line_ambiguous', ['#1505 line 3: Depends on #7']],
    [[open(1505, '- Step:\n  ```\n  code\n```\nDepends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 5: Depends on #7']],
    [[open(1505, ' \tDepends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 1: Depends on #7']],
    [[open(1505, '- Example:\n\n    ## 依赖\n')], 'dependency_line_ambiguous', ['#1505 line 3: ## 依赖']],
    [[open(1505, '## 依赖\n- #1476 core\n    and #1473\n')], 'dependency_line_ambiguous', ['#1505 line 3: and #1473']],
    [[open(1505, '- ```\nDepends on #7\n- ```\n')], 'dependency_line_ambiguous', ['#1505 line 2: Depends on #7']],
    [[open(1505, '1. ```\n   Depends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 2: Depends on #7']],
    [[open(1505, '-     Depends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 1: -     Depends on #7']],
    [[open(1505, '-\t\tDepends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 1: -\t\tDepends on #7']],
    [[open(1505, '## 依赖\n-     #7\n')], 'dependency_line_ambiguous', ['#1505 line 2: -     #7']],
    [[open(1505, '## 依赖\n```\n~~~ #1473\n')], 'dependency_line_ambiguous', ['#1505 line 1: ## 依赖', '#1505 line 3: ~~~ #1473']],
    [[open(1505, '<pre>\nDepends on #7\n</pre>\n')], 'dependency_line_ambiguous', ['#1505 line 2: Depends on #7']],
    [[open(1505, '<!--\nDepends on #7\n-->\n')], 'dependency_line_ambiguous', ['#1505 line 2: Depends on #7']],
    // Only `- #n` in a section is a template list form (owner rule M24 item 5); every other list form refuses.
    [[open(1505, '1. Depends on #7\n+ 依赖：#7\n* Depends on #7\n- Depends on #7\n')], 'dependency_line_ambiguous',
      ['#1505 line 1: 1. Depends on #7', '#1505 line 2: + 依赖：#7', '#1505 line 3: * Depends on #7', '#1505 line 4: - Depends on #7']],
    [[open(1505, '## 依赖\n1. #7\n+ #7\n* #7\n')], 'dependency_line_ambiguous', ['#1505 line 2: 1. #7', '#1505 line 3: + #7', '#1505 line 4: * #7']],
    // The marker may come after the declaration: the whole body refuses.
    [[open(1505, 'Depends on #7\n\n```\nexample\n```\n')], 'dependency_line_ambiguous', ['#1505 line 1: Depends on #7']],
    // One scan over all bodies: both refusals are named, and the parse error of #10 does not hide them.
    [[open(10, '    Depends on #7\nDepends on other/repo#8\n'), open(11, '    Depends on #9\n')], 'dependency_line_ambiguous',
      ['#10 line 1: Depends on #7', '#11 line 1: Depends on #9']],
    [[{ number: 10, state: 'OPEN', body: 'Depends on #20\n', repository: 'other/repo' }], 'foreign_sub_issue', ['#10 of other/repo']],
  ];
  for (const [added, code, lines] of stops) {
    const stub = migrationStub([...MIGRATION_SUB_ISSUES, ...added]);
    let error: unknown;
    try { stub.migrate(); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code });
    for (const line of lines) expect((error as Error).message).toContain(line);
    if (code === 'dependency_line_ambiguous') expect((error as Error).message.match(/#[0-9]+ line [0-9]+/gu)).toHaveLength(lines.length);
    expect(stub.writes).toEqual([]);
  }
  const stopOf = (run: () => unknown): unknown => {
    try { run(); } catch (caught) { return caught; }
    return undefined;
  };
  // A refusal stops the plan before any blocker read, so the missing blocker #999 cannot hide it.
  const missing = migrationStub([...MIGRATION_SUB_ISSUES, open(1505, '-     Depends on #7\n'), open(1506, 'Depends on #999\n')], [999]);
  expect(stopOf(() => missing.migrate())).toMatchObject({ code: 'dependency_line_ambiguous' });
  expect([missing.blockerReads(), missing.writes]).toEqual([0, []]);
  // --write applies only the checked list: a body edited after the dry run changes the digest.
  const drift = migrationStub(MIGRATION_SUB_ISSUES);
  const checked = drift.plan();
  drift.edit(1510, 'Watcher.\n依赖：#1473\n');
  expect(stopOf(() => drift.migrate(checked.digest))).toMatchObject({ code: 'dependency_plan_changed' });
  expect(drift.writes).toEqual([]);
  // --write without --plan <digest> is refused, and the command refuses it before any GitHub call.
  expect(stopOf(() => drift.apply(undefined))).toMatchObject({ code: 'plan_digest_required' });
  expect(drift.writes).toEqual([]);
  const flags = migrationStub(MIGRATION_SUB_ISSUES);
  expect(stopOf(() => flags.command({ write: true, plan: undefined }))).toMatchObject({ code: 'plan_digest_required' });
  // --plan <digest> without --write is refused too.
  expect(stopOf(() => flags.command({ write: false, plan: checked.digest }))).toMatchObject({ code: 'plan_without_write' });
  expect([flags.calls(), flags.writes]).toEqual([0, []]);
});

test('advisor seat: plain text reaches only the one live advisor terminal of the repository; the read-back withholds key blocks and long lines and redacts the rest', () => {
  const W = ADVISOR_TRANSCRIPT_LINE_WITHHELD;
  const seat = (name: string | null, parent: string | null = '1503', repository = '1186405141') => ({ labels: {
    'repo-harness.repository': repository, ...(parent === null ? {} : { 'repo-harness.parent': parent }), ...(name === null ? {} : { 'repo-harness.seat': name }) } });
  // Refused: the orchestrator, a worker, the advisor of another repository and a terminal without the seat label.
  const refused = { t3: seat('orchestrator'), t4: seat('worker'), t5: seat('advisor', '1503', '987654321'), t6: seat(null),
    'mini-cf/t11': seat('advisor'), 'lab/odd?terminal': seat('advisor') };
  const advisorHc = (terminals: Json, env: Json = {}) => {
    const hc = watchHc({ FAKE_LS: Object.keys(terminals).map(address => ({ address, state: 'live' })), FAKE_TERMINALS: terminals, ...env });
    return { ...hc, scope: { github_repository_id: 1186405141, parent: 1503, host: boardHostPorts(hc.options) } };
  };
  const code = (action: () => unknown) => { try { action(); return 'ok'; } catch (error) { return (error as AdvisorSeatError).code; } };
  const sends = (hc: ReturnType<typeof advisorHc>) => hc.calls().filter(args => args[0] === 'send');

  const absent = advisorHc(refused);
  expect(code(() => sendToAdvisorSeat(absent.scope, 'status?'))).toBe('advisor_seat_absent');
  expect(absent.calls()[0]).toEqual(['ls', '--json', '--label', 'repo-harness.repository=1186405141']);
  expect(sends(absent)).toEqual([]);
  // One advisor per repository (#1780): two live advisors with different parent labels are ambiguous.
  expect(code(() => sendToAdvisorSeat(advisorHc({ ...refused, t9: seat('advisor'), t10: seat('advisor', '1504') }).scope, 'status?'))).toBe('advisor_seat_ambiguous');

  // The advisor carries no parent label, as its start row in herdr-notify.md writes it.
  const one = advisorHc({ ...refused, t9: { ...seat('advisor', null), status: { state: 'working', kind: 'tool' }, turn: 3 } }, {
    FAKE_READ: { text: ['dropped', ...Array.from({ length: 196 }, (_, at) => `l${at}`), 'export GITHUB_TOKEN=ghp_' + 'a'.repeat(36), 'API_KEY=hunter2',
      'Authorization: Bearer abc', 'x'.repeat(5000)].join('\n'), complete: false, why: 'working' },
  });
  // Characters, not UTF-16 units: 4000 emoji are 8000 units.
  for (const text of ['status?', 'line 1\nline 2', 'a'.repeat(4000), '😀'.repeat(4000)]) {
    expect(sendToAdvisorSeat(one.scope, text)).toEqual({ protocol: 1, kind: 'repo-harness.advisor-seat-send', github_repository_id: 1186405141, parent: 1503, terminal: 't9', started: true, turn: 2 });
    expect(sends(one).at(-1)).toEqual(['send', '--json', '--', 't9', text]);
  }
  const before = one.calls().length;
  for (const text of ['', 'a'.repeat(4001), 'a\tb', 'a\rb', 'a\u0007b', 'a\u001bb', 'a\u007fb', 'a\u009bb']) expect(code(() => sendToAdvisorSeat(one.scope, text))).toBe('text_invalid');
  expect(one.calls()).toHaveLength(before);

  const transcript = readAdvisorSeat(one.scope);
  expect(one.calls().at(-1)).toEqual(['read', '--json', '--lines', '200', '--', 't9']);
  expect(transcript).toMatchObject({ terminal: 't9', status: 'working', status_kind: 'tool', turn: 3, complete: false, why: 'working' });
  expect(transcript.lines).toHaveLength(200);
  expect(transcript.lines.slice(0, 2)).toEqual(['l0', 'l1']);
  expect(transcript.lines.slice(-4)).toEqual(['export GITHUB_TOKEN=ghp_[REDACTED]', W, 'Authorization: Bearer [REDACTED]', W]);
  expect(decodeAdvisorSeatTranscript(JSON.parse(JSON.stringify(transcript)))).toEqual(transcript);
  for (const terminal of ['mini-cf/t11', 'lab/odd?terminal', 't1a']) {
    expect(() => decodeAdvisorSeatTranscript({ ...transcript, terminal })).toThrow('advisor seat target is invalid');
  }
  expect(one.calls().filter(args => args[0] === 'get').every(args => !args.at(-1)!.includes('/'))).toBe(true);

  // The read-back order: the last 200 lines, private key blocks withheld, a line over the limit withheld before or after redaction.
  const [begin, body, end] = ['-----BEGIN PRIVATE KEY-----', 'MC4CAQAwBQYDK2VwBCIEIGv0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u', '-----END PRIVATE KEY-----'];
  const [pgpBegin, pgpEnd] = ['-----BEGIN PGP PRIVATE KEY BLOCK-----', '-----END PGP PRIVATE KEY BLOCK-----'];
  const newForms = [['SSH2 ENCRYPTED PRIVATE KEY', '---- ', ' ----'], ['RSA-PSS PRIVATE KEY', '-----', '-----'], ['PGP SECRET KEY BLOCK', '-----', '-----']].map(([label, open, close]) => ['BEGIN', 'END'].map(word => `${open}${word} ${label}${close}`));
  const cases: readonly [string, readonly string[], readonly string[]][] = [
    ['whole key', ['before', begin, body, body, end, 'after'], ['before', W, W, W, W, 'after']],
    ['another key type', ['-----BEGIN EC PRIVATE KEY-----', body, '-----END EC PRIVATE KEY-----', 'after'], [W, W, W, 'after']],
    ['a PGP key', [pgpBegin, body, pgpEnd, 'after'], [W, W, W, 'after']],
    ['window end cuts a PGP key', ['before', pgpBegin, body], ['before', W, W]],
    ['hc read starts inside a PGP key', [body, pgpEnd, 'after'], [W, W, 'after']],
    ...newForms.flatMap(([formBegin, formEnd]): [string, readonly string[], readonly string[]][] => [
      [`whole ${formBegin}`, [formBegin, body, formEnd, 'after'], [W, W, W, 'after']],
      [`window end cuts ${formBegin}`, ['before', formBegin, body], ['before', W, W]],
      [`hc read starts inside ${formBegin}`, [body, formEnd, 'after'], [W, W, 'after']],
    ]),
    ['a key label outside the named forms', ['-----BEGIN TSS2 PRIVATE KEY-----', body, '-----END TSS2 PRIVATE KEY-----', 'after'], [W, W, W, 'after']],
    ['key on one line', [`key ${begin}${body}${end}`, 'after'], [W, 'after']],
    ['hc read starts inside the key', [body, end, 'after'], [W, W, 'after']],
    ['window start cuts the key', [begin, ...Array.from({ length: 199 }, () => body), end, 'after'], [...Array.from({ length: 199 }, () => W), 'after']],
    ['window end cuts the key', ['before', begin, body], ['before', W, W]],
    ['an open key followed by another key', ['x', begin, 'K1', 'K2', begin, 'K3', end, 'y'], ['x', W, W, W, W, W, W, 'y']],
    ['a line that ends one key and opens another', [`${begin} K ${end} ${begin}`, 'Kz', 'y'], [W, W, W]],
    ['line over the limit', ['a'.repeat(1001), 'a'.repeat(1000)], [W, 'a'.repeat(1000)]],
    ['redaction grows a line over the limit', [`${'a'.repeat(976)} Authorization: Bearer x`, `${'a'.repeat(900)} Authorization: Bearer x`], [W, `${'a'.repeat(900)} Authorization: Bearer [REDACTED]`]],
  ];
  // The projection and the response decoder return the same lines, with no key line.
  for (const [name, input, lines] of cases) {
    const projected = advisorTranscriptLines(input.join('\n'));
    expect([name, projected, decodeAdvisorSeatTranscript({ ...transcript, lines: projected }).lines]).toEqual([name, lines, lines]);
  }
  // Each line alone passes; the joined text holds a whole key.
  for (const lines of [['API_KEY=hunter2'], [begin, body, end], [pgpBegin, body, pgpEnd]]) expect(() => decodeAdvisorSeatTranscript({ ...transcript, lines })).toThrow('advisor seat transcript is invalid');

  // A failed send names the resolved terminal; `hc send` may have run, so it is unconfirmed.
  const failed = advisorHc({ t9: seat('advisor') }, { FAKE_SEND_FAIL: '1' });
  const failure = (action: () => unknown) => { try { action(); return null; } catch (error) { return advisorSeatSendFailure(failed.scope, error as AdvisorSeatError); } };
  expect(failure(() => sendToAdvisorSeat(failed.scope, 'status?'))).toEqual({ protocol: 1, kind: 'repo-harness.advisor-seat-send-failure', github_repository_id: 1186405141, parent: 1503, terminal: 't9', code: 'advisor_send_unconfirmed' });
  expect(failure(() => sendToAdvisorSeat(absent.scope, 'status?'))).toMatchObject({ terminal: null, code: 'advisor_seat_absent' });
  const missing = { github_repository_id: 1186405141, parent: 1503, host: boardHostPorts({ env: { PATH: '/nonexistent' } }) };
  expect([code(() => sendToAdvisorSeat(missing, 'status?')), code(() => readAdvisorSeat(missing))]).toEqual(['hc_unavailable', 'hc_unavailable']);
});

test('board closeout: proofs come first; a bound, clean, pushed seat closes and the merged worktree goes; a dirty, unpushed or conflicting seat, a missing proof and a failed step keep their state with the reason', async () => {
  const root = tmpWorkspace('board-closeout'); roots.push(root);
  const main = join(root, 'main'), origin = join(root, 'origin.git');
  const git = (cwd: string, ...args: string[]) => {
    const result = run('git', args, cwd);
    expect(result.status).toBe(0);
    return result.stdout.trim();
  };
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  mkdirSync(main); initGitRepo(main);
  writeFileSync(join(main, '.gitignore'), '.ai/\n');
  git(main, 'add', '.'); git(main, 'commit', '-q', '-m', 'base');
  git(main, 'remote', 'add', 'origin', origin); git(main, 'push', '-q', '-u', 'origin', 'main');
  const pullRequests: Record<string, Json> = {};
  const worktree = (name: string, pr: number, issue: number) => {
    const path = join(root, name);
    git(main, 'worktree', 'add', '-q', '-b', `feat/${name}`, path);
    writeFileSync(join(path, `${name}.txt`), name);
    git(path, 'add', '.'); git(path, 'commit', '-q', '-m', name); git(path, 'push', '-q', '-u', 'origin', `feat/${name}`);
    mkdirSync(join(path, '.ai/harness'), { recursive: true });
    writeFileSync(join(path, '.ai/harness/active-worktree'), `${path}\n`);
    const head = git(path, 'rev-parse', 'HEAD');
    git(main, 'merge', '-q', '--no-ff', '-m', `merge ${name}`, `feat/${name}`); git(main, 'push', '-q', 'origin', 'main');
    pullRequests[String(pr)] = { number: pr, state: 'MERGED', baseRefName: 'main', headRefName: `feat/${name}`, headRefOid: head,
      mergeCommit: { oid: git(main, 'rev-parse', 'HEAD') }, closingIssuesReferences: [{ number: issue, repository: { id: 'R_this' } }] };
    return path;
  };
  const clean = worktree('clean', 21, 11), kept = worktree('kept', 22, 12), dirty = worktree('dirty', 23, 13), partial = worktree('partial', 24, 14);
  const branchfail = worktree('branchfail', 25, 15), rmfail = worktree('rmfail', 26, 16), child = worktree('child', 27, 17), sigfail = worktree('sigfail', 28, 18);
  // #21 also closes issue 12 of another repository, which binds no local seat.
  pullRequests['21']!.closingIssuesReferences.push({ number: 12, repository: { id: 'R_other' } });
  // A clean checkout of another project under a stale pr label.
  const elsewhere = join(root, 'elsewhere');
  mkdirSync(elsewhere); initGitRepo(elsewhere); git(elsewhere, 'commit', '-q', '--allow-empty', '-m', 'other');
  // Git refuses the deletion of feat/branchfail, so its exact removal stops after the checkout is gone.
  mkdirSync(join(root, 'hooks'));
  writeFileSync(join(root, 'hooks/reference-transaction'), `#!/bin/sh\n[ "$1" = prepared ] || exit 0\ngrep -q ' 0\\{40\\} refs/heads/feat/branchfail$' && exit 1\nexit 0\n`);
  chmodSync(join(root, 'hooks/reference-transaction'), 0o755);
  git(main, 'config', 'core.hooksPath', join(root, 'hooks'));
  writeFileSync(join(dirty, 'draft.txt'), 'dirty');
  // Reviewer checkouts of #22: one with a commit that origin does not have, one with an uncommitted file.
  const checkout = (name: string) => {
    const path = join(root, name);
    git(main, 'worktree', 'add', '-q', '-b', `review/${name}`, path); git(path, 'push', '-q', '-u', 'origin', `review/${name}`);
    return path;
  };
  const unpushed = checkout('unpushed'), edited = checkout('edited');
  git(unpushed, 'commit', '-q', '--allow-empty', '-m', 'local only');
  writeFileSync(join(edited, 'note.txt'), 'draft');
  const terminal = (address: string, cwd: string | null, labels: Record<string, string>, state: 'live' | 'finished' = 'live') => ({ address, name: null, agent: 'claude-code', state, status: 'done',
    status_kind: null, status_msg: null, status_ms: null, turn: 1, cwd, labels: { seat: 'worker', ...labels } });
  const terminals = [terminal('t1', clean, { issue: '11' }), terminal('t2', clean, { seat: 'gatekeeper', pr: '21' }), terminal('t3', main, { seat: 'orchestrator' }),
    terminal('t4', kept, { issue: '12' }), terminal('t5', unpushed, { seat: 'reviewer', pr: '22' }), terminal('t6', kept, { issue: '12', pr: '99' }),
    terminal('t7', edited, { seat: 'gatekeeper', pr: '22' }), terminal('t8', main, { seat: 'reviewer', pr: '23' }), terminal('t9', main, { seat: 'reviewer', pr: '24' }),
    terminal('t10', elsewhere, { seat: 'reviewer', pr: '22' }), terminal('t11', main, { seat: 'reviewer', pr: '25' }),
    // Finished terminals (#2021) pass the same label and checkout proofs as live ones.
    terminal('t12', clean, { seat: 'reviewer', pr: '21' }, 'finished'), terminal('t13', elsewhere, { seat: 'reviewer', pr: '22' }, 'finished'),
    terminal('t14', kept, { issue: '12', pr: '99' }, 'finished'), terminal('t15', null, { seat: 'reviewer', pr: '22' }, 'finished'),
    terminal('t16', main, { seat: 'reviewer', pr: '77' }, 'finished'), terminal('t17', main, { seat: 'reviewer', pr: '26' }, 'finished'),
    terminal('t18', main, { seat: 'reviewer', pr: '27' }), terminal('t19', main, { seat: 'reviewer', pr: '28' })];
  // hc rm of t17 fails until the retry.
  const rmFails = new Set(['t17']);
  const closed: string[] = [];
  // Closeout stops a server and finds a process that still holds the checkout (#2029): a surviving child, or a signal that failed.
  const holders = [child, sigfail], stops: Record<string, { stopped: number[]; failures: string[] }> = {
    [child]: { stopped: [4241], failures: [] }, [sigfail]: { stopped: [], failures: ['codegraph server 4240: EPERM'] } };
  const closeout = (pr: number) => runBoardCloseout({
    repo_root: main, pr, caller_terminal: 't3', processes: () => holders.map(cwd => ({ pid: 4242, cwd })), stopCodegraphServers: (path) => stops[path] ?? { stopped: [], failures: [] },
    stopDaemons: (path) => { if (path === partial) throw new Error('daemon stop failed'); return []; },
    host: { closeoutTerminals: () => ({ status: 'observed', terminals }), closeTerminal: (address) => {
      if (rmFails.has(address)) return { status: 'unavailable', reason: 'hc_failed' };
      closed.push(address); return { status: 'closed' };
    } },
    gh_runner: args => ({ status: 0, stdout: JSON.stringify(args[0] === 'pr' ? pullRequests[args[2]!] : args[0] === 'repo' ? { id: 'R_this' } : { id: 1186405141 }) }),
  });
  const pane = (address: string, seat: string, reason: string | null) => ({ address, seat, outcome: reason === null ? 'closed' as const : 'kept' as const, reason });
  const state = (path: string, outcome: 'removed' | 'kept', reason: string | null) => ({ path, outcome, reason, checkout_present: outcome !== 'removed', branch_present: outcome !== 'removed' });

  const removed = await closeout(21);
  expect([removed.panes, removed.worktree]).toEqual([[pane('t1', 'worker', null), pane('t2', 'gatekeeper', null), pane('t12', 'reviewer', null)], state(clean, 'removed', null)]);
  expect([existsSync(clean), run('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/feat/clean'], main).status, git(origin, 'branch', '--list', 'feat/clean')])
    .toEqual([false, 1, 'feat/clean']);

  const retained = await closeout(22);
  expect([retained.panes, retained.worktree]).toEqual([
    [pane('t4', 'worker', null), pane('t5', 'reviewer', 'unpushed 1 commit(s) on review/unpushed'), pane('t6', 'worker', 'conflicting_binding pr 99'), pane('t7', 'gatekeeper', 'dirty'),
      pane('t10', 'reviewer', 'other_repository'),
      pane('t13', 'reviewer', 'other_repository'), pane('t14', 'worker', 'conflicting_binding pr 99'), pane('t15', 'reviewer', 'cwd_unknown')],
    state(kept, 'kept', 'a pane of the pull request is kept'),
  ]);
  expect(readFileSync(join(kept, '.ai/harness/active-worktree'), 'utf8')).toBe(`${kept}\n`);

  // A missing proof (a dirty worktree) stops before the bound, clean t8 closes.
  await expect(closeout(23)).rejects.toThrow(`closeout of #23 stopped before any side effect: worktree ${dirty} is dirty or unreadable`);
  expect([existsSync(join(dirty, 'draft.txt')), run('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/feat/dirty'], main).status]).toEqual([true, 0]);

  // A step that fails after the panes closed returns those outcomes and the observed worktree state.
  const failed = await closeout(24);
  expect([failed.panes, failed.worktree]).toEqual([[pane('t9', 'reviewer', null)], state(partial, 'kept', 'daemon stop failed')]);
  // A branch deletion that fails after the checkout removal is a partial outcome with the observed state.
  const half = await closeout(25);
  expect([half.panes, half.worktree]).toEqual([[pane('t11', 'reviewer', null)],
    { path: branchfail, outcome: 'partial', reason: expect.stringContaining('update-ref'), checkout_present: false, branch_present: true }]);
  // A failed hc rm keeps the finished pane and the worktree with the reason; the retry removes both.
  const rmFailed = await closeout(26);
  expect([rmFailed.panes, rmFailed.worktree]).toEqual([[pane('t17', 'reviewer', 'hc_failed')], state(rmfail, 'kept', 'a pane of the pull request is kept')]);
  rmFails.clear();
  const retried = await closeout(26);
  expect([retried.panes, retried.worktree]).toEqual([[pane('t17', 'reviewer', null)], state(rmfail, 'removed', null)]);
  // A server that stops while its child keeps the checkout: closeout re-reads the inventory and keeps the worktree.
  const surviving = await closeout(27);
  expect([surviving.worktree.outcome, surviving.worktree.reason, surviving.stopped_codegraph_servers, surviving.daemon_stop_failures]).toEqual(['kept', 'process_in_use', [4241], []]);
  // A failed signal is reported, lists no stopped PID, and the holder keeps the worktree.
  const unsignalled = await closeout(28);
  expect([unsignalled.worktree.outcome, unsignalled.worktree.reason, unsignalled.stopped_codegraph_servers, unsignalled.daemon_stop_failures])
    .toEqual(['kept', 'process_in_use', [], ['codegraph server 4240: EPERM']]);
  expect(closed).toEqual(['t1', 't2', 't12', 't4', 't9', 't11', 't17', 't18', 't19']);
});

test('closeout stops a CodeGraph MCP server bound to exactly the worktree and no other process', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cg-stop-'));
  const db = join(dir, '.codegraph/codegraph.db');
  mkdirSync(join(dir, '.codegraph')); writeFileSync(db, '');
  // The installed CodeGraph runs an absolute script path. `opens` is the file the process holds open.
  const script = '/opt/codegraph/lib/dist/bin/codegraph.js';
  const sleeper = (opens: string, args: string[], cwd = dir) => Bun.spawn([process.execPath, '-e', "require('fs').openSync(process.argv[1], 'r'); setTimeout(() => {}, 60000)", opens, script, ...args],
    { cwd, stdio: ['ignore', 'ignore', 'ignore'] });
  const serve = ['serve', '--mcp', '--path', dir];
  // Not a server of this worktree: no index file open but the cwd under .codegraph (an lsof cwd record), another --path with the index open, a non-server with it open.
  const server = sleeper(db, serve), elsewhere = sleeper(__filename, serve, join(dir, '.codegraph')), otherPath = sleeper(db, ['serve', '--mcp', '--path', `${dir}-other`]), bystander = sleeper(db, ['index']);
  try {
    await Bun.sleep(200);
    const found = [server, elsewhere, otherPath, bystander].map(child => ({ pid: child.pid, cwd: dir }));
    expect(stopCodegraphServers(dir, found)).toEqual({ stopped: [server.pid], failures: [] });
    await server.exited;
    // Signal 0 throws only for a process that is gone.
    expect([elsewhere.pid, otherPath.pid, bystander.pid].map(pid => { try { process.kill(pid, 0); return true; } catch { return false; } })).toEqual([true, true, true]);
  } finally { server.kill(); elsewhere.kill(); otherPath.kill(); bystander.kill(); rmSync(dir, { recursive: true, force: true }); }
});
