import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { buildReviewSubject } from '../../src/effects/review/diff-fingerprint';
import { acceptancePolicySource, parseAcceptancePolicy } from '../../scripts/acceptance-receipt';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const cli = resolve(import.meta.dir, '../../src/cli/index.ts');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'retired-cross-review-')); roots.push(root);
  const bin = join(root, 'bin'); mkdirSync(bin); const marker = join(root, 'provider-launched');
  for (const name of ['codex', 'claude']) {
    const path = join(bin, name); writeFileSync(path, `#!/bin/sh\nprintf launched > '${marker}'\nexit 77\n`); chmodSync(path, 0o755);
  }
  return { root, marker, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REPO_HARNESS_HOME: join(root, 'harness-home') } };
}
function git(root: string, args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr); return result.stdout.trim();
}
describe('retired direct advisory command', () => {
  test.each(['codex', 'codex-plugin', 'claude'])('rejects provider %s before launch or admission, without fallback', provider => {
    const f = fixture(); const result = spawnSync(process.execPath, [cli, 'cross-review', '--provider', provider, '--json'], { cwd: f.root, env: f.env, encoding: 'utf8' });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain("unknown command 'cross-review'");
    expect(existsSync(f.marker)).toBe(false); expect(existsSync(join(f.root, '.ai/harness'))).toBe(false);
    expect(result.stdout).not.toContain('skipped'); expect(result.stdout).not.toContain('PASS');
  });
  test('root help omits the retired command and merged Herdr review still loads', () => {
    const f = fixture(); const root = spawnSync(process.execPath, [cli, '--help'], { cwd: f.root, env: f.env, encoding: 'utf8' });
    expect(root.status).toBe(0); expect(root.stdout).not.toMatch(/^\s+cross-review(?:\s|$)/m);
    const claude = spawnSync(process.execPath, [cli, 'review', '--help'], { cwd: f.root, env: f.env, encoding: 'utf8' });
    expect(claude.status).toBe(0); expect(claude.stdout).toContain('round'); expect(claude.stdout).toContain('status');
    expect(existsSync(f.marker)).toBe(false);
  });
  test('only the three obsolete implementation files are absent', () => {
    const root = resolve(import.meta.dir, '../..');
    for (const path of ['src/cli/commands/cross-review.ts', 'src/core/review/cross-review.ts', 'src/effects/review/cross-review-runner.ts']) expect(existsSync(join(root, path))).toBe(false);
    for (const path of ['src/effects/review/diff-fingerprint.ts', 'src/cli/commands/review.ts', 'src/effects/review/generic-review.ts', 'src/effects/review/oar-review-host.ts', 'src/effects/terminal/task-session.ts', 'assets/skills/repo-harness-cross-review/references/generic-review.md']) expect(existsSync(join(root, path))).toBe(true);
  });
});
describe('retained subject and receipt owners', () => {
  test('shared subject binds committed, staged, unstaged and untracked content', () => {
    const f = fixture(); git(f.root, ['init', '-q', '-b', 'main']); git(f.root, ['config', 'user.name', 'Fixture']); git(f.root, ['config', 'user.email', 'fixture@example.invalid']);
    writeFileSync(join(f.root, 'base.txt'), 'base'); git(f.root, ['add', 'base.txt']); git(f.root, ['commit', '-qm', 'base']); const base = git(f.root, ['rev-parse', 'HEAD']);
    writeFileSync(join(f.root, 'branch.txt'), 'branch'); git(f.root, ['add', 'branch.txt']); git(f.root, ['commit', '-qm', 'branch']);
    writeFileSync(join(f.root, 'staged.txt'), 'staged'); git(f.root, ['add', 'staged.txt']); writeFileSync(join(f.root, 'base.txt'), 'unstaged'); writeFileSync(join(f.root, 'untracked.txt'), 'untracked');
    const subject = buildReviewSubject(f.root, { targetRef: base }); expect(subject.status).toBe('ok');
    if (subject.status !== 'ok') throw new Error(subject.reason);
    expect(subject.target_rev).toBe(base); expect(subject.paths).toEqual(expect.arrayContaining(['base.txt', 'branch.txt', 'staged.txt', 'untracked.txt']));
    const before = subject.review_subject_sha256; writeFileSync(join(f.root, 'untracked.txt'), 'changed');
    const changed = buildReviewSubject(f.root, { targetRef: base }); expect(changed.status).toBe('ok');
    expect(changed.review_subject_sha256).not.toBe(before);
  });
  test('new acceptance uses only the merged generic-review source, not old launcher namespaces', () => {
    const current = parseAcceptancePolicy('## Acceptance Policy\n\n```json\n{"protocol":2,"reviewer":"Codex","source":"generic-review","user_waiver":"allowed"}\n```');
    expect(current.reviewer).toBe('Codex');
    expect(acceptancePolicySource()).toBe('generic-review');
    expect(() => parseAcceptancePolicy('## Acceptance Policy\n\n```json\n{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}\n```')).toThrow('source must be generic-review');
  });
});
