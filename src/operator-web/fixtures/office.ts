import { ADVISOR_SEAT_SEND_KIND, ADVISOR_SEAT_TRANSCRIPT_KIND, ADVISOR_TRANSCRIPT_LINE_WITHHELD, decodeAdvisorSeatSend, decodeAdvisorSeatTranscript } from '../../core/board/advisor-seat';
import { BOARD_PROTOCOL, decodeBoard, type BoardItemV1, type BoardPullRequestV1, type BoardTerminalV1, type BoardV1 } from '../../core/board/board';
import { BOARD_PARENTS_PROTOCOL, decodeBoardParents, decodeBoardSeats, type BoardParentsSeatV1, type BoardParentsV1, type BoardSeatsV1 } from '../../core/board/parents';
import { ISSUE_FLOW_WORKER_LIMIT, type DeskState } from '../../core/board/desk';
import { BOARD_SUMMARIES_PROTOCOL, boardSummary, type BoardSummaryEntryV1, type BoardSummarySeatsV1, type BoardSummaryV1 } from '../../core/board/summary';
import { decodeDevActivitySnapshot } from '../../core/dev-activity/decode';
import { decodeOperatorRepositories } from '../../core/operator/repositories';
import type { OperatorAppProps } from '../App';
import type { BoardSummariesRead } from '../board-office';
import type { BoardParentsRead, BoardRead } from '../board-view';
import type { BossCommandWriter } from '../office-boss';
import type { AdvisorMessageWriter, AdvisorTranscriptReader } from '../OfficeAdvisorDialog';
import { HARNESS_ID } from './dev-activity';

/**
 * The sample state of the approved S0 mockup page 一间房 (#1790 M82): the
 * #1309 board of repo-harness with six workers, two in the queue, three in the
 * cart and three in the tray. The overview page has eight rooms: this board,
 * three other lit rooms and four idle rooms.
 */
export const OFFICE_PARENT = 1309;
const REPOSITORY = 'Ancienttwo/repo-harness';
const url = (kind: string, number: number) => `https://github.com/${REPOSITORY}/${kind}/${number}`;
const HOUR = 3_600_000;

function item(number: number, title: string, pull_requests: readonly number[], claim: 'observed' | 'none', at: string): BoardItemV1 {
  return {
    number, title, url: url('issues', number), state: 'open', labels: [], tier: null, milestone: null, blocked_by: [], pull_requests, merge_hold: { status: 'none' },
    claim_status: claim === 'none' ? { status_kind: 'none' }
      : { status_kind: 'observed', url: `${url('issues', number)}#issuecomment-1`, created_at: at, status: 'active', pr: null, head_sha: null },
  };
}

function pullRequest(number: number, head_ref: string, required_check: BoardPullRequestV1['required_check'], acceptance: BoardPullRequestV1['acceptance'], at: string): BoardPullRequestV1 {
  return {
    number, url: url('pull', number), state: 'open', is_draft: false, base_ref: 'main', base_sha: 'a'.repeat(40), head_ref, head_sha: 'b'.repeat(40),
    head_committed_at: at, merged_at: null, closes: [], refs: [OFFICE_PARENT], files: [], required_check, acceptance, merge_readiness: null, tier: 'medium', claude_review: 'not_required', writer_family: null, merge_hold: { status: 'none' },
  };
}

function worker(now: number, address: string, agent: string, status: string, issue: number | null, pr: number | null, branch: string | null): Extract<BoardTerminalV1, { readonly seat_status: 'observed' }> {
  return { address, name: null, agent, state: 'live', status, status_kind: null, status_msg: null, status_ms:now, turn: 1, branch, seat_status: 'observed', seat: 'worker', issue, pr };
}

function lead(address: string, agent: string, seat: string): BoardParentsSeatV1 {
  return { address, name: null, agent, state: 'live', status: 'idle', status_kind: null, status_msg: null, status_ms:null, turn: 1, branch: null, seat_status: 'observed', seat, issue: null, pr: null, parent: null };
}

const accepted = (at: string): BoardPullRequestV1['acceptance'] => ({ status: 'accepted', via: 'record', accepted_at: at, evidence_url: `${url('pull', OFFICE_PARENT)}#issuecomment-2` });

export function officeBoard(now: number): BoardV1 {
  const ago = (hours: number) => new Date(now - hours * HOUR).toISOString();
  const done = { status: 'success', completed_at: ago(9) } as const;
  const terminals = officeWorkers(now);
  return decodeBoard({
    protocol: BOARD_PROTOCOL, kind: 'repo-harness.board', observed_at: ago(0), repository: REPOSITORY, default_branch: 'main', acceptance_merge: 'on',
    parent: { number: OFFICE_PARENT, title: 'Operator console', url: url('issues', OFFICE_PARENT), state: 'open', labels: [], milestone: null },
    plan: {
      status: 'observed', comment_url: `${url('issues', OFFICE_PARENT)}#issuecomment-3`, created_at: ago(8), revision: 7,
      block: { protocol: 1, kind: 'repo-harness.plan', merge_order: [1315, 1320, 1311, 1324, 1321, 1323, 1295], holds: [{ issue: 1316, reason: '等 DSH 通道' }], batches: [[1315, 1320, 1311, 1324, 1321]], seat_limits: { worker: 6 } },
    },
    merge_hold: { status: 'none' },
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
    tooling: { hc: { status: 'observed', version: '0.1.20', min_version: '0.1.20' }, herdr_app: { status: 'not_pinned' } },
  });
}

function officeWorkers(now: number): readonly ReturnType<typeof worker>[] {
  return [
    worker(now, 't10', 'claude-code', 'working', 1299, null, 'feat/1299-dsh-companion'),
    worker(now, 't11', 'codex', 'working', null, 1323, 'feat/1323-board-refresh'),
    worker(now, 't12', 'codex', 'working', null, 1295, 'fix/1295-hook-race'),
    worker(now, 't13', 'claude-code', 'idle', 1305, null, null),
    worker(now, 't14', 'claude-code', 'idle', 1300, 1324, 'feat/1300-history-mockup'),
    worker(now, 't15', 'codex', 'idle', 1321, 1321, 'feat/1321-worktree-labels'),
  ];
}

/** Null is an empty seat; a null agent is an occupied seat whose agent is unknown. */
type SampleLead = { readonly agent: string | null } | null;

/** The other lit rooms of the overview page, with the agents and counts of the mockup. */
interface SampleRoom {
  readonly name: string;
  readonly parent: number;
  readonly orchestrator: SampleLead;
  readonly advisor: SampleLead;
  /** Agent and hc status of each worker. */
  readonly workers: readonly (readonly [string | null, string])[];
  readonly summary: BoardSummaryV1;
}

const NO_PLAN = { accepted: null, size: null };

/** The workers of a sample room with the desk states of the mockup. */
function sampleSeats(desks: readonly (readonly [string | null, DeskState])[]): BoardSummarySeatsV1 {
  return { status: 'observed', stalled: desks.filter(([, state]) => state === 'no_claim_status').length,
    desks: desks.map(([agent, state], index) => ({ seat: 'worker', agent, issue: 100 + index, pr: null, state })) };
}

const SAMPLE_ROOMS: Readonly<Record<string, SampleRoom>> = {
  repo_a1a1a1a1a1a1a1a1: {
    name: 'aiphabee', parent: 212, orchestrator: { agent: 'claude-code' }, advisor: { agent: 'codex' },
    workers: [['claude-code', 'working'], ['codex', 'working'], ['codex', 'working']],
    summary: { queue: 0, ci_failures: 1, batch: { accepted: 2, size: 4 }, current_batch: { accepted: 2, size: 4 }, needs_you: 1, worker_limit: 4,
      seats: sampleSeats([['claude-code', 'coding'], ['codex', 'coding'], ['codex', 'ci_failed']]) },
  },
  repo_a2a2a2a2a2a2a2a2: {
    name: 'AstroZi', parent: 87, orchestrator: { agent: 'codex' }, advisor: { agent: 'claude-code' },
    workers: [['claude-code', 'idle'], ['codex', 'idle'], ['claude-code', 'idle']],
    summary: { queue: 1, ci_failures: 0, batch: { accepted: 0, size: 3 }, current_batch: { accepted: 0, size: 3 }, needs_you: 0, worker_limit: 3,
      seats: sampleSeats([['claude-code', 'ci_pending'], ['codex', 'no_claim_status'], ['claude-code', 'acceptance_queue']]) },
  },
  repo_a3a3a3a3a3a3a3a3: {
    name: 'arch-context', parent: 438, orchestrator: { agent: null }, advisor: null,
    workers: [[null, 'working']],
    summary: { queue: 0, ci_failures: 0, batch: NO_PLAN, current_batch: null, needs_you: 0, worker_limit: ISSUE_FLOW_WORKER_LIMIT, seats: sampleSeats([[null, 'coding']]) },
  },
};
const IDLE_ROOMS: Readonly<Record<string, string>> = {
  repo_a4a4a4a4a4a4a4a4: 'byok-sdk', repo_a5a5a5a5a5a5a5a5: 'fortune-algo', repo_a6a6a6a6a6a6a6a6: 'hegui-agent', repo_a7a7a7a7a7a7a7a7: 'enterprise-brain',
};

function sampleParents(room: SampleRoom, repository: string, now: number) {
  const observed_at = new Date(now).toISOString();
  const seat = (address: string, agent: string | null, status: string, role: string, parent: string | null): BoardParentsSeatV1 =>
    ({ address, name: null, agent, state: 'live', status, status_kind: null, status_msg: null, status_ms:null, turn: 1, branch: null, seat_status: 'observed', seat: role, issue: null, pr: null, parent });
  return documents({
    protocol: BOARD_PARENTS_PROTOCOL, kind: 'repo-harness.board-parents', observed_at, repository,
    parents: [{ number: room.parent, title: room.name, url: `https://github.com/${repository}/issues/${room.parent}`, updated_at: observed_at, sub_issues: { total: 6, completed: 2 } }],
    seats: [
      ...(room.orchestrator === null ? [] : [seat('t1', room.orchestrator.agent, 'idle', 'orchestrator', null)]),
      ...(room.advisor === null ? [] : [seat('t2', room.advisor.agent, 'idle', 'advisor', null)]),
      ...room.workers.map(([agent, status], index) => ({ ...seat(`t${10 + index}`, agent, status, 'worker', String(room.parent)), issue: 100 + index })),
    ],
  });
}

function officeObservation(repositoryId: string, now: number) {
  const observed_at = new Date(now).toISOString();
  const sample = SAMPLE_ROOMS[repositoryId];
  if (sample !== undefined) return sampleParents(sample, `Ancienttwo/${sample.name}`, now);
  if (repositoryId !== HARNESS_ID) {
    return documents({ protocol: BOARD_PARENTS_PROTOCOL, kind: 'repo-harness.board-parents', observed_at, repository: `Ancienttwo/${IDLE_ROOMS[repositoryId]!}`, parents: [], seats: [] });
  }
  return documents({
    protocol: BOARD_PARENTS_PROTOCOL, kind: 'repo-harness.board-parents', observed_at, repository: REPOSITORY,
    parents: [{ number: OFFICE_PARENT, title: 'Operator console', url: url('issues', OFFICE_PARENT), updated_at: observed_at, sub_issues: { total: 12, completed: 5 } }],
    seats: [lead('t3', 'claude-code', 'orchestrator'), lead('t4', 'codex', 'advisor'), ...officeWorkers(now).map(terminal => ({ ...terminal, parent: String(OFFICE_PARENT) }))],
  });
}

function documents(value: BoardParentsV1 & { readonly seats: readonly BoardParentsSeatV1[] }) {
  const { seats, parents, ...facts } = value;
  return {
    parents: decodeBoardParents({ ...facts, parents }),
    seats: decodeBoardSeats({ protocol: 1, kind: 'repo-harness.board-seats', repository_id: '1186405141', observed_at: value.observed_at, seats }),
  };
}

export const officeParents = (repositoryId: string, now: number): BoardParentsV1 => officeObservation(repositoryId, now).parents;
export const officeSeats = (repositoryId: string, now: number): BoardSeatsV1 => officeObservation(repositoryId, now).seats;

function officeSummaries(repositoryId: string, asked: number, now: number): BoardSummariesRead {
  const sample = SAMPLE_ROOMS[repositoryId];
  // The mockup's repo-harness card waits for nobody; the sample board has an A2 finding.
  const row = sample !== undefined ? { parent: sample.parent, summary: sample.summary } : { parent: OFFICE_PARENT, summary: { ...boardSummary(officeBoard(now)), needs_you: 0 } };
  const entry: BoardSummaryEntryV1 = asked === row.parent ? { ...row, status: 'observed', observed_at: new Date(now).toISOString() } : { parent: asked, status: 'not_read' };
  return { state: 'ok', summaries: { protocol: BOARD_SUMMARIES_PROTOCOL, kind: 'repo-harness.board-summaries', repository_id: repositoryId, parents: [entry] } };
}

const officeRepositories = decodeOperatorRepositories({
  protocol: 1, kind: 'operator_repositories', stale_registrations: 0,
  repositories: [
    { repository_id: HARNESS_ID, display_name: 'repo-harness', access_mode: 'read_write' },
    ...Object.entries(SAMPLE_ROOMS).map(([repository_id, room]) => ({ repository_id, display_name: room.name, access_mode: 'read_write' })),
    ...Object.entries(IDLE_ROOMS).map(([repository_id, name]) => ({ repository_id, display_name: name, access_mode: 'read_write' })),
  ],
});

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

/** The redacted read-back of the seat, with a redacted token and a withheld line as the server returns them. A send starts a turn, as `hc send` does. */
function officeAdvisor(): { readonly read: AdvisorTranscriptReader; readonly write: AdvisorMessageWriter } {
  const terminal = 't4';
  const lines = [
    '› 重看 #1316 的排期',
    '• 读取 parent #1309 的计划和 holds。',
    '  gh auth token → ghp_[REDACTED]',
    ADVISOR_TRANSCRIPT_LINE_WITHHELD,
    '• #1316 等 DSH 通道，建议留在 holds。',
    '  #1302、#1304 排到 #1295 之后。',
  ];
  let turn = 7;
  let status = 'idle';
  return {
    read: subject => Promise.resolve({
      state: 'ok',
      transcript: decodeAdvisorSeatTranscript({ protocol: 1, kind: ADVISOR_SEAT_TRANSCRIPT_KIND, github_repository_id: 1, parent: subject.parent, terminal, status, status_kind: null, turn, complete: true, why: null, lines: [...lines] }),
    }),
    write: (body) => {
      turn += 1;
      status = 'working';
      lines.push(`› ${body.text}`);
      return Promise.resolve({ state: 'ok', value: decodeAdvisorSeatSend({ protocol: 1, kind: ADVISOR_SEAT_SEND_KIND, github_repository_id: 1, parent: body.parent, terminal, started: true, turn }) });
    },
  };
}

export function officeProps(busy: OperatorAppProps): OperatorAppProps {
  const now = Date.now();
  const advisor = officeAdvisor();
  return {
    ...busy,
    readBoard: (subject): Promise<BoardRead> => Promise.resolve(subject.repository_id === HARNESS_ID && subject.parent === OFFICE_PARENT
      ? { state: 'ok', board: officeBoard(now) } : { state: 'unavailable', reason: 'board_parent_invalid' }),
    readBoardParents: (repositoryId): Promise<BoardParentsRead> => Promise.resolve({ state: 'ok', list: officeParents(repositoryId, now) }),
    readBoardSeats: async repositoryId => ({ state: 'ok', seats: officeSeats(repositoryId, now) }),
    readBoardSummaries: (repositoryId, parent) => Promise.resolve(officeSummaries(repositoryId, parent, now)),
    readRepositories: () => Promise.resolve(officeRepositories),
    initialRepositories: officeRepositories,
    writeBossCommand: officeBossWriter(),
    readAdvisorTranscript: advisor.read,
    writeAdvisorMessage: advisor.write,
  };
}

export const OFFICE_DOOR_POLICIES = ['on', 'off', 'unknown'] as const;
export type OfficeDoorPolicy = typeof OFFICE_DOOR_POLICIES[number];

/** The sample board with one A1 finding under a merge policy (#1819): #1311 is accepted, ready and unmerged. */
export function officeDoorBoard(board: BoardV1, policy: OfficeDoorPolicy): BoardV1 {
  const readiness = (pr: BoardPullRequestV1) => ({
    provider_repository_id: '1', repository: REPOSITORY, pr_number: pr.number, expected_head_sha: pr.head_sha, expected_base_sha: pr.base_sha,
    protocol: 2, kind: 'repo-harness-pull-request-readiness', ready: true, blockers: [],
  });
  return decodeBoard({ ...board, acceptance_merge: policy, pull_requests: board.pull_requests.map(pr => (pr.number === 1311 ? { ...pr, merge_readiness: readiness(pr) } : pr)) });
}

export function officeDoorProps(office: OperatorAppProps, policy: OfficeDoorPolicy): OperatorAppProps {
  return {
    ...office,
    readBoard: async (subject, signal) => {
      const read = await office.readBoard!(subject, signal);
      return read.state === 'ok' ? { ...read, board: officeDoorBoard(read.board, policy) } : read;
    },
  };
}

export const OFFICE_SETUP_GAPS = ['hc', 'gh', 'repository', 'seats', 'plan'] as const;
export type OfficeSetupGap = typeof OFFICE_SETUP_GAPS[number];

/**
 * The office sample with one setup prerequisite missing (#1788). `seats` and
 * `plan` empty every room, because a lit room shows no checklist; `plan` also
 * takes the plan off the sample board.
 */
export function officeSetupProps(office: OperatorAppProps, gap: OfficeSetupGap): OperatorAppProps {
  const now = Date.now();
  const repositories = gap === 'repository' ? decodeOperatorRepositories({ ...officeRepositories, repositories: [] }) : officeRepositories;
  const source = gap === 'gh' ? { status: 'unavailable', reason: 'gh_failed' } : { status: 'ok', reason: null };
  const activity = decodeDevActivitySnapshot({
    ...office.initialDevActivity!,
    items: [], attention: [],
    repositories: repositories.repositories.map(({ repository_id, display_name }) => ({
      repository_id, display_name, github: gap === 'gh' ? null : `Ancienttwo/${display_name}`, default_branch: 'main',
      sources: [{ kind: 'github', ...source, observed_at: new Date(now).toISOString() }],
    })),
  });
  const emptyRooms = gap === 'seats' || gap === 'plan';
  return {
    ...office,
    readRepositories: () => Promise.resolve(repositories),
    initialRepositories: repositories,
    fetchDevActivity: () => Promise.resolve(activity),
    initialDevActivity: activity,
    readBotAccess: gap !== 'hc' ? office.readBotAccess : async (signal) => {
      const read = await office.readBotAccess!(signal);
      return read.state === 'ok' ? { ...read, snapshot: { ...read.snapshot, hc: { state: 'unavailable', reason: 'hc_missing' } } } : read;
    },
    readBoardSeats: !emptyRooms ? office.readBoardSeats : async repositoryId => ({ state: 'ok', seats: { ...officeSeats(repositoryId, now), seats: [] } }),
    readBoard: gap !== 'plan' ? office.readBoard : async (subject, signal) => {
      const read = await office.readBoard!(subject, signal);
      return read.state === 'ok' ? { ...read, board: { ...read.board, plan: { status: 'absent', truncated: false } } } : read;
    },
  };
}
