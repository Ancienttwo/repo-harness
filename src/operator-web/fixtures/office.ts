import { decodeBoard, type BoardItemV1, type BoardPullRequestV1, type BoardTerminalV1, type BoardV1 } from '../../core/board/board';
import { decodeBoardParents, type BoardParentsSeatV1, type BoardParentsV1 } from '../../core/board/parents';
import type { OperatorAppProps } from '../App';
import type { BoardParentsRead, BoardRead } from '../board-view';
import type { BossCommandWriter } from '../office-boss';
import { HARNESS_ID } from './dev-activity';

/**
 * The sample state of the approved S0 mockup page 一间房 (#1790 M82): the
 * #1309 board of repo-harness with six workers, two in the queue, three in the
 * cart and three in the tray. Every other repository is the idle room.
 */
export const OFFICE_PARENT = 1309;
const REPOSITORY = 'Ancienttwo/repo-harness';
const url = (kind: string, number: number) => `https://github.com/${REPOSITORY}/${kind}/${number}`;
const HOUR = 3_600_000;

function item(number: number, title: string, pull_requests: readonly number[], claim: 'observed' | 'none', at: string): BoardItemV1 {
  return {
    number, title, url: url('issues', number), state: 'open', labels: [], tier: null, milestone: null, blocked_by: [], pull_requests,
    claim_status: claim === 'none' ? { status_kind: 'none' }
      : { status_kind: 'observed', url: `${url('issues', number)}#issuecomment-1`, created_at: at, status: 'active', pr: null, head_sha: null },
  };
}

function pullRequest(number: number, head_ref: string, required_check: BoardPullRequestV1['required_check'], acceptance: BoardPullRequestV1['acceptance'], at: string): BoardPullRequestV1 {
  return {
    number, url: url('pull', number), state: 'open', is_draft: false, base_ref: 'main', base_sha: 'a'.repeat(40), head_ref, head_sha: 'b'.repeat(40),
    head_committed_at: at, merged_at: null, closes: [], refs: [OFFICE_PARENT], files: [], required_check, acceptance, merge_readiness: null,
  };
}

function worker(now: number, address: string, agent: string, status: string, issue: number | null, pr: number | null): BoardTerminalV1 {
  return { address, name: null, agent, state: 'live', status, status_kind: null, status_ms: now, turn: 1, seat_status: 'observed', seat: 'worker', issue, pr };
}

function lead(address: string, agent: string, seat: string): BoardParentsSeatV1 {
  return { address, name: null, agent, state: 'live', status: 'idle', status_kind: null, status_ms: null, turn: 1, seat_status: 'observed', seat, issue: null, pr: null, parent: null };
}

const accepted = (at: string): BoardPullRequestV1['acceptance'] => ({ status: 'accepted', via: 'record', accepted_at: at, evidence_url: `${url('pull', OFFICE_PARENT)}#issuecomment-2` });

export function officeBoard(now: number): BoardV1 {
  const ago = (hours: number) => new Date(now - hours * HOUR).toISOString();
  const done = { status: 'success', completed_at: ago(9) } as const;
  const terminals = officeWorkers(now);
  return decodeBoard({
    protocol: 1, kind: 'repo-harness.board', observed_at: ago(0), repository: REPOSITORY, default_branch: 'main',
    parent: { number: OFFICE_PARENT, title: 'Operator console', url: url('issues', OFFICE_PARENT), state: 'open', labels: [], milestone: null },
    plan: {
      status: 'observed', comment_url: `${url('issues', OFFICE_PARENT)}#issuecomment-3`, created_at: ago(8),
      block: { protocol: 1, kind: 'repo-harness.plan', merge_order: [1315, 1320, 1311, 1324, 1321, 1323, 1295], holds: [{ issue: 1316, reason: '等 DSH 通道' }], batches: [[1315, 1320, 1311, 1324, 1321]], seat_limits: { worker: 6 } },
    },
    items: [
      item(1299, 'DSH 插件前端：拒绝记录 tab', [], 'observed', ago(7)),
      item(1305, 'init 刷新后 package.json 仍调用已退役 helper', [], 'none', ago(7)),
      item(1300, 'Architecture History 视觉稿', [1324], 'observed', ago(2)),
      item(1321, 'Worktree labels', [1321], 'observed', ago(5)),
      item(1315, 'Batch member', [1315], 'observed', ago(6)),
      item(1320, 'Batch member', [1320], 'observed', ago(6)),
      item(1311, 'Batch member', [1311], 'observed', ago(5)),
      item(1316, 'DSH 状态标记', [], 'none', ago(30)),
      item(1302, '刷新 CLAUDE.md 前先备份', [], 'none', ago(30)),
      item(1304, '预览列出会删的 worktree', [], 'none', ago(30)),
    ],
    pull_requests: [
      pullRequest(1324, 'feat/1300-history-mockup', { status: 'success', completed_at: ago(1) }, { status: 'not_accepted' }, ago(2)),
      pullRequest(1321, 'feat/1321-worktree-labels', { status: 'success', completed_at: ago(9) }, { status: 'not_accepted' }, ago(10)),
      pullRequest(1323, 'feat/1323-board-refresh', { status: 'pending' }, { status: 'not_accepted' }, ago(1)),
      pullRequest(1295, 'fix/1295-hook-race', { status: 'failure', completed_at: ago(3) }, { status: 'not_accepted' }, ago(4)),
      pullRequest(1315, 'feat/1315-board-read', done, accepted(ago(11)), ago(12)),
      pullRequest(1320, 'feat/1320-task-drawer', done, accepted(ago(10)), ago(12)),
      pullRequest(1311, 'feat/1311-seat-labels', done, accepted(ago(2)), ago(10)),
    ],
    path_owners: { status: 'observed', owners: [] },
    execution: { status: 'observed', terminals },
    daily_run: { status: 'observed', run_url: url('actions/runs', 1), conclusion: 'success', created_at: ago(12), open_repair_issues: [] },
    tooling: { hc: { status: 'observed', version: '0.1.20', min_version: '0.1.17' }, herdr_app: { status: 'not_pinned' } },
  });
}

function officeWorkers(now: number): readonly BoardTerminalV1[] {
  return [
    worker(now, 't10', 'claude-code', 'working', 1299, null),
    worker(now, 't11', 'codex', 'working', null, 1323),
    worker(now, 't12', 'codex', 'working', null, 1295),
    worker(now, 't13', 'claude-code', 'idle', 1305, null),
    worker(now, 't14', 'claude-code', 'idle', 1300, 1324),
    worker(now, 't15', 'codex', 'idle', 1321, 1321),
  ];
}

export function officeParents(repositoryId: string, now: number): BoardParentsV1 {
  const observed_at = new Date(now).toISOString();
  if (repositoryId !== HARNESS_ID) {
    return decodeBoardParents({ protocol: 2, kind: 'repo-harness.board-parents', observed_at, repository: 'Ancienttwo/operator-site', parents: [], seats: [] });
  }
  return decodeBoardParents({
    protocol: 2, kind: 'repo-harness.board-parents', observed_at, repository: REPOSITORY,
    parents: [{ number: OFFICE_PARENT, title: 'Operator console', url: url('issues', OFFICE_PARENT), updated_at: observed_at, sub_issues: { total: 12, completed: 5 }, seats: 6 }],
    seats: [lead('t3', 'claude-code', 'orchestrator'), lead('t4', 'codex', 'advisor'), ...officeWorkers(now).map(terminal => ({ ...terminal, parent: String(OFFICE_PARENT) }))],
  });
}

/** The first send of a command plays its effect; the next one gets the server's cooldown answer. */
function officeBossWriter(): BossCommandWriter {
  const sent = new Set<string>();
  return (body) => {
    if (sent.has(body.command)) {
      return Promise.resolve({
        state: 'refused', status: 409, retry_after_seconds: 1500,
        error: { code: 'boss_cooldown', message: 'This boss command was sent for this parent inside its cooldown.', next_action: 'Wait retry_after_seconds, then send the command with a new request_id.' },
      });
    }
    sent.add(body.command);
    return Promise.resolve({ state: 'sent' });
  };
}

export function officeProps(busy: OperatorAppProps): OperatorAppProps {
  const now = Date.now();
  return {
    ...busy,
    readBoard: (subject): Promise<BoardRead> => Promise.resolve(subject.repository_id === HARNESS_ID && subject.parent === OFFICE_PARENT
      ? { state: 'ok', board: officeBoard(now) } : { state: 'unavailable', reason: 'board_parent_invalid' }),
    readBoardParents: (repositoryId): Promise<BoardParentsRead> => Promise.resolve({ state: 'ok', list: officeParents(repositoryId, now) }),
    writeBossCommand: officeBossWriter(),
  };
}
