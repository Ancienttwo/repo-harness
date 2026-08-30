import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { projectFleetBoardSnapshot } from '../../src/core/fleet/board';
import { TASK_MESSAGE_BODY_MAX_BYTES } from '../../src/core/fleet/task-message';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { engineerPrincipalAuthorization } from '../../src/effects/collaboration/actor';
import { publishWorkStateHandoff } from '../../src/effects/collaboration/handoff-store';
import { publishCoordinationSignal } from '../../src/effects/collaboration/signal-store';
import {
  OperatorCollaborationError,
  type ReadOperatorCollaborationSnapshotInput,
} from '../../src/effects/operator/collaboration';
import {
  OPERATOR_ROUTES,
  OPERATOR_TASK_MESSAGE_BODY_MAX_BYTES,
  startOperatorServer,
  type OperatorServerOptions,
} from '../../src/effects/operator/server';
import type { OperatorCollaborationSnapshotV1 } from '../../src/core/operator/collaboration-snapshot';
import type {
  SendOperatorTaskMessageInput,
  SendOperatorTaskMessageResult,
} from '../../src/effects/fleet/task-message-request';
import {
  buildOperatorCommand,
  parseOperatorServeOptions,
} from '../../src/cli/commands/operator';
import {
  createCollaborationFixture,
  removeFixtureRoots,
  type CollaborationFixture,
} from '../helpers/collaboration-store-fixture';

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

const fixtureRoots: string[] = [];
afterEach(() => removeFixtureRoots(fixtureRoots));

function collaborationPath(repositoryId: string): string {
  return `/api/v1/collaboration/${repositoryId}/snapshot`;
}

async function startCollaborationServer(
  read: OperatorServerOptions['read_collaboration_snapshot'],
  env?: NodeJS.ProcessEnv,
): Promise<WriteHarness> {
  const staticRoot = mkdtempSync(join(tmpdir(), 'repo-harness-operator-collab-'));
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
  const server = await startOperatorServer({
    port: 0,
    static_root: staticRoot,
    env,
    collect_fleet_board: async () => snapshot(),
    read_collaboration_snapshot: read,
  });
  return { server, calls: [], staticRoot };
}

/**
 * One real collaboration store behind the real read path.
 *
 * The redaction proof has to run against records the stores actually wrote:
 * asserting that a hand-built payload omits a repository root proves only that
 * the fixture author omitted it. Here the repository root is a real absolute
 * temp path, the handoff carries a `bound_task` context naming a Claim that
 * cannot prove, and the registry entry is the one the transport resolves.
 */
function collaborationFixtureRepository(): {
  readonly fixture: CollaborationFixture;
  readonly repository_id: string;
} {
  const fixture = createCollaborationFixture(process.cwd(), fixtureRoots, 'shadow', 'repo-harness-c8-collab');
  const repositoryId = repoHarnessRepoIdFor(fixture.repoRoot);
  const now = '2026-08-30T00:00:00.000Z';
  writeFileSync(
    join(fixture.home, 'registered-repos.json'),
    `${JSON.stringify({
      version: 1,
      authorizationRevision: 1,
      repos: [{
        id: repositoryId,
        path: fixture.repoRoot,
        accessMode: 'read_write',
        source: 'adopt',
        registeredAt: now,
        lastSeenAt: now,
      }],
    }, null, 2)}\n`,
  );
  const authorization = engineerPrincipalAuthorization(fixture.actors[0]!.authorization_id);
  publishCoordinationSignal({
    repo_root: fixture.repoRoot,
    authorization,
    destination: { kind: 'public' },
    idempotency_key: 'c8-signal',
    thread_key: 'capability.runtime-harness.collaboration',
    reply_to_signal_id: null,
    scope_refs: [{
      kind: 'capability',
      capability_id: 'capability.runtime-harness.collaboration',
      capability_revision: `sha256:${'7'.repeat(64)}`,
    }],
    labels: ['NEED-REPRO'],
    title: 'the second read disagreed with the first',
    body: 'body',
    artifact_refs: [],
    source_signal_ids: [],
    supersedes_signal_id: null,
    recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T09:00:00.000Z' },
    env: fixture.env,
  });
  publishWorkStateHandoff({
    repo_root: fixture.repoRoot,
    authorization,
    destination: { kind: 'public' },
    idempotency_key: 'c8-handoff',
    thread_key: 'capability.runtime-harness.collaboration',
    scope_refs: [{ kind: 'free_topic', value: 'capability.runtime-harness.collaboration' }],
    trigger: 'budget_low',
    goal: 'carry the torn read forward',
    completed: ['reproduced once'],
    key_findings: ['the loser reconciles'],
    attempted_paths: [{ description: 'raised the timeout', outcome: 'no change', evidence_refs: [] }],
    dead_ends: ['it is not the timeout'],
    open_hypotheses: ['the publish is not durable'],
    next_actions: ['instrument the link step'],
    source_signal_ids: [],
    // A Claim id no freeze receipt can produce. C6 withholds the whole branch on
    // read, so this value must not reach the browser under any framing.
    execution_context: FORGED_EXECUTION_CONTEXT,
    supersedes_handoff_id: null,
    recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T09:10:00.000Z' },
    env: fixture.env,
  });
  return { fixture, repository_id: repositoryId };
}

const FORGED_CLAIM_ID = '7c7c7c7c-7c7c-4c7c-8c7c-7c7c7c7c7c7c';
const FORGED_EXECUTION_CONTEXT = {
  kind: 'bound_task',
  task_id: 'c'.repeat(64),
  task_revision: 'd'.repeat(64),
  claim_id: FORGED_CLAIM_ID,
  lease_generation: 4242,
  work_envelope_sha256: `sha256:${'e'.repeat(64)}`,
  task_freeze_receipt_sha256: `sha256:${'f'.repeat(64)}`,
} as const;

function containsPrimitive(value: unknown, target: string | number): boolean {
  if (value === target) return true;
  if (Array.isArray(value)) return value.some((entry) => containsPrimitive(entry, target));
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .some((entry) => containsPrimitive(entry, target));
  }
  return false;
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
      expect(payload).toMatchObject({ protocol: 2, kind: 'operator_fleet_snapshot', sequence: 1 });
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

  // The program's standing browser boundary, asserted structurally and then
  // behaviourally. The inventory is what proves which routes exist; a live probe
  // can only prove how the routes that do exist behave.
  test('UX-operator-collaboration-v1-N1 keeps the task message the only write in the whole route inventory', async () => {
    const writes = OPERATOR_ROUTES.filter((route) => route.write);
    expect(writes.map((route) => route.id)).toEqual(['task_message']);
    expect(writes[0]!.method).toBe('POST');
    expect(OPERATOR_ROUTES.filter((route) => !route.write).map((route) => route.method))
      .toEqual(['GET', 'GET', 'GET', 'GET']);
    expect(OPERATOR_ROUTES.map((route) => route.id).sort()).toEqual([
      'collaboration_snapshot',
      'fleet_snapshot',
      'health',
      'static_asset',
      'task_message',
    ]);
    expect(OPERATOR_ROUTES.find((route) => route.id === 'collaboration_snapshot')?.write).toBe(false);

    const harness = await startCollaborationServer(() => { throw new Error('the read must not run for a POST'); });
    try {
      const posted = await fetch(`${harness.server.url}${collaborationPath('repo-collab')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: harness.server.url },
        body: JSON.stringify({ message_id: MESSAGE_ID, scope: 'task', body: 'ping' }),
      });
      expect(posted.status).toBe(405);
      expect(await posted.json()).toMatchObject({ error: { code: 'method_not_allowed' } });
    } finally {
      await stopWriteServer(harness);
    }
  });

  test('UX-operator-collaboration-v1-P1 serves the collaboration snapshot and fails closed with typed public errors', async () => {
    const projected: OperatorCollaborationSnapshotV1 = {
      protocol: 1,
      kind: 'operator_collaboration_snapshot',
      repository_id: 'repo-collab',
      mode: 'shadow',
      snapshot_consistency: 'degraded',
      degraded_sources: ['handoffs'],
      changed_sources: [],
      threads: [],
      signals: [],
      handoffs: [],
      participants: [],
      opportunities: [],
      unverified_execution_context_count: 0,
      source_snapshot_sha256: `sha256:${'a'.repeat(64)}`,
    };
    const seen: ReadOperatorCollaborationSnapshotInput[] = [];
    const harness = await startCollaborationServer((input) => {
      seen.push(input);
      if (input.repository_id === 'repo-missing') {
        throw new OperatorCollaborationError('repository_not_found', 'repository repo-missing is not registered');
      }
      if (input.repository_id === 'repo-broken') {
        throw new OperatorCollaborationError(
          'collaboration_snapshot_unavailable',
          'cannot read the collaboration store for repository repo-broken',
          new Error('ENOENT /private/var/folders/secret/signals'),
        );
      }
      return projected;
    });
    try {
      const ok = await fetch(`${harness.server.url}${collaborationPath('repo-collab')}`);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('cache-control')).toBe('no-store');
      // A degraded read stays a 200 carrying its own mark: the store answered,
      // and the incompleteness is a fact about the answer, not a failure to get
      // one. Only an unreadable signal set becomes a 503.
      expect(await ok.json()).toMatchObject({
        kind: 'operator_collaboration_snapshot',
        snapshot_consistency: 'degraded',
        degraded_sources: ['handoffs'],
      });

      const missing = await fetch(`${harness.server.url}${collaborationPath('repo-missing')}`);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({ error: { code: 'repository_not_found' } });

      const broken = await fetch(`${harness.server.url}${collaborationPath('repo-broken')}`);
      expect(broken.status).toBe(503);
      const brokenBody = await broken.json() as { error: { code: string; message: string } };
      expect(brokenBody.error.code).toBe('collaboration_snapshot_unavailable');
      expect(brokenBody.error.message).toBe('The collaboration store cannot be read.');
      // The typed code crosses; the provider diagnostic and its path do not.
      expect(JSON.stringify(brokenBody)).not.toContain('/private/var');
      expect(JSON.stringify(brokenBody)).not.toContain('ENOENT');

      const unknownApi = await fetch(`${harness.server.url}/api/v1/collaboration/repo-collab/threads`);
      expect(unknownApi.status).toBe(404);
      expect(await unknownApi.json()).toMatchObject({ error: { code: 'not_found' } });

      expect(seen.map((input) => input.repository_id)).toEqual(['repo-collab', 'repo-missing', 'repo-broken']);
    } finally {
      await stopWriteServer(harness);
    }
  });

  test('UX-operator-collaboration-v1-N2 redacts the served payload down to what a browser may hold', async () => {
    const { fixture, repository_id: repositoryId } = collaborationFixtureRepository();
    const harness = await startCollaborationServer(undefined, fixture.env);
    try {
      const response = await fetch(`${harness.server.url}${collaborationPath(repositoryId)}`);
      expect(response.status).toBe(200);
      const payload = await response.json() as OperatorCollaborationSnapshotV1;
      const serialized = JSON.stringify(payload);

      // The HTTP response is an external egress even though the route is read-only.
      // Pin both the document and the authority-bearing nested record so a future
      // spread cannot make a newly-added source field silently browser-visible.
      expect(Object.keys(payload).sort()).toEqual([
        'changed_sources', 'degraded_sources', 'handoffs', 'kind', 'mode',
        'opportunities', 'participants', 'protocol', 'repository_id', 'signals',
        'snapshot_consistency', 'source_snapshot_sha256', 'threads',
        'unverified_execution_context_count',
      ]);

      // What the panels need is present.
      expect(payload.repository_id).toBe(repositoryId);
      expect(payload.mode).toBe('shadow');
      expect(payload.snapshot_consistency).toBe('stable');
      expect(payload.threads.length).toBeGreaterThan(0);
      expect(payload.signals.map((signal) => signal.title))
        .toContain('the second read disagreed with the first');
      expect(payload.handoffs).toHaveLength(1);
      expect(Object.keys(payload.handoffs[0]!).sort()).toEqual([
        'actor_lineage', 'adoption_count', 'created_at', 'execution_context_kind',
        'goal', 'handoff_id', 'handoff_sha256', 'next_action_count',
        'open_hypothesis_count', 'thread_key', 'trigger',
      ]);
      expect(payload.handoffs[0]!.goal).toBe('carry the torn read forward');
      expect(payload.handoffs[0]!.adoption_count).toBe(0);
      expect(payload.participants.length).toBeGreaterThan(0);

      // The unproven bound_task context is withheld and counted, not flagged.
      expect(payload.handoffs[0]!.execution_context_kind).toBeNull();
      expect(payload.unverified_execution_context_count).toBe(1);
      for (const forgedValue of Object.values(FORGED_EXECUTION_CONTEXT)) {
        expect(containsPrimitive(payload, forgedValue)).toBe(false);
      }
      expect(serialized).not.toContain('lease_generation');
      expect(serialized).not.toContain('task_freeze_receipt_sha256');

      // No machine-local path of any kind.
      expect(serialized).not.toContain(fixture.repoRoot);
      expect(serialized).not.toContain(fixture.home);
      expect(serialized).not.toContain(tmpdir());
      expect(serialized).not.toContain('/Users/');
      expect(serialized).not.toContain('/private/');
      expect(serialized).not.toContain('repo_root');
      expect(serialized).not.toContain('sprint_path');

      // The offer list the board never asked for, and the digest of the document
      // that would have contained it.
      expect(serialized).not.toContain('execution_offers');
      expect(serialized).not.toContain('offer_revision');
      expect(payload).not.toHaveProperty('snapshot_sha256');
      expect(payload.source_snapshot_sha256).toMatch(/^sha256:[0-9a-f]{64}$/u);

      // A second read of an unchanged store is the same document.
      const repeated = await fetch(`${harness.server.url}${collaborationPath(repositoryId)}`);
      expect(JSON.stringify(await repeated.json())).toBe(serialized);
    } finally {
      await stopWriteServer(harness);
    }
  }, 60_000);

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
