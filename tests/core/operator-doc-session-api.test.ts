import { describe, expect, test } from 'bun:test';

import {
  decodeCleanupPlanPreview,
  decodeDocSessionRefusal,
  decodeOperatorCleanupSessionCreated,
  decodeOperatorDocSessionCreated,
  decodeOperatorDocSessionMessage,
  decodeOperatorDocSessionStop,
  docSessionFinalizeRefusal,
} from '../../src/core/operator/doc-session-api';

const SID = 'ab'.repeat(16);
const OTHER = 'cd'.repeat(16);
const OID = '1f'.repeat(20);
const SHA = '9e'.repeat(32);
const AT = '2026-10-30T08:00:00.000Z';
const REPO = 'repo_a5b76eee64af71c3';

const citation = { path: 'docs/a.md', start_line: 3, end_line: 5, relocated: false };
const created = { protocol: 1, kind: 'operator_docs_session', session_id: SID, state: 'created', repository_id: REPO, runtime: 'codex',
  branch: `docs/${SID.slice(0, 12)}`, worktree: `repo-harness-wt-docs-${SID.slice(0, 12)}`, base_commit: OID, citations: [citation], agent: 'starting' };

const refuses = (decode: () => unknown) => expect(decode).toThrow();

describe('doc session wire decoders without a core module on main', () => {
  test('accept the create, message and stop bodies', () => {
    expect(decodeOperatorDocSessionCreated(created).citations).toEqual([citation]);
    for (const agent of ['starting', 'running', 'idle', 'stopped', 'failed'] as const) expect(decodeOperatorDocSessionCreated({ ...created, agent }).agent).toBe(agent);
    expect(decodeOperatorDocSessionMessage({ protocol: 1, kind: 'operator_docs_session_message', session_id: SID, landed: 'steered' }, SID).landed).toBe('steered');
    expect(decodeOperatorDocSessionStop({ protocol: 1, kind: 'operator_docs_session_stop', session_id: SID, result: 'aborting' }, SID).result).toBe('aborting');
  });

  test('refuse unknown keys and cross-field mismatches', () => {
    refuses(() => decodeOperatorDocSessionCreated({ ...created, worktree_path: 'x' }));
    refuses(() => decodeOperatorDocSessionCreated({ ...created, citations: [{ ...citation, range_sha256: SHA }] }));
    refuses(() => decodeOperatorDocSessionCreated({ ...created, citations: [{ ...citation, start_line: 6 }] }));
    refuses(() => decodeOperatorDocSessionCreated({ ...created, citations: [{ ...citation, path: '/etc/passwd' }] }));
    // The create body carries the agent state that the server started; a missing or unknown one is not the contract.
    refuses(() => decodeOperatorDocSessionCreated({ ...created, agent: 'paused' }));
    refuses(() => decodeOperatorDocSessionCreated(Object.fromEntries(Object.entries(created).filter(([key]) => key !== 'agent'))));
    refuses(() => decodeOperatorDocSessionMessage({ protocol: 1, kind: 'operator_docs_session_message', session_id: SID, landed: 'queued' }, OTHER));
    refuses(() => decodeOperatorDocSessionMessage({ protocol: 1, kind: 'operator_docs_session_message', session_id: SID, landed: 'steer_unsupported' }, SID));
    refuses(() => decodeOperatorDocSessionStop({ protocol: 1, kind: 'operator_docs_session_stop', session_id: SID, result: 'aborting', turn: 4 }, SID));
  });

  test('a refusal keeps files only for the scope refusals', () => {
    expect(decodeDocSessionRefusal({ error: { code: 'busy', message: 'm', next_action: 'n' } })).toEqual({ code: 'busy', message: 'm', next_action: 'n', files: [] });
    expect(decodeDocSessionRefusal({ error: { code: 'path_outside_scope', message: 'm', next_action: 'n', files: ['src/a.ts'] } })?.files).toEqual(['src/a.ts']);
    expect(decodeDocSessionRefusal({ error: { code: 'busy', message: 'm', next_action: 'n', files: ['src/a.ts'] } })).toBeNull();
    expect(decodeDocSessionRefusal({ error: { code: 'generated_region', message: 'm', next_action: 'n', files: ['/abs/a.md'] } })).toBeNull();
    expect(decodeDocSessionRefusal({ error: { code: 'generated_region', message: 'm', next_action: 'n', files: [] } })).toBeNull();
    // `paths` is not the field the commit route sends.
    expect(decodeDocSessionRefusal({ error: { code: 'path_outside_scope', message: 'm', next_action: 'n', paths: ['src/a.ts'] } })).toBeNull();
    expect(decodeDocSessionRefusal({ code: 'busy' })).toBeNull();
    expect(decodeDocSessionRefusal({ error: { code: 'busy', message: 'm', next_action: 'n' }, extra: true })).toBeNull();
  });

  test('a 503 finalize outcome yields its error; any other body falls back to the refusal envelope', () => {
    const outcome = { protocol: 1, kind: 'operator_docs_session_finalize', operation: 'commit', stage: 'pr_failed', commit: OID, pushed: true, pr: null };
    const error = { code: 'pr_create_failed', message: 'pr_create_failed', next_action: 'Retry the same session action with a new request_id and unchanged fields.' };
    expect(docSessionFinalizeRefusal({ ...outcome, error })).toEqual({ ...error, files: [] });
    expect(docSessionFinalizeRefusal({ error: { code: 'finalization_conflict', message: 'm', next_action: 'n' } })?.code).toBe('finalization_conflict');
    expect(docSessionFinalizeRefusal(outcome)).toBeNull();
    expect(docSessionFinalizeRefusal({ ...outcome, kind: 'operator_docs_session_commit', error })).toBeNull();
    expect(docSessionFinalizeRefusal({ ...outcome, error: { code: 'pr_create_failed' } })).toBeNull();
  });
});

const WT = `wt_${'1b'.repeat(32)}`;
const row = {
  id: WT, repository_id: REPO, directory: 'feat-kanban-status', branch: 'feat/kanban-status', source: 'contract', judgment: 'green', reasons: [],
  size_bytes: null, size_observed_at: null, process_count: 0, dirty_files: 0, ignored_entries: 0, unpushed_commits: 0, merge: 'provider', record: null,
};
const plan = { protocol: 1, kind: 'operator_worktree_cleanup_plan', session_id: SID, items: [{
  worktree: row, advice: { recommendation: 'delete', reason: 'Merged.', evidence: ['PR #606 merged'], archive: { git: null, private: null } },
  loss: { files: [], ignored: [], commits: [] }, loss_sha256: SHA, plan_sha256: SHA,
}] };
const preview = { protocol: 1, kind: 'operator_worktree_cleanup_preview', session_id: SID, runtime: 'codex', state: 'ready', agent: 'idle',
  observed_at: AT, plan, execution: { enabled: false, code: 'cleanup_execution_unavailable' } };

describe('worktree cleanup session wire decoders', () => {
  test('accept the creation and the plan preview', () => {
    expect(decodeOperatorCleanupSessionCreated({ protocol: 1, kind: 'operator_worktree_cleanup_session_created', session_id: SID }).session_id).toBe(SID);
    expect(decodeCleanupPlanPreview(preview, { session_id: SID }).plan?.items[0]!.worktree.id).toBe(WT);
    expect(decodeCleanupPlanPreview({ ...preview, state: 'investigating', agent: 'running', plan: null }, { session_id: SID }).plan).toBeNull();
    expect(decodeCleanupPlanPreview({ ...preview, state: 'unavailable', agent: null, plan: null }, { session_id: SID }).state).toBe('unavailable');
  });

  test('refuse unknown keys, another session and an execution the server did not declare', () => {
    refuses(() => decodeOperatorCleanupSessionCreated({ protocol: 1, kind: 'operator_worktree_cleanup_session_created', session_id: SID, runtime: 'codex' }));
    refuses(() => decodeOperatorCleanupSessionCreated({ protocol: 1, kind: 'operator_worktree_cleanup_session_created', session_id: 'abc' }));
    refuses(() => decodeCleanupPlanPreview({ ...preview, kinds: [] }, { session_id: SID }));
    refuses(() => decodeCleanupPlanPreview(preview, { session_id: OTHER }));
    refuses(() => decodeCleanupPlanPreview({ ...preview, plan: { ...plan, session_id: OTHER } }, { session_id: SID }));
    refuses(() => decodeCleanupPlanPreview({ ...preview, execution: { enabled: true, code: 'cleanup_execution_unavailable' } }, { session_id: SID }));
    refuses(() => decodeCleanupPlanPreview({ ...preview, runtime: 'claude' }, { session_id: SID }));
    // A plan exists exactly when the state is ready.
    refuses(() => decodeCleanupPlanPreview({ ...preview, plan: null }, { session_id: SID }));
    refuses(() => decodeCleanupPlanPreview({ ...preview, state: 'investigating' }, { session_id: SID }));
  });
});
