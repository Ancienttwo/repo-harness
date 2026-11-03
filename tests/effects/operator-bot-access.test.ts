import { describe, expect, test } from 'bun:test';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import {
  BOT_ACCESS_CWD,
  collectBotAccess,
  MCP_AUDIT_LOG_SEGMENTS,
  MCP_DOCTOR_ARGV,
  runBotAccessCommand,
  startBotAccessCollector,
  type BotAccessCommand,
} from '../../src/effects/operator/bot-access';
import type { NotifyCacheV1 } from '../../src/effects/operator/notify-collector';
import type { NotifyChannelDeliveryStatus } from '../../src/effects/operator/notify-status';
import { MCP_AUDIT_LOG_RELATIVE_PATH } from '../../src/cli/mcp/audit';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { decodeBotAccessSnapshot, projectMcpAuditEntry, projectMcpDoctor, type BotAccessSnapshotV1 } from '../../src/core/operator/bot-access';
import { botRegistryPath, registerBot } from '../../src/effects/bot-registry';
import { fakeHc } from '../helpers/fake-hc';

const NOW = new Date('2026-10-27T00:00:00.000Z');
const SLACK_URL = 'https://hooks.slack.example/services/T0/B0/webhook-secret-0006';
const LEAKS = [SLACK_URL, 'webhook-secret', 'https://', 'stderr-secret'];

const notifyStatus: NotifyChannelDeliveryStatus = {
  status: {
    protocol: 1, kind: 'operator_notify_status', plugin_id: 'aimpact.webhook-notify', linked: 'linked', enabled: 'enabled',
    config: { WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'configured', SLACK_WEBHOOK_URL: 'configured' },
    last_delivery: { at: '2026-10-26T00:00:00.000Z', result: 'succeeded' }, observed_at: NOW.toISOString(),
  },
  channels: { webhook: 'configured', slack: 'configured', discord: 'missing', telegram: 'missing' },
  deliveries: {
    webhook: { at: '2026-10-26T00:00:00.000Z', result: 'succeeded' }, slack: { at: '2026-10-25T00:00:00.000Z', result: 'failed' },
    discord: { at: null, result: 'missing' }, telegram: { at: null, result: 'missing' },
  },
};
const notifyOk = (): NotifyCacheV1 => ({ state: 'ok', value: notifyStatus });

/** The collector reads hc through a fake on PATH, so no test reaches a real core. */
function fixture() {
  const hc = fakeHc('rh-bot-access', 'demo-repo');
  const { root, repo } = hc;
  const home = hc.env.REPO_HARNESS_HOME!;
  mkdirSync(join(repo, '.ai', 'harness', 'mcp'), { recursive: true });
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 3, repos: [{
    id: repoHarnessRepoIdFor(repo), path: repo, accessMode: 'read_write', source: 'manual', registeredAt: NOW.toISOString(), lastSeenAt: NOW.toISOString(),
  }] }));
  writeFileSync(join(repo, MCP_AUDIT_LOG_RELATIVE_PATH), [
    { timestamp: '2026-10-25T00:00:00.000Z', tool: 'read_file', status: 'ok', actor: 'mcp:planner', relativePaths: ['docs/a.md'] },
    { timestamp: '2026-10-26T00:00:00.000Z', tool: 'write_plan', status: 'failed', actor: 'mcp:executor', botId: 'hermes', targetPath: join(repo, 'plans/x.md'), error: 'stderr-secret' },
  ].map(row => JSON.stringify(row)).join('\n') + '\n{"torn":');
  registerBot({ bot_id: 'hermes', name: 'Hermes', host: 'Hermes', slack_bot_id: 'B012ABC', herdr_agent: 'hermes', now: NOW }, { REPO_HARNESS_HOME: home });
  const env: NodeJS.ProcessEnv = { ...process.env, ...hc.env };
  return { root, home, repo, env, hc, cleanup: hc.cleanup };
}

function hcOk(snapshot: BotAccessSnapshotV1): Extract<BotAccessSnapshotV1['hc'], { state: 'ok' }> {
  if (snapshot.hc.state !== 'ok') throw new Error(`hc section ${snapshot.hc.reason}`);
  return snapshot.hc;
}

function doctorReport(root: string) {
  return {
    status: 'ready_user', repo: root,
    mcp: {
      packageVersion: '0.24.3', storageDir: join(root, 'home'), configVersion: 3, configVersionOk: true, localConfig: true,
      permissions: { fullDiskRead: false, allowedRootCount: 1, allowedRoots: [{ path: join(root, 'repos'), exists: true, readable: true }], unsafeAllowedRoots: [root], registeredRepoCount: 1, legacyFullDiskReadDetected: false },
      capabilities: { workspaceReader: true, workflowPlanner: true, workflowExecutor: false },
    },
  };
}

function recorder(responses: (file: string, args: readonly string[]) => ReturnType<BotAccessCommand>) {
  const calls: { file: string; args: readonly string[]; env: NodeJS.ProcessEnv; cwd: string }[] = [];
  const run: BotAccessCommand = (file, args, options) => { calls.push({ file, args, env: options.env, cwd: options.cwd }); return responses(file, args); };
  return { calls, run };
}

function expectNoLeak(snapshot: unknown, root: string) {
  const text = JSON.stringify(snapshot);
  for (const secret of LEAKS) expect(text).not.toContain(secret);
  expect(text).not.toContain(root);
  expect(text).not.toMatch(/"\/(?:Users|home|private|var|tmp)\//u);
}

describe('Bot access collector', () => {
  test('projects MCP, registry, audit, hc and notify without secrets, absolute paths or terminal text', async () => {
    const f = fixture();
    try {
      f.hc.setSnapshot(4, [
        { address: 't1b', name: 'task-7a3e9c1d5b2f4e6a8c90', status: { state: 'blocked', kind: 'permission', msg: 'cHJpdmF0ZQ==', title: 'private title' } },
        { address: 't12', name: 'task-1f0c2a9e4b7d3c5a8e61', status: { state: 'working', app: 'claude' } },
        { address: 't7', name: '/private/name', status: null },
      ]);
      const { calls, run } = recorder(async () => ({ ok: true, stdout: JSON.stringify(doctorReport(f.root)) }));
      const notifyCalls: unknown[] = [];
      const snapshot = await collectBotAccess({ env: f.env, now: () => NOW, run_command: run,
        read_notify: () => { notifyCalls.push('read'); return notifyOk(); } });

      expect(snapshot.mcp).toMatchObject({ state: 'ok', doctor: { status: 'ready_user', registered_repo_count: 1, allowed_root_count: 1, unsafe_allowed_root_count: 1 } });
      expect(snapshot.bots).toEqual({ state: 'ok', bots: [
        { bot_id: 'hermes', name: 'Hermes', host: 'Hermes', slack_bot_id: 'B012ABC', herdr_agent: 'hermes' },
      ] });
      expect(snapshot.registry).toEqual({ state: 'ok', authorization_revision: 3, registry_revision: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u), repos: [{
        repo_id: repoHarnessRepoIdFor(f.repo), label: 'demo-repo', access_mode: 'read_write',
        last_audit: { state: 'ok', entry: { at: '2026-10-26T00:00:00.000Z', tool: 'write_plan', status: 'failed', bot: { state: 'registered', bot_id: 'hermes' } } },
      }] });
      expect(snapshot.hc).toEqual({
        state: 'ok',
        version: { state: 'ok', value: { state: 'aligned', expected: { min_version: '0.1.17' }, actual: { version: '0.1.17' } } },
        herdr_app: { state: 'not_pinned' },
        terminals: { state: 'ok', value: [
          { address: 't12', name: 'task-1f0c2a9e4b7d3c5a8e61', status: 'working' },
          { address: 't1b', name: 'task-7a3e9c1d5b2f4e6a8c90', status: 'blocked' },
          { address: 't7', name: null, status: 'unknown' },
        ] },
      });
      expect(snapshot.notify).toEqual({ state: 'ok', ...notifyStatus });
      // One cache read per cycle; the notify probes belong to the notify collector.
      expect(notifyCalls).toEqual(['read']);
      expect(calls.some(call => call.args.includes('plugin'))).toBe(false);
      expectNoLeak(snapshot, f.root);
      expect(JSON.stringify(snapshot)).not.toMatch(/private|fixture-repo|screen|argv|cHJpdmF0ZQ/);
      expect(decodeBotAccessSnapshot(snapshot)).toEqual(snapshot);

      // The task-session label filters the snapshot, so no unlabeled terminal is read.
      expect(f.hc.argv()).toEqual(['server status --json', 'events --json --label repo-harness.role=task-session']);
      const doctor = calls.find(call => call.file === process.execPath)!;
      expect(doctor.args).toEqual([...MCP_DOCTOR_ARGV]);
    } finally { f.cleanup(); }
  });

  test('the doctor command never carries --live', async () => {
    expect(MCP_DOCTOR_ARGV.slice(1)).toEqual(['mcp', 'doctor', '--json']);
    expect(MCP_DOCTOR_ARGV).not.toContain('--live');
    const source = await Bun.file(new URL('../../src/effects/operator/bot-access.ts', import.meta.url)).text();
    expect(source).not.toMatch(/['"]--live['"]/u);
  });

  test('the real mcp doctor --json output projects without paths or endpoints, and the store stays unwritten', async () => {
    const f = fixture();
    try {
      // The doctor counts a repository with a policy as adopted; this case keeps the repository unadopted.
      f.hc.setPin(null);
      const before = readdirSync(f.home).sort();
      const result = await runBotAccessCommand(process.execPath, MCP_DOCTOR_ARGV, { cwd: BOT_ACCESS_CWD, env: { ...f.env, NO_COLOR: '1' }, timeout_ms: 60_000 });
      expect(result.ok).toBe(true);
      const doctor = projectMcpDoctor(JSON.parse((result as { stdout: string }).stdout));
      expect(doctor.status).toBe('not_adopted');
      expect(doctor.registered_repo_count).toBe(0);
      expectNoLeak(doctor, f.root);
      expect(readdirSync(f.home).sort()).toEqual(before);
    } finally { f.cleanup(); }
  }, 90_000);

  test('a core below the pin shows both versions and reads no terminal; a missing hc, a stopped core and a missing pin are named', async () => {
    const f = fixture();
    const collect = () => collectBotAccess({ env: f.env, now: () => NOW, run_command: async () => ({ ok: false, code: 'failed' }), read_notify: notifyOk });
    try {
      f.hc.setVersion('0.1.15');
      const mismatch = await collect();
      expect(mismatch.hc).toEqual({
        state: 'ok', version: { state: 'ok', value: { state: 'mismatch', expected: { min_version: '0.1.17' }, actual: { version: '0.1.15' } } },
        herdr_app: { state: 'not_pinned' }, terminals: { state: 'unavailable', reason: 'hc_version_mismatch' },
      });
      expect(f.hc.argv().some(line => line.startsWith('events'))).toBe(false);
      expect(decodeBotAccessSnapshot(mismatch)).toEqual(mismatch);

      f.hc.setVersion(null);
      expect((await collect()).hc).toEqual({ state: 'unavailable', reason: 'hc_unreachable' });
      f.hc.setVersion('0.1.17');
      const missing = await collectBotAccess({ env: { ...f.env, PATH: '/bin:/usr/bin' }, now: () => NOW, run_command: async () => ({ ok: false, code: 'failed' }), read_notify: notifyOk });
      // Only a fake hc is ever on PATH here; the system directories hold none.
      expect(missing.hc).toEqual({ state: 'unavailable', reason: 'hc_missing' });
      f.hc.failEvents(true);
      expect(hcOk(await collect()).terminals).toEqual({ state: 'unavailable', reason: 'hc_terminals_failed' });
      f.hc.setPin(null);
      const unpinned = await collect();
      expect(unpinned.hc).toEqual({ state: 'ok', version: { state: 'unavailable', reason: 'hc_pin_unavailable' }, herdr_app: { state: 'not_pinned' },
        terminals: { state: 'unavailable', reason: 'hc_pin_unavailable' } });
      expect(decodeBotAccessSnapshot(unpinned)).toEqual(unpinned);
    } finally { f.cleanup(); }
  });

  test('missing, unreadable and symlinked sources stay explicit and are never followed', async () => {
    const f = fixture();
    try {
      rmSync(join(f.repo, '.ai'), { recursive: true });
      mkdirSync(join(f.root, 'elsewhere', 'mcp'), { recursive: true });
      writeFileSync(join(f.root, 'elsewhere', 'mcp', 'audit.log'), JSON.stringify({ timestamp: '2026-10-26T00:00:00.000Z', tool: 'outside_tool', status: 'ok' }) + '\n');
      mkdirSync(join(f.repo, '.ai'));
      (await import('node:fs')).symlinkSync(join(f.root, 'elsewhere'), join(f.repo, '.ai', 'harness'));
      const { run } = recorder(async () => ({ ok: true, stdout: 'not json stderr-secret' }));
      const snapshot = await collectBotAccess({ env: f.env, now: () => NOW, run_command: run, read_notify: notifyOk });
      expect(snapshot.mcp).toEqual({ state: 'unavailable', reason: 'mcp_doctor_invalid' });
      expect(snapshot.registry.state === 'ok' && snapshot.registry.repos[0]!.last_audit).toEqual({ state: 'unavailable', reason: 'audit_unreadable' });
      expect(JSON.stringify(snapshot)).not.toContain('outside_tool');
      expectNoLeak(snapshot, f.root);

      writeFileSync(join(f.home, 'registered-repos.json'), '{"version":1}');
      const invalid = await collectBotAccess({ env: f.env, now: () => NOW, run_command: run, read_notify: notifyOk });
      expect(invalid.registry).toEqual({ state: 'unavailable', reason: 'registry_invalid' });
    } finally { f.cleanup(); }
  });

  test('the newest audit row comes from the newest archive segment when the active log has none', async () => {
    const f = fixture();
    try {
      const log = join(f.repo, MCP_AUDIT_LOG_RELATIVE_PATH);
      writeFileSync(log, '');
      mkdirSync(`${log}.archive`);
      writeFileSync(join(`${log}.archive`, '1700000000000-00000000-0000-4000-8000-000000000001.jsonl'), JSON.stringify({ timestamp: '2026-10-01T00:00:00.000Z', tool: 'old_tool', status: 'ok' }) + '\n');
      writeFileSync(join(`${log}.archive`, '1700000000001-00000000-0000-4000-8000-000000000002.jsonl'), JSON.stringify({ timestamp: '2026-10-02T00:00:00.000Z', tool: 'new_tool', status: 'blocked', actor: '/abs/actor', botId: 'ghost' }) + '\n');
      const { run } = recorder(async () => ({ ok: false, code: 'failed' }));
      const snapshot = await collectBotAccess({ env: f.env, now: () => NOW, run_command: run, read_notify: notifyOk });
      // A Bot id that is no longer registered shows as unregistered.
      expect(snapshot.registry.state === 'ok' && snapshot.registry.repos[0]!.last_audit).toEqual({ state: 'ok', entry: { at: '2026-10-02T00:00:00.000Z', tool: 'new_tool', status: 'blocked', bot: { state: 'unregistered' } } });
    } finally { f.cleanup(); }
  });

  test('an invalid Bot registry makes every attribution unavailable, never unregistered', async () => {
    const f = fixture();
    try {
      writeFileSync(join(botRegistryPath(f.env), 'broken.json'), '{"protocol":1');
      const { run } = recorder(async () => ({ ok: false, code: 'failed' }));
      const snapshot = await collectBotAccess({ env: f.env, now: () => NOW, run_command: run, read_notify: notifyOk });
      expect(snapshot.bots).toEqual({ state: 'unavailable', reason: 'bot_registry_invalid' });
      expect(snapshot.registry.state === 'ok' && snapshot.registry.repos[0]!.last_audit).toMatchObject({ state: 'ok', entry: { bot: { state: 'unavailable' } } });
      expectNoLeak(snapshot, f.root);
    } finally { f.cleanup(); }
  });

  test('the first cycle waits for the notify collector\'s first cycle, so it never caches notify as pending', async () => {
    const f = fixture();
    try {
      let notify: NotifyCacheV1 = { state: 'pending' };
      let release!: () => void;
      const notifyFirstCycle = new Promise<void>(resolve => { release = resolve; });
      let runs = 0;
      const handle = startBotAccessCollector({ env: f.env, now: () => NOW, interval_ms: 60_000, first_cycle_after: notifyFirstCycle,
        run_command: async () => { runs++; return { ok: false, code: 'failed' }; }, read_notify: () => notify });
      await Bun.sleep(20);
      expect(runs).toBe(0);
      expect(handle.read()).toEqual({ state: 'pending' });
      notify = notifyOk();
      release();
      await handle.settled();
      const cache = handle.read();
      expect(cache.state === 'ok' && cache.snapshot.notify.state).toBe('ok');
      await handle.close();

      // A notify first cycle that fails gives its reason, not pending, to the first snapshot.
      let failedRelease!: () => void;
      const failedFirstCycle = new Promise<void>(resolve => { failedRelease = resolve; });
      let failedNotify: NotifyCacheV1 = { state: 'pending' };
      const failing = startBotAccessCollector({ env: f.env, now: () => NOW, interval_ms: 60_000, first_cycle_after: failedFirstCycle,
        run_command: async () => ({ ok: false, code: 'failed' }), read_notify: () => failedNotify });
      failedNotify = { state: 'unavailable', reason: 'herdr_unavailable' };
      failedRelease();
      await failing.settled();
      const failed = failing.read();
      expect(failed.state === 'ok' && failed.snapshot.notify).toEqual({ state: 'unavailable', reason: 'herdr_unavailable' });
      await failing.close();
    } finally { f.cleanup(); }
  });

  test('the collector serves its cache and starts no work on read', async () => {
    const f = fixture();
    try {
      let runs = 0;
      const handle = startBotAccessCollector({ env: f.env, now: () => NOW, interval_ms: 60_000,
        run_command: async () => { runs++; return { ok: false, code: 'failed' }; }, read_notify: notifyOk });
      expect(handle.read()).toEqual({ state: 'pending' });
      await handle.settled();
      const first = handle.read();
      expect(first.state === 'ok' && first.snapshot.kind).toBe('operator_bot_access');
      handle.read(); handle.read();
      // One cycle runs one command, the doctor; hc goes through its own transport.
      expect(runs).toBe(1);
      await handle.close();
    } finally { f.cleanup(); }
  });

  test('the doctor runs in the file system root, never the server working directory', async () => {
    const f = fixture();
    const previous = process.cwd();
    try {
      process.chdir(f.repo);
      const { calls, run } = recorder(async () => ({ ok: false, code: 'failed' }));
      await collectBotAccess({ env: f.env, now: () => NOW, run_command: run, read_notify: notifyOk });
      expect(calls.map(call => call.file)).toEqual([process.execPath]);
      for (const call of calls) expect(call.cwd).toBe(BOT_ACCESS_CWD);
      expect(BOT_ACCESS_CWD).toBe(parse(process.cwd()).root);
    } finally {
      process.chdir(previous);
      f.cleanup();
    }
  });

  test('the decoder accepts every unavailable section and rejects an extra field, an absolute path or a bad state', async () => {
    const f = fixture();
    try {
      const unavailable = await collectBotAccess({ env: f.env, now: () => NOW,
        run_command: async () => ({ ok: false, code: 'failed' }), read_notify: () => ({ state: 'unavailable', reason: 'notify_config_unavailable' }) });
      expect(decodeBotAccessSnapshot(unavailable)).toEqual(unavailable);
      const pending = await collectBotAccess({ env: f.env, now: () => NOW,
        run_command: async () => ({ ok: false, code: 'failed' }), read_notify: () => ({ state: 'pending' }) });
      expect(pending.notify).toEqual({ state: 'unavailable', reason: 'notify_status_pending' });
      expect(decodeBotAccessSnapshot(pending)).toEqual(pending);
      const ok = await collectBotAccess({ env: f.env, now: () => NOW,
        run_command: async () => ({ ok: true, stdout: JSON.stringify(doctorReport(f.root)) }),
        read_notify: notifyOk });
      expect(ok.notify.state).toBe('ok');
      expect(decodeBotAccessSnapshot(ok)).toEqual(ok);
      const mutations: ((value: BotAccessSnapshotV1) => unknown)[] = [
        value => ({ ...value, extra: true }),
        value => ({ ...value, observed_at: 'yesterday' }),
        value => ({ ...value, registry: value.registry.state === 'ok' ? { ...value.registry, repos: [{ ...value.registry.repos[0]!, label: f.repo }] } : null }),
        value => ({ ...value, mcp: { state: 'unavailable', reason: 'stderr-secret' } }),
        // hc rows carry only an address, a name and a status word.
        value => ({ ...value, hc: value.hc.state === 'ok' ? { ...value.hc, terminals: { state: 'ok', value: [{ address: 't12', name: null, status: 'idle', cwd: '/private/x' }] } } : null }),
        value => ({ ...value, hc: value.hc.state === 'ok' ? { ...value.hc, terminals: { state: 'ok', value: [{ address: 'pane-1', name: null, status: 'idle' }] } } : null }),
        value => ({ ...value, hc: value.hc.state === 'ok' ? { ...value.hc, version: { state: 'ok', value: { state: 'aligned', expected: { min_version: '0.1.17' }, actual: { version: '/usr/bin/hc' } } } } : null }),
        value => ({ ...value, hc: value.hc.state === 'ok' ? { ...value.hc, herdr_app: { state: 'aligned' } } : null }),
        value => ({ ...value, protocol: 1 }),
        value => ({ ...value, notify: value.notify.state === 'ok' ? { ...value.notify, deliveries: { ...value.notify.deliveries, slack: { at: null, result: 'sent' } } } : null }),
        value => ({ ...value, notify: value.notify.state === 'ok' ? { ...value.notify, channels: { ...value.notify.channels, email: 'configured' } } : null }),
        // The notify status is checked in place: an extra key at any level or a path-shaped time never reaches the response.
        value => ({ ...value, notify: value.notify.state === 'ok' ? { ...value.notify, status: { ...value.notify.status, webhook_url: 'https://hooks.example/secret' } } : null }),
        value => ({ ...value, notify: value.notify.state === 'ok' ? { ...value.notify, status: { ...value.notify.status, config: { ...value.notify.status.config, EXTRA_URL: 'configured' } } } : null }),
        value => ({ ...value, notify: value.notify.state === 'ok' ? { ...value.notify, status: { ...value.notify.status, last_delivery: { ...value.notify.status.last_delivery, stderr: 'boom' } } } : null }),
        value => ({ ...value, notify: value.notify.state === 'ok' ? { ...value.notify, status: { ...value.notify.status, observed_at: '/Users/someone/.config' } } : null }),
        value => ({ ...value, notify: value.notify.state === 'ok' ? { ...value.notify, status: { ...value.notify.status, last_delivery: { at: '/var/log/notify', result: 'failed' } } } : null }),
      ];
      for (const mutate of mutations) expect(() => decodeBotAccessSnapshot(mutate(ok))).toThrow('bot access invalid');
    } finally { f.cleanup(); }
  });

  test('an audit row whose registry lookup failed is unavailable; a row without a Bot field is unregistered', () => {
    const directory = { state: 'ok' as const, bots: [{ bot_id: 'hermes', name: 'Hermes', host: 'Hermes', slack_bot_id: null, herdr_agent: null }] };
    const row = { timestamp: '2026-10-27T00:00:00.000Z', tool: 'read_file', status: 'ok' };
    expect(projectMcpAuditEntry({ ...row, botId: null, botLookup: 'unavailable' }, directory)?.bot).toEqual({ state: 'unavailable' });
    expect(projectMcpAuditEntry({ ...row, botId: null }, directory)?.bot).toEqual({ state: 'unregistered' });
    expect(projectMcpAuditEntry(row, directory)?.bot).toEqual({ state: 'unregistered' });
    expect(projectMcpAuditEntry({ ...row, botId: 'hermes' }, directory)?.bot).toEqual({ state: 'registered', bot_id: 'hermes' });
  });

  test('local constants match the writers they read after', async () => {
    expect(MCP_AUDIT_LOG_SEGMENTS.join('/')).toBe(MCP_AUDIT_LOG_RELATIVE_PATH);
  });
});
