import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROUTES } from '../../src/cli/hook/route-registry';
import { projectSetupSnapshot } from '../../src/core/setup/projection';
import { decodeSetupSnapshot } from '../../src/core/setup/decode';
import type { SetupSnapshotV1 } from '../../src/core/setup/types';
import {
  SETUP_CHILD_ARGV,
  SETUP_TIMEOUT_MS,
  collectSetupSnapshot,
  runSetupProcess,
  startSetupCollector,
  type SetupProcessResult,
  type SetupProcessRunner,
} from '../../src/effects/setup/collector';
import { SETUP_FLEET_SOURCE_DIR, readFleetRoles } from '../../src/effects/setup/snapshot';
import { PROFILE_COMPONENTS } from '../../src/cli/installer/install-profile';
import { parseSkillSurfaceCatalog } from '../../src/core/skill-surface/catalog';

function snapshot(collectedAt: string): SetupSnapshotV1 {
  return projectSetupSnapshot({
    collected_at: collectedAt, setup_status: 'ok', summary: { ok: 1, warn: 0, fail: 0, na: 0, needs_agent: 0 },
    checks: [{ id: 'doctor.cli-version', title: 'repo-harness CLI version', status: 'ok', detail: '0.21.1' }],
    check_commands: new Map(), adapters: [], cli_versions: {}, skill_rows: [], skill_summaries: new Map(),
    routes: ROUTES, fleet_roles: [], fleet_hosts: null,
  });
}

const ok = (value: unknown): SetupProcessResult => ({ ok: true, stdout: `${JSON.stringify(value)}\n` });

async function until(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 500 && !condition(); attempt++) await Bun.sleep(5);
  expect(condition()).toBe(true);
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

describe('setup collector', () => {
  test('runs the constant child argv with a 90 second deadline and no update checks', async () => {
    const seen: { argv: readonly string[]; timeout: number; env: NodeJS.ProcessEnv }[] = [];
    const run: SetupProcessRunner = async (argv, options) => { seen.push({ argv, timeout: options.timeout_ms, env: options.env }); return ok(snapshot('2026-10-10T00:00:00.000Z')); };
    const outcome = await collectSetupSnapshot({ run_process: run, env: { HOME: '/nowhere', REPO_HARNESS_CHECK_UPDATES: '1' }, signal: new AbortController().signal });
    expect(outcome.ok).toBe(true);
    expect(SETUP_TIMEOUT_MS).toBe(90_000);
    expect(seen[0]!.argv).toBe(SETUP_CHILD_ARGV);
    expect(SETUP_CHILD_ARGV).toEqual([join(import.meta.dir, '../../src/effects/setup/setup-check-child.ts')]);
    expect(seen[0]!.timeout).toBe(90_000);
    expect(seen[0]!.env.REPO_HARNESS_CHECK_UPDATES).toBeUndefined();
  });

  test('a deadline kills the child and every process it spawned', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'repo-harness-setup-timeout-'));
    try {
      const pidFile = join(dir, 'grandchild.pid');
      const script = join(dir, 'hang.ts');
      writeFileSync(script, `import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const sleeper = spawn('sleep', ['30'], { stdio: 'ignore' });
writeFileSync(${JSON.stringify(pidFile)}, String(sleeper.pid));
setInterval(() => {}, 1000);
`);
      const started = Date.now();
      const result = await runSetupProcess([script], { cwd: dir, env: process.env, timeout_ms: 1_500, signal: new AbortController().signal });
      expect(result).toEqual({ ok: false, code: 'timeout' });
      expect(Date.now() - started).toBeLessThan(10_000);
      const grandchild = Number(readFileSync(pidFile, 'utf8'));
      await until(() => !alive(grandchild));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('cycles never overlap and reads never start work', async () => {
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const run: SetupProcessRunner = async () => {
      runs++; active++; maxActive = Math.max(maxActive, active);
      await Bun.sleep(15);
      active--;
      return ok(snapshot(new Date().toISOString()));
    };
    const collector = startSetupCollector({ run_process: run, interval_ms: 1 });
    try {
      for (let index = 0; index < 50; index++) collector.read();
      expect(runs).toBe(1);
      await until(() => runs >= 4);
      expect(maxActive).toBe(1);
    } finally { await collector.close(); }
    const after = runs;
    await Bun.sleep(30);
    expect(runs).toBe(after);
  });

  test('keeps the last good snapshot with its age and a fixed reason code', async () => {
    const good = snapshot('2026-10-10T00:00:00.000Z');
    const queue: SetupProcessResult[] = [
      { ok: false, code: 'failed' },
      ok(good),
      { ok: false, code: 'timeout' },
      { ok: true, stdout: 'not json' },
      ok({ ...good, checks: [{ id: 'x', status: 'warn', title: 't', detail: 'at /Users/alice/secret', command: null }] }),
      ok(good),
    ];
    let gate: (() => void) | null = null;
    const run: SetupProcessRunner = async (_argv, options) => {
      await new Promise<void>((resolve) => {
        gate = resolve;
        options.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return queue.shift() ?? { ok: false, code: 'aborted' };
    };
    const collector = startSetupCollector({ run_process: run, interval_ms: 1 });
    const step = async () => {
      await until(() => gate !== null);
      const release = gate!;
      gate = null;
      release();
      await collector.settled();
    };
    try {
      expect(collector.read()).toMatchObject({ status: 'unavailable', reason: 'collection_pending', collected_at: null });
      await step();
      expect(collector.read()).toMatchObject({ status: 'unavailable', reason: 'setup_check_failed', collected_at: null });
      await step();
      expect(collector.read()).toEqual(good);
      await step();
      expect(collector.read()).toEqual({ ...good, status: 'stale', reason: 'setup_check_timeout' });
      await step();
      expect(collector.read()).toEqual({ ...good, status: 'stale', reason: 'setup_check_invalid' });
      await step();
      expect(collector.read()).toEqual({ ...good, status: 'stale', reason: 'setup_check_invalid' });
      expect(JSON.stringify(collector.read())).not.toContain('/Users/');
      await step();
      expect(collector.read()).toEqual(good);
      for (const value of [collector.read()]) expect(decodeSetupSnapshot(value)).toBe(value);
    } finally { await collector.close(); }
  });

  test('reads every packaged fleet role through the shared frontmatter parser', () => {
    const roles = readFleetRoles(SETUP_FLEET_SOURCE_DIR);
    expect(roles.map(role => role.name)).toEqual(['deep-reasoner', 'deep-worker', 'explorer', 'fast-worker', 'gatekeeper', 'harness-evaluator', 'root-cause-prover']);
    expect(roles.every(role => role.model !== undefined && role.effort !== undefined && role.description !== undefined)).toBe(true);
  });

  test('every real catalog summary and fleet frontmatter value survives projection and decode verbatim', () => {
    const manifest = readFileSync(join(import.meta.dir, '../../assets/skill-commands/manifest.json'), 'utf8');
    const catalog = parseSkillSurfaceCatalog(manifest, { declared: true, profileComponents: PROFILE_COMPONENTS });
    if (catalog.status !== 'valid') throw new Error('packaged catalog invalid');
    const packages = catalog.catalog.packages;
    const roles = readFleetRoles(SETUP_FLEET_SOURCE_DIR);
    const projected = decodeSetupSnapshot(projectSetupSnapshot({
      collected_at: '2026-10-10T00:00:00.000Z', setup_status: 'ok', summary: { ok: 0, warn: 0, fail: 0, na: 0, needs_agent: 0 },
      checks: [], check_commands: new Map(), adapters: [], cli_versions: {},
      skill_rows: packages.map(pkg => ({ host: 'claude' as const, name: pkg.name, state: 'ok link' as const, ok: true })),
      skill_summaries: new Map(packages.map(pkg => [pkg.name, pkg.summary])),
      routes: ROUTES, fleet_roles: roles, fleet_hosts: null,
    }));
    expect(packages.length).toBeGreaterThan(0);
    expect(projected.skills.map(skill => [skill.name, skill.summary])).toEqual(packages.map(pkg => [pkg.name, pkg.summary]));
    const expectedRoles: (string | null)[][] = roles.map(role => [role.name ?? null, role.description ?? null, role.model ?? null, role.effort ?? null]);
    expect(projected.fleet.map(role => [role.name, role.description, role.model, role.effort])).toEqual(expectedRoles);
    expect(JSON.stringify(projected)).not.toContain('[configured]');
  });

  test('the real child returns a public snapshot from an isolated HOME with fake credentials', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-setup-child-')));
    const home = join(root, 'home');
    const cwd = join(root, 'work');
    const secrets = ['sk-proj-FAKEFAKEFAKEFAKEFAKEFAKE0003', 'ghp_FAKEFAKEFAKEFAKEFAKEFAKE0004', 'pi-fake-oauth-refresh-0005'];
    try {
      for (const dir of [cwd, join(home, '.pi/agent'), join(home, '.codex'), join(home, '.claude')]) mkdirSync(dir, { recursive: true });
      writeFileSync(join(home, '.pi/agent/auth.json'), JSON.stringify({ anthropic: { type: 'oauth', refresh: secrets[2], access: secrets[0] } }));
      writeFileSync(join(home, '.codex/config.toml'), `[mcp_servers.x]\nbearer_token = "${secrets[1]}"\n`);
      writeFileSync(join(home, '.claude/CLAUDE.md'), `# Notes\nOPENAI_API_KEY=${secrets[0]}\n`);
      const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, BUN_INSTALL: join(home, '.bun') };
      const outcome = await collectSetupSnapshot({ cwd, env, signal: new AbortController().signal });
      if (!outcome.ok) throw new Error(`setup child failed: ${outcome.reason}`);
      const text = JSON.stringify(outcome.snapshot);
      expect(outcome.snapshot.status).toBe('ready');
      expect(outcome.snapshot.hosts.map(host => [host.host, host.reported])).toEqual([['claude', true], ['codex', true], ['pi', false]]);
      expect(outcome.snapshot.fleet).toHaveLength(7);
      expect(outcome.snapshot.hooks.flatMap(event => event.routes)).toHaveLength(ROUTES.length);
      expect(outcome.snapshot.skills.length).toBeGreaterThan(0);
      for (const forbidden of [root, home, '/Users/', '/private/', ...secrets]) expect(text).not.toContain(forbidden);
      expect(existsSync(join(home, '.claude/agents'))).toBe(false);
      expect(existsSync(join(home, '.codex/agents'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 120_000);
});
