import { afterEach, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const roots: string[] = [];
const cli = resolve(import.meta.dir, '../../src/cli/index.ts');
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test('one global configuration controls two repos without repository projection switches', () => {
  const root = mkdtempSync(join(tmpdir(), 'global-architecture-'));
  roots.push(root);
  const home = join(root, 'home');
  mkdirSync(join(home, '.repo-harness'), { recursive: true });
  writeFileSync(join(home, '.repo-harness/config.json'), JSON.stringify({ architecture: {
    projection_provider: 'archctx', projection_apply: 'manual',
  } }));
  for (const name of ['first', 'second']) {
    const repo = join(root, name);
    mkdirSync(join(repo, '.ai/harness'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: repo });
    writeFileSync(join(repo, '.ai/harness/policy.json'), JSON.stringify({ context: { capability_source: 'registry' },
      ...(name === 'second' ? { architecture: { projection_provider: 'disabled', projection_apply: 'disabled' } } : {}),
    }));
    const result = spawnSync(process.execPath, [cli, 'architecture-projection', 'status', '--json'], {
      cwd: repo, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000,
    });
    expect(result.status).toBe(0);
    const value = JSON.parse(result.stdout);
    expect(value.projectionProvider.provider).toBe('archctx');
    expect(value.apply.mode).toBe('manual');
    expect(value.apply.enabled).toBe(false); // No project model has been authored.
  }
}, 60000);

import { existsSync, readFileSync } from 'node:fs';
import { ensureGlobalArchitectureProjection } from '../../src/cli/commands/architecture-configuration';
import { loadArchitectureProjectionPolicy, readGlobalArchitectureConfiguration } from '../../src/effects/architecture/projection-config';
import { planStandardAdoption } from '../../src/core/adoption/standard-plan';

function globalFixture() {
  const home = mkdtempSync(join(tmpdir(), 'global-architecture-config-'));
  roots.push(home);
  mkdirSync(join(home, '.repo-harness'));
  return { home, path: join(home, '.repo-harness/config.json'), env: { ...process.env, HOME: home } };
}

test('global setup seeds once and preserves unrelated global configuration', () => {
  const f = globalFixture();
  expect(existsSync(f.path)).toBe(false);
  writeFileSync(f.path, JSON.stringify({ brainRoot: '/existing/vault', protectedHelperRuntime: { preserved: true } }));
  expect(ensureGlobalArchitectureProjection(f.env).status).toBe('ok');
  expect(loadArchitectureProjectionPolicy(f.env)).toMatchObject({ provider: 'archctx', applyMode: 'manual' });
  const first = readFileSync(f.path, 'utf8');
  expect(JSON.parse(first)).toMatchObject({ brainRoot: '/existing/vault', protectedHelperRuntime: { preserved: true } });
  expect(ensureGlobalArchitectureProjection(f.env).status).toBe('ok');
  expect(readFileSync(f.path, 'utf8')).toBe(first);
});

test('global setup preserves an explicit global disabled choice and rejects malformed or partial settings without writes', () => {
  const f = globalFixture();
  const disabled = JSON.stringify({ architecture: { projection_provider: 'disabled', projection_apply: 'disabled' } });
  writeFileSync(f.path, disabled);
  expect(ensureGlobalArchitectureProjection(f.env).status).toBe('ok');
  expect(readFileSync(f.path, 'utf8')).toBe(disabled);
  expect(loadArchitectureProjectionPolicy(f.env).provider).toBe('disabled');
  for (const invalid of ['{', 'null', '[]', JSON.stringify({ architecture: { projection_provider: null, projection_apply: 'manual' } }), JSON.stringify({ architecture: { projection_provider: 'archctx', projection_apply: null } }), '{"architecture":{}}', '{"architecture":{"projection_provider":"archctx","projection_apply":"manaul"}}', '{"architecture":{"projection_provider":"archctx","projection_apply":"manual","projection_version":"0.0.1"}}']) {
    writeFileSync(f.path, invalid);
    expect(ensureGlobalArchitectureProjection(f.env).status).toBe('failed');
    expect(() => readGlobalArchitectureConfiguration(f.env)).toThrow();
    expect(readFileSync(f.path, 'utf8')).toBe(invalid);
  }
});

test('update migrates retired automatic projection settings once and readers refuse them before migration', () => {
  const f = globalFixture();
  writeFileSync(f.path, JSON.stringify({ brainRoot: '/existing/vault', architecture: {
    projection_provider: 'archctx', projection_apply: 'automatic', projection_failure_gate: 'strict', projection_timeout_ms: 90000,
  } }));
  expect(() => readGlobalArchitectureConfiguration(f.env)).toThrow('run `repo-harness update` to migrate');
  const migrated = ensureGlobalArchitectureProjection(f.env);
  expect(migrated).toMatchObject({ status: 'ok', detail: expect.stringContaining('migrated retired automatic projection settings') });
  expect(JSON.parse(readFileSync(f.path, 'utf8'))).toEqual({ brainRoot: '/existing/vault', architecture: {
    projection_provider: 'archctx', projection_apply: 'manual', projection_timeout_ms: 90000,
  } });
  expect(loadArchitectureProjectionPolicy(f.env)).toMatchObject({ provider: 'archctx', applyMode: 'manual', timeoutMs: 90000 });
  const settled = readFileSync(f.path, 'utf8');
  expect(ensureGlobalArchitectureProjection(f.env).detail).toContain('using ');
  expect(readFileSync(f.path, 'utf8')).toBe(settled);

  writeFileSync(f.path, JSON.stringify({ architecture: { projection_provider: 'disabled', projection_apply: 'disabled', projection_failure_gate: 'advisory' } }));
  expect(ensureGlobalArchitectureProjection(f.env).status).toBe('ok');
  expect(JSON.parse(readFileSync(f.path, 'utf8')).architecture).toEqual({ projection_provider: 'disabled', projection_apply: 'disabled' });
});

test('adoption removes retired repo execution settings while preserving project architecture policy', () => {
  const f = globalFixture();
  mkdirSync(join(f.home, '.ai/harness'), { recursive: true });
  writeFileSync(join(f.home, '.ai/harness/policy.json'), JSON.stringify({ architecture: {
    projection_provider: 'disabled', projection_apply: 'disabled', projection_version: '0.0.1',
    projection_failure_gate: 'strict', projection_timeout_ms: 1000, freshness_gate: 'strict', gate_min_severity: 'high',
  } }));
  const plan = planStandardAdoption({ repoRoot: f.home, mode: 'standard', env: f.env });
  const operation = plan.operations.find((entry) => entry.kind === 'writeFile' && entry.path === '.ai/harness/policy.json');
  expect(operation?.kind).toBe('writeFile');
  if (operation?.kind !== 'writeFile') throw new Error('policy operation missing');
  expect(JSON.parse(operation.content).architecture).toEqual({ freshness_gate: 'strict', gate_min_severity: 'high' });
  expect(existsSync(f.path)).toBe(false); // Repository adoption does not invent a host preference.
});
