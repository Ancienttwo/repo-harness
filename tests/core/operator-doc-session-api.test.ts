import { describe, expect, test } from 'bun:test';

import {
  decodeDocSessionRefusal,
  decodeOperatorDocSessionCommit,
  decodeOperatorDocSessionCreated,
  decodeOperatorDocSessionDetail,
  decodeOperatorDocSessionDiscard,
  decodeOperatorDocSessionMessage,
  decodeOperatorDocSessions,
  decodeOperatorDocSessionStop,
} from '../../src/core/operator/doc-session-api';
import {
  decodeOperatorCleanupPlan,
  decodeOperatorCleanupSessionCreated,
  decodeOperatorCleanupSessionResult,
} from '../../src/core/operator/worktree-cleanup-plan';

const SID = 'ab'.repeat(16);
const OTHER = 'cd'.repeat(16);
const OID = '1f'.repeat(20);
const SHA = '9e'.repeat(32);
const AT = '2026-10-30T08:00:00.000Z';
const WT = `wt_${'1b'.repeat(32)}`;
const WT_YELLOW = `wt_${'4e'.repeat(32)}`;
const REPO = 'repo_a5b76eee64af71c3';
const PR = { number: 12, url: 'https://github.com/acme/docs/pull/12' };
const DONE = { steps: [{ step: 'commit', state: 'done' }, { step: 'push', state: 'done' }, { step: 'pull_request', state: 'done' }], commit: OID, pull_request: PR };

const summary = { session_id: SID, title: 'Tighten the column', repository_id: REPO, runtime: 'codex', agent: 'running', outcome: null, last_activity_at: AT, last_event: '1.4' };
const list = { protocol: 1, kind: 'operator_docs_sessions', kinds: ['docs', 'worktree_cleanup'], sessions: [summary], observed_at: AT };
const citation = { path: 'docs/a.md', start_line: 3, end_line: 5, relocated: false };
const created = { protocol: 1, kind: 'operator_docs_session', session_id: SID, state: 'created', repository_id: REPO, runtime: 'codex',
  branch: 'docs/tighten', worktree: 'repo-harness-wt-docs-tighten', base_commit: OID, citations: [citation], agent: 'starting' };
const { last_event: _, ...detailSummary } = summary;
const detail = { protocol: 1, kind: 'operator_docs_session_detail', ...detailSummary, branch: 'docs/tighten', worktree: 'repo-harness-wt-docs-tighten',
  base_commit: OID, steer: 'supported', citations: [citation], delivery: null, observed_at: AT };

const refuses = (decode: () => unknown) => expect(decode).toThrow();

describe('doc session wire decoders', () => {
  test('accept the bodies the routes answer', () => {
    expect(decodeOperatorDocSessions(list).sessions[0]!.session_id).toBe(SID);
    expect(decodeOperatorDocSessions({ ...list, kinds: [], sessions: [] }).kinds).toEqual([]);
    expect(decodeOperatorDocSessionCreated(created).citations).toEqual([citation]);
    for (const agent of ['starting', 'running', 'idle', 'stopped', 'failed']) expect(decodeOperatorDocSessionCreated({ ...created, agent }).agent).toBe(agent);
    expect(decodeOperatorDocSessionDetail(detail, SID).steer).toBe('supported');
    expect(decodeOperatorDocSessionDetail({ ...detail, outcome: 'pr_open', delivery: DONE }, SID).delivery?.pull_request?.number).toBe(12);
    expect(decodeOperatorDocSessionMessage({ protocol: 1, kind: 'operator_docs_session_message', session_id: SID, landed: 'steered' }, SID).landed).toBe('steered');
    expect(decodeOperatorDocSessionStop({ protocol: 1, kind: 'operator_docs_session_stop', session_id: SID, result: 'aborting' }, SID).result).toBe('aborting');
    expect(decodeOperatorDocSessionCommit({ protocol: 1, kind: 'operator_docs_session_commit', session_id: SID, delivery: DONE }, SID).delivery.commit).toBe(OID);
    expect(decodeOperatorDocSessionDiscard({ protocol: 1, kind: 'operator_docs_session_discard', session_id: SID, outcome: 'discarded' }, SID).outcome).toBe('discarded');
  });

  test('refuse unknown keys at every level', () => {
    refuses(() => decodeOperatorDocSessions({ ...list, extra: 1 }));
    refuses(() => decodeOperatorDocSessions({ ...list, sessions: [{ ...summary, command: 'git status' }] }));
    refuses(() => decodeOperatorDocSessionCreated({ ...created, worktree_path: 'x' }));
    refuses(() => decodeOperatorDocSessionCreated({ ...created, citations: [{ ...citation, range_sha256: SHA }] }));
    refuses(() => decodeOperatorDocSessionDetail({ ...detail, last_event: '1.4' }, SID));
    refuses(() => decodeOperatorDocSessionCommit({ protocol: 1, kind: 'operator_docs_session_commit', session_id: SID, delivery: { ...DONE, output: 'pushed' } }, SID));
    refuses(() => decodeOperatorDocSessionStop({ protocol: 1, kind: 'operator_docs_session_stop', session_id: SID, result: 'aborting', turn: 4 }, SID));
  });

  test('enforce the cross-field rules', () => {
    // A response for another session, a duplicate session, a repeated kind, a cursor out of form.
    refuses(() => decodeOperatorDocSessionDetail(detail, OTHER));
    refuses(() => decodeOperatorDocSessionMessage({ protocol: 1, kind: 'operator_docs_session_message', session_id: SID, landed: 'queued' }, OTHER));
    refuses(() => decodeOperatorDocSessions({ ...list, sessions: [summary, summary] }));
    refuses(() => decodeOperatorDocSessions({ ...list, kinds: ['docs', 'docs'] }));
    refuses(() => decodeOperatorDocSessions({ ...list, kinds: ['coding'] }));
    refuses(() => decodeOperatorDocSessions({ ...list, sessions: [{ ...summary, last_event: '01.4' }] }));
    refuses(() => decodeOperatorDocSessions({ ...list, sessions: [{ ...summary, last_activity_at: '2026-10-30' }] }));
    refuses(() => decodeOperatorDocSessionCreated({ ...created, citations: [{ ...citation, start_line: 6 }] }));
    // The create body carries the agent state; a missing or unknown one is not the contract.
    refuses(() => decodeOperatorDocSessionCreated({ ...created, agent: 'paused' }));
    refuses(() => decodeOperatorDocSessionCreated(Object.fromEntries(Object.entries(created).filter(([key]) => key !== 'agent'))));
    refuses(() => decodeOperatorDocSessionCreated({ ...created, citations: [{ ...citation, path: '/etc/passwd' }] }));
    // Delivery steps run in order, and a PR link must name its own number.
    refuses(() => decodeOperatorDocSessionCommit({ protocol: 1, kind: 'operator_docs_session_commit', session_id: SID, delivery: { ...DONE, steps: [...DONE.steps].reverse() } }, SID));
    refuses(() => decodeOperatorDocSessionCommit({ protocol: 1, kind: 'operator_docs_session_commit', session_id: SID,
      delivery: { ...DONE, pull_request: { number: 13, url: PR.url } } }, SID));
    refuses(() => decodeOperatorDocSessionCommit({ protocol: 1, kind: 'operator_docs_session_commit', session_id: SID,
      delivery: { ...DONE, pull_request: { number: 12, url: 'https://example.com/acme/docs/pull/12' } } }, SID));
  });

  test('a refusal keeps paths only for the path refusals', () => {
    expect(decodeDocSessionRefusal({ error: { code: 'busy', message: 'm', next_action: 'n' } })).toEqual({ code: 'busy', message: 'm', next_action: 'n', paths: [] });
    expect(decodeDocSessionRefusal({ error: { code: 'path_outside_scope', message: 'm', next_action: 'n', paths: ['src/a.ts'] } })?.paths).toEqual(['src/a.ts']);
    expect(decodeDocSessionRefusal({ error: { code: 'busy', message: 'm', next_action: 'n', paths: ['src/a.ts'] } })).toBeNull();
    expect(decodeDocSessionRefusal({ error: { code: 'generated_region', message: 'm', next_action: 'n', paths: ['/abs/a.md'] } })).toBeNull();
    expect(decodeDocSessionRefusal({ error: { code: 'generated_region', message: 'm', next_action: 'n', paths: [] } })).toBeNull();
    expect(decodeDocSessionRefusal({ code: 'busy' })).toBeNull();
    expect(decodeDocSessionRefusal({ error: { code: 'busy', message: 'm', next_action: 'n' }, extra: true })).toBeNull();
  });
});

const item = (overrides: Record<string, unknown> = {}) => ({
  id: WT, repository_id: REPO, directory: 'feat-kanban-status', branch: 'feat/kanban-status', judgment: 'green', advice: null, reason: null,
  evidence: [], loss: { unpushed_commits: 0, dirty_files: 0, ignored_entries: 4 }, loss_sha256: SHA, archive: null, ...overrides,
});
const yellow = item({ id: WT_YELLOW, directory: 'repo-harness-wt-oar', judgment: 'yellow', advice: 'archive_then_delete', reason: 'Its notes are worth keeping.',
  archive: { branch: 'docs/archive-oar', private_directory: null } });
const plan = { protocol: 1, kind: 'operator_worktree_cleanup_plan', session_id: SID, runtime: 'codex', agent: 'idle', state: 'ready', plan_sha256: SHA, items: [item(), yellow], observed_at: AT };
const result = { protocol: 1, kind: 'operator_worktree_cleanup_session', session_id: SID,
  archive: { state: 'done', failed_step: null, pull_request: PR },
  items: [{ id: WT, repository_id: REPO, directory: 'feat-kanban-status', outcome: 'removed', reason: null },
    { id: WT_YELLOW, repository_id: REPO, directory: 'repo-harness-wt-oar', outcome: 'skipped', reason: 'reapproval_required' }] };

describe('worktree cleanup session wire decoders', () => {
  test('accept the plan, the creation and the result', () => {
    expect(decodeOperatorCleanupSessionCreated({ protocol: 1, kind: 'operator_worktree_cleanup_session_created', session_id: SID }).session_id).toBe(SID);
    expect(decodeOperatorCleanupPlan(plan, SID).items.map(entry => entry.judgment)).toEqual(['green', 'yellow']);
    expect(decodeOperatorCleanupPlan({ ...plan, state: 'investigating', plan_sha256: null, items: [] }, SID).state).toBe('investigating');
    expect(decodeOperatorCleanupSessionResult(result, SID).items[1]!.reason).toBe('reapproval_required');
    expect(decodeOperatorCleanupSessionResult({ ...result, archive: { state: 'failed', failed_step: 'push', pull_request: null } }, SID).archive.failed_step).toBe('push');
  });

  test('refuse unknown keys', () => {
    refuses(() => decodeOperatorCleanupSessionCreated({ protocol: 1, kind: 'operator_worktree_cleanup_session_created', session_id: SID, runtime: 'codex' }));
    refuses(() => decodeOperatorCleanupSessionCreated({ protocol: 1, kind: 'operator_worktree_cleanup_session_created', session_id: 'abc' }));
    refuses(() => decodeOperatorCleanupPlan({ ...plan, items: [item({ command: 'git worktree remove' })] }, SID));
    refuses(() => decodeOperatorCleanupPlan({ ...plan, items: [item({ loss: { unpushed_commits: 0, dirty_files: 0, ignored_entries: 4, bytes: 9 } })] }, SID));
    refuses(() => decodeOperatorCleanupSessionResult({ ...result, items: [{ ...result.items[0]!, path: 'x' }] }, SID));
  });

  test('enforce the cross-field rules', () => {
    refuses(() => decodeOperatorCleanupPlan(plan, OTHER));
    // The runtime names the agent in the record: it is required and must be a runtime id.
    expect(decodeOperatorCleanupPlan(plan, SID).runtime).toBe('codex');
    const { runtime: _, ...withoutRuntime } = plan;
    refuses(() => decodeOperatorCleanupPlan(withoutRuntime, SID));
    refuses(() => decodeOperatorCleanupPlan({ ...plan, runtime: 'Codex CLI' }, SID));
    // Only a yellow item carries advice; green follows the sweep rule and red has no delete entry.
    refuses(() => decodeOperatorCleanupPlan({ ...plan, items: [item({ advice: 'delete', reason: 'Merged.' })] }, SID));
    refuses(() => decodeOperatorCleanupPlan({ ...plan, items: [item({ judgment: 'yellow' })] }, SID));
    // An archive location belongs only to archive_then_delete, and that advice needs one.
    refuses(() => decodeOperatorCleanupPlan({ ...plan, items: [{ ...yellow, advice: 'delete' }] }, SID));
    refuses(() => decodeOperatorCleanupPlan({ ...plan, items: [{ ...yellow, archive: null }] }, SID));
    refuses(() => decodeOperatorCleanupPlan({ ...plan, items: [{ ...yellow, archive: { branch: 'feature/x', private_directory: null } }] }, SID));
    // The plan digest exists exactly when the agent handed the plan in.
    refuses(() => decodeOperatorCleanupPlan({ ...plan, plan_sha256: null }, SID));
    refuses(() => decodeOperatorCleanupPlan({ ...plan, state: 'investigating' }, SID));
    refuses(() => decodeOperatorCleanupPlan({ ...plan, items: [item(), item()] }, SID));
    // A failed archive names its step; a done archive has its PR; a removed item has no reason.
    refuses(() => decodeOperatorCleanupSessionResult({ ...result, archive: { state: 'failed', failed_step: null, pull_request: null } }, SID));
    refuses(() => decodeOperatorCleanupSessionResult({ ...result, archive: { state: 'done', failed_step: null, pull_request: null } }, SID));
    refuses(() => decodeOperatorCleanupSessionResult({ ...result, archive: { state: 'not_needed', failed_step: null, pull_request: PR } }, SID));
    refuses(() => decodeOperatorCleanupSessionResult({ ...result, items: [{ ...result.items[0]!, reason: 'changed' }] }, SID));
    refuses(() => decodeOperatorCleanupSessionResult({ ...result, items: [] }, SID));
    refuses(() => decodeOperatorCleanupSessionResult(result, OTHER));
  });
});
