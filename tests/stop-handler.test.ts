import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, closeSync, existsSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, writeSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { runStopHandler as runStopHandlerRuntime } from '../src/cli/hook/stop-handler';
import { runMutationGuard } from '../src/cli/hook/mutation-guard';
import { agentNoticeFixture, noticeEnv, NOTICE_CAPABILITY } from './helpers/agent-notice';
import { fixtureWrite, fixtureCommit } from './helpers/module-repository';
import { hookIdentity } from './helpers/hook-identity';
import { resolveCompatibleNodeRuntime } from '../src/effects/architecture/archctx-provider';

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

type StopRuntimeInput = Parameters<typeof runStopHandlerRuntime>[0];

/** Defaults an empty payload and a run-less Claude identity; isolates HOME. */
function runStopHandler(options: Omit<StopRuntimeInput, 'payload' | 'identity'> & Partial<Pick<StopRuntimeInput, 'payload' | 'identity'>>) {
  return runStopHandlerRuntime({
    payload: {},
    identity: hookIdentity(),
    ...options,
    env: { ...process.env, ...options.env, HOME: options.env?.HOME ?? join(options.collector.getRepoRoot(), '.ai/harness/test-home') },
  });
}

function fixture(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-stop-handler-'));
  fixtures.push(cwd);
  mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
  mkdirSync(join(cwd, '.ai/harness/test-home/.repo-harness'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/policy.json'), '{}\n');
  git(cwd, ['init', '-b', 'main']);
  writeFileSync(join(cwd, '.gitignore'), '.ai/\n');
  git(cwd, ['add', '.gitignore']);
  git(cwd, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'fixture']);
  return cwd;
}

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

/** A committed repository with a real HEAD. */
function gitFixture(): { cwd: string; head: string } {
  const cwd = realpathSync(fixture());
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'stop-handler@example.com']);
  git(cwd, ['config', 'user.name', 'Stop Handler Test']);
  writeFileSync(join(cwd, '.gitignore'), '.ai/harness/\n');
  writeFileSync(join(cwd, 'README.md'), '# fixture\n');
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-m', 'seed']);
  return { cwd, head: git(cwd, ['rev-parse', 'HEAD']) };
}

/** Stop reads the repo root only; it never resolves the effective state or a plan marker. */
function collector(cwd: string) {
  return {
    getRepoRoot: () => cwd,
    getEffectiveState: () => { throw new Error('Stop must not resolve the effective state'); },
  };
}

describe('Stop writes no recovery views', () => {
  test('writes no handoff or resume file and no events line', () => {
    const cwd = fixture();
    const result = runStopHandler({
      collector: collector(cwd),
      payload: { stop_hook_active: false },
      identity: hookIdentity({ runId: 'stop-no-recovery' }),
    });

    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(existsSync(join(cwd, '.ai/harness/handoff/current.md'))).toBe(false);
    expect(existsSync(join(cwd, '.ai/harness/handoff/resume.md'))).toBe(false);
    expect(existsSync(join(cwd, '.ai/harness/handoff'))).toBe(false);
    expect(existsSync(join(cwd, '.ai/harness/events.jsonl'))).toBe(false);
    expect(existsSync(join(cwd, '.ai/harness/runs'))).toBe(false);
  });

  test('two identical Stops stay silent and write no recovery file', () => {
    const cwd = fixture();
    const now = new Date('2026-08-14T08:00:00.000Z');
    const stop = () => runStopHandler({ collector: collector(cwd), dependencies: { now: () => now } });

    expect(stop().exitCode).toBe(0);
    expect(stop().exitCode).toBe(0);
    expect(existsSync(join(cwd, '.ai/harness/handoff'))).toBe(false);
  });

  test('a continued Stop returns before any work', () => {
    const cwd = fixture();
    expect(runStopHandler({ collector: collector(cwd), payload: { stop_hook_active: true } }))
      .toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(existsSync(join(cwd, '.ai/harness/handoff'))).toBe(false);
  });
});

describe('Stop seat reset (#1972)', () => {
  // The request path is fixed under /tmp; a repository id per run keeps the runs apart.
  const repository = String(9_100_000_000 + process.pid);
  const dir = join('/tmp/repo-harness-seats', repository, 'orchestrator');
  const assistant = (input: number) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: input, cache_read_input_tokens: 370_000, cache_creation_input_tokens: 2_000 } } });
  const user = (size: number) => JSON.stringify({ type: 'user', message: { content: 'x'.repeat(size) } });
  const now = new Date('2026-11-08T08:00:00.000Z');
  function seatStop(cwd: string, transcript: string, active = false) {
    return runStopHandler({
      collector: collector(cwd), payload: { stop_hook_active: active, transcript_path: transcript }, dependencies: { now: () => now },
      env: { REPO_HARNESS_SEAT: 'orchestrator', REPO_HARNESS_SEAT_REPOSITORY: repository },
    });
  }
  afterEach(() => {
    rmSync(join('/tmp/repo-harness-seats', repository), { recursive: true, force: true });
  });

  test('a reset seat below the threshold stops; at the threshold it blocks once per session segment and records the request with its action', () => {
    const cwd = fixture();
    const transcript = join(cwd, 'transcript.jsonl');
    const stop = (active: boolean, path = transcript) => seatStop(cwd, path, active);
    writeFileSync(transcript, `${assistant(7_999)}\n${JSON.stringify({ type: 'system', subtype: 'turn_duration' })}\n`);
    expect([stop(false), existsSync(dir)]).toEqual([{ exitCode: 0, stdout: '', stderr: '' }, false]);
    writeFileSync(transcript, `${assistant(7_999)}\n${assistant(8_000)}\n`);
    const blocked = stop(false);
    expect([blocked.exitCode, blocked.stdout]).toEqual([2, '']);
    expect(blocked.stderr).toContain('the orchestrator seat context is 380000 tokens');
    expect(blocked.stderr).toContain(`Send \`RESET-REQUEST ${dir}/handoff.md <sha256>\` to the advisor seat`);
    expect(blocked.stderr).toContain('0. Finish the planning and the dispatch that you have in hand. Start nothing new. Then write the handoff.');
    const bytes = statSync(transcript).size;
    expect(blocked.stderr).toContain(`The transcript is ${bytes} bytes, below 33554432, so the reset types /compact.`);
    expect(JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8'))).toEqual({ requested_at: now.toISOString(), context_tokens: 380_000, transcript_path: transcript, action: 'compact', transcript_bytes: bytes });
    expect(stop(true)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    // A later turn of the same segment does not ask again, so the first handoff stays newer than the request.
    expect(stop(false)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    // A compact record newer than the request starts a new segment of the same transcript, so the next crossing blocks.
    const session = (startedAt: string) => writeFileSync(join(dir, 'session.json'), JSON.stringify({ session_id: 's', transcript_path: transcript, source: 'compact', started_at: startedAt }));
    session(new Date(now.getTime() - 1).toISOString());
    expect(stop(false)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    session(new Date(now.getTime() + 1).toISOString());
    expect(stop(false).exitCode).toBe(2);
    // A request of the old code (no action) for the same transcript fails the one request validator, so it is not open.
    rmSync(join(dir, 'session.json'));
    writeFileSync(join(dir, 'request.json'), JSON.stringify({ requested_at: now.toISOString(), context_tokens: 380_000, transcript_path: transcript }));
    expect(stop(false).exitCode).toBe(2);
    expect(JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8')).action).toBe('compact');
    // A JSON value that is not an object is not a request either: the hook blocks and writes a fresh one, no skip notice.
    writeFileSync(join(dir, 'request.json'), 'null');
    expect([stop(false).exitCode, JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8')).action]).toEqual([2, 'compact']);
    // At or above the bound the request records /clear; a sparse file keeps the 32 MiB transcript cheap.
    const big = join(cwd, 'big.jsonl');
    const fd = openSync(big, 'w');
    writeSync(fd, `\n${assistant(8_000)}\n`, 32 * 1024 * 1024);
    closeSync(fd);
    const cleared = stop(false, big);
    expect([cleared.exitCode, JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8')).action]).toEqual([2, 'reset']);
    expect(cleared.stderr).toContain(`bytes, at or above 33554432, so the reset types /clear.`);
    // A failed read or request write resets nothing, names the failure and keeps exit 0.
    const missing = join(cwd, 'missing.jsonl');
    expect(stop(false, missing)).toMatchObject({ exitCode: 0, systemMessage: expect.stringContaining(`seat reset skipped: ENOENT: no such file or directory, open '${missing}'`) });
    const next = join(cwd, 'next.jsonl');
    writeFileSync(next, `${assistant(8_000)}\n`);
    chmodSync(join(dir, 'request.json'), 0o400);
    expect(stop(false, next)).toMatchObject({ exitCode: 0, systemMessage: expect.stringContaining(`seat reset skipped: EACCES: permission denied, open '${dir}/request.json'`) });
  });

  test('the tail reader finds the last assistant entry past a cut window line and without a final newline', () => {
    const cwd = fixture();
    const cases = [
      // A 1.5 MB line after the entry: the first 1 MB window starts inside it, so the reader doubles the window.
      ['long.jsonl', `${assistant(8_000)}\n${user(1_500_000)}\n`, 2],
      ['open.jsonl', `${user(10)}\n${assistant(8_000)}`, 2],
      // About 2.6 MB without an assistant entry: the window doubles to the whole file and finds none.
      ['none.jsonl', `${user(1_300_000)}\n${user(1_300_000)}\n`, 0],
    ] as const;
    const results = cases.map(([name, text]) => {
      writeFileSync(join(cwd, name), text);
      return seatStop(cwd, join(cwd, name));
    });
    expect(results.map(result => result.exitCode)).toEqual(cases.map(([, , exitCode]) => exitCode));
    // A reader that threw would also exit 0: the no-assistant row gives no reset message and leaves the last request.
    expect(results[2]!.systemMessage ?? '').not.toContain('seat reset');
    expect(JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8')).transcript_path).toBe(join(cwd, 'open.jsonl'));
  });
});

describe('Stop architecture debt notice', () => {
  function noticeFixture() { const root = agentNoticeFixture(); fixtures.push(root); return root; }
  function stop(cwd: string, options: Partial<StopRuntimeInput> = {}) {
    return runStopHandler({ collector: collector(cwd), env: noticeEnv(cwd), ...options });
  }

  test('review round 1: Stop uses the hook Node environment for ownership and checkpoint', () => {
    const cwd = noticeFixture();
    const env = { ...noticeEnv(cwd), REPO_HARNESS_NODE_BIN: resolveCompatibleNodeRuntime(process.env) };
    const previous = process.env.REPO_HARNESS_NODE_BIN;
    process.env.REPO_HARNESS_NODE_BIN = join(cwd, 'missing-process-node');
    try {
      const result = stop(cwd, { env });
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('[ArchitectureDebt]');
    } finally {
      if (previous === undefined) delete process.env.REPO_HARNESS_NODE_BIN;
      else process.env.REPO_HARNESS_NODE_BIN = previous;
    }
  });

  test('Claude Stop names citation debt once per branch and id set', () => {
    const cwd = noticeFixture();
    const first = stop(cwd);
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toContain(`[ArchitectureDebt] 1 new in ${NOTICE_CAPABILITY}`);
    expect(first.stdout).toContain('Run:');
    expect(Buffer.byteLength(first.stdout)).toBeLessThanOrEqual(800);
    expect(first.stderr).toBe('');
    expect(first.systemMessage).toBe(`Architecture: 1 debt item in ${NOTICE_CAPABILITY}; run repo-harness architecture-debt --json.`);
    expect(stop(cwd)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(git(cwd, ['status', '--porcelain'])).toBe('M src/module/read.ts');
  });

  test('clean main skips debt and a dirty owned main path delivers it', () => {
    const cwd = noticeFixture();
    fixtureCommit(cwd);
    git(cwd, ['branch', '-f', 'main', 'HEAD']);
    git(cwd, ['checkout', 'main']);
    expect(stop(cwd)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(existsSync(join(cwd, '.ai/harness/state/agent-notice'))).toBe(false);
    fixtureWrite(cwd, 'src/module/read.ts', 'export const read = () => 3;\n');
    expect(stop(cwd).stdout).toContain('[ArchitectureDebt]');
  });

  test('manifest changes do not clear debt or renew an unchanged id set', () => {
    const cwd = noticeFixture();
    fixtureWrite(cwd, 'docs/architecture/.projection-manifest.json', '{"profile":"repo-harness/v1"}\n');
    expect(stop(cwd).stdout).toContain('[ArchitectureDebt]');
    const marker = readFileSync(join(cwd, '.ai/harness/state/agent-notice'), 'utf8');
    fixtureWrite(cwd, 'docs/architecture/.projection-manifest.json', '{"profile":"repo-harness/v1","refreshed":true}\n');
    expect(stop(cwd)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(readFileSync(join(cwd, '.ai/harness/state/agent-notice'), 'utf8')).toBe(marker);
  });

  test('a changed debt id set delivers both lines', () => {
    const cwd = noticeFixture();
    expect(stop(cwd).systemMessage).toContain('Architecture: 1 debt item');
    fixtureWrite(cwd, 'docs/architecture/modules/test/module.md', '## 3. Decisions\nRead `src/module/read.ts:998` and `src/module/read.ts:997`.\n');
    const changed = stop(cwd);
    expect(changed.systemMessage).toBe(`Architecture: 2 debt items in ${NOTICE_CAPABILITY}; run repo-harness architecture-debt --json.`);
    expect(changed.stdout).toContain('[ArchitectureDebt] 2 new');
    expect(stop(cwd)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });

  test('a marker read failure drops both lines and emits one operator diagnostic', () => {
    const cwd = noticeFixture();
    mkdirSync(join(cwd, '.ai/harness/state/agent-notice'), { recursive: true });
    const result = stop(cwd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.systemMessage).toBeUndefined();
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
    expect(existsSync(join(cwd, '.ai/harness/handoff/current.md'))).toBe(false);
  });

  test('a continued Stop and Codex stay silent and do not consume the notice', () => {
    const cwd = noticeFixture();
    expect(stop(cwd, { payload: { stop_hook_active: true } })).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(stop(cwd, { identity: hookIdentity({ host: 'codex' }) })).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(existsSync(join(cwd, '.ai/harness/state/agent-notice'))).toBe(false);
    expect(stop(cwd).stdout).toContain('[ArchitectureDebt]');
  });

  test('an ownership failure shows one failure line and writes no recovery file', () => {
    const cwd = noticeFixture();
    fixtureWrite(cwd, '.archcontext/model/nodes/capability.test.module.yaml', '{not json');
    const result = stop(cwd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toStartWith('[Architecture] notice unavailable (error): ');
    expect(result.stdout).not.toContain('[ArchitectureDebt]');
    expect(result.systemMessage).toBe('Architecture: notice unavailable (error); run repo-harness architecture-debt --json.');
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
    expect(result.stderr).toContain('architecture notice unavailable');
    expect(existsSync(join(cwd, '.ai/harness/handoff/current.md'))).toBe(false);
  });
});

describe('Stop observes workflow gaps without permission gates', () => {
  test('Stop is silent on every host and never resolves workflow state', () => {
    for (const host of ['claude', 'codex'] as const) {
      const cwd = fixture();
      const result = runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host }) });
      expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
      expect(existsSync(join(cwd, '.ai/harness/handoff/current.md'))).toBe(false);
    }
  });
  test('Stop writes no architecture or capability runtime state', () => {
    const { cwd } = gitFixture();
    mkdirSync(join(cwd, 'src'), { recursive: true }); writeFileSync(join(cwd, 'src/change.ts'), 'export const x = 1;');
    // #737: stdout is the Claude Stop channel for architecture debt.
    // This repository declares no capability registry, so the channel stays
    // empty; Stop never starts projection or records drift.
    const result = runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host: 'claude' }) });
    expect(result.stdout).toBe('');
    expect(existsSync(join(cwd, '.ai/harness/architecture-projection'))).toBe(false);
    expect(existsSync(join(cwd, '.ai/harness/state/architecture-drift-cursor.json'))).toBe(false);
    expect(existsSync(join(cwd, '.ai/harness/runs/unplanned-implementation.jsonl'))).toBe(false);
    expect(existsSync(join(cwd, '.ai/harness/capability-context/requests.jsonl'))).toBe(false);
  });
});

describe('Stop protected path report (#851)', () => {
  const STATE = '.ai/harness/state/protected-paths.json';

  function write(cwd: string, path: string, content: string): void {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  }

  function stop(cwd: string, host: 'claude' | 'codex' = 'claude') {
    return runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host }) });
  }

  /** A repository with existing private state; the first Stop records it silently. */
  function baselined(host: 'claude' | 'codex' = 'claude'): string {
    const { cwd } = gitFixture();
    write(cwd, '_ops/env/a.env', 'A=1\n');
    write(cwd, '_ops/env/b.env', 'B=1\n');
    write(cwd, '_ref/upstream/README.md', '# upstream\n');
    expect(stop(cwd, host)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(existsSync(join(cwd, STATE))).toBe(true);
    return cwd;
  }

  test('a Bash write, a delete and a new file under _ops/ or _ref/ are reported', () => {
    const cwd = baselined();
    write(cwd, '_ops/env/a.env', 'A=changed-by-bash\n');
    rmSync(join(cwd, '_ops/env/b.env'));
    write(cwd, '_ref/upstream/notes.md', 'new\n');

    const result = stop(cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('[ProtectedPathChange] 3 paths under _ops/ or _ref/ changed since the last Stop.');
    expect(result.stdout).toContain('- modified _ops/env/a.env');
    expect(result.stdout).toContain('- deleted _ops/env/b.env');
    expect(result.stdout).toContain('- added _ref/upstream/notes.md');
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(800);
    expect(result.systemMessage).toStartWith('Protected paths: 3 changes under _ops/ or _ref/ since the last Stop');
  });

  test('an edit the guard allows and an edit the guard denies produce no report', () => {
    const cwd = baselined();
    const identity = hookIdentity();
    const allowed = runMutationGuard({ repoRoot: cwd, payload: { tool_input: { file_path: 'src/x.ts' } }, identity });
    expect(allowed.exitCode).toBe(0);
    write(cwd, 'src/x.ts', 'export const x = 1;\n');
    const denied = runMutationGuard({ repoRoot: cwd, payload: { tool_input: { file_path: '_ops/env/a.env' } }, identity });
    expect(denied.exitCode).toBe(2);

    const result = stop(cwd);

    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });

  test('the same path set on the same branch is reported once', () => {
    const cwd = baselined();
    write(cwd, '_ops/logs/run.log', 'first\n');
    expect(stop(cwd).stdout).toContain('- added _ops/logs/run.log');

    write(cwd, '_ops/logs/run.log', 'second run, longer\n');
    expect(stop(cwd)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(stop(cwd)).toEqual({ exitCode: 0, stdout: '', stderr: '' });

    write(cwd, '_ops/logs/other.log', 'other\n');
    expect(stop(cwd).stdout).toContain('- added _ops/logs/other.log');
  });

  test('Codex Stop writes the report as one stderr line and no stdout', () => {
    const cwd = baselined('codex');
    write(cwd, '_ops/env/a.env', 'A=changed-by-bash\n');

    const result = stop(cwd, 'codex');

    expect(result.stdout).toBe('');
    expect(result.systemMessage).toBeUndefined();
    expect(result.stderr.trimEnd().split('\n')).toHaveLength(1);
    expect(result.stderr).toContain('Protected paths: 1 change under _ops/ or _ref/ since the last Stop (_ops/env/a.env)');
  });

  test('a state path that Git does not ignore writes no state and one diagnostic', () => {
    const { cwd } = gitFixture();
    writeFileSync(join(cwd, '.gitignore'), '.ai/harness/handoff/\n');
    write(cwd, '_ops/env/a.env', 'A=1\n');

    const result = stop(cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr.trimEnd().split('\n')).toHaveLength(1);
    expect(result.stderr).toContain('protected path check unavailable');
    expect(existsSync(join(cwd, STATE))).toBe(false);
  });

  test('more than 5,000 entries under _ops/ and _ref/ writes no state and one diagnostic', () => {
    const { cwd } = gitFixture();
    mkdirSync(join(cwd, '_ref/clone'), { recursive: true });
    for (let index = 0; index < 5_001; index += 1) writeFileSync(join(cwd, '_ref/clone', `f${index}`), '');

    const result = stop(cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr.trimEnd().split('\n')).toHaveLength(1);
    expect(result.stderr).toContain('more than 5000 entries under _ops/ and _ref/');
    expect(existsSync(join(cwd, STATE))).toBe(false);
  });

  test('the first file under _ops/ after a Stop with no _ops/ or _ref/ is reported', () => {
    const { cwd } = gitFixture();
    expect(stop(cwd)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(JSON.parse(readFileSync(join(cwd, STATE), 'utf8'))).toEqual({ entries: {}, notified: null });

    write(cwd, '_ops/env/a.env', 'A=1\n');

    expect(stop(cwd).stdout).toContain('- added _ops/env/a.env');
  });

  test('an empty baseline on a state path that Git does not ignore stays silent and writes no state', () => {
    const { cwd } = gitFixture();
    writeFileSync(join(cwd, '.gitignore'), '.ai/harness/handoff/\n');
    expect(stop(cwd)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(existsSync(join(cwd, STATE))).toBe(false);
  });
});
