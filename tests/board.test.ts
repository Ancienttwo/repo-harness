import { afterEach, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpWorkspace } from './helpers/repo-fixture';
import { evaluateBoardAttention, type BoardRuleId } from '../src/core/board/attention';
import { decodeBoard, type BoardTerminalV1, type BoardV1 } from '../src/core/board/board';
import { decodePlanBlock, PlanBlockError } from '../src/core/board/plan-block';
import type { PullRequestReadinessV2 } from '../src/core/publication/merge-readiness';
import { collectBoard } from '../src/effects/board/collect';
import { renderDependencyMigrationPlan } from '../src/core/board/dependency-migration';
import { applyDependencyMigration, planDependencyMigration, runDependencyMigration } from '../src/effects/board/dependency-migration';
import { boardHostPorts } from '../src/effects/terminal/herdr-core';

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

// One round is one subject SHA: both reviews of a High round are rows of round 1 on one head (#1538).
test('acceptance: every record on the head counts, and one FAIL withholds acceptance', () => {
  const record = (sha: string, verdict: 'PASS' | 'FAIL') => `repo-harness acceptance record\n\n| Round | Seat | Subject | Verdict |\n|---|---|---|---|\n| 1 | acceptor | ${sha} | ${verdict} |\n`;
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
