import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const CLI = resolve(import.meta.dir, '../../src/cli/index.ts');
const roots: string[] = [];

function run(root: string, args: readonly string[]) {
  return spawnSync('bun', [CLI, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env } });
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-integration-cli-'));
  roots.push(root);
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Integration CLI'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'integration-cli@test.invalid'], { cwd: root });
  mkdirSync(join(root, 'plans/prds'), { recursive: true });
  mkdirSync(join(root, 'inputs'), { recursive: true });
  writeFileSync(join(root, 'plans/prds/product.md'), '# Product\n\n> **Status**: Approved\n');
  writeFileSync(join(root, 'docs.md'), '# Spec\n');
  writeFileSync(join(root, 'inputs/contract.json'), JSON.stringify({
    approved_prd_ref: 'plans/prds/product.md',
    source_spec_ref: 'docs.md',
    integration_group: 'cli-fixture',
    required_work_packages: [{ work_package_id: '1'.repeat(64), work_package_revision: '2'.repeat(64) }],
    required_constraints: ['constraint-a'],
  }));
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('integration CLI', () => {
  test('exposes only bounded build/read/accept surfaces', () => {
    const root = fixture();
    const help = run(root, ['integration', '--help']);
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('contract');
    expect(help.stdout).toContain('envelope');
    expect(help.stdout).toContain('matrix');
    expect(help.stdout).toContain('accept');
    expect(help.stdout).toContain('read');
    expect(help.stdout).not.toContain('merge');
    expect(help.stdout).not.toContain('waive');
    expect(help.stdout).not.toContain('takeover');
  });

  test('builds and reads a canonical immutable contract', () => {
    const root = fixture();
    const build = run(root, ['integration', 'contract', '--input', 'inputs/contract.json']);
    expect(build.status, build.stderr).toBe(0);
    const value = JSON.parse(build.stdout) as { contract_sha256: string };
    expect(value.contract_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    const read = run(root, ['integration', 'read', '--kind', 'contract', '--digest', value.contract_sha256]);
    expect(read.status, read.stderr).toBe(0);
    expect(JSON.parse(read.stdout)).toEqual(JSON.parse(build.stdout));
  });

  test('rejects unknown input fields and raw authority routes', () => {
    const root = fixture();
    writeFileSync(join(root, 'inputs/invalid.json'), JSON.stringify({
      approved_prd_ref: 'plans/prds/product.md', source_spec_ref: 'docs.md', integration_group: 'fixture',
      required_work_packages: [{ work_package_id: '1'.repeat(64), work_package_revision: '2'.repeat(64) }],
      required_constraints: ['constraint-a'], merge: true,
    }));
    const invalid = run(root, ['integration', 'contract', '--input', 'inputs/invalid.json']);
    expect(invalid.status).not.toBe(0);
    expect(JSON.parse(invalid.stderr)).toMatchObject({ ok: false, error: 'integration_invalid' });
    const merge = run(root, ['integration', 'merge']);
    expect(merge.status).not.toBe(0);
    expect(merge.stderr).toContain("unknown command 'merge'");
  });
});
