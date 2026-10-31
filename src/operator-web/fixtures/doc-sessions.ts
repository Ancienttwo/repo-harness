// Development fixtures for the doc session and cleanup session routes. Each
// answer is the route's wire body and HTTP status, and goes through the
// browser's own answer handling, so a 200 body passes the same strict decoder
// the page applies. Paths are repository-relative; nothing names a host path,
// a command or a secret.
import {
  decodeCleanupPlanPreview,
  decodeOperatorCleanupSessionCreated,
  decodeOperatorDocSessionCreated,
  decodeOperatorDocSessionMessage,
  decodeOperatorDocSessionStop,
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
import { decodeDocSessionFinalizationView } from '../../core/operator/doc-session-finalization-view';
import { decodeOperatorDocSessionDetail, docSessionUnread, type DocSessionSummary } from '../../core/operator/doc-session-views';
import type { CleanupAdvice, CleanupPlanItem } from '../../core/operator/worktree-cleanup-plan';
import type { WorktreesSnapshot } from '../../core/operator/worktrees';
import type { OperatorAppProps } from '../App';
import { docSessionsAnswer, finalizeWriteAnswer, sessionReadAnswer, sessionWriteAnswer, type DocSessionProgress } from '../doc-sessions';
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
const PULL = (number: number) => ({ number, url: `https://github.com/Ancienttwo/repo-harness/pull/${number}` });
const REPOSITORY_NAME = 'repo-harness';

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
      [10 * MINUTE, said('agent', 'I read the worktrees. Two are green, two need your call, and one stays.')],
      [10 * MINUTE, turn('ended')],
    ]]),
  };
}

const cursorOf = (events: readonly DocSessionEventV1[] | undefined) => events === undefined || events.length === 0 ? null : formatDocSessionCursor(events.at(-1)!);

/** A summary without its `unread`, which the list route computes from each request's `seen`. */
type Row = Omit<DocSessionSummary, 'unread'>;

function rows(now: number, events: Readonly<Record<string, readonly DocSessionEventV1[]>>): Row[] {
  const row = (session_id: string, title: string, runtime: string, state: Row['state'], ago: number, created: number): Row => ({
    session_id, title, repository_id: HARNESS_ID, repository_name: REPOSITORY_NAME, runtime, state,
    created_at: at(now, created), last_activity_at: at(now, ago), last_cursor: cursorOf(events[session_id]),
  });
  return [
    row(RUNNING_SESSION, 'Tighten the reading column', 'codex', 'running', 20_000, 9 * MINUTE),
    row(REVIEW_SESSION, 'Explain citation line numbers', 'claude', 'idle', 47 * MINUTE, 50 * MINUTE),
    row(PR_SESSION, 'Fix the changelog link', 'codex', 'stopped', 4 * 60 * MINUTE, 5 * 60 * MINUTE),
  ];
}

const summary = (row: Row, seen: string | null): DocSessionSummary => ({ ...row, unread: docSessionUnread(row.last_cursor, seen) });

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

const delivered = (number: number): DocSessionProgress => ({ operation: 'commit', stage: 'complete', commit: PR_COMMIT, pushed: true, pr: PULL(number) });
const finalizeBody = (progress: DocSessionProgress) => ({ protocol: 1, kind: 'operator_docs_session_finalize', ...progress });

function detail(row: Row, seen: string | null, events: readonly DocSessionEventV1[] | undefined, headCommit: string): SessionWireAnswer {
  return ok({
    protocol: 1, kind: 'operator_docs_session', session: summary(row, seen),
    branch: `docs/${row.session_id.slice(0, 12)}`, worktree: `repo-harness-wt-docs-${row.session_id.slice(0, 12)}`,
    head_commit: headCommit, base_commit: BASE_COMMIT, epoch: events === undefined ? null : events.at(-1)!.epoch,
    turn: row.state === 'running' ? 'running' : 'idle',
  });
}

/** Every doc session and cleanup session route the page reads and writes, for one fixture. */
export function docSessionFixture(now: number, fixture: DocSessionFixtureName, worktrees: WorktreesSnapshot): Partial<OperatorAppProps> {
  const events: Record<string, readonly DocSessionEventV1[]> = fixture === 'busy' ? { ...sessionEvents(now) } : {};
  const sessions = fixture === 'busy' ? rows(now, events) : [];
  const progress = new Map<string, DocSessionProgress>(fixture === 'busy' ? [[PR_SESSION, delivered(1188)]] : []);
  const live = fixture !== 'degraded';
  const find = (sessionId: string) => sessions.find(row => row.session_id === sessionId);
  const route = (answer: () => SessionWireAnswer): Response => json(live ? answer() : NO_ROUTE);
  const write = (answer: () => SessionWireAnswer) => Promise.resolve(route(answer));
  const touch = (sessionId: string, change: Partial<Row>) => {
    const index = sessions.findIndex(row => row.session_id === sessionId);
    if (index >= 0) sessions[index] = { ...sessions[index]!, ...change, last_activity_at: new Date().toISOString() };
  };
  const headOf = (sessionId: string) => progress.get(sessionId)?.operation === 'commit' ? PR_COMMIT : BASE_COMMIT;
  let created = 0;
  return {
    readDocSessions: request => docSessionsAnswer(route(() => ok({
      protocol: 1, kind: 'operator_docs_sessions', sessions: sessions.map(row => summary(row, request.seen[row.session_id] ?? null)),
    })), request),
    readDocSession: request => sessionReadAnswer(route(() => {
      const row = find(request.session_id);
      return row === undefined ? NOT_FOUND : detail(row, request.seen, events[row.session_id], headOf(row.session_id));
    }), value => decodeOperatorDocSessionDetail(value, request)),
    readDocSessionEvents: (sessionId, after) => sessionReadAnswer(route(() => {
      const list = events[sessionId];
      return list === undefined && find(sessionId) === undefined ? NOT_FOUND : eventsPage(sessionId, after, list ?? []);
    }), value => decodeOperatorDocSessionEvents(value, sessionId, after)),
    readDocSessionDiff: sessionId => sessionReadAnswer(route(() => {
      const row = find(sessionId);
      return row === undefined ? NOT_FOUND : diff(now, sessionId, row.state === 'running' ? 'running' : 'idle', headOf(sessionId) === PR_COMMIT);
    }), value => decodeOperatorDocSessionDiff(value, { session_id: sessionId })),
    readDocSessionLoss: sessionId => sessionReadAnswer(route(() => {
      const row = find(sessionId);
      return row === undefined ? NOT_FOUND : loss(now, sessionId, row.state === 'running' ? 'running' : 'idle', headOf(sessionId) === PR_COMMIT);
    }), value => decodeOperatorDocSessionLoss(value, { session_id: sessionId })),
    readDocSessionFinalization: sessionId => sessionReadAnswer(route(() => {
      if (find(sessionId) === undefined) return NOT_FOUND;
      const saved = progress.get(sessionId);
      return ok({ protocol: 1, kind: 'operator_docs_session_finalization_state', session_id: sessionId, progress: saved === undefined ? null : finalizeBody(saved) });
    }), value => decodeDocSessionFinalizationView(value, { session_id: sessionId })),
    // A new session starts in the list and shows an empty record until its host writes one.
    writeDocSessionCreate: body => write(() => {
      created += 1;
      const sessionId = `e${String(created).padStart(7, '0')}`.repeat(4);
      sessions.unshift({ session_id: sessionId, title: body.instruction.split('\n')[0]!.slice(0, 120), repository_id: body.repository_id,
        repository_name: REPOSITORY_NAME, runtime: body.runtime, state: 'starting', created_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(), last_cursor: null });
      return { status: 201, body: {
        protocol: 1, kind: 'operator_docs_session', session_id: sessionId, state: 'created', repository_id: body.repository_id, runtime: body.runtime,
        branch: `docs/${sessionId.slice(0, 12)}`, worktree: `repo-harness-wt-docs-${sessionId.slice(0, 12)}`, base_commit: BASE_COMMIT,
        citations: body.citations.map(citation => ({ path: citation.path, start_line: citation.start_line, end_line: citation.end_line, relocated: false })),
        agent: 'starting',
      } };
    }).then(response => sessionWriteAnswer(response, decodeOperatorDocSessionCreated)),
    writeDocSessionMessage: (sessionId, body) => write(() => ({ status: 202, body: {
      protocol: 1, kind: 'operator_docs_session_message', session_id: sessionId,
      landed: find(sessionId)?.state !== 'running' ? 'prompted' : body.when === 'now' ? 'steered' : 'queued',
    } })).then(response => sessionWriteAnswer(response, value => decodeOperatorDocSessionMessage(value, sessionId))),
    writeDocSessionStop: sessionId => write(() => ({ status: 202, body: { protocol: 1, kind: 'operator_docs_session_stop', session_id: sessionId, result: 'aborting' } }))
      .then(response => sessionWriteAnswer(response, value => decodeOperatorDocSessionStop(value, sessionId))),
    // The commit route answers the outcome; the page reads it back from /finalization.
    writeDocSessionCommit: sessionId => write(() => {
      const done = delivered(1201);
      progress.set(sessionId, done);
      touch(sessionId, { state: 'stopped' });
      return ok(finalizeBody(done));
    }).then(finalizeWriteAnswer),
    writeDocSessionDiscard: sessionId => write(() => {
      const done: DocSessionProgress = { operation: 'discard', stage: 'complete' };
      progress.set(sessionId, done);
      touch(sessionId, { state: 'stopped' });
      return ok(finalizeBody(done));
    }).then(finalizeWriteAnswer),
    readCleanupPlan: sessionId => sessionReadAnswer(route(() => sessionId === CLEANUP_SESSION && fixture === 'busy' ? ok(cleanupPreview(now, worktrees)) : NOT_FOUND),
      value => decodeCleanupPlanPreview(value, { session_id: sessionId })),
    writeCleanupSessionCreate: () => write(() => ({ status: 201, body: { protocol: 1, kind: 'operator_worktree_cleanup_session_created', session_id: CLEANUP_SESSION } }))
      .then(response => sessionWriteAnswer(response, decodeOperatorCleanupSessionCreated)),
  };
}

const digest = (seed: string) => seed.repeat(64).slice(0, 64);
const NO_ARCHIVE: CleanupAdvice['archive'] = { git: null, private: null };

/**
 * Two green items, a yellow one to archive and one to delete, and a red one.
 * The server observes no loss for a red item, so it has none.
 */
function cleanupPreview(now: number, worktrees: WorktreesSnapshot): unknown {
  const byDirectory = new Map(allWorktrees(worktrees).map(row => [row.directory, row]));
  const item = (directory: string, advice: CleanupAdvice, loss: CleanupPlanItem['loss'], seed: string): CleanupPlanItem => ({
    worktree: byDirectory.get(directory)!, advice, loss, loss_sha256: loss === null ? null : digest(seed), plan_sha256: digest(`${seed}f`),
  });
  const nothing = { files: [], ignored: [], commits: [] };
  return {
    protocol: 1, kind: 'operator_worktree_cleanup_preview', session_id: CLEANUP_SESSION, runtime: 'codex', state: 'ready', agent: 'idle',
    observed_at: at(now, 30_000),
    plan: { protocol: 1, kind: 'operator_worktree_cleanup_plan', session_id: CLEANUP_SESSION, items: [
      item('feat-kanban-status', { recommendation: 'delete', reason: 'Its PR merged into main.', evidence: ['PR #606 merged into main'], archive: NO_ARCHIVE }, nothing, '1'),
      item('operator-site-wt-footer', { recommendation: 'delete', reason: 'Its branch is absorbed into main.', evidence: ['fix/footer is absorbed into main'], archive: NO_ARCHIVE }, nothing, '2'),
      item('repo-harness-wt-oar', {
        recommendation: 'archive_then_delete', reason: 'PR #602 was closed without a merge; its notes under docs/ are worth keeping.',
        evidence: ['PR #602 closed, not merged', 'docs/notes/oar-0-45.md is only on this branch'],
        archive: { git: { directory: 'docs/archive/2026-10-30-oar-0-45', branch: 'docs/archive-oar-0-45', paths: ['docs/notes/oar-0-45.md'], include_commits: true }, private: null },
      }, { files: ['docs/notes/oar-0-45.md'], ignored: ['node_modules/'], commits: [PR_COMMIT] }, '3'),
      item('repo-harness-wt-docs-cleanup', {
        recommendation: 'delete', reason: 'Its branch is in main; only the lock keeps it.',
        evidence: ['docs/feynman is an ancestor of main', 'task run closed'], archive: NO_ARCHIVE,
      }, nothing, '4'),
      item('repo-harness-wt-kanban-redesign', {
        recommendation: 'keep', reason: 'Two processes still use it and it has unpushed commits.', evidence: ['2 processes in the worktree'], archive: NO_ARCHIVE,
      }, null, '5'),
    ] },
    execution: { enabled: false, code: 'cleanup_execution_unavailable' },
  };
}
