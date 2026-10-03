import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROOT = join(import.meta.dir, '..');
const SCRIPT = join(ROOT, 'scripts/merge-gate.ts');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(root: string, ...args: string[]) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim();
}
function fixture(disabled = false) {
  const root = mkdtempSync(join(tmpdir(), 'automatic-merge-gate-')); roots.push(root);
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Gate Test'); git(root, 'config', 'user.email', 'gate@example.invalid');
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ merge_gate: { enabled: !disabled } }));
  writeFileSync(join(root, 'base.txt'), 'base'); git(root, 'add', '-A'); git(root, 'commit', '-m', 'base');
  git(root, 'switch', '-c', 'codex/test'); writeFileSync(join(root, 'feature.txt'), 'feature');
  git(root, 'add', '-A'); git(root, 'commit', '-m', 'candidate');
  return root;
}
function invoke(root: string, command: string, rest: string[] = []) {
  return spawnSync(process.execPath, [SCRIPT, command, '--base', 'main', ...rest], { cwd: root, encoding: 'utf8', timeout: 10000 });
}
describe('main automatic check boundary', () => {
  test('old policy switch cannot disable main checks and ordinary fingerprint needs no plan or receipt', () => {
    const root = fixture(true);
    const observed = invoke(root, 'fingerprint', ['--format', 'required']);
    expect(observed.status).toBe(0); expect(observed.stdout.trim()).toBe('true');
    const refused = invoke(root, 'run');
    expect(refused.status).not.toBe(0); expect(refused.stderr).toContain('GitHub PR readback unavailable');
    expect(existsSync(join(root, 'tasks'))).toBe(false);
  });
  test('credential scan rejects before push and never prints matched bytes', () => {
    const root = fixture(); const secret = ['ghp_', 'A'.repeat(36)].join('');
    writeFileSync(join(root, 'feature.txt'), secret); git(root, 'add', '-A'); git(root, 'commit', '-m', 'unsafe candidate');
    const r = invoke(root, 'fingerprint');
    expect(r.status).not.toBe(0); expect(r.stderr).toContain('github-personal-token');
    expect(r.stderr).not.toContain(secret); expect(r.stdout).not.toContain(secret);
  });
  test('dirty candidate is refused before provider readback without erasing work', () => {
    const root = fixture(); writeFileSync(join(root, 'work.txt'), 'keep');
    const r = invoke(root, 'run');
    expect(r.status).not.toBe(0); expect(r.stderr).toContain('candidate worktree is dirty');
    expect(existsSync(join(root, 'work.txt'))).toBe(true);
  });
  test('post-freeze lifecycle exceptions are not a second authority', () => {
    const r = invoke(fixture(), 'run', ['--allow-post-freeze', 'tasks/current.md']);
    expect(r.status).not.toBe(0); expect(r.stderr).toContain('unknown argument');
  });
  test('candidate-owned helper cannot authorize its own merge', () => {
    const root = fixture(); mkdirSync(join(root, 'scripts'));
    copyFileSync(SCRIPT, join(root, 'scripts/merge-gate.ts'));
    copyFileSync(join(ROOT, 'scripts/acceptance-receipt.ts'), join(root, 'scripts/acceptance-receipt.ts'));
    symlinkSync(join(ROOT, 'src'), join(root, 'src'), 'dir');
    symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
    git(root, 'add', '-A'); git(root, 'commit', '-m', 'candidate helper');
    const r = spawnSync(process.execPath, [join(root, 'scripts/merge-gate.ts'), 'run', '--base', 'main'], { cwd: root, encoding: 'utf8', timeout: 10000 });
    expect(r.status).not.toBe(0); expect(r.stderr).toContain('installed repo-harness helper runtime');
  });
});
