import { describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runHook } from '../../src/cli/hook/runtime';
import { getRoute } from '../../src/cli/hook/route-registry';
import { buildHookCommand } from '../../src/cli/installer/managed-entries';
import { inspectWorkflowMarker } from '../../src/core/adoption/minimum-harness-version';

const HOOK_ENTRY = join(import.meta.dir, '..', '..', 'src', 'cli', 'hook-entry.ts');

function repo(optIn = true): string {
  const root = mkdtempSync(join(tmpdir(), 'hrd09-runtime-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  if (optIn) writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

function env(root: string, host: 'claude' | 'codex' | 'pi' = 'claude'): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOOK_REPO_ROOT: root,
    HOOK_HOST: host,
    REPO_HARNESS_WORKFLOW_PROFILE: 'routine',
  };
}

function clean(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

describe('typed hook runtime', () => {
  test('fails open outside a git repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'hrd09-not-git-'));
    try {
      // #691 finding 7: HOOK_REPO_ROOT is trusted as the root, so only a call
      // without it (Pi, or a direct call) resolves the root from a non-git cwd.
      const { HOOK_REPO_ROOT: _managedRoot, ...unmanaged } = env(root);
      const result = runHook({ event: 'Stop', routeId: 'default', cwd: root, env: unmanaged });
      expect(result).toEqual({ exitCode: 0, reason: 'not-in-git-repo' });
    } finally { clean(root); }
  });

  test('fails open without the opt-in contract', () => {
    const root = repo(false);
    try {
      const result = runHook({ event: 'Stop', routeId: 'default', cwd: root, env: env(root) });
      expect(result.reason).toBe('non-opt-in');
      expect(result.handler).toBeUndefined();
    } finally { clean(root); }
  }, 30_000);

  test('an older hook reports an upgrade instruction instead of capability_registry:invalid', () => {
    const root = repo();
    try {
      // The model authority is archcontext without nodes, which an ordinary
      // resolution reports as capability_registry:invalid.
      writeFileSync(join(root, '.ai/harness/policy.json'), `${JSON.stringify({ context: { capability_source: 'archcontext' } })}\n`);
      writeFileSync(join(root, '.ai/harness/workflow-contract.json'), `${JSON.stringify({ kind: 'repo-harness.workflow-contract-marker', protocol: 1, minimum_harness_version: '999.0.0' })}\n`);
      const result = runHook({ event: 'Stop', routeId: 'default', cwd: root, env: env(root) });
      expect(result).toMatchObject({ exitCode: 1, reason: 'harness-upgrade-required' });
      expect(result.handler).toBeUndefined();

      const spawned = spawnSync(process.execPath, [HOOK_ENTRY, 'SessionStart', '--route', 'default'], { cwd: root, env: env(root), input: '', encoding: 'utf8' });
      expect(spawned.status).toBe(1);
      expect(spawned.stderr).toContain('This repository needs repo-harness >= 999.0.0;');
      expect(spawned.stderr).toContain('Run `repo-harness update`');
      expect(`${spawned.stdout}${spawned.stderr}`).not.toContain('capability_registry:invalid');
    } finally { clean(root); }
  }, 30_000);

  test('a newer declared minimum leaves every edit guard in force and reports on SessionStart', () => {
    const root = repo();
    try {
      writeFileSync(join(root, '.ai/harness/workflow-contract.json'), `${JSON.stringify({ minimum_harness_version: '999.0.0' })}\n`);
      const edit = (filePath: string) => spawnSync(process.execPath, [HOOK_ENTRY, 'PreToolUse', '--route', 'edit'], {
        cwd: root, env: env(root), encoding: 'utf8',
        input: `${JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath, content: 'x' } })}\n`,
      });
      // The tool route runs; the gate does not turn a deny into an allow.
      const denied = edit(join(root, '_ops', 'private'));
      expect(denied.status).toBe(2);
      expect(denied.stderr).toContain('OpsPrivateGuard');
      expect(denied.stderr).not.toContain('needs repo-harness');
      expect(existsSync(join(root, '_ops', 'private'))).toBe(false);
      expect(edit(join(root, 'README.md')).status).toBe(0);

      const session = spawnSync(process.execPath, [HOOK_ENTRY, 'SessionStart', '--route', 'default'], { cwd: root, env: env(root), input: '', encoding: 'utf8' });
      expect(session.status).toBe(1);
      expect(session.stderr).toContain('This repository needs repo-harness >= 999.0.0;');

      // The JSON form carries the message, so Pi can show it.
      const json = runHook({ event: 'SessionStart', routeId: 'default', cwd: root, env: { ...env(root), HOOK_HOST: 'pi' } });
      expect(json.json).toMatchObject({ reason: 'harness-upgrade-required', exit_code: 1, decision: 'block' });
      expect(json.json?.diagnostics).toContain('This repository needs repo-harness >= 999.0.0;');
    } finally { clean(root); }
  }, 30_000);

  test('a declared minimum at or below the running version lets the hook run', () => {
    const root = repo();
    try {
      const running = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'package.json'), 'utf8')).version as string;
      writeFileSync(join(root, '.ai/harness/workflow-contract.json'), `${JSON.stringify({ kind: 'repo-harness.workflow-contract-marker', protocol: 1, minimum_harness_version: running })}\n`);
      const result = runHook({ event: 'Stop', routeId: 'default', cwd: root, input: JSON.stringify({ stop_hook_active: false }), env: env(root) });
      expect(result.handler).toBe('stop');
    } finally { clean(root); }
  }, 30_000);

  test('an invalid marker or minimum version fails closed with its cause', () => {
    const root = repo();
    try {
      for (const [marker, cause] of [
        ['{ broken\n', 'workflow-contract.json is not valid JSON'],
        [`${JSON.stringify({ minimum_harness_version: 'latest' })}\n`, 'minimum_harness_version must be a release version'],
      ] as const) {
        writeFileSync(join(root, '.ai/harness/workflow-contract.json'), marker);
        expect(runHook({ event: 'Stop', routeId: 'default', cwd: root, env: env(root) })).toMatchObject({ exitCode: 1, reason: 'workflow-marker-invalid' });
        const gate = inspectWorkflowMarker(root, () => '1.0.0');
        expect(gate?.code).toBe('workflow-marker-invalid');
        expect(gate?.message).toContain(cause);
      }
      writeFileSync(join(root, '.ai/harness/workflow-contract.json'), `${JSON.stringify({ minimum_harness_version: '1.2.3' })}\n`);
      expect(inspectWorkflowMarker(root, () => '1.2.2')?.code).toBe('harness-upgrade-required');
      expect(inspectWorkflowMarker(root, () => '1.2.3-beta.1')?.code).toBe('harness-upgrade-required');
      expect(inspectWorkflowMarker(root, () => '1.2.3')).toBeNull();
      expect(inspectWorkflowMarker(root, () => { throw new Error('no version'); })?.message).toContain('the running version is unreadable (no version)');
    } finally { clean(root); }
  }, 30_000);

  test('the managed HOOK_REPO_ROOT is the root without a second git lookup', () => {
    const root = repo();
    const other = repo();
    try {
      const result = runHook({
        event: 'Stop',
        routeId: 'default',
        cwd: root,
        input: JSON.stringify({ stop_hook_active: true }),
        env: { ...env(root), HOOK_REPO_ROOT: other },
      });
      expect(result.repoRoot).toBe(realpathSync(other));
    } finally { clean(root); clean(other); }
  }, 30_000);

  test('a missing HOOK_HOST fails before any handler runs', () => {
    const root = repo();
    try {
      const hostless = { ...env(root) };
      delete hostless.HOOK_HOST;
      expect(runHook({ event: 'Stop', routeId: 'default', cwd: root, env: hostless }))
        .toEqual({ exitCode: 1, reason: 'unknown-host' });
      expect(runHook({ event: 'PreToolUse', routeId: 'edit', cwd: root, env: hostless }))
        .toEqual({ exitCode: 2, reason: 'unknown-host' });
      expect(existsSync(join(root, '.ai/harness/runs/hook-events.jsonl'))).toBe(false);
    } finally { clean(root); }
  }, 30_000);

  test('a route that is not installed for the host exits 2 with one stderr line', () => {
    const root = repo();
    try {
      const result = spawnSync(process.execPath, [HOOK_ENTRY, 'PreToolUse', '--route', 'subagent'], {
        cwd: root,
        env: env(root, 'codex'),
        input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Agent' }),
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim().split('\n')).toHaveLength(1);
      expect(result.stderr).toContain('unsupported-host-route');
      expect(existsSync(join(root, '.ai/harness/delegation'))).toBe(false);
    } finally { clean(root); }
  }, 30_000);

  test('a managed call spawns one git process to find the root', () => {
    const root = repo();
    const bin = mkdtempSync(join(tmpdir(), 'hrd09-managed-bin-'));
    try {
      const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
      const gitLog = join(bin, 'git.log');
      writeFileSync(join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "$GIT_LOG"\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
      writeFileSync(join(bin, 'repo-harness-hook'), `#!/bin/sh\nexec "${process.execPath}" "${HOOK_ENTRY}" "$@"\n`, { mode: 0o755 });
      const route = getRoute('PreToolUse', 'edit');
      if (!route) throw new Error('missing PreToolUse.edit route');
      const hostEnv: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, GIT_LOG: gitLog, REPO_HARNESS_WORKFLOW_PROFILE: 'routine' };
      delete hostEnv.HOOK_REPO_ROOT;
      delete hostEnv.HOOK_HOST;
      const result = spawnSync('sh', ['-c', buildHookCommand(route, 'claude')], {
        cwd: root,
        env: hostEnv,
        input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'safe' } }),
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(gitLog, 'utf8').trim().split('\n')).toEqual(['rev-parse --show-toplevel']);
      expect(existsSync(join(root, '.ai/harness/runs/hook-events.jsonl'))).toBe(true);
    } finally { clean(root); clean(bin); }
  }, 30_000);

  test('unknown routes do not create a handler or telemetry record', () => {
    const root = repo();
    try {
      const result = runHook({ event: 'Stop', routeId: 'edit', cwd: root, env: env(root) });
      expect(result).toMatchObject({ exitCode: 2, reason: 'unknown-route' });
      expect(result.handler).toBeUndefined();
      expect(existsSync(join(root, '.ai/harness/runs/hook-events.jsonl'))).toBe(false);
    } finally { clean(root); }
  }, 30_000);

  test('retired routes fail closed and name the adapter repair command', () => {
    const root = repo();
    try {
      for (const host of ['claude', 'codex', 'pi'] as const) {
        for (const [event, route] of [['PostToolUse', 'edit'], ['PostToolUse', 'always'],
          ['UserPromptSubmit', 'default'], ['SubagentStop', 'quality']]) {
          const result = spawnSync(process.execPath, [HOOK_ENTRY, event, '--route', route], {
            cwd: root, env: env(root, host), input: '{}', encoding: 'utf8',
          });
          expect(result.status).toBe(2);
          const diagnostic = host === 'pi' ? JSON.parse(result.stdout).diagnostics : result.stderr;
          expect(diagnostic).toContain('unknown route');
          expect(diagnostic).toContain(host === 'pi' ? 'Reload the Pi extension' : `repo-harness install --target ${host} --location global`);
        }
      }
      expect(existsSync(join(root, '.ai/harness/runs/hook-events.jsonl'))).toBe(false);
    } finally { clean(root); }
  }, 30_000);

  test('the removed full CLI hook command is rejected', () => {
    const result = spawnSync(process.execPath, [join(import.meta.dir, '../../src/cli/index.ts'), 'hook'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unknown command 'hook'");
  });

  test('the managed command skips non-opt-in repos and reports a missing bin in opt-in repos', () => {
    const bin = mkdtempSync(join(tmpdir(), 'hrd09-no-hook-bin-'));
    const active = repo();
    const inactive = repo(false);
    try {
      const git = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
      symlinkSync(git, join(bin, 'git'));
      const command = buildHookCommand(getRoute('PreToolUse', 'edit')!, 'claude');
      const hostEnv = { ...process.env, PATH: bin };
      const shell = process.platform === 'win32' ? 'sh' : '/bin/sh';
      const skipped = spawnSync(shell, ['-c', command], { cwd: inactive, env: hostEnv, encoding: 'utf8' });
      expect(skipped.status).toBe(0);
      expect(skipped.stderr).toBe('');
      const missing = spawnSync(shell, ['-c', command], { cwd: active, env: hostEnv, encoding: 'utf8' });
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain('repo-harness-hook');
    } finally { clean(active); clean(inactive); clean(bin); }
  });

  test('dispatches each route through its typed handler identity', () => {
    const root = repo();
    try {
      const cases = [
        ['SessionStart', 'default', undefined, 'session-context'],
        ['PreToolUse', 'edit', JSON.stringify({ tool_input: { file_path: 'README.md' } }), 'mutation-guard'],
        ['PreToolUse', 'subagent', JSON.stringify({ tool_name: 'Agent', tool_input: { prompt: 'inspect' } }), 'return-channel'],
        ['PostToolUse', 'bash', JSON.stringify({ tool_input: { command: 'echo hi' }, tool_response: { stdout: 'hi\n', stderr: '', interrupted: false }, exit_code: 0 }), 'command-observed'],
        ['UserPromptSubmit', 'inbox', JSON.stringify({ prompt: 'continue' }), 'task-inbox'],
        ['UserPromptSubmit', 'delegation', JSON.stringify({ prompt: 'implement next task' }), 'delegation-advisor'],
        ['SubagentStart', 'context', JSON.stringify({ hook_event_name: 'SubagentStart' }), 'subagent-context'],
        ['Stop', 'default', JSON.stringify({ stop_hook_active: false }), 'stop'],
      ] as const;
      for (const [event, routeId, input, handler] of cases) {
        const result = runHook({ event, routeId, cwd: root, input, env: env(root, event === 'PostToolUse' ? 'pi' : event === 'UserPromptSubmit' && routeId === 'delegation' || event === 'SubagentStart' ? 'codex' : 'claude') });
        expect(result.handler).toBe(handler);
      }
    } finally { clean(root); }
  }, 60000);


  test('Codex suppresses successful Stop stdout while preserving failure diagnostics', () => {
    const root = repo();
    try {
      const moduleUrl = new URL('../../src/cli/hook/runtime.ts', import.meta.url).href;
      const script = [
        `const { runHook } = await import(${JSON.stringify(moduleUrl)});`,
        `runHook({ event: 'Stop', routeId: 'default', cwd: ${JSON.stringify(root)}, input: JSON.stringify({ stop_hook_active: false }), env: { ...process.env, HOOK_REPO_ROOT: ${JSON.stringify(root)}, HOOK_HOST: 'codex', REPO_HARNESS_WORKFLOW_PROFILE: 'routine' } });`,
      ].join('\n');
      const result = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
    } finally { clean(root); }
  }, 30_000);

  test('one handled event writes one telemetry record', () => {
    const root = repo();
    try {
      const result = runHook({ event: 'PostToolUse', routeId: 'bash', cwd: root, input: JSON.stringify({ tool_input: { command: 'echo hi' }, tool_response: { stdout: 'hi\n', stderr: '', interrupted: false }, exit_code: 0 }), env: env(root, 'pi') });
      expect(result.handler).toBe('command-observed');
      const lines = readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({ event: 'PostToolUse', route_id: 'bash', reason: 'ok' });
    } finally { clean(root); }
  }, 30_000);
});
