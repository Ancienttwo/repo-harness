import { afterEach, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpWorkspace } from './helpers/repo-fixture';
import { evaluateBoardAttention, type BoardRuleId } from '../src/core/board/attention';
import { decodeBoard, type BoardV1 } from '../src/core/board/board';
import { decodePlanBlock, PlanBlockError } from '../src/core/board/plan-block';
import type { PullRequestReadinessV2 } from '../src/core/publication/merge-readiness';
import { collectBoard } from '../src/effects/board/collect';
import { boardHostPorts } from '../src/effects/terminal/herdr-core';

// Recorded on 2026-11-03: the two GraphQL reads of parent #1474 with the collector's own queries, the newest
// scheduled ci.yml run, and `hc ls --json` / `hc get --json` of four seat terminals on an isolated hc 0.1.17 core.
const FIXTURES = join(import.meta.dir, 'fixtures/board');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
type Json = Record<string, any>;

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

// The blocked worker t12 last changed its status at 2026-11-02T21:33:12.206Z; the replay runs 11 minutes later.
const REPLAY_NOW = new Date(1_793_655_192_206 + 11 * 60_000);
const HC = `#!/bin/sh
case "$1" in
  --version) echo "hc 0.1.17" ;;
  ls) cat "$FIXTURES/hc-ls.json" ;;
  get) grep "\\"address\\":\\"$4\\"" "$FIXTURES/hc-get.jsonl" ;;
  *) exit 2 ;;
esac
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
    ['t12', 'worker', 1476, 'blocked'], ['t13', 'worker', 1475, 'done'], ['t14', 'orchestrator', null, 'idle'], ['t15', 'seat_label_missing'],
  ]);

  const attention = evaluateBoardAttention(board);
  expect(attention.findings.map(finding => [finding.rule, finding.route, finding.pull_requests, finding.terminals])).toEqual([
    ['A1', 'orchestrator', [1491], []],
    ['A3', 'orchestrator', [], ['t12']],
    ['A7', 'orchestrator', [], []],
    ['R2', 'advisor', [1494, 1499], []],
  ]);
  // t15 has no seat label: the board does not guess its seat. The plan comment has no block, so R1 and R4 wait.
  expect(attention.unevaluated.map(entry => [entry.rule, entry.reason, entry.subject])).toEqual([
    ['A3', 'seat_label_missing', 't15'],
    ['A4', 'seat_label_missing', 't15'],
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

test('acceptance: a table PASS row, a Low tier with a green Required check, and an unparsed record', () => {
  const head = (data: Json, pr: number): string => data.repository[`pr${pr}`].headRefOid;
  const board = replay({
    parent: (data) => { issueNode(data, 1476).labels.nodes.push({ name: 'tier:low' }); },
    pulls: (data) => {
      data.repository.pr1494.comments.nodes.push(comment(`repo-harness acceptance record\nClaim: x\n\n| Round | Seat | Subject | Verdict |\n|---|---|---|---|\n| 1 | claude (unobserved), read-only | \`${head(data, 1494)}\` | PASS: none |\n`, '2026-11-02T22:00:00Z'));
      data.repository.pr1499.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push({ name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z' });
      data.repository.pr1491.comments.nodes.push(comment(`repo-harness acceptance record\nSubject: commit ${head(data, 1491)} (PR head adds a merge of main): PASS.\n`, '2026-11-02T22:00:00Z'));
    },
  });
  expect(board.pull_requests.map(pr => [pr.number, pr.acceptance.status, 'via' in pr.acceptance ? pr.acceptance.via : 'reason' in pr.acceptance ? pr.acceptance.reason : null])).toEqual([
    [1491, 'unknown', 'acceptance_record_unparsed'], [1494, 'accepted', 'record'], [1499, 'accepted', 'tier_low'],
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
});
