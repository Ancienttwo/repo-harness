import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { userInfo } from 'os';
import { join } from 'path';
import { configureProtectedHelperPlatform } from '../../src/cli/commands/global-runtime';
import { protectedChildEnv, runHelper } from '../../src/cli/runtime/helper-runner';
import { resolveProtectedHelperPlatform } from '../../src/cli/runtime/protected-helper-platform';
import { runProcess } from '../../src/effects/process-runner';

const ROOT = join(import.meta.dir, '..', '..');

describe('Windows protected-helper runtime smoke', () => {
  test('runs every protected helper through the pinned Git-for-Windows contract', () => {
    if (process.platform !== 'win32') return;

    const home = userInfo().homedir;
    const configDir = join(home, '.repo-harness');
    const configPath = join(configDir, 'config.json');
    const configDirExisted = existsSync(configDir);
    const previousConfig = existsSync(configPath) ? readFileSync(configPath) : null;
    const previousMode = previousConfig === null ? null : lstatSync(configPath).mode;
    try {
      const setup = configureProtectedHelperPlatform(ROOT, process.execPath, process.env, 'win32');
      expect(setup.status, setup.stderr ?? setup.detail).toBe('ok');

      const hostileEnv: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: 'C:\\repo-harness-attacker',
        HOME: 'C:\\repo-harness-attacker-home',
        BASH_ENV: 'C:\\repo-harness-attacker\\inject.sh',
        REPO_HARNESS_BASH_BIN: 'C:\\repo-harness-attacker\\bash.exe',
        REPO_HARNESS_GIT_BIN: 'C:\\repo-harness-attacker\\git.exe',
        REPO_HARNESS_BUN_BIN: 'C:\\repo-harness-attacker\\bun.exe',
      };
      const cases = [
        { helper: 'acceptance-receipt', args: ['path'], output: '.repo-harness' },
        { helper: 'merge-gate', args: ['fingerprint', '--base', 'HEAD'], output: 'required' },
        { helper: 'contract-worktree', args: ['status'], output: '[ContractWorktree]' },
        { helper: 'ship-worktrees', args: ['--help'], output: 'Usage:' },
      ] as const;

      for (const smoke of cases) {
        const result = runHelper({
          helper: smoke.helper,
          args: smoke.args,
          cwd: ROOT,
          env: hostileEnv,
          stdio: 'pipe',
          timeoutMs: 30_000,
        });
        expect(result.reason, result.stderr).toBe('ok');
        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.stdout).toContain(smoke.output);
      }

      const runtime = resolveProtectedHelperPlatform();
      const timeout = runProcess(process.execPath, ['-e', 'await Bun.sleep(5_000)'], {
        cwd: ROOT,
        env: protectedChildEnv({}, runtime),
        inheritEnv: false,
        processGroup: true,
        taskkillBin: runtime.taskkillBin,
        timeoutMs: 200,
      });
      expect(timeout.timedOut, timeout.error).toBe(true);
      expect(timeout.status).toBe(1);
    } finally {
      if (previousConfig === null) {
        rmSync(configPath, { force: true });
        if (!configDirExisted) rmSync(configDir, { recursive: true, force: true });
      } else {
        writeFileSync(configPath, previousConfig, { mode: previousMode ?? 0o600 });
        chmodSync(configPath, previousMode ?? 0o600);
      }
    }
  }, 120_000);
});
