import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync, spawnSync } from 'child_process';
import {
  consumePendingPostEditEvents,
  pendingPostEditJournalSection,
  readPendingPostEditEvents,
  runMutationObserved,
  type MutationObservedCollector,
  type PostEditJournalEvent,
} from '../src/cli/hook/mutation-observed';
import { GITIGNORE_MANAGED_BLOCK_CONTENT } from '../src/core/adoption/gitignore-plan';
import { hookIdentity } from './helpers/hook-identity';

// HRD-05 journal-schema + dirty-bit-derivation + crash-replay fixtures for
// the in-process mutation-observed handler that replaces
// post-edit-guard.sh + minimal-change-observer.sh. Every fixture calls
// `runMutationObserved()`/`consumePendingPostEditEvents()` directly -- no
// `bash`/subprocess script spawn for the handler itself -- so each dirty
// bit's derivation condition can be tested in isolation. See
// tasks/notes/20260720-1146-hrd-05-post-edit-event-journal.notes.md for the
// condition-by-condition table this file proves.

function git(cwd: string, args: readonly string[]): void {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function initRepo(cwd: string): void {
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'mutation-observed@example.com']);
  git(cwd, ['config', 'user.name', 'Mutation Observed Test']);
  writeFileSync(join(cwd, 'README.md'), '# fixture\n');
  git(cwd, ['add', '.']);
  const result = spawnSync('git', ['commit', '-m', 'seed'], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    },
  });
  if (result.status !== 0) throw new Error(result.stderr);
}

function tmpWorkspace(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
}

function collectorFor(repoRoot: string, activePlan: string | null = null): MutationObservedCollector {
  return {
    getRepoRoot: () => repoRoot,
    getWorktreeOwnership: () => ({ current: repoRoot, owner: null, ownedByCurrent: false }),
    getActivePlanMarker: () => activePlan,
  };
}

function editPayload(filePath: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { tool_input: { file_path: filePath }, ...extra };
}

function pendingEvents(cwd: string): readonly PostEditJournalEvent[] {
  return readPendingPostEditEvents(cwd);
}

function writeActivePlan(cwd: string, contractPath: string): string {
  const plan = 'plans/plan-20260720-0000-mutation-observed-fixture.md';
  mkdirSync(join(cwd, 'plans'), { recursive: true });
  writeFileSync(
    join(cwd, plan),
    [
      '# Plan: fixture',
      '',
      '> **Status**: Executing',
      `> **Task Contract**: ${contractPath}`,
      '',
    ].join('\n'),
  );
  mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/active-plan'), plan);
  writeFileSync(join(cwd, '.ai/harness/active-worktree'), `${cwd}\n`);
  return plan;
}

function writeContractWithExitCriteria(cwd: string, contractPath: string, targetPath: string): void {
  mkdirSync(join(cwd, 'tasks/contracts'), { recursive: true });
  writeFileSync(
    join(cwd, contractPath),
    [
      '# Contract',
      '',
      '> **Status**: Pending',
      '',
      '```yaml',
      'exit_criteria:',
      '  files_exist:',
      `    - ${targetPath}`,
      '```',
      '',
      '## Verification Plan',
      '',
      '```json',
      '{"protocol":1,"checks":[]}',
      '```',
      '',
    ].join('\n'),
  );
}

describe('mutation-observed: non-qualifying edits', () => {
  test('a payload with no resolvable file path writes no journal event', () => {
    const cwd = tmpWorkspace('mo-non-qualifying');
    try {
      initRepo(cwd);
      const result = runMutationObserved({ collector: collectorFor(cwd), payload: {}, identity: hookIdentity() });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(pendingEvents(cwd)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('an out-of-repository absolute path writes no journal event', () => {
    const cwd = tmpWorkspace('mo-out-of-repo');
    const outside = tmpWorkspace('mo-outside');
    try {
      initRepo(cwd);
      mkdirSync(join(outside, 'plans'), { recursive: true });
      writeFileSync(join(outside, 'plans', 'session-plan.md'), '# host-side plan\n');
      const result = runMutationObserved({
        collector: collectorFor(cwd),
        payload: editPayload(join(outside, 'plans', 'session-plan.md')),
        identity: hookIdentity(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(pendingEvents(cwd)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  }, 30_000);

  test('a traversal-escaping relative path writes no journal event', () => {
    const cwd = tmpWorkspace('mo-traversal-escape');
    try {
      initRepo(cwd);
      const result = runMutationObserved({
        collector: collectorFor(cwd),
        payload: editPayload('../escaped.md'),
        identity: hookIdentity(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(pendingEvents(cwd)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('mutation-observed: journal schema', () => {
  test('a qualifying edit writes exactly one change_observed event with subject_revision', () => {
    const cwd = tmpWorkspace('mo-schema');
    try {
      initRepo(cwd);
      const result = runMutationObserved({
        collector: collectorFor(cwd),
        payload: editPayload('src/example.ts'),
        identity: hookIdentity({ sessionId: 'session-a' }),
      });
      expect(result.exitCode).toBe(0);

      const events = pendingEvents(cwd);
      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.schema).toBe('change_observed');
      expect(event.schema_version).toBe(2);
      expect(event.source_key).toMatch(/^[a-f0-9]{20}$/);
      expect(event.session_id).toBe('session-a');
      expect(event.changed_paths).toEqual(['src/example.ts']);
      expect(event.subject_revision).toMatch(/^[0-9a-f]{12}$/);
      expect(typeof event.event_id).toBe('string');
      expect(event.event_id.length).toBeGreaterThan(0);
      expect(new Date(event.created_at).toString()).not.toBe('Invalid Date');
      expect(event.updated_at).toBe(event.created_at);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('mutation-observed: dirty-bit derivation', () => {
  test('a new event carries only the minimal-change bit; no capability or architecture datum', () => {
    const cwd = tmpWorkspace('mo-arch-bits');
    try {
      initRepo(cwd);
      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/unrelated.ts'), identity: hookIdentity() });
      const [event] = pendingEvents(cwd);
      // minimal-change is the only bit with a reader. The journal does not see
      // Bash or apply_patch writes, so it carries no capability or
      // architecture datum for any consumer to read.
      expect(Object.keys(event.dirty)).toEqual(['minimal-change']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('a codex apply_patch PostToolUse payload stays a clean no-op', () => {
    const cwd = tmpWorkspace('mo-apply-patch');
    try {
      initRepo(cwd);
      // Codex 0.147.0 apply_patch reaches this route but carries its targets
      // inside `tool_input.command`, which this single-path handler does not
      // expand. That blindness is why the architecture changed set moved to
      // git; the remaining journal bits are Claude Edit/Write-shaped, so the
      // payload must stay a no-op rather than grow a second path extractor.
      const result = runMutationObserved({
        collector: collectorFor(cwd),
        payload: {
          session_id: 'codex-fleet-session',
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            command: [
              '*** Begin Patch',
              '*** Update File: src/broker.ts',
              '@@',
              '-const value = 1;',
              '+const value = 2;',
              '*** Add File: packages/cloud-postgres/src/index.ts',
              '+export const added = true;',
              '*** End Patch',
              '',
            ].join('\n'),
          },
        },
        identity: hookIdentity({ host: 'codex', sessionId: 'codex-fleet-session' }),
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(pendingEvents(cwd)).toEqual([]);
      expect(existsSync(join(cwd, '.ai/harness/journal/post-edit/pending'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('edits referencing old exit criteria do not enqueue contract verification', () => {
    const cwd = tmpWorkspace('mo-contract-bit');
    try {
      initRepo(cwd);
      const contractPath = 'tasks/contracts/demo.contract.md';
      writeContractWithExitCriteria(cwd, contractPath, 'src/target.ts');
      const planPath = writeActivePlan(cwd, contractPath);
      const collector = collectorFor(cwd, planPath);

      runMutationObserved({ collector, payload: editPayload('src/target.ts'), identity: hookIdentity() });
      runMutationObserved({ collector, payload: editPayload('src/other.ts'), identity: hookIdentity() });

      const events = pendingEvents(cwd);
      const targetEvent = events.find((e) => e.changed_paths.includes('src/target.ts'))!;
      const otherEvent = events.find((e) => e.changed_paths.includes('src/other.ts'))!;
      expect(targetEvent.dirty).not.toHaveProperty('contract-verification');
      expect(Reflect.get(targetEvent.payload, "contract_verification")).toBeUndefined();
      expect(otherEvent.dirty).not.toHaveProperty('contract-verification');
      expect(Reflect.get(otherEvent.payload, "contract_verification")).toBeUndefined();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('contract-verification is not requested with no active plan', () => {
    const cwd = tmpWorkspace('mo-contract-bit-no-plan');
    try {
      initRepo(cwd);
      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/target.ts'), identity: hookIdentity() });
      const [event] = pendingEvents(cwd);
      expect(event.dirty).not.toHaveProperty('contract-verification');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('minimal-change reflects policy.minimal_change.mode/post_edit_observer', () => {
    const cwd = tmpWorkspace('mo-minimal-change-bit');
    try {
      initRepo(cwd);

      // No policy file at all -> disabled (mirrors minimal_change_post_edit_enabled()'s `[[ -f "$policy_file" ]] || return 1`).
      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/a.ts'), identity: hookIdentity() });
      expect(pendingEvents(cwd).find((e) => e.changed_paths.includes('src/a.ts'))!.dirty['minimal-change']).toBe(false);

      mkdirSync(join(cwd, '.ai/harness'), { recursive: true });

      // Both gates are required (mutation-observed.ts:
      // `policy.mode !== 'off' && policy.post_edit_observer`). advice mode
      // alone is NOT enough -- post_edit_observer stays an explicit per-repo
      // opt-in, so a mode-only policy leaves the collection chain dark.
      writeFileSync(
        join(cwd, '.ai/harness/policy.json'),
        JSON.stringify({ minimal_change: { mode: 'advice', post_edit_observer: false } }, null, 2),
      );
      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/advice-only.ts'), identity: hookIdentity() });
      const adviceOnlyEvent = pendingEvents(cwd).find((e) => e.changed_paths.includes('src/advice-only.ts'))!;
      expect(adviceOnlyEvent.dirty['minimal-change']).toBe(false);
      expect(adviceOnlyEvent.payload.minimal_change).toBeUndefined();

      writeFileSync(
        join(cwd, '.ai/harness/policy.json'),
        JSON.stringify({ minimal_change: { mode: 'advice', post_edit_observer: true } }, null, 2),
      );
      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/b.ts'), identity: hookIdentity() });
      const enabledEvent = pendingEvents(cwd).find((e) => e.changed_paths.includes('src/b.ts'))!;
      expect(enabledEvent.dirty['minimal-change']).toBe(true);
      expect(enabledEvent.payload.minimal_change).toEqual({ path: 'src/b.ts', base_ref: 'HEAD' });

      writeFileSync(
        join(cwd, '.ai/harness/policy.json'),
        JSON.stringify({ minimal_change: { mode: 'off', post_edit_observer: true } }, null, 2),
      );
      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/c.ts'), identity: hookIdentity() });
      expect(pendingEvents(cwd).find((e) => e.changed_paths.includes('src/c.ts'))!.dirty['minimal-change']).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('task and review paths no longer request checkpoint work', () => {
    const cwd = tmpWorkspace('mo-checkpoint-bit');
    try {
      initRepo(cwd);
      const collector = collectorFor(cwd);
      const paths = [
        'tasks/todos.md',
        'plans/plan-20260101-0000-demo.md',
        'plans/nested/plan-x.md',
        'tasks/reviews/demo.review.md',
        '.ai/harness/checks/latest.json',
        'src/unrelated.ts',
        'tasks/notes/demo.notes.md',
      ];
      for (const path of paths) {
        runMutationObserved({ collector, payload: editPayload(path), identity: hookIdentity() });
      }
      const events = pendingEvents(cwd);
      for (const path of paths) {
        const event = events.find((e) => e.changed_paths.includes(path));
        expect(event).toBeDefined();
        expect(event!.dirty).not.toHaveProperty('checkpoint');
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('mutation-observed: session-scoped dedupe', () => {
  test('a same-session edit coalesces into the same pending file and advances delivery identity', () => {
    const cwd = tmpWorkspace('mo-coalesce');
    try {
      initRepo(cwd);
      const identity = hookIdentity({ sessionId: 'session-x' });
      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/repeat.ts'), identity });
      const firstEvents = pendingEvents(cwd);
      expect(firstEvents.length).toBe(1);
      const firstEventId = firstEvents[0].event_id;
      const firstSourceKey = firstEvents[0].source_key;
      const firstCreatedAt = firstEvents[0].created_at;
      const firstNames = readdirSync(join(cwd, '.ai/harness/journal/post-edit/pending'));

      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/repeat.ts'), identity });
      const secondEvents = pendingEvents(cwd);
      expect(secondEvents.length).toBe(1);
      expect(readdirSync(join(cwd, '.ai/harness/journal/post-edit/pending'))).toEqual(firstNames);
      expect(secondEvents[0].event_id).not.toBe(firstEventId);
      expect(secondEvents[0].source_key).toBe(firstSourceKey);
      expect(secondEvents[0].created_at).toBe(firstCreatedAt);
      expect(secondEvents[0].changed_paths).toEqual(['src/repeat.ts']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('a same-session edit after acknowledgement creates a new delivery identity', () => {
    const cwd = tmpWorkspace('mo-new-delivery-after-ack');
    try {
      initRepo(cwd);
      const identity = hookIdentity({ sessionId: 'session-x' });
      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/repeat.ts'), identity });
      const firstEventId = pendingEvents(cwd)[0].event_id;
      consumePendingPostEditEvents(cwd, process.env);
      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/repeat.ts'), identity });
      expect(pendingEvents(cwd)[0].event_id).not.toBe(firstEventId);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('a different session editing the same path does NOT coalesce (separate pending events)', () => {
    const cwd = tmpWorkspace('mo-no-coalesce-cross-session');
    try {
      initRepo(cwd);
      runMutationObserved({
        collector: collectorFor(cwd),
        payload: editPayload('src/repeat.ts'),
        identity: hookIdentity({ sessionId: 'session-a' }),
      });
      runMutationObserved({
        collector: collectorFor(cwd),
        payload: editPayload('src/repeat.ts'),
        identity: hookIdentity({ sessionId: 'session-b' }),
      });
      expect(pendingEvents(cwd).length).toBe(2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('dirty bits are OR-combined (monotonic) across a coalesced pair, not overwritten', () => {
    const cwd = tmpWorkspace('mo-coalesce-or');
    try {
      initRepo(cwd);
      const contractPath = 'tasks/contracts/demo.contract.md';
      writeContractWithExitCriteria(cwd, contractPath, 'tasks/todos.md');
      const planPath = writeActivePlan(cwd, contractPath);
      const collector = collectorFor(cwd, planPath);
      const identity = hookIdentity({ sessionId: 'session-or' });

      // First edit: policy disabled (minimal-change false). The path is a
      // task path referenced by the contract's exit_criteria, which no longer
      // adds a bit.
      runMutationObserved({ collector, payload: editPayload('tasks/todos.md'), identity });
      let [event] = pendingEvents(cwd);
      expect(event.dirty).toEqual({ 'minimal-change': false });

      // Second edit to the SAME path, same session, now with minimal-change
      // enabled: the bit flips true and STAYS true; earlier-true bits do not
      // get cleared by this second write.
      mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
      writeFileSync(
        join(cwd, '.ai/harness/policy.json'),
        JSON.stringify({ minimal_change: { mode: 'advice', post_edit_observer: true } }, null, 2),
      );
      runMutationObserved({ collector, payload: editPayload('tasks/todos.md'), identity });
      [event] = pendingEvents(cwd);
      expect(event.dirty).toEqual({ 'minimal-change': true });

      // A third edit with the policy disabled again keeps the earlier true bit.
      writeFileSync(join(cwd, '.ai/harness/policy.json'), JSON.stringify({ minimal_change: { mode: 'off' } }, null, 2));
      runMutationObserved({ collector, payload: editPayload('tasks/todos.md'), identity });
      [event] = pendingEvents(cwd);
      expect(event.dirty).toEqual({ 'minimal-change': true });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('mutation-observed: crash-replay', () => {
  test('a pending event survives a simulated crash: SessionStart orientation sees it, Stop consumption marks it consumed', () => {
    const cwd = tmpWorkspace('mo-crash-replay');
    try {
      initRepo(cwd);
      const result = runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/crash.ts'), identity: hookIdentity() });
      expect(result.exitCode).toBe(0);

      const beforePending = pendingEvents(cwd);
      expect(beforePending.length).toBe(1);
      const eventId = beforePending[0].event_id;

      // Simulated crash: nothing else runs between the journal write above
      // and the "next SessionStart" read below (no Stop ran in between).

      const section = pendingPostEditJournalSection(cwd);
      expect(section).not.toBeNull();
      expect(section!.content).toContain('1 pending post-edit journal event');
      expect(section!.content).toContain(eventId);
      expect(section!.mandatory).toBe(false);
      // Gate round-1 blocking fix: must be actionable, or budgetSessionContext
      // drops this (and every other) section to empty stdout in a quiet repo
      // with no other actionable state -- see mutation-observed.ts's comment
      // on this field and the production-path proof further down this file.
      expect(section!.actionable).toBe(true);

      const summary = consumePendingPostEditEvents(cwd, { PATH: '/nonexistent' });
      expect(summary).toEqual({ consumed: 1, pending: 0, errors: 0, warnings: [] });
      expect(pendingEvents(cwd)).toEqual([]);
      // Retention (gate round-1 MEDIUM): transit queue, not an evidence
      // ledger -- consumption deletes the file outright, no consumed/ dir.
      expect(existsSync(join(cwd, '.ai/harness/journal/post-edit/pending', `${eventId}.json`))).toBe(false);
      expect(existsSync(join(cwd, '.ai/harness/journal/post-edit/consumed'))).toBe(false);

      // A second SessionStart after Stop has consumed everything sees nothing pending.
      expect(pendingPostEditJournalSection(cwd)).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('Stop consumes verification evidence without dispatching an executor', () => {
    const cwd = tmpWorkspace('mo-reader-only');
    try {
      initRepo(cwd);
      const contractPath = 'tasks/contracts/demo.contract.md';
      writeContractWithExitCriteria(cwd, contractPath, 'README.md');
      const planPath = writeActivePlan(cwd, contractPath);
      const cli = join(cwd, 'record-cli.ts');
      writeFileSync(cli, String.raw`import { appendFileSync } from 'fs'; appendFileSync('calls.jsonl', JSON.stringify(process.argv.slice(2)) + '\n');`);
      const env = { ...process.env, REPO_HARNESS_CLI: cli };
      runMutationObserved({ collector: collectorFor(cwd, planPath), payload: editPayload(contractPath), identity: hookIdentity({ sessionId: 'reader-only' }) });
      consumePendingPostEditEvents(cwd, env);
      expect(existsSync(join(cwd, 'calls.jsonl'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('consumePendingPostEditEvents is a clean no-op with nothing pending', () => {
    const cwd = tmpWorkspace('mo-consume-empty');
    try {
      initRepo(cwd);
      const summary = consumePendingPostEditEvents(cwd, process.env);
      expect(summary).toEqual({ consumed: 0, pending: 0, errors: 0, warnings: [] });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('a corrupt pending file is removed at consumption with a stderr warning, without disturbing valid events', () => {
    const cwd = tmpWorkspace('mo-corrupt-pending');
    try {
      initRepo(cwd);
      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/valid.ts'), identity: hookIdentity() });
      const validEventId = pendingEvents(cwd)[0].event_id;

      const pendingDir = join(cwd, '.ai/harness/journal/post-edit/pending');
      writeFileSync(join(pendingDir, 'not-json-at-all.json'), 'this is not valid JSON\n');
      writeFileSync(join(pendingDir, 'wrong-schema.json'), JSON.stringify({ schema: 'something-else' }));

      const originalWrite = process.stderr.write.bind(process.stderr);
      const captured: string[] = [];
      // Test-local stderr spy, restored in the inner finally below.
      process.stderr.write = (chunk: string) => {
        captured.push(String(chunk));
        return true;
      };
      let summary;
      try {
        summary = consumePendingPostEditEvents(cwd, { PATH: '/nonexistent' });
      } finally {
        process.stderr.write = originalWrite;
      }

      expect(summary.consumed).toBe(1);
      expect(summary.pending).toBe(0);
      expect(summary.errors).toBe(0);
      expect(summary.warnings.length).toBe(2);
      expect(summary.warnings.some((w) => w.includes('not-json-at-all.json'))).toBe(true);
      expect(summary.warnings.some((w) => w.includes('wrong-schema.json'))).toBe(true);
      expect(captured.join('')).toContain('not-json-at-all.json');
      expect(captured.join('')).toContain('wrong-schema.json');

      expect(existsSync(join(pendingDir, 'not-json-at-all.json'))).toBe(false);
      expect(existsSync(join(pendingDir, 'wrong-schema.json'))).toBe(false);
      expect(existsSync(join(pendingDir, `${validEventId}.json`))).toBe(false);
      expect(pendingEvents(cwd)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('mutation-observed: effect failure contract', () => {
  test('a journal commit followed by a throw converges on the next same-route invocation', () => {
    const baselineRoot = tmpWorkspace('mo-effect-baseline');
    const retryRoot = tmpWorkspace('mo-effect-retry');
    try {
      initRepo(baselineRoot);
      initRepo(retryRoot);
      const identity = hookIdentity({ sessionId: 'effect-session' });
      runMutationObserved({ collector: collectorFor(baselineRoot), payload: editPayload('src/effect.ts'), identity });
      const baseline = pendingEvents(baselineRoot)[0];

      expect(() => runMutationObserved({
        collector: collectorFor(retryRoot),
        payload: editPayload('src/effect.ts'),
        identity,
        afterJournalWrite: () => { throw new Error('fault after journal commit'); },
      })).toThrow('fault after journal commit');
      expect(pendingEvents(retryRoot)).toHaveLength(1);

      runMutationObserved({ collector: collectorFor(retryRoot), payload: editPayload('src/effect.ts'), identity });
      const retried = pendingEvents(retryRoot)[0];
      expect(retried).toMatchObject({
        schema: baseline.schema,
        schema_version: baseline.schema_version,
        source_key: baseline.source_key,
        session_id: baseline.session_id,
        changed_paths: baseline.changed_paths,
        subject_revision: baseline.subject_revision,
        dirty: baseline.dirty,
        payload: baseline.payload,
      });
    } finally {
      rmSync(baselineRoot, { recursive: true, force: true });
      rmSync(retryRoot, { recursive: true, force: true });
    }
  }, 30_000);

  test('a qualifying no-op path has no durable effect and no observer callback', () => {
    const cwd = tmpWorkspace('mo-effect-noop');
    try {
      initRepo(cwd);
      let observed = 0;
      const result = runMutationObserved({
        collector: collectorFor(cwd),
        payload: {},
        afterJournalWrite: () => { observed += 1; },
        identity: hookIdentity(),
      });
      expect(result.exitCode).toBe(0);
      expect(observed).toBe(0);
      expect(pendingEvents(cwd)).toEqual([]);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});

describe('mutation-observed: advisory stdout parity', () => {
  test('DocDrift/DeployAsset echoes fire without any hooksDir', () => {
    const cwd = tmpWorkspace('mo-advisories-no-hooksdir');
    try {
      initRepo(cwd);
      const result = runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('deploy/sql/0001.sql'), identity: hookIdentity() });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[DeployAsset] Deployment operations asset changed: deploy/sql/0001.sql');
      expect(result.stdout).toContain('operations.deploy_sql');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('first-principles guidance is rendered in-process from the current diff', () => {
    const cwd = tmpWorkspace('mo-first-principles');
    try {
      initRepo(cwd);
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeFileSync(join(cwd, 'src/compat.ts'), 'export const stable = true;\n');
      git(cwd, ['add', 'src/compat.ts']);
      git(cwd, ['commit', '-m', 'add tracked source']);
      writeFileSync(join(cwd, 'src/compat.ts'), 'export const stable = true;\n// legacy-shim must be removed\n');

      const result = runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/compat.ts'), identity: hookIdentity() });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[FirstPrinciples] Compatibility debt additions detected in src/compat.ts');
      expect(result.stdout).toContain('1 compatibility-like line(s)');
      expect(result.stdout).toContain('Boundary: keep trust-boundary validation');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('DocDrift no longer points at legacy architecture targets; wrangler advice stays', () => {
    const cwd = tmpWorkspace('mo-advisories-misc');
    try {
      initRepo(cwd);
      const collector = collectorFor(cwd);
      for (const path of ['turbo.json', 'packages/core/package.json', 'packages/core/src/feature/index.ts', 'apps/web/src/page.ts', 'packages/core/tsconfig.json']) {
        const legacy = runMutationObserved({ collector, payload: editPayload(path), identity: hookIdentity() });
        expect(legacy.stdout).not.toContain('[DocDrift]');
        expect(legacy.stdout).not.toContain('docs/architecture.md');
        expect(legacy.stdout).not.toContain('docs/packages.md');
      }

      const metro = runMutationObserved({ collector, payload: editPayload('metro.config.js'), identity: hookIdentity() });
      expect(metro.stdout).not.toContain('[DocDrift]');

      const wrangler = runMutationObserved({ collector, payload: editPayload('apps/api/wrangler.staging.toml'), identity: hookIdentity() });
      expect(wrangler.stdout).toContain('[DocDrift] Wrangler config changed: wrangler.staging.toml');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('mutation-observed: gitignore coverage (gate round-1 second widening)', () => {
  test('the journal directory is covered by the managed gitignore block, and a qualifying edit leaves git status clean', () => {
    const cwd = tmpWorkspace('mo-gitignore');
    try {
      initRepo(cwd);
      writeFileSync(join(cwd, '.gitignore'), `${GITIGNORE_MANAGED_BLOCK_CONTENT}\n`);
      git(cwd, ['add', '.gitignore']);
      git(cwd, ['commit', '-m', 'add managed gitignore block']);

      runMutationObserved({ collector: collectorFor(cwd), payload: editPayload('src/tracked.ts'), identity: hookIdentity() });
      const [event] = pendingEvents(cwd);
      expect(event).toBeDefined();
      const eventPath = `.ai/harness/journal/post-edit/pending/${event.event_id}.json`;

      const checkIgnore = spawnSync('git', ['check-ignore', '-q', eventPath], { cwd, encoding: 'utf-8' });
      expect(checkIgnore.status).toBe(0);

      const status = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' });
      expect(status.status).toBe(0);
      expect(status.stdout.trim()).toBe('');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});


describe("mutation does not author acceptance evidence", () => {
  // Ordinary edits no longer schedule contract verification. Retain the
  // no-independent-authoring invariant at the actual mutation handler.
  test("ordinary mutation never schedules contract verification or authors acceptance checks", () => {
    const cwd = mkdtempSync(join(tmpdir(), "materializer-mutation-observed-redirect-"));
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd });
      execFileSync("git", ["config", "user.email", "mutation-observed-redirect@example.com"], { cwd });
      execFileSync("git", ["config", "user.name", "mutation-observed-redirect"], { cwd });
      writeFileSync(join(cwd, "README.md"), "# fixture\n");
      execFileSync("git", ["add", "."], { cwd });
      execFileSync("git", ["commit", "-q", "-m", "seed"], { cwd });

      const contractPath = "tasks/contracts/redirect-fixture.contract.md";
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      writeFileSync(
        join(cwd, contractPath),
        [
          "# Contract",
          "",
          "> **Status**: Pending",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/target.ts",
          "```",
          "",
        ].join("\n"),
      );
      const planPath = "plans/plan-20260722-0000-mutation-observed-redirect-fixture.md";
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(
        join(cwd, planPath),
        ["# Plan: fixture", "", "> **Status**: Executing", `> **Task Contract**: ${contractPath}`, ""].join("\n"),
      );
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/active-plan"), planPath);
      writeFileSync(join(cwd, ".ai/harness/active-worktree"), `${cwd}\n`);

      const collector: MutationObservedCollector = {
        getRepoRoot: () => cwd,
        getWorktreeOwnership: () => ({ current: cwd, owner: null, ownedByCurrent: false }),
        getActivePlanMarker: () => planPath,
      };
      const result = runMutationObserved({
        collector,
        payload: { tool_input: { file_path: "src/target.ts" } },
        identity: hookIdentity(),
      });
      expect(result.exitCode).toBe(0);

      const events = readPendingPostEditEvents(cwd);
      for (const event of events) {
        expect(event.dirty).not.toHaveProperty("contract-verification");
        expect(Reflect.get(event.payload, "contract_verification")).toBeUndefined();
      }
      expect(existsSync(join(cwd, ".ai/harness/checks/latest.json"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
