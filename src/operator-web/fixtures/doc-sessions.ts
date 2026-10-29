// Development fixtures for the doc session and cleanup session routes. Each
// answer is the route's wire body and HTTP status, and goes through the
// browser's own answer handling, so a 200 body passes the same strict decoder
// the page applies. Paths are repository-relative; nothing names a host path,
// a command or a secret.
import {
  decodeOperatorDocSessionCommit,
  decodeOperatorDocSessionCreated,
  decodeOperatorDocSessionDetail,
  decodeOperatorDocSessionDiscard,
  decodeOperatorDocSessionMessage,
  decodeOperatorDocSessionStop,
  type DocSessionSummaryV1,
} from '../../core/operator/doc-session-api';
import { decodeOperatorDocSessionDiff, decodeOperatorDocSessionLoss } from '../../core/operator/doc-session-changes';
import {
  compareDocSessionCursor,
  decodeOperatorDocSessionEvents,
  docSessionActivity,
  formatDocSessionCursor,
  parseDocSessionCursor,
  type DocSessionEventV1,
} from '../../core/operator/doc-session-events';
import { decodeOperatorCleanupPlan, decodeOperatorCleanupSessionCreated, decodeOperatorCleanupSessionResult } from '../../core/operator/worktree-cleanup-plan';
import type { WorktreesSnapshot } from '../../core/operator/worktrees';
import type { OperatorAppProps } from '../App';
import { docSessionsAnswer, sessionReadAnswer, sessionWriteAnswer, type DocSessionsRead } from '../doc-sessions';
import { allWorktrees } from '../worktrees';
import { DOCS_COMMIT } from './docs';
import { HARNESS_ID } from './dev-activity';

export type DocSessionFixtureName = 'busy' | 'empty' | 'degraded';

export interface SessionWireAnswer {
  readonly status: number;
  readonly body: unknown;
}

const MINUTE = 60_000;
const at = (now: number, ago: number) => new Date(now - ago).toISOString();
const json = ({ status, body }: SessionWireAnswer) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (body: unknown): SessionWireAnswer => ({ status: 200, body });
/** What a server without the session routes answers. */
const NO_ROUTE: SessionWireAnswer = { status: 404, body: { error: { code: 'not_found', message: 'The requested operator API route does not exist.', next_action: 'Check the route.' } } };
const NOT_FOUND: SessionWireAnswer = { status: 404, body: { code: 'session_not_found' } };

export const RUNNING_SESSION = 'a3f0c2d4'.repeat(4);
export const REVIEW_SESSION = 'b71e94c0'.repeat(4);
export const PR_SESSION = 'c52d8e1f'.repeat(4);
export const CLEANUP_SESSION = 'd94a07b3'.repeat(4);
const BASE_COMMIT = DOCS_COMMIT;
const PR_COMMIT = '7a1c3e5f9b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a';
const PLAN_SHA = '3c7e1a9f5b2d8e4c6a0f9b3d7e1c5a8f2b6d0e4a9c3f7b1e5d8a2c6f0b4e9d3a';
const PULL = (number: number) => ({ number, url: `https://github.com/Ancienttwo/repo-harness/pull/${number}` });

type EventBody = DocSessionEventV1 extends infer E ? E extends DocSessionEventV1 ? Omit<E, 'protocol' | 'epoch' | 'seq' | 'at'> : never : never;

/** Numbers the events from `epoch.0`; a new epoch is a host restart. */
function numbered(now: number, epochs: readonly (readonly (readonly [number, EventBody])[])[]): DocSessionEventV1[] {
  return epochs.flatMap((events, index) => events.map(([ago, body], seq) => ({ protocol: 1, epoch: index + 1, seq, at: at(now, ago), ...body }) as DocSessionEventV1));
}

const said = (role: 'user' | 'agent', text: string): EventBody => ({ type: 'message', role, text, truncated: false });
const tool = (category: Extract<EventBody, { type: 'tool' }>['category'], paths: readonly string[], status: Extract<EventBody, { type: 'tool' }>['status'] = 'succeeded'): EventBody =>
  ({ type: 'tool', category, status, paths });
const turn = (boundary: 'started' | 'ended'): EventBody => ({ type: 'turn', boundary });

function sessionEvents(now: number): Readonly<Record<string, readonly DocSessionEventV1[]>> {
  return {
    // Two turns; the docs host restarted during the second, so it continues in epoch 2.
    [RUNNING_SESSION]: numbered(now, [[
      [9 * MINUTE, turn('started')],
      [9 * MINUTE, said('user', 'Tighten the reading column section of docs/design/console.md. Keep the 672px rule.')],
      [8 * MINUTE, said('agent', 'I will read the design note and the tokens first.')],
      [8 * MINUTE, tool('read', ['docs/design/console.md'])],
      [8 * MINUTE, tool('search', ['docs/design'])],
      [7 * MINUTE, tool('read', ['docs/design/notes/changelog.md'])],
      [6 * MINUTE, tool('edit', ['docs/design/console.md'])],
      [5 * MINUTE, said('agent', 'I shortened the reading column section and kept the 672px rule. The diff is ready.')],
      [5 * MINUTE, turn('ended')],
      [2 * MINUTE, said('user', 'Also name the 1.65 line height in the first sentence.')],
    ], [
      [MINUTE, turn('started')],
      [40_000, tool('read', ['docs/design/console.md'])],
      [20_000, tool('edit', ['docs/design/console.md'], 'started')],
    ]]),
    [REVIEW_SESSION]: numbered(now, [[
      [50 * MINUTE, turn('started')],
      [50 * MINUTE, said('user', 'Add a short note on how citations pick line numbers.')],
      [49 * MINUTE, tool('read', ['docs/README.md'])],
      [48 * MINUTE, tool('edit', ['docs/design/notes/citations.md', 'docs/README.md'])],
      [48 * MINUTE, tool('command', [], 'failed')],
      [47 * MINUTE, said('agent', 'I added docs/design/notes/citations.md and linked it from the README.')],
      [47 * MINUTE, turn('ended')],
    ]]),
    [PR_SESSION]: numbered(now, [[
      [5 * 60 * MINUTE, turn('started')],
      [5 * 60 * MINUTE, said('user', 'Fix the broken changelog link.')],
      [5 * 60 * MINUTE - 30_000, tool('edit', ['docs/README.md'])],
      [5 * 60 * MINUTE - 60_000, said('agent', 'The README now links docs/design/notes/changelog.md.')],
      [5 * 60 * MINUTE - 60_000, turn('ended')],
    ]]),
    [CLEANUP_SESSION]: numbered(now, [[
      [12 * MINUTE, turn('started')],
      [12 * MINUTE, tool('command', [])],
      [11 * MINUTE, tool('read', ['docs/archive'])],
      [10 * MINUTE, said('agent', 'I read 13 worktrees. Two are green, two need your call, and the rest stay.')],
      [10 * MINUTE, turn('ended')],
    ]]),
  };
}

const cursorOf = (events: readonly DocSessionEventV1[]) => events.length === 0 ? null : formatDocSessionCursor(events.at(-1)!);

function summary(now: number, events: Readonly<Record<string, readonly DocSessionEventV1[]>>): DocSessionSummaryV1[] {
  return [
    { session_id: RUNNING_SESSION, title: 'Tighten the reading column', repository_id: HARNESS_ID, runtime: 'codex', agent: 'running', outcome: null,
      last_activity_at: at(now, 20_000), last_event: cursorOf(events[RUNNING_SESSION]!) },
    { session_id: REVIEW_SESSION, title: 'Explain citation line numbers', repository_id: HARNESS_ID, runtime: 'claude', agent: 'idle', outcome: null,
      last_activity_at: at(now, 47 * MINUTE), last_event: cursorOf(events[REVIEW_SESSION]!) },
    { session_id: PR_SESSION, title: 'Fix the changelog link', repository_id: HARNESS_ID, runtime: 'codex', agent: 'stopped', outcome: 'pr_open',
      last_activity_at: at(now, 4 * 60 * MINUTE), last_event: cursorOf(events[PR_SESSION]!) },
  ];
}

const PAGE = 5;

function eventsPage(sessionId: string, after: string | null, all: readonly DocSessionEventV1[]): SessionWireAnswer {
  const floor = after === null ? null : parseDocSessionCursor(after)!;
  const rest = floor === null ? all : all.filter(event => compareDocSessionCursor(event, floor) > 0);
  const events = rest.slice(0, PAGE);
  return ok({
    protocol: 1, kind: 'operator_docs_session_events', session_id: sessionId, after, events,
    next_cursor: events.length > 0 ? formatDocSessionCursor(events.at(-1)!) : after, complete: rest.length <= PAGE, activity: docSessionActivity(all),
  });
}

const DIFF_PATCH = `diff --git a/docs/design/console.md b/docs/design/console.md
--- a/docs/design/console.md
+++ b/docs/design/console.md
@@ -3,3 +3,3 @@
 ## Reading column

-Document text sits in a 672px column at 16px with a 1.65 line height. Headings use the display face.
+Text sits in a 672px column at 16px with a 1.65 line height. Headings use the display face.
diff --git a/docs/design/notes/citations.md b/docs/design/notes/citations.md
new file mode 100644
--- /dev/null
+++ b/docs/design/notes/citations.md
@@ -0,0 +1,3 @@
+# Citations
+
+A citation names whole lines of one file at one commit.
`;

/** A delivered session's changes are in its commit; the others are still in the working tree. */
function diff(now: number, sessionId: string, turnState: 'running' | 'idle', delivered: boolean): SessionWireAnswer {
  return ok({
    protocol: 1, kind: 'operator_docs_session_diff', session_id: sessionId, base_commit: BASE_COMMIT, head_commit: delivered ? PR_COMMIT : BASE_COMMIT, turn: turnState,
    files: [
      { path: 'docs/design/console.md', status: 'modified', tracked: true, binary: false },
      { path: 'docs/design/notes/citations.md', status: 'added', tracked: false, binary: false },
    ],
    patch: DIFF_PATCH, diff_sha256: '9f2b6d0e4a8c1f5b3d7e9a2c4f6b8d0e1a3c5e7f9b2d4f6a8c0e2b4d6f8a0c2e', observed_at: at(now, 15_000),
  });
}

function loss(now: number, sessionId: string, turnState: 'running' | 'idle', pushed: boolean): SessionWireAnswer {
  return ok({
    protocol: 1, kind: 'operator_docs_session_loss', session_id: sessionId, head_commit: pushed ? PR_COMMIT : BASE_COMMIT, turn: turnState,
    files: pushed ? [] : [
      { path: 'docs/design/console.md', status: 'modified', tracked: true },
      { path: 'docs/design/notes/citations.md', status: 'added', tracked: false },
    ],
    ignored: pushed ? [] : ['docs/.cache/'], commits: [], pushed,
    loss_sha256: '1e5a9c3f7b0d4e8a2c6f1b5d9e3a7c0f4b8d2e6a1c5f9b3d7e0a4c8f2b6d1e5a', observed_at: at(now, 15_000),
  });
}

const DONE_DELIVERY = (number: number) => ({
  steps: [{ step: 'commit', state: 'done' }, { step: 'push', state: 'done' }, { step: 'pull_request', state: 'done' }],
  commit: PR_COMMIT, pull_request: PULL(number),
});

function detail(now: number, row: DocSessionSummaryV1): SessionWireAnswer {
  const { last_event: _, ...fields } = row;
  return ok({
    protocol: 1, kind: 'operator_docs_session_detail', ...fields,
    branch: `docs/${row.title.toLowerCase().replaceAll(' ', '-')}`, worktree: `repo-harness-wt-docs-${row.session_id.slice(0, 8)}`, base_commit: BASE_COMMIT,
    steer: row.runtime === 'codex' ? 'supported' : 'unsupported',
    citations: [{ path: 'docs/design/console.md', start_line: 3, end_line: 5, relocated: row.session_id === REVIEW_SESSION }],
    delivery: row.outcome === 'pr_open' ? DONE_DELIVERY(1188) : null,
    observed_at: at(now, 10_000),
  });
}

/** Every doc session and cleanup session route the page reads and writes, for one fixture. */
export function docSessionFixture(now: number, fixture: DocSessionFixtureName, worktrees: WorktreesSnapshot): Partial<OperatorAppProps> {
  const events = fixture === 'busy' ? { ...sessionEvents(now) } : {};
  const sessions = fixture === 'busy' ? summary(now, events) : [];
  const rows = new Map(allWorktrees(worktrees).map(row => [row.id, row]));
  const live = fixture !== 'degraded';
  const find = (sessionId: string) => sessions.find(row => row.session_id === sessionId);
  const route = (answer: () => SessionWireAnswer): Response => json(live ? answer() : NO_ROUTE);
  const write = (answer: () => SessionWireAnswer) => Promise.resolve(route(answer));
  const update = (sessionId: string, change: Partial<DocSessionSummaryV1>) => {
    const index = sessions.findIndex(row => row.session_id === sessionId);
    if (index >= 0) sessions[index] = { ...sessions[index]!, ...change, last_activity_at: new Date().toISOString() };
  };
  let created = 0;
  return {
    readDocSessions: (): Promise<DocSessionsRead> => docSessionsAnswer(route(() => ok({
      protocol: 1, kind: 'operator_docs_sessions', kinds: ['docs', 'worktree_cleanup'], sessions: [...sessions], observed_at: new Date().toISOString(),
    }))),
    readDocSession: sessionId => sessionReadAnswer(route(() => {
      const row = find(sessionId);
      return row === undefined ? NOT_FOUND : detail(now, row);
    }), value => decodeOperatorDocSessionDetail(value, sessionId)),
    readDocSessionEvents: (sessionId, after) => sessionReadAnswer(route(() => {
      const list = events[sessionId];
      return list === undefined && find(sessionId) === undefined ? NOT_FOUND : eventsPage(sessionId, after, list ?? []);
    }), value => decodeOperatorDocSessionEvents(value, sessionId, after)),
    readDocSessionDiff: sessionId => sessionReadAnswer(route(() => {
      const row = find(sessionId);
      return row === undefined ? NOT_FOUND : diff(now, sessionId, row.agent === 'running' ? 'running' : 'idle', row.outcome === 'pr_open');
    }), value => decodeOperatorDocSessionDiff(value, { session_id: sessionId })),
    readDocSessionLoss: sessionId => sessionReadAnswer(route(() => {
      const row = find(sessionId);
      return row === undefined ? NOT_FOUND : loss(now, sessionId, row.agent === 'running' ? 'running' : 'idle', row.outcome === 'pr_open');
    }), value => decodeOperatorDocSessionLoss(value, { session_id: sessionId })),
    // A new session starts in the list and shows an empty record until its host writes one.
    writeDocSessionCreate: body => write(() => {
      created += 1;
      const sessionId = `e${String(created).padStart(7, '0')}`.repeat(4);
      sessions.unshift({ session_id: sessionId, title: body.instruction.split('\n')[0]!.slice(0, 120), repository_id: body.repository_id, runtime: body.runtime,
        agent: 'starting', outcome: null, last_activity_at: new Date().toISOString(), last_event: null });
      return { status: 201, body: {
        protocol: 1, kind: 'operator_docs_session', session_id: sessionId, state: 'created', repository_id: body.repository_id, runtime: body.runtime,
        branch: `docs/session-${created}`, worktree: `repo-harness-wt-docs-session-${created}`, base_commit: BASE_COMMIT,
        citations: body.citations.map(citation => ({ path: citation.path, start_line: citation.start_line, end_line: citation.end_line, relocated: false })),
      } };
    }).then(response => sessionWriteAnswer(response, decodeOperatorDocSessionCreated)),
    writeDocSessionMessage: (sessionId, body) => write(() => ok({
      protocol: 1, kind: 'operator_docs_session_message', session_id: sessionId,
      landed: find(sessionId)?.agent !== 'running' ? 'prompted' : body.when === 'now' ? 'steered' : 'queued',
    })).then(response => sessionWriteAnswer(response, value => decodeOperatorDocSessionMessage(value, sessionId))),
    writeDocSessionStop: sessionId => write(() => ok({ protocol: 1, kind: 'operator_docs_session_stop', session_id: sessionId, result: 'aborting' }))
      .then(response => sessionWriteAnswer(response, value => decodeOperatorDocSessionStop(value, sessionId))),
    writeDocSessionCommit: sessionId => write(() => {
      update(sessionId, { agent: 'stopped', outcome: 'pr_open' });
      return ok({ protocol: 1, kind: 'operator_docs_session_commit', session_id: sessionId, delivery: DONE_DELIVERY(1201) });
    }).then(response => sessionWriteAnswer(response, value => decodeOperatorDocSessionCommit(value, sessionId))),
    writeDocSessionDiscard: sessionId => write(() => {
      update(sessionId, { agent: 'stopped', outcome: 'discarded' });
      return ok({ protocol: 1, kind: 'operator_docs_session_discard', session_id: sessionId, outcome: 'discarded' });
    }).then(response => sessionWriteAnswer(response, value => decodeOperatorDocSessionDiscard(value, sessionId))),
    readCleanupPlan: sessionId => sessionReadAnswer(route(() => sessionId === CLEANUP_SESSION && fixture === 'busy' ? ok(cleanupPlan(now, worktrees)) : NOT_FOUND),
      value => decodeOperatorCleanupPlan(value, sessionId)),
    writeCleanupSessionCreate: () => write(() => ({ status: 201, body: { protocol: 1, kind: 'operator_worktree_cleanup_session_created', session_id: CLEANUP_SESSION } }))
      .then(response => sessionWriteAnswer(response, decodeOperatorCleanupSessionCreated)),
    // Archives every approved yellow item to one Draft PR, then removes every requested item.
    writeCleanupSession: body => write(() => ok({
      protocol: 1, kind: 'operator_worktree_cleanup_session', session_id: body.session_id,
      archive: body.approvals.length > 0 ? { state: 'done', failed_step: null, pull_request: PULL(1210) } : { state: 'not_needed', failed_step: null, pull_request: null },
      items: body.ids.map(id => {
        const row = rows.get(id)!;
        return { id, repository_id: row.repository_id, directory: row.directory, outcome: 'removed', reason: null };
      }),
    })).then(response => sessionWriteAnswer(response, value => decodeOperatorCleanupSessionResult(value, body.session_id))),
  };
}

const LOSS_SHA = (seed: string) => seed.repeat(64).slice(0, 64);

/** Two green items, a yellow one to archive and one to delete, and a red one with no delete entry. */
function cleanupPlan(now: number, worktrees: WorktreesSnapshot): unknown {
  const byDirectory = new Map(allWorktrees(worktrees).map(row => [row.directory, row]));
  const item = (directory: string, fields: Record<string, unknown>) => {
    const row = byDirectory.get(directory)!;
    return {
      id: row.id, repository_id: row.repository_id, directory, branch: row.branch, judgment: row.judgment,
      advice: null, reason: null, evidence: [], archive: null,
      loss: { unpushed_commits: row.unpushed_commits ?? 0, dirty_files: row.dirty_files ?? 0, ignored_entries: row.ignored_entries ?? 0 },
      loss_sha256: LOSS_SHA(row.id.slice(3, 5)), ...fields,
    };
  };
  return {
    protocol: 1, kind: 'operator_worktree_cleanup_plan', session_id: CLEANUP_SESSION, runtime: 'codex', agent: 'idle', state: 'ready', plan_sha256: PLAN_SHA,
    items: [
      item('feat-kanban-status', { evidence: ['PR #606 merged into main'] }),
      item('operator-site-wt-footer', {}),
      item('repo-harness-wt-oar', {
        advice: 'archive_then_delete', reason: 'PR #602 was closed without a merge; its notes under docs/ are worth keeping.',
        evidence: ['PR #602 closed, not merged', 'docs/notes/oar-0-45.md is only on this branch'],
        archive: { branch: 'docs/archive-oar-0-45', private_directory: null },
      }),
      item('repo-harness-wt-docs-cleanup', {
        advice: 'delete', reason: 'Its branch is in main and its task ended a day ago; only the lock keeps it.',
        evidence: ['docs/feynman is an ancestor of main', 'task run closed'],
      }),
      item('repo-harness-wt-kanban-redesign', {}),
    ],
    observed_at: at(now, 30_000),
  };
}
