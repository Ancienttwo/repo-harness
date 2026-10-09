import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PiHookBridge, type HookRequest } from '../src/pi/hook-bridge';
import { parseHookJsonOutput, type HookJsonOutput } from '../src/pi/hook-protocol';
import { commitAll, initGitRepo, run, sandboxEnv, tmpWorkspace } from './helpers/repo-fixture';

const ROOT = join(import.meta.dir, '..');
const FIXTURE = join(import.meta.dir, 'helpers/pi-session-fixture.ts');
function fixture(optIn = true) {
  const base = tmpWorkspace('pi-host');
  const root = join(base, 'repo'), home = join(base, 'home');
  mkdirSync(root); mkdirSync(home);
  initGitRepo(root);
  writeFileSync(join(root, 'README.md'), 'seed\n');
  if (optIn) {
    mkdirSync(join(root, '.ai/harness'), { recursive: true });
    writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
    writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
    mkdirSync(join(root, 'plans'));
    writeFileSync(join(root, 'plans/plan-fixture.md'), '# Fixture plan\n\n> **Status**: Executing\n');
    writeFileSync(join(root, '.ai/harness/active-plan'), 'plans/plan-fixture.md\n');
  }
  commitAll(root, 'seed');
  const env = sandboxEnv({ HOME: home, PI_CODING_AGENT_DIR: join(home, '.pi/agent'), REPO_HARNESS_WORKFLOW_PROFILE: 'routine' });
  return { root, home, env, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}
function request(root: string, overrides: Partial<HookRequest> = {}): HookRequest {
  return { event: 'PreToolUse', route: 'edit', cwd: root, sessionId: 'pi-session', runId: 'run-pi-fixture',
    payload: { tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'safe' } }, ...overrides };
}
function output(overrides: Partial<HookJsonOutput> = {}): HookJsonOutput {
  return { protocol: 1, event: 'PreToolUse', route_id: 'edit', host: 'pi', repo_root: '/fixture', exit_code: 0,
    reason: 'ok', decision: 'allow', additional_context: null, diagnostics: '', ...overrides };
}
function fakePackage(root: string, script: string): string {
  const pkg = join(root, 'package');
  mkdirSync(join(pkg, 'dist'), { recursive: true });
  writeFileSync(join(pkg, 'dist/hook-entry.js'), script);
  return pkg;
}
function records(root: string): Array<Record<string, any>> {
  return readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
}
function session(root: string, env: NodeJS.ProcessEnv, mode: string): Record<string, any> {
  const result = run('bun', [FIXTURE, mode], root, env);
  if (result.status !== 0) throw new Error(`Pi fixture failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
  expect(receipt.errors).toEqual([]);
  return receipt;
}

describe('Pi JSON hook bridge', () => {
  test('strictly rejects malformed, stale, oversized and contradictory results', () => {
    const valid = output();
    expect(parseHookJsonOutput(JSON.stringify(valid), 'PreToolUse', 'edit')).toEqual(valid);
    for (const invalid of [null, [], { ...valid, extra: true }, { ...valid, protocol: 2 }, { ...valid, host: 'codex' },
      { ...valid, decision: ['allow'] }, { ...valid, route_id: 'bash' }, { ...valid, event: 'Stop' }, { ...valid, exit_code: 2 }, { ...valid, diagnostics: 'x'.repeat(8193) }]) {
      expect(() => parseHookJsonOutput(JSON.stringify(invalid), 'PreToolUse', 'edit')).toThrow();
    }
  });

  test('uses the package hook and isolates inherited host identity', async () => {
    const f = fixture();
    try {
      const bridge = new PiHookBridge(ROOT, { env: { ...f.env, HOOK_REPO_ROOT: '/stale', HOOK_HOST: 'codex',
        CLAUDE_SESSION_ID: 'stale-claude', CODEX_RUN_ID: 'stale-run', CLAUDE_TRANSCRIPT_PATH: '/stale-transcript',
        REPO_HARNESS_SOURCE_ROOT: '/stale-package' } });
      expect(await bridge.invoke(request(f.root))).toMatchObject({ host: 'pi', decision: 'allow', exit_code: 0 });
      const blocked = await bridge.invoke(request(f.root, { payload: { tool_name: 'Write', tool_input: { file_path: '_ops/private', content: 'no' } } }));
      expect(blocked).toMatchObject({ decision: 'block', exit_code: 2 });
      expect(blocked.diagnostics).toContain('OpsPrivateGuard');
      expect(existsSync(join(f.root, '_ops/private'))).toBe(false);
      expect(records(f.root)).toHaveLength(2);
      expect(readFileSync(join(f.root, '.ai/harness/runs/hook-events.jsonl'), 'utf8')).not.toContain('stale-run');
      const failures = readFileSync(join(f.root, '.ai/harness/failures/latest.jsonl'), 'utf8');
      expect(failures).not.toContain('stale-transcript');
      expect(failures).not.toContain('stale-claude');
      expect(failures).not.toContain('stale-run');
    } finally { f.cleanup(); }
  });

  test('reports inactive scope and rejects unavailable runtime or an invalid child result', async () => {
    const f = fixture(false);
    try {
      expect(await new PiHookBridge(ROOT, { env: f.env }).invoke(request(f.root))).toMatchObject({ reason: 'non-opt-in', decision: 'none' });
      expect(existsSync(join(f.root, '.ai/harness/runs'))).toBe(false);
      await expect(new PiHookBridge(ROOT, { bun: join(f.root, 'missing'), env: f.env }).invoke(request(f.root))).rejects.toThrow('PI_HOOK_START_FAILED');
      const pkg = fakePackage(f.root, 'console.log("not JSON");');
      await expect(new PiHookBridge(pkg, { env: f.env }).invoke(request(f.root))).rejects.toThrow('PI_HOOK_INVALID_RESULT');
      writeFileSync(join(pkg, 'dist/hook-entry.js'), `console.log(${JSON.stringify(JSON.stringify(output({ exit_code: 2, decision: 'block' })))});`);
      await expect(new PiHookBridge(pkg, { env: f.env }).invoke(request(f.root))).rejects.toThrow('PI_HOOK_EXIT_MISMATCH');
    } finally { f.cleanup(); }
  });

  test('bounds input, output and timeout, and cancels only its running checks', async () => {
    const f = fixture();
    try {
      const pkg = fakePackage(f.root, 'setInterval(() => {}, 1000);');
      const bridge = new PiHookBridge(pkg, { env: f.env, timeoutMs: 100 });
      await expect(bridge.invoke(request(f.root))).rejects.toThrow('PI_HOOK_TIMEOUT');
      await expect(bridge.invoke(request(f.root, { payload: { content: 'x'.repeat(16 * 1024 * 1024) } }))).rejects.toThrow('PI_HOOK_INPUT_TOO_LARGE');
      const pending = new PiHookBridge(pkg, { env: f.env });
      const check = pending.invoke(request(f.root));
      pending.cancel();
      await expect(check).rejects.toThrow('PI_HOOK_CANCELLED');
      const controller = new AbortController(); controller.abort();
      await expect(pending.invoke(request(f.root, { signal: controller.signal }))).rejects.toThrow('PI_HOOK_CANCELLED');
      writeFileSync(join(pkg, 'dist/hook-entry.js'), 'process.stdout.write("x".repeat(1024 * 1024 + 1)); setInterval(() => {}, 1000);');
      await expect(pending.invoke(request(f.root))).rejects.toThrow('PI_HOOK_OUTPUT_TOO_LARGE');
    } finally { f.cleanup(); }
  });
});

describe('real Pi 1.1 tool pipeline with a scripted provider', () => {
  test('checks direct and codemode edits, refuses private writes and reloads context', () => {
    const f = fixture();
    try {
      const result = session(f.root, f.env, 'pipeline');
      expect(result.readme).toBe('nested\n');
      expect(readFileSync(join(f.root, 'reloaded.txt'), 'utf8')).toBe('fresh session context');
      expect(existsSync(join(f.root, '_ops/private.txt'))).toBe(false);
      expect(existsSync(join(f.root, '_ops/nested.txt'))).toBe(false);
      const results = result.messages.filter((message: any) => message.role === 'toolResult');
      expect(results.find((message: any) => message.toolCallId === 'direct-edit')?.isError).toBe(false);
      expect(results.find((message: any) => message.toolCallId === 'direct-private')?.isError).toBe(true);
      expect(results.find((message: any) => message.toolCallId === 'nested-private')?.isError).toBe(true);
      expect(result.calls.some((call: any) => call.name === 'edit' && call.parent === 'nested-edit')).toBe(true);
      expect(result.messages.some((message: any) => message.role === 'custom' && message.customType === 'repo-harness-context')).toBe(true);
      const events = records(f.root);
      expect(events.filter(event => event.event === 'SessionStart')).toHaveLength(2);
      expect(events.filter(event => event.event === 'Stop')).toHaveLength(6);
      const observed = JSON.parse(readFileSync(join(f.root, '.ai/harness/checks/post-bash-latest.json'), 'utf8'));
      expect(observed).toMatchObject({ exit_code: null, status: 'unknown' });
    } finally { f.cleanup(); }
  }, 60_000);

  test('Pi path aliases use the native target from a repository subdirectory', () => {
    const f = fixture();
    try {
      const nested = join(f.root, 'subdirectory');
      mkdirSync(nested);
      const result = session(nested, f.env, 'paths');
      for (const file of ['relative.txt', 'at.txt', 'url.txt', 'tilde.txt']) expect(existsSync(join(f.root, '_ops', file))).toBe(false);
      expect(readFileSync(join(f.root, 'normal.txt'), 'utf8')).toBe('tilde');
      expect(result.journalPaths).toContain('normal.txt');
      expect(result.calls.filter((call: any) => call.name === 'write').map((call: any) => call.id)).toEqual(['normal-relative']);
      expect(result.calls.filter((call: any) => call.name === 'edit').map((call: any) => call.id)).toEqual(['normal-at', 'normal-url', 'normal-tilde']);
      expect(records(f.root).filter(event => event.event === 'PreToolUse')).toHaveLength(8);
    } finally { f.cleanup(); }
  }, 60_000);

  test('parallel nested writes keep both original paths after an outer failure without replay', () => {
    const f = fixture();
    try {
      const result = session(f.root, f.env, 'parallel');
      expect(readFileSync(join(f.root, 'alpha.txt'), 'utf8')).toBe('alpha');
      expect(readFileSync(join(f.root, 'beta.txt'), 'utf8')).toBe('beta');
      expect(existsSync(join(f.root, '_ops/parallel.txt'))).toBe(false);
      expect(result.journalPaths).toContain('alpha.txt');
      expect(result.journalPaths).toContain('beta.txt');
      const writes = result.calls.filter((call: any) => call.name === 'write');
      expect(writes).toHaveLength(2);
      expect(writes.every((call: any) => call.parent === 'parallel-parent')).toBe(true);
      expect(new Set(writes.map((call: any) => call.id)).size).toBe(2);
      expect(result.messages.find((message: any) => message.role === 'toolResult' && message.toolCallId === 'parallel-parent')?.isError).toBe(true);
      const events = records(f.root);
      expect(events.filter(event => event.event === 'PostToolUse' && event.route_id === 'edit')).toHaveLength(2);
      expect(events.filter(event => event.event === 'Stop')).toHaveLength(1);
    } finally { f.cleanup(); }
  }, 60_000);

  test('cancel after native write and edit preserves observation and never replays either write', () => {
    const f = fixture();
    try {
      const result = session(f.root, f.env, 'cancel-after-write');
      expect(readFileSync(join(f.root, 'cancelled.txt'), 'utf8')).toBe('written before cancel');
      expect(result.readme).toBe('edited before cancel\n');
      expect(result.writes).toEqual(['cancelled.txt', 'README.md', 'after-cancelled-writes.txt']);
      for (const id of ['cancelled-write', 'cancelled-edit']) {
        const results = result.messages.filter((message: any) => message.role === 'toolResult' && message.toolCallId === id);
        expect(results).toHaveLength(1);
        expect(results[0].isError).toBe(true);
        expect(results[0].content[0].text).toContain('aborted');
      }
      expect(result.journalPaths).toContain('cancelled.txt');
      expect(result.journalPaths).toContain('README.md');
      expect(readFileSync(join(f.root, 'after-cancelled-writes.txt'), 'utf8')).toBe('later run');
      const events = records(f.root);
      const observed = events.filter(event => event.event === 'PostToolUse' && event.route_id === 'edit');
      const stops = events.filter(event => event.event === 'Stop');
      expect(observed).toHaveLength(3);
      expect(stops).toHaveLength(3);
      expect(new Set(stops.map(event => event.run_id)).size).toBe(3);
      expect(observed.map(event => event.run_id)).toEqual(stops.map(event => event.run_id));
      expect(observed.every(event => event.session_id === result.sessionId)).toBe(true);
    } finally { f.cleanup(); }
  }, 60_000);

  test('an aborted command settles once and a later run has a separate identity', () => {
    const f = fixture();
    try {
      const result = session(f.root, f.env, 'cancel');
      expect(readFileSync(join(f.root, 'after-cancel.txt'), 'utf8')).toBe('new run');
      const results = result.messages.filter((message: any) => message.role === 'toolResult');
      expect(results.filter((message: any) => message.toolCallId === 'cancel-command')).toHaveLength(1);
      expect(results.find((message: any) => message.toolCallId === 'cancel-command')?.isError).toBe(true);
      const stops = records(f.root).filter(event => event.event === 'Stop');
      expect(stops).toHaveLength(2);
      expect(new Set(stops.map(event => event.run_id)).size).toBe(2);
      expect(stops.every(event => event.session_id === result.sessionId)).toBe(true);
      const journal = readFileSync(join(f.root, '.ai/harness/runs/hook-events.jsonl'), 'utf8');
      expect(journal).toContain(result.sessionId);
    } finally { f.cleanup(); }
  }, 60_000);

  for (const mode of ['resume', 'fork']) test(`${mode} restores the native session with fresh hook bindings`, () => {
    const f = fixture();
    try {
      const result = session(f.root, f.env, mode);
      expect(result.readme).toBe('replaced\n');
      expect(existsSync(join(f.root, '_ops/replaced.txt'))).toBe(false);
      expect(result.sessionIds).toHaveLength(2);
      expect(result.sessionIds[0] === result.sessionIds[1]).toBe(mode === 'resume');
      const events = records(f.root);
      expect(events.filter(event => event.event === 'SessionStart')).toHaveLength(2);
      const stops = events.filter(event => event.event === 'Stop');
      expect(stops).toHaveLength(3);
      expect(new Set(stops.map(event => event.run_id)).size).toBe(3);
      expect(stops[0]?.session_id).toBe(result.sessionIds[0]);
      expect(stops.slice(1).every(event => event.session_id === result.sessionIds[1])).toBe(true);
    } finally { f.cleanup(); }
  }, 60_000);

  test('does not enforce hook rules or create harness records outside opt-in', () => {
    const f = fixture(false);
    try {
      session(f.root, f.env, 'inactive');
      expect(readFileSync(join(f.root, '_ops/private.txt'), 'utf8')).toBe('allowed outside opt-in');
      expect(existsSync(join(f.root, '.ai/harness/runs'))).toBe(false);
    } finally { f.cleanup(); }
  }, 60_000);

  test('a broken Bun bridge prevents native writes in an opted-in repository', () => {
    const f = fixture();
    try {
      // Keep Git and the fixture runtime. Hide only the bridge's `bun` command.
      const bin = join(f.home, 'bin'); mkdirSync(bin);
      const git = run('which', ['git'], f.root, f.env).stdout.trim();
      symlinkSync(git, join(bin, 'git'));
      const result = run(process.execPath, [FIXTURE, 'unavailable'], f.root, { ...f.env, PATH: bin });
      if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
      expect(existsSync(join(f.root, 'blocked.txt'))).toBe(false);
      const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
      expect(receipt.errors).toEqual([]);
      const blocked = receipt.messages.find((message: any) => message.role === 'toolResult' && message.toolCallId === 'unavailable-write');
      expect(blocked?.isError).toBe(true);
      expect(JSON.stringify(blocked)).toContain('PI_HOOK_START_FAILED');
    } finally { f.cleanup(); }
  }, 60_000);
});
