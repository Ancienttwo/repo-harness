/**
 * C3 — the append-only `HandoffAdoptionReceiptV1` store.
 *
 * Acceptance for sprint row C3, and the frozen sentence this file exists to
 * falsify: *handoff adoption is non-exclusive*. Two distinct adopters of one
 * handoff both succeed, including when they race from independent processes;
 * the same adopter repeating the same triple is idempotent; and adopting
 * knowledge creates no Claim and moves no Lease generation.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { spawn } from 'child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';

import { CollaborationError } from '../../src/core/collaboration/common';
import {
  buildHandoffAdoptionReceipt,
  canonicalHandoffAdoptionReceiptBytes,
  deriveHandoffAdoptionReceiptId,
} from '../../src/core/collaboration/adoption';
import {
  COLLABORATION_ADOPTIONS_RELATIVE_ROOT,
  adoptWorkStateHandoff,
  listAdoptersOfWorkStateHandoff,
  listHandoffAdoptionReceipts,
  readHandoffAdoptionReceipt,
  type AdoptWorkStateHandoffInput,
} from '../../src/effects/collaboration/adoption-store';
import {
  publishWorkStateHandoff,
  type PublishWorkStateHandoffInput,
  type PublishWorkStateHandoffResult,
} from '../../src/effects/collaboration/handoff-store';
import { engineerPrincipalAuthorization } from '../../src/effects/collaboration/actor';
import { collaborationStagingName } from '../../src/effects/collaboration/record-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import {
  createCollaborationFixture,
  deliveryPlaneDigest,
  removeFixtureRoots,
  type CollaborationFixture as Fixture,
} from '../helpers/collaboration-store-fixture';

const sourceRoot = process.cwd();
const roots: string[] = [];

const PACKET_SHA = `sha256:${'2'.repeat(64)}`;
const OTHER_PACKET_SHA = `sha256:${'3'.repeat(64)}`;

afterEach(() => {
  removeFixtureRoots(roots);
});

function fixture(mode: string | null = 'shadow'): Fixture {
  return createCollaborationFixture(sourceRoot, roots, mode, 'repo-harness-c3-adoption');
}

function adoptionsRoot(repoRoot: string): string {
  return join(realpathSync(resolveGitCommonDirectory(repoRoot)), COLLABORATION_ADOPTIONS_RELATIVE_ROOT);
}

function handoffInput(
  value: Fixture,
  overrides: Partial<PublishWorkStateHandoffInput> = {},
): PublishWorkStateHandoffInput {
  return {
    repo_root: value.repoRoot,
    authorization: engineerPrincipalAuthorization(value.actors[0]!.authorization_id),
    idempotency_key: 'handoff-1',
    thread_key: 'merge-gate-flake',
    scope_refs: [],
    trigger: 'context_pressure',
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
    recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T10:00:00.000Z' },
    env: value.env,
    ...overrides,
  };
}

function publishHandoff(value: Fixture, overrides: Partial<PublishWorkStateHandoffInput> = {}): PublishWorkStateHandoffResult {
  return publishWorkStateHandoff(handoffInput(value, overrides));
}

function adoptInput(
  value: Fixture,
  handoffId: string,
  overrides: Partial<AdoptWorkStateHandoffInput> = {},
): AdoptWorkStateHandoffInput {
  return {
    repo_root: value.repoRoot,
    authorization: engineerPrincipalAuthorization(value.actors[0]!.authorization_id),
    handoff_id: handoffId,
    context_packet_sha256: PACKET_SHA,
    recorded_time: { kind: 'first_publication' },
    now: () => '2026-08-30T12:00:00.000Z',
    env: value.env,
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

interface DriverResult {
  readonly ok: boolean;
  readonly receipt_id?: string;
  readonly adopter?: string;
  readonly created?: boolean;
  readonly code?: string | null;
  readonly message?: string;
}

/**
 * Adopt from an independent process. The store's mutual exclusion is a
 * filesystem lock, so in-process concurrency would not exercise it.
 */
function adoptInDriver(driver: string, input: unknown, env: NodeJS.ProcessEnv): Promise<DriverResult> {
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
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-c3-driver-')));
  roots.push(directory);
  const driver = join(directory, 'adopt.ts');
  writeFileSync(driver, [
    `import { adoptWorkStateHandoff } from ${JSON.stringify(join(sourceRoot, 'src/effects/collaboration/adoption-store'))};`,
    'const input = JSON.parse(process.argv[2]!);',
    'try {',
    '  const result = adoptWorkStateHandoff({ ...input, env: process.env });',
    '  process.stdout.write(JSON.stringify({',
    '    ok: true,',
    '    receipt_id: result.receipt_id,',
    '    adopter: (result.receipt.adopter as { engineer_id: string }).engineer_id,',
    '    created: result.created,',
    '  }));',
    '} catch (error) {',
    '  process.stdout.write(JSON.stringify({ ok: false, code: (error as { code?: string }).code ?? null, message: (error as Error).message }));',
    '}',
    '',
  ].join('\n'));
  return driver;
}

describe('C3 handoff adoption store', () => {
  /**
   * The row's central claim, in one test. Three distinct Engineers adopt the
   * same handoff from independent processes; all three receipts persist, and
   * no delivery-plane byte moves — so adoption grants no Claim and touches no
   * Lease generation.
   */
  test('many-to-many: distinct adopters racing from independent processes all succeed', async () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    const driver = writeDriver();
    const before = deliveryPlaneDigest(value.repoRoot);
    const coordinationBefore = deliveryPlaneDigest(value.repoRoot, 'coordination/v1');
    const engineersBefore = deliveryPlaneDigest(value.repoRoot, 'engineers/v1');
    // Non-vacuity: the engineers plane really has bytes under it to move.
    expect(engineersBefore).not.toBe(deliveryPlaneDigest(value.repoRoot, 'no-such-plane/v1'));

    const results = await Promise.all(value.actors.map((actor) => adoptInDriver(driver, {
      repo_root: value.repoRoot,
      authorization: engineerPrincipalAuthorization(actor.authorization_id),
      handoff_id: handoff.handoff_id,
      context_packet_sha256: PACKET_SHA,
      recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T12:00:00.000Z' },
    }, value.env)));

    expect(results.map((result) => result.ok)).toEqual([true, true, true]);
    expect(results.every((result) => result.created === true)).toBe(true);
    expect(new Set(results.map((result) => result.receipt_id)).size).toBe(3);
    expect(new Set(results.map((result) => result.adopter)))
      .toEqual(new Set(value.actors.map((actor) => actor.engineer_id)));

    const persisted = listHandoffAdoptionReceipts(value.repoRoot);
    expect(persisted).toHaveLength(3);
    expect(new Set(persisted.map((receipt) => receipt.handoff_id))).toEqual(new Set([handoff.handoff_id]));
    expect(new Set(persisted.map((receipt) => receipt.handoff_sha256))).toEqual(new Set([handoff.handoff_sha256]));
    expect(listAdoptersOfWorkStateHandoff(value.repoRoot, handoff.handoff_id)).toHaveLength(3);

    // Kill gate: a full adoption round moves no delivery-plane byte, so no
    // Claim was created and no Lease generation moved. Stated twice, because
    // "adoption creates no Claim" is the acceptance sentence: the Task/Lease
    // store does not even come into existence.
    expect(existsSync(join(realpathSync(resolveGitCommonDirectory(value.repoRoot)), 'repo-harness/coordination')))
      .toBe(false);
    expect(deliveryPlaneDigest(value.repoRoot)).toBe(before);
    expect(deliveryPlaneDigest(value.repoRoot, 'coordination/v1')).toBe(coordinationBefore);
    expect(deliveryPlaneDigest(value.repoRoot, 'engineers/v1')).toBe(engineersBefore);
  });

  test('the receipt carries the adopted handoff digest and its derived identity is its filename', () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    const result = adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id));

    expect(result.created).toBe(true);
    expect(result.mode).toBe('shadow');
    expect(result.receipt.handoff_sha256).toBe(handoff.handoff_sha256);
    expect(result.receipt.handoff_id).toBe(handoff.handoff_id);
    expect(result.receipt.adopted_at).toBe('2026-08-30T12:00:00.000Z');
    expect(result.receipt_id).toBe(
      deriveHandoffAdoptionReceiptId(handoff.handoff_sha256, result.receipt.adopter, PACKET_SHA),
    );

    const file = join(adoptionsRoot(value.repoRoot), `${result.receipt_id}.json`);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toBe(canonicalHandoffAdoptionReceiptBytes(result.receipt));
    expect(readHandoffAdoptionReceipt(value.repoRoot, result.receipt_id)).toEqual(result.receipt);
  });

  test('the adopter comes from the authenticated principal, never from the caller', () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    const declared = {
      ...adoptInput(value, handoff.handoff_id),
      adopter: { kind: 'module_engineer', engineer_id: value.actors[2]!.engineer_id },
      handoff_sha256: `sha256:${'9'.repeat(64)}`,
      adopted_at: '1999-01-01T00:00:00.000Z',
    } as unknown as AdoptWorkStateHandoffInput;
    const receipt = adoptWorkStateHandoff(declared).receipt;

    expect((receipt.adopter as { engineer_id: string }).engineer_id).toBe(value.actors[0]!.engineer_id);
    // The digest is read off the persisted handoff, not off the request.
    expect(receipt.handoff_sha256).toBe(handoff.handoff_sha256);
    expect(receipt.adopted_at).toBe('2026-08-30T12:00:00.000Z');
  });

  test('the same adopter with the same triple is idempotent and never re-samples the clock', () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    const first = adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id));
    const file = join(adoptionsRoot(value.repoRoot), `${first.receipt_id}.json`);
    const bytes = readFileSync(file, 'utf8');

    const retry = adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id, {
      now: () => {
        throw new Error('a retry must not sample the clock');
      },
    }));
    expect(retry.created).toBe(false);
    expect(retry.receipt).toEqual(first.receipt);
    expect(readFileSync(file, 'utf8')).toBe(bytes);
    expect(listHandoffAdoptionReceipts(value.repoRoot)).toHaveLength(1);
  });

  /**
   * The packet is part of the identity, so the same adopter receiving a
   * different context packet for the same handoff is a second adoption event,
   * not a conflict. Adoption is non-exclusive even against oneself.
   */
  test('one adopter adopting the same handoff under a different packet lands a second receipt', () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    const first = adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id));
    const second = adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id, {
      context_packet_sha256: OTHER_PACKET_SHA,
    }));
    expect(second.created).toBe(true);
    expect(second.receipt_id).not.toBe(first.receipt_id);
    expect(listHandoffAdoptionReceipts(value.repoRoot)).toHaveLength(2);
  });

  /**
   * `handoff_id` is redundant with `handoff_sha256`, which pins the exact bytes
   * that contain it, and the PRD freezes both onto the record. The identity
   * triple does *not* cover `handoff_id`, so this is the one field a receipt
   * carries that its own filename cannot constrain: a record naming handoff B
   * while its digest pins handoff A derives the right name, serialises
   * canonically and validates. Every path must refuse it — the write path as a
   * conflict, and the read paths on their own, because an append-only store has
   * no repair path once such a record exists.
   */
  test('a persisted receipt whose handoff_id disagrees with its digest is refused on every path', () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    const other = publishHandoff(value, { idempotency_key: 'handoff-2', goal: 'a different goal' }).handoff;
    const honest = adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id));
    expect(listAdoptersOfWorkStateHandoff(value.repoRoot, other.handoff_id)).toEqual([]);

    // Same identity triple, same canonical serialization, wrong subject id.
    const forged = buildHandoffAdoptionReceipt({
      handoff_id: other.handoff_id,
      handoff_sha256: handoff.handoff_sha256,
      adopter: honest.receipt.adopter,
      context_packet_sha256: PACKET_SHA,
      adopted_at: honest.receipt.adopted_at,
    });
    const file = join(adoptionsRoot(value.repoRoot), `${honest.receipt_id}.json`);
    writeFileSync(file, canonicalHandoffAdoptionReceiptBytes(forged));

    expect(code(() => adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id))))
      .toBe('collaboration_conflict');
    // The write path alone is not enough: without a read-side cross-check this
    // record would be served as a real adoption of `other`, inflating the
    // adopter count of a handoff nobody adopted.
    expect(code(() => readHandoffAdoptionReceipt(value.repoRoot, honest.receipt_id)))
      .toBe('collaboration_unavailable');
    expect(code(() => listHandoffAdoptionReceipts(value.repoRoot))).toBe('collaboration_unavailable');
    expect(code(() => listAdoptersOfWorkStateHandoff(value.repoRoot, other.handoff_id)))
      .toBe('collaboration_unavailable');
    // The forged bytes were not repaired or overwritten by the failed adoption.
    expect(readFileSync(file, 'utf8')).toBe(canonicalHandoffAdoptionReceiptBytes(forged));
  });

  /**
   * The same hole with the subject removed rather than swapped: a receipt whose
   * `handoff_id` resolves to nothing at all. Failing closed matters more here
   * than on the swap, because there is no second record to compare against.
   */
  test('a persisted receipt naming a handoff that does not exist fails the store closed', () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    const honest = adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id));
    expect(readHandoffAdoptionReceipt(value.repoRoot, honest.receipt_id)).toEqual(honest.receipt);

    // `handoff_id` is outside the identity preimage, so this lands under the
    // very same filename the honest receipt occupies.
    const orphaned = buildHandoffAdoptionReceipt({
      handoff_id: 'f'.repeat(64),
      handoff_sha256: handoff.handoff_sha256,
      adopter: honest.receipt.adopter,
      context_packet_sha256: PACKET_SHA,
      adopted_at: honest.receipt.adopted_at,
    });
    writeFileSync(
      join(adoptionsRoot(value.repoRoot), `${honest.receipt_id}.json`),
      canonicalHandoffAdoptionReceiptBytes(orphaned),
    );

    expect(code(() => readHandoffAdoptionReceipt(value.repoRoot, honest.receipt_id)))
      .toBe('collaboration_unavailable');
    expect(code(() => listHandoffAdoptionReceipts(value.repoRoot))).toBe('collaboration_unavailable');
    expect(code(() => listAdoptersOfWorkStateHandoff(value.repoRoot, handoff.handoff_id)))
      .toBe('collaboration_unavailable');
  });

  test('a receipt filed under a name it does not derive fails the store closed', () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    const honest = adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id));
    const wrongName = deriveHandoffAdoptionReceiptId(handoff.handoff_sha256, honest.receipt.adopter, OTHER_PACKET_SHA);
    writeFileSync(
      join(adoptionsRoot(value.repoRoot), `${wrongName}.json`),
      canonicalHandoffAdoptionReceiptBytes(honest.receipt),
    );
    expect(code(() => readHandoffAdoptionReceipt(value.repoRoot, wrongName))).toBe('collaboration_unavailable');
    expect(code(() => listHandoffAdoptionReceipts(value.repoRoot))).toBe('collaboration_unavailable');
  });

  test('adopting a handoff that does not exist here is refused and writes nothing', () => {
    const value = fixture();
    expect(code(() => adoptWorkStateHandoff(adoptInput(value, 'f'.repeat(64)))))
      .toBe('collaboration_invalid');
    expect(listHandoffAdoptionReceipts(value.repoRoot)).toEqual([]);

    // A local handoff first, so the shard exists and the foreign record is the
    // only thing under test rather than a missing directory.
    publishHandoff(value);
    const foreign = fixture();
    const foreignHandoff = publishHandoff(foreign).handoff;
    expect(foreignHandoff.repository_id).not.toBe(repoHarnessRepoIdFor(value.repoRoot));
    writeFileSync(
      join(realpathSync(resolveGitCommonDirectory(value.repoRoot)),
        'repo-harness/collaboration/v1/handoffs', `${foreignHandoff.handoff_id}.json`),
      readFileSync(join(realpathSync(resolveGitCommonDirectory(foreign.repoRoot)),
        'repo-harness/collaboration/v1/handoffs', `${foreignHandoff.handoff_id}.json`), 'utf8'),
    );
    expect(code(() => adoptWorkStateHandoff(adoptInput(value, foreignHandoff.handoff_id))))
      .toBe('collaboration_invalid');
    expect(listHandoffAdoptionReceipts(value.repoRoot)).toEqual([]);
  });

  test('a record id that is not 64 hex is refused before any path is built', () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    const honest = adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id));
    const root = adoptionsRoot(value.repoRoot);

    const malformed = [
      `../../../../${relative('/', join(value.repoRoot, 'escape'))}`,
      '../escape',
      `..${'/..'.repeat(8)}/etc/passwd`,
      join(root, `${honest.receipt_id}.json`),
      `${honest.receipt_id}/../${honest.receipt_id}`,
      honest.receipt_id.toUpperCase(),
      `${honest.receipt_id} `,
      'not-hex',
      '',
      'a'.repeat(63),
      'a'.repeat(65),
    ];
    for (const id of malformed) {
      expect({ id, code: code(() => readHandoffAdoptionReceipt(value.repoRoot, id)) })
        .toEqual({ id, code: 'collaboration_invalid' });
      expect({ id, code: code(() => adoptWorkStateHandoff(adoptInput(value, id))) })
        .toEqual({ id, code: 'collaboration_invalid' });
      expect({ id, code: code(() => listAdoptersOfWorkStateHandoff(value.repoRoot, id)) })
        .toEqual({ id, code: 'collaboration_invalid' });
    }
    // A malformed context packet digest is refused the same way.
    for (const packet of ['2'.repeat(64), 'sha256:short', '', 'sha256:../escape']) {
      expect({ packet, code: code(() => adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id, {
        context_packet_sha256: packet,
      }))) }).toEqual({ packet, code: 'collaboration_invalid' });
    }
    expect(readdirSync(root)).toEqual([`${honest.receipt_id}.json`]);
  });

  test('collaboration.mode off refuses adoption and writes nothing', () => {
    const enabled = fixture();
    const handoff = publishHandoff(enabled).handoff;
    writeFileSync(
      join(enabled.repoRoot, '.ai/harness/policy.json'),
      `${JSON.stringify({ collaboration: { mode: 'off' } }, null, 2)}\n`,
    );
    expect(code(() => adoptWorkStateHandoff(adoptInput(enabled, handoff.handoff_id))))
      .toBe('collaboration_disabled');
    expect(existsSync(adoptionsRoot(enabled.repoRoot))).toBe(false);
  });

  test('an unreadable store fails loud instead of degrading to an empty one', () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    const honest = adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id));
    const root = adoptionsRoot(value.repoRoot);
    const file = join(root, `${honest.receipt_id}.json`);

    writeFileSync(file, '{"protocol":1}');
    expect(code(() => listHandoffAdoptionReceipts(value.repoRoot))).toBe('collaboration_unavailable');
    expect(code(() => readHandoffAdoptionReceipt(value.repoRoot, honest.receipt_id)))
      .toBe('collaboration_unavailable');

    writeFileSync(file, `${JSON.stringify(honest.receipt)} `);
    expect(code(() => readHandoffAdoptionReceipt(value.repoRoot, honest.receipt_id)))
      .toBe('collaboration_unavailable');

    rmSync(file);
    writeFileSync(join(root, 'notes.txt'), 'stray\n');
    expect(code(() => listHandoffAdoptionReceipts(value.repoRoot))).toBe('collaboration_unavailable');
  });

  test("only the store's own staging name is skipped; lookalikes fail the store closed", () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    const honest = adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id));
    const root = adoptionsRoot(value.repoRoot);
    const record = `${honest.receipt_id}.json`;

    const genuine = collaborationStagingName(record);
    writeFileSync(join(root, genuine), 'staged bytes');
    expect(listHandoffAdoptionReceipts(value.repoRoot)).toHaveLength(1);
    rmSync(join(root, genuine));

    const uuid = genuine.slice(genuine.lastIndexOf('.', genuine.length - 5) + 1, -'.tmp'.length);
    for (const lookalike of [
      `.${record}.${process.pid}.${'-'.repeat(36)}.tmp`,
      `.${record}.${process.pid}.${uuid.slice(0, 19)}c${uuid.slice(20)}.tmp`,
      `.${record}.007.${uuid}.tmp`,
    ]) {
      writeFileSync(join(root, lookalike), 'not staging residue');
      expect({ lookalike, code: code(() => listHandoffAdoptionReceipts(value.repoRoot)) })
        .toEqual({ lookalike, code: 'collaboration_unavailable' });
      rmSync(join(root, lookalike));
    }
    expect(listHandoffAdoptionReceipts(value.repoRoot)).toHaveLength(1);
  });

  test('an unmapped authorization cannot adopt', () => {
    const value = fixture();
    const handoff = publishHandoff(value).handoff;
    expect(code(() => adoptWorkStateHandoff(adoptInput(value, handoff.handoff_id, {
      authorization: engineerPrincipalAuthorization('55555555-5555-4555-8555-555555555555'),
    })))).toContain('engineer_principal_unmapped');
    expect(listHandoffAdoptionReceipts(value.repoRoot)).toEqual([]);
  });
});
