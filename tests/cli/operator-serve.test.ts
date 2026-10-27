import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { projectFleetBoardSnapshot } from '../../src/core/fleet/board';
import type { OperatorRepositorySnapshotV1 } from '../../src/core/operator/repository-snapshot';
import { repoHarnessRegisteredReposPath, repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { OperatorRepositoryError, readOperatorRepositorySnapshot } from '../../src/effects/operator/repository-snapshot';
import { MODULE_ID, MODULE_DOC, MODULE_NODE, moduleRepository, fixtureYaml, fixtureWrite, fixtureCommit, fixtureGit, isNativeExportGitRead } from '../helpers/module-repository';
import { createHash } from 'node:crypto';
import { chmodSync, watch, lstatSync, renameSync } from 'node:fs';
import { spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { readArchitecture } from '../../src/effects/operator/architecture';
import { unavailableDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import type { DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';
import { unavailableSetupSnapshot } from '../../src/core/setup/decode';
import { projectSetupSnapshot } from '../../src/core/setup/projection';
import type { SetupSnapshotV1 } from '../../src/core/setup/types';
import { ROUTES } from '../../src/cli/hook/route-registry';
import type { BotAccessSnapshotV1 } from '../../src/core/operator/bot-access';
import type { BotAccessCacheV1 } from '../../src/effects/operator/bot-access';
import { CLI_INVENTORY_PROJECTION, unavailableCliInventory, type CliInventorySnapshotV1 } from '../../src/core/setup/cli-inventory';
import { DocsReader } from '../../src/effects/operator/docs-reader';
import type { DocsRepositoryCache } from '../../src/effects/operator/docs-collector';
import type { DocsTreeV1 } from '../../src/core/operator/docs';
import type { TestsSnapshotV1 } from '../../src/core/operator/tests';
import type { TestsRepositoryCache } from '../../src/effects/operator/tests-collector';

import {
  startOperatorServer,
  type OperatorServerOptions,
} from '../../src/effects/operator/server';
import {
  buildOperatorCommand,
  parseOperatorServeOptions,
} from '../../src/cli/commands/operator';
import { projectArchitectureMap, type ArchitectureMapV1, type ArchitecturePullRequestsSource } from '../../src/core/operator/architecture-map';
import { startArchitectureMapCollector, type ArchitectureMapRepositoryCache } from '../../src/effects/operator/architecture-map-collector';

function unavailableRepository(repositoryId: string): OperatorRepositorySnapshotV1 {
  return { protocol: 1, kind: 'operator_repository_snapshot', repository_id: repositoryId,
    planning: { status: 'unavailable', observed_at: '2026-09-22T00:00:00.000Z', code: 'source_unavailable' },
    organization: { status: 'unavailable', observed_at: '2026-09-22T00:00:00.000Z', code: 'source_unavailable' } };
}

function snapshot(sequence = 1) {
  return projectFleetBoardSnapshot({
    registry_revision: 'sha256:registry',
    sequence,
    observed_at: '2026-08-24T01:03:00.000Z',
    repositories: [],
  });
}

const TASK_ID = 'a'.repeat(64);
const TASK_REVISION = 'b'.repeat(64);
const CLAIM_ID = '123e4567-e89b-42d3-a456-426614174012';
function registryHome(entries: readonly { readonly path: string; readonly accessMode: 'read_only' | 'read_write' }[]): {
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly ids: readonly string[];
} {
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-operator-registry-'));
  const now = '2026-08-28T00:00:00.000Z';
  const repos = entries.map((entry) => ({
    id: repoHarnessRepoIdFor(entry.path),
    path: entry.path,
    accessMode: entry.accessMode,
    source: 'adopt' as const,
    registeredAt: now,
    lastSeenAt: now,
  }));
  writeFileSync(
    join(home, 'registered-repos.json'),
    `${JSON.stringify({ version: 1, authorizationRevision: 1, repos }, null, 2)}\n`,
  );
  return { env: { REPO_HARNESS_HOME: home }, home, ids: repos.map((repo) => repo.id) };
}

async function waitFor(condition: () => boolean, message: string, attempts = 100): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (condition()) return;
    await Bun.sleep(10);
  }
  throw new Error(message);
}

describe('operator serve command and HTTP boundary', () => {
  test('keeps serve options loopback-only and validates bounded collector settings', () => {
    expect(parseOperatorServeOptions({})).toMatchObject({
      host: '127.0.0.1',
      port: 4318,
      max_concurrency: 4,
      timeout_ms: 30_000,
    });
    expect(parseOperatorServeOptions({ host: '::1', port: '0', maxConcurrency: '1', timeoutMs: '1000' })).toMatchObject({
      host: '::1', port: 0, max_concurrency: 1, timeout_ms: 1_000,
    });
    expect(() => parseOperatorServeOptions({ host: '0.0.0.0' })).toThrow('127.0.0.1 or ::1');
    expect(() => parseOperatorServeOptions({ port: '65536' })).toThrow('port');
    expect(() => parseOperatorServeOptions({ timeoutMs: '999' })).toThrow('timeout-ms');
    expect(buildOperatorCommand().name()).toBe('operator');
  });

  test('UX-local-human-control-board-v1-P1 serves health, browser-safe Fleet snapshot, and static fallback', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-ui-'));
    let collectCalls = 0;
    const collect = async (options?: { readonly sequence?: number }) => {
      collectCalls += 1;
      await Bun.sleep(10);
      return snapshot(options?.sequence ?? 1);
    };
    const options: OperatorServerOptions = {
      port: 0,
      static_root: staticRoot,
      collect_fleet_board: collect,
    };
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    writeFileSync(join(staticRoot, 'app.js'), 'console.log("operator");');
    const server = await startOperatorServer(options);
    try {
      const health = await fetch(`${server.url}/healthz`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true, service: 'repo-harness-operator', protocol: 1 });
      expect(collectCalls).toBe(0);

      const rejectedHost = await fetch(`${server.url}/api/v1/fleet/snapshot`, {
        headers: { Host: 'attacker.example' },
      });
      expect(rejectedHost.status).toBe(421);
      expect(await rejectedHost.json()).toMatchObject({ error: { code: 'host_not_allowed' } });
      expect(collectCalls).toBe(0);

      const rejectedOrigin = await fetch(`${server.url}/api/v1/fleet/snapshot`, {
        headers: { Origin: 'http://attacker.example' },
      });
      expect(rejectedOrigin.status).toBe(403);
      expect(await rejectedOrigin.json()).toMatchObject({ error: { code: 'origin_not_allowed' } });
      expect(collectCalls).toBe(0);

      const [first, second] = await Promise.all([
        fetch(`${server.url}/api/v1/fleet/snapshot`),
        fetch(`${server.url}/api/v1/fleet/snapshot`),
      ]);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(collectCalls).toBe(1);
      const payload = await first.json() as Record<string, unknown>;
      expect(payload).toMatchObject({ protocol: 8, kind: 'operator_fleet_snapshot', sequence: 1 });
      expect(await second.json()).toMatchObject({ sequence: 1 });
      expect(JSON.stringify(payload)).not.toContain('repo_root');

      const third = await fetch(`${server.url}/api/v1/fleet/snapshot`);
      expect(third.status).toBe(200);
      expect(await third.json()).toMatchObject({ sequence: 2 });
      const fourth = await fetch(`${server.url}/api/v1/fleet/snapshot`);
      expect(fourth.status).toBe(200);
      expect(await fourth.json()).toMatchObject({ sequence: 3 });
      expect(collectCalls).toBe(3);

      const staticResponse = await fetch(`${server.url}/app.js`);
      expect(staticResponse.status).toBe(200);
      expect(staticResponse.headers.get('x-frame-options')).toBe('DENY');
      expect(staticResponse.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await staticResponse.text()).toContain('operator');

      const navigation = await fetch(`${server.url}/dashboard`, { headers: { accept: 'text/html' } });
      expect(navigation.status).toBe(200);
      expect(await navigation.text()).toContain('<main>operator</main>');
    } finally {
      await server.close();
      rmSync(staticRoot, { recursive: true, force: true });
    }
  });

  test('uses the bracketed IPv6 authority for real ::1 health/API/static requests', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-ipv6-'));
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>ipv6</main>');
    let server: Awaited<ReturnType<typeof startOperatorServer>> | undefined;
    try {
      try {
        server = await startOperatorServer({
          host: '::1',
          port: 0,
          static_root: staticRoot,
          collect_fleet_board: async () => snapshot(),
        });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EAFNOSUPPORT' || code === 'EADDRNOTAVAIL') return;
        throw error;
      }
      const health = await fetch(`${server.url}/healthz`, {
        headers: { Origin: server.url },
      });
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true, service: 'repo-harness-operator', protocol: 1 });

      const api = await fetch(`${server.url}/api/v1/fleet/snapshot`, {
        headers: { Host: `[::1]:${server.port}`, Origin: server.url },
      });
      expect(api.status).toBe(200);
      expect(await api.json()).toMatchObject({ kind: 'operator_fleet_snapshot' });

      const html = await fetch(`${server.url}/dashboard`, {
        headers: { Host: `[::1]:${server.port}`, Origin: server.url, Accept: 'text/html' },
      });
      expect(html.status).toBe(200);
      expect(await html.text()).toContain('ipv6');
    } finally {
      await server?.close();
      rmSync(staticRoot, { recursive: true, force: true });
    }
  });

  test('UX-local-human-control-board-v1-F1 fails closed when Fleet authority is unavailable', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-failure-'));
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    const server = await startOperatorServer({
      port: 0,
      static_root: staticRoot,
      collect_fleet_board: async () => { throw new Error('secret provider stderr /private/path'); },
    });
    try {
      const response = await fetch(`${server.url}/api/v1/fleet/snapshot`);
      expect(response.status).toBe(503);
      const body = await response.json() as { error: { code: string; message: string; next_action: string } };
      expect(body.error).toMatchObject({ code: 'fleet_snapshot_unavailable' });
      expect(body.error.message).toBe('Fleet snapshot is unavailable.');
      expect(body.error.next_action).toContain('repo-harness fleet board --json');
      expect(JSON.stringify(body)).not.toContain('secret provider stderr');
      expect(JSON.stringify(body)).not.toContain('/private/path');
    } finally {
      await server.close();
      rmSync(staticRoot, { recursive: true, force: true });
    }
  });

  test('rejects every browser write method on all read routes and the retired message route', async () => {
    let reads = 0;
    const server = await startOperatorServer({
      port: 0,
      collect_fleet_board: async () => { reads++; return snapshot(); },
      read_repository_snapshot: async input => { reads++; return unavailableRepository(input.repository_id); },
      read_task_context: async () => { reads++; throw new Error('unexpected read'); },
      read_task_activity: async () => { reads++; throw new Error('unexpected read'); },
      read_task_diff: async () => { reads++; throw new Error('unexpected read'); },
      read_task_history: async () => { reads++; throw new Error('unexpected read'); },
    });
    try {
      const paths = ['/', '/healthz', '/api/v1/fleet/snapshot', '/api/v1/dev-activity', '/api/v1/setup',
        '/api/v1/repositories/repo-a/snapshot', ...['context', 'activity', 'diff', 'messages'].map(route => `/api/v1/fleet/tasks/repo-a/${TASK_ID}/${route}`)];
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        for (const path of paths) {
          for (const headers of [new Headers(), new Headers({ Origin: server.url })]) {
            const response = await fetch(server.url + path, { method, headers, body: 'ignored' });
            if (method === 'POST') {
              // A write is identified before it is routed: Origin, then Sec-Fetch-Site.
              expect(response.status).toBe(403);
              expect(await response.json()).toMatchObject({ error: { code: headers.has('origin') ? 'fetch_site_not_allowed' : 'origin_required' } });
              continue;
            }
            expect(response.status).toBe(405);
            expect(response.headers.get('allow')).toBe('GET, HEAD');
            expect(await response.json()).toMatchObject({ error: { code: 'method_not_allowed' } });
          }
          if (method === 'POST') {
            const identified = await fetch(server.url + path, { method, headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' }, body: 'ignored' });
            expect(identified.status).toBe(405);
            expect(identified.headers.get('allow')).toBe('GET, HEAD');
            expect(await identified.json()).toMatchObject({ error: { code: 'method_not_allowed' } });
          }
        }
      }
      expect(reads).toBe(0);
      const retired = await fetch(`${server.url}/api/v1/fleet/tasks/repo-a/${TASK_ID}/messages`);
      expect(retired.status).toBe(404);
      expect((await fetch(`${server.url}/healthz`)).status).toBe(200);
      expect((await fetch(`${server.url}/api/v1/fleet/snapshot`)).status).toBe(200);
      expect(reads).toBe(1);
    } finally { await server.close(); }
  });

  test('serves only the Dev Activity cache on GET and starts the collector only on request', async () => {
    let reads = 0;
    const ready: DevActivitySnapshotV2 = { ...unavailableDevActivitySnapshot(), status: 'ready', collected_at: '2026-10-10T00:00:00.000Z', unreadable_registrations: 3 };
    let current: unknown = ready;
    const server = await startOperatorServer({ port: 0, collect_fleet_board: async () => snapshot(), read_dev_activity: () => { reads++; return current as DevActivitySnapshotV2; } });
    try {
      const response = await fetch(`${server.url}/api/v1/dev-activity`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual(ready);
      const head = await fetch(`${server.url}/api/v1/dev-activity`, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
      const query = await fetch(`${server.url}/api/v1/dev-activity?repo=repo_0123456789abcdef`);
      expect(query.status).toBe(400);
      expect(reads).toBe(2);
      current = { ...ready, collected_at: '/Users/someone' };
      expect(await (await fetch(`${server.url}/api/v1/dev-activity`)).json()).toEqual(unavailableDevActivitySnapshot());
    } finally { await server.close(); }

    const home = mkdtempSync(join(tmpdir(), 'repo-harness-operator-dev-activity-'));
    const collecting = await startOperatorServer({ port: 0, dev_activity_collector: true, collect_fleet_board: async () => snapshot(),
      env: { ...process.env, REPO_HARNESS_HOME: home, REPO_HARNESS_PIPELINES_DB: join(home, 'none.db') } });
    try {
      let body: DevActivitySnapshotV2 = unavailableDevActivitySnapshot();
      for (let attempt = 0; attempt < 100 && body.status === 'unavailable'; attempt++) {
        body = await (await fetch(`${collecting.url}/api/v1/dev-activity`)).json() as DevActivitySnapshotV2;
        if (body.status === 'unavailable') await Bun.sleep(20);
      }
      expect(body).toMatchObject({ status: 'ready', repositories: [], items: [], attention: [], unreadable_registrations: 0 });
      expect(body.collected_at).not.toBeNull();
    } finally {
      await collecting.close();
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('serves only the setup cache on GET and never runs setup check on the request path', async () => {
    let reads = 0;
    const ready: SetupSnapshotV1 = projectSetupSnapshot({
      collected_at: '2026-10-10T00:00:00.000Z', setup_status: 'ok', summary: { ok: 1, warn: 0, fail: 0, na: 0, needs_agent: 0 },
      checks: [], check_commands: new Map(), adapters: [], cli_versions: {}, skill_rows: [], skill_summaries: new Map(),
      routes: ROUTES, fleet_roles: [], fleet_hosts: null, hook_usage: null,
    });
    let current: unknown = ready;
    const spawnSpy = spyOn(childProcess, 'spawn');
    const spawnSyncSpy = spyOn(childProcess, 'spawnSync');
    const server = await startOperatorServer({ port: 0, collect_fleet_board: async () => snapshot(), read_setup: () => { reads++; return current as SetupSnapshotV1; } });
    try {
      const response = await fetch(`${server.url}/api/v1/setup`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual(ready);
      const head = await fetch(`${server.url}/api/v1/setup`, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
      expect((await fetch(`${server.url}/api/v1/setup?host=codex`)).status).toBe(400);
      expect(reads).toBe(2);
      current = { ...ready, checks: [{ id: 'x', status: 'warn', title: 't', detail: 'at /Users/someone', command: null }] };
      expect(await (await fetch(`${server.url}/api/v1/setup`)).json()).toEqual(unavailableSetupSnapshot('setup_check_invalid'));
      expect(spawnSpy).not.toHaveBeenCalled();
      expect(spawnSyncSpy).not.toHaveBeenCalled();
    } finally {
      spawnSpy.mockRestore();
      spawnSyncSpy.mockRestore();
      await server.close();
    }

    // The serve collector answers from its cache at once: the first run is still pending.
    const home = mkdtempSync(join(tmpdir(), 'repo-harness-operator-setup-'));
    const collecting = await startOperatorServer({ port: 0, setup_collector: true, collect_fleet_board: async () => snapshot(),
      env: { PATH: process.env.PATH, HOME: home } });
    try {
      const started = Date.now();
      expect(await (await fetch(`${collecting.url}/api/v1/setup`)).json()).toEqual(unavailableSetupSnapshot('collection_pending'));
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      await collecting.close();
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('serves only the Bot access and CLI inventory caches on GET, with typed unavailable states', async () => {
    const bots: BotAccessSnapshotV1 = {
      protocol: 1, kind: 'operator_bot_access', observed_at: '2026-10-27T00:00:00.000Z',
      bots: { state: 'unavailable', reason: 'bot_registry_invalid' },
      mcp: { state: 'unavailable', reason: 'mcp_doctor_timeout' },
      oauth: { state: 'missing' },
      registry: { state: 'unavailable', reason: 'registry_unavailable' },
      herdr: { state: 'unavailable', reason: 'notify_session_missing' },
      notify: { state: 'unavailable', reason: 'notify_session_missing' },
    };
    const entry = { id: 'brew:gh', source: 'brew', package: 'gh', version: '2.62.0', commands: ['gh'], location: '~/.local/bin',
      size_bytes: null, last_used_at: null, unused: true, github: null, deprecated: false, uninstall: null };
    const inventory = { projection_version: CLI_INVENTORY_PROJECTION, status: 'ready', reason: null, collected_at: '2026-10-27T00:00:00.000Z', entries: [entry] } as CliInventorySnapshotV1;
    let botCache: BotAccessCacheV1 = { state: 'pending' };
    let cli: unknown = inventory;
    let reads = 0;
    const spawnSpy = spyOn(childProcess, 'spawn');
    const spawnSyncSpy = spyOn(childProcess, 'spawnSync');
    const execFileSpy = spyOn(childProcess, 'execFile');
    const server = await startOperatorServer({ port: 0, collect_fleet_board: async () => snapshot(),
      read_bot_access: () => { reads++; return botCache; }, read_cli_inventory: () => { reads++; return cli as CliInventorySnapshotV1; } });
    const get = (path: string, init?: RequestInit) => fetch(`${server.url}${path}`, init);
    try {
      const pending = await get('/api/v1/bot-access');
      expect(pending.status).toBe(503);
      expect(await pending.json()).toEqual({ error: { code: 'bot_access_pending', message: expect.any(String), next_action: expect.any(String) } });
      botCache = { state: 'failed', reason: 'bot_access_failed' };
      const failed = await get('/api/v1/bot-access');
      expect(failed.status).toBe(503);
      expect(await failed.json()).toEqual({ error: { code: 'bot_access_unavailable', message: expect.any(String), next_action: expect.any(String) } });
      botCache = { state: 'ok', snapshot: bots };
      const ready = await get('/api/v1/bot-access');
      expect(ready.status).toBe(200);
      expect(ready.headers.get('cache-control')).toBe('no-store');
      expect(await ready.json()).toEqual(bots);
      botCache = { state: 'ok', snapshot: { ...bots, registry: { state: 'ok', authorization_revision: 1, registry_revision: `sha256:${'0'.repeat(64)}`,
        repos: [{ repo_id: 'repo-a', label: '/Users/someone/repo', access_mode: 'read_only', last_audit: { state: 'missing' } }] } } };
      const invalid = await get('/api/v1/bot-access');
      expect(invalid.status).toBe(503);
      const invalidText = await invalid.text();
      expect(JSON.parse(invalidText)).toMatchObject({ error: { code: 'bot_access_invalid' } });
      expect(invalidText).not.toContain('/Users/');

      expect(await (await get('/api/v1/cli-inventory')).json()).toEqual(inventory);
      cli = { ...inventory, entries: [{ ...entry, location: '/Users/someone/.local/bin' }] };
      const leaked = await (await get('/api/v1/cli-inventory')).text();
      expect(JSON.parse(leaked)).toEqual(unavailableCliInventory('collection_failed'));
      expect(leaked).not.toContain('/Users/');

      for (const path of ['/api/v1/bot-access', '/api/v1/cli-inventory']) {
        const head = await get(path, { method: 'HEAD' });
        expect(head.status).toBe(path === '/api/v1/bot-access' ? 503 : 200);
        expect(await head.text()).toBe('');
        expect((await get(`${path}?repo=x`)).status).toBe(400);
        expect((await get(path, { headers: { Host: 'foreign.invalid' } })).status).toBe(421);
        expect((await get(path, { headers: { Origin: 'http://foreign.invalid' } })).status).toBe(403);
        for (const site of ['cross-site', 'same-site']) expect((await get(path, { headers: { 'Sec-Fetch-Site': site } })).status).toBe(403);
        expect((await get(path, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
      }
      expect(spawnSpy).not.toHaveBeenCalled();
      expect(spawnSyncSpy).not.toHaveBeenCalled();
      expect(execFileSpy).not.toHaveBeenCalled();
      // One read per GET above, including the bot_access_unavailable case.
      expect(reads).toBe(8);
    } finally {
      spawnSpy.mockRestore();
      spawnSyncSpy.mockRestore();
      execFileSpy.mockRestore();
      await server.close();
    }

    // Without a collector both routes report pending, never empty data.
    const bare = await startOperatorServer({ port: 0, collect_fleet_board: async () => snapshot() });
    try {
      expect(await (await fetch(`${bare.url}/api/v1/bot-access`)).json()).toMatchObject({ error: { code: 'bot_access_pending' } });
      expect(await (await fetch(`${bare.url}/api/v1/cli-inventory`)).json()).toEqual(unavailableCliInventory('collection_pending'));
    } finally { await bare.close(); }

    // The serve collectors take the session only from the install record: HERDR_SESSION in the server
    // environment neither fails Bot access at start nor stands in for a missing record.
    const home = mkdtempSync(join(tmpdir(), 'rh-serve-notify-session-'));
    const collecting = await startOperatorServer({ port: 0, notify_collector: true, collect_fleet_board: async () => snapshot(),
      env: { ...process.env, REPO_HARNESS_HOME: home, HERDR_SESSION: 'pane-session' } });
    try {
      let notify = await (await fetch(`${collecting.url}/api/v1/notify/status`)).json() as { error: { code: string; message: string; next_action: string } };
      for (let attempt = 0; attempt < 200 && notify.error.code === 'notify_status_pending'; attempt++) {
        await Bun.sleep(25);
        notify = await (await fetch(`${collecting.url}/api/v1/notify/status`)).json() as { error: { code: string; message: string; next_action: string } };
      }
      expect(notify.error).toEqual({ code: 'notify_session_missing', message: expect.any(String), next_action: 'Run `repo-harness herdr notify install --session <name>`.' });
    } finally { await collecting.close(); rmSync(home, { recursive: true, force: true }); }
  });

  test('serves tests only from the collector cache, with typed unavailable states', async () => {
    const tests: TestsSnapshotV1 = {
      protocol: 1, kind: 'operator_tests', repository_id: 'repo-a', collected_at: '2026-10-27T00:00:00.000Z',
      run: { id: 100, attempt: 1, head_sha: 'b'.repeat(40), created_at: '2026-10-25T21:35:21Z', conclusion: 'success', channel: 'daily_full' },
      projection: { state: 'unavailable', reason: 'projection_missing' },
      results: { state: 'ok', files: [{ file: 'tests/a.test.ts', duration_ms: 5, cases: [{ suite: null, name: 'works', result: 'passed', duration_ms: 1 }] }] },
      repairs: { state: 'ok', issues: [] },
    };
    let cache: TestsRepositoryCache = { state: 'unavailable', reason: 'tests_pending' };
    let reads = 0;
    const spawnSpy = spyOn(childProcess, 'spawn');
    const execFileSpy = spyOn(childProcess, 'execFile');
    const server = await startOperatorServer({ port: 0, collect_fleet_board: async () => snapshot(), read_tests: id => { reads++; return id === 'repo-a' ? cache : { state: 'unavailable', reason: 'repository_not_found' }; } });
    const get = (path: string, init: RequestInit = {}) => fetch(`${server.url}${path}`, init);
    try {
      for (const [state, status] of [
        [{ state: 'unavailable', reason: 'tests_pending' }, 503],
        [{ state: 'unavailable', reason: 'no_daily_run' }, 503],
        [{ state: 'unavailable', reason: 'artifacts_missing' }, 503],
        [{ state: 'unavailable', reason: 'default_branch_unknown' }, 503],
      ] as const) {
        cache = state;
        const response = await get('/api/v1/repositories/repo-a/tests');
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error: { code: state.reason, message: expect.any(String), next_action: expect.any(String) } });
      }
      expect((await get('/api/v1/repositories/repo-b/tests')).status).toBe(404);
      cache = { state: 'ready', snapshot: tests };
      const ready = await get('/api/v1/repositories/repo-a/tests');
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual(tests);
      cache = { state: 'ready', snapshot: { ...tests, results: { state: 'ok', files: [{ file: 'tests/a.test.ts', duration_ms: 5, cases: [{ suite: null, name: 'at /Users/someone/repo', result: 'passed', duration_ms: 1 }] }] } } };
      const invalid = await get('/api/v1/repositories/repo-a/tests');
      expect(invalid.status).toBe(503);
      const invalidText = await invalid.text();
      expect(JSON.parse(invalidText)).toMatchObject({ error: { code: 'tests_invalid' } });
      expect(invalidText).not.toContain('/Users/');

      const path = '/api/v1/repositories/repo-a/tests';
      expect((await get(path, { method: 'HEAD' })).status).toBe(503);
      expect((await get(`${path}?run=1`)).status).toBe(400);
      expect((await get(path, { headers: { Host: 'foreign.invalid' } })).status).toBe(421);
      expect((await get(path, { headers: { Origin: 'http://foreign.invalid' } })).status).toBe(403);
      for (const site of ['cross-site', 'same-site']) expect((await get(path, { headers: { 'Sec-Fetch-Site': site } })).status).toBe(403);
      expect((await get(path, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
      expect(spawnSpy).not.toHaveBeenCalled();
      expect(execFileSpy).not.toHaveBeenCalled();
      // One cache read per admitted GET or HEAD above.
      expect(reads).toBe(8);
    } finally {
      spawnSpy.mockRestore();
      execFileSpy.mockRestore();
      await server.close();
    }
  });

  test('serves the docs tree from the cache and a file from the resident reader, with typed refusals', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-operator-docs-')));
    const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    const gitIn = (...args: string[]) => spawnSync('git', args, { cwd: root, env: gitEnv, encoding: 'utf8' }).stdout.trim();
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs/guide.md'), '# Guide\n');
    writeFileSync(join(root, '.env'), 'TOKEN=secret\n');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/private.ts'), 'private source\n');
    symlinkSync('../.env', join(root, 'docs/env.md'));
    symlinkSync('../.git/config', join(root, 'docs/git.md'));
    symlinkSync('../src', join(root, 'docs/source'));
    gitIn('init', '-q', '-b', 'main'); gitIn('add', 'docs'); gitIn('-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'seed');
    gitIn('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const commit = gitIn('rev-parse', 'HEAD');
    const reader = new DocsReader({ root, ref: 'refs/remotes/origin/main', env: gitEnv });
    reader.start();
    const listing = await reader.refresh();
    const tree: DocsTreeV1 = { protocol: 1, kind: 'operator_docs_tree', repository_id: 'repo-a', ref: 'refs/remotes/origin/main', commit,
      collected_at: '2026-10-27T00:00:00.000Z', files: listing.files };
    let pending: DocsRepositoryCache | null = null;
    const hung = { file: () => new Promise(() => {}) } as unknown as DocsReader;
    const read_docs = (id: string): DocsRepositoryCache => pending ?? (id === 'repo-a' ? { state: 'ready', tree, reader }
      : id === 'repo-b' ? { state: 'unavailable', reason: 'default_branch_unknown' }
        : id === 'repo-ref' ? { state: 'unavailable', reason: 'ref_invalid' }
        : id === 'repo-hung' ? { state: 'ready', tree: { ...tree, repository_id: 'repo-hung' }, reader: hung }
          : { state: 'unavailable', reason: 'repository_not_found' });
    const spawnSpy = spyOn(childProcess, 'spawn');
    const execFileSpy = spyOn(childProcess, 'execFile');
    const server = await startOperatorServer({ port: 0, max_concurrency: 1, timeout_ms: 1_000, collect_fleet_board: async () => snapshot(), read_docs });
    const get = (path: string, init?: RequestInit) => fetch(`${server.url}${path}`, init);
    const file = (repo: string, query: string, init?: RequestInit) => get(`/api/v1/repositories/${repo}/docs/file?${query}`, init);
    const code = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;
    try {
      const treeResponse = await get('/api/v1/repositories/repo-a/docs/tree');
      expect(treeResponse.status).toBe(200);
      expect(await treeResponse.json()).toEqual(tree);
      expect(tree.files.map(entry => entry.path)).toEqual(['docs/guide.md']);
      const ok = await file('repo-a', 'path=docs/guide.md');
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ protocol: 1, kind: 'operator_docs_file', repository_id: 'repo-a', ref: 'refs/remotes/origin/main', commit,
        path: 'docs/guide.md', size: 8, sha256: createHash('sha256').update('# Guide\n').digest('hex'), text: '# Guide\n',
        lines: [{ number: 1, text: '# Guide\n' }], worktree_differs: false });
      const head = await file('repo-a', 'path=docs/guide.md', { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');

      for (const [query, status, expected] of [
        ['path=.env', 403, 'path_denied'], ['path=docs/.env', 403, 'path_denied'], ['path=docs/../.env', 400, 'path_invalid'],
        ['path=.git/config', 403, 'path_denied'], ['path=docs/.git/config', 403, 'path_denied'], ['path=docs/.GIT/config', 403, 'path_denied'],
        ['path=src/private.ts', 403, 'path_denied'], ['path=docs/env.md', 403, 'path_escape'], ['path=docs/git.md', 403, 'path_escape'],
        ['path=docs/source/private.ts', 403, 'path_escape'], ['path=docs%2F..%2F.env', 400, 'path_invalid'],
        ['path=' + encodeURIComponent(join(root, 'docs/guide.md')), 400, 'path_invalid'], ['path=docs/none.md', 404, 'not_found'],
        ['', 400, 'invalid_request'], ['path=docs/guide.md&path=docs/guide.md', 400, 'invalid_request'], ['path=docs/guide.md&ref=main', 400, 'invalid_request'],
      ] as const) {
        const response = await file('repo-a', query);
        expect([query, response.status]).toEqual([query, status]);
        const text = await response.text();
        expect(JSON.parse(text).error.code).toBe(expected);
        expect(text).not.toContain(root);
      }
      expect((await get('/api/v1/repositories/repo-a/docs/tree?ref=main')).status).toBe(400);
      const missing = await get('/api/v1/repositories/repo-x/docs/tree');
      expect([missing.status, await code(missing)]).toEqual([404, 'repository_not_found']);
      const branch = await file('repo-b', 'path=docs/guide.md');
      expect([branch.status, await code(branch)]).toEqual([503, 'default_branch_unknown']);
      // Either name can make the ref unsafe; the next action names both and says renaming fixes only the remote.
      const ref = (await (await get('/api/v1/repositories/repo-ref/docs/tree')).json()) as { error: { code: string; next_action: string } };
      expect(ref.error.code).toBe('ref_invalid');
      for (const words of ['remote', 'default branch name', 'fixes only a remote name']) expect(ref.error.next_action).toContain(words);

      // One read in flight fills the cap; it times out, and a client that leaves frees its slot.
      const slow = file('repo-hung', 'path=docs/guide.md');
      await Bun.sleep(50);
      const busy = await file('repo-a', 'path=docs/guide.md');
      expect([busy.status, await code(busy)]).toEqual([503, 'docs_busy']);
      const late = await slow;
      expect([late.status, await code(late)]).toEqual([504, 'docs_timeout']);
      const leaving = new AbortController();
      const abandoned = file('repo-hung', 'path=docs/guide.md', { signal: leaving.signal }).catch(() => null);
      await Bun.sleep(50);
      leaving.abort();
      await abandoned;
      await Bun.sleep(50);
      expect((await file('repo-a', 'path=docs/guide.md')).status).toBe(200);

      for (const path of ['/api/v1/repositories/repo-a/docs/tree', '/api/v1/repositories/repo-a/docs/file?path=docs/guide.md']) {
        expect((await get(path, { headers: { Host: 'foreign.invalid' } })).status).toBe(421);
        expect((await get(path, { headers: { Origin: 'http://foreign.invalid' } })).status).toBe(403);
        for (const site of ['cross-site', 'same-site']) expect((await get(path, { headers: { 'Sec-Fetch-Site': site } })).status).toBe(403);
        expect((await get(path, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
      }
      pending = { state: 'unavailable', reason: 'docs_pending' };
      const notYet = await get('/api/v1/repositories/repo-a/docs/tree');
      expect([notYet.status, await code(notYet)]).toEqual([503, 'docs_pending']);
      // The resident process already ran: no GET started a process.
      expect(spawnSpy).not.toHaveBeenCalled();
      expect(execFileSpy).not.toHaveBeenCalled();
    } finally {
      spawnSpy.mockRestore();
      execFileSpy.mockRestore();
      await server.close();
      reader.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('bounds repository reads and permits a healthy retry after timeout', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-repository-timeout-'));
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    let repositoryCalls = 0;
    let abortObserved = false;
    let healthy = false;
    const server = await startOperatorServer({
      port: 0,
      static_root: staticRoot,
      timeout_ms: 1_000,
      collect_fleet_board: async (options) => snapshot(options?.sequence ?? 1),
      read_repository_snapshot: async ({ signal }) => {
        repositoryCalls += 1;
        if (healthy) return unavailableRepository('repo-write');
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => { abortObserved = true; reject(new Error('cancelled')); }, { once: true });
        });
      },
    });
    try {
      const startedAt = Date.now();
      const timedOut = await fetch(`${server.url}/api/v1/repositories/repo-write/snapshot`);
      expect(Date.now() - startedAt).toBeLessThan(2_500);
      expect(timedOut.status).toBe(503);
      expect(await timedOut.json()).toMatchObject({
        error: {
          code: 'repository_snapshot_timeout',
          message: 'The repository snapshot timed out.',
        },
      });
      expect(repositoryCalls).toBe(1);
      expect(abortObserved).toBe(true);

      healthy = true;
      const retry = await fetch(`${server.url}/api/v1/repositories/repo-write/snapshot`);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(unavailableRepository('repo-write'));
      expect(repositoryCalls).toBe(2);
    } finally {
      await server.close();
      rmSync(staticRoot, { recursive: true, force: true });
    }
  });

  test('coalesces same-repository repository reads and retains work for a remaining subscriber', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-repository-coalesce-'));
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    let calls = 0;
    let aborts = 0;
    let healthy = false;
    let resolveFirst!: (snapshot: OperatorRepositorySnapshotV1) => void;
    const server = await startOperatorServer({
      port: 0,
      static_root: staticRoot,
      max_concurrency: 1,
      collect_fleet_board: async () => snapshot(),
      read_repository_snapshot: ({ signal }) => {
        calls += 1;
        if (healthy) return Promise.resolve(unavailableRepository('repo-write'));
        signal.addEventListener('abort', () => { aborts += 1; }, { once: true });
        return new Promise((resolve) => { resolveFirst = resolve as (snapshot: OperatorRepositorySnapshotV1) => void; });
      },
    });
    const firstController = new AbortController();
    const url = `${server.url}/api/v1/repositories/repo-write/snapshot`;
    const first = fetch(url, { signal: firstController.signal }).catch(() => null);
    try {
      await waitFor(() => calls === 1, 'first repository reader did not start');
      const second = fetch(url);
      await Bun.sleep(30);
      expect(calls).toBe(1);

      firstController.abort();
      await first;
      await Bun.sleep(30);
      expect(aborts).toBe(0);

      resolveFirst(unavailableRepository('repo-write'));
      expect((await second).status).toBe(200);
      healthy = true;
      expect((await fetch(url)).status).toBe(200);
      expect(calls).toBe(2);
    } finally {
      await server.close();
      rmSync(staticRoot, { recursive: true, force: true });
    }
  });

  test('bounds cross-repository repository workers and rejects queue overflow', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-repository-queue-'));
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    const started: string[] = [];
    const resolvers = new Map<string, (snapshot: OperatorRepositorySnapshotV1) => void>();
    const server = await startOperatorServer({
      port: 0,
      static_root: staticRoot,
      max_concurrency: 1,
      collect_fleet_board: async () => snapshot(),
      read_repository_snapshot: ({ repository_id }) => new Promise((resolve) => {
        started.push(repository_id);
        resolvers.set(repository_id, resolve as (snapshot: OperatorRepositorySnapshotV1) => void);
      }),
    });
    const url = (repositoryId: string) => `${server.url}/api/v1/repositories/${repositoryId}/snapshot`;
    try {
      const first = fetch(url('repo-a'));
      await waitFor(() => started.length === 1, 'first repository reader did not start');
      const second = fetch(url('repo-b'));
      const third = fetch(url('repo-c'));
      const overloaded = await fetch(url('repo-d'));
      expect(overloaded.status).toBe(503);
      expect(await overloaded.json()).toMatchObject({ error: { code: 'repository_snapshot_busy' } });
      expect(started).toEqual(['repo-a']);

      resolvers.get('repo-a')!(unavailableRepository('repo-a'));
      expect((await first).status).toBe(200);
      await waitFor(() => started.length === 2, 'queued repository reader did not start');
      expect(started).toEqual(['repo-a', 'repo-b']);
      resolvers.get('repo-b')!(unavailableRepository('repo-b'));
      expect((await second).status).toBe(200);
      await waitFor(() => started.length === 3, 'second queued repository reader did not start');
      resolvers.get('repo-c')!(unavailableRepository('repo-c'));
      expect((await third).status).toBe(200);
    } finally {
      await server.close();
      rmSync(staticRoot, { recursive: true, force: true });
    }
  });

  test('isolates the default Repository reader and holds capacity until the blocked Worker exits', async () => {
    if (process.platform === 'win32') return;
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-repository-worker-'));
    const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-operator-repository-repo-')));
    expect(spawnSync('git', ['init', '-q', repoRoot]).status).toBe(0);
    const secondRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-operator-repository-second-')));
    expect(spawnSync('git', ['init', '-q', secondRoot]).status).toBe(0);
    const registry = registryHome([{ path: repoRoot, accessMode: 'read_write' }, { path: secondRoot, accessMode: 'read_write' }]);
    // Block a remaining Git read. The retired collaboration policy is no longer read.
    const policyPath = join(repoRoot, 'git-read-gate');
    const bin = join(repoRoot, 'bin');
    mkdirSync(bin);
    const realGit = Bun.which('git')!;
    writeFileSync(join(bin, 'git'), `#!/bin/sh\ncat < '${policyPath}' > /dev/null\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
    const originalPath = process.env.PATH;
    process.env.PATH = `${bin}:${originalPath}`;
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    const fifo = spawnSync('mkfifo', [policyPath], { encoding: 'utf8' });
    expect(fifo.status).toBe(0);
    const server = await startOperatorServer({
      port: 0,
      static_root: staticRoot,
      max_concurrency: 1,
      // Real Worker and Git startup share this deadline under the eight-file CI load.
      // Injected-reader tests above retain their one-second deadlines.
      timeout_ms: 5_000,
      env: registry.env,
      collect_fleet_board: async (options) => snapshot(options?.sequence ?? 1),
    });
    const fifoWriter = spawn('bash', ['-c', 'exec 3>"$1"; exec sleep 10', 'bash', policyPath], {
      stdio: 'ignore',
    });
    try {
      const startedAt = Date.now();
      const url = `${server.url}/api/v1/repositories/${registry.ids[0]!}/snapshot`;
      const timedOut = await fetch(url);
      expect(Date.now() - startedAt).toBeLessThan(6_500);
      expect(timedOut.status).toBe(503);
      expect(await timedOut.json()).toMatchObject({ error: { code: 'repository_snapshot_timeout' } });
      const busy = await fetch(url);
      expect(busy.status).toBe(503);
      expect(await busy.json()).toMatchObject({ error: { code: 'repository_snapshot_busy' } });
      let queuedFinished = false;
      const queued = fetch(`${server.url}/api/v1/repositories/${registry.ids[1]!}/snapshot`).then(response => { queuedFinished = true; return response; });
      await Bun.sleep(30);
      expect(queuedFinished).toBe(false);

      rmSync(policyPath);
      writeFileSync(policyPath, `${JSON.stringify({})}\n`);
      fifoWriter.kill('SIGTERM');
      expect((await queued).status).toBe(200);
      const retry = await fetch(url);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({
        kind: 'operator_repository_snapshot',
        repository_id: registry.ids[0],
      });
    } finally {
      process.env.PATH = originalPath;
      fifoWriter.kill('SIGTERM');
      await server.close();
      rmSync(staticRoot, { recursive: true, force: true });
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(secondRoot, { recursive: true, force: true });
      rmSync(registry.home, { recursive: true, force: true });
    }
  });

  test('isolates default Fleet collection and clears a blocked Worker for retry and shutdown', async () => {
    if (process.platform === 'win32') return;
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-fleet-worker-'));
    const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-operator-fleet-repo-')));
    expect(spawnSync('git', ['init', '-q', repoRoot]).status).toBe(0);
    const registry = registryHome([{ path: repoRoot, accessMode: 'read_write' }]);
    // Block a real Git read used by provider observation, not the retired Sprint marker.
    const markerPath = join(repoRoot, 'git-read-gate'), bin = join(repoRoot, 'bin');
    mkdirSync(bin);
    const realGit = Bun.which('git')!, originalPath = process.env.PATH;
    writeFileSync(join(bin, 'git'), `#!/bin/sh\ncat < '${markerPath}' > /dev/null\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
    process.env.PATH = `${bin}:${originalPath}`;
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    expect(spawnSync('mkfifo', [markerPath]).status).toBe(0);
    const server = await startOperatorServer({
      port: 0,
      static_root: staticRoot,
      // The retry starts a real collector process and real Git reads within this
      // deadline. On a busy host that work took more than one second.
      timeout_ms: 5_000,
      env: registry.env,
    });
    let writer = spawn('bash', ['-c', 'exec 3>"$1"; sleep 10', 'bash', markerPath], { stdio: 'ignore' });
    let closed = false;
    try {
      const startedAt = Date.now();
      const blocked = fetch(`${server.url}/api/v1/fleet/snapshot`);
      await Bun.sleep(30);
      expect((await fetch(`${server.url}/healthz`)).status).toBe(200);
      const timedOut = await blocked;
      expect(Date.now() - startedAt).toBeLessThan(6_500);
      expect(timedOut.status).toBe(503);
      expect(await timedOut.json()).toMatchObject({ error: { code: 'fleet_snapshot_timeout' } });

      writer.kill('SIGTERM');
      rmSync(markerPath);
      writeFileSync(markerPath, '\n');
      const retry = await fetch(`${server.url}/api/v1/fleet/snapshot`);
      expect(retry.status).toBe(200);
      expect(JSON.stringify(await retry.json())).not.toContain(registry.home);

      rmSync(markerPath);
      expect(spawnSync('mkfifo', [markerPath]).status).toBe(0);
      writer = spawn('bash', ['-c', 'exec 3>"$1"; sleep 10', 'bash', markerPath], { stdio: 'ignore' });
      const active = fetch(`${server.url}/api/v1/fleet/snapshot`).catch(() => null);
      await Bun.sleep(30);
      const closeStartedAt = Date.now();
      await server.close();
      closed = true;
      expect(Date.now() - closeStartedAt).toBeLessThan(2_500);
      await active;
    } finally {
      process.env.PATH = originalPath;
      writer.kill('SIGTERM');
      if (!closed) await server.close();
      rmSync(staticRoot, { recursive: true, force: true });
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(registry.home, { recursive: true, force: true });
    }
  });

  test('default Repository reads never lazy-fetch a missing promisor provider graph blob', async () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-operator-fleet-promisor-')));
    const remote = join(parent, 'remote.git');
    const source = moduleRepository();
    const clone = join(parent, 'clone');
    const graph = '.ai/harness/work-graph.v2.json';
    const git = (cwd: string, ...args: string[]) => {
      const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    // Keep an immutable provider graph on the policy-selected branch.
    git(parent, 'init', '-q', '--bare', '-b', 'main', remote);
    git(remote, 'config', 'uploadpack.allowFilter', 'true');
    git(source, 'branch', '-M', 'main');
    fixtureWrite(source, 'agents/engineers/profiles/.gitkeep', '');
    fixtureWrite(source, graph, JSON.stringify({ protocol: 2, kind: 'repo-harness-provider-work-graph', repository_id: repoHarnessRepoIdFor(clone), work_packages: [] }));
    git(source, 'add', '.');
    git(source, 'commit', '-qm', 'base');
    git(source, 'push', '-q', `file://${remote}`, 'main');
    git(parent, 'clone', '-q', '--filter=blob:none', `file://${remote}`, clone);
    git(clone, 'switch', '-qc', 'work');
    expect(existsSync(join(clone, graph))).toBe(true);
    // Whitespace produces a distinct missing blob while preserving valid graph semantics.
    writeFileSync(join(source, graph), readFileSync(join(source, graph), 'utf8') + '\n');
    git(source, 'commit', '-qam', 'moved');
    git(source, 'push', '-q', `file://${remote}`, 'main');
    git(clone, 'fetch', '-q', 'origin', 'main:main');
    const blob = git(clone, 'rev-parse', `main:${graph}`);
    const blobPresent = () => spawnSync('git', ['cat-file', '-e', blob], { cwd: clone, env: { ...process.env, GIT_NO_LAZY_FETCH: '1' } }).status === 0;
    expect(blobPresent()).toBe(false);
    const fetchMarker = join(parent, 'fetch-ran');
    git(clone, 'config', 'remote.origin.uploadpack', `touch '${fetchMarker}'; git-upload-pack`);
    const packs = readdirSync(join(clone, '.git/objects/pack')).sort();
    const registry = registryHome([{ path: clone, accessMode: 'read_only' }]);
    const server = await startOperatorServer({
      port: 0,
      static_root: parent,
      // A caller value must not reopen lazy fetch for the read-only worker.
      env: { ...registry.env, GIT_NO_LAZY_FETCH: '0' },
    });
    try {
      for (const route of [`/api/v1/repositories/${registry.ids[0]}/snapshot`]) {
        const response = await fetch(`${server.url}${route}`);
        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.planning).toMatchObject({ status: 'observed', snapshot: { graph: { status: 'unavailable', code: 'needs_provider_graph' } } });
        const body = JSON.stringify(payload);
        expect(body).not.toContain('moved');
        expect(existsSync(fetchMarker)).toBe(false);
        expect(blobPresent()).toBe(false);
        expect(readdirSync(join(clone, '.git/objects/pack')).sort()).toEqual(packs);
      }
    } finally {
      await server.close();
      rmSync(parent, { recursive: true, force: true });
      rmSync(source, { recursive: true, force: true });
      rmSync(registry.home, { recursive: true, force: true });
    }
  });

  test('cancels a sole Fleet observation when its client disconnects and permits a clean retry', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-fleet-disconnect-'));
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    let started = false;
    let abortObserved = false;
    let healthy = false;
    let cleanupSettled = false;
    let overlap = false;
    let collectCalls = 0;
    const server = await startOperatorServer({
      port: 0,
      static_root: staticRoot,
      collect_fleet_board: async (options) => {
        collectCalls += 1;
        if (healthy) { overlap = !cleanupSettled; return snapshot(options?.sequence ?? 1); }
        started = true;
        return new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            abortObserved = true;
            // The production collector settles long after the abort signal: it
            // drains a cleanup grace period and then waits for the collector
            // process group to disappear. A fixture that rejects inside the
            // abort listener hides the reload race entirely, because the shared
            // in-flight promise is already gone by the time a retry arrives.
            setTimeout(() => { cleanupSettled = true; reject(new Error('cancelled Fleet fixture')); }, 300);
          }, { once: true });
        });
      },
    });
    const socket = createConnection({ host: server.host, port: server.port });
    try {
      await new Promise<void>((resolveConnected, rejectConnected) => {
        socket.once('connect', resolveConnected);
        socket.once('error', rejectConnected);
      });
      socket.write([
        'GET /api/v1/fleet/snapshot HTTP/1.1',
        `Host: ${server.host}:${server.port}`,
        'Connection: keep-alive',
        '',
        '',
      ].join('\r\n'));
      await waitFor(() => started, 'Fleet observation did not start');
      socket.destroy();
      await waitFor(() => abortObserved, 'Fleet client disconnect did not abort collection');
      healthy = true;
      // A page reload lands here: the cancelled collection has not settled yet,
      // so a shared in-flight promise would hand this request the dying one.
      const retry = await fetch(`${server.url}/api/v1/fleet/snapshot`);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({ kind: 'operator_fleet_snapshot' });
      expect(collectCalls).toBe(2);
      expect(overlap).toBe(false);
    } finally {
      socket.destroy();
      await server.close();
      rmSync(staticRoot, { recursive: true, force: true });
    }
  });

  test('refuses static assets that escape through an intermediate symlink', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-ui-'));
    const outsideRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-outside-'));
    mkdirSync(join(outsideRoot, 'assets'));
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    writeFileSync(join(outsideRoot, 'assets', 'secret.js'), 'machine-local-secret');
    symlinkSync(join(outsideRoot, 'assets'), join(staticRoot, 'assets'));
    const server = await startOperatorServer({
      port: 0,
      static_root: staticRoot,
      collect_fleet_board: async () => snapshot(),
    });
    try {
      const response = await fetch(`${server.url}/assets/secret.js`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('machine-local-secret');
    } finally {
      await server.close();
      rmSync(staticRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  test('turns a repository repository identity mismatch into a typed refusal', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-repository-echo-'));
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    const server = await startOperatorServer({
      port: 0,
      static_root: staticRoot,
      collect_fleet_board: async () => snapshot(),
      read_repository_snapshot: async () => {
        throw new OperatorRepositoryError(
          'repository_mismatch',
          'repository snapshot for /private/tmp/other-repo answered repo-other',
        );
      },
    });
    try {
      const response = await fetch(`${server.url}/api/v1/repositories/repo-write/snapshot`);
      expect(response.status).toBe(500);
      const body = await response.json() as { error: { code: string; message: string; next_action: string } };
      expect(body.error.code).toBe('repository_mismatch');
      expect(body.error.message).toBe('The repository snapshot does not belong to the requested repository.');
      expect(body.error.next_action.length).toBeGreaterThan(0);
      expect(JSON.stringify(body)).not.toContain('/private/tmp/other-repo');
      expect(JSON.stringify(body)).not.toContain('repo-other');
    } finally {
      await server.close();
      rmSync(staticRoot, { recursive: true, force: true });
    }
  });

  test('keeps a case-variant API path off the SPA shell and pins the refusal headers', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-headers-'));
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    const server = await startOperatorServer({
      port: 0,
      static_root: staticRoot,
      collect_fleet_board: async () => snapshot(),
    });
    try {
      for (const variant of ['/API/v1/fleet/snapshot', '/Api/v1/repository/repo-write/snapshot', '/API']) {
        const response = await fetch(`${server.url}${variant}`, { headers: { Accept: 'text/html' } });
        expect(response.status).toBe(404);
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
        const text = await response.text();
        expect(text).not.toContain('<main>operator</main>');
        expect(JSON.parse(text)).toMatchObject({ error: { code: 'not_found' } });
      }

      const document = await fetch(`${server.url}/`);
      expect(document.status).toBe(200);
      expect(document.headers.get('content-security-policy')).toBe(
        "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      );

      const options = await fetch(`${server.url}/api/v1/fleet/snapshot`, { method: 'OPTIONS' });
      expect(options.status).toBe(405);
      expect(options.headers.get('allow')).toBe('GET, HEAD');
      expect(options.headers.get('content-security-policy')).toBeNull();
      expect(await options.json()).toMatchObject({ error: { code: 'method_not_allowed' } });
    } finally {
      await server.close();
      rmSync(staticRoot, { recursive: true, force: true });
    }
  });

  test('logs one stderr line per refusal without the body, headers, or Origin', async () => {
    const server = await startOperatorServer({ port: 0 });
    const path = `/api/v1/fleet/tasks/repo-write/${TASK_ID}/messages`;
    const url = server.url + path;
    const captured: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    try {
      process.stderr.write = ((chunk: unknown) => {
        captured.push(typeof chunk === 'string' ? chunk : String(chunk));
        return true;
      }) as typeof process.stderr.write;
      try {
        const refused = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain', Origin: server.url, 'Sec-Fetch-Site': 'same-origin' },
          body: 'confidential-operator-body',
        });
        expect(refused.status).toBe(405);
        await waitFor(() => captured.length > 0, 'refusal was not logged');
        const accepted = await fetch(`${server.url}/healthz`);
        expect(accepted.status).toBe(200);
      } finally {
        process.stderr.write = originalWrite;
      }
      const lines = captured.join('').split('\n').filter((line) => line.length > 0);
      expect(lines).toHaveLength(1);
      const line = lines[0]!;
      expect(line).toContain('method=POST');
      expect(line).toContain('status=405');
      expect(line).toContain('code=method_not_allowed');
      expect(line).toContain(path);
      expect(line).not.toContain('confidential-operator-body');
      expect(line).not.toContain(server.url);
      expect(line).not.toContain('text/plain');
    } finally {
      await server.close();
    }
  });
});

const admittedDiffSelector = {
  repository_id: 'repo-a', provider_repository_id: '123', issue_id: '456', campaign_id: 'campaign',
  task: 'review-task', role: 'deep-reasoner', claim_ref: 'https://github.com/acme/widgets/issues/1#issuecomment-2',
  claim_revision: 'sha256:' + 'a'.repeat(64), grant_sha256: 'sha256:' + 'b'.repeat(64),
  policy_sha256: 'sha256:' + 'c'.repeat(64), actor_id: 'owner', session_binding_sha256: 'sha256:' + 'd'.repeat(64),
};
const admittedDiffPath = '/api/v1/fleet/task-sessions/repo-a/diff?' + new URLSearchParams(
  Object.fromEntries(Object.entries(admittedDiffSelector).filter(([key]) => key !== 'repository_id')));

describe('reader retirement', () => {
  // Activity shares this slot but requires an inbox-compatible stable task ID.
  const selector = { ...admittedDiffSelector, task: TASK_ID };
  const diffPath = '/api/v1/fleet/task-sessions/repo-a/diff?' + new URLSearchParams(
    Object.fromEntries(Object.entries(selector).filter(([key]) => key !== 'repository_id')));
  const diff = {
    ...selector, protocol: 2 as const, kind: 'operator_task_diff' as const,
    target_ref: 'main', branch: 'codex/task', base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40),
    observed_at: '2026-09-22T00:00:00.000Z', patch: '', untracked_paths: [],
  };
  for (const kind of ['repository', 'diff'] as const) {
    const path = kind === 'diff' ? diffPath : '/api/v1/repositories/repo-a/snapshot';
    for (const ending of ['timeout', 'disconnect'] as const) {
      test(`${kind} ${ending} holds its slot until retirement and refuses a premature same-source retry`, async () => {
        let calls = 0, secondaryCalls = 0, firstSignal: AbortSignal | undefined, retire!: () => void;
        const hold = (signal: AbortSignal) => {
          calls++; if (calls > 1) return Promise.resolve();
          firstSignal = signal; return new Promise<void>(resolve => { retire = resolve; });
        };
        const server = await startOperatorServer({ port: 0, max_concurrency: 1, timeout_ms: 1000,
          read_repository_snapshot: async input => { await hold(input.signal); return unavailableRepository(input.repository_id); },
          read_task_diff: async input => { await hold(input.signal); return diff; },
          read_admitted_task_activity: async () => { secondaryCalls++; throw new Error('retired slot must block activity'); },
          read_task_context: async () => { secondaryCalls++; throw new Error('retired slot must block context'); },
        });
        const abort = new AbortController();
        const first = fetch(server.url + path, { signal: abort.signal }).catch(() => null);
        try {
          await waitFor(() => calls === 1, 'reader not started');
          if (ending === 'disconnect') abort.abort();
          const response = await first;
          if (ending === 'timeout') expect(response?.status).toBe(503);
          await waitFor(() => firstSignal?.aborted === true, 'reader cancellation not observed');
          const busy = await fetch(server.url + path);
          expect(busy.status).toBe(503);
          expect(await busy.json()).toMatchObject(kind === 'diff' ? { code: 'busy' } : { error: { code: 'repository_snapshot_busy' } });
          expect(calls).toBe(1);
          if (kind === 'diff') {
            for (const route of ['activity', 'context']) {
              const blocked = await fetch(server.url + diffPath.replace('/diff?', `/${route}?`));
              expect(blocked.status).toBe(503);
              expect(await blocked.json()).toEqual({ code: 'busy' });
            }
          }
          expect(secondaryCalls).toBe(0);
          retire(); await Bun.sleep(0);
          const fresh = await fetch(server.url + path);
          expect(fresh.status).toBe(200);
          expect(await fresh.json()).toEqual(kind === 'diff' ? diff : unavailableRepository('repo-a'));
          expect(calls).toBe(2);
        } finally { retire?.(); abort.abort(); await first; await server.close(); }
      });
    }

    test(`${kind} shutdown awaits retirement for every concurrent close caller`, async () => {
      let signal: AbortSignal | undefined, retire!: () => void;
      const hold = (value: AbortSignal) => { signal = value; return new Promise<void>(resolve => { retire = resolve; }); };
      const server = await startOperatorServer({ port: 0,
        read_repository_snapshot: async input => { await hold(input.signal); return unavailableRepository(input.repository_id); },
        read_task_diff: async input => { await hold(input.signal); return diff; },
      });
      const request = fetch(server.url + path).catch(() => null);
      try {
        await waitFor(() => signal !== undefined, 'reader not started');
        const closed = [false, false];
        const first = server.close().then(() => { closed[0] = true; });
        const second = server.close().then(() => { closed[1] = true; });
        await waitFor(() => signal?.aborted === true, 'shutdown did not abort');
        await Bun.sleep(30);
        expect(closed).toEqual([false, false]);
        retire(); await Promise.all([first, second]);
        expect(closed).toEqual([true, true]);
        expect((await request)?.status).not.toBe(200);
      } finally { retire?.(); await server.close(); await request; }
    });
  }

  test('closing cancels queued Repository observations before waiting for the active reader', async () => {
    const starts: string[] = []; let retire!: () => void;
    const server = await startOperatorServer({ port: 0, max_concurrency: 1,
      read_repository_snapshot: async input => {
        starts.push(input.repository_id);
        if (starts.length === 1) await new Promise<void>(resolve => { retire = resolve; });
        return unavailableRepository(input.repository_id);
      },
    });
    const first = fetch(server.url + '/api/v1/repositories/repo-a/snapshot').catch(() => null);
    let queued: Promise<Response | null> | undefined;
    try {
      await waitFor(() => starts.length === 1, 'reader not started');
      queued = fetch(server.url + '/api/v1/repositories/repo-b/snapshot').catch(() => null);
      await Bun.sleep(30);
      const closing = server.close(); await Bun.sleep(30);
      expect(starts).toEqual(['repo-a']);
      retire(); await closing; await Promise.all([first, queued]);
      expect(starts).toEqual(['repo-a']);
    } finally { retire?.(); await server.close(); await Promise.all([first, queued]); }
  });
});

describe('read-only task diff route', () => {
  const path = admittedDiffPath;
  const result = {
    ...admittedDiffSelector, protocol: 2 as const, kind: 'operator_task_diff' as const,
    target_ref: 'main', branch: 'codex/task', base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40),
    observed_at: '2026-09-10T00:00:00.000Z', patch: '', untracked_paths: [],
  };
  test('validates query/fence and reuses origin and method guards', async () => {
    let calls = 0;
    const server = await startOperatorServer({ port: 0, read_task_diff: async () => { calls++; return result; } });
    try {
      const response = await fetch(server.url+path); expect(response.status).toBe(200); expect(await response.json()).toEqual(result);
      const head = await fetch(server.url+path, { method: 'HEAD' }); expect(head.status).toBe(200); expect(await head.text()).toBe('');
      expect((await fetch(server.url+path+'&root=/tmp')).status).toBe(400);
      expect((await fetch(server.url+path+'&actor_id=other')).status).toBe(400);
      expect((await fetch(server.url+path, { headers: { Origin: 'https://example.com' } })).status).toBe(403);
      expect((await fetch(server.url+path, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
      expect(calls).toBe(2);
    } finally { await server.close(); }
  });
  test('caps concurrent reads, enforces deadline and aborts the injected reader', async () => {
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    let signal: AbortSignal | undefined;
    const server = await startOperatorServer({ port: 0, max_concurrency: 1, timeout_ms: 1000,
      read_task_diff: input => { signal = input.signal; entered(); return new Promise((_resolve, reject) => input.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })); },
    });
    try {
      const pending = fetch(server.url+path); await started;
      expect(await (await fetch(server.url+path)).json()).toEqual({ code: 'busy' });
      expect(await (await pending).json()).toEqual({ code: 'timeout' }); expect(signal?.aborted).toBe(true);
    } finally { await server.close(); }
  });
  test('rejects mismatched reader payload', async () => {
    const server = await startOperatorServer({ port: 0, read_task_diff: async () => ({ ...result, actor_id: 'other' }) });
    try { expect(await (await fetch(server.url+path)).json()).toEqual({ code: 'unavailable' }); }
    finally { await server.close(); }
  });
});

test('task diff disconnect and shutdown cancel active reads', async () => {
  const path = admittedDiffPath;
  let entered!: () => void;
  let stopped!: () => void;
  let started = new Promise<void>(resolve => { entered = resolve; });
  let cancelled = new Promise<void>(resolve => { stopped = resolve; });
  const server = await startOperatorServer({ port: 0, read_task_diff: ({ signal }) => {
    entered(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { stopped(); reject(new Error('cancelled')); }, { once: true }));
  } });
  try {
    const abort = new AbortController();
    const response = fetch(server.url+path, { signal: abort.signal }).catch(() => null);
    await started; abort.abort(); await cancelled; await response;
    started = new Promise<void>(resolve => { entered = resolve; });
    cancelled = new Promise<void>(resolve => { stopped = resolve; });
    const closing = fetch(server.url+path).catch(() => null);
    await started; await server.close(); await cancelled; await closing;
  } finally { await server.close(); }
});

describe('historical task activity route', () => {
  const path = `/api/v1/fleet/tasks/repo-a/${TASK_ID}/history/activity`;
  const activity = {
    repository_id:'repo-a', task_id:TASK_ID, limit:50, after:null, message_id:null,
    protocol:1 as const, kind:'operator_task_activity' as const, observed_at:'2026-09-22T00:00:00.000Z', consistency:'observed' as const,
    entries:[], coverage:{scope:'task' as const,complete:true,reason:null,scanned:0,bytes:0},next_cursor:null,
  };
  test('inherits Host/Origin/method guards and rejects path/ref and duplicate selectors', async () => {
    let calls=0;
    const server=await startOperatorServer({port:0,read_task_activity:async()=>{calls++;return activity;}});
    try {
      expect((await fetch(server.url+path)).status).toBe(200);
      const head=await fetch(server.url+path,{method:'HEAD'}); expect(head.status).toBe(200); expect(await head.text()).toBe('');
      for(const query of ['?root=/tmp','?ref=main','?after=invalid','?limit=1&limit=2','?message_id='+CLAIM_ID+'&limit=1']) expect((await fetch(server.url+path+query)).status).toBe(400);
      expect((await fetch(server.url+path,{headers:{Origin:'https://example.com'}})).status).toBe(403);
      expect((await fetch(server.url+path,{method:'POST',headers:{Origin:server.url,'Sec-Fetch-Site':'same-origin'}})).status).toBe(405);
      expect(calls).toBe(2);
    } finally {await server.close();}
  });
  test('timeout aborts response but holds capacity until the underlying reader actually settles', async () => {
    let entered!:()=>void, settle!:()=>void;
    const started=new Promise<void>(r=>{entered=r;});
    let signal:AbortSignal|undefined;
    const server=await startOperatorServer({port:0,timeout_ms:1000,max_concurrency:1,read_task_activity:input=>{
      signal=input.signal;entered();return new Promise(resolve=>{settle=()=>resolve(activity);});
    }});
    try {
      const pending=fetch(server.url+path);await started;
      expect(await (await fetch(server.url+path)).json()).toEqual({code:'busy'});
      expect(await (await pending).json()).toEqual({code:'timeout'});expect(signal?.aborted).toBeTrue();
      expect(await (await fetch(server.url+path)).json()).toEqual({code:'busy'});
      settle();await new Promise(resolve=>setTimeout(resolve,0));
    } finally {settle?.();await server.close();}
  });
  test('rejects cross-repository worker-shaped payloads', async () => {
    const server=await startOperatorServer({port:0,read_task_activity:async()=>({...activity,repository_id:'repo-b'})});
    try {expect(await(await fetch(server.url+path)).json()).toEqual({code:'unavailable'});} finally {await server.close();}
  });
  test('disconnect and shutdown cancel activity reads without retaining request listeners', async () => {
    let entered!:()=>void, stopped!:()=>void;
    const started=new Promise<void>(r=>{entered=r;}), aborted=new Promise<void>(r=>{stopped=r;});
    const server=await startOperatorServer({port:0,read_task_activity:({signal})=>new Promise((_,reject)=>{
      signal.addEventListener('abort',()=>{stopped();reject(new Error('aborted'));},{once:true});entered();
    })});
    try {
      const controller=new AbortController();const pending=fetch(server.url+path,{signal:controller.signal}).catch(()=>null);
      await started;controller.abort();await aborted;await pending;
    } finally {await server.close();}
    let shutdownEntered!:()=>void, shutdownStopped!:()=>void;
    const running=new Promise<void>(r=>{shutdownEntered=r;}), stopping=new Promise<void>(r=>{shutdownStopped=r;});
    const second=await startOperatorServer({port:0,read_task_activity:({signal})=>new Promise((_,reject)=>{
      signal.addEventListener('abort',()=>{shutdownStopped();reject(new Error('shutdown'));},{once:true});shutdownEntered();
    })});
    const pending=fetch(second.url+path).catch(()=>null);await running;await second.close();await stopping;await pending;
  });
});

describe('current Task context route',()=>{
  const hash='sha256:'+'a'.repeat(64);
  const selector={repository_id:'repo-a',provider_repository_id:'123',issue_id:'456',campaign_id:'review',task:TASK_ID,role:'worker',claim_ref:'claim:1',claim_revision:hash,grant_sha256:hash,policy_sha256:hash,actor_id:'owner',session_binding_sha256:hash};
  const query=new URLSearchParams(Object.entries(selector).filter(([key])=>key!=='repository_id'));
  const path=`/api/v1/fleet/task-sessions/repo-a/context?${query}`;
  const context:import('../../src/core/operator/admitted-task-context').AdmittedTaskContext={
    protocol:2,kind:'operator_admitted_task_context',selector,goal:{revision:hash,content:'Current goal'},verification:{plan_sha256:hash,plan_json:'{}'},
    scope:{allowed_paths:['src/**'],benchmark:'not_required',oracles_json:'[]'},approval:{admission_sha256:hash,grant_sha256:hash,revision:1,goal_revision:hash,scope_sha256:hash},
    profile_selection:{state:'unassigned'},execution:{branch:'codex/task',runtime:'terminal',harness_kind:'codex'},observed_at:'2026-10-25T00:00:00Z',
  };
  test('validates Host, Origin and selectors before reading, then binds expected revision',async()=>{
    let calls=0;const server=await startOperatorServer({port:0,read_task_context:async()=>{calls++;return context;}});
    try {
      expect((await fetch(server.url+path,{headers:{Host:'foreign.invalid'}})).status).toBe(421);
      expect((await fetch(server.url+path,{headers:{Origin:'https://foreign.invalid'}})).status).toBe(403);
      expect((await fetch(server.url+path+'&source_ref=private')).status).toBe(400);
      expect(calls).toBe(0);
      expect((await fetch(server.url+path)).status).toBe(200);
      const changedQuery=new URLSearchParams(query);changedQuery.set('grant_sha256','sha256:'+'b'.repeat(64));
      expect(await(await fetch(server.url+'/api/v1/fleet/task-sessions/repo-a/context?'+changedQuery)).json()).toEqual({code:'unavailable'});
    } finally {await server.close();}
  });
  test('context timeout holds shared activity capacity until the original reader settles',async()=>{
    let entered!:()=>void,settle!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
    let signal:AbortSignal|undefined,activityCalls=0;
    const server=await startOperatorServer({port:0,timeout_ms:1000,max_concurrency:1,
      read_task_context:input=>{signal=input.signal;entered();return new Promise(resolve=>{settle=()=>resolve(context);});},
      read_admitted_task_activity:async()=>{activityCalls++;throw new Error('unused');},
    });
    try {
      const pending=fetch(server.url+path);await started;
      const activityPath=server.url+path.replace('/context','/activity');
      expect(await(await fetch(activityPath)).json()).toEqual({code:'busy'});
      expect(await(await pending).json()).toEqual({code:'timeout'});expect(signal?.aborted).toBeTrue();
      expect(await(await fetch(activityPath)).json()).toEqual({code:'busy'});expect(activityCalls).toBe(0);
      settle();await new Promise(resolve=>setTimeout(resolve,0));
      expect(await(await fetch(activityPath)).json()).toEqual({code:'unavailable'});expect(activityCalls).toBe(1);
    } finally {settle?.();await server.close();}
  });
  test('server shutdown aborts a context reader and does not publish a late response',async()=>{
    let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});let aborted=false;
    const server=await startOperatorServer({port:0,read_task_context:({signal})=>new Promise((_,reject)=>{
      signal.addEventListener('abort',()=>{aborted=true;reject(new Error('cancelled'));},{once:true});entered();
    })});
    const pending=fetch(server.url+path).catch(()=>null);await started;await server.close();await pending;expect(aborted).toBeTrue();
  });
});

test('fleet snapshots use a new service epoch after server restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'operator-epoch-'));
  const epochs: string[] = [];
  try {
    for (let i = 0; i < 2; i += 1) {
      const server = await startOperatorServer({ port: 0, static_root: root, collect_fleet_board: async (input) =>
        projectFleetBoardSnapshot({ registry_revision: `sha256:${'a'.repeat(64)}`, sequence: input!.sequence!,
          observed_at: '2026-09-22T00:00:00.000Z', repositories: [{ repository_id: 'repo-a',
            repo_root: '/private/repo', access_mode: 'read_only', status: 'ok', snapshot_consistency: 'stable', cards: [], error: null }] }),
      });
      try {
        const fleet = await (await fetch(server.url + '/api/v1/fleet/snapshot')).json() as {service_epoch: string; protocol: number};
        expect(fleet.protocol).toBe(8); epochs.push(fleet.service_epoch);
      } finally { await server.close(); }
    }
    expect(epochs[0]).not.toBe(epochs[1]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

describe('repository source collection', () => {
  test('a corrupt Planning source does not hide Organization data, write files or leak paths', () => {
    const repoRoot = realpathSync(moduleRepository());
    fixtureWrite(repoRoot, 'agents/engineers/profiles/.gitkeep', '');
    fixtureCommit(repoRoot);
    const registry = registryHome([{ path: repoRoot, accessMode: 'read_only' }]);
    const policy = join(repoRoot, '.ai/harness/policy.json');
    mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
    const tree = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap(entry => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? tree(path) : [`${path}:${readFileSync(path).toString('base64')}`];
    }).sort();
    try {
      writeFileSync(policy, JSON.stringify({ worktree_strategy: { merge_back: { target: 'HEAD' } } }));
      fixtureWrite(repoRoot, '.ai/harness/work-graph.v2.json', JSON.stringify({ protocol: 2, kind: 'repo-harness-provider-work-graph', repository_id: registry.ids[0], work_packages: [] }));
      fixtureCommit(repoRoot);
      const before = tree(repoRoot);
      const observed = readOperatorRepositorySnapshot({ env: registry.env, repository_id: registry.ids[0]! });
      expect(observed.protocol).toBe(1);
      expect(observed.organization.status).toBe('observed');
      expect(observed.planning).toMatchObject({ status: 'observed', snapshot: { graph: { status: 'observed', snapshot: { packages: [] } } } });
      expect(JSON.stringify(observed)).not.toContain(repoRoot);
      expect(tree(repoRoot)).toEqual(before);
      // The graph source is independent of Organization's provider/session observation.
      fixtureWrite(repoRoot, '.ai/harness/work-graph.v2.json', '{invalid graph');
      fixtureCommit(repoRoot);
      const corruptBefore = tree(repoRoot);
      const corrupt = readOperatorRepositorySnapshot({ env: registry.env, repository_id: registry.ids[0]! });
      expect(corrupt.planning).toMatchObject({ status: 'observed', snapshot: { graph: { status: 'unavailable', code: 'source_unavailable' } } });
      expect(corrupt.organization.status).toBe('observed');
      expect(JSON.stringify(corrupt)).not.toContain(repoRoot);
      expect(tree(repoRoot)).toEqual(corruptBefore);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(registry.home, { recursive: true, force: true });
    }
  });
});

test('repository identities bind responses and partition single-flight within the shared worker budget', async () => {
  const root = mkdtempSync(join(tmpdir(), 'operator-repository-query-'));
  const calls: string[] = [];
  const resolvers: Array<(value: OperatorRepositorySnapshotV1) => void> = [];
  const server = await startOperatorServer({ port: 0, static_root: root, max_concurrency: 1,
    read_repository_snapshot: input => { calls.push(input.repository_id); return new Promise(resolve => resolvers.push(resolve)); },
  });
  const url = server.url + '/api/v1/repositories/repo-a/snapshot';
  const secondUrl = server.url + '/api/v1/repositories/repo-b/snapshot';
  try {
    for (const query of ['?cursor=', '?cursor=../secret', '?path=private', '?cursor=a&cursor=a']) {
      expect((await fetch(url + query)).status).toBe(400);
    }
    expect(calls).toEqual([]);
    const first = fetch(url);
    await waitFor(() => calls.length === 1, 'first repository not started');
    const second = fetch(secondUrl);
    const samePage = fetch(secondUrl);
    await Bun.sleep(30);
    expect(calls).toEqual(['repo-a']);
    resolvers[0]!(unavailableRepository('repo-a'));
    expect((await first).status).toBe(200);
    await waitFor(() => calls.length === 2, 'next repository not started');
    expect(calls).toEqual(['repo-a', 'repo-b']);
    resolvers[1]!(unavailableRepository('repo-b'));
    expect((await second).status).toBe(200); expect((await samePage).status).toBe(200);
    expect(calls.length).toBe(2);
    const mismatch = fetch(secondUrl);
    await waitFor(() => calls.length === 3, 'mismatch probe not started');
    resolvers[2]!(unavailableRepository('repo-a'));
    const refused = await mismatch;
    expect(refused.status).toBe(500);
    expect(await refused.json()).toMatchObject({ error: { code: 'repository_mismatch' } });
  } finally { await server.close(); rmSync(root, { recursive: true, force: true }); }
});

test('history context inherits pre-reader guards and holds shared capacity until retirement',async()=>{
  let started!:()=>void,retire!:()=>void;const entered=new Promise<void>(resolve=>{started=resolve;});let signal:AbortSignal|undefined,calls=0;
  const server=await startOperatorServer({port:0,max_concurrency:1,timeout_ms:1000,
    read_task_history:input=>{calls++;signal=input.signal;started();return new Promise((_,reject)=>{retire=()=>reject(new Error('retired'));});},
  });
  const path='/api/v1/fleet/tasks/repo-a/'+ 'a'.repeat(64)+'/context?view=history';
  try {
    expect((await fetch(server.url+path,{headers:{Host:'foreign.invalid'}})).status).toBe(421);
    expect((await fetch(server.url+path+'&path=/private')).status).toBe(400);expect(calls).toBe(0);
    const pending=fetch(server.url+path);await entered;
    expect(await(await fetch(server.url+path+'&task_revision='+TASK_REVISION)).json()).toEqual({code:'busy'});
    expect(await(await pending).json()).toEqual({code:'timeout'});expect(signal?.aborted).toBe(true);
    expect(await(await fetch(server.url+path)).json()).toEqual({code:'busy'});expect(calls).toBe(1);
    retire();await new Promise(resolve=>setTimeout(resolve,0));
  } finally {retire?.();await server.close();}
});

// Phase B uses the real Phase A fixture and the production worker/supervisor.

function architectureFiles(root: string, path = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of readdirSync(join(root, path))) {
    const file = path ? `${path}/${name}` : name;
    const stat = lstatSync(join(root, file));
    result[file] = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : createHash('sha256').update(readFileSync(join(root, file))).digest('hex');
    if (stat.isDirectory()) Object.assign(result, architectureFiles(root, file));
  }
  return result;
}
// macOS FSEvents can deliver a write seconds late, to a watch that started
// after the write. Each event keeps the path of its write. Move a tree after
// its setup writes, so a watch on the new path gets only the later writes.
function watchedPath(path: string): string {
  const moved = `${path}-watched`;
  renameSync(path, moved);
  return moved;
}
function architectureGit(scratch: string, slow = false) {
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  const log = join(scratch, 'git.jsonl');
  const wrapper = `#!${process.execPath}\nimport {execFileSync} from 'node:child_process';\nimport {appendFileSync,readFileSync,writeFileSync} from 'node:fs';\nconst args=process.argv.slice(2);\nappendFileSync(${JSON.stringify(log)},JSON.stringify({args,gitEnv:[process.env.GIT_LITERAL_PATHSPECS,process.env.GIT_NO_LAZY_FETCH]})+'\\n');\n${slow ? "writeFileSync(" + JSON.stringify(join(scratch, 'entered')) + ",'entered'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);" : ''}\ntry {const out=execFileSync(${JSON.stringify(realGit)},args,{input:readFileSync(0)});appendFileSync(${JSON.stringify(log)},JSON.stringify({args,out:out.toString()})+'\\n');process.stdout.write(out);}catch{process.exit(1);}\n`;
  writeFileSync(join(scratch, 'git'), wrapper); chmodSync(join(scratch, 'git'), 0o755);
  return { log, env: { PATH: scratch + ':' + process.env.PATH } };
}
function architectureArgv(log: string) {
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { args: string[]; out?: string; gitEnv?: Array<string | null> }) : [];
}
function assertArchitectureArgv(records: ReturnType<typeof architectureArgv>): void {
  expect(records.length).toBeGreaterThan(0);
  const resolved = new Set<string>();
  for (const { args, out, gitEnv } of records) {
    if (args[0] === '--no-pager') {
      expect(isNativeExportGitRead(args)).toBe(true);
      if (out === undefined) expect(gitEnv).toEqual([null, '1']);
      if (out && args[4] === 'rev-parse' && args[5] === '--verify') {
        expect(out.trim()).toMatch(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/); resolved.add(out.trim());
      }
      if (args[4] === 'ls-tree') expect(resolved.has(args[8])).toBe(true);
      continue;
    }
    if (out === undefined) expect(gitEnv).toEqual(['1', '1']);
    expect(args.slice(0, 5)).toEqual(['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'diff.submodule=short']);
    const tail = args.slice(5);
    const safePath = (path: string) => path === '' || (!path.startsWith('/') && !path.includes('\\') && path.split('/').every(part => part !== '' && part !== '..' && part !== '.'));
    if (tail[0] === 'rev-parse') {
      if (tail[1] === '--show-toplevel') expect(tail).toEqual(['rev-parse', '--show-toplevel']);
      else {
        expect(tail.slice(0, 4)).toEqual(['rev-parse', '--verify', '--quiet', '--end-of-options']);
        expect(tail).toHaveLength(5);
        expect(tail[4]).toMatch(/^(?:HEAD|[0-9a-f]{40}|[0-9a-f]{64})\^\{commit\}$/);
        if (out) { expect(out.trim()).toMatch(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/); resolved.add(out.trim()); }
      }
    } else if (tail[0] === 'ls-tree') {
      expect(tail.slice(0, 5)).toEqual(['ls-tree', '-r', '-t', '-z', '--full-tree']); expect(tail).toHaveLength(6);
      expect(resolved.has(tail[5])).toBe(true);
    } else if (tail[0] === 'cat-file') {
      // Object ids arrive on stdin from the ls-tree output of a resolved commit.
      expect(tail).toEqual(['cat-file', '--batch']);
    } else if (tail[0] === 'status') {
      expect(tail.slice(0, 6)).toEqual(['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=dirty', '--']);
      expect(tail.slice(6).every(safePath)).toBe(true);
    } else {
      expect(tail.slice(0, 3)).toEqual(['diff', '--no-ext-diff', '--no-textconv']);
      if (tail[3] === '--no-renames') {
        expect(tail.slice(4, 6)).toEqual(['--name-only', '-z']); expect(tail).toHaveLength(8);
        expect(resolved.has(tail[6])).toBe(true); expect(resolved.has(tail[7])).toBe(true);
        continue;
      }
      expect(resolved.has(tail[3])).toBe(true); expect(resolved.has(tail[4])).toBe(true);
      expect(tail[5]).toBe('--'); expect(tail.slice(6).every(safePath)).toBe(true);
    }
  }
}

test('architecture GET and HEAD match CLI digests and keep closed argv with zero file changes', async () => {
  const fixture = realpathSync(moduleRepository());
  const scratch = mkdtempSync('/tmp/oui-b-argv-');
  const base = fixtureGit(fixture, ['rev-parse', 'HEAD']);
  fixtureWrite(fixture, 'src/module/read.ts', 'export const read = () => 2;\n'); const head = fixtureCommit(fixture);
  const root = watchedPath(fixture);
  const registered = registryHome([{ path: root, accessMode: 'read_only' }]);
  const registry = { ids: registered.ids, home: watchedPath(registered.home) };
  const git = architectureGit(scratch);
  const env = { ...process.env, REPO_HARNESS_HOME: registry.home, ...git.env };
  const before = architectureFiles(root), registryBefore = architectureFiles(registry.home);
  const changes: string[] = [];
  const watchers = [root, registry.home].map(path => watch(path, { recursive: true }, (kind, file) => changes.push(`${kind}:${file}`)));
  const spawned: string[][] = [];
  const originalSpawn = childProcess.spawn;
  const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(((command: string, args: string[], options: unknown) => {
    spawned.push([command, ...args]); return originalSpawn(command, args, options as never);
  }) as typeof childProcess.spawn);
  const server = await startOperatorServer({ port: 0, env, timeout_ms: 10000 });
  const path = `/api/v1/repositories/${registry.ids[0]}/architecture/modules`;
  try {
    const cli = new URL('../../src/cli/index.ts', import.meta.url).pathname;
    const list = spawnSync(process.execPath, [cli, 'module', 'list', '--json'], { cwd: root, env, encoding: 'utf8' });
    expect(list.status).toBe(0);
    for (const method of ['GET', 'HEAD']) {
      for (const suffix of ['', `/${MODULE_ID}`, `/${MODULE_ID}/review-prompt?shard=1`, `/${MODULE_ID}/review-prompt?shard=1&mode=diff&base=${base}&head=${head}`]) {
        // A request has its own resolution authority. Do not let earlier calls authorize operands.
        writeFileSync(git.log, '');
        const response = await fetch(server.url + path + suffix, { method });
        expect(response.status).toBe(200);
        expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);
        const body = await response.text();
        if (method === 'HEAD') expect(body).toBe('');
        else {
          expect(response.headers.get('etag')).toBe('"' + createHash('sha256').update(body).digest('hex') + '"');
          if (!suffix) expect(JSON.parse(body)).toEqual(JSON.parse(list.stdout));
          if (suffix.includes('review-prompt')) {
            const args = ['module', 'review-prompt', MODULE_ID, '--json', '--shard', '1', ...(suffix.includes('mode=diff') ? ['--base', base, '--head', head] : [])];
            const packet = spawnSync(process.execPath, [cli, ...args], { cwd: root, env, encoding: 'utf8' });
            expect(packet.status).toBe(0); expect(JSON.parse(body).digest).toBe(JSON.parse(packet.stdout).digest);
          }
        }
        assertArchitectureArgv(architectureArgv(git.log));
        const unchanged = await fetch(server.url + path + suffix, { method, headers: { 'If-None-Match': response.headers.get('etag')! } });
        expect(unchanged.status).toBe(304); expect(await unchanged.text()).toBe('');
      }
    }
    expect(spawned.length).toBeGreaterThan(0);
    expect(spawned.every(args => args.length === 2 && args[0] === process.execPath && args[1].endsWith('/operator/task-read-process.ts'))).toBe(true);
    expect(architectureFiles(root)).toEqual(before); expect(architectureFiles(registry.home)).toEqual(registryBefore);
    expect(changes).toEqual([]);
  } finally {
    await server.close(); spawnSpy.mockRestore(); watchers.forEach(watcher => watcher.close());
    for (const path of [root, scratch, registry.home]) rmSync(path, { recursive: true, force: true });
  }
  // This scenario makes 16 HTTP reads and three CLI calls. Each HTTP read
  // still has its own 10-second production deadline. Allow the complete chain
  // to finish on a busy host without changing any result or latency assertion.
}, 120_000);

test('architecture rejects F-01 query injections before any child and refuses cross-site API calls', async () => {
  const root = realpathSync(moduleRepository()), scratch = mkdtempSync('/tmp/oui-b-reject-');
  const registry = registryHome([{ path: root, accessMode: 'read_only' }]), git = architectureGit(scratch);
  writeFileSync(join(scratch, 'index.html'), '<!doctype html><title>Static fixture</title>');
  const processSpy = spyOn(childProcess, 'spawn');
  const server = await startOperatorServer({ port: 0, static_root: scratch, env: { ...process.env, ...registry.env, ...git.env } });
  const path = `/api/v1/repositories/${registry.ids[0]}/architecture/modules/${MODULE_ID}/review-prompt`;
  try {
    for (const method of ['GET', 'HEAD']) {
      for (const query of ['', 'shard=0', 'shard=10000', 'shard=01', 'shard=1&shard=2', 'shard=1&path=/private', 'shard=1&mode=other', 'shard=1&base=' + 'a'.repeat(40),
        ...['HEAD', 'abc123', '-x', '--output=' + join(root, 'output'), 'A'.repeat(40)].map(value => `shard=1&mode=diff&base=${encodeURIComponent(value)}&head=${'a'.repeat(40)}`),
        `shard=1&mode=diff&base=${'a'.repeat(40)}`, `shard=1&mode=diff&head=${'a'.repeat(40)}`]) {
        expect((await fetch(server.url + path + '?' + query, { method })).status).toBe(400);
      }
      for (const site of ['cross-site', 'same-site', 'foreign']) expect((await fetch(server.url + path + '?shard=1', { method, headers: { 'Sec-Fetch-Site': site } })).status).toBe(403);
      expect((await fetch(server.url + '/api/v1/fleet/snapshot', { method, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
    }
    expect(architectureArgv(git.log)).toEqual([]); expect(processSpy.mock.calls).toHaveLength(0);
    expect(existsSync(join(root, 'output'))).toBe(false);
    expect((await fetch(server.url + '/', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(200);
    expect((await fetch(server.url + path + '?shard=1', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
    for (const site of ['none', 'same-origin']) expect((await fetch(server.url + path + '?shard=1', { headers: { 'Sec-Fetch-Site': site } })).status).toBe(200);
    expect((await fetch(server.url + '/healthz', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(200);
    const missing = await fetch(server.url + path + `?shard=1&mode=diff&base=${'0'.repeat(40)}&head=${'0'.repeat(40)}`);
    expect(missing.status).toBe(404); expect(await missing.json()).toEqual({ code: 'commit_not_found' });
    expect((await fetch(server.url + path.replace(MODULE_ID, 'capability.test.missing') + '?shard=1')).status).toBe(404);
    expect((await fetch(server.url + path.replace(registry.ids[0], 'repo_unknown') + '?shard=1')).status).toBe(404);
    expect((await fetch(server.url + path.replace(MODULE_ID, 'bad-cap') + '?shard=1')).status).toBe(404);
    expect((await fetch(server.url + path + '?shard=9999')).status).toBe(400);
  } finally { await server.close(); processSpy.mockRestore(); for (const path of [root, scratch, registry.home]) rmSync(path, { recursive: true, force: true }); }
});

test('architecture slow git leaves health responsive and returns a bounded timeout', async () => {
  const root = realpathSync(moduleRepository()), scratch = mkdtempSync('/tmp/oui-b-slow-');
  const registry = registryHome([{ path: root, accessMode: 'read_only' }]), git = architectureGit(scratch, true);
  const server = await startOperatorServer({ port: 0, timeout_ms: 3000, max_concurrency: 1, env: { ...process.env, ...registry.env, ...git.env } });
  const path = `/api/v1/repositories/${registry.ids[0]}/architecture/modules`;
  try {
    // Allow the real worker to start before its intentional Git stall.
    // Keep the health-response limit at one second.
    const pending = fetch(server.url + path);
    await waitFor(() => existsSync(join(scratch, 'entered')), 'slow Git did not start', 300);
    const start = performance.now();
    expect((await fetch(server.url + '/healthz')).status).toBe(200); expect(performance.now() - start).toBeLessThan(1000);
    const busy = await fetch(server.url + path); expect(busy.status).toBe(503); expect(await busy.json()).toEqual({ code: 'busy' });
    const timedOut = await pending; expect(timedOut.status).toBe(504); expect(await timedOut.json()).toEqual({ code: 'timeout' });
  } finally { await server.close(); for (const path of [root, scratch, registry.home]) rmSync(path, { recursive: true, force: true }); }
});

test('architecture public outputs hide secrets and path escape never reads an outside file', async () => {
  const secrets = ['sk-' + 'a'.repeat(32), 'https://hooks.slack.com/services/TFAKE/BFAKE/secret', 'https://user:pass@host.invalid/db', 'https://host.invalid/endpoint?token=fake', '/Users/fake/private-file'];
  const root = realpathSync(moduleRepository({ section3: secrets.join('\n') })), registry = registryHome([{ path: root, accessMode: 'read_only' }]);
  const node = Bun.YAML.parse(readFileSync(join(root, MODULE_NODE), 'utf8')) as Record<string, unknown>;
  node.name = secrets[0]; node.summary = secrets.join(' '); fixtureWrite(root, MODULE_NODE, fixtureYaml(node)); fixtureCommit(root);
  const server = await startOperatorServer({ port: 0, env: { ...process.env, ...registry.env } });
  const path = `/api/v1/repositories/${registry.ids[0]}/architecture/modules`;
  try {
    for (const suffix of ['', `/${MODULE_ID}`, `/${MODULE_ID}/review-prompt?shard=1`]) {
      const response = await fetch(server.url + path + suffix);
      expect(response.status).toBe(suffix.includes('review-prompt') ? 422 : 200);
      const text = await response.text(); secrets.forEach(secret => expect(text).not.toContain(secret)); expect(text).not.toContain(root);
      if (suffix.includes('review-prompt')) expect(JSON.parse(text)).toEqual({ code: 'secret_detected' });
    }
    const outside = mkdtempSync('/tmp/oui-b-outside-'); writeFileSync(join(outside, 'private.md'), 'OUTSIDE PRIVATE CONTENT');
    const original = fs.readFileSync, reads: string[] = [];
    const spy = spyOn(fs, 'readFileSync').mockImplementation(((path: unknown, ...args: unknown[]) => { reads.push(String(path)); return original(path as never, ...args as [never]); }) as typeof fs.readFileSync);
    try {
      // The committed path is regular. Its worktree replacement must still be refused.
      rmSync(join(root, MODULE_DOC)); symlinkSync(join(outside, 'private.md'), join(root, MODULE_DOC));
      expect(() => readArchitecture({ kind: 'architecture_module', repository_id: registry.ids[0], capability_id: MODULE_ID }, registry.env)).toThrow('path_escape');
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.some(path => path.startsWith(outside))).toBe(false);
      const escaped = await fetch(server.url + path + `/${MODULE_ID}`); expect(escaped.status).toBe(422); expect(await escaped.json()).toEqual({ code: 'path_escape' });
    } finally { spy.mockRestore(); rmSync(outside, { recursive: true, force: true }); }
  } finally { await server.close(); for (const path of [root, registry.home]) rmSync(path, { recursive: true, force: true }); }
});

test('architecture prompt keeps public absolute-path examples in CLI digest parity', async () => {
  const root = realpathSync(moduleRepository({ section3: 'The test uses /tmp/x and https://example.invalid/?page=1.' }));
  const registry = registryHome([{ path: root, accessMode: 'read_only' }]);
  const env = { ...process.env, ...registry.env };
  const server = await startOperatorServer({ port: 0, env });
  try {
    const cli = new URL('../../src/cli/index.ts', import.meta.url).pathname;
    const expected = spawnSync(process.execPath, [cli, 'module', 'review-prompt', MODULE_ID, '--json'], { cwd: root, env, encoding: 'utf8' });
    expect(expected.status).toBe(0);
    const response = await fetch(`${server.url}/api/v1/repositories/${registry.ids[0]}/architecture/modules/${MODULE_ID}/review-prompt?shard=1`);
    expect(response.status).toBe(200); expect((await response.json()).digest).toBe(JSON.parse(expected.stdout).digest);
  } finally { await server.close(); for (const path of [root, registry.home]) rmSync(path, { recursive: true, force: true }); }
});

test('operator serve admits explicit native capture snapshots without Herdr or pipeline setup', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rh-operator-native-cli-'));
  // The server's own HOME: its background collectors (setup, Bot access, CLI inventory) and their
  // child tools write caches there, so `root` holds only the two inputs and any write a GET makes.
  const home = mkdtempSync(join(tmpdir(), 'rh-operator-native-home-'));
  const configPath = join(root, 'runtime.json'), sourcePath = join(root, 'capture.json');
  const heartbeat = new Date().toISOString();
  writeFileSync(sourcePath, JSON.stringify({ protocol: 'repo-harness.runtime-capture.v1', source_id: 'cli-source',
    generation: '123e4567-e89b-42d3-a456-426614174000', sequence: 1, provider: 'pi', format: 'osc7501',
    capture_status: 'connected', heartbeat_at: heartbeat, observations: [{ scope: 'terminal', session_id: null, turn_id: null,
      state: 'idle', reason: 'unknown', event_received_at: heartbeat, changed_at: null }] }));
  writeFileSync(configPath, JSON.stringify({ protocol: 'repo-harness.runtime-config.v2', kind: 'native',
    sources: [{ source_id: 'cli-source', provider: 'pi', snapshot_path: sourcePath }] }));
  const sourceBefore = readFileSync(sourcePath), configBefore = readFileSync(configPath);
  const cli = new URL('../../src/cli/index.ts', import.meta.url).pathname;
  const child = spawn(process.execPath, [cli, 'operator', 'serve', '--port', '0', '--runtime-status-config', configPath], {
    cwd: home, env: { ...process.env, HOME: home, TMPDIR: home, REPO_HARNESS_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes.toString(); }); child.stderr.on('data', bytes => { stderr += bytes.toString(); });
  const exited = new Promise<number | null>(resolve => child.once('exit', code => resolve(code)));
  try {
    await waitFor(() => /http:\/\/127\.0\.0\.1:\d+\n/.test(stdout) || child.exitCode !== null, 'native CLI readiness', 500);
    expect(stderr).toBe(''); expect(child.exitCode).toBeNull();
    const filesBeforeGet = readdirSync(root).sort();
    const url = stdout.trim();
    const response = await fetch(`${url}/api/v1/runtime/status`); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ projection_version: 'repo-harness.runtime-overlay.v4', status: 'ready',
      badges: [], pane_observations: [], native_sources: [{ source_id: 'cli-source', provider: 'pi', freshness: 'fresh',
        observations: [{ scope: 'terminal', state: 'idle', event_received_at: heartbeat }] }] });
    expect(readFileSync(sourcePath)).toEqual(sourceBefore); expect(readFileSync(configPath)).toEqual(configBefore);
    expect(readdirSync(root).sort()).toEqual(filesBeforeGet);
    child.kill('SIGTERM'); expect(await exited).toBe(0);
  } finally { if (child.exitCode === null) { child.kill('SIGTERM'); await exited; } for (const path of [root, home]) rmSync(path, { recursive: true, force: true }); }
});

test('session discovery is bounded read-only transport with a closed repository selector', async () => {
  const value = { protocol: 1 as const, kind: 'operator_task_sessions' as const, repository_id: 'repo-a',
    observed_at: '2026-10-25T00:00:00Z', sessions: [] };
  let calls = 0;
  const server = await startOperatorServer({ port: 0, read_task_sessions: async () => { calls++; return value; } });
  try {
    const path = server.url + '/api/v1/fleet/task-sessions/repo-a';
    const response = await fetch(path); expect(response.status).toBe(200); expect(await response.json()).toEqual(value);
    expect((await fetch(path + '?root=/tmp')).status).toBe(400);
    expect((await fetch(path, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
    expect((await fetch(path, { headers: { Origin: 'https://example.com' } })).status).toBe(403);
    expect(calls).toBe(1);
  } finally { await server.close(); }
});

describe('architecture map', () => {
  const noCodeFacts = { state: 'unavailable', reason: 'code_facts_unavailable' } as const;
  const map: ArchitectureMapV1 = projectArchitectureMap({
    repository_id: 'repo-a', commit: 'c'.repeat(40), collected_at: '2026-10-27T09:00:00.000Z',
    nodes: [{ id: 'capability.pipeline.ledger', kind: 'capability', name: 'Ledger', status: 'active', layer: 'core', parent: null, summary: 'Ledger.' }],
    relations: [], sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'code_facts_unavailable' },
    layers: {
      changes: { state: 'unavailable', reason: 'model_worktree_dirty' },
      pull_requests: { state: 'unavailable', reason: 'dev_activity_pending' },
      violations: { debt: noCodeFacts, anchors: noCodeFacts, dependencies: noCodeFacts },
      tests: { state: 'unavailable', reason: 'tests_pending' },
    },
  });

  test('the route reads only the injected cache and maps each unavailable state to its code', async () => {
    let cache: ArchitectureMapRepositoryCache = { state: 'unavailable', reason: 'architecture_map_pending' };
    const server = await startOperatorServer({ port: 0, read_architecture_map: () => cache });
    const path = `${server.url}/api/v1/repositories/repo-a/architecture/map`;
    const get = async (url = path) => { const response = await fetch(url); return { status: response.status, body: await response.json() as unknown }; };
    try {
      for (const [next, status, code] of [
        [{ state: 'unavailable', reason: 'architecture_map_pending' }, 503, 'architecture_map_pending'],
        [{ state: 'unavailable', reason: 'registry_unavailable' }, 503, 'registry_unavailable'],
        [{ state: 'unavailable', reason: 'repository_not_found' }, 404, 'repository_not_found'],
        [{ state: 'unavailable', reason: 'model_unavailable' }, 503, 'model_unavailable'],
        // A cached map that fails the decoder is refused, not sent.
        [{ state: 'ready', map: { ...map, nodes: [{ ...map.nodes[0]!, summary: 1 }] } }, 503, 'architecture_map_invalid'],
      ] as const) {
        cache = next as ArchitectureMapRepositoryCache;
        const answer = await get();
        expect(answer.status).toBe(status);
        expect((answer.body as { error?: { code: string } }).error?.code).toBe(code);
      }
      cache = { state: 'ready', map };
      expect(await get()).toEqual({ status: 200, body: map });
      expect((await fetch(`${path}?commit=HEAD`)).status).toBe(400);
      expect((await fetch(path, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
      expect((await fetch(path, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
    } finally { await server.close(); }
  });

  test('the collector is pending, then serves the child map; a failed or foreign child result is unavailable', async () => {
    const root = realpathSync(moduleRepository());
    const registry = registryHome([{ path: root, accessMode: 'read_only' }]);
    const id = registry.ids[0]!;
    const collector = startArchitectureMapCollector({ env: registry.env, interval_ms: 60_000 });
    try {
      expect(collector.read(id)).toEqual({ state: 'unavailable', reason: 'architecture_map_pending' });
      await collector.settled();
      const ready = collector.read(id);
      expect(ready.state === 'ready' && ready.map.nodes.map(entry => entry.id)).toEqual([MODULE_ID, 'component.module.core']);
      // The child has no tests cache; without a reader the tests layer stays pending.
      expect(ready.state === 'ready' && ready.map.layers.tests).toEqual({ state: 'unavailable', reason: 'tests_pending' });
      expect(collector.read('repo-unregistered')).toEqual({ state: 'unavailable', reason: 'repository_not_found' });
    } finally { await collector.close(); }
    for (const [run_process, reason] of [
      [async () => ({ ok: false, code: 'failed' }), 'model_unavailable'],
      [async () => ({ ok: true, stdout: JSON.stringify({ id: 'repo-other', ok: true, snapshot: map }) }), 'architecture_map_invalid'],
      [async () => { throw new Error('spawn failed'); }, 'model_unavailable'],
    ] as const) {
      const failing = startArchitectureMapCollector({ env: registry.env, interval_ms: 60_000, run_process: run_process as never });
      try {
        await failing.settled();
        expect(failing.read(id)).toEqual({ state: 'unavailable', reason });
      } finally { await failing.close(); }
    }
    // The tests layer comes from the tests collector's cache when the child's map arrives.
    const child = async () => ({ ok: true, stdout: JSON.stringify({ id, ok: true, snapshot: { ...map, repository_id: id } }) });
    const withTests = startArchitectureMapCollector({ env: registry.env, interval_ms: 60_000, run_process: child as never, read_tests: () => ({ state: 'unavailable', reason: 'no_daily_run' }) });
    try {
      await withTests.settled();
      const read = withTests.read(id);
      expect(read.state === 'ready' && read.map.layers.tests).toEqual({ state: 'unavailable', reason: 'no_daily_run' });
    } finally { await withTests.close(); }
    // The open PRs reach the child in a private file that exists only while the child runs.
    const source: ArchitecturePullRequestsSource = { state: 'ok', observed_at: '2026-10-27T08:59:00.000Z', pull_requests: [
      { number: 5, title: 'Read more', url: 'https://github.com/acme/widgets/pull/5', head_sha: 'a'.repeat(40), changed_files: { state: 'ok', paths: ['src/a.ts'] } }] };
    const handed: { file: string; text: string; mode: number }[] = [];
    const reading = async (argv: readonly string[]) => {
      handed.push({ file: argv[2]!, text: readFileSync(argv[2]!, 'utf8'), mode: lstatSync(argv[2]!).mode & 0o777 });
      return child();
    };
    const pending: ArchitecturePullRequestsSource = { state: 'unavailable', reason: 'dev_activity_pending' };
    for (const [read_pull_requests, expected] of [[() => source, source], [undefined, pending]] as const) {
      const withPrs = startArchitectureMapCollector({ env: registry.env, interval_ms: 60_000, run_process: reading as never, read_pull_requests });
      try { await withPrs.settled(); } finally { await withPrs.close(); }
      const last = handed.at(-1)!;
      expect([JSON.parse(last.text), last.mode, existsSync(last.file)]).toEqual([expected, 0o600, false]);
    }
    // operator serve starts the first map cycle after Dev Activity's first cycle, so it reads that cycle's PRs.
    let release!: () => void;
    const devActivityFirstCycle = new Promise<void>(resolve => { release = resolve; });
    let collected = false;
    const ordered = startArchitectureMapCollector({ env: registry.env, interval_ms: 60_000, run_process: reading as never,
      read_pull_requests: () => (collected ? source : pending), first_cycle_after: devActivityFirstCycle });
    try {
      const before = handed.length;
      await Bun.sleep(20);
      expect([handed.length, ordered.read(id)]).toEqual([before, { state: 'unavailable', reason: 'architecture_map_pending' }]);
      collected = true;
      release();
      await ordered.settled();
      expect([handed.length - before, JSON.parse(handed.at(-1)!.text)]).toEqual([1, source]);
      expect(ordered.read(id).state).toBe('ready');
    } finally { await ordered.close(); }
    writeFileSync(join(registry.home, 'registered-repos.json'), '{"version":1}');
    const broken = startArchitectureMapCollector({ env: registry.env, interval_ms: 60_000, run_process: async () => { throw new Error('not reached'); } });
    try {
      await broken.settled();
      expect(broken.read(id)).toEqual({ state: 'unavailable', reason: 'registry_unavailable' });
    } finally {
      await broken.close();
      rmSync(root, { recursive: true, force: true });
      rmSync(registry.home, { recursive: true, force: true });
    }
  });
});
