import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { projectFleetBoardSnapshot } from '../../src/core/fleet/board';
import { TASK_MESSAGE_BODY_MAX_BYTES } from '../../src/core/fleet/task-message';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import {
  OPERATOR_TASK_MESSAGE_BODY_MAX_BYTES,
  startOperatorServer,
  type OperatorServerOptions,
} from '../../src/effects/operator/server';
import type {
  SendOperatorTaskMessageInput,
  SendOperatorTaskMessageResult,
} from '../../src/effects/fleet/task-message-request';
import {
  buildOperatorCommand,
  parseOperatorServeOptions,
} from '../../src/cli/commands/operator';

function snapshot() {
  return projectFleetBoardSnapshot({
    registry_revision: 'sha256:registry',
    sequence: 1,
    observed_at: '2026-08-24T01:03:00.000Z',
    repositories: [],
  });
}

const TASK_ID = 'a'.repeat(64);
const MESSAGE_ID = '123e4567-e89b-42d3-a456-426614174011';

function messagePath(repositoryId: string, taskId = TASK_ID): string {
  return `/api/v1/fleet/tasks/${repositoryId}/${taskId}/messages`;
}

interface WriteHarness {
  readonly server: Awaited<ReturnType<typeof startOperatorServer>>;
  readonly calls: SendOperatorTaskMessageInput[];
  readonly staticRoot: string;
}

async function startWriteServer(
  send: OperatorServerOptions['send_task_message'],
  calls: SendOperatorTaskMessageInput[],
  env?: NodeJS.ProcessEnv,
): Promise<WriteHarness> {
  const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-write-'));
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
  const server = await startOperatorServer({
    port: 0,
    static_root: staticRoot,
    env,
    collect_fleet_board: async () => snapshot(),
    send_task_message: send === undefined ? undefined : (input) => {
      calls.push(input);
      return send(input);
    },
  });
  return { server, calls, staticRoot };
}

async function stopWriteServer(harness: WriteHarness): Promise<void> {
  await harness.server.close();
  rmSync(harness.staticRoot, { recursive: true, force: true });
}

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

function sendResult(overrides: Partial<SendOperatorTaskMessageResult> = {}): SendOperatorTaskMessageResult {
  return {
    repository_id: 'repo-write',
    task_id: TASK_ID,
    message_id: MESSAGE_ID,
    scope: 'task',
    target_claim_id: null,
    target_generation: null,
    created: true,
    ...overrides,
  };
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
    const collect = async () => {
      collectCalls += 1;
      await Bun.sleep(10);
      return snapshot();
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
      expect(payload).toMatchObject({ protocol: 3, kind: 'operator_fleet_snapshot', sequence: 1 });
      expect(JSON.stringify(payload)).not.toContain('repo_root');

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

  test('UX-operator-task-message-v1-N1 refuses a write without a matching Origin and refuses POST elsewhere', async () => {
    const calls: SendOperatorTaskMessageInput[] = [];
    const harness = await startWriteServer(async () => sendResult(), calls);
    const url = `${harness.server.url}${messagePath('repo-write')}`;
    const payload = JSON.stringify({ message_id: MESSAGE_ID, scope: 'task', body: 'ping' });
    try {
      const missingOrigin = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      expect(missingOrigin.status).toBe(403);
      expect(await missingOrigin.json()).toMatchObject({ error: { code: 'origin_required' } });

      const foreignOrigin = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://attacker.example' },
        body: payload,
      });
      expect(foreignOrigin.status).toBe(403);
      expect(await foreignOrigin.json()).toMatchObject({ error: { code: 'origin_not_allowed' } });

      const foreignHost = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: harness.server.url, Host: 'attacker.example' },
        body: payload,
      });
      expect(foreignHost.status).toBe(421);

      const elsewhere = await fetch(`${harness.server.url}/api/v1/fleet/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: harness.server.url },
        body: payload,
      });
      expect(elsewhere.status).toBe(405);
      expect(await elsewhere.json()).toMatchObject({ error: { code: 'method_not_allowed' } });

      const readTheWriteRoute = await fetch(url, { headers: { Origin: harness.server.url } });
      expect(readTheWriteRoute.status).toBe(405);

      const stillReadable = await fetch(`${harness.server.url}/api/v1/fleet/snapshot`);
      expect(stillReadable.status).toBe(200);
      expect(await stillReadable.json()).toMatchObject({ kind: 'operator_fleet_snapshot' });

      expect(calls).toEqual([]);
    } finally {
      await stopWriteServer(harness);
    }
  });

  test('UX-operator-task-message-v1-N2 mirrors the protocol body limit and rejects malformed requests', async () => {
    const calls: SendOperatorTaskMessageInput[] = [];
    const harness = await startWriteServer(async () => sendResult(), calls);
    const url = `${harness.server.url}${messagePath('repo-write')}`;
    const headers = { 'Content-Type': 'application/json', Origin: harness.server.url };
    try {
      expect(OPERATOR_TASK_MESSAGE_BODY_MAX_BYTES).toBe(TASK_MESSAGE_BODY_MAX_BYTES);

      const oversized = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message_id: MESSAGE_ID,
          scope: 'task',
          body: 'x'.repeat(TASK_MESSAGE_BODY_MAX_BYTES + 1),
        }),
      });
      expect(oversized.status).toBe(413);
      expect(await oversized.json()).toMatchObject({ error: { code: 'task_message_body_too_large' } });

      const huge = await fetch(url, {
        method: 'POST',
        headers,
        body: 'x'.repeat(TASK_MESSAGE_BODY_MAX_BYTES * 4 + 1),
      });
      expect(huge.status).toBe(413);

      for (const body of [
        'not json',
        JSON.stringify({ message_id: MESSAGE_ID, scope: 'task' }),
        JSON.stringify({ message_id: MESSAGE_ID, scope: 'task', body: 'ping', audience: 'owner' }),
        JSON.stringify({ message_id: MESSAGE_ID, scope: 'orchestrator', body: 'ping' }),
        JSON.stringify({ message_id: '', scope: 'task', body: 'ping' }),
        JSON.stringify({ message_id: MESSAGE_ID, scope: 'task', body: 7 }),
      ]) {
        const response = await fetch(url, { method: 'POST', headers, body });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: 'invalid_request' } });
      }

      expect(calls).toEqual([]);
    } finally {
      await stopWriteServer(harness);
    }
  });

  test('UX-operator-task-message-v1-P1 resolves the repository through the registry and fails closed on read_only', async () => {
    const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-operator-repo-')));
    const registry = registryHome([{ path: repoRoot, accessMode: 'read_only' }]);
    const harness = await startWriteServer(undefined, [], registry.env);
    const headers = { 'Content-Type': 'application/json', Origin: harness.server.url };
    const payload = JSON.stringify({ message_id: MESSAGE_ID, scope: 'task', body: 'ping' });
    try {
      const readOnly = await fetch(`${harness.server.url}${messagePath(registry.ids[0]!)}`, {
        method: 'POST',
        headers,
        body: payload,
      });
      expect(readOnly.status).toBe(403);
      const readOnlyBody = await readOnly.json() as { error: { code: string; message: string; next_action: string } };
      expect(readOnlyBody.error.code).toBe('repository_read_only');
      expect(readOnlyBody.error.next_action.length).toBeGreaterThan(0);
      expect(JSON.stringify(readOnlyBody)).not.toContain(repoRoot);

      const unknown = await fetch(`${harness.server.url}${messagePath('repo_0000000000000000')}`, {
        method: 'POST',
        headers,
        body: payload,
      });
      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toMatchObject({ error: { code: 'repository_not_found' } });
    } finally {
      await stopWriteServer(harness);
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(registry.home, { recursive: true, force: true });
    }
  });

  test('UX-operator-task-message-v1-P2 hands a valid write to the effect and passes typed failures through', async () => {
    const calls: SendOperatorTaskMessageInput[] = [];
    let behavior: 'created' | 'replay' | 'claim_mismatch' = 'created';
    const { OperatorTaskMessageError } = await import('../../src/effects/fleet/task-message-request');
    const harness = await startWriteServer(
      async (input) => {
        if (behavior === 'claim_mismatch') {
          throw new OperatorTaskMessageError('claim_mismatch', `task ${input.task_id} owner moved`);
        }
        return sendResult({ scope: input.scope, created: behavior === 'created' });
      },
      calls,
    );
    const url = `${harness.server.url}${messagePath('repo-write')}`;
    const headers = { 'Content-Type': 'application/json', Origin: harness.server.url };
    try {
      const created = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message_id: MESSAGE_ID, scope: 'claim', body: 'look at the base branch' }),
      });
      expect(created.status).toBe(201);
      expect(await created.json()).toMatchObject({ ok: true, created: true, scope: 'claim', task_id: TASK_ID });
      expect(calls.length).toBe(1);
      expect(calls[0]).toMatchObject({
        repository_id: 'repo-write',
        task_id: TASK_ID,
        message_id: MESSAGE_ID,
        scope: 'claim',
        body: 'look at the base branch',
      });

      behavior = 'replay';
      const replay = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message_id: MESSAGE_ID, scope: 'claim', body: 'look at the base branch' }),
      });
      expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({ ok: true, created: false });

      behavior = 'claim_mismatch';
      const conflict = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message_id: MESSAGE_ID, scope: 'claim', body: 'look at the base branch' }),
      });
      expect(conflict.status).toBe(409);
      const conflictBody = await conflict.json() as { error: { code: string; message: string } };
      expect(conflictBody.error.code).toBe('claim_mismatch');
      expect(conflictBody.error.message).toBe('The task owner changed while the message was being sent.');
      expect(JSON.stringify(conflictBody)).not.toContain('owner moved');
    } finally {
      await stopWriteServer(harness);
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
});
