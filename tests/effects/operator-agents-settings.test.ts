import { afterEach, describe, expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultRuntimes } from '@botiverse/oar';

import {
  decodeAgentsConfig,
  decodeAgentsSettings,
  type AgentRuntimeProbeV1,
  type AgentRuntimesCacheV1,
} from '../../src/core/operator/agents-settings';
import { decodeSeatsSettings } from '../../src/core/operator/seats-settings';
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

function post(harness: Harness, body: Record<string, unknown>, section: 'agents' | 'seats' = 'agents'): Promise<Response> {
  return fetch(`${harness.server.url}/api/v1/settings/${section}`, {
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
    // The launch allowlist is empty (#1234), so no runtime reports docs support.
    expect(value.runtimes.entries.filter(entry => entry.docs_supported).map(entry => entry.id)).toEqual([]);
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
      changes: [{ runtime: 'codex', enabled: true, uses: ['review'] }, { runtime: 'grok', enabled: true, uses: [] }],
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toEqual({
      config_revision: sha256(harness.configPath),
      changed_keys: ['agents.enabled', 'agents.uses.review'],
    });
    const stored = JSON.parse(readFileSync(harness.configPath, 'utf8'));
    expect(stored).toEqual({
      security: { mode: 'strict' }, brainRoot: '/srv/brain',
      agents: { enabled: ['codex', 'grok'], uses: { docs: [], review: ['codex'] }, default_docs: null },
    });
    expect((await settings(harness)).config.revision).toBe(result.config_revision);
    expect(existsSync(join(harness.home, '.repo-harness', 'operator'))).toBe(false);
    const audit = readFileSync(operatorAuditPath({ REPO_HARNESS_HOME: harness.harnessHome }), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(audit.map(record => [record.phase, record.operation ?? null, record.target ?? null])).toEqual([['intent', 'settings_agents', 'config'], ['result', null, null]]);

    const same = await post(harness, { expected_revision: result.config_revision, changes: [{ runtime: 'codex', enabled: true, uses: ['review'] }] });
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
      [{ changes: [{ runtime: 'claude', enabled: true, uses: ['docs'] }] }, 'docs_isolation_unverified'],
      [{ changes: [{ runtime: 'nope', enabled: true, uses: [] }] }, 'runtime_unknown'],
      [{ changes: [{ runtime: 'codex', enabled: false, uses: ['docs'] }] }, 'runtime_not_enabled'],
      // No runtime is a docs host now, so a default is refused before the default_docs_invalid relation check.
      [{ changes: [{ runtime: 'codex', enabled: true, uses: [] }], default_docs_runtime: 'codex' }, 'docs_isolation_unverified'],
    ] as const) {
      const response = await post(harness, { expected_revision: 'absent', ...body });
      expect([response.status, (await response.json()).error.code]).toEqual([422, code]);
    }
    expect(existsSync(harness.configPath)).toBe(false);
  });

  test('3-SET-N1 a docs use stored before the docs host closed stays and can be removed, but none is added and it cannot become the default', async () => {
    const harness = await startHarness({ agents: { enabled: ['claude', 'codex'], uses: { docs: ['claude', 'codex'], review: ['claude'] }, default_docs: 'codex' } });
    const before = await settings(harness);
    const keep = await post(harness, { expected_revision: before.config.revision, changes: [{ runtime: 'claude', enabled: true, uses: ['docs'] }] });
    expect(keep.status).toBe(200);
    const kept = await keep.json();
    expect(JSON.parse(readFileSync(harness.configPath, 'utf8')).agents.uses).toEqual({ docs: ['claude', 'codex'], review: [] });

    const unchanged = readFileSync(harness.configPath, 'utf8');
    const promote = await post(harness, { expected_revision: kept.config_revision, changes: [], default_docs_runtime: 'claude' });
    expect([promote.status, (await promote.json()).error.code]).toEqual([422, 'docs_isolation_unverified']);
    expect(readFileSync(harness.configPath, 'utf8')).toBe(unchanged);

    // Dropping the stored default's docs use leaves a reachable default_docs_invalid refusal.
    const orphan = await post(harness, { expected_revision: kept.config_revision, changes: [{ runtime: 'codex', enabled: true, uses: [] }] });
    expect([orphan.status, (await orphan.json()).error.code]).toEqual([422, 'default_docs_invalid']);
    expect(readFileSync(harness.configPath, 'utf8')).toBe(unchanged);

    const remove = await post(harness, { expected_revision: kept.config_revision, changes: [{ runtime: 'claude', enabled: true, uses: [] }] });
    expect(remove.status).toBe(200);
    const removed = await remove.json();
    expect(JSON.parse(readFileSync(harness.configPath, 'utf8')).agents.uses.docs).toEqual(['codex']);
    const readd = await post(harness, { expected_revision: removed.config_revision, changes: [{ runtime: 'claude', enabled: true, uses: ['docs'] }] });
    expect([readd.status, (await readd.json()).error.code]).toEqual([422, 'docs_isolation_unverified']);
  });

  test('a stored legacy docs use stays inert: an unrelated write succeeds, removal works, and a new docs use still refuses', async () => {
    const harness = await startHarness({ agents: { enabled: ['claude', 'codex'], uses: { docs: ['codex'], review: ['claude'] }, default_docs: 'codex' } });
    const before = await settings(harness);
    const stored = readFileSync(harness.configPath, 'utf8');

    // Re-sending the stored docs value is not a new docs use, so it writes nothing and does not throw.
    const unchanged = await post(harness, { expected_revision: before.config.revision, changes: [{ runtime: 'codex', enabled: true, uses: ['docs'] }] });
    expect(unchanged.status).toBe(200);
    expect((await unchanged.json()).changed_keys).toEqual([]);
    expect(readFileSync(harness.configPath, 'utf8')).toBe(stored);

    // An unrelated write on another runtime succeeds while the legacy docs use and default stay inert.
    const unrelated = await post(harness, { expected_revision: before.config.revision, changes: [{ runtime: 'grok', enabled: true, uses: [] }] });
    expect(unrelated.status).toBe(200);
    const unrelatedResult = await unrelated.json();
    expect(JSON.parse(readFileSync(harness.configPath, 'utf8')).agents).toEqual({
      enabled: ['claude', 'codex', 'grok'], uses: { docs: ['codex'], review: ['claude'] }, default_docs: 'codex',
    });

    // A new docs use still refuses.
    const enable = await post(harness, { expected_revision: unrelatedResult.config_revision, changes: [{ runtime: 'claude', enabled: true, uses: ['docs'] }] });
    expect([enable.status, (await enable.json()).error.code]).toEqual([422, 'docs_isolation_unverified']);

    // Removal of the stored docs use and its default stays allowed.
    const remove = await post(harness, { expected_revision: unrelatedResult.config_revision, changes: [{ runtime: 'codex', enabled: true, uses: [] }], default_docs_runtime: null });
    expect(remove.status).toBe(200);
    expect(JSON.parse(readFileSync(harness.configPath, 'utf8')).agents).toEqual({
      enabled: ['claude', 'codex', 'grok'], uses: { docs: [], review: ['claude'] }, default_docs: null,
    });
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

const PANE_AGENTS = { enabled: ['claude', 'codex', 'pi'], uses: { docs: [], review: [] }, default_docs: null };

async function seats(harness: Harness): Promise<ReturnType<typeof decodeSeatsSettings>> {
  const response = await fetch(`${harness.server.url}/api/v1/settings/seats`);
  expect(response.status).toBe(200);
  return decodeSeatsSettings(await response.json());
}

const filesUnder = (root: string): string[] => readdirSync(root, { recursive: true, encoding: 'utf8' }).sort();

describe('seat settings routes', () => {
  test('GET reads the defaults and the ranges from the fleet role profiles', async () => {
    const harness = await startHarness({ agents: PANE_AGENTS });
    const value = await seats(harness);
    expect(value.config.orchestrator).toEqual({ runtime: 'claude', model: 'opus', effort: 'high', tools: ['gh', 'mcp', 'net', 'read', 'shell', 'tasks'], fleet: [] });
    expect(value.config.advisor.fleet).toEqual(['deep-reasoner', 'explorer']);
    expect(value.ranges.seats.advisor.fleet).toEqual(['explorer', 'deep-reasoner', 'gatekeeper']);
    expect(value.ranges.seats.orchestrator.fleet).toEqual(['explorer', 'deep-reasoner', 'gatekeeper']);
    expect(value.ranges.seats.worker.fleet).not.toContain('orchestrator');
    // The core defaults stay inside the ranges that the fleet role profiles give.
    expect(value.defaults.worker.fleet).toEqual([...value.ranges.seats.worker.fleet].sort());
    expect(value.ranges.runtimes.map(runtime => [runtime.id, runtime.enabled, runtime.fleet])).toEqual([['claude', true, true], ['codex', true, true], ['pi', true, false]]);
  });

  test('POST replaces only the seats section and touches nothing outside config.json', async () => {
    const harness = await startHarness({ security: { mode: 'strict' }, agents: PANE_AGENTS });
    const before = await seats(harness);
    const { revision, ...section } = before.config;
    const homeFiles = filesUnder(harness.home);
    const response = await post(harness, { expected_revision: revision, seats: { ...section, worker: { ...section.worker, runtime: 'claude', model: 'sonnet' } } }, 'seats');
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toEqual({ config_revision: sha256(harness.configPath), changed_keys: ['seats.worker.runtime', 'seats.worker.model'] });
    const stored = JSON.parse(readFileSync(harness.configPath, 'utf8'));
    expect(stored).toEqual({ security: { mode: 'strict' }, agents: PANE_AGENTS, seats: { ...section, worker: { ...section.worker, runtime: 'claude', model: 'sonnet' } } });
    // Running panes are not touched: besides config.json, the write leaves only the shared transaction lock under HOME.
    expect(filesUnder(harness.home).filter(path => !path.startsWith('.repo-harness/transactions'))).toEqual(homeFiles);
  });

  test('refuses each seat rule with a typed 422 and writes nothing', async () => {
    const harness = await startHarness({ agents: { ...PANE_AGENTS, enabled: ['claude', 'pi'] } });
    const { revision, ...section } = (await seats(harness)).config;
    const claudeWorker = { ...section.worker, runtime: 'claude', model: 'opus' };
    const original = readFileSync(harness.configPath, 'utf8');
    for (const [seat, patch, code] of [
      ['advisor', { fleet: ['explorer', 'fast-worker'] }, 'seat_fleet_not_allowed'],
      ['advisor', { tools: ['edit', 'read'] }, 'seat_tool_not_allowed'],
      ['advisor', { tools: ['gh', 'read'] }, 'seat_tool_not_allowed'],
      ['orchestrator', { tools: ['edit', 'read'] }, 'seat_tool_not_allowed'],
      ['advisor', { runtime: 'pi', model: null, effort: null }, 'seat_fleet_not_allowed'],
      ['worker', { runtime: 'codex' }, 'seat_runtime_not_enabled'],
      ['advisor', { model: 'gpt-6-astra' }, 'seat_model_invalid'],
      ['advisor', { effort: 'extreme' }, 'seat_effort_invalid'],
    ] as const) {
      const seats = { ...section, worker: claudeWorker, [seat]: { ...(seat === 'worker' ? claudeWorker : section[seat]), ...patch } };
      const response = await post(harness, { expected_revision: revision, seats }, 'seats');
      expect([seat, response.status, (await response.json()).error.code]).toEqual([seat, 422, code]);
    }
    expect(readFileSync(harness.configPath, 'utf8')).toBe(original);
  });

  test('the orchestrator fleet takes the three read-only roles and refuses every writer', async () => {
    const harness = await startHarness({ agents: PANE_AGENTS });
    const { revision, ...section } = (await seats(harness)).config;
    // The refused rows come first: a refusal writes nothing, so the revision stays valid for the accepted row.
    for (const [fleet, status] of [
      [['fast-worker'], 422],
      [['deep-worker'], 422],
      [['harness-evaluator'], 422],
      [['root-cause-prover'], 422],
      [['deep-reasoner', 'explorer', 'gatekeeper'], 200],
    ] as const) {
      const response = await post(harness, { expected_revision: revision, seats: { ...section, orchestrator: { ...section.orchestrator, fleet } } }, 'seats');
      const body = await response.json();
      expect([fleet, response.status, status === 422 ? body.error.code : body.changed_keys])
        .toEqual([fleet, status, status === 422 ? 'seat_fleet_not_allowed' : ['seats.orchestrator.fleet']]);
    }
  });

  test('a stale revision and a reused request_id with another body get 409', async () => {
    const harness = await startHarness({ agents: PANE_AGENTS });
    const { revision, ...section } = (await seats(harness)).config;
    const send = (requestId: string, effort: string) => fetch(`${harness.server.url}/api/v1/settings/seats`, {
      method: 'POST',
      headers: { Origin: harness.server.url, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: harness.cookie },
      body: JSON.stringify({ request_id: requestId, expected_revision: revision, seats: { ...section, orchestrator: { ...section.orchestrator, effort } } }),
    });
    const requestId = randomUUID();
    expect((await send(requestId, 'xhigh')).status).toBe(200);
    const saved = readFileSync(harness.configPath, 'utf8');
    const mismatch = await send(requestId, 'low');
    expect([mismatch.status, (await mismatch.json()).error.code]).toEqual([409, 'request_mismatch']);
    const stale = await send(randomUUID(), 'low');
    expect([stale.status, (await stale.json()).error.code]).toEqual([409, 'revision_conflict']);
    expect(readFileSync(harness.configPath, 'utf8')).toBe(saved);
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

  test('missing Cursor SDK skips its lazy installation probe', async () => {
    let called = false;
    const probe = await probeAgentRuntimes({
      runtimes: [],
      host_dependencies: [{ id: 'cursor', package: '@cursor/sdk', installation: async () => {
        called = true;
        throw new Error('optional SDK must stay unloaded');
      } }],
      package_resolves: () => false,
    });
    expect(called).toBe(false);
    expect(probe.entries).toEqual([{ id: 'cursor', group: 'host_dependency',
      installation: { kind: 'dependency_missing', package: '@cursor/sdk' } }]);
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
