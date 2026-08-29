/**
 * C3 — the append-only `WorkStateHandoffV1` store.
 *
 * Acceptance for sprint row C3: a persisted handoff carries attempted paths,
 * dead ends, findings and next actions; the actor and the recorded time are
 * Host-derived and retry-stable; a revision appends rather than edits; and
 * publishing knowledge moves no delivery-plane byte.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join, relative } from 'path';

import { CollaborationError } from '../../src/core/collaboration/common';
import { deriveWorkStateHandoffId } from '../../src/core/collaboration/handoff';
import { engineerPrincipalAuthorization } from '../../src/effects/collaboration/actor';
import { readCollaborationMode } from '../../src/effects/collaboration/feature-flag';
import {
  COLLABORATION_HANDOFFS_RELATIVE_ROOT,
  listWorkStateHandoffs,
  publishWorkStateHandoff,
  readWorkStateHandoff,
  type PublishWorkStateHandoffInput,
} from '../../src/effects/collaboration/handoff-store';
import { publishCoordinationSignal } from '../../src/effects/collaboration/signal-store';
import { collaborationStagingName } from '../../src/effects/collaboration/record-store';
import { readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { readEngineerPrincipalMapping } from '../../src/effects/engineers/principal-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import {
  CONTRACT_ENGINEER,
  createCollaborationFixture,
  deliveryPlaneDigest,
  removeFixtureRoots,
  type CollaborationFixture as Fixture,
} from '../helpers/collaboration-store-fixture';

const sourceRoot = process.cwd();
const roots: string[] = [];

afterEach(() => {
  removeFixtureRoots(roots);
});

function fixture(mode: string | null = 'shadow'): Fixture {
  return createCollaborationFixture(sourceRoot, roots, mode, 'repo-harness-c3-handoff');
}

function handoffsRoot(repoRoot: string): string {
  return join(realpathSync(resolveGitCommonDirectory(repoRoot)), COLLABORATION_HANDOFFS_RELATIVE_ROOT);
}

export function publishInput(
  value: Fixture,
  overrides: Partial<PublishWorkStateHandoffInput> = {},
): PublishWorkStateHandoffInput {
  return {
    repo_root: value.repoRoot,
    authorization: engineerPrincipalAuthorization(value.actors[0]!.authorization_id),
    idempotency_key: 'handoff-1',
    thread_key: 'merge-gate-flake',
    scope_refs: [{ kind: 'free_topic', value: 'merge gate flake' }],
    trigger: 'budget_low',
    goal: 'find why the fourth writer never observes the published token',
    completed: ['reproduced the failure under four concurrent writers'],
    key_findings: ['the loser reconciles, so the writer count is not the cause'],
    attempted_paths: [{
      description: 'raised the lock timeout to 30s',
      outcome: 'no change; the fourth writer still misses the token',
      evidence_refs: [],
    }],
    dead_ends: ['lock timeout tuning'],
    open_hypotheses: ['the publication fence, not the writer count'],
    next_actions: ['instrument the fence between link and fsync'],
    source_signal_ids: [],
    execution_context: { kind: 'none' },
    supersedes_handoff_id: null,
    recorded_time: { kind: 'first_publication' },
    now: () => '2026-08-30T12:00:00.000Z',
    env: value.env,
    ...overrides,
  };
}

export function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof CollaborationError) return error.code;
    return `other:${(error as { code?: string }).code ?? (error as Error).message}`;
  }
  return 'no-error';
}

describe('C3 work state handoff store', () => {
  test('a published handoff carries the four knowledge fields and moves no delivery-plane byte', () => {
    const value = fixture();
    const before = deliveryPlaneDigest(value.repoRoot);
    const engineersBefore = deliveryPlaneDigest(value.repoRoot, 'engineers/v1');
    // Non-vacuity: the engineers plane really has bytes under it to move.
    expect(engineersBefore).not.toBe(deliveryPlaneDigest(value.repoRoot, 'no-such-plane/v1'));

    const result = publishWorkStateHandoff(publishInput(value));
    expect(result.created).toBe(true);
    expect(result.mode).toBe('shadow');
    expect(result.handoff.attempted_paths).toHaveLength(1);
    expect(result.handoff.dead_ends).toEqual(['lock timeout tuning']);
    expect(result.handoff.key_findings).toHaveLength(1);
    expect(result.handoff.next_actions).toHaveLength(1);
    expect(result.handoff.trigger).toBe('budget_low');
    expect(result.handoff.created_at).toBe('2026-08-30T12:00:00.000Z');

    const file = join(handoffsRoot(value.repoRoot), `${result.handoff.handoff_id}.json`);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readWorkStateHandoff(value.repoRoot, result.handoff.handoff_id)).toEqual(result.handoff);
    expect(deliveryPlaneDigest(value.repoRoot)).toBe(before);
  });

  test('the actor and repository come from the authenticated principal, never from the caller', () => {
    const value = fixture();
    const engineer = value.actors[0]!;
    const profile = loadEngineerProfile(value.repoRoot, engineer.engineer_id);
    const binding = readEngineerBindingStatus(value.repoRoot, engineer.engineer_id, profile.engineer_contract_revision).binding!;

    // The input carries no actor field, so a self-declared identity is inert
    // data the store never reads.
    const declared = {
      ...publishInput(value),
      actor: { kind: 'module_engineer', engineer_id: CONTRACT_ENGINEER },
      handoff_id: 'f'.repeat(64),
      repository_id: 'repo_ffffffffffffffff',
      created_at: '1999-01-01T00:00:00.000Z',
    } as unknown as PublishWorkStateHandoffInput;
    const handoff = publishWorkStateHandoff(declared).handoff;

    const mapping = readEngineerPrincipalMapping(
      repoHarnessRepoIdFor(value.repoRoot),
      engineer.authorization_id,
      value.env,
    )!;
    expect(handoff.actor).toEqual({
      kind: 'module_engineer',
      engineer_id: engineer.engineer_id,
      binding_id: binding.binding_id,
      binding_generation: binding.binding_generation,
      principal_mapping_sha256: mapping.mapping_digest,
    });
    expect(handoff.repository_id).toBe(repoHarnessRepoIdFor(value.repoRoot));
    expect(handoff.created_at).toBe('2026-08-30T12:00:00.000Z');
    expect(handoff.handoff_id).toBe(
      deriveWorkStateHandoffId(repoHarnessRepoIdFor(value.repoRoot), handoff.actor, 'handoff-1'),
    );
  });

  test('the same identity with the same payload is idempotent and never re-samples the clock', () => {
    const value = fixture();
    const first = publishWorkStateHandoff(publishInput(value));
    const file = join(handoffsRoot(value.repoRoot), `${first.handoff.handoff_id}.json`);
    const bytes = readFileSync(file, 'utf8');

    const retry = publishWorkStateHandoff(publishInput(value, {
      now: () => {
        throw new Error('a retry must not sample the clock');
      },
    }));
    expect(retry.created).toBe(false);
    expect(retry.handoff).toEqual(first.handoff);
    expect(readFileSync(file, 'utf8')).toBe(bytes);
    expect(listWorkStateHandoffs(value.repoRoot)).toHaveLength(1);
  });

  test('the same identity with a different payload is an explicit conflict', () => {
    const value = fixture();
    const first = publishWorkStateHandoff(publishInput(value));
    const file = join(handoffsRoot(value.repoRoot), `${first.handoff.handoff_id}.json`);
    const bytes = readFileSync(file, 'utf8');
    expect(code(() => publishWorkStateHandoff(publishInput(value, { dead_ends: ['something else'] }))))
      .toBe('collaboration_conflict');
    expect(readFileSync(file, 'utf8')).toBe(bytes);
    expect(listWorkStateHandoffs(value.repoRoot)).toHaveLength(1);
  });

  test('a persisted observation is used verbatim and the clock is never read', () => {
    const value = fixture();
    const result = publishWorkStateHandoff(publishInput(value, {
      recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T09:15:30.000Z' },
      now: () => {
        throw new Error('a persisted observation must not sample the clock');
      },
    }));
    expect(result.handoff.created_at).toBe('2026-08-30T09:15:30.000Z');
  });

  test('a handoff is append-only: a revision supersedes inside one actor lineage', () => {
    const value = fixture();
    const original = publishWorkStateHandoff(publishInput(value)).handoff;

    expect(code(() => publishWorkStateHandoff(publishInput(value, {
      idempotency_key: 'handoff-missing-target',
      supersedes_handoff_id: 'f'.repeat(64),
    })))).toBe('collaboration_invalid');

    // Another Engineer may publish their own handoff, but may not revise this one.
    expect(code(() => publishWorkStateHandoff(publishInput(value, {
      authorization: engineerPrincipalAuthorization(value.actors[1]!.authorization_id),
      idempotency_key: 'handoff-cross-lineage',
      supersedes_handoff_id: original.handoff_id,
    })))).toBe('collaboration_invalid');

    const revision = publishWorkStateHandoff(publishInput(value, {
      idempotency_key: 'handoff-revision',
      supersedes_handoff_id: original.handoff_id,
      dead_ends: ['lock timeout tuning', 'raising the writer count'],
    }));
    expect(revision.handoff.supersedes_handoff_id).toBe(original.handoff_id);
    // The superseded record is still there, byte-identical.
    expect(readWorkStateHandoff(value.repoRoot, original.handoff_id)).toEqual(original);
    expect(listWorkStateHandoffs(value.repoRoot)).toHaveLength(2);
  });

  test('a cited signal must already resolve in this repository', () => {
    const value = fixture();
    expect(code(() => publishWorkStateHandoff(publishInput(value, {
      idempotency_key: 'handoff-missing-signal',
      source_signal_ids: ['e'.repeat(64)],
    })))).toBe('collaboration_invalid');

    const signal = publishCoordinationSignal({
      repo_root: value.repoRoot,
      authorization: engineerPrincipalAuthorization(value.actors[1]!.authorization_id),
      idempotency_key: 'signal-for-handoff',
      thread_key: 'merge-gate-flake',
      reply_to_signal_id: null,
      scope_refs: [],
      labels: [],
      title: 'the fence, not the writer count',
      body: 'observed under four writers',
      artifact_refs: [],
      source_signal_ids: [],
      supersedes_signal_id: null,
      recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T10:00:00.000Z' },
      env: value.env,
    }).signal;

    // A handoff may cite another participant's signal; only a *revision* is
    // restricted to one lineage.
    const cited = publishWorkStateHandoff(publishInput(value, {
      idempotency_key: 'handoff-cites',
      source_signal_ids: [signal.signal_id],
    }));
    expect(cited.handoff.source_signal_ids).toEqual([signal.signal_id]);
  });

  test('a handoff copied in from another repository is refused as a supersede target', () => {
    const local = fixture();
    const foreign = fixture();
    const foreignHandoff = publishWorkStateHandoff(publishInput(foreign, { idempotency_key: 'handoff-foreign' })).handoff;
    expect(foreignHandoff.repository_id).not.toBe(repoHarnessRepoIdFor(local.repoRoot));

    publishWorkStateHandoff(publishInput(local));
    writeFileSync(
      join(handoffsRoot(local.repoRoot), `${foreignHandoff.handoff_id}.json`),
      readFileSync(join(handoffsRoot(foreign.repoRoot), `${foreignHandoff.handoff_id}.json`), 'utf8'),
    );
    expect(code(() => publishWorkStateHandoff(publishInput(local, {
      idempotency_key: 'handoff-foreign-supersede',
      supersedes_handoff_id: foreignHandoff.handoff_id,
    })))).toBe('collaboration_invalid');
  });

  test('a record id that is not 64 hex is refused before any path is built', () => {
    const value = fixture();
    const published = publishWorkStateHandoff(publishInput(value)).handoff;
    const root = handoffsRoot(value.repoRoot);
    writeFileSync(join(value.repoRoot, 'escape.json'), JSON.stringify(published));

    const malformed = [
      `../../../../${relative('/', join(value.repoRoot, 'escape'))}`,
      '../escape',
      `..${'/..'.repeat(8)}/etc/passwd`,
      join(root, `${published.handoff_id}.json`),
      `${published.handoff_id}/../${published.handoff_id}`,
      published.handoff_id.toUpperCase(),
      `${published.handoff_id} `,
      'not-hex',
      '',
      'a'.repeat(63),
      'a'.repeat(65),
    ];
    for (const handoffId of malformed) {
      expect({ handoffId, code: code(() => readWorkStateHandoff(value.repoRoot, handoffId)) })
        .toEqual({ handoffId, code: 'collaboration_invalid' });
      expect({ handoffId, code: code(() => publishWorkStateHandoff(publishInput(value, {
        idempotency_key: `handoff-escape-${malformed.indexOf(handoffId)}`,
        supersedes_handoff_id: handoffId,
      }))) }).toEqual({ handoffId, code: 'collaboration_invalid' });
    }
    expect(readdirSync(root)).toEqual([`${published.handoff_id}.json`]);
  });

  test('collaboration.mode gates every mutation and fails closed on a bad policy', () => {
    const off = fixture('off');
    expect(readCollaborationMode(off.repoRoot)).toBe('off');
    expect(code(() => publishWorkStateHandoff(publishInput(off)))).toBe('collaboration_disabled');
    expect(existsSync(handoffsRoot(off.repoRoot))).toBe(false);

    const absent = fixture(null);
    expect(code(() => publishWorkStateHandoff(publishInput(absent)))).toBe('collaboration_disabled');
    writeFileSync(join(absent.repoRoot, '.ai/harness/policy.json'), '{ not json');
    expect(code(() => publishWorkStateHandoff(publishInput(absent)))).toBe('collaboration_unavailable');
    writeFileSync(join(absent.repoRoot, '.ai/harness/policy.json'), JSON.stringify({ collaboration: { mode: 'on' } }));
    expect(code(() => publishWorkStateHandoff(publishInput(absent)))).toBe('collaboration_invalid');
  });

  test('an unreadable store fails loud instead of degrading to an empty one', () => {
    const value = fixture();
    const published = publishWorkStateHandoff(publishInput(value)).handoff;
    const root = handoffsRoot(value.repoRoot);
    const file = join(root, `${published.handoff_id}.json`);

    writeFileSync(file, '{"protocol":1}');
    expect(code(() => listWorkStateHandoffs(value.repoRoot))).toBe('collaboration_unavailable');
    expect(code(() => readWorkStateHandoff(value.repoRoot, published.handoff_id))).toBe('collaboration_unavailable');

    // Same record, one trailing byte: the canonical-bytes check catches a
    // re-serialization that a JSON-level comparison would wave through.
    writeFileSync(file, `${JSON.stringify(published)} `);
    expect(code(() => readWorkStateHandoff(value.repoRoot, published.handoff_id))).toBe('collaboration_unavailable');

    rmSync(file);
    writeFileSync(join(root, 'notes.txt'), 'stray\n');
    expect(code(() => listWorkStateHandoffs(value.repoRoot))).toBe('collaboration_unavailable');
  });

  /**
   * The staging skip is the one exception to "anything unexpected fails the
   * store closed", so it has to match the name this store writes and nothing
   * else. The genuine name comes from the shared builder the publish path uses,
   * so a builder that drifts from the matcher turns this test red instead of
   * silently widening the skip.
   */
  test("only the store's own staging name is skipped; lookalikes fail the store closed", () => {
    const value = fixture();
    const published = publishWorkStateHandoff(publishInput(value)).handoff;
    const root = handoffsRoot(value.repoRoot);
    const record = `${published.handoff_id}.json`;

    const genuine = collaborationStagingName(record);
    writeFileSync(join(root, genuine), 'staged bytes');
    expect(listWorkStateHandoffs(value.repoRoot)).toHaveLength(1);
    rmSync(join(root, genuine));

    const uuid = genuine.slice(genuine.lastIndexOf('.', genuine.length - 5) + 1, -'.tmp'.length);
    for (const lookalike of [
      `.${record}.${process.pid}.${'-'.repeat(36)}.tmp`,
      `.${record}.${process.pid}.${uuid.slice(0, 14)}1${uuid.slice(15)}.tmp`,
      `.${record}.0.${uuid}.tmp`,
    ]) {
      writeFileSync(join(root, lookalike), 'not staging residue');
      expect({ lookalike, code: code(() => listWorkStateHandoffs(value.repoRoot)) })
        .toEqual({ lookalike, code: 'collaboration_unavailable' });
      rmSync(join(root, lookalike));
    }
    expect(listWorkStateHandoffs(value.repoRoot)).toHaveLength(1);
  });

  test('an unmapped authorization cannot publish a handoff', () => {
    const value = fixture();
    expect(code(() => publishWorkStateHandoff(publishInput(value, {
      authorization: engineerPrincipalAuthorization('55555555-5555-4555-8555-555555555555'),
    })))).toContain('engineer_principal_unmapped');
    expect(listWorkStateHandoffs(value.repoRoot)).toEqual([]);
  });
});
