import { pluginSelectionEnv, recordPluginSelection } from '../helpers/install-ownership';
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync, readdirSync, readFileSync, statSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { taskReviewRunner } from '../../src/effects/review-runner/task-review-runner';
import type { PluginId } from '../../src/core/skill-surface/plugin-manifest';
import { MODULE_ID, MODULE_DOC, MODULE_NODE, moduleRepository, fixtureYaml, fixtureWrite, fixtureCommit, fixtureGit, isNativeExportGitRead } from '../helpers/module-repository';
import { createHash } from 'node:crypto';
import { chmodSync, watch, lstatSync, renameSync } from 'node:fs';
import { spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { readArchitecture, readHistory } from '../../src/effects/operator/architecture';
import type { ArchctxProcessResult } from '../../src/core/architecture/contracts';
import { resolveCompatibleNodeRuntime } from '../../src/effects/architecture/archctx-provider';
import { ARCHITECTURE_FAILURES } from '../../src/core/operator/architecture';
import { unavailableDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { unavailableWorktrees, type WorktreesSnapshot } from '../../src/core/public-projections/worktrees';
import type { DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';
import { unavailableSetupSnapshot } from '../../src/core/setup/decode';
import { projectSetupSnapshot } from '../../src/core/setup/projection';
import type { SetupSnapshotV2 } from '../../src/core/setup/types';
import { ROUTES } from '../../src/cli/hook/route-registry';
import type { BotAccessSnapshotV1 } from '../../src/core/operator/bot-access';
import type { BotAccessCacheV1 } from '../../src/effects/operator/bot-access';
import { CLI_INVENTORY_PROJECTION, unavailableCliInventory, type CliInventorySnapshotV1 } from '../../src/core/setup/cli-inventory';
import { DocsReader } from '../../src/effects/operator/docs-reader';
import type { DocsRepositoryCache } from '../../src/effects/operator/docs-collector';
import type { DocsTreeV1 } from '../../src/core/operator/docs';
import type { TestsSnapshotV1 } from '../../src/core/operator/tests';
import type { TestsRepositoryCache } from '../../src/effects/operator/tests-collector';
import { decodeBoard } from '../../src/core/board/board';
import { BoardReadError, readRepositoryAdvisorTranscript, readRepositoryBoard, readRepositoryBoardParents, sendRepositoryAdvisor, type BoardParentsReadInput, type BoardReadInput } from '../../src/effects/operator/board-read';
import board1474 from '../../src/operator-web/fixtures/board-1474.json';
import boardParents from '../../src/operator-web/fixtures/board-parents.json';
import { decodeBoardParents } from '../../src/core/board/parents';
import { boardSummary, decodeBoardSummaries } from '../../src/core/board/summary';

import {
  architectureStatus,
  startOperatorServer,
} from '../../src/effects/operator/server';
import { buildOperatorCommand } from '../../src/cli/commands/operator';
import { parseOperatorServeOptions } from '../../src/cli/commands/operator-actions';
import { decodeArchitectureMapRefusal, projectArchitectureMap, type ArchitectureMapV1, type ArchitecturePullRequestsSource } from '../../src/core/operator/architecture-map';
import { startArchitectureMapCollector, type ArchitectureMapRepositoryCache } from '../../src/effects/operator/architecture-map-collector';
import { worktreeDigestRow } from '../../src/core/operator/worktree-cleanup';
import { worktreeId } from '../../src/effects/git/worktree-record';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { registeredWorktreePaths, repositoryWorktreeRow } from '../../src/effects/operator/worktree-collector-worker';
import { entries as worktreeEntries } from '../../src/effects/state/coordination-worktree-topology';
import { decodeWorktreeCleanupRequest } from '../../src/core/operator/worktree-cleanup';
import { OPERATOR_WORKTREES_CLEANUP_ROUTE, runWorktreeCleanupChild, selectionDigest, worktreeCleanupOperation } from '../../src/effects/operator/worktree-cleanup';
import { runSetupProcess } from '../../src/effects/setup/collector';
import type { OperatorWriteRoute } from '../../src/effects/operator/write-channel';
import { OPERATOR_RECONCILE_ACTION, operatorWriteBinding, runOperatorWrite } from '../../src/effects/operator/write-run';
import { advisorBossCommandWriteRoute } from '../../src/effects/operator/advisor-seat-route';
import { controlledWorktreeProcessPreload } from '../helpers/controlled-worktree-processes';
import { fakeHc } from '../helpers/fake-hc';
import { collectRepositoryWorktrees } from '../../src/effects/operator/worktree-collector-worker';

const TASK_ID = 'a'.repeat(64);
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
    expect(buildOperatorCommand(taskReviewRunner).name()).toBe('operator');
  });

  test('the operator selection gates operator, worktrees and catch-up and the Operator code load', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-operator-gate-')));
    const homes: string[] = [root];
    try {
      const probe = join(root, 'load-probe.ts');
      writeFileSync(probe, `process.on('exit', () => process.stderr.write(\`operator-modules:\${Object.keys(require.cache).filter(path => /[\\\\/]src[\\\\/](?:effects[\\\\/](?:operator|setup|dev-activity)[\\\\/]|core[\\\\/](?:operator|setup|dev-activity)[\\\\/]|effects[\\\\/]configuration[\\\\/]agents-configuration\\.ts|effects[\\\\/]review[\\\\/]docs-host-isolation\\.ts|cli[\\\\/]commands[\\\\/](?:(?:operator|worktrees|catch-up|doc-sessions)-actions|architecture-thread|setup-[a-z-]+)\\.ts)/.test(path)).length}\n\`));\n`);
      const cli = new URL('../../src/cli/index.ts', import.meta.url).pathname;
      const selected = (plugins: readonly PluginId[]) => { const env = pluginSelectionEnv(plugins); homes.push(env.HOME!); return env; };
      const call = (env: NodeJS.ProcessEnv, ...args: string[]) => {
        const result = spawnSync(process.execPath, ['--preload', probe, cli, ...args], { cwd: root, encoding: 'utf8', input: '', env: { ...env, REPO_HARNESS_HOME: join(root, 'harness'), BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' } });
        const lines = result.stderr.split('\n').filter(line => line !== '' && !line.startsWith('operator-modules:'));
        return { status: result.status, stdout: result.stdout, lines, loaded: Number(/operator-modules:(\d+)/.exec(result.stderr)?.[1]) };
      };
      const noState = { ...process.env, HOME: join(root, 'no-state') };
      mkdirSync(noState.HOME, { recursive: true });
      const unreadable = { ...process.env, HOME: join(root, 'unreadable') };
      mkdirSync(join(unreadable.HOME, '.repo-harness'), { recursive: true });
      writeFileSync(join(unreadable.HOME, '.repo-harness/install-state.json'), '{');

      const blocked: [string, NodeJS.ProcessEnv, string | RegExp][] = [
        ['core only', selected([]), 'repo-harness install --plugins operator'],
        ['other plugin', selected(['product']), 'repo-harness install --plugins operator,product'],
        ['no install state', noState, 'repo-harness install'],
        ['unreadable install state', unreadable, /is not valid JSON/],
      ];
      const commands: [string, string[]][] = [
        ['operator', ['operator', 'serve', '--port', '0']],
        ['operator', ['operator', 'capture', '--provider', 'codex', '--source-id', 'gate', '--snapshot', join(root, 'capture.json'), '--', 'true']],
        ['operator', ['operator', 'cleanup-investigation-job', 'a', 'b', '1']],
        ['operator', ['operator', 'doc-sessions', 'list']],
        ['worktrees', ['worktrees', 'list']],
        ['catch-up', ['catch-up', '--json']],
      ];
      for (const [name, env, expected] of blocked) {
        for (const [command, args] of commands) {
          const result = call(env, ...args);
          const label = `${name}: ${args.join(' ')}`;
          expect(result.status, label).toBe(1);
          expect(result.stdout, label).toBe('');
          expect(result.lines.length, label).toBe(1);
          if (typeof expected === 'string') expect(result.lines[0], label).toBe(`install_plugin_unavailable: repo-harness ${command} needs the operator plugin: the operator plugin is not selected; run: ${expected}`);
          else expect(result.lines[0], label).toMatch(expected);
          expect(result.loaded, label).toBe(0);
        }
      }
      expect(existsSync(join(root, 'capture.json'))).toBe(false);

      const coreOnly = selected([]);
      for (const args of [['operator', '--help'], ['operator', 'serve', '--help'], ['worktrees', '--help'], ['catch-up', '--help'], ['status', '--json'], ['quota', '--json']]) {
        const result = call(coreOnly, ...args);
        expect(result.status, args.join(' ')).toBe(0);
        expect(result.loaded, args.join(' ')).toBe(0);
      }

      const withPlugin = selected(['operator']);
      const brief = call(withPlugin, 'catch-up', '--json');
      expect(brief.status).toBe(0);
      expect(brief.loaded).toBeGreaterThan(0);
      const status = call(withPlugin, 'status', '--json');
      expect(status.status).toBe(0);
      expect(status.loaded).toBe(0);
    } finally {
      for (const home of homes) rmSync(home, { recursive: true, force: true });
    }
  });

  test('UX-local-human-control-board-v1-P1 serves health, the registered repositories without their roots, and static fallback', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-ui-'));
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-operator-registry-roots-')));
    for (const name of ['beta', 'alpha']) mkdirSync(join(parent, name));
    const registry = registryHome([
      { path: join(parent, 'beta'), accessMode: 'read_write' },
      { path: join(parent, 'alpha'), accessMode: 'read_only' },
      { path: join(parent, 'gone'), accessMode: 'read_write' },
    ]);
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    writeFileSync(join(staticRoot, 'app.js'), 'console.log("operator");');
    const server = await startOperatorServer({ port: 0, static_root: staticRoot, env: registry.env });
    try {
      const health = await fetch(`${server.url}/healthz`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true, service: 'repo-harness-operator', protocol: 1 });

      const rejectedHost = await fetch(`${server.url}/api/v1/repositories`, {
        headers: { Host: 'attacker.example' },
      });
      expect(rejectedHost.status).toBe(421);
      expect(await rejectedHost.json()).toMatchObject({ error: { code: 'host_not_allowed' } });

      const rejectedOrigin = await fetch(`${server.url}/api/v1/repositories`, {
        headers: { Origin: 'http://attacker.example' },
      });
      expect(rejectedOrigin.status).toBe(403);
      expect(await rejectedOrigin.json()).toMatchObject({ error: { code: 'origin_not_allowed' } });

      const listed = await fetch(`${server.url}/api/v1/repositories`);
      expect(listed.status).toBe(200);
      const text = await listed.text();
      expect(JSON.parse(text)).toEqual({
        protocol: 1, kind: 'operator_repositories', stale_registrations: 1,
        repositories: [
          { repository_id: registry.ids[1], display_name: 'alpha', access_mode: 'read_only' },
          { repository_id: registry.ids[0], display_name: 'beta', access_mode: 'read_write' },
        ],
      });
      expect(text).not.toContain(parent);
      const query = await fetch(`${server.url}/api/v1/repositories?repository=${registry.ids[0]}`);
      expect(query.status).toBe(400);
      expect(await query.json()).toMatchObject({ error: { code: 'invalid_request' } });

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
      for (const path of [staticRoot, parent, registry.home]) rmSync(path, { recursive: true, force: true });
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

      const api = await fetch(`${server.url}/api/v1/dev-activity`, {
        headers: { Host: `[::1]:${server.port}`, Origin: server.url },
      });
      expect(api.status).toBe(200);
      expect(await api.json()).toMatchObject({ projection_version: 'repo-harness.dev-activity.v2' });

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

  test('UX-local-human-control-board-v1-F1 fails closed when the registry is unreadable', async () => {
    const home = mkdtempSync(join(tmpdir(), 'repo-harness-operator-registry-invalid-'));
    // A registry that is not a regular file is unreadable; the refusal names no path.
    mkdirSync(join(home, 'registered-repos.json'));
    const server = await startOperatorServer({ port: 0, env: { REPO_HARNESS_HOME: home } });
    try {
      const response = await fetch(`${server.url}/api/v1/repositories`);
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(JSON.parse(text).error).toMatchObject({ code: 'registry_unavailable', message: 'The repository registry is unreadable.' });
      expect(text).not.toContain(home);
    } finally {
      await server.close();
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('rejects every browser write method on all read routes and the retired message route', async () => {
    let reads = 0;
    const server = await startOperatorServer({
      port: 0,
      read_dev_activity: () => { reads++; return unavailableDevActivitySnapshot(); },
    });
    try {
      const paths = ['/', '/healthz', '/api/v1/repositories', '/api/v1/dev-activity', '/api/v1/setup',
        ...['context', 'activity', 'diff', 'messages'].map(route => `/api/v1/fleet/tasks/repo-a/${TASK_ID}/${route}`)];
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
      expect((await fetch(`${server.url}/api/v1/dev-activity`)).status).toBe(200);
      expect(reads).toBe(1);
    } finally { await server.close(); }
  });

  test('worktree route reads only its cache and rejects private or write payloads', async () => {
    let reads = 0;
    let current: unknown = { ...unavailableWorktrees(), status: 'ready', collected_at: '2026-10-27T00:00:00.000Z' };
    const server = await startOperatorServer({ port: 0, worktree_collector: true,
      read_worktrees: () => { reads++; return current as WorktreesSnapshot; } });
    try {
      expect(await (await fetch(`${server.url}/api/v1/worktrees`)).json()).toEqual(current);
      expect((await fetch(`${server.url}/api/v1/worktrees`, { method: 'HEAD' })).status).toBe(200);
      expect((await fetch(`${server.url}/api/v1/worktrees?path=/tmp/private`)).status).toBe(400);
      expect((await fetch(`${server.url}/api/v1/worktrees`, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
      expect(reads).toBe(2);
      current = { ...unavailableWorktrees(), path: '/tmp/private' };
      expect(await (await fetch(`${server.url}/api/v1/worktrees`)).json()).toEqual(unavailableWorktrees());
    } finally { await server.close(); }
  });

  test('serves only the Dev Activity cache on GET and starts the collector only on request', async () => {
    let reads = 0;
    const ready: DevActivitySnapshotV2 = { ...unavailableDevActivitySnapshot(), status: 'ready', collected_at: '2026-10-10T00:00:00.000Z', unreadable_registrations: 3 };
    let current: unknown = ready;
    const server = await startOperatorServer({ port: 0, read_dev_activity: () => { reads++; return current as DevActivitySnapshotV2; } });
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
    const collecting = await startOperatorServer({ port: 0, dev_activity_collector: true,
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
    const ready: SetupSnapshotV2 = projectSetupSnapshot({
      collected_at: '2026-10-10T00:00:00.000Z', setup_status: 'ok', summary: { ok: 1, warn: 0, fail: 0, na: 0, needs_agent: 0 },
      checks: [], check_commands: new Map(), adapters: [], cli_versions: {}, skill_rows: [], skill_catalog: null, home: '/nowhere', skill_roots: [], install_selection: null,
      routes: ROUTES, fleet_roles: [], fleet_hosts: null, hook_usage: null,
    });
    let current: unknown = ready;
    const spawnSpy = spyOn(childProcess, 'spawn');
    const spawnSyncSpy = spyOn(childProcess, 'spawnSync');
    const server = await startOperatorServer({ port: 0, read_setup: () => { reads++; return current as SetupSnapshotV2; } });
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
    const collecting = await startOperatorServer({ port: 0, setup_collector: true,
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
      protocol: 2, kind: 'operator_bot_access', observed_at: '2026-10-27T00:00:00.000Z',
      bots: { state: 'unavailable', reason: 'bot_registry_invalid' },
      mcp: { state: 'unavailable', reason: 'mcp_doctor_timeout' },
      registry: { state: 'unavailable', reason: 'registry_unavailable' },
      hc: { state: 'unavailable', reason: 'hc_unreachable' },
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
    const server = await startOperatorServer({ port: 0,
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
    const bare = await startOperatorServer({ port: 0 });
    try {
      expect(await (await fetch(`${bare.url}/api/v1/bot-access`)).json()).toMatchObject({ error: { code: 'bot_access_pending' } });
      expect(await (await fetch(`${bare.url}/api/v1/cli-inventory`)).json()).toEqual(unavailableCliInventory('collection_pending'));
    } finally { await bare.close(); }

    // The serve collectors take the session only from the install record: HERDR_SESSION in the server
    // environment neither fails Bot access at start nor stands in for a missing record.
    const home = mkdtempSync(join(tmpdir(), 'rh-serve-notify-session-'));
    const collecting = await startOperatorServer({ port: 0, notify_collector: true,
      env: { ...process.env, REPO_HARNESS_HOME: home, HERDR_SESSION: 'pane-session' } });
    try {
      let notify = await (await fetch(`${collecting.url}/api/v1/notify/status`)).json() as { error: { code: string; message: string; next_action: string } };
      for (let attempt = 0; attempt < 200 && notify.error.code === 'notify_status_pending'; attempt++) {
        await Bun.sleep(25);
        notify = await (await fetch(`${collecting.url}/api/v1/notify/status`)).json() as { error: { code: string; message: string; next_action: string } };
      }
      expect(notify.error).toEqual({ code: 'notify_session_missing', message: expect.any(String), next_action: 'Run `repo-harness herdr notify install`.' });
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
    const server = await startOperatorServer({ port: 0, read_tests: id => { reads++; return id === 'repo-a' ? cache : { state: 'unavailable', reason: 'repository_not_found' }; } });
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

  test('board route needs one parent, decodes the board CLI JSON once and maps each refusal', async () => {
    const board = decodeBoard(board1474);
    let result: () => Promise<unknown> = async () => board;
    const inputs: BoardReadInput[] = [];
    const server = await startOperatorServer({ port: 0, read_board: input => { inputs.push(input); return result(); } });
    const get = (path: string, init: RequestInit = {}) => fetch(`${server.url}${path}`, init);
    const code = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;
    const path = '/api/v1/repositories/repo-a/board';
    try {
      for (const query of ['', '?parent=0', '?parent=x', '?parent=1474&parent=1475', '?parent=1474&run=1']) {
        const response = await get(`${path}${query}`);
        expect([response.status, await code(response)]).toEqual([400, 'board_parent_invalid']);
      }
      expect(inputs).toHaveLength(0);
      const ready = await get(`${path}?parent=1474`);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual(board);
      expect(inputs[0]).toMatchObject({ repository_id: 'repo-a', parent: 1474, env: { GH_PROMPT_DISABLED: '1' } });
      for (const [failure, status] of [['repository_not_found', 404], ['board_collect_failed', 503], ['board_timeout', 504]] as const) {
        result = async () => { throw new BoardReadError(failure); };
        const response = await get(`${path}?parent=1474`);
        expect([response.status, await code(response)]).toEqual([status, failure]);
      }
      result = async () => ({ ...board, protocol: 4 });
      const invalid = await get(`${path}?parent=1474`);
      expect([invalid.status, await code(invalid)]).toEqual([503, 'board_invalid']);
      const head = await get(`${path}?parent=1474`, { method: 'HEAD' });
      expect([head.status, head.headers.get('allow')]).toEqual([405, 'GET']);
      expect((await get(`${path}?parent=1474`, { headers: { Host: 'foreign.invalid' } })).status).toBe(421);
      expect((await get(`${path}?parent=1474`, { headers: { Origin: 'http://foreign.invalid' } })).status).toBe(403);
      expect((await get(`${path}?parent=1474`, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
      // One read per admitted GET; HEAD, the Host and Origin refusals and POST start none.
      expect(inputs).toHaveLength(5);
    } finally {
      await server.close();
    }
  });

  test('board reads replace private summaries and the summary route reads only the listed parents', async () => {
    const home = mkdtempSync(join(tmpdir(), 'board-summaries-'));
    let board = decodeBoard(board1474), reads = 0;
    const list = decodeBoardParents(boardParents);
    const server = await startOperatorServer({ port: 0, env: { REPO_HARNESS_HOME: home },
      read_board: async () => { reads++; return board; }, read_board_parents: async () => list });
    const path = `${server.url}/api/v1/repositories/repo-a/board/summaries`;
    const target = join(home, 'board/summaries/repo-a-1474.json');
    const get = async () => {
      const response = await fetch(path);
      expect(response.status).toBe(200);
      return decodeBoardSummaries(await response.json());
    };
    try {
      expect((await get()).parents).toEqual(list.parents.map(parent => ({ parent: parent.number, status: 'not_read' })));
      expect(reads).toBe(0);
      expect((await fetch(`${server.url}/api/v1/repositories/repo-a/board?parent=1474`)).status).toBe(200);
      const first = readFileSync(target, 'utf8'), inode = statSync(target).ino, fd = openSync(target, 'r');
      try {
        if (process.platform !== 'win32') expect(statSync(target).mode & 0o777).toBe(0o600);
        expect(decodeBoardSummaries(JSON.parse(first)).parents).toEqual([{ parent: 1474, status: 'observed', observed_at: board.observed_at,
          summary: { queue: 0, ci_failures: 0, batch: { accepted: null, size: null }, current_batch: null, needs_you: 3, worker_limit: 8,
            seats: { status: 'observed', stalled: 0, desks: [
              { seat: 'worker', agent: 'codex', issue: 1476, pr: 1499, state: 'blocked' }, { seat: 'worker', agent: 'claude-code', issue: 1475, pr: 1491, state: 'done' },
            ] } } }]);
        expect((await get()).parents).toEqual([JSON.parse(first).parents[0], { parent: 1651, status: 'not_read' }]);
        board = { ...board, observed_at: new Date(Date.parse(board.observed_at) + 60_000).toISOString() };
        expect((await fetch(`${server.url}/api/v1/repositories/repo-a/board?parent=1474`)).status).toBe(200);
        expect(readFileSync(fd, 'utf8')).toBe(first);
        expect(statSync(target).ino).not.toBe(inode);
        expect((await get()).parents[0]).toMatchObject({ status: 'observed', observed_at: board.observed_at });
        board = decodeBoard(board1474);
        expect((await fetch(`${server.url}/api/v1/repositories/repo-a/board?parent=1474`)).status).toBe(200);
        expect((await get()).parents[0]).toMatchObject({ observed_at: new Date(Date.parse(board.observed_at) + 60_000).toISOString() });
      } finally { closeSync(fd); }
      expect(readdirSync(join(home, 'board/summaries'))).toEqual(['repo-a-1474.json']);
      writeFileSync(target, '{');
      expect((await get()).parents[0]).toEqual({ parent: 1474, status: 'unavailable', reason: 'snapshot_invalid' });
      // A snapshot of the old protocol is refused, not translated, and the next board read replaces it.
      writeFileSync(target, JSON.stringify({ ...JSON.parse(first), protocol: 1 }));
      expect((await get()).parents[0]).toEqual({ parent: 1474, status: 'unavailable', reason: 'snapshot_invalid' });
      expect((await fetch(`${server.url}/api/v1/repositories/repo-a/board?parent=1474`)).status).toBe(200);
      expect((await get()).parents[0]).toEqual({ parent: 1474, status: 'observed', observed_at: board.observed_at, summary: boardSummary(board) });
      writeFileSync(target, JSON.stringify({ ...JSON.parse(first), repository_id: 'repo-b' }));
      expect((await get()).parents[0]).toEqual({ parent: 1474, status: 'unavailable', reason: 'snapshot_subject_invalid' });
      rmSync(target); mkdirSync(target);
      expect((await get()).parents[0]).toMatchObject({ parent: 1474, status: 'unavailable', reason: expect.stringContaining('snapshot_read_failed:') });
      expect((await fetch(`${path}?all=1`)).status).toBe(400);
      expect((await fetch(path, { method: 'HEAD' })).status).toBe(405);
      expect((await fetch(path, { headers: { Origin: 'http://foreign.invalid' } })).status).toBe(403);
      expect((await fetch(path, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
      expect(reads).toBe(4);
    } finally { await server.close(); rmSync(home, { recursive: true, force: true }); }
  });

  test('board parents route takes no query, decodes the board parents CLI JSON once, maps each refusal and shares the board read cap', async () => {
    const list = decodeBoardParents(boardParents);
    let result: () => Promise<unknown> = async () => list;
    const inputs: BoardParentsReadInput[] = [];
    let hold: () => void = () => {};
    let started: () => void = () => {};
    const boardStarted = new Promise<void>(resolve => { started = resolve; });
    const server = await startOperatorServer({ port: 0, max_concurrency: 1, read_board_parents: input => { inputs.push(input); return result(); },
      read_board: () => new Promise(resolve => { hold = () => resolve(decodeBoard(board1474)); started(); }) });
    const get = (path: string, init: RequestInit = {}) => fetch(`${server.url}${path}`, init);
    const code = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;
    const path = '/api/v1/repositories/repo-a/board/parents';
    try {
      expect([(await get(`${path}?all=1`)).status, inputs]).toEqual([400, []]);
      const ready = await get(path);
      expect([ready.status, await ready.json()]).toEqual([200, list]);
      expect(inputs[0]).toMatchObject({ repository_id: 'repo-a', env: { GH_PROMPT_DISABLED: '1' } });
      for (const [failure, status] of [['repository_not_found', 404], ['parents_github_failed', 503], ['parents_hc_failed', 503], ['parents_timeout', 504]] as const) {
        result = async () => { throw new BoardReadError(failure); };
        const response = await get(path);
        expect([response.status, await code(response)]).toEqual([status, failure]);
      }
      // Protocol 1 is the retired parent list without the seats list (#1785).
      result = async () => ({ ...list, protocol: 1 });
      const invalid = await get(path);
      expect([invalid.status, await code(invalid)]).toEqual([503, 'parents_invalid']);
      const head = await get(path, { method: 'HEAD' });
      expect([head.status, head.headers.get('allow')]).toEqual([405, 'GET']);
      // A board read in flight holds the one slot of the shared cap.
      const board = get('/api/v1/repositories/repo-a/board?parent=1474');
      await boardStarted;
      const summariesBusy = await get('/api/v1/repositories/repo-a/board/summaries');
      expect([summariesBusy.status, await code(summariesBusy)]).toEqual([503, 'parents_busy']);
      const busy = await get(path);
      expect([busy.status, await code(busy)]).toEqual([503, 'parents_busy']);
      hold();
      expect((await board).status).toBe(200);
      expect(inputs).toHaveLength(6);
    } finally {
      await server.close();
    }
  });

  test('board reader runs the board CLI in the registered repository, without its bunfig, .env or a GH_REPO override', async () => {
    const repository = mkdtempSync(join(tmpdir(), 'repo-harness-board-'));
    const scratch = mkdtempSync(join(tmpdir(), 'repo-harness-board-gh-'));
    expect(spawnSync('git', ['init', '-q'], { cwd: repository }).status).toBe(0);
    // The registered repository tries to run code and to choose gh; the operator environment names another repository.
    const marker = join(scratch, 'preload-ran');
    writeFileSync(join(repository, 'preload.ts'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\n`);
    writeFileSync(join(repository, 'bunfig.toml'), 'preload = ["./preload.ts"]\n');
    const repositoryGh = join(scratch, 'repository-gh');
    writeFileSync(repositoryGh, `#!/bin/sh\necho repository-gh >> ${JSON.stringify(join(scratch, 'calls'))}\nexit 1\n`);
    writeFileSync(join(repository, '.env'), `REPO_HARNESS_GH_BIN=${repositoryGh}\n`);
    const operatorGh = join(scratch, 'operator-gh');
    writeFileSync(operatorGh, `#!/bin/sh\necho "operator-gh GH_REPO=$GH_REPO GIT_DIR=$GIT_DIR" >> ${JSON.stringify(join(scratch, 'calls'))}\nexit 1\n`);
    chmodSync(repositoryGh, 0o755);
    chmodSync(operatorGh, 0o755);
    const registry = registryHome([{ path: repository, accessMode: 'read_only' }]);
    const env = { ...process.env, ...registry.env, REPO_HARNESS_GH_BIN: operatorGh, GH_REPO: 'other/repo', GIT_DIR: join(scratch, 'other.git') };
    const signal = new AbortController().signal;
    try {
      // `gh repo view` fails, so the CLI exits with BoardCollectError on stderr.
      await expect(readRepositoryBoard({ repository_id: registry.ids[0]!, parent: 1474, env, signal })).rejects.toMatchObject({ code: 'board_collect_failed' });
      expect(existsSync(marker)).toBe(false);
      expect(readFileSync(join(scratch, 'calls'), 'utf8')).toBe('operator-gh GH_REPO= GIT_DIR=\n');
      await expect(readRepositoryBoard({ repository_id: 'repo-missing', parent: 1474, env, signal })).rejects.toMatchObject({ code: 'repository_not_found' });
      // The parent list mode runs the same way; its failed GitHub read keeps its own code.
      await expect(readRepositoryBoardParents({ repository_id: registry.ids[0]!, env, signal })).rejects.toMatchObject({ code: 'parents_github_failed' });
      expect(existsSync(marker)).toBe(false);
      expect(readFileSync(join(scratch, 'calls'), 'utf8')).toBe('operator-gh GH_REPO= GIT_DIR=\n'.repeat(2));
    } finally {
      rmSync(repository, { recursive: true, force: true });
      rmSync(scratch, { recursive: true, force: true });
      rmSync(registry.home, { recursive: true, force: true });
    }
  }, 60_000);

  test('advisor seat routes: the client names only repository and parent; each send is audited; refusals keep their codes; the board read cap is shared', async () => {
    const home = mkdtempSync(join(tmpdir(), 'repo-harness-advisor-home-'));
    const ui = join(home, 'ui');
    mkdirSync(ui);
    writeFileSync(join(ui, 'index.html'), '<!doctype html><main>operator</main>');
    const sent = { protocol: 1, kind: 'repo-harness.advisor-seat-send', github_repository_id: 1186405141, parent: 1503, terminal: 't9', started: true, turn: 2 };
    const transcript = { protocol: 1, kind: 'repo-harness.advisor-seat-transcript', github_repository_id: 1186405141, parent: 1503, terminal: 't9',
      status: 'idle', status_kind: null, turn: 2, complete: true, why: null, lines: ['ok', 'Authorization: Bearer [REDACTED]'] };
    let send: () => Promise<unknown> = async () => sent;
    let read: () => Promise<unknown> = async () => transcript;
    const sends: (BoardReadInput & { text: string })[] = [];
    const reads: BoardReadInput[] = [];
    let hold: () => void = () => {};
    let started: () => void = () => {};
    const boardStarted = new Promise<void>(resolve => { started = resolve; });
    const server = await startOperatorServer({ port: 0, max_concurrency: 1, static_root: ui, env: { REPO_HARNESS_HOME: home },
      send_advisor: input => { sends.push(input); return send(); }, read_advisor_transcript: input => { reads.push(input); return read(); },
      read_board: () => new Promise(resolve => { hold = () => resolve(decodeBoard(board1474)); started(); }) });
    const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
    let next = 0;
    const post = (body: Record<string, unknown>, route = 'messages') => fetch(`${server.url}/api/v1/seats/advisor/${route}`, { method: 'POST',
      body: JSON.stringify({ request_id: `123e4567-e89b-42d3-a456-${String(next++).padStart(12, '0')}`, ...body }),
      headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: cookie } });
    const get = (query: string) => fetch(`${server.url}/api/v1/seats/advisor/transcript${query}`);
    const answer = async (response: Response) => [response.status, ((await response.json()) as { error?: { code: string } }).error?.code ?? 'ok'];
    const audit = () => readFileSync(join(home, 'operator/audit.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    const message = { repository_id: 'repo-a', parent: 1503, text: 'status?' };
    try {
      expect(await answer(await post(message))).toEqual([200, 'ok']);
      expect(sends[0]).toMatchObject({ repository_id: 'repo-a', parent: 1503, text: 'status?', env: { GH_PROMPT_DISABLED: '1' } });
      // The audit names the repository in the target and the parent and the resolved terminal in the result; the text stays out of it.
      expect(audit().map(record => record.phase === 'intent' ? [record.operation, record.target] : [record.status, record.body])).toEqual([
        ['advisor_seat_message', 'advisor_seat:repo-a'], [200, sent]]);
      expect(readFileSync(join(home, 'operator/audit.jsonl'), 'utf8')).not.toContain('status?');
      // Text limits, a terminal address in the request and a non-number parent are refused before a child runs.
      for (const body of [{ ...message, text: '' }, { ...message, text: 'a'.repeat(4001) }, { ...message, text: 'a\tb' }, { ...message, terminal: 't9' },
        { ...message, parent: '1503' }, { repository_id: 'repo-a', parent: 1503 }]) {
        expect(await answer(await post(body))).toEqual([400, 'invalid_body']);
      }
      expect(sends).toHaveLength(1);
      // Every failed send is a recorded result that names its seat. Only a failure before `hc send` keeps its code; an unconfirmed
      // send, a timeout, a crash or an invalid report may follow a send, so it answers reconcile_required with no new request_id.
      const report = (code: string, terminal: string | null, parent = 1503) => ({ protocol: 1, kind: 'repo-harness.advisor-seat-send-failure', github_repository_id: 1186405141, parent, terminal, code });
      const before = audit().length;
      for (const [failure, child, status, answered, terminal, delivery] of [
        ['advisor_seat_absent', report('advisor_seat_absent', null), 409, 'advisor_seat_absent', null, 'not_sent'],
        ['advisor_seat_ambiguous', report('advisor_seat_ambiguous', null), 409, 'advisor_seat_ambiguous', null, 'not_sent'],
        ['repository_read_only', undefined, 403, 'repository_read_only', null, 'not_sent'],
        ['advisor_send_unconfirmed', report('advisor_send_unconfirmed', 't9'), 409, 'reconcile_required', 't9', 'unknown'],
        ['advisor_send_unconfirmed', report('advisor_send_unconfirmed', 't9', 1504), 409, 'reconcile_required', null, 'unknown'],
        ['advisor_timeout', undefined, 409, 'reconcile_required', null, 'unknown'],
        ['advisor_unavailable', undefined, 409, 'reconcile_required', null, 'unknown'],
      ] as const) {
        send = async () => { throw new BoardReadError(failure, child); };
        const response = await post(message);
        const body = await response.json() as { error: { code: string; next_action: string } };
        expect([response.status, body.error.code]).toEqual([status, answered]);
        if (delivery === 'unknown') expect(body.error.next_action).toBe(OPERATOR_RECONCILE_ACTION);
        // A report for another parent is invalid output.
        const code = child?.parent === 1504 ? 'advisor_invalid' : failure;
        expect(audit().at(-1)).toMatchObject({ phase: 'result', status, body: { advisor_seat: { repository_id: 'repo-a', parent: 1503, terminal, code, delivery } } });
      }
      send = async () => ({ ...sent, parent: 1504 });
      expect(await answer(await post(message))).toEqual([409, 'reconcile_required']);
      expect(audit().at(-1).body.advisor_seat).toEqual({ repository_id: 'repo-a', parent: 1503, terminal: 't9', code: 'advisor_invalid', delivery: 'unknown' });
      expect(audit().slice(before).filter(record => record.phase === 'intent').every(record => record.target === 'advisor_seat:repo-a')).toBe(true);
      expect(readFileSync(join(home, 'operator/audit.jsonl'), 'utf8')).not.toContain('status?');

      for (const query of ['', '?repository_id=repo-a', '?repository_id=repo-a&parent=0', '?repository_id=repo-a&parent=1503&terminal=t9', '?repository_id=repo-a&parent=1503&parent=1504']) {
        expect(await answer(await get(query))).toEqual([400, 'invalid_request']);
      }
      expect(reads).toHaveLength(0);
      const ready = await get('?repository_id=repo-a&parent=1503');
      expect([ready.status, await ready.json()]).toEqual([200, transcript]);
      expect(reads[0]).toMatchObject({ repository_id: 'repo-a', parent: 1503 });
      for (const [failure, status] of [['advisor_seat_absent', 409], ['advisor_seat_ambiguous', 409], ['advisor_read_failed', 502], ['advisor_timeout', 504]] as const) {
        read = async () => { throw new BoardReadError(failure); };
        expect(await answer(await get('?repository_id=repo-a&parent=1503'))).toEqual([status, failure]);
      }
      read = async () => ({ ...transcript, lines: ['API_KEY=hunter2'] });
      expect(await answer(await get('?repository_id=repo-a&parent=1503'))).toEqual([503, 'advisor_invalid']);
      expect((await fetch(`${server.url}/api/v1/seats/advisor/transcript?repository_id=repo-a&parent=1503`, { method: 'HEAD' })).status).toBe(405);

      // A boss command (#1757) names only its id: the server reads the seat status, then sends its own text through the same send.
      send = async () => sent;
      read = async () => transcript;
      const boss = { repository_id: 'repo-a', parent: 1503, command: 'rage' };
      for (const body of [{ ...boss, command: 'boss' }, { ...boss, text: 'status?' }, { ...boss, parent: '1503' }]) {
        expect(await answer(await post(body, 'boss-commands'))).toEqual([400, 'invalid_body']);
      }
      expect(await answer(await post(boss, 'boss-commands'))).toEqual([200, 'ok']);
      expect([reads.at(-1), sends.at(-1)]).toMatchObject([{ repository_id: 'repo-a', parent: 1503 }, { repository_id: 'repo-a', parent: 1503 }]);
      expect(sends.at(-1)!.text.startsWith('【大棒】检查 parent #1503 下的执行席和审查席')).toBe(true);
      expect(audit().filter(record => record.phase === 'intent').at(-1)).toMatchObject({ operation: 'advisor_boss_rage', target: 'advisor_seat:repo-a' });
      expect(await answer(await post(boss, 'boss-commands'))).toEqual([409, 'boss_cooldown']);

      // A board read in flight holds the one slot of the shared cap.
      const board = fetch(`${server.url}/api/v1/repositories/repo-a/board?parent=1474`);
      await boardStarted;
      expect(await answer(await post(message))).toEqual([503, 'advisor_busy']);
      expect(await answer(await post({ ...boss, command: 'mine' }, 'boss-commands'))).toEqual([503, 'advisor_busy']);
      expect(await answer(await get('?repository_id=repo-a&parent=1503'))).toEqual([503, 'advisor_busy']);
      hold();
      expect((await board).status).toBe(200);
    } finally {
      await server.close();
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('boss commands: the cooldown of a command and parent comes from the audit log; a running turn and every failure before the send prove nothing was sent', async () => {
    const home = mkdtempSync(join(tmpdir(), 'repo-harness-boss-home-'));
    const env = { REPO_HARNESS_HOME: home };
    const sent = (parent: number) => ({ protocol: 1, kind: 'repo-harness.advisor-seat-send', github_repository_id: 1186405141, parent, terminal: 't9', started: true, turn: 2 });
    const transcript = (parent: number, status: string | null) => ({ protocol: 1, kind: 'repo-harness.advisor-seat-transcript', github_repository_id: 1186405141, parent,
      terminal: 't9', status, status_kind: null, turn: 2, complete: true, why: null, lines: [] });
    let read: (input: BoardReadInput) => Promise<unknown> = async input => transcript(input.parent, 'idle');
    let send: (input: BoardReadInput & { text: string }) => Promise<unknown> = async input => sent(input.parent);
    let calls: string[] = [];
    let clock = 0;
    const route = advisorBossCommandWriteRoute({ admit: run => run(new AbortController().signal), env, audit_env: env, now: () => clock,
      read: (input) => { calls.push(`read ${input.parent}`); return read(input); },
      send: (input) => { calls.push(`send ${input.parent} ${input.text.slice(0, 4)}`); return send(input); } });
    let next = 0;
    const boss = async (command: string, parent: number) => {
      calls = [];
      const { status, body } = await runOperatorWrite(`123e4567-e89b-42d3-a456-${String(next++).padStart(12, '0')}`, route.decode({ repository_id: 'repo-a', parent, command }, []), env);
      const { error, retry_after_seconds } = body as { error?: { code: string }; retry_after_seconds?: number };
      return [status, error?.code ?? 'ok', retry_after_seconds ?? null, calls];
    };
    const auditPath = join(home, 'operator/audit.jsonl');
    const audit = () => readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    const lastSentAt = () => Date.parse(audit().filter(record => record.phase === 'intent').at(-1).recorded_at);
    try {
      expect(await boss('rage', 1503)).toEqual([200, 'ok', null, ['read 1503', 'send 1503 【大棒】']]);
      expect(audit().map(record => record.phase === 'intent' ? record.operation : record.status)).toEqual(['advisor_boss_rage', 200]);
      const rage = lastSentAt();
      // The cooldown is per command and per parent, and ends after exactly its seconds.
      const steps: readonly (readonly [number, string, number, readonly unknown[]])[] = [
        [rage + 1_000, 'rage', 1503, [409, 'boss_cooldown', 1_799, []]],
        [rage + 1_799_001, 'rage', 1503, [409, 'boss_cooldown', 1, []]],
        [rage + 1_000, 'rage', 1504, [200, 'ok', null, ['read 1504', 'send 1504 【大棒】']]],
        [rage + 1_000, 'carrot', 1503, [200, 'ok', null, ['read 1503', 'send 1503 【萝卜】']]],
        [rage + 1_800_000, 'rage', 1503, [200, 'ok', null, ['read 1503', 'send 1503 【大棒】']]],
      ];
      for (const [at, command, parent, answer] of steps) {
        clock = at;
        expect([command, parent, await boss(command, parent)] as unknown[]).toEqual([command, parent, answer]);
      }
      expect(audit().find(record => record.status === 409)).toMatchObject({ phase: 'result', status: 409, body: { advisor_seat: { repository_id: 'repo-a', parent: 1503, terminal: null, code: 'boss_cooldown', delivery: 'not_sent' } } });

      // Only a finished turn takes a boss command. A running or unknown turn is refused before the send and starts no cooldown.
      const idle: typeof read = async input => transcript(input.parent, 'idle');
      for (const [row, [status, code]] of ([['idle', 'ok'], ['done', 'ok'], ['working', 'advisor_turn_running'], ['blocked', 'advisor_turn_running'],
        [null, 'advisor_turn_unknown'], ['thinking', 'advisor_turn_unknown']] as const).entries()) {
        const parent = 1600 + row;
        const sent = [`read ${parent}`, `send ${parent} 【排雷】`];
        read = async input => transcript(input.parent, status);
        expect([status, await boss('mine', parent)]).toEqual([status, code === 'ok' ? [200, 'ok', null, sent] : [409, code, null, [`read ${parent}`]]]);
        if (code === 'ok') continue;
        expect(audit().at(-1).body.advisor_seat).toEqual({ repository_id: 'repo-a', parent, terminal: 't9', code, delivery: 'not_sent' });
        read = idle;
        expect([status, await boss('mine', parent)]).toEqual([status, [200, 'ok', null, sent]]);
      }
      // Every failure of the read-back comes before the send, so it keeps its own code and does not start the cooldown.
      for (const [failure, status] of [['advisor_seat_absent', 409], ['advisor_read_failed', 502], ['advisor_timeout', 504], ['advisor_unavailable', 503]] as const) {
        read = async () => { throw new BoardReadError(failure); };
        expect(await boss('mine', 1503)).toEqual([status, failure, null, ['read 1503']]);
        expect(audit().at(-1).body.advisor_seat).toMatchObject({ code: failure, delivery: 'not_sent' });
      }
      read = async () => transcript(1504, 'idle');
      expect(await boss('mine', 1503)).toEqual([503, 'advisor_invalid', null, ['read 1503']]);
      read = async input => transcript(input.parent, 'idle');
      expect(await boss('mine', 1503)).toEqual([200, 'ok', null, ['read 1503', 'send 1503 【排雷】']]);

      // A send that may have run starts the cooldown, as does an intent left without a result.
      send = async () => { throw new BoardReadError('advisor_timeout'); };
      expect(await boss('valve', 1503)).toEqual([409, 'reconcile_required', null, ['read 1503', 'send 1503 【收放】']]);
      clock = lastSentAt() + 1_000;
      expect(await boss('valve', 1503)).toEqual([409, 'boss_cooldown', 3_599, []]);
      const intent = (parent: number, recordedAt: string) => `${JSON.stringify({ protocol: 1, phase: 'intent', recorded_at: recordedAt,
        request_id: `923e4567-e89b-42d3-a456-${String(parent).padStart(12, '0')}`, operation: 'advisor_boss_rage', target: 'advisor_seat:repo-a',
        binding_sha256: operatorWriteBinding('advisor_boss_rage', 'advisor_seat:repo-a', { repository_id: 'repo-a', parent, command: 'rage' }) })}\n`;
      writeFileSync(auditPath, intent(1507, new Date(clock).toISOString()) + intent(1508, 'not a time'), { flag: 'a' });
      expect(await boss('rage', 1507)).toEqual([409, 'boss_cooldown', 1_800, []]);
      // A send time that does not parse cannot prove the cooldown.
      expect(await boss('rage', 1508)).toEqual([503, 'audit_unavailable', null, []]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('advisor seat CLI child: the registered root, gh for the numeric id, a fake hc on an explicit PATH; read_only refuses a send', async () => {
    const repository = mkdtempSync(join(tmpdir(), 'repo-harness-advisor-'));
    const scratch = mkdtempSync(join(tmpdir(), 'repo-harness-advisor-bin-'));
    expect(spawnSync('git', ['init', '-q'], { cwd: repository }).status).toBe(0);
    const gh = join(scratch, 'gh');
    writeFileSync(gh, '#!/bin/sh\n[ "$*" = "api --hostname github.com repos/{owner}/{repo}" ] && echo \'{"id":1186405141}\' && exit 0\nexit 1\n');
    // The advisor seat carries no parent label: one advisor serves the repository (#1780).
    const labels = '{"repo-harness.seat":"advisor","repo-harness.repository":"1186405141"}';
    const secret = `ghp_${'a'.repeat(36)}`;
    writeFileSync(join(scratch, 'hc'), [
      '#!/bin/sh', `printf '%s\\n' "$*" >> ${JSON.stringify(join(scratch, 'hc.log'))}`, 'case "$1" in',
      `  ls) echo '{"terminals":[{"address":"t9","state":"live"}]}' ;;`,
      `  get) echo '{"address":"t9","state":"live","turn":4,"status":{"state":"idle"},"labels":${labels}}' ;;`,
      `  send) [ -f ${JSON.stringify(join(scratch, 'send-fails'))} ] && { printf '%s' '{"error":{"kind":"blocked","message":"blocked"}}' >&2; exit 9; }; echo '{"started":true,"turn":5}' ;;`,
      `  read) echo '{"text":"done\\\\ntoken ${secret}","complete":true}' ;;`,
      '  *) exit 2 ;;', 'esac', ''].join('\n'));
    chmodSync(gh, 0o755);
    chmodSync(join(scratch, 'hc'), 0o755);
    const writable = registryHome([{ path: repository, accessMode: 'read_write' }]);
    const readOnly = registryHome([{ path: repository, accessMode: 'read_only' }]);
    const env = (registry: typeof writable) => ({ PATH: `${scratch}:/usr/bin:/bin`, HOME: registry.home, ...registry.env, REPO_HARNESS_GH_BIN: gh });
    const signal = new AbortController().signal;
    try {
      const text = 'line 1\nline 2';
      expect(await sendRepositoryAdvisor({ repository_id: writable.ids[0]!, parent: 1503, text, env: env(writable), signal }))
        .toEqual({ protocol: 1, kind: 'repo-harness.advisor-seat-send', github_repository_id: 1186405141, parent: 1503, terminal: 't9', started: true, turn: 5 });
      expect(await readRepositoryAdvisorTranscript({ repository_id: readOnly.ids[0]!, parent: 1503, env: env(readOnly), signal })).toMatchObject({
        terminal: 't9', status: 'idle', turn: 4, complete: true, why: null, lines: ['done', 'token ghp_[REDACTED]'] });
      await expect(sendRepositoryAdvisor({ repository_id: readOnly.ids[0]!, parent: 1503, text, env: env(readOnly), signal })).rejects.toMatchObject({ code: 'repository_read_only' });
      // A failed send keeps the CLI's report of the resolved terminal for the audit.
      writeFileSync(join(scratch, 'send-fails'), '');
      await expect(sendRepositoryAdvisor({ repository_id: writable.ids[0]!, parent: 1503, text: 'again', env: env(writable), signal })).rejects.toMatchObject({
        code: 'advisor_send_unconfirmed', failure: { protocol: 1, kind: 'repo-harness.advisor-seat-send-failure', github_repository_id: 1186405141, parent: 1503, terminal: 't9', code: 'advisor_send_unconfirmed' } });
      const log = readFileSync(join(scratch, 'hc.log'), 'utf8').split('\n');
      expect(log.filter(line => line !== '' && !line.startsWith('get '))).toEqual([
        'ls --json --label repo-harness.repository=1186405141', `send --json -- t9 line 1`, 'line 2',
        'ls --json --label repo-harness.repository=1186405141', 'read --json --lines 200 -- t9',
        'ls --json --label repo-harness.repository=1186405141', 'send --json -- t9 again']);
    } finally {
      for (const path of [repository, scratch, writable.home, readOnly.home]) rmSync(path, { recursive: true, force: true });
    }
  }, 60_000);

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
    const server = await startOperatorServer({ port: 0, max_concurrency: 1, timeout_ms: 1_000, read_docs });
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
        committed_at: new Date(gitIn('log', '-1', '--format=%cI', commit)).toISOString(), path: 'docs/guide.md', size: 8, sha256: createHash('sha256').update('# Guide\n').digest('hex'), text: '# Guide\n',
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

  test('keeps a case-variant API path off the SPA shell and pins the refusal headers', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-headers-'));
    writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
    const server = await startOperatorServer({
      port: 0,
      static_root: staticRoot,
    });
    try {
      for (const variant of ['/API/v1/dev-activity', '/Api/v1/repository/repo-write/snapshot', '/API']) {
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

      const options = await fetch(`${server.url}/api/v1/dev-activity`, { method: 'OPTIONS' });
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
  // The thread root and the CLI root register the ownership port only for a selected plugin; diff mode needs it.
  const env = { ...pluginSelectionEnv(), REPO_HARNESS_HOME: registry.home, ...git.env };
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
    const cliEnv = env;
    const list = spawnSync(process.execPath, [cli, 'module', 'list', '--json'], { cwd: root, env: cliEnv, encoding: 'utf8' });
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
            const packet = spawnSync(process.execPath, [cli, ...args], { cwd: root, env: cliEnv, encoding: 'utf8' });
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

test('architecture diff mode resolves owners only when the thread root has the selected plugin', async () => {
  const root = realpathSync(moduleRepository());
  const base = fixtureGit(root, ['rev-parse', 'HEAD']);
  fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 2;\n'); const head = fixtureCommit(root);
  const registry = registryHome([{ path: root, accessMode: 'read_only' }]);
  const scratch = mkdtempSync('/tmp/oui-b-owners-'), selected = pluginSelectionEnv().HOME!, node = resolveCompatibleNodeRuntime(process.env);
  const log = join(scratch, 'node-argv.jsonl'), shim = join(scratch, 'node-probe');
  writeFileSync(shim, `#!${node}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nfs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');\nprocess.exit(require('node:child_process').spawnSync(${JSON.stringify(node)}, args, { stdio: 'inherit' }).status ?? 1);\n`, { mode: 0o755 });
  const path = `/api/v1/repositories/${registry.ids[0]}/architecture/modules/${MODULE_ID}/review-prompt?shard=1&mode=diff&base=${base}&head=${head}`;
  try {
    for (const [name, home, status, code, resolves] of [
      ['selected', selected, 200, undefined, true],
      ['not selected', process.env.HOME, 422, 'diff_owner_resolution_failed', false],
    ] as const) {
      writeFileSync(log, '');
      const server = await startOperatorServer({ port: 0, timeout_ms: 10000, env: { ...process.env, HOME: home, ...registry.env, REPO_HARNESS_NODE_BIN: shim } });
      try {
        const response = await fetch(server.url + path), body = await response.json() as { code?: string; digest?: string };
        expect(response.status, name).toBe(status);
        if (code) expect(body, name).toEqual({ code }); else expect(body.digest, name).toMatch(/^[0-9a-f]{64}$/);
        const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as string[]);
        // The model read starts archctx in both cases, so the shim log proves that the probe saw archctx.
        expect(calls.some(argv => argv.includes('export')), name).toBe(true);
        expect(calls.some(argv => argv.includes('resolve')), name).toBe(resolves);
      } finally { await server.close(); }
    }
  } finally { for (const dir of [root, scratch, selected, registry.home]) rmSync(dir, { recursive: true, force: true }); }
}, 60_000);

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
      expect((await fetch(server.url + '/api/v1/dev-activity', { method, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
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

test('architecture history names each archctx failure with its public code and status', () => {
  // The error envelopes are archctx 0.11.0 output: a shallow clone, and an unknown --ref.
  const failure = (error: Record<string, unknown>): ArchctxProcessResult => ({ status: 1, signal: null, stderr: '',
    stdout: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: false, requestId: 'history', error: { code: 'AC_PRECONDITION_FAILED', severity: 'warning', ...error } }) });
  const cases: [ArchctxProcessResult, string, number][] = [
    [failure({ message: 'Architecture history requires a complete Git repository.', retryable: true, action: 'unshallow-repository', reasonCode: 'history-shallow-repository', details: {} }), 'history_shallow_repository', 422],
    [failure({ message: 'native-context-ref-unavailable', retryable: false, action: 'repair-native-input', reasonCode: 'native-context-ref-unavailable', details: { selector: 'ref' } }), 'commit_not_found', 404],
    [{ status: null, signal: null, stdout: '', stderr: '', timedOut: true }, 'timeout', 504],
  ];
  for (const [result, code, status] of cases) {
    expect(() => readHistory(process.cwd(), { kind: 'architecture_history', repository_id: 'repo_0123456789abcdef', offset: 0, limit: 25, ref: null }, { env: process.env, run: () => result })).toThrow(code);
    expect(ARCHITECTURE_FAILURES).toContain(code as typeof ARCHITECTURE_FAILURES[number]);
    expect(architectureStatus(code)).toBe(status);
  }
});

test('architecture prompt keeps public absolute-path examples in CLI digest parity', async () => {
  const root = realpathSync(moduleRepository({ section3: 'The test uses /tmp/x and https://example.invalid/?page=1.' }));
  const registry = registryHome([{ path: root, accessMode: 'read_only' }]);
  const env = { ...process.env, ...registry.env };
  const server = await startOperatorServer({ port: 0, env });
  try {
    const cli = new URL('../../src/cli/index.ts', import.meta.url).pathname;
    const expected = spawnSync(process.execPath, [cli, 'module', 'review-prompt', MODULE_ID, '--json'], { cwd: root, env: { ...env, HOME: pluginSelectionEnv().HOME }, encoding: 'utf8' });
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
  // The collectors read hc; a fake one comes first on PATH, so the server never reaches a real core.
  const hc = fakeHc('operator-serve-hc');
  recordPluginSelection({ HOME: home }, ['operator']);
  const child = spawn(process.execPath, [cli, 'operator', 'serve', '--port', '0', '--runtime-status-config', configPath], {
    cwd: home, env: { ...process.env, HOME: home, TMPDIR: home, REPO_HARNESS_HOME: home, FAKE_HC: hc.env.FAKE_HC, PATH: `${hc.env.PATH}:${process.env.PATH}` },
    stdio: ['ignore', 'pipe', 'pipe'],
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
    expect(await response.json()).toMatchObject({ projection_version: 'repo-harness.runtime-overlay.v7', status: 'ready',
      badges: [], native_sources: [{ source_id: 'cli-source', provider: 'pi', freshness: 'fresh',
        observations: [{ scope: 'terminal', state: 'idle', event_received_at: heartbeat }] }] });
    expect(readFileSync(sourcePath)).toEqual(sourceBefore); expect(readFileSync(configPath)).toEqual(configBefore);
    expect(readdirSync(root).sort()).toEqual(filesBeforeGet);
    child.kill('SIGTERM'); expect(await exited).toBe(0);
  } finally { if (child.exitCode === null) { child.kill('SIGTERM'); await exited; } for (const path of [root, home, hc.root]) rmSync(path, { recursive: true, force: true }); }
});

describe('architecture map', () => {
  const noCodeFacts = { state: 'unavailable', reason: 'code_facts_unavailable' } as const;
  const map: ArchitectureMapV1 = projectArchitectureMap({
    repository_id: 'repo-a', commit: 'c'.repeat(40), head_ref: 'main', archctx_version: '0.11.2', collected_at: '2026-10-27T09:00:00.000Z',
    nodes: [{ id: 'capability.pipeline.ledger', kind: 'capability', name: 'Ledger', status: 'active', layer: 'core', parent: null, summary: 'Ledger.', domain: 'pipeline', namespace: null, mount: null }],
    relations: [], flows: [], flow_evidence: [], sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'code_facts_unavailable' },
    layer_order: { state: 'unavailable', reason: 'model_layers_undeclared' },
    layers: {
      changes: { state: 'unavailable', reason: 'history_starts_today' },
      pull_requests: { state: 'unavailable', reason: 'dev_activity_pending' },
      violations: { debt: noCodeFacts, flows: noCodeFacts, anchors: noCodeFacts, dependencies: noCodeFacts, layer_direction: { state: 'unavailable', reason: 'model_layers_undeclared' } },
      tests: { state: 'unavailable', reason: 'tests_pending' },
      decisions: { state: 'ok', items: [] },
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
        [{ state: 'unavailable', reason: 'architecture_map_failed' }, 503, 'architecture_map_failed'],
        [{ state: 'unavailable', reason: 'architecture_map_timeout' }, 503, 'architecture_map_timeout'],
        [{ state: 'unavailable', reason: 'architecture_map_process_failed' }, 503, 'architecture_map_process_failed'],
        [{ state: 'unavailable', reason: 'archctx_error', code: 'AC_MODEL_ADOPTION_REQUIRED', reason_code: 'native-context-model-missing' }, 503, 'archctx_error'],
        // A cached map that fails the decoder is refused, not sent.
        [{ state: 'ready', map: { ...map, nodes: [{ ...map.nodes[0]!, summary: 1 }] } }, 503, 'architecture_map_invalid'],
        // v7 replaced v6 with no alias: a v6 body is refused.
        [{ state: 'ready', map: { ...map, schema_version: 'repo-harness.architecture-map.v6' } }, 503, 'architecture_map_invalid'],
      ] as const) {
        cache = next as ArchitectureMapRepositoryCache;
        const answer = await get();
        expect(answer.status).toBe(status);
        expect((answer.body as { error?: { code: string } }).error?.code).toBe(code);
        // The page reads archctx's codes from the refusal; every other refusal has only the typed error.
        expect(decodeArchitectureMapRefusal(answer.body)).toEqual(next.state === 'ready' ? { state: 'unavailable', reason: 'architecture_map_invalid' } : next);
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
    const failed = (line: Record<string, unknown>) => async () => ({ ok: true, stdout: JSON.stringify({ id, ok: false, ...line }) });
    const refusal = { reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'native-document-marker-invalid' } as const;
    for (const [run_process, expected] of [
      [async () => ({ ok: false, code: 'failed' }), { reason: 'architecture_map_process_failed' }],
      [async () => ({ ok: false, code: 'timeout' }), { reason: 'architecture_map_timeout' }],
      [async () => { throw new Error('spawn failed'); }, { reason: 'architecture_map_process_failed' }],
      [async () => ({ ok: true, stdout: JSON.stringify({ id: 'repo-other', ok: true, snapshot: map }) }), { reason: 'architecture_map_invalid' }],
      // The child's own reasons and archctx's codes pass; any other failure line is invalid.
      [failed({ reason: 'model_unavailable' }), { reason: 'model_unavailable' }],
      [failed({ reason: 'repository_not_found' }), { reason: 'repository_not_found' }],
      [failed({ reason: 'architecture_map_failed' }), { reason: 'architecture_map_failed' }],
      [failed(refusal), refusal],
      [failed({ ...refusal, code: 'schema invalid' }), { reason: 'architecture_map_invalid' }],
      [failed({ reason: 'registry_unavailable' }), { reason: 'architecture_map_invalid' }],
    ] as const) {
      const failing = startArchitectureMapCollector({ env: registry.env, interval_ms: 60_000, run_process: run_process as never });
      try {
        await failing.settled();
        expect(failing.read(id)).toEqual({ state: 'unavailable', ...expected });
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

describe('worktree cleanup write route', () => {
  /** A registered repository with a green `repo-wt-feature` and a server whose page hands out the write token. */
  async function cleanupServer(extraEnv: NodeJS.ProcessEnv = {}, writeRoutes: (env: NodeJS.ProcessEnv) => readonly OperatorWriteRoute[] = () => []) {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-operator-cleanup-')));
    const main = join(parent, 'repo'), root = join(parent, 'managed'), home = join(parent, 'home'), ui = join(parent, 'ui');
    for (const directory of [main, root, home, ui]) mkdirSync(directory);
    writeFileSync(join(ui, 'index.html'), '<!doctype html><main>operator</main>');
    const git = (cwd: string, ...args: string[]) => {
      const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8' });
      if (result.status) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    git(main, 'init', '--quiet', '-b', 'main');
    writeFileSync(join(main, '.gitignore'), '.env\n'); git(main, 'add', '-A'); git(main, 'commit', '--quiet', '-m', 'base');
    const tree = join(root, 'repo-wt-feature');
    git(main, 'worktree', 'add', '--quiet', '-b', 'feature', tree);
    writeFileSync(join(tree, 'feature.txt'), 'feature'); git(tree, 'add', '-A'); git(tree, 'commit', '--quiet', '-m', 'feature');
    git(main, 'update-ref', 'refs/remotes/origin/main', git(tree, 'rev-parse', 'HEAD'));
    const repo = { id: repoHarnessRepoIdFor(main), path: main, accessMode: 'read_only' as const, source: 'adopt' as const, registeredAt: '2026-10-28T00:00:00.000Z', lastSeenAt: '2026-10-28T00:00:00.000Z' };
    writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [repo] }));
    const env = { REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: root, ...extraEnv };
    const server = await startOperatorServer({ port: 0, static_root: ui, env, write_routes: writeRoutes(env) });
    const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
    const post = (body: unknown) => fetch(`${server.url}/api/v1/worktrees/cleanup`, { method: 'POST', body: JSON.stringify(body),
      headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: cookie } });
    const audit = () => readFileSync(join(home, 'operator/audit.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    return { parent, main, root, tree, repo, env, server, post, audit, close: async () => { await server.close(); rmSync(parent, { recursive: true, force: true }); } };
  }

  function cleanupRows(f: Awaited<ReturnType<typeof cleanupServer>>) {
    const rows = collectRepositoryWorktrees(f.repo, {}, { ...process.env, ...f.env }).snapshot.repositories[0]!.worktrees;
    const row = (directory: string) => rows.find(item => item.directory === directory)!;
    return { row, digest: (directory: string) => selectionDigest([worktreeDigestRow(row(directory))]) };
  }
  /**
   * The production decoder, operation and child entry, with the controlled
   * process inventory (#1128) preloaded into the real supervised child. The
   * server replaces the production binding with the same id (tests only).
   */
  const controlledCleanupRoute = (env: NodeJS.ProcessEnv): OperatorWriteRoute => ({
    id: 'worktrees_cleanup',
    path: OPERATOR_WORKTREES_CLEANUP_ROUTE,
    decode(fields) {
      const request = decodeWorktreeCleanupRequest(fields);
      return worktreeCleanupOperation(request, () => runWorktreeCleanupChild(request, {
        env, run_process: (argv, options) => runSetupProcess(['--preload', controlledWorktreeProcessPreload, ...argv], options),
      }));
    },
  });

  // POSIX only: trash ownership needs a uid, and the hold uses a shell script as Git.
  test.skipIf(process.platform === 'win32')('refuses a yellow worktree through the child effect, audits it, and answers GET with 405', async () => {
    const f = await cleanupServer();
    try {
      const other = join(f.root, 'repo-wt-other');
      spawnSync('git', ['worktree', 'add', '--quiet', '-b', 'other', other, 'feature'], { cwd: f.main });
      writeFileSync(join(other, '.env'), 'private');
      const { row, digest } = cleanupRows(f);
      expect(row('repo-wt-other').judgment).toBe('yellow');
      const refused = await f.post({ request_id: '123e4567-e89b-42d3-a456-426614174101', ids: [row('repo-wt-other').id], expected_digest: digest('repo-wt-other') });
      expect(refused.status).toBe(422);
      expect((await refused.json()).error.code).toBe('not_approved');
      expect(existsSync(other) && existsSync(f.tree)).toBe(true);
      expect(f.audit().map(record => [record.phase, record.status ?? record.operation])).toEqual([['intent', 'worktrees_cleanup'], ['result', 422]]);
      expect(readFileSync(join(f.env.REPO_HARNESS_HOME!, 'operator/audit.jsonl'), 'utf8')).not.toContain(f.parent);
      expect((await fetch(`${f.server.url}/api/v1/worktrees/cleanup`)).status).toBe(405);
    } finally { await f.close(); }
  });

  test.skipIf(process.platform === 'win32')('removes a green worktree through the child effect and audits it', async () => {
    const f = await cleanupServer({}, env => [controlledCleanupRoute(env)]);
    try {
      // The row the page shows, built with the same empty inventory as the child.
      const common = resolveGitCommonDirectory(f.main);
      const found = registeredWorktreePaths(worktreeEntries(f.main)).find(item => item.path === realpathSync(f.tree))!;
      const green = repositoryWorktreeRow({ repo: f.repo, common, managed_root: realpathSync(f.root), id: worktreeId(common, found.path), path: found.path, entry: found.entry,
        size_bytes: null, size_observed_at: null, caller_cwd: null, env: { ...process.env, ...f.env }, deadline: Date.now() + 10_000, processes: [] });
      expect(green.judgment).toBe('green');
      const removed = await f.post({ request_id: '123e4567-e89b-42d3-a456-426614174102', ids: [green.id], expected_digest: selectionDigest([worktreeDigestRow(green)]) });
      expect(removed.status).toBe(200);
      expect(await removed.json()).toEqual({ protocol: 1, kind: 'operator_worktree_cleanup', items: [
        { id: green.id, repository_id: f.repo.id, directory: 'repo-wt-feature', outcome: 'removed', reason: null },
      ] });
      expect(existsSync(f.tree)).toBe(false);
      expect(f.audit().map(record => [record.phase, record.status ?? record.operation])).toEqual([['intent', 'worktrees_cleanup'], ['result', 200]]);
    } finally { await f.close(); }
  });

  test.skipIf(process.platform === 'win32')('a GET completes while a cleanup child is held in Git', async () => {
    const hold = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-operator-cleanup-hold-')));
    const marker = join(hold, 'entered'), release = join(hold, 'release'), fakeGit = join(hold, 'git');
    const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    writeFileSync(fakeGit, `#!/bin/sh\n: > '${marker}'\nwhile [ ! -e '${release}' ]; do sleep 0.05; done\nexec '${realGit}' "$@"\n`);
    chmodSync(fakeGit, 0o755);
    const f = await cleanupServer({ REPO_HARNESS_GIT_BIN: fakeGit });
    try {
      let settled = false;
      const pending = f.post({ request_id: '123e4567-e89b-42d3-a456-426614174103', ids: [`wt_${'0'.repeat(64)}`], expected_digest: '0'.repeat(64) })
        .then(response => { settled = true; return response; });
      await waitFor(() => existsSync(marker), 'the cleanup child did not reach Git', 1_500);
      const started = Date.now();
      expect((await fetch(`${f.server.url}/healthz`)).status).toBe(200);
      expect((await fetch(`${f.server.url}/api/v1/worktrees`)).status).toBe(200);
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(settled).toBe(false);
      writeFileSync(release, '');
      const response = await pending;
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('digest_changed');
    } finally {
      writeFileSync(release, '');
      await f.close();
      rmSync(hold, { recursive: true, force: true });
    }
  });
});
