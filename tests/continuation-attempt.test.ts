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
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { spawn, spawnSync } from 'child_process';
import type { AttemptReceiptV1, ContinuationEnvelopeV1 } from '../src/core/state/types';
import {
  buildAttemptReceipt,
  evaluateAttemptStall,
  parseAttemptLedger,
} from '../src/core/state/attempt-ledger';
import {
  CLI,
  PLAN,
  commitFixture,
  createEffectiveStateFixture,
  runStateCli,
  withRepo,
  writeFixture as write,
} from './state/effective-state-fixture';

const LEDGER = '.ai/harness/runs/continuation/attempts.jsonl';
const SPRINT = 'plans/sprints/20260803-attempt-fixture.sprint.md';
const SPRINT_MARKER = '.ai/harness/sprint/active-sprint';
const OTHER_UNIT = 'plans/sprints/20260803-other.sprint.md';

interface AttemptArgs {
  readonly unitRef?: string;
  readonly outcome: string;
  readonly before?: string;
  readonly after?: string;
}

function attemptArgv(args: AttemptArgs): string[] {
  return [
    'state', 'attempt', '--json',
    '--unit-ref', args.unitRef ?? PLAN,
    '--outcome', args.outcome,
    ...(args.before === undefined ? [] : ['--before-progress-token', args.before]),
    ...(args.after === undefined ? [] : ['--after-progress-token', args.after]),
  ];
}

function envelopeFrom(cwd: string): ContinuationEnvelopeV1 {
  const run = runStateCli(cwd, ['state', 'next', '--json']);
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  return JSON.parse(run.stdout) as ContinuationEnvelopeV1;
}

/** Record one receipt and assert the recorder accepted it. */
function record(cwd: string, args: AttemptArgs): AttemptReceiptV1 {
  const run = runStateCli(cwd, attemptArgv(args));
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  return JSON.parse(run.stdout) as AttemptReceiptV1;
}

/** Record a turn that completed without moving the token. */
function recordStalled(cwd: string, token: string, unitRef = PLAN): AttemptReceiptV1 {
  return record(cwd, { unitRef, outcome: 'completed', before: token, after: token });
}

function ledgerLines(cwd: string): string[] {
  return readFileSync(join(cwd, LEDGER), 'utf-8').split('\n').filter((line) => line !== '');
}

/**
 * Every real repo-harness repository ignores `.ai/harness/runs/`; the shared
 * fixture does not, because the committed baseline goldens are hashed over its
 * exact tree. Two independent mechanisms keep an appended receipt out of the
 * review subject — that gitignore rule, and `isOperationalReviewPath`'s
 * `.ai/harness/runs/` prefix in `src/effects/review/diff-fingerprint.ts` — and
 * either one alone suffices: with the ignore rule removed the token stayed
 * stable and the breaker still tripped. The rule is applied per fixture for
 * realism, so these tests run against the repository shape that actually
 * ships, not because the breaker depends on it.
 */
function withLedgerRepo(fn: (cwd: string) => void): void {
  withRepo((cwd) => {
    ignoreRunEvidence(cwd);
    fn(cwd);
  });
}

function ignoreRunEvidence(cwd: string): void {
  write(cwd, '.gitignore', `${readFileSync(join(cwd, '.gitignore'), 'utf-8')}.ai/harness/runs/\n`);
  commitFixture(cwd, 'ignore runtime run evidence');
}

function finishedSprint(cwd: string): void {
  rmSync(join(cwd, '.ai/harness/active-plan'), { force: true });
  write(cwd, SPRINT, [
    '# Sprint: Attempt Fixture',
    '',
    '> **Status**: Approved',
    '> **Slug**: attempt-fixture',
    '',
    '## Backlog',
    '',
    '| # | Status | Task | Mode | Acceptance | Plan |',
    '|---|--------|------|------|------------|------|',
    '| 1 | [x] | only work package | contract | done | `plans/archive/plan-first.md` |',
    '',
    '## Execution Log',
    '',
  ].join('\n'));
  write(cwd, SPRINT_MARKER, `${SPRINT}\n`);
  commitFixture(cwd, 'finished sprint, no active plan');
}

function treeFingerprint(root: string): string {
  const entries: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    ))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (relative(root, full) === '.git') continue;
        entries.push(`d ${relative(root, full)}`);
        walk(full);
        continue;
      }
      entries.push(`f ${relative(root, full)} ${createHash('sha256').update(readFileSync(full)).digest('hex')}`);
    }
  };
  walk(root);
  return entries.join('\n');
}

describe('attempt receipt recorder', () => {
  test('appends exactly one well-formed JSONL line per call', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      const first = recordStalled(cwd, token);
      const second = record(cwd, { outcome: 'halted', before: token, after: token });

      expect(first).toEqual({
        protocol: 1,
        kind: 'repo-harness-attempt-receipt',
        unit_ref: PLAN,
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
  });

  test('--outcome resumed may omit both tokens', () => {
    withLedgerRepo((cwd) => {
      const receipt = record(cwd, { outcome: 'resumed' });
      expect(receipt.outcome).toBe('resumed');
      expect(receipt.before_progress_token).toBeNull();
      expect(receipt.after_progress_token).toBeNull();
      expect(ledgerLines(cwd)).toHaveLength(1);
    });
  });

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
  });

  test('a unit_ref containing a space is legal; a NUL byte is rejected', () => {
    withLedgerRepo((cwd) => {
      const spaced = 'plans/plan-with space.md';
      const token = envelopeFrom(cwd).progress_token;
      expect(recordStalled(cwd, token, spaced).unit_ref).toBe(spaced);
      recordStalled(cwd, token, spaced);

      const lines = ledgerLines(cwd);
      expect(lines).toHaveLength(2);
      expect((JSON.parse(lines[0]) as AttemptReceiptV1).unit_ref).toBe(spaced);

      const ledger = parseAttemptLedger(readFileSync(join(cwd, LEDGER), 'utf-8'));
      expect(ledger.status).toBe('ok');
      expect(evaluateAttemptStall(ledger, spaced, token)).toBe('no_progress');
      expect(envelopeFrom(cwd).route).toBe('continue_active_plan');

      // A NUL byte cannot cross `argv`, so the recorder's validator is the
      // surface under test for that half.
      expect(buildAttemptReceipt({
        unitRef: 'plans/plan-\0.md',
        outcome: 'completed',
        beforeProgressToken: token,
        afterProgressToken: token,
        recordedAt: '2026-08-03T00:00:00.000Z',
      })).toEqual({ ok: false, error: '--unit-ref must be a non-empty single-line value' });
    });
  });

  test('the recorder touches no tracked file', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      const before = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).stdout;
      recordStalled(cwd, token);
      expect(spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).stdout).toBe(before);
      expect(existsSync(join(cwd, LEDGER))).toBe(true);
    });
  });

  test('eight parallel recorders append eight intact lines', async () => {
    const fixture = createEffectiveStateFixture();
    try {
      const { cwd } = fixture;
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
      expect(initial.route).toBe('continue_active_plan');

      recordStalled(cwd, initial.progress_token);
      const afterOne = envelopeFrom(cwd);
      expect(afterOne.route).toBe('continue_active_plan');
      expect(afterOne.progress_token).toBe(initial.progress_token);

      recordStalled(cwd, initial.progress_token);
      expect(envelopeFrom(cwd)).toEqual({
        protocol: 1,
        kind: 'repo-harness-continuation-envelope',
        route: 'halt',
        unit_ref: PLAN,
        authority_revision: initial.authority_revision,
        progress_token: initial.progress_token,
        command: null,
        reason: 'no_progress',
      });
    });
  });

  test('a token-moving receipt never counts toward the stall', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      record(cwd, { outcome: 'completed', before: token, after: `${token}-moved` });
      record(cwd, { outcome: 'completed', before: `${token}-moved`, after: token });
      expect(envelopeFrom(cwd).route).toBe('continue_active_plan');
    });
  });

  test('receipts recorded against a superseded token do not halt the current one', () => {
    withLedgerRepo((cwd) => {
      const stale = `${envelopeFrom(cwd).progress_token}-stale`;
      recordStalled(cwd, stale);
      recordStalled(cwd, stale);
      expect(envelopeFrom(cwd).route).toBe('continue_active_plan');
    });
  });

  test('real material progress clears a tripped breaker', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      recordStalled(cwd, token);
      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).route).toBe('halt');

      write(cwd, PLAN, readFileSync(join(cwd, PLAN), 'utf-8')
        .replace('- [ ] implement resolver', '- [x] implement resolver'));
      commitFixture(cwd, 'complete the open plan task');

      const moved = envelopeFrom(cwd);
      expect(moved.progress_token).not.toBe(token);
      expect(moved.route).toBe('verify_or_finish');
    });
  });

  test('an explicit resumed receipt resets the count, which then restarts at one', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      recordStalled(cwd, token);
      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).route).toBe('halt');

      record(cwd, { outcome: 'resumed' });
      expect(envelopeFrom(cwd).route).toBe('continue_active_plan');

      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).route).toBe('continue_active_plan');
      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).reason).toBe('no_progress');
    });
  });

  test('a halted receipt also breaks the trailing run', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      recordStalled(cwd, token);
      record(cwd, { outcome: 'halted', before: token, after: token });
      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).route).toBe('continue_active_plan');
    });
  });

  test("another unit's receipts neither trigger nor clear this unit's stall", () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      recordStalled(cwd, token, OTHER_UNIT);
      recordStalled(cwd, token, OTHER_UNIT);
      recordStalled(cwd, token, OTHER_UNIT);
      expect(envelopeFrom(cwd).route).toBe('continue_active_plan');

      recordStalled(cwd, token);
      record(cwd, { unitRef: OTHER_UNIT, outcome: 'resumed' });
      recordStalled(cwd, token);
      expect(envelopeFrom(cwd).reason).toBe('no_progress');
    });
  });

  test('a corrupt ledger line fails closed with its own halt reason', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      recordStalled(cwd, token);
      writeFileSync(join(cwd, LEDGER), `${readFileSync(join(cwd, LEDGER), 'utf-8')}{not json\n`);

      const halted = envelopeFrom(cwd);
      expect(halted.route).toBe('halt');
      expect(halted.reason).toBe('attempt_ledger_unreadable');
      expect(halted.unit_ref).toBe(PLAN);
      expect(halted.command).toBeNull();
    });
  });

  test('a structurally invalid receipt is unreadable, not silently skipped', () => {
    withLedgerRepo((cwd) => {
      write(cwd, LEDGER, `${JSON.stringify({
        protocol: 1,
        kind: 'repo-harness-attempt-receipt',
        unit_ref: PLAN,
        before_progress_token: null,
        after_progress_token: null,
        outcome: 'completed',
        recorded_at: '2026-08-03T00:00:00.000Z',
      })}\n`);
      expect(envelopeFrom(cwd).reason).toBe('attempt_ledger_unreadable');
    });
  });

  test('an absent or empty ledger leaves every route exactly as it was', () => {
    withLedgerRepo((cwd) => {
      const untouched = envelopeFrom(cwd);
      expect(untouched.route).toBe('continue_active_plan');
      write(cwd, LEDGER, '');
      expect(envelopeFrom(cwd)).toEqual(untouched);
    });
  });
});

describe('circuit breaker scope', () => {
  test('a stalled ledger on the same unit never rewrites a complete route', () => {
    withLedgerRepo((cwd) => {
      finishedSprint(cwd);
      const complete = envelopeFrom(cwd);
      expect(complete.route).toBe('complete');
      expect(complete.unit_ref).toBe(SPRINT);

      recordStalled(cwd, complete.progress_token, SPRINT);
      recordStalled(cwd, complete.progress_token, SPRINT);
      expect(envelopeFrom(cwd)).toEqual(complete);

      writeFileSync(join(cwd, LEDGER), '{not json\n');
      expect(envelopeFrom(cwd)).toEqual(complete);
    });
  });

  test('an unreadable ledger never rewrites an existing halt reason', () => {
    withLedgerRepo((cwd) => {
      write(cwd, '.ai/harness/active-worktree', '/tmp/foreign-worktree\n');
      const blocked = envelopeFrom(cwd);
      expect(blocked.reason).toBe('blockers:conflict:worktree_owner');

      write(cwd, LEDGER, '{not json\n');
      expect(envelopeFrom(cwd)).toEqual(blocked);
    });
  });
});

describe('attempt ledger authority fences', () => {
  test('receipts never move state_revision, progress_token, or authority_revision', () => {
    withLedgerRepo((cwd) => {
      // The fixture resolves blocked (its checks projection fails), so this
      // reads the whole document rather than `--field`, which stays empty for a
      // blocked resolution. `state_version` is a per-resolve allocation and is
      // deliberately not part of the fence.
      const authorityFields = (): Record<string, unknown> => {
        const run = runStateCli(cwd, ['state', 'resolve', '--json']);
        const state = JSON.parse(run.stdout) as Record<string, unknown>;
        return {
          state_revision: state.state_revision,
          progress_token: state.progress_token,
          authority_revision: state.authority_revision,
          blockers: state.blockers,
        };
      };
      const before = authorityFields();
      const envelopeBefore = envelopeFrom(cwd);

      recordStalled(cwd, envelopeBefore.progress_token);
      recordStalled(cwd, envelopeBefore.progress_token);
      record(cwd, { outcome: 'resumed' });

      expect(authorityFields()).toEqual(before);
      const envelopeAfter = envelopeFrom(cwd);
      expect(envelopeAfter.progress_token).toBe(envelopeBefore.progress_token);
      expect(envelopeAfter.authority_revision).toBe(envelopeBefore.authority_revision);
    });
  });

  test('`state next` still performs no writes while reading the ledger', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      recordStalled(cwd, token);
      recordStalled(cwd, token);

      const before = treeFingerprint(cwd);
      const beforeStatus = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).stdout;
      const run = runStateCli(cwd, ['state', 'next', '--json']);

      expect(run.status).toBe(0);
      expect(treeFingerprint(cwd)).toBe(before);
      expect(spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).stdout).toBe(beforeStatus);
      expect(existsSync(join(cwd, '.ai/harness/state/effective.json'))).toBe(false);
    });
  });

  test('identical repo bytes plus identical ledger bytes yield byte-identical output', () => {
    withLedgerRepo((cwd) => {
      const token = envelopeFrom(cwd).progress_token;
      const receipt = recordStalled(cwd, token);
      recordStalled(cwd, token);

      const first = runStateCli(cwd, ['state', 'next', '--json']);
      const second = runStateCli(cwd, ['state', 'next', '--json']);
      expect(first.status).toBe(0);
      expect(second.stdout).toBe(first.stdout);
      expect(first.stdout).toContain('no_progress');
      expect(first.stdout).not.toContain(receipt.recorded_at);
      expect(first.stdout).not.toContain('recorded_at');
      expect(first.stdout).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(first.stdout).not.toContain(cwd);
    });
  });
});
