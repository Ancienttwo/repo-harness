import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { HcPinUnavailableError, HcVersionMismatchError, hcVersionCheck } from '../../src/core/operator/herdr-pin';
import { createHerdrCoreRuntimeTransport, readHcPin } from '../../src/effects/operator/herdr-runtime-transport';
import { configureRuntimeSource } from '../../src/effects/operator/runtime-source';
import { createRuntimeStatusObserver } from '../../src/effects/operator/runtime-status';
import { decodeRuntimeConfig, startRuntimeService } from '../../src/effects/operator/runtime-service';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { startOperatorServer } from '../../src/effects/operator/server';
import { parseOperatorServeOptions } from '../../src/cli/commands/operator';
import type { RuntimeIdentity } from '../../src/core/operator/runtime-status';
import { fakeHc } from '../helpers/fake-hc';

const hash = (value: string) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const terminal = { address: 't12', name: 'task-1f0c2a9e4b7d3c5a8e61', status: { state: 'working', app: 'claude', msg: 'private message' } };
const identity: RuntimeIdentity = { source_host: 'fixture', repository_id: hash('repository'), task: 'task-1', role: 'implementer', round: 1,
  pipeline_state_version: 7, request_id: 'request-1', context_sha256: hash('context'), runtime_session: 'runtime-1', attempt: 1,
  generation: 'intent-1', source_epoch: 0, hc_core: 'core-1', terminal_id: terminal.address };

async function until(check: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 600; i++) { if (await check()) return; await Bun.sleep(5); }
  throw new Error('fixture signal deadline');
}
async function observerFor(f: ReturnType<typeof fakeHc>, bindings: RuntimeIdentity[] = [identity]) {
  const owner = createHerdrCoreRuntimeTransport('fixture', f.env);
  const source = await configureRuntimeSource({ source_host: 'fixture', deadline_ms: 2000, transport: owner.transport,
    bindings: async epoch => bindings.map(b => ({ ...b, source_epoch: epoch })) });
  const observer = createRuntimeStatusObserver(source); await observer.start();
  return { observer, owner, close: () => { observer.stop(); owner.close(); } };
}

describe('herdr-core runtime observation', () => {
  test('one labeled event stream invalidates; each snapshot is a fresh labeled snapshot; no cwd, title or text', async () => {
    const f = fakeHc('hc-runtime'); f.setSnapshot(5, [terminal]);
    let owner: Awaited<ReturnType<typeof observerFor>> | null = null;
    try {
      owner = await observerFor(f);
      expect(owner.observer.read()).toMatchObject({ status: 'ready', badges: [{ state: 'working', source: 'hc-status', revision: 5 }] });
      const argv = f.argv();
      expect(argv[0]).toBe('server status --json');
      // Every stream and snapshot carries the task-session label, so no unlabeled terminal is read.
      expect(argv.filter(line => line.startsWith('events'))).toEqual(argv.filter(line => line === 'events --json --label repo-harness.role=task-session'));
      expect(argv.filter(line => line.startsWith('events')).length).toBeGreaterThan(1);
      expect(JSON.stringify(owner.observer.read())).not.toMatch(/private|fixture-repo|title|screen|argv/);
      f.setSnapshot(6, [{ ...terminal, status: { state: 'blocked', kind: 'permission' } }]);
      f.event(6, terminal.address, 'status', { records: {}, reported: true, status: { state: 'blocked', kind: 'permission' } });
      await until(() => owner!.observer.read().badges[0]?.state === 'blocked');
      expect(owner.observer.read().badges[0]).toMatchObject({ revision: 6, reason: 'unknown' });
      // A terminal without a status report is unknown, never idle.
      f.setSnapshot(7, [{ ...terminal, status: null }]); f.event(7, terminal.address, 'status', { records: {}, reported: true, status: null });
      await until(() => owner!.observer.read().badges[0]?.state === 'unknown');
    } finally { owner?.close(); f.cleanup(); }
  });

  test('a core below the pin fails with both versions; a missing pin and an unreachable core fail closed', async () => {
    expect(hcVersionCheck('0.1.17', '0.1.17')).toEqual({ state: 'aligned', expected: { min_version: '0.1.17' }, actual: { version: '0.1.17' } });
    expect(hcVersionCheck('0.1.20', '0.1.17').state).toBe('aligned');
    expect(hcVersionCheck('0.1.9', '0.1.17')).toEqual({ state: 'mismatch', expected: { min_version: '0.1.17' }, actual: { version: '0.1.9' } });
    const f = fakeHc('hc-runtime-version');
    try {
      const capabilities = () => createHerdrCoreRuntimeTransport('fixture', f.env).transport.capabilities(new AbortController().signal).then(() => null, (error: unknown) => error);
      f.setVersion('0.1.15');
      const mismatch = await capabilities();
      expect(mismatch).toBeInstanceOf(HcVersionMismatchError);
      expect((mismatch as HcVersionMismatchError).check).toEqual({ state: 'mismatch', expected: { min_version: '0.1.17' }, actual: { version: '0.1.15' } });
      expect(f.argv().some(line => line.startsWith('events'))).toBe(false);
      f.setVersion(null);
      expect(await capabilities()).toMatchObject({ name: 'HerdrCoreError', reason: 'failed' });
      f.setPin(null);
      expect(await capabilities()).toBeInstanceOf(HcPinUnavailableError);
    } finally { f.cleanup(); }
  });

  test('the highest pin over the registered repository policies wins; an unreadable policy pins nothing', () => {
    const f = fakeHc('hc-runtime-pin');
    try {
      expect(readHcPin(f.env)).toBe('0.1.17');
      // A second registered repository with a lower pin: the higher pin wins in either registry order.
      const lower = join(f.root, 'repos', 'lower'), registry = join(f.env.REPO_HARNESS_HOME!, 'registered-repos.json');
      mkdirSync(join(lower, '.ai', 'harness'), { recursive: true });
      writeFileSync(join(lower, '.ai', 'harness', 'policy.json'), JSON.stringify({ external_tooling: { herdr_core: { min_version: '0.1.9' } } }));
      const list = JSON.parse(readFileSync(registry, 'utf8'));
      const entry = { ...list.repos[0], id: repoHarnessRepoIdFor(lower), path: lower };
      for (const repos of [[...list.repos, entry], [entry, ...list.repos]]) {
        writeFileSync(registry, JSON.stringify({ ...list, repos }));
        expect(readHcPin(f.env)).toBe('0.1.17');
      }
      writeFileSync(registry, JSON.stringify(list));
      writeFileSync(join(f.repo, '.ai', 'harness', 'policy.json'), '{"external_tooling":');
      expect(readHcPin(f.env)).toBeNull();
      f.setPin('0.1.9');
      expect(readHcPin(f.env)).toBe('0.1.9');
      expect(readHcPin({ ...f.env, REPO_HARNESS_HOME: join(f.root, 'missing') })).toBeNull();
    } finally { f.cleanup(); }
  });

  test('a broken stream reconnects through the version check; a mismatch on reconnect reaches the overlay and recovery clears it', async () => {
    const f = fakeHc('hc-runtime-reconnect'); f.setSnapshot(3, [terminal]);
    const owner = await observerFor(f);
    try {
      const epoch = owner.observer.read().source_epoch;
      f.setVersion('0.1.15'); f.emit('not json');
      await until(() => owner.observer.read().reason?.code === 'hc_version_mismatch');
      expect(owner.observer.read()).toMatchObject({ status: 'unavailable', reason: { code: 'hc_version_mismatch', expected: { min_version: '0.1.17' }, actual: { version: '0.1.15' } } });
      expect(JSON.stringify(owner.observer.read())).not.toMatch(/private|message|stack/);
      f.setVersion('0.1.17');
      await until(() => owner.observer.read().status === 'ready');
      expect(owner.observer.read()).toMatchObject({ reason: null, badges: [{ state: 'working' }] });
      expect(owner.observer.read().source_epoch).toBeGreaterThan(epoch);
    } finally { owner.close(); f.cleanup(); }
  }, 10_000);

  test('missed events advance the source epoch; another terminal on the core stays unclaimed', async () => {
    const f = fakeHc('hc-runtime-missed'); f.setSnapshot(3, [terminal]);
    const owner = await observerFor(f);
    try {
      const before = owner.observer.read().source_epoch;
      f.setSnapshot(9, [{ ...terminal, address: 't1b' }]);
      f.emit({ jsonrpc: '2.0', method: 'missed', params: { seq: 9, terminals: [] } });
      await until(() => owner.observer.read().source_epoch > before && owner.observer.read().status === 'ready');
      expect(owner.observer.read()).toMatchObject({ badges: [], unclaimed: 1 });
    } finally { owner.close(); f.cleanup(); }
  });

  test('a new core after a core wipe makes the service rebuild its source on the next refresh', async () => {
    const f = fakeHc('hc-runtime-wipe'); f.setSnapshot(2, [terminal]);
    const path = join(f.root, 'runtime.json');
    writeFileSync(path, JSON.stringify({ protocol: 'repo-harness.runtime-config.v2', kind: 'herdr-core', source_host: 'fixture', deadline_ms: 2000 }));
    const service = await startRuntimeService(path, f.env);
    const statusReads = () => f.argv().filter(line => line === 'server status --json').length;
    try {
      expect(service.read()).toMatchObject({ status: 'ready', unclaimed: 1 });
      const before = statusReads();
      f.setVersion('0.1.17', 'core-2'); f.setSnapshot(1, [terminal, { ...terminal, address: 't1b' }]); f.emit('not json');
      // The reconnect opens its stream only after it has identified the new core.
      await until(() => f.argv().slice(-1)[0]?.startsWith('events') === true && statusReads() > before);
      await service.refresh();
      expect(service.read()).toMatchObject({ status: 'ready', reason: null, unclaimed: 2 });
    } finally { service.close(); f.cleanup(); }
  }, 10_000);

  test('explicit service config connects before GET; an endpoint field is refused', async () => {
    const f = fakeHc('hc-runtime-service'); f.setSnapshot(2, [terminal]);
    const config = { protocol: 'repo-harness.runtime-config.v2', kind: 'herdr-core', source_host: 'fixture', deadline_ms: 2000 };
    const path = join(f.root, 'runtime.json'); writeFileSync(path, JSON.stringify(config));
    const server = await startOperatorServer({ port: 0, runtime_status_config: path, env: f.env });
    try {
      const before = f.argv().length;
      const response = await fetch(`${server.url}/api/v1/runtime/status`), body = await response.json();
      expect(body).toMatchObject({ projection_version: 'repo-harness.runtime-overlay.v7', status: 'ready', unclaimed: 1, badges: [] });
      expect(f.argv().length).toBe(before); expect(JSON.stringify(body)).not.toContain('/private/');
      expect(parseOperatorServeOptions({ runtimeStatusConfig: path }).runtime_status_config).toBe(path);
      expect(() => parseOperatorServeOptions({ runtimeStatusConfig: 'relative.json' })).toThrow();
      expect(() => decodeRuntimeConfig({ ...config, socket_path: '/tmp/x.sock' })).toThrow('runtime_config_invalid');
    } finally { await server.close(); f.cleanup(); }
  });
});
