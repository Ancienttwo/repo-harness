import { afterEach, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpWorkspace } from './helpers/repo-fixture';
import { evaluateBoardAttention, type BoardRuleId } from '../src/core/board/attention';
import { WINDOW_WITH_WORKERS_MS, WINDOW_WITHOUT_WORKERS_MS } from '../src/core/board/attention-delivery';
import { attentionLogPath, attentionWatchDoctorCheck, runAttentionWindow, serviceTerminalRepository, startAttentionWatch } from '../src/effects/board/attention-watch';
import { decodeBoard, type BoardTerminalV1, type BoardV1 } from '../src/core/board/board';
import { decodePlanBlock, PlanBlockError } from '../src/core/board/plan-block';
import type { PullRequestReadinessV2 } from '../src/core/publication/merge-readiness';
import { collectBoard } from '../src/effects/board/collect';
import { attentionHostPorts, boardHostPorts } from '../src/effects/terminal/herdr-core';

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
if (args[0] === '--version') console.log('hc 0.1.17');
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
  readonly pin?: string;
  readonly now?: Date;
}

function issueNode(data: Json, number: number): Json {
  return data.repository.issue.subIssues.nodes.find((node: Json) => node.number === number);
}

function comment(body: string, createdAt: string): Json {
  return { url: `https://github.com/Ancienttwo/repo-harness/issues/1#issuecomment-${Date.parse(createdAt)}`, createdAt, authorAssociation: 'OWNER', body };
}

function replay(options: Replay = {}): BoardV1 {
  const root = tmpWorkspace('board'); roots.push(root);
  mkdirSync(join(root, 'bin')); mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, 'bin/hc'), HC); chmodSync(join(root, 'bin/hc'), 0o755);
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ external_tooling: { herdr_core: { min_version: options.pin ?? '0.1.16' } } }));
  const parent = JSON.parse(fixture('parent-1474.graphql.json')); options.parent?.(parent.data);
  const pulls = JSON.parse(fixture('pull-requests-1474.graphql.json')); options.pulls?.(pulls.data);
  const answer = (value: unknown) => ({ status: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value) });
  return collectBoard({
    repo_root: root,
    parent: 1474,
    now: () => options.now ?? REPLAY_NOW,
    host: boardHostPorts({ env: { PATH: `${join(root, 'bin')}:/bin:/usr/bin`, FIXTURES } }),
    gh_runner: (args) => {
      if (args[0] === 'repo') return answer({ nameWithOwner: 'Ancienttwo/repo-harness' });
      if (args[1] === 'graphql') return answer(args.some(arg => arg.includes('subIssues')) ? parent : pulls);
      if (args.some(arg => arg.includes('actions/workflows/ci.yml/runs'))) return answer(fixture('daily-run.json'));
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    },
    // #1491 is the only PR that the recorded data shows as accepted; the readiness projection has its own suite.
    readiness: (selection) => ({ ...selection, protocol: 2, kind: 'repo-harness-pull-request-readiness', ready: selection.pr_number === 1491 }) as unknown as PullRequestReadinessV2,
  });
}

function rules(board: BoardV1): BoardRuleId[] {
  return evaluateBoardAttention(board).findings.map(finding => finding.rule);
}

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
  expect(board.tooling).toEqual({ hc: { status: 'observed', version: '0.1.17', min_version: '0.1.16' }, herdr_app: { status: 'not_pinned' } });
  expect(board.execution.status === 'observed' && board.execution.terminals.map(terminal => terminal.seat_status === 'observed'
    ? [terminal.address, terminal.seat, terminal.issue, terminal.status] : [terminal.address, terminal.reason])).toEqual([
    ['t1', 'worker', 1476, 'blocked'], ['t2', 'worker', 1475, 'done'], ['t3', 'orchestrator', null, 'idle'], ['t4', 'seat_label_missing'],
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
    ['R2', 'advisor', [1494, 1499], []],
  ]);
  // t4 has no seat label: the board does not guess its seat. The plan comment has no block, so R1 and R4 wait.
  expect(attention.unevaluated.map(entry => [entry.rule, entry.reason, entry.subject])).toEqual([
    ['A3', 'seat_label_missing', 't4'],
    ['A4', 'seat_label_missing', 't4'],
    ['R1', 'plan_unavailable', 'https://github.com/Ancienttwo/repo-harness/issues/1474#issuecomment-6588782468'],
    ['R4', 'plan_unavailable', null],
  ]);
});

test('decoders refuse an unknown protocol or kind', () => {
  expect(() => decodeBoard({ protocol: 2, kind: 'repo-harness.board' })).toThrow('unsupported board protocol: 2');
  expect(() => decodeBoard({ protocol: 1, kind: 'fleet_board_snapshot' })).toThrow('unsupported board kind: fleet_board_snapshot');
  const block = (value: Json) => `repo-harness plan\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n`;
  const valid = { protocol: 1, kind: 'repo-harness.plan', merge_order: [1475], holds: [], batches: [], seat_limits: { worker: 3 } } as const;
  expect(decodePlanBlock(block(valid))).toEqual(valid);
  expect(() => decodePlanBlock(block({ ...valid, protocol: 2 }))).toThrow(new PlanBlockError('unsupported protocol 2'));
  expect(() => decodePlanBlock(block({ ...valid, kind: 'plan' }))).toThrow(new PlanBlockError('unsupported kind "plan"'));
  expect(() => decodePlanBlock(block({ ...valid, waves: [] }))).toThrow(PlanBlockError);
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

test('one hit for each rule that the recorded state does not trigger', () => {
  const later = new Date('2026-11-03T02:00:00Z');
  const plan = { protocol: 1, kind: 'repo-harness.plan', merge_order: [1475, 1476], holds: [], batches: [], seat_limits: { worker: 3 } };
  const board = replay({
    now: later,
    pin: '0.1.18',
    parent: (data) => {
      data.repository.issue.comments.nodes.push(comment(`repo-harness plan\n\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\`\n`, '2026-11-02T23:00:00Z'));
      issueNode(data, 1475).comments.nodes.push(comment('repo-harness issue claim status\nClaim: x\nStatus: done\nPR: #1491 head 20e2cbd2\n', '2026-11-02T21:50:00Z'));
      issueNode(data, 1477).comments.nodes.push(comment('repo-harness issue claim status\nClaim: x\nStatus: done\nPR: #1460 head 0123abcd\n', '2026-11-02T21:50:00Z'));
      issueNode(data, 1477).blockedBy.nodes.push({ number: 1490, state: 'CLOSED' });
      issueNode(data, 1478).blockedBy.nodes.push({ number: 1480, state: 'OPEN' });
      issueNode(data, 1480).blockedBy.nodes.push({ number: 1478, state: 'OPEN' });
      issueNode(data, 1476).labels.nodes.push({ name: 'tier:low' });
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
  for (const rule of ['A2', 'A4', 'A5', 'A6', 'A8', 'R1', 'R4'] as const) expect(hits).toContain(rule);
  const findings = evaluateBoardAttention(board).findings;
  expect(findings.find(finding => finding.rule === 'A2')?.pull_requests).toEqual([1491, 1499]);
  expect(findings.filter(finding => finding.rule === 'A6').map(finding => finding.issues)).toEqual([[1477, 1490], [1478, 1480]]);
  expect(findings.find(finding => finding.rule === 'R1')?.issues).toEqual([1477, 1478, 1479, 1480, 1481, 1482, 1483]);

  // A rule that cannot read its input lists the subject: no status time, no issue label, an issue or a claim PR off the board.
  const [blocked, done] = board.execution.status === 'observed' ? board.execution.terminals : [];
  const terminals = [{ ...blocked!, status_ms: null }, { ...done!, issue: 1460 }, { ...done!, address: 't9', issue: null }] as BoardTerminalV1[];
  expect(evaluateBoardAttention({ ...board, execution: { status: 'observed', terminals } }).unevaluated
    .filter(entry => ['A3', 'A4', 'A5'].includes(entry.rule)).map(entry => [entry.rule, entry.reason, entry.subject])).toEqual([
    ['A3', 'status_time_missing', 't1'], ['A4', 'issue_off_board', 't2'], ['A4', 'issue_label_missing', 't9'], ['A5', 'claim_pr_off_board', '#1477'],
  ]);
});

test('A2 finds a batch behind an overlapping pull request, and a plan hold removes a PR from A1, A2 and R4', () => {
  const green = { name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z' };
  const findings = (holds: number[]) => evaluateBoardAttention(replay({
    now: new Date('2026-11-03T02:00:00Z'),
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

// A fake hc for the watcher: every call is logged; `get` answers from FAKE_TERMINALS, `wait` from FAKE_WAITS by address.
const WATCH_HC = `#!${process.execPath}
const { appendFileSync } = require('fs');
const args = process.argv.slice(2);
appendFileSync(process.env.HC_LOG, JSON.stringify(args) + '\\n');
const terminals = JSON.parse(process.env.FAKE_TERMINALS);
const address = args.at(-1);
const out = value => console.log(JSON.stringify(value));
if (args[0] === 'get') out({ address, state: 'live', turn: 1, labels: { 'repo-harness.seat': 'x' }, ...terminals[address] });
else if (args[0] === 'send') out({ started: true, turn: 2 });
else if (args[0] === 'wait') out({ terminal: address, turn: 2, ...JSON.parse(process.env.FAKE_WAITS)[address] });
else if (args[0] === 'ls') out({ terminals: JSON.parse(process.env.FAKE_LS) });
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
  return { root, host: attentionHostPorts(options), calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as string[]) };
}

test('watch window: idle sends at once, blocked waits, working sends at window end, and the advisor cap reads the log', async () => {
  const board = replay();
  const seat = (address: string, seatName: string, status: string | null) =>
    ({ address, name: null, state: 'live', status, status_kind: null, status_ms: null, turn: 1, seat_status: 'observed', seat: seatName, issue: null, pr: null }) as BoardTerminalV1;
  const terminals = [seat('t1', 'worker', 'working'), seat('t3', 'orchestrator', 'idle'), seat('t6', 'orchestrator', 'blocked'),
    seat('t7', 'orchestrator', 'blocked'), seat('t8', 'orchestrator', 'working'), seat('t9', 'advisor', 'done')];
  const watched = { ...board, execution: { status: 'observed', terminals } } as BoardV1;
  const hc = watchHc({
    FAKE_TERMINALS: { t3: {}, t6: {}, t7: {}, t8: {}, t9: {} },
    // hc wait ends when the terminal stops working; t6 is still blocked at its timeout, t7 became idle.
    FAKE_WAITS: { t6: { ended: false, reason: 'timeout', status: { state: 'blocked' } }, t7: { ended: false, reason: 'idle', status: { state: 'idle' } } },
  });
  const logPath = attentionLogPath(1186405141, 1474, { REPO_HARNESS_HOME: hc.root });
  expect(logPath).toBe(join(hc.root, 'board/attention-1186405141-1474.jsonl'));
  // Seven advisor wakes in the last 24 hours, one 25 hours ago.
  const start = REPLAY_NOW.getTime();
  mkdirSync(join(hc.root, 'board'));
  writeFileSync(logPath, [...Array.from({ length: 7 }, (_, at) => start - (at + 1) * 3_600_000), start - 25 * 3_600_000].map(time => JSON.stringify({
    at: new Date(time).toISOString(), window: String(time), parent: 1474, kind: 'send', route: 'advisor', terminal: 't9', rules: ['R2'], outcome: 'sent', detail: null,
  })).join('\n') + '\n');
  let clock = start;
  const slept: number[] = [];
  const window = () => runAttentionWindow({ parent: 1474, deliver: true, log_path: logPath, collect: () => watched, host: hc.host,
    now: () => new Date(clock), sleep: async (ms) => { slept.push(ms); clock += ms; } });

  await window();
  expect(slept).toEqual([WINDOW_WITH_WORKERS_MS]);
  // One line per seat terminal: all findings of its route in this window.
  const orchestrator = '[rh-attention] #1474 A1: #1491 is accepted and ready, unmerged for 137 min; A7: the daily full run is failure (https://github.com/Ancienttwo/repo-harness/actions/runs/41358255043) and no CI repair issue is open';
  expect(hc.calls().filter(args => args[0] !== 'get')).toEqual([
    ['send', '--json', '--', 't3', orchestrator],
    ['send', '--json', '--', 't9', expect.stringMatching(/^\[rh-attention\] #1474 R2: #1494 and #1499 both change .+ with no dependency edge$/u)],
    ['wait', '--json', '--timeout', '900', '--', 't6'],
    ['wait', '--json', '--timeout', '900', '--', 't7'],
    ['send', '--json', '--', 't7', orchestrator],
    ['send', '--json', '--', 't8', orchestrator],
  ]);
  const records = () => readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(8).map(line => JSON.parse(line));
  expect(records().filter(record => record.kind === 'send').map(record => [record.terminal, record.outcome, record.at])).toEqual([
    ['t3', 'sent', REPLAY_NOW.toISOString()], ['t9', 'sent', REPLAY_NOW.toISOString()], ['t6', 'skipped_blocked', REPLAY_NOW.toISOString()],
    ['t7', 'sent', REPLAY_NOW.toISOString()], ['t8', 'sent', new Date(start + WINDOW_WITH_WORKERS_MS).toISOString()],
  ]);
  expect(records().filter(record => record.kind === 'finding').map(record => record.rule)).toEqual(['A1', 'A7', 'R2']);

  // The next window: the advisor has eight wakes in 24 hours, and no worker runs, so the window is 60 minutes.
  terminals[0] = { ...terminals[0]!, state: 'finished' };
  await window();
  expect(slept.at(-1)).toBe(WINDOW_WITHOUT_WORKERS_MS);
  expect(records().filter(record => record.kind === 'skip').map(record => [record.route, record.reason])).toEqual([['advisor', 'advisor_daily_cap']]);
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

  const doctor = (ls: Json[]) => attentionWatchDoctorCheck(watchHc({ FAKE_LS: ls, FAKE_TERMINALS: { t5: { labels, state: ls[0]?.state } } }).host);
  expect(doctor([{ address: 't5', state: 'live' }])).toMatchObject({ status: 'ok', detail: 'The attention watcher of #1503 is live.' });
  expect(doctor([{ address: 't5', state: 'finished' }])).toMatchObject({ status: 'warn',
    detail: 'The attention watcher of #1503 is not live (attention_stopped). Run in the repository: repo-harness board attention start --parent 1503' });
  expect(doctor([])).toMatchObject({ status: 'na', detail: 'No attention watcher was started.' });
  expect(attentionWatchDoctorCheck(attentionHostPorts({ env: { PATH: '/nonexistent' } }))).toMatchObject({ status: 'na', detail: 'hc is not installed.' });
});
