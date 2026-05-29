import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawnSync } from 'child_process';
import { runHook } from '../../src/cli/commands/hook';
import { runHookEntry } from '../../src/cli/hook-entry';

const ROOT = path.join(import.meta.dir, '../..');
const CLI = path.join(ROOT, 'src/cli/index.ts');
const HOOK_ENTRY = path.join(ROOT, 'src/cli/hook-entry.ts');

function withTempRepo(
  opts: { optIn: boolean; scripts?: Record<string, string> },
  fn: (repoRoot: string) => void,
): void {
  const tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-hook-')),
  );
  try {
    execSync('git init', { cwd: tmp, stdio: 'ignore' });
    if (opts.optIn) {
      fs.mkdirSync(path.join(tmp, '.ai/harness'), { recursive: true });
      fs.writeFileSync(path.join(tmp, '.ai/harness/workflow-contract.json'), '{}');
    }
    const hooksDir = path.join(tmp, '.ai/hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    for (const [script, body] of Object.entries(opts.scripts ?? {})) {
      fs.writeFileSync(path.join(hooksDir, script), body, { mode: 0o755 });
    }
    fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('hook command (Phase 1B)', () => {
  test('minimal hook entry delegates to shared runtime instead of copying the route table', () => {
    const content = fs.readFileSync(HOOK_ENTRY, 'utf-8');
    expect(content).toContain('./hook/runtime');
    expect(content).not.toContain('session-start-context.sh');
    expect(content).not.toContain('Object.freeze([');
  });

  test('non-git-repo cwd exits 0 silently (host adapter is global)', () => {
    const tmp = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-')),
    );
    try {
      const result = runHook({ event: 'PreToolUse', routeId: 'edit', cwd: tmp });
      expect(result.exitCode).toBe(0);
      expect(result.reason).toBe('not-in-git-repo');
      expect(result.scriptsRun).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('opt-in marker absent → exits 0 silently (non-opt-in)', () => {
    withTempRepo({ optIn: false }, (repoRoot) => {
      const result = runHook({ event: 'PreToolUse', routeId: 'edit', cwd: repoRoot });
      expect(result.exitCode).toBe(0);
      expect(result.reason).toBe('non-opt-in');
      expect(result.scriptsRun).toEqual([]);
    });
  });

  test('opt-in + unknown (event, route) → exits 2', () => {
    withTempRepo({ optIn: true }, (repoRoot) => {
      const result = runHook({ event: 'Stop', routeId: 'edit', cwd: repoRoot });
      expect(result.exitCode).toBe(2);
      expect(result.reason).toBe('unknown-route');
    });
  });

  test('opt-in + missing .ai/hooks/<script> → exits 3 with failedScript', () => {
    withTempRepo({ optIn: true }, (repoRoot) => {
      const result = runHook({
        event: 'SessionStart',
        routeId: 'default',
        cwd: repoRoot,
      });
      expect(result.exitCode).toBe(3);
      expect(result.reason).toBe('missing-script');
      expect(result.failedScript).toBe('session-start-context.sh');
    });
  });

  test('opt-in + all scripts present and succeed → exits 0, scripts run in registry order', () => {
    withTempRepo(
      {
        optIn: true,
        scripts: {
          'worktree-guard.sh': '#!/bin/bash\nexit 0\n',
          'pre-edit-guard.sh': '#!/bin/bash\nexit 0\n',
        },
      },
      (repoRoot) => {
        const result = runHook({
          event: 'PreToolUse',
          routeId: 'edit',
          cwd: repoRoot,
          stdio: 'ignore',
        });
        expect(result.exitCode).toBe(0);
        expect(result.reason).toBe('ok');
        expect(result.scriptsRun).toEqual(['worktree-guard.sh', 'pre-edit-guard.sh']);
      },
    );
  });

  test('opt-in + first script fails → stops at failure, propagates exit code', () => {
    withTempRepo(
      {
        optIn: true,
        scripts: {
          'worktree-guard.sh': '#!/bin/bash\nexit 7\n',
          'pre-edit-guard.sh': '#!/bin/bash\nexit 0\n',
        },
      },
      (repoRoot) => {
        const result = runHook({
          event: 'PreToolUse',
          routeId: 'edit',
          cwd: repoRoot,
          stdio: 'ignore',
        });
        expect(result.exitCode).toBe(7);
        expect(result.reason).toBe('script-failed');
        expect(result.scriptsRun).toEqual(['worktree-guard.sh']);
        expect(result.failedScript).toBe('worktree-guard.sh');
      },
    );
  });

  test('HOOK_REPO_ROOT is set to resolved repo root in child env', () => {
    withTempRepo(
      {
        optIn: true,
        scripts: {
          'session-start-context.sh':
            '#!/bin/bash\n[ "$HOOK_REPO_ROOT" = "$1" ] && exit 0 || exit 99\n',
        },
      },
      (repoRoot) => {
        const result = runHook({
          event: 'SessionStart',
          routeId: 'default',
          cwd: repoRoot,
          args: [repoRoot],
          stdio: 'ignore',
        });
        expect(result.exitCode).toBe(0);
      },
    );
  });

  test('minimal hook entry runs the same route without loading the full CLI', () => {
    withTempRepo(
      {
        optIn: true,
        scripts: {
          'post-bash.sh': '#!/bin/bash\n[ "$HOOK_REPO_ROOT" = "$1" ] && exit 0 || exit 99\n',
        },
      },
      (repoRoot) => {
        const result = runHookEntry({
          event: 'PostToolUse',
          routeId: 'bash',
          cwd: repoRoot,
          args: [repoRoot],
          stdio: 'ignore',
        });
        expect(result.exitCode).toBe(0);
        expect(result.reason).toBe('ok');
        expect(result.scriptsRun).toEqual(['post-bash.sh']);
      },
    );
  });

  test('CLI dispatcher keeps Codex non-SessionStart stdout empty on success', () => {
    withTempRepo(
      {
        optIn: true,
        scripts: {
          'prompt-guard.sh': '#!/bin/bash\necho codex-noise\n',
        },
      },
      (repoRoot) => {
        const res = spawnSync(
          process.execPath,
          [CLI, 'hook', 'UserPromptSubmit', '--route', 'default'],
          {
            cwd: repoRoot,
            encoding: 'utf-8',
            env: { ...process.env, HOOK_HOST: 'codex' },
          },
        );
        expect(res.status).toBe(0);
        expect(res.stdout).toBe('');
        expect(res.stderr).toBe('');
      },
    );
  });

  test('CLI dispatcher moves Codex failure stdout to stderr', () => {
    withTempRepo(
      {
        optIn: true,
        scripts: {
          'prompt-guard.sh': '#!/bin/bash\necho failure-context\nexit 9\n',
        },
      },
      (repoRoot) => {
        const res = spawnSync(
          process.execPath,
          [CLI, 'hook', 'UserPromptSubmit', '--route', 'default'],
          {
            cwd: repoRoot,
            encoding: 'utf-8',
            env: { ...process.env, HOOK_HOST: 'codex' },
          },
        );
        expect(res.status).toBe(9);
        expect(res.stdout).toBe('');
        expect(res.stderr).toContain('failure-context');
      },
    );
  });

  test('minimal hook entry moves Codex failure stdout to stderr', () => {
    withTempRepo(
      {
        optIn: true,
        scripts: {
          'post-bash.sh': '#!/bin/bash\necho failure-context\nexit 9\n',
        },
      },
      (repoRoot) => {
        const res = spawnSync(
          process.execPath,
          [HOOK_ENTRY, 'PostToolUse', '--route', 'bash'],
          {
            cwd: repoRoot,
            encoding: 'utf-8',
            env: { ...process.env, HOOK_HOST: 'codex' },
          },
        );
        expect(res.status).toBe(9);
        expect(res.stdout).toBe('');
        expect(res.stderr).toContain('failure-context');
      },
    );
  });
});
