/**
 * WP3 no-progress circuit breaker.
 *
 * Everything here runs through the source CLI against a real fixture
 * repository, because the properties under test are exactly the ones a unit
 * test of the pure projector cannot prove: that the ledger is ignored runtime
 * evidence, that `state next` still writes nothing while reading it, and that
 * receipts never move the state they describe.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn, spawnSync } from 'child_process';
import type { AttemptReceiptV1, ContinuationEnvelopeV2 } from '../src/core/state/types';
import {
  buildAttemptReceipt,
  evaluateAttemptStall,
  parseAttemptLedger,
} from '../src/core/state/attempt-ledger';
import {
  CLI,
  createEffectiveStateFixture,
  resolveFixtureState,
  runStateCli,
  withRepo,
  writeFixture as write,
} from './state/effective-state-fixture';

const LEDGER = '.ai/harness/runs/continuation/attempts.jsonl';
const OTHER_UNIT = 'sha256:other-unit';

interface AttemptArgs {
  readonly unitRef?: string;
  readonly outcome: string;
  readonly before?: string;
  readonly after?: string;
}

function attemptArgv(args: AttemptArgs): string[] {
  return [
    'state', 'attempt', '--json',
    '--unit-ref', args.unitRef ?? 'sha256:fixture-unit',
    '--outcome', args.outcome,
    ...(args.before === undefined ? [] : ['--before-progress-token', args.before]),
    ...(args.after === undefined ? [] : ['--after-progress-token', args.after]),
  ];
}

function writeHandoff(cwd: string, nextStep = 'implement resolver'): void {
  const authority = resolveFixtureState(cwd).authority_revision;
  write(cwd, '.ai/harness/handoff/current.md', [
    '> **Source State Revision**: ' + authority,
    '- Exact Next Step: ' + nextStep,
  ].join('\n'));
}

function envelopeFrom(cwd: string): ContinuationEnvelopeV2 {
  const run = runStateCli(cwd, ['state', 'next', '--json']);
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  return JSON.parse(run.stdout) as ContinuationEnvelopeV2;
}

/** Record one receipt and assert the recorder accepted it. */
function record(cwd: string, args: AttemptArgs): AttemptReceiptV1 {
  const run = runStateCli(cwd, attemptArgv(args));
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  return JSON.parse(run.stdout) as AttemptReceiptV1;
}

/** Record a turn that completed without moving the token. */
function recordStalled(cwd: string, token: string, unitRef?: string): AttemptReceiptV1 {
  const unit = unitRef ?? envelopeFrom(cwd).unit_ref;
  if (unit === null) throw new Error('fixture route must be actionable');
  return record(cwd, { unitRef: unit, outcome: 'completed', before: token, after: token });
}

function ledgerLines(cwd: string): string[] {
  return readFileSync(join(cwd, LEDGER), 'utf-8').split('\n').filter((line) => line !== '');
}

function withLedgerRepo(fn: (cwd: string) => void): void {
  withRepo((cwd) => {
    write(cwd, '.gitignore', readFileSync(join(cwd, '.gitignore'), 'utf-8') + '.ai/harness/runs/\n');
    writeHandoff(cwd);
    fn(cwd);
  });
}

describe('attempt receipt recorder', () => {
  test('appends exactly one well-formed JSONL line per call', () => {
    withLedgerRepo((cwd) => {
      const envelope = envelopeFrom(cwd);
      const token = envelope.progress_token;
      const first = recordStalled(cwd, token);
      const second = record(cwd, { unitRef: envelope.unit_ref!, outcome: 'halted', before: token, after: token });

      expect(first).toEqual({
        protocol: 1,
        kind: 'repo-harness-attempt-receipt',
        unit_ref: envelope.unit_ref!,
        before_progress_token: token,
        after_progress_token: token,
        outcome: 'completed',
        recorded_at: first.recorded_at,
      });
      expect(first.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
      expect(Object.keys(first as unknown as Record<string, unknown>)).toEqual([
        'protocol',
        'kind',
        'unit_ref',
        'before_progress_token',
        'after_progress_token',
        'outcome',
        'recorded_at',
      ]);

      const lines = ledgerLines(cwd);
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual(first as unknown as Record<string, unknown>);
      expect(JSON.parse(lines[1])).toEqual(second as unknown as Record<string, unknown>);
    });
  }, 30_000);

  test('--outcome resumed may omit both tokens', () => {
    withLedgerRepo((cwd) => {
      const receipt = record(cwd, { outcome: 'resumed' });
      expect(receipt.outcome).toBe('resumed');
      expect(receipt.before_progress_token).toBeNull();
      expect(receipt.after_progress_token).toBeNull();
      expect(ledgerLines(cwd)).toHaveLength(1);
    });
  }, 30_000);

  test('rejects an unknown outcome and a token-bearing outcome without tokens', () => {
    withLedgerRepo((cwd) => {
      const unknown = runStateCli(cwd, attemptArgv({ outcome: 'skipped' }));
      expect(unknown.status).toBe(2);
      expect(unknown.stdout).toBe('');
      expect(unknown.stderr).toContain('--outcome must be one of: completed, halted, resumed');

      const untokened = runStateCli(cwd, attemptArgv({ outcome: 'completed' }));
      expect(untokened.status).toBe(2);
      expect(untokened.stderr).toContain('--outcome completed requires');

      expect(existsSync(join(cwd, LEDGER))).toBe(false);
    });
  }, 30_000);

  test('a unit_ref containing a space is legal; a NUL byte is rejected', () => {
    withLedgerRepo((cwd) => {
      const envelope = envelopeFrom(cwd);
      const token = envelope.progress_token;
      const spaced = 'unit with space';
      expect(recordStalled(cwd, token, spaced).unit_ref).toBe(spaced);
      recordStalled(cwd, token, spaced);

      const lines = ledgerLines(cwd);
      expect(lines).toHaveLength(2);
      expect((JSON.parse(lines[0]) as AttemptReceiptV1).unit_ref).toBe(spaced);

      const ledger = parseAttemptLedger(readFileSync(join(cwd, LEDGER), 'utf-8'));
      expect(ledger.status).toBe('ok');
      expect(evaluateAttemptStall(ledger, spaced, token)).toBe('no_progress');
      expect(envelopeFrom(cwd).route).toBe('continue');

      // A NUL byte cannot cross `argv`, so the recorder's validator is the
      // surface under test for that half.
      expect(buildAttemptReceipt({
        unitRef: 'unit-\0with-nul',
        outcome: 'completed',
        beforeProgressToken: token,
        afterProgressToken: token,
        recordedAt: '2026-08-03T00:00:00.000Z',
      })).toEqual({ ok: false, error: '--unit-ref must be a non-empty single-line value' });
    });
  }, 30_000);

  test('the recorder touches no tracked file', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      const before = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).stdout;
      recordStalled(cwd, token);
      expect(spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).stdout).toBe(before);
      expect(existsSync(join(cwd, LEDGER))).toBe(true);
    });
  }, 30_000);

  test('eight parallel recorders append eight intact lines', async () => {
    const fixture = createEffectiveStateFixture();
    try {
      const { cwd } = fixture;
      write(fixture.cwd, '.gitignore', readFileSync(join(cwd, '.gitignore'), 'utf-8') + '.ai/harness/runs/\n');
      const token = envelopeFrom(cwd).progress_token;
      const codes = await Promise.all(Array.from({ length: 8 }, (_, index) => (
        new Promise<number | null>((settle) => {
          const child = spawn(process.execPath, [CLI, ...attemptArgv({
            outcome: 'completed',
            before: token,
            after: `${token}-${index}`,
          })], { cwd, stdio: 'ignore' });
          child.on('close', (code) => settle(code));
        })
      )));

      expect(codes).toEqual(Array.from({ length: 8 }, () => 0));
      const lines = ledgerLines(cwd);
      expect(lines).toHaveLength(8);
      const afters = lines
        .map((line) => (JSON.parse(line) as AttemptReceiptV1).after_progress_token)
        .sort();
      expect(afters).toEqual(Array.from({ length: 8 }, (_, index) => `${token}-${index}`).sort());
    } finally {
      fixture.cleanup();
    }
  }, 120_000);
});

describe('no-progress circuit breaker', () => {
  test('two consecutive no-progress receipts halt an otherwise actionable route', () => {
    withLedgerRepo((cwd) => {
      const initial = envelopeFrom(cwd);
      expect(initial.route).toBe('continue');

      recordStalled(cwd, initial.progress_token);
      const afterOne = envelopeFrom(cwd);
      expect(afterOne.route).toBe('continue');
      expect(afterOne.progress_token).toBe(initial.progress_token);

      recordStalled(cwd, initial.progress_token);
      expect(envelopeFrom(cwd)).toEqual({
        protocol: 2,
        kind: 'repo-harness-continuation-envelope',
        route: 'halt',
        unit_ref: initial.unit_ref,
        authority_revision: initial.authority_revision,
        progress_token: initial.progress_token,
        command: null,
        reason: 'no_progress',
      });
    });
  }, 30_000);

  test('a token-moving receipt never counts toward the stall', () => {
    withLedgerRepo((cwd) => {
      const envelope = envelopeFrom(cwd);
      const token = envelope.progress_token;
      record(cwd, { unitRef: envelope.unit_ref!, outcome: 'completed', before: token, after: `${token}-moved` });
      record(cwd, { unitRef: envelope.unit_ref!, outcome: 'completed', before: `${token}-moved`, after: token });
      expect(envelopeFrom(cwd).route).toBe('continue');
    });
  }, 30_000);

  test('receipts recorded against a superseded token do not halt the current one', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      recordStalled(cwd, `${token}-stale`);
      recordStalled(cwd, `${token}-stale`);
      expect(envelopeFrom(cwd).route).toBe('continue');
    });
  }, 30_000);

  test('real material progress clears a tripped breaker', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      recordStalled(cwd, token);
      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).route).toBe('halt');

      write(cwd, 'src/feature.ts', 'export const feature = 2;\n');
      const add = spawnSync('git', ['add', 'src/feature.ts'], { cwd, encoding: 'utf-8' });
      expect(add.status, add.stderr).toBe(0);
      const git = spawnSync('git', ['commit', '-m', 'material progress'], { cwd, encoding: 'utf-8' });
      expect(git.status, git.stderr).toBe(0);

      const moved = envelopeFrom(cwd);
      expect(moved.progress_token).not.toBe(token);
      expect(moved.route).toBe('continue');
    });
  }, 30_000);

  test('an explicit resumed receipt resets the count, which then restarts at one', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      const envelope = envelopeFrom(cwd);
      recordStalled(cwd, token);
      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).route).toBe('halt');

      record(cwd, { unitRef: envelope.unit_ref!, outcome: 'resumed' });
      expect(envelopeFrom(cwd).route).toBe('continue');

      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).route).toBe('continue');
      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).reason).toBe('no_progress');
    });
  }, 30_000);

  test('a halted receipt also breaks the trailing run', () => {
    withLedgerRepo((cwd) => {
      const envelope = envelopeFrom(cwd);
      const token = envelope.progress_token;
      recordStalled(cwd, token);
      record(cwd, { unitRef: envelope.unit_ref!, outcome: 'halted', before: token, after: token });
      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).route).toBe('continue');
    });
  }, 30_000);

  test("another unit's receipts neither trigger nor clear this unit's stall", () => {
    withLedgerRepo((cwd) => {
      const envelope = envelopeFrom(cwd);
      const token = envelope.progress_token;
      recordStalled(cwd, token, OTHER_UNIT);
      recordStalled(cwd, token, OTHER_UNIT);
      recordStalled(cwd, token, OTHER_UNIT);
      expect(envelopeFrom(cwd).route).toBe('continue');

      recordStalled(cwd, token);
      record(cwd, { unitRef: OTHER_UNIT, outcome: 'resumed' });
      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).reason).toBe('no_progress');
    });
  }, 30_000);

  test('a corrupt ledger line fails closed with its own halt reason', () => {
    withLedgerRepo((cwd) => {
      const envelope = envelopeFrom(cwd);
      const token = envelope.progress_token;
      recordStalled(cwd, token);
      writeFileSync(join(cwd, LEDGER), readFileSync(join(cwd, LEDGER), 'utf-8') + '{not json\n');

      const halted = envelopeFrom(cwd);
      expect(halted.route).toBe('halt');
      expect(halted.reason).toBe('attempt_ledger_unreadable');
      expect(halted.unit_ref).toBe(envelope.unit_ref);
      expect(halted.command).toBeNull();
    });
  }, 30_000);

  test('a structurally invalid receipt is unreadable, not silently skipped', () => {
    withLedgerRepo((cwd) => {
      write(cwd, LEDGER, JSON.stringify({
        protocol: 1,
        kind: 'repo-harness-attempt-receipt',
        unit_ref: 'sha256:fixture-unit',
        before_progress_token: null,
        after_progress_token: null,
        outcome: 'completed',
        recorded_at: '2026-08-03T00:00:00.000Z',
      }) + '\n');
      expect(envelopeFrom(cwd).reason).toBe('attempt_ledger_unreadable');
    });
  }, 30_000);

  test('an absent or empty ledger leaves every route exactly as it was', () => {
    withLedgerRepo((cwd) => {
      const untouched = envelopeFrom(cwd);
      expect(untouched.route).toBe('continue');
      write(cwd, LEDGER, '');
      expect(envelopeFrom(cwd)).toEqual(untouched);
    });
  }, 30_000);
});

describe('circuit breaker scope', () => {
  test('a stalled idle route is never rewritten', () => {
    withLedgerRepo((cwd) => {
      write(cwd, '.ai/harness/handoff/current.md', '# no actionable next step\n');
      const complete = envelopeFrom(cwd);
      expect(complete.route).toBe('idle');
      expect(complete.unit_ref).toBeNull();

      recordStalled(cwd, complete.progress_token, 'sha256:other-unit');
      recordStalled(cwd, complete.progress_token, 'sha256:other-unit');
      expect(envelopeFrom(cwd)).toEqual(complete);

      writeFileSync(join(cwd, LEDGER), '{not json\n');
      expect(envelopeFrom(cwd)).toEqual(complete);
    });
  }, 30_000);

  test('an unreadable ledger never rewrites an existing halt reason', () => {
    withLedgerRepo((cwd) => {
      write(cwd, '.ai/harness/active-worktree', '/tmp/foreign-worktree\n');
      const blocked = envelopeFrom(cwd);
      expect(blocked.reason).toBe('blockers:conflict:worktree_owner');

      write(cwd, LEDGER, '{not json\n');
      expect(envelopeFrom(cwd)).toEqual(blocked);
    });
  }, 30_000);
});
