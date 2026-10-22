import { describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(import.meta.dir, '../scripts/check-protected-paths.ts');

function fixture(run: (root: string, git: (...args: string[]) => void) => void) {
  const root = mkdtempSync(join(tmpdir(), 'protected-git-paths-'));
  const git = (...args: string[]) => { execFileSync('git', args, { cwd: root, stdio: 'pipe' }); };
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.com');
    writeFileSync(join(root, '.gitignore'), '_ops/\n_ref/\n');
    git('add', '.'); git('commit', '-qm', 'seed');
    run(root, git);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function check(root: string, args: string[] = [], override?: string) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, REPO_HARNESS_ALLOW_PROTECTED_PATHS: override },
  });
}

describe('Git protected path boundary', () => {
  test('ignored local state is allowed, forced staging is rejected and only exact override 1 permits it', () => {
    fixture((root, git) => {
      mkdirSync(join(root, '_ops')); writeFileSync(join(root, '_ops/private env'), 'fixture');
      expect(check(root).status).toBe(0);
      git('add', '-f', '_ops/private env');
      const blocked = check(root);
      expect(blocked.status).toBe(1); expect(blocked.stderr).toContain('_ops/private env');
      expect(check(root, [], 'true').status).toBe(1);
      const allowed = check(root, [], '1');
      expect(allowed.status).toBe(0); expect(allowed.stderr).toContain('override');
    });
  });

  test('committed protected paths fail the CI tree check even with an empty staged diff', () => {
    fixture((root, git) => {
      mkdirSync(join(root, '_ref')); writeFileSync(join(root, '_ref/source\nname'), 'fixture');
      git('add', '-f', '_ref/source\nname'); git('commit', '-qm', 'fixture');
      expect(check(root).status).toBe(0);
      const blocked = check(root, ['--tracked']);
      expect(blocked.status).toBe(1); expect(blocked.stderr).toContain('_ref/source\\nname');
    });
  });

  test('staged removal and rename out of protected roots are still mutations', () => {
    fixture((root, git) => {
      mkdirSync(join(root, '_ops')); writeFileSync(join(root, '_ops/file'), 'fixture');
      git('add', '-f', '_ops/file'); git('commit', '-qm', 'fixture');
      git('mv', '_ops/file', 'safe.txt');
      expect(check(root).status).toBe(1);
    });
  });

  test('root entries are protected; similarly named and nested product paths are allowed', () => {
    fixture((root, git) => {
      mkdirSync(join(root, 'src/_ops'), { recursive: true });
      writeFileSync(join(root, 'src/_ops/fixture'), 'fixture');
      writeFileSync(join(root, '_ops-example'), 'fixture'); git('add', '.');
      expect(check(root).status).toBe(0);
      writeFileSync(join(root, '_ref'), 'fixture'); git('add', '_ref');
      expect(check(root).status).toBe(1);
    });
  });

  test('Git failure and invalid arguments fail closed', () => {
    const root = mkdtempSync(join(tmpdir(), 'protected-no-git-'));
    try {
      expect(check(root).status).not.toBe(0);
      expect(check(root, [], '1').status).not.toBe(0);
      expect(check(root, ['--unknown']).status).not.toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
