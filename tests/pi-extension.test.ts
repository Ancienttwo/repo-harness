import { describe, expect, mock, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPackageDir } from '@earendil-works/pi-coding-agent';
import { MIN_PI_VERSION, probePiHost } from '../src/pi/compat';
import { parsePiHookResult, PiHookBridge, type HookRequest } from '../src/pi/hook-bridge';
import type { PiHookResult } from '../src/cli/hook/hook-protocol';
import { commitAll, initGitRepo, sandboxEnv, tmpWorkspace } from './helpers/repo-fixture';

// The real Pi 1.4 CLI from node_modules runs the real repo-harness extension, the
// real tools and the package hook (dist/hook-entry.js). Only the model is a
// scripted fixture provider (tests/fixtures/pi/scripted-provider.ts).
const ROOT = join(import.meta.dir, '..');
const PI = join(ROOT, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js');
const EXTENSION = join(ROOT, 'src/pi/extension.ts');
const PROVIDER = join(import.meta.dir, 'fixtures/pi/scripted-provider.ts');
const PROTECTED = 'protected seed\n';

type Call = [string, Record<string, unknown>];

function fixture(optIn = true) {
  const base = tmpWorkspace('pi-host');
  const root = join(base, 'repo'), home = join(base, 'home');
  mkdirSync(root); mkdirSync(home);
  initGitRepo(root);
  writeFileSync(join(root, 'README.md'), 'seed\n');
  writeFileSync(join(root, '.gitignore'), '_ops/\n.ai/harness/runs/\n.ai/harness/state/\n.ai/harness/handoff/\n.ai/harness/journal/\n.ai/harness/checks/\n.ai/harness/failures/\n.ai/harness/events.jsonl\n');
  if (optIn) {
    mkdirSync(join(root, '.ai/harness'), { recursive: true });
    writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
    writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  }
  commitAll(root, 'seed');
  mkdirSync(join(root, '_ops'));
  writeFileSync(join(root, '_ops/keep.txt'), PROTECTED);
  const log = join(base, 'provider.jsonl');
  const env = sandboxEnv({ HOME: home, PI_CODING_AGENT_DIR: join(home, '.pi/agent'), PI_FIXTURE_LOG: log, REPO_HARNESS_WORKFLOW_PROFILE: 'routine' });
  return { root, env, log, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

function piArgs(...extra: string[]): string[] {
  return [PI, '--no-session', '--offline', '-e', EXTENSION, '-e', PROVIDER, '--provider', 'fixture', '--model', 'scripted', ...extra];
}

function print(f: ReturnType<typeof fixture>, runs: Call[][], ...extra: string[]) {
  const result = spawnSync(process.env.REPO_HARNESS_NODE_BIN ?? 'node', piArgs(...extra, '-p', 'Run the fixture tools.'), {
    cwd: f.root, encoding: 'utf8', env: { ...f.env, PI_FIXTURE_CALLS: JSON.stringify(runs) }, input: '', timeout: 120_000,
  });
  if (result.status !== 0) throw new Error(`pi failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  return result;
}

function telemetry(root: string): Array<Record<string, unknown>> {
  const file = join(root, '.ai/harness/runs/hook-events.jsonl');
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
}

function routes(root: string): string[] {
  return telemetry(root).map(record => `${record.event}.${record.route_id}${record.blocked ? ' blocked' : ''}`);
}

/** The transcripts the fixture provider received, one per model request. */
function transcripts(log: string): string[] {
  return readFileSync(log, 'utf8').trim().split('\n');
}

const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

describe('Pi extension with the real Pi CLI', () => {
  test('print mode admits normal edits and blocks protected edit, write, bash and nested codemode writes', () => {
    const f = fixture();
    try {
      const result = print(f, [[
        ['write', { path: 'ok.txt', content: 'normal' }],
        ['edit', { path: 'README.md', edits: [{ oldText: 'seed', newText: 'edited' }] }],
        ['write', { path: '_ops/new.txt', content: 'forbidden' }],
        ['edit', { path: '_ops/keep.txt', edits: [{ oldText: 'protected', newText: 'changed' }] }],
        ['bash', { command: 'printf changed > _ops/keep.txt' }],
        ['codemode', { code: 'await tools.write({path: "_ops/nested.txt", content: "forbidden"}); return "nested";' }],
        ['codemode', { code: 'await tools.write({path: "nested-ok.txt", content: "nested"}); return "nested";' }],
      ]], '--tools', '+codemode');
      expect(result.stdout).toBe('Done.\n');
      expect(readFileSync(join(f.root, 'ok.txt'), 'utf8')).toBe('normal');
      expect(readFileSync(join(f.root, 'README.md'), 'utf8')).toBe('edited\n');
      expect(readFileSync(join(f.root, 'nested-ok.txt'), 'utf8')).toBe('nested');
      expect(readFileSync(join(f.root, '_ops/keep.txt'), 'utf8')).toBe(PROTECTED);
      expect(existsSync(join(f.root, '_ops/new.txt'))).toBe(false);
      expect(existsSync(join(f.root, '_ops/nested.txt'))).toBe(false);
      expect(routes(f.root)).toEqual([
        'SessionStart.default', 'UserPromptSubmit.inbox',
        'PreToolUse.edit', 'PreToolUse.edit', 'PreToolUse.edit blocked', 'PreToolUse.edit blocked', 'PreToolUse.bash blocked',
        'PreToolUse.edit blocked', 'PreToolUse.edit',
        'Stop.default',
      ]);
      expect(telemetry(f.root).every(record => record.host === 'pi')).toBe(true);
      const runIds = new Set(telemetry(f.root).filter(record => record.event !== 'SessionStart').map(record => record.run_id));
      expect(runIds.size).toBe(1);
      const final = transcripts(f.log).at(-1)!;
      expect(occurrences(final, '[EditGuardScope]')).toBe(1);
      expect(final).toContain('OpsPrivateGuard');
    } finally { f.cleanup(); }
  }, 180_000);

  test('JSON mode keeps stdout to Pi events and still blocks a protected write', () => {
    const f = fixture();
    try {
      const result = print(f, [[['write', { path: '_ops/new.txt', content: 'forbidden' }]]], '--mode', 'json');
      const lines = result.stdout.trim().split('\n');
      for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
      expect(result.stdout).not.toContain('repo-harness-hook');
      expect(existsSync(join(f.root, '_ops/new.txt'))).toBe(false);
      expect(routes(f.root)).toContain('PreToolUse.edit blocked');
    } finally { f.cleanup(); }
  }, 180_000);

  test('RPC mode delivers session context once over two prompts, blocks a protected write and stops after an abort', async () => {
    const f = fixture();
    try {
      const child = spawn(process.env.REPO_HARNESS_NODE_BIN ?? 'node', piArgs('--mode', 'rpc'), {
        cwd: f.root, env: { ...f.env, PI_FIXTURE_CALLS: JSON.stringify([
          [['write', { path: '_ops/new.txt', content: 'forbidden' }]],
          [['bash', { command: 'printf started; exec sleep 60' }]],
        ]) }, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const events: Array<Record<string, unknown>> = [];
      let buffer = '';
      const waiters: Array<() => void> = [];
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          if (line.trim()) events.push(JSON.parse(line));
          for (const wake of waiters.splice(0)) wake();
        }
      });
      const until = async (match: (event: Record<string, unknown>) => boolean, from: number) => {
        while (!events.slice(from).some(match)) await new Promise<void>(resolve => waiters.push(resolve));
        return events.length;
      };
      const send = (command: Record<string, unknown>) => child.stdin.write(`${JSON.stringify(command)}\n`);
      const settled = (event: Record<string, unknown>) => event.type === 'agent_end';
      let mark = events.length;
      send({ id: 'p1', type: 'prompt', message: 'Write the file.' });
      mark = await until(settled, mark);
      const stops = () => routes(f.root).filter(route => route === 'Stop.default').length;
      for (let attempt = 0; stops() < 1 && attempt < 100; attempt += 1) await Bun.sleep(100);
      send({ id: 'p2', type: 'prompt', message: 'Run the command.' });
      // The command has passed the hook and printed once it streams output.
      await until(event => event.type === 'tool_execution_update', mark);
      send({ id: 'a1', type: 'abort' });
      await until(settled, mark);
      for (let attempt = 0; stops() < 2 && attempt < 100; attempt += 1) await Bun.sleep(100);
      child.stdin.end();
      child.kill('SIGTERM');
      expect(existsSync(join(f.root, '_ops/new.txt'))).toBe(false);
      expect(routes(f.root)).toEqual([
        'SessionStart.default', 'UserPromptSubmit.inbox', 'PreToolUse.edit blocked', 'Stop.default',
        'UserPromptSubmit.inbox', 'PreToolUse.bash', 'Stop.default',
      ]);
      expect(new Set(telemetry(f.root).filter(record => record.event === 'Stop').map(record => record.run_id)).size).toBe(2);
      const final = transcripts(f.log).at(-1)!;
      expect(occurrences(final, '[EditGuardScope]')).toBe(1);
    } finally { f.cleanup(); }
  }, 180_000);

  test('a repository without the opt-in marker stays inactive', () => {
    const f = fixture(false);
    try {
      print(f, [[['write', { path: '_ops/new.txt', content: 'outside the harness' }]]]);
      expect(readFileSync(join(f.root, '_ops/new.txt'), 'utf8')).toBe('outside the harness');
      expect(telemetry(f.root)).toEqual([]);
      expect(transcripts(f.log).some(text => text.includes('[EditGuardScope]'))).toBe(false);
    } finally { f.cleanup(); }
  }, 180_000);
});

describe('Pi capability probe', () => {
  test('accepts the installed Pi and its own path resolver', async () => {
    const probe = await probePiHost(MIN_PI_VERSION, getPackageDir());
    expect(probe.ok).toBe(true);
    if (probe.ok) expect(probe.resolveToCwd('@a/b.txt', '/repo')).toBe('/repo/a/b.txt');
    expect((await probePiHost('99.0.0', getPackageDir())).ok).toBe(true);
  });

  test('a Pi below the minimum or without the resolver gets a fixed code', async () => {
    expect(await probePiHost('1.3.9', getPackageDir())).toMatchObject({ ok: false, code: 'PI_HOST_UNSUPPORTED_VERSION' });
    expect(await probePiHost('not-a-version', getPackageDir())).toMatchObject({ ok: false, code: 'PI_HOST_UNSUPPORTED_VERSION' });
    const base = tmpWorkspace('pi-probe');
    try {
      expect(await probePiHost(MIN_PI_VERSION, base)).toMatchObject({ ok: false, code: 'PI_HOST_PATH_RESOLVER_UNAVAILABLE' });
      mkdirSync(join(base, 'dist/core/tools'), { recursive: true });
      writeFileSync(join(base, 'dist/core/tools/path-utils.js'), 'export const other = 1;\n');
      expect(await probePiHost(MIN_PI_VERSION, base)).toMatchObject({ ok: false, code: 'PI_HOST_PATH_RESOLVER_UNAVAILABLE' });
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test('an unavailable host blocks edit, write and bash and tells the model; a non-opt-in session stays inactive', async () => {
    mock.module('@earendil-works/pi-coding-agent', () => ({ VERSION: '1.3.9', getPackageDir }));
    const { default: repoHarnessPi } = await import(`../src/pi/extension.ts?unavailable=${Date.now()}`);
    for (const optIn of [true, false]) {
      const f = fixture(optIn);
      try {
        const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<unknown>>();
        repoHarnessPi({ on: (name: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>) => { handlers.set(name, handler); } });
        const ctx = { cwd: f.root, hasUI: false, sessionManager: { getSessionId: () => 'session-1' }, signal: undefined };
        await handlers.get('session_start')!({ type: 'session_start', reason: 'startup' }, ctx);
        const start = await handlers.get('before_agent_start')!({ type: 'before_agent_start', messageType: 'user', prompt: 'x' }, ctx);
        const calls = await Promise.all([
          ['edit', { path: 'README.md', edits: [] }], ['write', { path: 'a.txt', content: 'a' }], ['bash', { command: 'true' }],
        ].map(([toolName, input]) => handlers.get('tool_call')!({ type: 'tool_call', toolName, toolCallId: String(toolName), input }, ctx)));
        if (optIn) {
          expect((start as { message: { content: string } }).message.content).toContain('[HarnessUnavailable] PI_HOST_UNSUPPORTED_VERSION');
          for (const call of calls) expect(call).toMatchObject({ block: true, reason: expect.stringContaining('PI_HOST_UNSUPPORTED_VERSION') });
        } else {
          expect(start).toBeUndefined();
          expect(calls).toEqual([undefined, undefined, undefined]);
        }
        expect(telemetry(f.root)).toEqual([]);
      } finally { f.cleanup(); }
    }
    mock.restore();
  });
});

describe('Pi hook bridge', () => {
  const result = (overrides: Partial<PiHookResult> = {}): PiHookResult => ({ protocol: 1, event: 'PreToolUse', route_id: 'edit', exit_code: 0,
    reason: 'ok', decision: 'allow', additional_context: null, system_message: null, diagnostics: '', ...overrides });
  const request = (root: string, overrides: Partial<HookRequest> = {}): HookRequest => ({ event: 'PreToolUse', route: 'edit', cwd: root,
    sessionId: 'pi-session', runId: 'run-pi-fixture', payload: { tool_name: 'Write', tool_input: { file_path: join(root, 'README.md') } }, ...overrides });
  function fakePackage(root: string, script: string): string {
    const pkg = join(root, '..', 'package');
    mkdirSync(join(pkg, 'dist'), { recursive: true });
    writeFileSync(join(pkg, 'dist/hook-entry.js'), script);
    return pkg;
  }

  test('strictly rejects malformed, foreign and contradictory results', () => {
    const valid = result();
    expect(parsePiHookResult(JSON.stringify(valid), 'PreToolUse', 'edit')).toEqual(valid);
    for (const invalid of [null, [], { ...valid, extra: true }, { ...valid, protocol: 2 }, { ...valid, decision: ['allow'] },
      { ...valid, route_id: 'bash' }, { ...valid, event: 'Stop' }, { ...valid, exit_code: 2 }, { ...valid, exit_code: 1, decision: 'block' },
      { ...valid, diagnostics: 'x'.repeat(8193) }, { ...valid, system_message: 1 }]) {
      expect(() => parsePiHookResult(JSON.stringify(invalid), 'PreToolUse', 'edit')).toThrow();
    }
    expect(() => parsePiHookResult('not JSON', 'PreToolUse', 'edit')).toThrow();
  });

  test('runs the package hook with Pi identity and without inherited host identity', async () => {
    const f = fixture();
    try {
      const bridge = new PiHookBridge(ROOT, { env: { ...f.env, HOOK_REPO_ROOT: '/stale', HOOK_HOST: 'codex',
        REPO_HARNESS_SOURCE_ROOT: '/stale-package', REPO_HARNESS_TARGET_REPO_ROOT: '/stale-target' } });
      expect(await bridge.invoke(request(f.root))).toMatchObject({ decision: 'allow', exit_code: 0 });
      const blocked = await bridge.invoke(request(f.root, { payload: { tool_name: 'Write', tool_input: { file_path: join(f.root, '_ops/x') } } }));
      expect(blocked).toMatchObject({ decision: 'block', exit_code: 2 });
      expect(blocked.diagnostics).toContain('OpsPrivateGuard');
      expect(telemetry(f.root).map(record => [record.host, record.session_id, record.run_id])).toEqual([
        ['pi', 'pi-session', 'run-pi-fixture'], ['pi', 'pi-session', 'run-pi-fixture'],
      ]);
    } finally { f.cleanup(); }
  });

  test('a crash, invalid output, exit mismatch, missing runtime or timeout is an error, never an admission', async () => {
    const f = fixture();
    try {
      await expect(new PiHookBridge(ROOT, { bun: join(f.root, 'missing'), env: f.env }).invoke(request(f.root))).rejects.toThrow('PI_HOOK_START_FAILED');
      const pkg = fakePackage(f.root, 'await Bun.stdin.text(); console.log("not JSON");');
      await expect(new PiHookBridge(pkg, { env: f.env }).invoke(request(f.root))).rejects.toThrow('PI_HOOK_INVALID_RESULT');
      writeFileSync(join(pkg, 'dist/hook-entry.js'), `await Bun.stdin.text(); console.log(${JSON.stringify(JSON.stringify(result()))}); process.exit(2);`);
      await expect(new PiHookBridge(pkg, { env: f.env }).invoke(request(f.root))).rejects.toThrow('PI_HOOK_EXIT_MISMATCH');
      writeFileSync(join(pkg, 'dist/hook-entry.js'), 'await Bun.stdin.text(); throw new Error("hook crashed");');
      await expect(new PiHookBridge(pkg, { env: f.env }).invoke(request(f.root))).rejects.toThrow('hook crashed');
      writeFileSync(join(pkg, 'dist/hook-entry.js'), 'setInterval(() => {}, 1000);');
      await expect(new PiHookBridge(pkg, { env: f.env, timeoutMs: 100 }).invoke(request(f.root))).rejects.toThrow('PI_HOOK_TIMEOUT');
      await expect(new PiHookBridge(pkg, { env: f.env }).invoke(request(f.root, { payload: { content: 'x'.repeat(16 * 1024 * 1024) } }))).rejects.toThrow('PI_HOOK_INPUT_TOO_LARGE');
      const pending = new PiHookBridge(pkg, { env: f.env });
      const check = pending.invoke(request(f.root));
      pending.cancel();
      await expect(check).rejects.toThrow('PI_HOOK_CANCELLED');
    } finally { f.cleanup(); }
  }, 60_000);
});
