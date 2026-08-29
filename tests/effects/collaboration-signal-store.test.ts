/**
 * C1 — the append-only coordination signal store.
 *
 * Acceptance for sprint row C1: three actors publish concurrently, the same
 * identity with the same payload is idempotent, the same identity with a
 * different payload conflicts, and Task/Lease bytes do not move. Store rules are
 * frozen by D9 in
 * `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join, relative } from 'path';

import { CollaborationError } from '../../src/core/collaboration/common';
import { deriveCoordinationSignalId } from '../../src/core/collaboration/signal';
import { readCollaborationMode } from '../../src/effects/collaboration/feature-flag';
import {
  COLLABORATION_SIGNALS_RELATIVE_ROOT,
  listCoordinationSignals,
  publishCoordinationSignal,
  readCoordinationSignal,
  type PublishCoordinationSignalInput,
} from '../../src/effects/collaboration/signal-store';
import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { enrollEngineerPrincipal, readEngineerPrincipalMapping } from '../../src/effects/engineers/principal-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

const sourceRoot = process.cwd();
const roots: string[] = [];

const COLLABORATION_ENGINEER = 'engineer:capability.runtime-harness.collaboration';
const EVALS_ENGINEER = 'engineer:capability.verification.evals-checks';
const CONTRACT_ENGINEER = 'engineer:capability.workflow-engine.contract-assets';

interface Actor {
  readonly engineer_id: string;
  readonly authorization_id: string;
}

interface Fixture {
  readonly repoRoot: string;
  readonly home: string;
  readonly env: NodeJS.ProcessEnv;
  readonly actors: readonly Actor[];
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function git(cwd: string, args: readonly string[]): void {
  execFileSync('git', [...args], { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
}

function collaborationProfile(): string {
  const base = JSON.parse(readFileSync(join(sourceRoot, 'agents/engineers/profiles/verification-evals-checks.json'), 'utf8')) as Record<string, unknown>;
  return `${JSON.stringify({
    ...base,
    engineer_id: COLLABORATION_ENGINEER,
    capability_id: 'capability.runtime-harness.collaboration',
    sop_ref: 'agents/engineers/sops/runtime-harness-collaboration.md',
  }, null, 2)}\n`;
}

/**
 * A disposable repository carrying the real capability nodes and Engineer
 * profiles, plus a third profile for the collaboration capability so three
 * distinct actors exist. `REPO_HARNESS_HOME` is a temp directory outside the
 * repo, so the principal store never touches the developer's own state.
 */
function fixture(mode: string | null = 'shadow'): Fixture {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-c1-signal-')));
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-c1-signal-home-')));
  roots.push(repoRoot, home);
  git(repoRoot, ['init', '-q', '-b', 'main']);
  git(repoRoot, ['config', 'user.email', 'tests@example.invalid']);
  git(repoRoot, ['config', 'user.name', 'Tests']);
  mkdirSync(join(repoRoot, '.archcontext/model'), { recursive: true });
  mkdirSync(join(repoRoot, 'agents'), { recursive: true });
  mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  mkdirSync(join(repoRoot, 'src/core/collaboration'), { recursive: true });
  mkdirSync(join(repoRoot, 'src/effects/collaboration'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(repoRoot, 'agents/engineers'), { recursive: true });
  writeFileSync(join(repoRoot, 'agents/engineers/profiles/runtime-harness-collaboration.json'), collaborationProfile());
  writeFileSync(join(repoRoot, 'agents/engineers/sops/runtime-harness-collaboration.md'), '# Collaboration SOP fixture\n');
  if (mode !== null) {
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ collaboration: { mode } }, null, 2)}\n`);
  }
  writeFileSync(join(repoRoot, 'README.md'), 'fixture\n');
  writeFileSync(join(repoRoot, 'src/core/collaboration/.keep'), '');
  writeFileSync(join(repoRoot, 'src/effects/collaboration/.keep'), '');
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'fixture']);

  const env = { ...process.env, REPO_HARNESS_HOME: home };
  const actors: Actor[] = [
    { engineer_id: COLLABORATION_ENGINEER, authorization_id: '22222222-2222-4222-8222-222222222222' },
    { engineer_id: EVALS_ENGINEER, authorization_id: '33333333-3333-4333-8333-333333333333' },
    { engineer_id: CONTRACT_ENGINEER, authorization_id: '44444444-4444-4444-8444-444444444444' },
  ];
  actors.forEach((actor, index) => {
    const profile = loadEngineerProfile(repoRoot, actor.engineer_id);
    bindEngineer(repoRoot, {
      engineer_id: actor.engineer_id,
      idempotency_key: `bind-${index}`,
      provider: 'codex',
      provider_thread_id: `thread-${index}`,
      host_id: 'local',
      engineer_contract_revision: profile.engineer_contract_revision,
      expected_current_digest: null,
      expected_binding_generation: 0,
      expected_binding_id: null,
      expected_engineer_contract_revision: profile.engineer_contract_revision,
      now: () => '2026-08-29T00:00:00.000Z',
      binding_id: () => `${index + 1}${`${index + 1}`.repeat(7)}-1111-4111-8111-111111111111`,
    });
    const status = readEngineerBindingStatus(repoRoot, actor.engineer_id, profile.engineer_contract_revision);
    enrollEngineerPrincipal({
      repository_id: repoHarnessRepoIdFor(repoRoot),
      authorization_id: actor.authorization_id,
      binding: status.binding!,
      created_at: '2026-08-29T00:00:00.000Z',
      env,
    });
  });
  return { repoRoot, home, env, actors };
}

function publishInput(
  fixtureValue: Fixture,
  overrides: Partial<PublishCoordinationSignalInput> = {},
): PublishCoordinationSignalInput {
  return {
    repo_root: fixtureValue.repoRoot,
    authorization_id: fixtureValue.actors[0]!.authorization_id,
    idempotency_key: 'idem-1',
    thread_key: 'merge-gate-flake',
    reply_to_signal_id: null,
    scope_refs: [{ kind: 'free_topic', value: 'merge gate flake' }],
    labels: ['NEED-REPRO'],
    title: 'the fourth writer never observes the published token',
    body: 'Reproduced twice under four concurrent writers.',
    artifact_refs: [],
    source_signal_ids: [],
    supersedes_signal_id: null,
    recorded_time: { kind: 'first_publication' },
    now: () => '2026-08-29T12:00:00.000Z',
    env: fixtureValue.env,
    ...overrides,
  };
}

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof CollaborationError) return error.code;
    return `other:${(error as { code?: string }).code ?? (error as Error).message}`;
  }
  return 'no-error';
}

/**
 * A digest over every delivery-plane store under the Git common directory,
 * excluding the collaboration store itself. This is the before/after evidence
 * the Program Verification Matrix asks for on authority preservation.
 *
 * `scope` narrows it to one plane subtree (`coordination/v1`, `engineers/v1`)
 * so a falsifier can name the plane it claims not to have moved.
 */
function deliveryPlaneDigest(repoRoot: string, scope = ''): string {
  const root = join(realpathSync(resolveGitCommonDirectory(repoRoot)), 'repo-harness', scope);
  const hash = createHash('sha256');
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const absolute = join(directory, entry.name);
      const scoped = relative(root, absolute);
      if (scoped === 'collaboration' || scoped.startsWith('collaboration/')) continue;
      if (entry.isDirectory()) {
        hash.update(`d ${scoped} `);
        walk(absolute);
      } else if (entry.isFile()) {
        hash.update(`f ${scoped} `);
        hash.update(readFileSync(absolute));
        hash.update(' ');
      }
    }
  };
  if (existsSync(root)) walk(root);
  return `sha256:${hash.digest('hex')}`;
}

interface DriverResult {
  readonly ok: boolean;
  readonly signal_id?: string;
  readonly created?: boolean;
  readonly code?: string | null;
  readonly message?: string;
}

/**
 * Publish from an independent process. The store's mutual exclusion is a
 * filesystem lock, so in-process concurrency would not exercise it.
 */
function publishInDriver(driver: string, input: unknown, env: NodeJS.ProcessEnv): Promise<DriverResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [driver, JSON.stringify(input)], { env });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer | string) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk: Buffer | string) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', () => {
      try {
        resolve(JSON.parse(stdout) as DriverResult);
      } catch (error) {
        reject(new Error(`driver produced no result: ${stdout}${stderr}`, { cause: error }));
      }
    });
  });
}

function writeDriver(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-c1-driver-')));
  roots.push(directory);
  const driver = join(directory, 'publish.ts');
  writeFileSync(driver, [
    `import { publishCoordinationSignal } from ${JSON.stringify(join(sourceRoot, 'src/effects/collaboration/signal-store'))};`,
    'const input = JSON.parse(process.argv[2]!);',
    'try {',
    '  const result = publishCoordinationSignal({ ...input, env: process.env });',
    '  process.stdout.write(JSON.stringify({ ok: true, signal_id: result.signal.signal_id, created: result.created }));',
    '} catch (error) {',
    '  process.stdout.write(JSON.stringify({ ok: false, code: (error as { code?: string }).code ?? null, message: (error as Error).message }));',
    '}',
    '',
  ].join('\n'));
  return driver;
}

describe('C1 coordination signal store', () => {
  test('three actors publish concurrently from independent processes', async () => {
    const value = fixture();
    const driver = writeDriver();
    const before = deliveryPlaneDigest(value.repoRoot);

    const results = await Promise.all(value.actors.map((actor, index) => publishInDriver(driver, {
      repo_root: value.repoRoot,
      authorization_id: actor.authorization_id,
      idempotency_key: `concurrent-${index}`,
      // One thread key on purpose: all three contend for the same per-thread lock.
      thread_key: 'shared-thread',
      reply_to_signal_id: null,
      scope_refs: [],
      labels: [],
      title: `finding from actor ${index}`,
      body: `body ${index}`,
      artifact_refs: [],
      source_signal_ids: [],
      supersedes_signal_id: null,
      recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-29T12:00:00.000Z' },
    }, value.env)));

    expect(results.map((result) => result.ok)).toEqual([true, true, true]);
    expect(results.every((result) => result.created === true)).toBe(true);
    expect(new Set(results.map((result) => result.signal_id)).size).toBe(3);

    const persisted = listCoordinationSignals(value.repoRoot);
    expect(persisted).toHaveLength(3);
    expect(new Set(persisted.map((signal) => signal.actor.kind))).toEqual(new Set(['module_engineer']));
    expect(new Set(persisted.map((signal) => (signal.actor as { engineer_id: string }).engineer_id)))
      .toEqual(new Set(value.actors.map((actor) => actor.engineer_id)));
    // Kill gate: a full collaboration round moves no delivery-plane byte.
    expect(deliveryPlaneDigest(value.repoRoot)).toBe(before);
  });

  test('the same identity with the same payload is idempotent and never re-samples the clock', () => {
    const value = fixture();
    const first = publishCoordinationSignal(publishInput(value));
    expect(first.created).toBe(true);
    expect(first.signal.created_at).toBe('2026-08-29T12:00:00.000Z');
    const file = join(
      realpathSync(resolveGitCommonDirectory(value.repoRoot)),
      COLLABORATION_SIGNALS_RELATIVE_ROOT,
      `${first.signal.signal_id}.json`,
    );
    const bytes = readFileSync(file, 'utf8');

    // A retry sampling the wall clock again would look like a payload conflict.
    const retry = publishCoordinationSignal(publishInput(value, {
      now: () => {
        throw new Error('a retry must not sample the clock');
      },
    }));
    expect(retry.created).toBe(false);
    expect(retry.signal).toEqual(first.signal);
    expect(readFileSync(file, 'utf8')).toBe(bytes);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  /**
   * The falsifier for C1's central claim, in one test: republishing the same
   * identity moves neither the record's own bytes nor either delivery plane. If
   * the store ever rewrote the file on a retry, or reached into the delivery
   * plane to record that it had been asked twice, exactly one of these four
   * digests would move.
   */
  test('republishing one identity moves neither the record bytes nor either delivery plane', () => {
    const value = fixture();
    const coordinationBefore = deliveryPlaneDigest(value.repoRoot, 'coordination/v1');
    const engineersBefore = deliveryPlaneDigest(value.repoRoot, 'engineers/v1');
    // Non-vacuity: the engineers plane really has bytes under it to move.
    expect(engineersBefore).not.toBe(deliveryPlaneDigest(value.repoRoot, 'no-such-plane/v1'));

    const first = publishCoordinationSignal(publishInput(value, { idempotency_key: 'idem-falsifier' }));
    expect(first.created).toBe(true);
    const file = join(
      realpathSync(resolveGitCommonDirectory(value.repoRoot)),
      COLLABORATION_SIGNALS_RELATIVE_ROOT,
      `${first.signal.signal_id}.json`,
    );
    const bytes = readFileSync(file, 'utf8');

    const second = publishCoordinationSignal(publishInput(value, { idempotency_key: 'idem-falsifier' }));
    expect(second.created).toBe(false);
    expect(second.signal).toEqual(first.signal);

    expect(readFileSync(file, 'utf8')).toBe(bytes);
    expect(listCoordinationSignals(value.repoRoot)).toHaveLength(1);
    expect(deliveryPlaneDigest(value.repoRoot, 'coordination/v1')).toBe(coordinationBefore);
    expect(deliveryPlaneDigest(value.repoRoot, 'engineers/v1')).toBe(engineersBefore);
  });

  test('a record id that is not 64 hex is refused before any path is built', () => {
    const value = fixture();
    const published = publishCoordinationSignal(publishInput(value)).signal;
    const signalsRoot = join(realpathSync(resolveGitCommonDirectory(value.repoRoot)), COLLABORATION_SIGNALS_RELATIVE_ROOT);
    writeFileSync(join(value.repoRoot, 'escape.json'), JSON.stringify(published));

    const malformed = [
      `../../../../${relative('/', join(value.repoRoot, 'escape'))}`,
      '../escape',
      `..${'/..'.repeat(8)}/etc/passwd`,
      join(signalsRoot, `${published.signal_id}.json`),
      `${published.signal_id}/../${published.signal_id}`,
      published.signal_id.toUpperCase(),
      `${published.signal_id} `,
      'not-hex',
      '',
      'a'.repeat(63),
      'a'.repeat(65),
    ];
    for (const signalId of malformed) {
      expect({ signalId, code: code(() => readCoordinationSignal(value.repoRoot, signalId)) })
        .toEqual({ signalId, code: 'collaboration_invalid' });
      expect({ signalId, code: code(() => publishCoordinationSignal(publishInput(value, {
        idempotency_key: `idem-escape-${malformed.indexOf(signalId)}`,
        source_signal_ids: [signalId],
      }))) }).toEqual({ signalId, code: 'collaboration_invalid' });
    }
    // Nothing was created by the attempts, and the store still holds one record.
    expect(listCoordinationSignals(value.repoRoot)).toHaveLength(1);
    expect(readdirSync(signalsRoot)).toEqual([`${published.signal_id}.json`]);
  });

  test('the same identity with a different payload is an explicit conflict', () => {
    const value = fixture();
    const first = publishCoordinationSignal(publishInput(value));
    const file = join(
      realpathSync(resolveGitCommonDirectory(value.repoRoot)),
      COLLABORATION_SIGNALS_RELATIVE_ROOT,
      `${first.signal.signal_id}.json`,
    );
    const bytes = readFileSync(file, 'utf8');
    expect(code(() => publishCoordinationSignal(publishInput(value, { title: 'a different title' }))))
      .toBe('collaboration_conflict');
    expect(readFileSync(file, 'utf8')).toBe(bytes);
    expect(listCoordinationSignals(value.repoRoot)).toHaveLength(1);
  });

  test('a persisted observation is used verbatim and the clock is never read', () => {
    const value = fixture();
    const result = publishCoordinationSignal(publishInput(value, {
      recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-29T09:15:30.000Z' },
      now: () => {
        throw new Error('a persisted observation must not sample the clock');
      },
    }));
    expect(result.signal.created_at).toBe('2026-08-29T09:15:30.000Z');
  });

  test('supersede requires an existing target inside the same actor lineage', () => {
    const value = fixture();
    const original = publishCoordinationSignal(publishInput(value)).signal;

    expect(code(() => publishCoordinationSignal(publishInput(value, {
      idempotency_key: 'idem-missing',
      supersedes_signal_id: 'f'.repeat(64),
    })))).toBe('collaboration_invalid');

    // Another Engineer may reply to or cite this signal, but may not revise it.
    expect(code(() => publishCoordinationSignal(publishInput(value, {
      authorization_id: value.actors[1]!.authorization_id,
      idempotency_key: 'idem-cross-lineage',
      supersedes_signal_id: original.signal_id,
    })))).toBe('collaboration_invalid');

    const revision = publishCoordinationSignal(publishInput(value, {
      idempotency_key: 'idem-revision',
      supersedes_signal_id: original.signal_id,
      title: 'revised: it is the lock publication fence, not the writer count',
    }));
    expect(revision.signal.supersedes_signal_id).toBe(original.signal_id);
    // Append-only: the superseded record is still there, byte-identical.
    expect(readCoordinationSignal(value.repoRoot, original.signal_id)).toEqual(original);
    expect(listCoordinationSignals(value.repoRoot)).toHaveLength(2);
  });

  test('reply and source references must already resolve in this repository', () => {
    const value = fixture();
    const existing = publishCoordinationSignal(publishInput(value)).signal;
    expect(code(() => publishCoordinationSignal(publishInput(value, {
      idempotency_key: 'idem-source-missing',
      source_signal_ids: ['e'.repeat(64)],
    })))).toBe('collaboration_invalid');
    expect(code(() => publishCoordinationSignal(publishInput(value, {
      idempotency_key: 'idem-reply-missing',
      reply_to_signal_id: 'e'.repeat(64),
    })))).toBe('collaboration_invalid');
    const derived = publishCoordinationSignal(publishInput(value, {
      idempotency_key: 'idem-derived',
      reply_to_signal_id: existing.signal_id,
      source_signal_ids: [existing.signal_id],
    }));
    expect(derived.signal.source_signal_ids).toEqual([existing.signal_id]);
  });

  test('a signal copied in from another repository is refused as a source', () => {
    const local = fixture();
    const foreign = fixture();
    const foreignSignal = publishCoordinationSignal(publishInput(foreign, { idempotency_key: 'idem-foreign' })).signal;
    expect(foreignSignal.repository_id).not.toBe(repoHarnessRepoIdFor(local.repoRoot));

    publishCoordinationSignal(publishInput(local));
    const signalsRoot = join(realpathSync(resolveGitCommonDirectory(local.repoRoot)), COLLABORATION_SIGNALS_RELATIVE_ROOT);
    copyFileSync(
      join(realpathSync(resolveGitCommonDirectory(foreign.repoRoot)), COLLABORATION_SIGNALS_RELATIVE_ROOT, `${foreignSignal.signal_id}.json`),
      join(signalsRoot, `${foreignSignal.signal_id}.json`),
    );

    expect(code(() => publishCoordinationSignal(publishInput(local, {
      idempotency_key: 'idem-foreign-source',
      source_signal_ids: [foreignSignal.signal_id],
    })))).toBe('collaboration_invalid');
  });

  test('collaboration.mode off refuses every mutation and writes nothing', () => {
    const value = fixture('off');
    expect(readCollaborationMode(value.repoRoot)).toBe('off');
    expect(code(() => publishCoordinationSignal(publishInput(value)))).toBe('collaboration_disabled');
    expect(listCoordinationSignals(value.repoRoot)).toEqual([]);
    expect(existsSync(join(realpathSync(resolveGitCommonDirectory(value.repoRoot)), COLLABORATION_SIGNALS_RELATIVE_ROOT))).toBe(false);
  });

  test('an absent policy is off, and a malformed one fails closed rather than opening up', () => {
    const value = fixture(null);
    expect(readCollaborationMode(value.repoRoot)).toBe('off');
    expect(code(() => publishCoordinationSignal(publishInput(value)))).toBe('collaboration_disabled');

    writeFileSync(join(value.repoRoot, '.ai/harness/policy.json'), '{ not json');
    expect(code(() => publishCoordinationSignal(publishInput(value)))).toBe('collaboration_unavailable');

    writeFileSync(join(value.repoRoot, '.ai/harness/policy.json'), JSON.stringify({ collaboration: { mode: 'on' } }));
    expect(code(() => publishCoordinationSignal(publishInput(value)))).toBe('collaboration_invalid');
  });

  test('an unreadable store fails loud instead of degrading to an empty one', () => {
    const value = fixture();
    const published = publishCoordinationSignal(publishInput(value)).signal;
    const signalsRoot = join(realpathSync(resolveGitCommonDirectory(value.repoRoot)), COLLABORATION_SIGNALS_RELATIVE_ROOT);
    const file = join(signalsRoot, `${published.signal_id}.json`);

    writeFileSync(file, '{"protocol":1}');
    expect(code(() => listCoordinationSignals(value.repoRoot))).toBe('collaboration_unavailable');
    expect(code(() => readCoordinationSignal(value.repoRoot, published.signal_id))).toBe('collaboration_unavailable');

    writeFileSync(file, `${JSON.stringify(published)} `);
    expect(code(() => readCoordinationSignal(value.repoRoot, published.signal_id))).toBe('collaboration_unavailable');

    rmSync(file);
    writeFileSync(join(signalsRoot, 'notes.txt'), 'stray\n');
    expect(code(() => listCoordinationSignals(value.repoRoot))).toBe('collaboration_unavailable');
  });

  test('the actor comes from the authenticated principal, never from the caller', () => {
    const value = fixture();
    const engineer = value.actors[0]!;
    const profile = loadEngineerProfile(value.repoRoot, engineer.engineer_id);
    const binding = readEngineerBindingStatus(value.repoRoot, engineer.engineer_id, profile.engineer_contract_revision).binding!;

    // The input carries no actor field, so a self-declared identity is inert
    // data the store never reads.
    const declared = {
      ...publishInput(value),
      actor: { kind: 'module_engineer', engineer_id: CONTRACT_ENGINEER },
      signal_id: 'f'.repeat(64),
      repository_id: 'repo_ffffffffffffffff',
      created_at: '1999-01-01T00:00:00.000Z',
    } as unknown as PublishCoordinationSignalInput;
    const result = publishCoordinationSignal(declared);

    const mapping = readEngineerPrincipalMapping(
      repoHarnessRepoIdFor(value.repoRoot),
      engineer.authorization_id,
      value.env,
    )!;
    expect(result.signal.actor).toEqual({
      kind: 'module_engineer',
      engineer_id: engineer.engineer_id,
      binding_id: binding.binding_id,
      binding_generation: binding.binding_generation,
      principal_mapping_sha256: mapping.mapping_digest,
    });
    expect(result.signal.repository_id).toBe(repoHarnessRepoIdFor(value.repoRoot));
    expect(result.signal.created_at).toBe('2026-08-29T12:00:00.000Z');
    expect(result.signal.signal_id).toBe(
      deriveCoordinationSignalId(repoHarnessRepoIdFor(value.repoRoot), result.signal.actor, 'idem-1'),
    );
  });

  test('an unmapped authorization cannot publish', () => {
    const value = fixture();
    expect(code(() => publishCoordinationSignal(publishInput(value, {
      authorization_id: '55555555-5555-4555-8555-555555555555',
    })))).toContain('engineer_principal_unmapped');
    expect(listCoordinationSignals(value.repoRoot)).toEqual([]);
  });
});
