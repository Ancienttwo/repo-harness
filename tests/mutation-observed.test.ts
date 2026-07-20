import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  consumePendingPostEditEvents,
  pendingPostEditJournalSection,
  readPendingPostEditEvents,
  runMutationObserved,
  type MutationObservedCollector,
  type PostEditJournalEvent,
} from '../src/cli/hook/mutation-observed';
import { GITIGNORE_MANAGED_BLOCK_CONTENT } from '../src/core/adoption/gitignore-plan';

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
  git(cwd, ['commit', '-m', 'seed']);
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

function editPayload(filePath: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ tool_input: { file_path: filePath }, ...extra });
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
    ].join('\n'),
  );
}

describe('mutation-observed: non-qualifying edits', () => {
  test('a payload with no resolvable file path writes no journal event', () => {
    const cwd = tmpWorkspace('mo-non-qualifying');
    try {
      initRepo(cwd);
      const result = runMutationObserved({ collector: collectorFor(cwd), input: '{}' });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(pendingEvents(cwd)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('mutation-observed: journal schema', () => {
  test('a qualifying edit writes exactly one change_observed event with subject_revision', () => {
    const cwd = tmpWorkspace('mo-schema');
    try {
      initRepo(cwd);
      const result = runMutationObserved({
        collector: collectorFor(cwd),
        input: editPayload('src/example.ts'),
        env: { HOOK_SESSION_ID: 'session-a', ...process.env },
      });
      expect(result.exitCode).toBe(0);

      const events = pendingEvents(cwd);
      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.schema).toBe('change_observed');
      expect(event.schema_version).toBe(1);
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
  });
});

describe('mutation-observed: dirty-bit derivation', () => {
  test('architecture, context, and capability are unconditionally true for any qualifying edit', () => {
    const cwd = tmpWorkspace('mo-arch-bits');
    try {
      initRepo(cwd);
      runMutationObserved({ collector: collectorFor(cwd), input: editPayload('src/unrelated.ts') });
      const [event] = pendingEvents(cwd);
      expect(event.dirty.architecture).toBe(true);
      expect(event.dirty.context).toBe(true);
      expect(event.dirty.capability).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('contract-verification is true only when the active contract\'s exit_criteria references the edited path', () => {
    const cwd = tmpWorkspace('mo-contract-bit');
    try {
      initRepo(cwd);
      const contractPath = 'tasks/contracts/demo.contract.md';
      writeContractWithExitCriteria(cwd, contractPath, 'src/target.ts');
      const planPath = writeActivePlan(cwd, contractPath);
      const collector = collectorFor(cwd, planPath);

      runMutationObserved({ collector, input: editPayload('src/target.ts') });
      runMutationObserved({ collector, input: editPayload('src/other.ts') });

      const events = pendingEvents(cwd);
      const targetEvent = events.find((e) => e.changed_paths.includes('src/target.ts'))!;
      const otherEvent = events.find((e) => e.changed_paths.includes('src/other.ts'))!;
      expect(targetEvent.dirty['contract-verification']).toBe(true);
      expect(targetEvent.payload.contract_verification).toEqual({
        contract_file: contractPath,
        checks_file: '.ai/harness/checks/latest.json',
      });
      expect(otherEvent.dirty['contract-verification']).toBe(false);
      expect(otherEvent.payload.contract_verification).toBeUndefined();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('contract-verification is false with no active plan', () => {
    const cwd = tmpWorkspace('mo-contract-bit-no-plan');
    try {
      initRepo(cwd);
      runMutationObserved({ collector: collectorFor(cwd), input: editPayload('src/target.ts') });
      const [event] = pendingEvents(cwd);
      expect(event.dirty['contract-verification']).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('minimal-change reflects policy.minimal_change.mode/post_edit_observer', () => {
    const cwd = tmpWorkspace('mo-minimal-change-bit');
    try {
      initRepo(cwd);

      // No policy file at all -> disabled (mirrors minimal_change_post_edit_enabled()'s `[[ -f "$policy_file" ]] || return 1`).
      runMutationObserved({ collector: collectorFor(cwd), input: editPayload('src/a.ts') });
      expect(pendingEvents(cwd).find((e) => e.changed_paths.includes('src/a.ts'))!.dirty['minimal-change']).toBe(false);

      mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
      writeFileSync(
        join(cwd, '.ai/harness/policy.json'),
        JSON.stringify({ minimal_change: { mode: 'advice', post_edit_observer: true } }, null, 2),
      );
      runMutationObserved({ collector: collectorFor(cwd), input: editPayload('src/b.ts') });
      const enabledEvent = pendingEvents(cwd).find((e) => e.changed_paths.includes('src/b.ts'))!;
      expect(enabledEvent.dirty['minimal-change']).toBe(true);
      expect(enabledEvent.payload.minimal_change).toEqual({ path: 'src/b.ts', base_ref: 'HEAD' });

      writeFileSync(
        join(cwd, '.ai/harness/policy.json'),
        JSON.stringify({ minimal_change: { mode: 'off', post_edit_observer: true } }, null, 2),
      );
      runMutationObserved({ collector: collectorFor(cwd), input: editPayload('src/c.ts') });
      expect(pendingEvents(cwd).find((e) => e.changed_paths.includes('src/c.ts'))!.dirty['minimal-change']).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('checkpoint is true for tasks/todos.md, plans/*.md, tasks/reviews/*.review.md, and .ai/harness/checks/latest.json, false otherwise', () => {
    const cwd = tmpWorkspace('mo-checkpoint-bit');
    try {
      initRepo(cwd);
      const collector = collectorFor(cwd);
      const cases: Array<[string, boolean]> = [
        ['tasks/todos.md', true],
        ['plans/plan-20260101-0000-demo.md', true],
        ['plans/nested/plan-x.md', true],
        ['tasks/reviews/demo.review.md', true],
        ['.ai/harness/checks/latest.json', true],
        ['src/unrelated.ts', false],
        ['tasks/notes/demo.notes.md', false],
      ];
      for (const [path, expected] of cases) {
        runMutationObserved({ collector, input: editPayload(path) });
      }
      const events = pendingEvents(cwd);
      for (const [path, expected] of cases) {
        const event = events.find((e) => e.changed_paths.includes(path));
        expect(event?.dirty.checkpoint).toBe(expected);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('mutation-observed: session-scoped dedupe', () => {
  test('a same-session edit to the same path coalesces into the same pending file', () => {
    const cwd = tmpWorkspace('mo-coalesce');
    try {
      initRepo(cwd);
      const env = { ...process.env, HOOK_SESSION_ID: 'session-x' };
      runMutationObserved({ collector: collectorFor(cwd), input: editPayload('src/repeat.ts'), env });
      const firstEvents = pendingEvents(cwd);
      expect(firstEvents.length).toBe(1);
      const firstEventId = firstEvents[0].event_id;
      const firstCreatedAt = firstEvents[0].created_at;

      runMutationObserved({ collector: collectorFor(cwd), input: editPayload('src/repeat.ts'), env });
      const secondEvents = pendingEvents(cwd);
      expect(secondEvents.length).toBe(1);
      expect(secondEvents[0].event_id).toBe(firstEventId);
      expect(secondEvents[0].created_at).toBe(firstCreatedAt);
      expect(secondEvents[0].changed_paths).toEqual(['src/repeat.ts']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('a different session editing the same path does NOT coalesce (separate pending events)', () => {
    const cwd = tmpWorkspace('mo-no-coalesce-cross-session');
    try {
      initRepo(cwd);
      runMutationObserved({
        collector: collectorFor(cwd),
        input: editPayload('src/repeat.ts'),
        env: { ...process.env, HOOK_SESSION_ID: 'session-a' },
      });
      runMutationObserved({
        collector: collectorFor(cwd),
        input: editPayload('src/repeat.ts'),
        env: { ...process.env, HOOK_SESSION_ID: 'session-b' },
      });
      expect(pendingEvents(cwd).length).toBe(2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('dirty bits are OR-combined (monotonic) across a coalesced pair, not overwritten', () => {
    const cwd = tmpWorkspace('mo-coalesce-or');
    try {
      initRepo(cwd);
      const contractPath = 'tasks/contracts/demo.contract.md';
      writeContractWithExitCriteria(cwd, contractPath, 'tasks/todos.md');
      const planPath = writeActivePlan(cwd, contractPath);
      const collector = collectorFor(cwd, planPath);
      const env = { ...process.env, HOOK_SESSION_ID: 'session-or' };

      // First edit: policy disabled (minimal-change false), but path is a
      // checkpoint path AND is referenced by the contract's exit_criteria.
      runMutationObserved({ collector, input: editPayload('tasks/todos.md'), env });
      let [event] = pendingEvents(cwd);
      expect(event.dirty.checkpoint).toBe(true);
      expect(event.dirty['contract-verification']).toBe(true);
      expect(event.dirty['minimal-change']).toBe(false);

      // Second edit to the SAME path, same session, now with minimal-change
      // enabled: the bit flips true and STAYS true; earlier-true bits do not
      // get cleared by this second write.
      mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
      writeFileSync(
        join(cwd, '.ai/harness/policy.json'),
        JSON.stringify({ minimal_change: { mode: 'advice', post_edit_observer: true } }, null, 2),
      );
      runMutationObserved({ collector, input: editPayload('tasks/todos.md'), env });
      [event] = pendingEvents(cwd);
      expect(event.dirty.checkpoint).toBe(true);
      expect(event.dirty['contract-verification']).toBe(true);
      expect(event.dirty['minimal-change']).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('mutation-observed: crash-replay', () => {
  test('a pending event survives a simulated crash: SessionStart orientation sees it, Stop consumption marks it consumed', () => {
    const cwd = tmpWorkspace('mo-crash-replay');
    try {
      initRepo(cwd);
      const result = runMutationObserved({ collector: collectorFor(cwd), input: editPayload('src/crash.ts') });
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
  });

  test('consumePendingPostEditEvents is a clean no-op with nothing pending', () => {
    const cwd = tmpWorkspace('mo-consume-empty');
    try {
      initRepo(cwd);
      const summary = consumePendingPostEditEvents(cwd, process.env);
      expect(summary).toEqual({ consumed: 0, pending: 0, errors: 0, warnings: [] });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('a corrupt pending file is removed at consumption with a stderr warning, without disturbing valid events', () => {
    const cwd = tmpWorkspace('mo-corrupt-pending');
    try {
      initRepo(cwd);
      runMutationObserved({ collector: collectorFor(cwd), input: editPayload('src/valid.ts') });
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
  });
});

describe('mutation-observed: advisory stdout parity', () => {
  test('DocDrift/DeployAsset echoes fire without any hooksDir (no first-principles dispatch attempted)', () => {
    const cwd = tmpWorkspace('mo-advisories-no-hooksdir');
    try {
      initRepo(cwd);
      const result = runMutationObserved({ collector: collectorFor(cwd), input: editPayload('deploy/sql/0001.sql') });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[DeployAsset] Deployment operations asset changed: deploy/sql/0001.sql');
      expect(result.stdout).toContain('operations.deploy_sql');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('turbo.json and metro config advisories match the base script verbatim', () => {
    const cwd = tmpWorkspace('mo-advisories-misc');
    try {
      initRepo(cwd);
      const collector = collectorFor(cwd);
      const turbo = runMutationObserved({ collector, input: editPayload('turbo.json') });
      expect(turbo.stdout).toContain('[DocDrift] Turborepo config changed');

      const metro = runMutationObserved({ collector, input: editPayload('metro.config.js') });
      expect(metro.stdout).toContain('[DocDrift] Metro config changed');

      const wrangler = runMutationObserved({ collector, input: editPayload('apps/api/wrangler.staging.toml') });
      expect(wrangler.stdout).toContain('[DocDrift] Wrangler config changed: wrangler.staging.toml');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('mutation-observed: gitignore coverage (gate round-1 second widening)', () => {
  test('the journal directory is covered by the managed gitignore block, and a qualifying edit leaves git status clean', () => {
    const cwd = tmpWorkspace('mo-gitignore');
    try {
      initRepo(cwd);
      writeFileSync(join(cwd, '.gitignore'), `${GITIGNORE_MANAGED_BLOCK_CONTENT}\n`);
      git(cwd, ['add', '.gitignore']);
      git(cwd, ['commit', '-m', 'add managed gitignore block']);

      runMutationObserved({ collector: collectorFor(cwd), input: editPayload('src/tracked.ts') });
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
  });
});
