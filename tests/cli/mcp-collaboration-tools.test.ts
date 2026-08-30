/**
 * C7 — the Engineer MCP collaboration tool set.
 *
 * Acceptance for sprint row C7, tool half: the profile inventory is exact and
 * carries no arbitrary file write, generic shell, task acquire/release,
 * publication, acceptance or merge surface; the author of every published record
 * is derived server-side from the authenticated authorization and a
 * caller-supplied one is refused rather than dropped; every mutation fails closed
 * while `collaboration.mode` is off, and reads keep working so the flag stays
 * observable; a posted signal reads back through the exchange; and every payload
 * carries the frozen untrusted-coordination marking.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'fs';
import { join } from 'path';

import { COLLABORATION_CONTEXT_WARNING } from '../../src/core/collaboration/context-packet';
import { collaborationActorLineage } from '../../src/core/collaboration/common';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { buildMcpToolDefinitions, callMcpTool } from '../../src/cli/mcp/tools';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import {
  createCollaborationFixture,
  removeFixtureRoots,
  type CollaborationFixture,
} from '../helpers/collaboration-store-fixture';

const sourceRoot = process.cwd();
const roots: string[] = [];
const CAPABILITY_REF = {
  kind: 'capability',
  capability_id: 'capability.runtime-harness.collaboration',
  capability_revision: `sha256:${'7'.repeat(64)}`,
} as const;

afterEach(() => {
  delete process.env.REPO_HARNESS_HOME;
  removeFixtureRoots(roots);
});

/**
 * A collaboration fixture that the scheduling plane will also answer for.
 *
 * `collectCollaborativeWorkExchange()` requires the caller to supply the
 * scheduling plane's own offer answer, so the exchange surface asks
 * `collectEngineerOffers()` — which refuses a repository that is not a registered
 * read_write target. Registering it here is what makes that ask answerable; the
 * repository carries no work graph, so the honest answer is an empty offer list
 * rather than a defaulted one.
 */
function fixture(mode: string | null = 'shadow'): CollaborationFixture {
  const value = createCollaborationFixture(sourceRoot, roots, mode, 'repo-harness-c7-mcp');
  writeFileSync(join(value.home, 'registered-repos.json'), `${JSON.stringify({
    version: 1,
    authorizationRevision: 1,
    repos: [{
      id: repoHarnessRepoIdFor(value.repoRoot),
      path: value.repoRoot,
      accessMode: 'read_write',
      source: 'manual',
      registeredAt: '2026-08-30T00:00:00.000Z',
      lastSeenAt: '2026-08-30T00:00:00.000Z',
    }],
  })}\n`);
  process.env.REPO_HARNESS_HOME = value.home;
  return value;
}

function context(value: CollaborationFixture, actorIndex = 0) {
  return {
    repoRoot: value.repoRoot,
    policy: getMcpPolicy('engineer'),
    engineerAuthorizationId: value.actors[actorIndex]!.authorization_id,
  };
}

function signalArgs(key: string, threadKey: string): Record<string, unknown> {
  return {
    idempotency_key: key,
    thread_key: threadKey,
    reply_to_signal_id: null,
    scope_refs: [CAPABILITY_REF],
    labels: ['NEED-REPRO'],
    title: `observation ${key}`,
    body: `body for ${key}`,
    artifact_refs: [],
    source_signal_ids: [],
    supersedes_signal_id: null,
  };
}

function handoffArgs(key: string, threadKey: string): Record<string, unknown> {
  return {
    idempotency_key: key,
    thread_key: threadKey,
    scope_refs: [CAPABILITY_REF],
    trigger: 'context_pressure',
    goal: `carry ${key} forward`,
    completed: ['read the collector'],
    key_findings: ['the double read is the only consistency authority'],
    attempted_paths: [{ description: 'single read', outcome: 'cannot see a torn read', evidence_refs: [] }],
    dead_ends: ['per-source windows'],
    open_hypotheses: ['the offer reader is the next bottleneck'],
    next_actions: ['wire the fence'],
    source_signal_ids: [],
    execution_context: { kind: 'none' },
    supersedes_handoff_id: null,
  };
}

function structured(result: { structuredContent?: unknown }): Record<string, unknown> {
  return result.structuredContent as Record<string, unknown>;
}

describe('C7 Engineer MCP collaboration tools', () => {
  test('the profile inventory is exact and exposes no authority surface', () => {
    const names = buildMcpToolDefinitions(getMcpPolicy('engineer'), { enableChatgptBrowser: true })
      .map((tool) => tool.name)
      .filter((name) => name.startsWith('collaboration_'));

    expect(names).toEqual([
      'collaboration_exchange',
      'collaboration_threads',
      'collaboration_packet',
      'collaboration_signal_post',
      'collaboration_handoff_publish',
      'collaboration_handoff_adopt',
    ]);
    // Arbitrary file write, generic shell, task acquire/release, publication,
    // acceptance and merge are absent by name, and composing a packet into a
    // delegated run's goal stays a Host act on the CLI.
    for (const forbidden of [
      'collaboration_write', 'collaboration_read_file', 'collaboration_shell', 'collaboration_exec',
      'collaboration_acquire', 'collaboration_release', 'collaboration_publication',
      'collaboration_acceptance', 'collaboration_merge', 'collaboration_packet_build',
      'collaboration_dispatch',
    ]) {
      expect(names).not.toContain(forbidden);
    }
    expect(names.some((name) =>
      /(?:^|_)(shell|exec|read|write|file|merge|fleet|publication|acceptance|acquire|release|dispatch|browser|agent)(?:_|$)/u
        .test(name))).toBe(false);
    // Every mutation is append-only; nothing on this profile is destructive.
    for (const tool of buildMcpToolDefinitions(getMcpPolicy('engineer'))
      .filter((entry) => entry.name.startsWith('collaboration_'))) {
      expect(tool.annotations).toMatchObject({ destructiveHint: false, openWorldHint: false });
      expect((tool.inputSchema as Record<string, unknown>).additionalProperties).toBe(false);
    }
  });

  test('a posted signal carries the authenticated author and reads back through the exchange', async () => {
    const value = fixture();
    const ctx = context(value);

    const posted = await callMcpTool(ctx, 'collaboration_signal_post', signalArgs('signal-a', 'merge-gate-flake'));
    expect(posted.isError).toBeUndefined();
    const signal = structured(posted).signal as Record<string, unknown>;
    const actor = signal.actor as Record<string, unknown>;
    expect(actor.kind).toBe('module_engineer');
    expect(actor.engineer_id).toBe(value.actors[0]!.engineer_id);

    const exchange = await callMcpTool(ctx, 'collaboration_exchange', {});
    expect(exchange.isError).toBeUndefined();
    const snapshot = structured(exchange).snapshot as Record<string, unknown>;
    const relevant = snapshot.relevant_signals as Array<Record<string, unknown>>;
    expect(relevant.map((entry) => entry.signal_id)).toContain(signal.signal_id);
    expect(relevant.find((entry) => entry.signal_id === signal.signal_id)!.actor_lineage)
      .toBe(collaborationActorLineage(actor as never));

    const threads = await callMcpTool(ctx, 'collaboration_threads', {});
    expect((structured(threads).threads as Array<Record<string, unknown>>).map((entry) => entry.thread_key))
      .toContain('merge-gate-flake');
  });

  test('a second Engineer posting the same thread is a distinct author, and no caller can declare one', async () => {
    const value = fixture();
    const first = await callMcpTool(context(value, 0), 'collaboration_signal_post', signalArgs('signal-a', 'archctx-drain'));
    const second = await callMcpTool(context(value, 1), 'collaboration_signal_post', signalArgs('signal-b', 'archctx-drain'));
    const firstActor = (structured(first).signal as Record<string, unknown>).actor as Record<string, unknown>;
    const secondActor = (structured(second).signal as Record<string, unknown>).actor as Record<string, unknown>;
    expect(firstActor.engineer_id).not.toBe(secondActor.engineer_id);

    // The identity claim has nowhere to land: an undeclared key is refused at the
    // boundary rather than dropped on the way to a surface with no field for it.
    for (const forged of ['actor', 'engineer_id', 'destination', 'recorded_time', 'authorization_id']) {
      const refused = await callMcpTool(context(value, 1), 'collaboration_signal_post', {
        ...signalArgs('signal-c', 'archctx-drain'),
        [forged]: forged === 'actor' ? firstActor : 'forged',
      });
      expect(refused.isError).toBe(true);
      const error = (structured(refused).error as Record<string, unknown>);
      expect(error.code).toBe('INVALID_ARGUMENT');
      expect(String(error.message)).toContain(forged);
    }

    // And the record the second Engineer did publish still names the second
    // Engineer, so the refusal is not the only thing standing in the way.
    expect(secondActor.engineer_id).toBe(value.actors[1]!.engineer_id);
  });

  test('every mutation fails closed while collaboration.mode is off, and reads keep the flag observable', async () => {
    const value = fixture(null);
    const ctx = context(value);

    for (const [name, args] of [
      ['collaboration_signal_post', signalArgs('signal-a', 'merge-gate-flake')],
      ['collaboration_handoff_publish', handoffArgs('handoff-a', 'merge-gate-flake')],
      ['collaboration_handoff_adopt', { handoff_id: 'a'.repeat(64), context_packet_sha256: `sha256:${'b'.repeat(64)}` }],
    ] as const) {
      const refused = await callMcpTool(ctx, name, args as Record<string, unknown>);
      expect(refused.isError).toBe(true);
      expect((structured(refused).error as Record<string, unknown>).code).toBe('collaboration_disabled');
    }

    const exchange = await callMcpTool(ctx, 'collaboration_exchange', {});
    expect(exchange.isError).toBeUndefined();
    expect(structured(exchange).mode).toBe('off');
  });

  test('a handoff publishes, adopts non-exclusively, and every payload carries the untrusted marking', async () => {
    const value = fixture();
    const published = await callMcpTool(context(value), 'collaboration_handoff_publish', handoffArgs('handoff-a', 'merge-gate-flake'));
    expect(published.isError).toBeUndefined();
    const handoff = structured(published).handoff as Record<string, unknown>;

    const adopt = { handoff_id: handoff.handoff_id as string, context_packet_sha256: `sha256:${'c'.repeat(64)}` };
    const firstAdoption = await callMcpTool(context(value, 1), 'collaboration_handoff_adopt', adopt);
    const secondAdoption = await callMcpTool(context(value, 2), 'collaboration_handoff_adopt', adopt);
    expect(firstAdoption.isError).toBeUndefined();
    expect(secondAdoption.isError).toBeUndefined();
    expect(structured(firstAdoption).receipt_id).not.toBe(structured(secondAdoption).receipt_id);

    const packetless = await callMcpTool(context(value), 'collaboration_packet', {
      packet_sha256: `sha256:${'d'.repeat(64)}`,
    });
    expect(packetless.isError).toBe(true);
    expect((structured(packetless).error as Record<string, unknown>).code).toBe('collaboration_unavailable');

    for (const result of [published, firstAdoption,
      await callMcpTool(context(value), 'collaboration_exchange', {}),
      await callMcpTool(context(value), 'collaboration_threads', {})]) {
      expect(structured(result).content_trust).toEqual({
        kind: 'untrusted_coordination_context',
        warning: COLLABORATION_CONTEXT_WARNING,
      });
    }
  });

  test('an unauthenticated session cannot reach any collaboration tool', async () => {
    const value = fixture();
    const anonymous = { repoRoot: value.repoRoot, policy: getMcpPolicy('engineer') };
    const refused = await callMcpTool(anonymous, 'collaboration_exchange', {});
    expect(refused.isError).toBe(true);
    expect((structured(refused).error as Record<string, unknown>).code).toBe('ENGINEER_AUTHORIZATION_MISSING');
  });
});
