import { afterAll, afterEach, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { automationDigest, canonicalAutomationJson, validateProgramAuthorization } from '../src/core/automation/budget';
import { listStoredProgramAuthorizations, mintProgramAuthorization, readStoredProgramAuthorization } from '../src/effects/automation/grant-store';
import { fixtureTemplate } from './helpers/repo-fixture';

const root = resolve(import.meta.dir, '..');
const source = join(root, 'assets/skills/auto-campaign');
const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

function buildFixture(profile: 'minimal' | 'full') {
  const dir = mkdtempSync(join(tmpdir(), 'auto-campaign-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: repo });
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  // Select this checkout's actual CLI without touching a global installation.
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  writeFileSync(join(bin, 'repo-harness'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(root, 'src/cli/index.ts'))} "$@"\n`, { mode: 0o755 });
  const env = { ...process.env, HOME: dir, REPO_HARNESS_HOME: join(dir, 'runtime'),
    CODEX_SKILLS_ROOT: join(dir, 'codex-skills'), CLAUDE_SKILLS_ROOT: join(dir, 'claude-skills'),
    AGENTIC_DEV_SOURCE_ROOT: root, AGENTIC_DEV_LINK_INSTALLED_COPIES: '0',
    REPO_HARNESS_INSTALL_PROFILE: profile, PATH: `${bin}:${process.env.PATH}` };
  execFileSync('bash', [join(root, 'scripts/sync-codex-installed-copies.sh')], { env, timeout: 60000, stdio: 'pipe' });
  const input = { authorization_id: 'fixture-grant', repository_id: 'fixture-repository',
    target_ref: 'refs/heads/main', target_revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    work_graph_revision: automationDigest({ fixture: 'graph' }), allowed_work_package_ids: ['fixture-package'],
    issued_by: 'fixture-owner', issued_at: '2026-09-11T00:00:00.000Z', campaign_id: 'fixture-campaign',
    local_parent_host: 'codex', chrome_profile_directory: 'Profile 1' };
  function draft(value: unknown) {
    const path = join(dir, 'input.json');
    writeFileSync(path, JSON.stringify(value));
    return spawnSync(process.execPath, [join(env.CODEX_SKILLS_ROOT, 'auto-campaign/scripts/prepare-grant.ts'), path], { cwd: repo, env, encoding: 'utf8', timeout: 15000 });
  }
  return { dir, repo, env, input, draft };
}

/**
 * The install is built once per profile and restored per test. Its cost is a git
 * repository plus `scripts/sync-codex-installed-copies.sh`, which starts three Bun
 * child processes and rsyncs the package into both skill roots; every test here
 * starts from that same shape.
 *
 * One workspace path is enough because the fixture's mkdtemp directory owns every
 * byte written: it is `HOME`, and `REPO_HARNESS_HOME`, `CODEX_SKILLS_ROOT` and
 * `CLAUDE_SKILLS_ROOT` -- the sync script's only destinations -- are all inside it.
 * `draft()` still spawns a real `prepare-grant.ts` per call, because that is the
 * behaviour under test.
 */
const templates = fixtureTemplate(buildFixture, (value) => [value.dir]);
afterAll(() => templates.dispose());

// The template, not the builder, decides when a workspace exists: on a cache hit
// the builder never runs, so registration for `afterEach` removal belongs here.
function fixture(profile: 'minimal' | 'full') {
  const value = templates.materialize(profile);
  temporary.push(value.dir);
  return value;
}

test('full installs complete portable skill on both hosts; draft seals and mints through existing authority', () => {
  const f = fixture('full');
  for (const host of [f.env.CODEX_SKILLS_ROOT, f.env.CLAUDE_SKILLS_ROOT]) {
    for (const file of ['SKILL.md', 'references/execution.md', 'references/standard.json', 'scripts/prepare-grant.ts']) {
      expect(readFileSync(join(host, 'auto-campaign', file), 'utf8')).toBe(readFileSync(join(source, file), 'utf8'));
    }
  }
  const result = f.draft(f.input);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const grant = validateProgramAuthorization(JSON.parse(result.stdout));
  expect(result.stdout).toBe(`${canonicalAutomationJson(grant)}\n`);
  expect(grant.budget).toEqual(JSON.parse(readFileSync(join(source, 'references/standard.json'), 'utf8')).budget);
  expect(grant.campaign).toMatchObject({ group_count: 1, issues_per_group: 5, max_parallel_tasks: 2, require_fresh_main_audit: true });
  expect(grant.merge_mode).toBe('manual');
  expect(grant.max_repair_cycles).toBe(grant.budget.max_repair_cycles);
  expect(Date.parse(grant.expires_at) - Date.parse(grant.issued_at)).toBe(grant.budget.max_wall_clock_seconds! * 1000);
  expect(listStoredProgramAuthorizations(f.repo, f.env)).toEqual([]);
  const path = mintProgramAuthorization({ repo_root: f.repo, authorization: grant, env: f.env });
  expect(readStoredProgramAuthorization(f.repo, grant.authorization_sha256, f.env)).toEqual(grant);
  expect(mintProgramAuthorization({ repo_root: f.repo, authorization: grant, env: f.env })).toBe(path);
  expect(f.draft(f.input).stdout).toBe(result.stdout);
  expect(listStoredProgramAuthorizations(f.repo, f.env)).toEqual([grant.authorization_sha256]);
}, 60000);

test('draft rejects absent authority, malformed identity and nonstandard overrides without minting', () => {
  const f = fixture('full');
  const { issued_by: _issuer, ...missingIssuer } = f.input;
  for (const input of [missingIssuer, { ...f.input, target_revision: 'main' },
    { ...f.input, work_graph_revision: 'unknown' }, { ...f.input, local_parent_host: 'unknown' },
    { ...f.input, issued_at: 'unknown' }, { ...f.input, budget: { max_agent_turns: 9999 } }]) {
    const result = f.draft(input);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  }
  expect(listStoredProgramAuthorizations(f.repo, f.env)).toEqual([]);
}, 60000);

test('minimal does not discover or install auto-campaign', () => {
  const f = fixture('minimal');
  for (const host of [f.env.CODEX_SKILLS_ROOT, f.env.CLAUDE_SKILLS_ROOT]) {
    expect(existsSync(join(host, 'auto-campaign'))).toBe(false);
  }
}, 60000);
