import { afterEach, describe, expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultRuntimes } from '@botiverse/oar';

import {
  decodeAgentsConfig,
  decodeAgentsSettings,
  type AgentRuntimeProbeV1,
  type AgentRuntimesCacheV1,
} from '../../src/core/operator/agents-settings';
import { probeAgentRuntimes, registryRuntimes } from '../../src/effects/setup/agent-runtime-probe';
import { startOperatorServer, type OperatorServerHandle } from '../../src/effects/operator/server';
import { acquireRuntimeTransactionLock, globalRuntimeScope } from '../../src/effects/locking/runtime-transaction-lock';
import { operatorAuditPath } from '../../src/effects/operator/write-audit';

const PROBE: AgentRuntimeProbeV1 = {
  protocol: 1,
  kind: 'agent_runtime_probe',
  collected_at: '2026-10-27T00:00:00.000Z',
  entries: [
    { id: 'claude', group: 'default', installation: { kind: 'available', via: 'executable', version: '2.1.0' } },
    { id: 'codex', group: 'default', installation: { kind: 'available', via: 'executable', version: 'codex-cli 0.164.0' } },
    { id: 'grok', group: 'default', installation: { kind: 'not_found' } },
    { id: 'morph', group: 'community', installation: { kind: 'not_found' } },
    { id: 'cursor', group: 'host_dependency', installation: { kind: 'dependency_missing', package: '@cursor/sdk' } },
  ],
};

interface Harness {
  readonly server: OperatorServerHandle;
  readonly home: string;
  readonly harnessHome: string;
  readonly configPath: string;
  readonly cookie: string;
  cache: AgentRuntimesCacheV1;
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** HOME and REPO_HARNESS_HOME are separate temporary roots, so each authority is checked at its own place. */
async function startHarness(config?: unknown): Promise<Harness> {
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-agents-home-'));
  const harnessHome = mkdtempSync(join(tmpdir(), 'repo-harness-agents-state-'));
  const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-agents-ui-'));
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
  const configPath = join(home, '.repo-harness', 'config.json');
  if (config !== undefined) {
    mkdirSync(join(home, '.repo-harness'), { recursive: true });
    writeFileSync(configPath, typeof config === 'string' ? config : `${JSON.stringify(config, null, 2)}\n`);
  }
  const state: { cache: AgentRuntimesCacheV1 } = { cache: { status: 'ready', probe: PROBE } };
  const server = await startOperatorServer({
    port: 0, static_root: staticRoot,
    env: { HOME: home, REPO_HARNESS_HOME: harnessHome },
    read_agent_runtimes: () => state.cache,
  });
  const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
  cleanups.push(async () => {
    await server.close();
    for (const path of [home, harnessHome, staticRoot]) rmSync(path, { recursive: true, force: true });
  });
  return Object.defineProperty({ server, home, harnessHome, configPath, cookie } as Harness, 'cache', {
    get: () => state.cache, set: (value: AgentRuntimesCacheV1) => { state.cache = value; },
  });
}

function post(harness: Harness, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${harness.server.url}/api/v1/settings/agents`, {
    method: 'POST',
    headers: { Origin: harness.server.url, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: harness.cookie },
    body: JSON.stringify({ request_id: randomUUID(), ...body }),
  });
}

async function settings(harness: Harness): Promise<ReturnType<typeof decodeAgentsSettings>> {
  const response = await fetch(`${harness.server.url}/api/v1/settings/agents`);
  expect(response.status).toBe(200);
  return decodeAgentsSettings(await response.json());
}

const sha256 = (path: string) => `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;

describe('agent settings routes', () => {
  test('Pi review fixture is admitted through the settings route and named in unsupported-runtime guidance', async () => {
    const harness = await startHarness();
    harness.cache = { status: 'ready', probe: { ...PROBE, entries: [...PROBE.entries,
      { id: 'pi', group: 'default', installation: { kind: 'available', via: 'bundled', version: null } }] } };
    const before = await settings(harness);
    expect(before.runtimes.entries.find(entry => entry.id === 'pi')?.review_supported).toBe(true);
    const response = await post(harness, { expected_revision: before.config.revision,
      changes: [{ runtime: 'pi', enabled: true, uses: ['review'] }] });
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect((await settings(harness)).config.uses.review).toEqual(['pi']);
    expect(JSON.parse(readFileSync(harness.configPath, 'utf8')).agents.uses.review).toEqual(['pi']);
    const invalid = await post(harness, { expected_revision: saved.config_revision,
      changes: [{ runtime: 'grok', enabled: true, uses: ['review'] }] });
    expect(invalid.status).toBe(422);
    const error = (await invalid.json()).error;
    expect(error.message).toContain('pi'); expect(error.next_action).toContain('pi');
  });

  test('GET reads the absent section and the probe cache without command paths', async () => {
    const harness = await startHarness();
    const value = await settings(harness);
    expect(value.config).toEqual({ revision: 'absent', enabled: [], uses: { docs: [], review: [] }, default_docs: null });
    expect(value.runtimes).toMatchObject({ status: 'ready', reason: null, collected_at: PROBE.collected_at });
    expect(value.runtimes.entries.map(entry => [entry.id, entry.review_supported])).toEqual([
      ['claude', true], ['codex', true], ['grok', false], ['morph', false], ['cursor', false],
    ]);
    expect(value.runtimes.entries[0]!.capabilities).toEqual({ stop: 'available', steer: 'session', withdraw: 'session' });
    expect((await fetch(`${harness.server.url}/api/v1/settings/agents?x=1`)).status).toBe(400);
    expect((await fetch(`${harness.server.url}/api/v1/settings/agents`, { method: 'PUT' })).status).toBe(405);

    harness.cache = { status: 'unavailable', reason: 'collection_pending' };
    expect((await settings(harness)).runtimes).toEqual({ status: 'unavailable', reason: 'collection_pending', collected_at: null, entries: [] });
  });

  test('POST writes only the agents section, under HOME, with an audit under REPO_HARNESS_HOME', async () => {
    const harness = await startHarness({ security: { mode: 'strict' }, brainRoot: '/srv/brain' });
    const before = await settings(harness);
    const response = await post(harness, {
      expected_revision: before.config.revision,
      changes: [{ runtime: 'codex', enabled: true, uses: ['docs', 'review'] }, { runtime: 'grok', enabled: true, uses: ['docs'] }],
      default_docs_runtime: 'codex',
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toEqual({
      config_revision: sha256(harness.configPath),
      changed_keys: ['agents.enabled', 'agents.uses.docs', 'agents.uses.review', 'agents.default_docs'],
    });
    const stored = JSON.parse(readFileSync(harness.configPath, 'utf8'));
    expect(stored).toEqual({
      security: { mode: 'strict' }, brainRoot: '/srv/brain',
      agents: { enabled: ['codex', 'grok'], uses: { docs: ['codex', 'grok'], review: ['codex'] }, default_docs: 'codex' },
    });
    expect((await settings(harness)).config.revision).toBe(result.config_revision);
    expect(existsSync(join(harness.home, '.repo-harness', 'operator'))).toBe(false);
    const audit = readFileSync(operatorAuditPath({ REPO_HARNESS_HOME: harness.harnessHome }), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(audit.map(record => [record.phase, record.operation ?? null, record.target ?? null])).toEqual([['intent', 'settings_agents', 'config'], ['result', null, null]]);

    const same = await post(harness, { expected_revision: result.config_revision, changes: [{ runtime: 'codex', enabled: true, uses: ['docs', 'review'] }] });
    expect(await same.json()).toEqual({ config_revision: result.config_revision, changed_keys: [] });
  });

  test('an active installer transaction returns 503 busy without changing settings', async () => {
    const harness = await startHarness({ security: { mode: 'strict' } });
    const before = await settings(harness);
    const original = readFileSync(harness.configPath, 'utf8');
    const lock = acquireRuntimeTransactionLock(globalRuntimeScope({ HOME: harness.home }));
    try {
      const response = await post(harness, { expected_revision: before.config.revision, changes: [{ runtime: 'codex', enabled: true, uses: [] }] });
      expect([response.status, (await response.json()).error.code]).toEqual([503, 'busy']);
      expect(readFileSync(harness.configPath, 'utf8')).toBe(original);
      lock.assertOwned();
    } finally { lock.release(); }
    const retry = await post(harness, { expected_revision: before.config.revision, changes: [{ runtime: 'codex', enabled: true, uses: [] }] });
    expect(retry.status).toBe(200);
    expect(JSON.parse(readFileSync(harness.configPath, 'utf8'))).toMatchObject({ security: { mode: 'strict' }, agents: { enabled: ['codex'] } });
  });

  test('a stale revision gets 409 revision_conflict and leaves the file unchanged', async () => {
    const harness = await startHarness({ agents: { enabled: ['claude'], uses: { docs: [], review: [] }, default_docs: null } });
    const read = (await settings(harness)).config.revision;
    writeFileSync(harness.configPath, `${JSON.stringify({ agents: { enabled: ['claude', 'codex'], uses: { docs: [], review: [] }, default_docs: null } })}\n`);
    const changed = readFileSync(harness.configPath, 'utf8');
    const response = await post(harness, { expected_revision: read, changes: [{ runtime: 'grok', enabled: true, uses: [] }] });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: 'revision_conflict' });
    expect(readFileSync(harness.configPath, 'utf8')).toBe(changed);
  });

  test('refuses an invalid change with a typed 422 and writes nothing', async () => {
    const harness = await startHarness();
    for (const [body, code] of [
      [{ changes: [{ runtime: 'grok', enabled: true, uses: ['review'] }] }, 'use_not_supported'],
      [{ changes: [{ runtime: 'nope', enabled: true, uses: [] }] }, 'runtime_unknown'],
      [{ changes: [{ runtime: 'codex', enabled: false, uses: ['docs'] }] }, 'runtime_not_enabled'],
      [{ changes: [{ runtime: 'codex', enabled: true, uses: [] }], default_docs_runtime: 'codex' }, 'default_docs_invalid'],
    ] as const) {
      const response = await post(harness, { expected_revision: 'absent', ...body });
      expect([response.status, (await response.json()).error.code]).toEqual([422, code]);
    }
    expect(existsSync(harness.configPath)).toBe(false);
  });

  test('refuses an unknown field, a missing probe, an invalid section and a linked file', async () => {
    const harness = await startHarness();
    const extra = await post(harness, { expected_revision: 'absent', changes: [], launch: true });
    expect([extra.status, (await extra.json()).error.code]).toEqual([400, 'invalid_body']);

    harness.cache = { status: 'unavailable', reason: 'probe_timeout' };
    const pending = await post(harness, { expected_revision: 'absent', changes: [{ runtime: 'codex', enabled: true, uses: [] }] });
    expect([pending.status, (await pending.json()).error.code]).toEqual([503, 'runtimes_unavailable']);
    expect(existsSync(harness.configPath)).toBe(false);

    const invalid = await startHarness({ agents: { enabled: ['codex'], uses: { docs: ['grok'], review: [] }, default_docs: null } });
    const get = await fetch(`${invalid.server.url}/api/v1/settings/agents`);
    expect([get.status, (await get.json()).error.code]).toEqual([503, 'config_invalid']);

    const linked = await startHarness();
    const target = join(linked.home, 'elsewhere.json');
    writeFileSync(target, '{}\n');
    mkdirSync(join(linked.home, '.repo-harness'), { recursive: true });
    symlinkSync(target, linked.configPath);
    const revision = (await settings(linked)).config.revision;
    const refused = await post(linked, { expected_revision: revision, changes: [{ runtime: 'codex', enabled: true, uses: [] }] });
    const linkError = (await refused.json()).error;
    expect([refused.status, linkError.code]).toEqual([409, 'config_is_link']);
    expect(linkError.next_action).toContain('links to');
    expect(readFileSync(target, 'utf8')).toBe('{}\n');
  });

  test('disables a runtime that left the registry, and still refuses to enable it', async () => {
    const harness = await startHarness({ agents: { enabled: ['codex', 'gone'], uses: { docs: ['gone'], review: [] }, default_docs: 'gone' } });
    const revision = (await settings(harness)).config.revision;
    const enable = await post(harness, { expected_revision: revision, changes: [{ runtime: 'gone', enabled: true, uses: ['docs'] }] });
    expect([enable.status, (await enable.json()).error.code]).toEqual([422, 'runtime_unknown']);

    const disable = await post(harness, { expected_revision: revision, changes: [{ runtime: 'gone', enabled: false, uses: [] }], default_docs_runtime: null });
    expect(disable.status).toBe(200);
    expect((await disable.json()).changed_keys).toEqual(['agents.enabled', 'agents.uses.docs', 'agents.default_docs']);
    expect(JSON.parse(readFileSync(harness.configPath, 'utf8')).agents).toEqual({ enabled: ['codex'], uses: { docs: [], review: [] }, default_docs: null });
  });
});

describe('agents config decoder', () => {
  test('requires sorted distinct ids, uses within enabled, and a docs default', () => {
    expect(decodeAgentsConfig({ enabled: ['claude', 'codex'], uses: { docs: ['codex'], review: ['claude'] }, default_docs: 'codex' }))
      .toEqual({ enabled: ['claude', 'codex'], uses: { docs: ['codex'], review: ['claude'] }, default_docs: 'codex' });
    for (const value of [
      { enabled: ['codex', 'claude'], uses: { docs: [], review: [] }, default_docs: null },
      { enabled: ['codex', 'codex'], uses: { docs: [], review: [] }, default_docs: null },
      { enabled: [], uses: { docs: ['codex'], review: [] }, default_docs: null },
      { enabled: ['codex'], uses: { docs: [], review: [] }, default_docs: 'codex' },
      { enabled: ['Codex'], uses: { docs: [], review: [] }, default_docs: null },
      { enabled: [], uses: { docs: [], review: [] }, default_docs: null, extra: 1 },
    ]) expect(() => decodeAgentsConfig(value)).toThrow('agents_config_invalid');
  });
});

describe('agent runtime probe', () => {
  test('keeps the default probe ids in OAR registry order', () => {
    expect(registryRuntimes().filter(runtime => runtime.group === 'default').map(runtime => runtime.id))
      .toEqual(defaultRuntimes.list().map(runtime => runtime.id));
  });

  test('publishes no command path, redacts reasons and bounds every probe', async () => {
    const probe = await probeAgentRuntimes({
      runtimes: [
        { id: 'claude', group: 'default', installation: async () => ({ kind: 'available', via: 'executable', command: '/Users/someone/.local/bin/claude', version: '2.1.0', shadowed: ['/usr/local/bin/claude'] }) },
        { id: 'kimi', group: 'default', installation: async () => ({ kind: 'unsupported', reason: 'needs /Users/someone/.kimi/config' }) },
        { id: 'grok', group: 'default', installation: async () => { throw new Error('/Users/someone/secret'); } },
        { id: 'opencode', group: 'default', installation: () => new Promise(() => {}) },
        { id: 'morph', group: 'community' },
      ],
      host_dependencies: [
        { id: 'cursor', package: '@cursor/sdk', installation: async () => ({ kind: 'available', via: 'bundled' }) },
        { id: 'pi-durable', package: '@earendil-works/pi-durable', installation: null },
        { id: 'missing', package: '@example/absent', installation: null },
      ],
      package_resolves: name => name !== '@example/absent',
      timeout_ms: 20,
      now: () => Date.parse('2026-10-27T00:00:00.000Z'),
    });
    expect(probe.entries).toEqual([
      { id: 'claude', group: 'default', installation: { kind: 'available', via: 'executable', version: '2.1.0' } },
      { id: 'kimi', group: 'default', installation: { kind: 'unsupported', reason: 'needs [private path]' } },
      { id: 'grok', group: 'default', installation: { kind: 'probe_failed' } },
      { id: 'opencode', group: 'default', installation: { kind: 'probe_failed' } },
      { id: 'morph', group: 'community', installation: { kind: 'probe_failed' } },
      { id: 'cursor', group: 'host_dependency', installation: { kind: 'available', via: 'bundled', version: null } },
      { id: 'pi-durable', group: 'host_dependency', installation: { kind: 'host_setup_required' } },
      { id: 'missing', group: 'host_dependency', installation: { kind: 'dependency_missing', package: '@example/absent' } },
    ]);
    expect(JSON.stringify(probe)).not.toContain('/Users/');
  });
});
