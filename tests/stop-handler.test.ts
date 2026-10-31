import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'fs';
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
