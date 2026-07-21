import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runCommandObserved, type CommandObservedFs } from '../src/cli/hook/command-observed';

function workspace(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
}

function checks(repoRoot: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, '.ai/harness/checks/post-bash-latest.json'), 'utf8')) as Record<string, unknown>;
}

function commandInput(command: string, toolOutput: unknown, exitCode: number): string {
  return JSON.stringify({ tool_input: { command }, tool_output: toolOutput, exit_code: exitCode });
}

describe('runCommandObserved', () => {
  test('writes the structured post-bash check and preserves broad-command metadata', () => {
    const repoRoot = workspace('command-observed');
    try {
      const result = runCommandObserved({
        repoRoot,
        input: JSON.stringify({
          tool_input: { command: 'rg foo' },
          tool_output: 'src/a.ts:foo\nsrc/b.ts:foo\n',
          exit_code: 0,
        }),
        env: { PATH: '' },
        dependencies: { hasExecutable: () => false },
      });
      expect(result.exitCode).toBe(0);
      expect(result.reason).toBe('ok');
      expect(result.stdout).toContain('[ChecksFile] Updated .ai/harness/checks/post-bash-latest.json');
      const checks = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/checks/post-bash-latest.json'), 'utf8')) as Record<string, unknown>;
      expect(checks).toMatchObject({
        source: 'post-bash',
        command: 'rg foo',
        exit_code: 0,
        status: 'pass',
        broad_command: true,
        output_line_count: 2,
        verbosity_class: 'inline',
        suggested_runner: 'inline',
        raw_output_path: null,
        raw_output_bytes: Buffer.byteLength('src/a.ts:foo\nsrc/b.ts:foo\n'),
        raw_output_sha256: null,
        failure_signal: false,
        recommended_next_tool: 'codegraph_context',
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('stores long output as raw evidence and uses an injected runner probe', () => {
    const repoRoot = workspace('command-observed-long');
    try {
      const output = Array.from({ length: 201 }, (_, index) => `line-${index}`).join('\n');
      const result = runCommandObserved({
        repoRoot,
        input: JSON.stringify({ tool_input: { command: 'rg foo' }, tool_output: output, exit_code: 0 }),
        dependencies: { hasExecutable: (name) => name === 'rtk', now: () => new Date('2026-07-21T12:34:56.000Z') },
      });
      expect(result.exitCode).toBe(0);
      const checks = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/checks/post-bash-latest.json'), 'utf8')) as { verbosity_class: string; raw_output_path: string; suggested_runner: string; raw_output_sha256: string };
      expect(checks.verbosity_class).toBe('long');
      expect(checks.suggested_runner).toBe('rtk');
      expect(checks.raw_output_path).toMatch(/^\.ai\/harness\/runs\/bash-output\/post-bash-20260721T123456-\d+-[a-f0-9]{12}\.log$/);
      expect(readFileSync(join(repoRoot, checks.raw_output_path), 'utf8')).toBe(output);
      expect(checks.raw_output_sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('preserves verify-sprint checks while writing an additive post-bash record', () => {
    const repoRoot = workspace('command-observed-preserve');
    try {
      mkdirSync(join(repoRoot, '.ai/harness/checks'), { recursive: true });
      const existing = { source: 'verify-sprint', status: 'pass', exit_code: 0, run_id: 'run-1' };
      writeFileSync(join(repoRoot, '.ai/harness/checks/latest.json'), `${JSON.stringify(existing)}\n`);

      const result = runCommandObserved({
        repoRoot,
        input: commandInput('git status --short', '', 0),
        env: { PATH: '' },
        dependencies: { hasExecutable: () => false },
      });

      expect(result).toMatchObject({ exitCode: 0, reason: 'ok' });
      expect(result.stdout).toBe('[ChecksFile] Preserved .ai/harness/checks/latest.json; updated .ai/harness/checks/post-bash-latest.json.\n');
      expect(JSON.parse(readFileSync(join(repoRoot, '.ai/harness/checks/latest.json'), 'utf8'))).toEqual(existing);
      expect(checks(repoRoot)).toMatchObject({
        source: 'post-bash',
        command: 'git status --short',
        status: 'pass',
        verbosity_class: 'inline',
        suggested_runner: 'inline',
        raw_output_path: null,
        raw_output_bytes: 0,
        raw_output_sha256: null,
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('keeps the retired broad-command classifier boundaries and output counts', () => {
    const repoRoot = workspace('command-observed-broad-boundaries');
    try {
      const cases: Array<[string, boolean]> = [
        ['find ./', true],
        ['ls -R', true],
        ['rg foo', true],
        ['grep -R foo', true],
        ['cat src/*.ts', true],
        ['rg foo src/', false],
        ['grep foo src/', false],
        ['cat README.md', false],
        ['git status --short', false],
      ];
      for (const [command, broad] of cases) {
        const output = 'line-one\nline-two\n';
        const result = runCommandObserved({
          repoRoot,
          input: commandInput(command, output, 0),
          env: { PATH: '' },
          dependencies: { hasExecutable: () => false },
        });
        expect(result.exitCode, command).toBe(0);
        expect(checks(repoRoot), command).toMatchObject({
          command,
          broad_command: broad,
          recommended_next_tool: broad ? 'codegraph_context' : '',
          output_line_count: 2,
          raw_output_bytes: Buffer.byteLength(output),
          failure_signal: false,
        });
      }
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('serializes structured tool output and honors host environment fallbacks', () => {
    const repoRoot = workspace('command-observed-input-fallbacks');
    try {
      const structured = { nested: true, values: [1, 2] };
      const result = runCommandObserved({
        repoRoot,
        input: JSON.stringify({ tool_input: { command: 'bun test' }, tool_output: structured }),
        env: { PATH: '', TOOL_OUTPUT: '', EXIT_CODE: '0' },
        dependencies: { hasExecutable: () => false },
      });
      expect(result.exitCode).toBe(0);
      expect(checks(repoRoot)).toMatchObject({
        command: 'bun test',
        exit_code: 0,
        output_line_count: 1,
        raw_output_bytes: Buffer.byteLength(JSON.stringify(structured)),
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('preserves failed command output as raw evidence and emits the rewrite reminder', () => {
    const repoRoot = workspace('command-observed-failure');
    try {
      const output = 'FAIL tests/command-observed.test.ts\nexpected pass\n';
      const result = runCommandObserved({
        repoRoot,
        input: commandInput('bun test tests/command-observed.test.ts', output, 1),
        env: { PATH: '' },
        dependencies: { hasExecutable: () => false },
      });
      expect(result).toMatchObject({ exitCode: 0, reason: 'ok' });
      expect(result.stdout).toContain('[PostBash] Tests failed. Reminder: failure = rewrite module, not patching.');
      const record = checks(repoRoot);
      expect(record).toMatchObject({
        status: 'fail',
        verbosity_class: 'failure',
        suggested_runner: 'raw',
        failure_signal: true,
        raw_output_bytes: Buffer.byteLength(output),
      });
      expect(typeof record.raw_output_path).toBe('string');
      expect(readFileSync(join(repoRoot, record.raw_output_path as string), 'utf8')).toBe(output);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('does not turn a successful command into a failure when output contains a failure signal', () => {
    const repoRoot = workspace('command-observed-successful-failure-signal');
    try {
      const output = 'docs/debug.md:Traceback appears in this example\n';
      const result = runCommandObserved({
        repoRoot,
        input: commandInput('rg Traceback docs/', output, 0),
        env: { PATH: '' },
        dependencies: { hasExecutable: () => false },
      });
      expect(result).toMatchObject({ exitCode: 0, stdout: expect.not.stringContaining('[PostBash]') });
      expect(checks(repoRoot)).toMatchObject({
        status: 'pass',
        verbosity_class: 'inline',
        suggested_runner: 'inline',
        failure_signal: true,
        raw_output_path: null,
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('records a failed exit without a matching failure signal as raw evidence but stays advisory-only', () => {
    const repoRoot = workspace('command-observed-failed-no-signal');
    try {
      const output = 'command returned status 1\n';
      const result = runCommandObserved({
        repoRoot,
        input: commandInput('bun run check:type', output, 1),
        env: { PATH: '' },
        dependencies: { hasExecutable: () => false },
      });
      expect(result).toMatchObject({ exitCode: 0, reason: 'ok' });
      expect(result.stdout).not.toContain('[PostBash] Tests failed');
      const record = checks(repoRoot);
      expect(record).toMatchObject({ status: 'fail', verbosity_class: 'failure', suggested_runner: 'raw', failure_signal: false });
      expect(readFileSync(join(repoRoot, record.raw_output_path as string), 'utf8')).toBe(output);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('fails closed when the repair circuit denies a failing command', () => {
    const repoRoot = workspace('command-observed-circuit');
    try {
      const result = runCommandObserved({
        repoRoot,
        input: commandInput('bun test', 'FAILED test\n', 1),
        env: { PATH: '' },
        dependencies: {
          hasExecutable: () => false,
          recordCircuit: () => ({
            protocol: 1,
            allowed: false,
            tripped: true,
            guard: 'RepairLimit',
            reason: 'automatic repair loop cap',
            path_action: 'bun test',
            progress_token: 'unknown',
            repeat_count: 3,
            limit: 2,
            required_action: 'terminal: stop automatic retries; change state or wait for an explicit user decision',
            explicit_override_command: null,
          }),
        },
      });
      expect(result.exitCode).toBe(2);
      expect(result.reason).toBe('repair-circuit-tripped');
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('"tripped":true');
      expect(existsSync(join(repoRoot, '.ai/harness/checks/post-bash-latest.json'))).toBe(false);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('returns a write error rather than dispatching the retired shell route', () => {
    const repoRoot = workspace('command-observed-write-error');
    try {
      const fsApi: CommandObservedFs = {
        existsSync: () => false,
        readFileSync: () => '',
        realpathSync: (path) => path,
        statSync: () => ({ isFile: () => true }),
        mkdirSync: () => undefined,
        writeFileSync: () => { throw new Error('disk full'); },
      };
      const result = runCommandObserved({
        repoRoot,
        input: commandInput('git status --short', '', 0),
        env: { PATH: '' },
        dependencies: { fs: fsApi, hasExecutable: () => false },
      });
      expect(result.exitCode).toBe(1);
      expect(result.reason).toBe('write-failed');
      expect(result.stderr).toContain('[PostBash] disk full');
      expect(result.stderr).not.toContain('run-hook.sh');
      expect(result.stderr).not.toContain('post-bash.sh');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('keeps malformed host input observable while preserving the neutral check side effect', () => {
    const repoRoot = workspace('command-observed-malformed-input');
    try {
      const result = runCommandObserved({
        repoRoot,
        input: 'not json',
        env: { PATH: '' },
        dependencies: { hasExecutable: () => false },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('[HookInput] WARN');
      expect(checks(repoRoot)).toMatchObject({ command: '', status: 'pass', exit_code: 0 });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
