import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mintOrAdoptSessionRunIdentity, resolveRunIdentity } from '../src/cli/hook/run-identity';
import { runHook } from '../src/cli/hook/runtime';
import { readAcceptedEvents } from '../src/effects/evidence/event-log';

const STATE_RELATIVE_PATH = '.ai/harness/state/session-run-identity.json';

function workspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

function readStateFileRaw(repoRoot: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, STATE_RELATIVE_PATH), 'utf-8')) as Record<string, unknown>;
}

describe('run-identity: resolveRunIdentity', () => {
  test('prefers payload.run_id over every env var and session state', () => {
    const repoRoot = workspace('run-identity-resolve-payload');
    try {
      const resolved = resolveRunIdentity(
        repoRoot,
        { session_id: 'sess-1', run_id: 'run-from-payload' },
        { HOOK_RUN_ID: 'run-from-hook-env', CODEX_RUN_ID: 'run-from-codex-env', CLAUDE_RUN_ID: 'run-from-claude-env' },
      );
      expect(resolved).toEqual({ sessionId: 'sess-1', runId: 'run-from-payload' });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('falls back HOOK_RUN_ID -> CODEX_RUN_ID -> CLAUDE_RUN_ID in order when payload carries nothing', () => {
    const repoRoot = workspace('run-identity-resolve-env-order');
    try {
      expect(resolveRunIdentity(
        repoRoot,
        {},
        { HOOK_RUN_ID: 'from-hook', CODEX_RUN_ID: 'from-codex', CLAUDE_RUN_ID: 'from-claude' },
      ).runId).toBe('from-hook');
      expect(resolveRunIdentity(
        repoRoot,
        {},
        { CODEX_RUN_ID: 'from-codex', CLAUDE_RUN_ID: 'from-claude' },
      ).runId).toBe('from-codex');
      expect(resolveRunIdentity(repoRoot, {}, { CLAUDE_RUN_ID: 'from-claude' }).runId).toBe('from-claude');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('falls back to session-state lookup by session_id when payload/env carry nothing', () => {
    const repoRoot = workspace('run-identity-resolve-session-state');
    try {
      const minted = mintOrAdoptSessionRunIdentity(repoRoot, { session_id: 'sess-lookup' }, {});
      expect(minted).not.toBeNull();
      const resolved = resolveRunIdentity(repoRoot, { session_id: 'sess-lookup' }, {});
      expect(resolved).toEqual({ sessionId: 'sess-lookup', runId: minted });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('returns a null runId when session_id does not match the stored state entry', () => {
    const repoRoot = workspace('run-identity-resolve-session-mismatch');
    try {
      mintOrAdoptSessionRunIdentity(repoRoot, { session_id: 'sess-a' }, {});
      const resolved = resolveRunIdentity(repoRoot, { session_id: 'sess-b' }, {});
      expect(resolved).toEqual({ sessionId: 'sess-b', runId: null });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('returns null for both fields when nothing resolves at all', () => {
    const repoRoot = workspace('run-identity-resolve-empty');
    try {
      expect(resolveRunIdentity(repoRoot, {}, {})).toEqual({ sessionId: null, runId: null });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});

describe('run-identity: mintOrAdoptSessionRunIdentity', () => {
  test('mints a run-<timestamp>-<pid> id when nothing upstream and no prior state', () => {
    const repoRoot = workspace('run-identity-mint-fresh');
    try {
      const minted = mintOrAdoptSessionRunIdentity(repoRoot, { session_id: 'sess-fresh' }, {});
      expect(minted).toMatch(/^run-\d{8}T\d{6}-\d+$/);
      expect(readStateFileRaw(repoRoot)).toEqual({
        protocol: 1,
        session_id: 'sess-fresh',
        run_id: minted,
        created_at: expect.any(String),
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('re-entry with the same session_id and no upstream override reuses the previously minted id', () => {
    const repoRoot = workspace('run-identity-mint-idempotent');
    try {
      const first = mintOrAdoptSessionRunIdentity(
        repoRoot,
        { session_id: 'sess-repeat' },
        {},
        new Date('2026-08-01T09:00:00.000Z'),
      );
      const second = mintOrAdoptSessionRunIdentity(
        repoRoot,
        { session_id: 'sess-repeat' },
        {},
        new Date('2026-08-01T09:05:00.000Z'),
      );
      expect(second).toBe(first);
      expect(readStateFileRaw(repoRoot).run_id).toBe(first);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('adopts an upstream-provided run_id verbatim instead of minting', () => {
    const repoRoot = workspace('run-identity-mint-adopt');
    try {
      const adopted = mintOrAdoptSessionRunIdentity(
        repoRoot,
        { session_id: 'sess-upstream', run_id: 'loop-engine-run-77' },
        {},
      );
      expect(adopted).toBe('loop-engine-run-77');
      expect(readStateFileRaw(repoRoot).run_id).toBe('loop-engine-run-77');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('a later upstream-provided value for the same session overwrites the stored id (upstream stays authoritative)', () => {
    const repoRoot = workspace('run-identity-mint-upstream-override');
    try {
      mintOrAdoptSessionRunIdentity(repoRoot, { session_id: 'sess-loop', run_id: 'loop-run-1' }, {});
      const second = mintOrAdoptSessionRunIdentity(repoRoot, { session_id: 'sess-loop', run_id: 'loop-run-2' }, {});
      expect(second).toBe('loop-run-2');
      expect(readStateFileRaw(repoRoot).run_id).toBe('loop-run-2');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('returns null when no session_id is resolvable at all', () => {
    const repoRoot = workspace('run-identity-mint-no-session');
    try {
      expect(mintOrAdoptSessionRunIdentity(repoRoot, {}, {})).toBeNull();
      expect(existsSync(join(repoRoot, STATE_RELATIVE_PATH))).toBe(false);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('storage stays a single bounded slot across distinct sessions, not a growing map', () => {
    const repoRoot = workspace('run-identity-mint-bounded');
    try {
      mintOrAdoptSessionRunIdentity(repoRoot, { session_id: 'sess-first' }, {});
      mintOrAdoptSessionRunIdentity(repoRoot, { session_id: 'sess-second' }, {});
      mintOrAdoptSessionRunIdentity(repoRoot, { session_id: 'sess-third' }, {});
      const state = readStateFileRaw(repoRoot);
      expect(Object.keys(state).sort()).toEqual(['created_at', 'protocol', 'run_id', 'session_id']);
      expect(state.session_id).toBe('sess-third');
      // A prior session's identity must not be resolvable once overwritten --
      // no cross-session history is retained (bounded growth).
      expect(resolveRunIdentity(repoRoot, { session_id: 'sess-first' }, {}).runId).toBeNull();
      expect(resolveRunIdentity(repoRoot, { session_id: 'sess-second' }, {}).runId).toBeNull();
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Acceptance probe: SessionStart -> PostToolUse.bash via the real runHook()
// runtime, demonstrating the two required joins:
//   (a) a newly produced hook event has a non-empty run_id
//   (b) that same run_id appears as an evidence ledger correlation_run_id
// ---------------------------------------------------------------------------

function fixtureRepo(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

function hookEvents(root: string): Record<string, unknown>[] {
  const file = join(root, '.ai/harness/runs/hook-events.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

describe('run-identity acceptance probe: SessionStart -> PostToolUse.bash', () => {
  test('a fresh SessionStart mints a run identity that threads to hook telemetry and the evidence ledger correlation_run_id', () => {
    const root = fixtureRepo('run-identity-acceptance');
    try {
      const env = {
        ...process.env,
        HOOK_REPO_ROOT: root,
        HOOK_HOST: 'claude',
        HOOK_SESSION_ID: 'run-identity-acceptance-session',
        REPO_HARNESS_WORKFLOW_PROFILE: 'lite',
        // Deliberately absent: HOOK_RUN_ID / CODEX_RUN_ID / CLAUDE_RUN_ID.
        // Omitting every upstream run-identity source forces the mint path,
        // so this probe actually exercises SessionStart's minting rather
        // than an env-supplied passthrough.
        HOOK_RUN_ID: undefined,
        CODEX_RUN_ID: undefined,
        CLAUDE_RUN_ID: undefined,
      };

      const sessionStartResult = runHook({ event: 'SessionStart', routeId: 'default', cwd: root, env });
      expect(sessionStartResult.exitCode).toBe(0);

      const bashResult = runHook({
        event: 'PostToolUse',
        routeId: 'bash',
        cwd: root,
        env,
        input: JSON.stringify({ tool_input: { command: 'echo hello' }, tool_output: 'hello\n', exit_code: 0 }),
      });
      expect(bashResult.exitCode).toBe(0);

      // (a) newly produced hook events carry a non-empty run_id.
      const events = hookEvents(root);
      const sessionStartEvent = events.find((event) => event.event === 'SessionStart');
      const bashEvent = events.find((event) => event.event === 'PostToolUse' && event.route_id === 'bash');
      expect(typeof sessionStartEvent?.run_id).toBe('string');
      expect(sessionStartEvent?.run_id).not.toBe('');
      expect(typeof bashEvent?.run_id).toBe('string');
      expect(bashEvent?.run_id).not.toBe('');
      // The same run identity threads across both hook invocations of one session.
      expect(bashEvent?.run_id).toBe(sessionStartEvent?.run_id);

      // (b) join instance: the identical run_id shows up as the evidence
      // ledger's correlation_run_id for the PostBash-observed event.
      const ledger = readAcceptedEvents(root);
      const observed = ledger.accepted.find((event) => event.event_type === 'post_bash.command_observed');
      expect(observed).toBeDefined();
      expect(observed?.correlation_run_id).toBe(sessionStartEvent?.run_id as string);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});
