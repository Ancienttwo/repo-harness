/**
 * WP4 host Goal conformance.
 *
 * Two properties this file owns, both of which only a whole-loop run can show:
 *
 * 1. The receipt-invisibility disjunction. Attempt receipts are kept out of
 *    `progress_token` by two independent mechanisms -- the gitignore rule and
 *    `isOperationalReviewPath`'s `.ai/harness/runs/` prefix -- and either alone
 *    suffices. `tests/continuation-attempt.test.ts` states that in a comment;
 *    here both arms are bound to assertions so neither can be dropped silently.
 *
 * 2. The tick itself, end to end, in a disposable repository: opening envelope
 *    -> one bounded unit -> closing envelope -> attempt receipt -> post-receipt
 *    envelope. The driver selects routes and public commands only from the
 *    envelope it just read plus the stdout of the command it named. The bounded
 *    worker still reads the plan path explicitly returned by state resolution;
 *    no prior chat or hidden driver state selects the next unit.
 *
 * See: docs/reference-configs/long-run-continuation.md
 *      plans/sprints/20260803-1810-long-run-anti-drift.sprint.md (WP4)
 *      docs/researches/20260803-loopx-comparative-analysis.md (9 + addendum)
 */
import { describe, expect, test, setDefaultTimeout } from 'bun:test';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';
import type { ContinuationEnvelopeV1 } from '../src/core/state/types';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const LEDGER = '.ai/harness/runs/continuation/attempts.jsonl';
const SPRINT = 'plans/sprints/20260803-0000-conformance.sprint.md';

setDefaultTimeout(240_000);

// Ambient authority vars would let the helpers repoint themselves at the real
// repository; bun runs test files in one process, so a leaked value from a
// concurrent file must not reach a fixture subprocess.
const AUTHORITY_ENV_KEYS = [
  'REPO_HARNESS_TARGET_REPO_ROOT',
  'REPO_HARNESS_HELPER_SOURCE',
  'REPO_HARNESS_HELPER_SOURCE_PATH',
  'REPO_HARNESS_SOURCE_ROOT',
  'REPO_HARNESS_GIT_BIN',
] as const;

function isolatedEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const base = { ...process.env };
  for (const key of AUTHORITY_ENV_KEYS) delete base[key];
  return { ...base, ...extra };
}

interface Run {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = {}): Run {
  const result = spawnSync(command, args as string[], { cwd, encoding: 'utf-8', env: isolatedEnv(env) });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function git(cwd: string, args: readonly string[]): Run {
  return run('git', args, cwd);
}

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('attempt receipts are invisible to progress_token by two independent mechanisms', () => {
  // Arm 1, against the real repository: the shipped ignore rule covers the
  // ledger, so it never reaches the Git scan that builds the review subject.
  test('the shipped .gitignore covers the attempt ledger path', () => {
    const ignored = git(ROOT, ['check-ignore', '-q', LEDGER]);
    expect(ignored.status, `git check-ignore did not cover ${LEDGER}`).toBe(0);
  });

  // Arm 2, in a repository with no ignore rule at all: the review-subject
  // classifier alone excludes the ledger. `isOperationalReviewPath` is module
  // private, so this asserts through its only exported consumer -- the same
  // predicate that decides `paths` vs `excluded_paths`.
  test('the review-subject classifier excludes the ledger even when it is not ignored', () => {
    withTempDir('continuation-classifier', (cwd) => {
      expect(git(cwd, ['init', '-q', '-b', 'main', '.']).status).toBe(0);
      expect(git(cwd, ['config', 'user.email', 'conformance@test.local']).status).toBe(0);
      expect(git(cwd, ['config', 'user.name', 'Conformance Test']).status).toBe(0);
      writeFileSync(join(cwd, 'README.md'), 'fixture\n');
      expect(git(cwd, ['add', '-A']).status).toBe(0);
      expect(git(cwd, ['commit', '-qm', 'fixture']).status).toBe(0);

      // No .gitignore in this repository: the ledger is a plain untracked file.
      mkdirSync(join(cwd, '.ai/harness/runs/continuation'), { recursive: true });
      writeFileSync(join(cwd, LEDGER), '{"protocol":1}\n');
      expect(existsSync(join(cwd, '.gitignore'))).toBe(false);
      expect(git(cwd, ['check-ignore', '-q', LEDGER]).status).not.toBe(0);

      const subject = buildReviewSubject(cwd);
      expect(subject.status).toBe('ok');
      expect(subject.excluded_paths).toContain(LEDGER);
      expect(subject.paths).not.toContain(LEDGER);
    });
  });
});

/**
 * A disposable repo-harness repository: real `sprint-backlog`, `capture-plan`,
 * `plan-to-todo`, `contract-worktree`, and `archive-workflow` helpers over an
 * Approved sprint with two contract rows.
 *
 * The gate helpers are stubbed exactly as `contract-worktree-closeout-journal`
 * stubs them (merge gate seals the current HEAD, acceptance receipt passes,
 * architecture freshness passes, verify-sprint emits the passing evidence
 * bundle its consumers read). Their internals are not what WP4 asserts; the
 * loop shape around them is, and each has its own suite.
 */
interface Fixture {
  readonly container: string;
  readonly primary: string;
  readonly journalRoot: string;
  readonly fakeGit: string;
  readonly pidFile: string;
  readonly driverLog: string;
  readonly gateLog: string;
}

const VERIFY_SPRINT_STUB = [
  '#!/bin/bash',
  '[[ -z "${CONFORMANCE_GATE_LOG:-}" ]] || printf \'verify-sprint %s\\n\' "$*" >> "$CONFORMANCE_GATE_LOG"',
  '[[ "${1:-}" != "--prepare-acceptance" ]] || exit 0',
  'contract="$(ls tasks/contracts/*.contract.md 2>/dev/null | head -1)"',
  'review="$(ls tasks/reviews/*.review.md 2>/dev/null | head -1)"',
  'mkdir -p .ai/harness/checks',
  `printf '{"status":"pass","source":"verify-sprint","exit_code":0,"contract":{"file":"%s"},"review":{"file":"%s"},"benchmark_evidence":{"status":"not_applicable","report_sha256":"","benchmark_subject_sha256":""}}\\n' "$contract" "$review" > .ai/harness/checks/latest.json`,
  'exit 0',
  '',
].join('\n');

// The trusted-shim fault pattern from tests/contract-worktree-closeout-journal.ts:
// every git call passes through to the real binary, except that the helper is
// SIGKILLed as soon as the journal has durably recorded the phase under test.
const FAKE_GIT = [
  '#!/bin/bash',
  'if [[ -n "${FAULT_AFTER_PHASE:-}" && -n "${FAULT_JOURNAL_DIR:-}" && -f "${FAULT_PID_FILE:-/nonexistent}" ]]; then',
  '  matched=0',
  '  for status_file in "$FAULT_JOURNAL_DIR"/*/status.json; do',
  '    [[ -f "$status_file" ]] || continue',
  '    grep -q "\\"phase\\": \\"$FAULT_AFTER_PHASE\\"" "$status_file" && matched=1',
  '  done',
  '  if [[ "$matched" -eq 1 ]]; then',
  '    kill -9 "$(cat "$FAULT_PID_FILE")" 2>/dev/null || true',
  '    exit 137',
  '  fi',
  'fi',
  'exec /usr/bin/git "$@"',
  '',
].join('\n');

const SPRINT_TEXT = [
  '# Sprint: Conformance Fixture',
  '',
  '> **Status**: Approved',
  '> **Slug**: conformance',
  '> **Created**: 2026-08-03 00:00',
  '> **Updated**: 2026-08-03 00:00',
  '> **Source Spec**: `docs/spec.md`',
  '> **Goal Mode**: incremental',
  '',
  '## PRD',
  '',
  'Real problem statement with concrete user outcomes.',
  '',
  '## Backlog',
  '',
  '| # | Status | Task | Mode | Acceptance | Plan |',
  '|---|--------|------|------|------------|------|',
  '| 1 | [ ] | row-one | contract | first slice lands | (pending) |',
  '| 2 | [ ] | row-two | contract | second slice lands | (pending) |',
  '',
  '## Execution Log',
  '',
  '| When | Task | Plan | Result |',
  '|------|------|------|--------|',
  '',
].join('\n');

function installFixture(container: string): Fixture {
  const primary = join(container, 'primary');
  mkdirSync(primary, { recursive: true });
  expect(git(primary, ['init', '-q', '-b', 'main', '.']).status).toBe(0);
  expect(git(primary, ['config', 'user.name', 'Conformance Test']).status).toBe(0);
  expect(git(primary, ['config', 'user.email', 'conformance@test.local']).status).toBe(0);

  for (const dir of [
    'scripts',
    '.ai/hooks/lib',
    '.ai/harness/checks',
    '.ai/harness/runs',
    '.ai/harness/sprint',
    'plans/sprints',
    'plans/archive',
    'tasks/contracts',
    'tasks/reviews',
    'tasks/notes',
    'tasks/archive',
  ]) {
    mkdirSync(join(primary, dir), { recursive: true });
  }
  for (const helper of [
    'sprint-backlog.sh',
    'capture-plan.sh',
    'plan-to-todo.sh',
    'contract-worktree.sh',
    'archive-workflow.sh',
  ]) {
    copyFileSync(join(ROOT, 'scripts', helper), join(primary, 'scripts', helper));
    chmodSync(join(primary, 'scripts', helper), 0o755);
  }
  copyFileSync(
    join(ROOT, 'assets/hooks/lib/workflow-state.sh'),
    join(primary, '.ai/hooks/lib/workflow-state.sh'),
  );

  writeFileSync(
    join(primary, 'scripts/acceptance-receipt.ts'),
    [
      'import { appendFileSync } from "fs";',
      'const log = process.env.CONFORMANCE_GATE_LOG;',
      'if (!log) process.exit(2);',
      'appendFileSync(log, `acceptance-receipt ${process.argv.slice(2).join(" ")}\\n`);',
      'process.exit(0);',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(primary, 'scripts/merge-gate.ts'),
    [
      'import { spawnSync } from "child_process";',
      'const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();',
      'process.stdout.write(`${head}\\n`);',
      '',
    ].join('\n'),
  );
  writeExecutable(join(primary, 'scripts/check-architecture-sync.sh'), '#!/bin/bash\nexit 0\n');
  writeExecutable(join(primary, 'scripts/verify-sprint.sh'), VERIFY_SPRINT_STUB);
  writeExecutable(
    join(primary, 'scripts/refresh-current-status.sh'),
    "#!/bin/bash\nprintf '# Current Status Snapshot\\n\\n> **Status**: Idle\\n' > tasks/current.md\n",
  );

  writeFileSync(
    join(primary, '.ai/harness/policy.json'),
    `${JSON.stringify({
      worktree_strategy: {
        auto_for_contract_tasks: true,
        review_base: 'main',
        branch_prefix: 'codex/',
        merge_back: { target: 'main' },
      },
    }, null, 2)}\n`,
  );
  writeFileSync(join(primary, SPRINT), SPRINT_TEXT);
  writeFileSync(join(primary, '.ai/harness/sprint/active-sprint'), `${SPRINT}\n`);
  writeFileSync(
    join(primary, 'tasks/todos.md'),
    [
      '# Deferred Goal Ledger',
      '',
      '> **Status**: Backlog',
      '> **Updated**: fixture',
      '',
      '## Deferred Goals',
      '',
      '| Goal | Why Deferred | Tradeoff | Revisit Trigger |',
      '|------|--------------|----------|-----------------|',
      '| (none) | none | none | none |',
      '',
    ].join('\n'),
  );
  writeFileSync(join(primary, 'tasks/current.md'), '# Current Status Snapshot\n\n> **Status**: Active\n');
  // The shape a real repo-harness repository ships: every runtime evidence
  // surface, the attempt ledger included, is ignored.
  writeFileSync(
    join(primary, '.gitignore'),
    [
      '.ai/harness/state/',
      '.ai/harness/checks/',
      '.ai/harness/handoff/',
      '.ai/harness/runs/',
      '.ai/harness/worktrees/',
      '.ai/harness/sprint/',
      '.ai/harness/active-worktree',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(primary, '.ai/harness/checks/latest.json'),
    '{"status":"pass","source":"verify-sprint","exit_code":0}\n',
  );

  expect(git(primary, ['add', '-A']).status).toBe(0);
  expect(git(primary, ['commit', '-qm', 'fixture']).status).toBe(0);

  const fakeGit = join(container, 'fake-git.sh');
  writeExecutable(fakeGit, FAKE_GIT);
  const driverLog = join(primary, '.ai/harness/runs/conformance-driver.log');
  const gateLog = join(primary, '.ai/harness/runs/conformance-gate.log');
  writeFileSync(driverLog, '');
  writeFileSync(gateLog, '');

  return {
    container,
    primary,
    journalRoot: join(primary, '.git/repo-harness/transactions'),
    fakeGit,
    pidFile: join(container, 'fault.pid'),
    driverLog,
    gateLog,
  };
}

/** Read one continuation envelope. This is the only thing the driver reads. */
function tick(cwd: string): ContinuationEnvelopeV1 {
  const result = run(process.execPath, [CLI, 'state', 'next', '--json'], cwd);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as ContinuationEnvelopeV1;
}

function rawTick(cwd: string): string {
  const result = run(process.execPath, [CLI, 'state', 'next', '--json'], cwd);
  expect(result.status).toBe(0);
  return result.stdout;
}

/** Record one AttemptReceiptV1 through the shipped recorder. */
function recordAttempt(
  cwd: string,
  args: {
    readonly unitRef: string;
    readonly outcome: string;
    readonly token?: string;
    readonly afterToken?: string;
  },
): void {
  const result = run(process.execPath, [
    CLI, 'state', 'attempt', '--json',
    '--unit-ref', args.unitRef,
    '--outcome', args.outcome,
    ...(args.token === undefined
      ? []
      : [
        '--before-progress-token', args.token,
        '--after-progress-token', args.afterToken ?? args.token,
      ]),
  ], cwd);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
}

/**
 * Run a fixture-local helper the way `repo-harness run` does: the repo's own
 * copy, with the trusted Bun runtime injected. The packaged `repo-harness run`
 * resolves helpers from the installed package rather than the target repo, so
 * a disposable repository has to invoke its own copies directly.
 */
function helper(cwd: string, script: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): Run {
  return run('bash', [script, ...args], cwd, {
    HOOK_HOST: 'codex',
    REPO_HARNESS_HOOK_CLI: join(ROOT, 'src/cli/hook-entry.ts'),
    REPO_HARNESS_BUN_BIN: process.execPath,
    REPO_HARNESS_WORKFLOW_STATE_LIB: join(cwd, '.ai/hooks/lib/workflow-state.sh'),
    ...env,
  });
}

/** The same helper under a launcher that publishes its PID so the shim can kill it. */
function helperWithFault(
  fixture: Fixture,
  cwd: string,
  script: string,
  args: readonly string[],
  phase: string,
): Run {
  return run(
    'bash',
    ['-c', 'echo $$ > "$FAULT_PID_FILE"; exec "$@"', 'closeout-fault', 'bash', script, ...args],
    cwd,
    {
      HOOK_HOST: 'codex',
      REPO_HARNESS_HOOK_CLI: join(ROOT, 'src/cli/hook-entry.ts'),
      REPO_HARNESS_BUN_BIN: process.execPath,
      REPO_HARNESS_WORKFLOW_STATE_LIB: join(cwd, '.ai/hooks/lib/workflow-state.sh'),
      REPO_HARNESS_GIT_BIN: fixture.fakeGit,
      FAULT_PID_FILE: fixture.pidFile,
      FAULT_AFTER_PHASE: phase,
      FAULT_JOURNAL_DIR: join(fixture.journalRoot, 'finish'),
      CONFORMANCE_GATE_LOG: fixture.gateLog,
    },
  );
}

const HOST_COMMAND = {
  advanceSprint: 'repo-harness run sprint-backlog start-task --execute',
  resolveState: 'repo-harness state resolve --json',
  prepareAcceptance: 'repo-harness run verify-sprint --prepare-acceptance',
  recordAcceptance: 'repo-harness run acceptance-receipt record',
  verifySprint: 'repo-harness run verify-sprint',
  finishMerge: 'repo-harness run contract-worktree finish --merge',
} as const;

function recordDriverCommand(fixture: Fixture, command: string): void {
  appendFileSync(fixture.driverLog, `${command}\n`);
}

/** Execute the public command named by an envelope or by the protocol table. */
function executeHostCommand(fixture: Fixture, cwd: string, command: string): Run {
  recordDriverCommand(fixture, command);
  const gateEnv = { CONFORMANCE_GATE_LOG: fixture.gateLog };
  switch (command) {
    case HOST_COMMAND.advanceSprint:
      return helper(cwd, 'scripts/sprint-backlog.sh', ['start-task', '--execute'], gateEnv);
    case HOST_COMMAND.resolveState:
      return run(process.execPath, [CLI, 'state', 'resolve', '--json'], cwd);
    case HOST_COMMAND.prepareAcceptance:
      return helper(cwd, 'scripts/verify-sprint.sh', ['--prepare-acceptance'], gateEnv);
    case HOST_COMMAND.recordAcceptance:
      return run(process.execPath, ['scripts/acceptance-receipt.ts', 'record'], cwd, gateEnv);
    case HOST_COMMAND.verifySprint:
      return helper(cwd, 'scripts/verify-sprint.sh', [], gateEnv);
    case HOST_COMMAND.finishMerge:
      return helper(cwd, 'scripts/contract-worktree.sh', ['finish', '--merge'], gateEnv);
    default:
      throw new Error(`unsupported conformance host command: ${command}`);
  }
}

function planFromResolvedState(result: Run): string {
  // `state resolve` returns exit 1 when its edit-scoped brief carries blockers,
  // while still emitting the complete structured state on stdout. Routing stays
  // with the inspect-scoped envelope; this command supplies the bounded brief.
  expect(result.status === 0 || result.status === 1, `${result.stdout}\n${result.stderr}`).toBe(true);
  const resolved = JSON.parse(result.stdout) as { authoritative_plan?: { path?: string } };
  expect(resolved.authoritative_plan?.path).toBeDefined();
  return resolved.authoritative_plan!.path!;
}

function runCompletionGate(fixture: Fixture, cwd: string, envelope: ContinuationEnvelopeV1): void {
  expect(envelope.command).toBe(HOST_COMMAND.verifySprint);
  for (const command of [
    HOST_COMMAND.prepareAcceptance,
    HOST_COMMAND.recordAcceptance,
    envelope.command!,
  ]) {
    const result = executeHostCommand(fixture, cwd, command);
    expect(result.status, `${command}\n${result.stdout}\n${result.stderr}`).toBe(0);
  }
}

function journalDirs(fixture: Fixture): string[] {
  const base = join(fixture.journalRoot, 'finish');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((name) => join(base, name))
    .filter((dir) => existsSync(join(dir, 'status.json')));
}

function journalStatus(dir: string): { status: string; phases: string[] } {
  const raw = JSON.parse(readFileSync(join(dir, 'status.json'), 'utf-8')) as {
    status: string;
    phases: { phase: string }[];
  };
  return { status: raw.status, phases: raw.phases.map((entry) => entry.phase) };
}

/**
 * Execute the sprint row's bounded unit: one real implementation file plus the
 * plan's own task checkboxes. Both are inside the generated contract's
 * `allowed_paths`, and the `src/` file is what actually moves `progress_token`.
 */
function completeBoundedUnit(worktree: string, planPath: string, marker: string): void {
  mkdirSync(join(worktree, 'src'), { recursive: true });
  writeFileSync(join(worktree, `src/${marker}.ts`), `export const ${marker.replace(/-/g, '_')} = 1;\n`);
  const plan = readFileSync(join(worktree, planPath), 'utf-8');
  writeFileSync(join(worktree, planPath), plan.replace(/^- \[ \]/gm, '- [x]'));
  expect(git(worktree, ['add', '-A']).status).toBe(0);
  expect(git(worktree, ['commit', '-qm', `${marker} slice`]).status).toBe(0);
}

/** The worktree the executed `advance_sprint` command reported creating. */
function createdWorktree(stdout: string): string {
  const match = stdout.match(/\[ContractWorktree\] Created worktree: (\S+)/);
  expect(match, `advance_sprint output did not name a worktree:\n${stdout}`).not.toBeNull();
  return match![1]!;
}

describe('host Goal conformance: the full tick over a disposable repository', () => {
  test('a chat-memoryless driver completes two rows, survives a SIGKILLed closeout, stalls, and ends at complete', () => {
    withTempDir('continuation-conformance', (container) => {
      const fixture = installFixture(container);
      const { primary } = fixture;

      // --- Row 1, tick 1: the only input is the envelope. ------------------
      const start = tick(primary);
      expect(start.route).toBe('advance_sprint');
      expect(start.unit_ref).toBe(SPRINT);
      expect(start.command).toBe('repo-harness run sprint-backlog start-task --execute');

      const advance = executeHostCommand(fixture, primary, start.command!);
      expect(advance.status, `${advance.stdout}\n${advance.stderr}`).toBe(0);
      const worktreeOne = createdWorktree(advance.stdout);

      // --- Row 1, tick 2: the unit moved into its worktree. ----------------
      const openPlan = tick(worktreeOne);
      expect(openPlan.route).toBe('continue_active_plan');
      expect(openPlan.command).toBe('repo-harness state resolve --json');
      expect(openPlan.reason.startsWith('next_action:')).toBe(true);
      const resolvedOne = executeHostCommand(fixture, worktreeOne, openPlan.command!);
      const planOne = planFromResolvedState(resolvedOne);
      expect(planOne).toBe(openPlan.unit_ref!);
      expect(planOne).toMatch(/^plans\/plan-\d{8}-\d{4}-row-one\.md$/);

      completeBoundedUnit(worktreeOne, planOne, 'row-one');

      // --- Row 1, tick 3: the plan has no open task left. ------------------
      // Receipt follows the documented discipline: before = the opening
      // envelope's token, after = the closing envelope's token.
      const readyOne = tick(worktreeOne);
      recordAttempt(worktreeOne, {
        unitRef: planOne,
        outcome: 'completed',
        token: openPlan.progress_token,
        afterToken: readyOne.progress_token,
      });
      // The bounded unit was real work, so the breaker never arms.
      expect(readyOne.progress_token).not.toBe(openPlan.progress_token);
      const actionableOne = tick(worktreeOne);
      expect(actionableOne.route).toBe('verify_or_finish');
      expect(actionableOne.unit_ref).toBe(planOne);
      expect(actionableOne.command).toBe(HOST_COMMAND.verifySprint);

      // Completion gate, then closeout -- and the closeout is SIGKILLed the
      // moment the journal durably records `lifecycle_applied`.
      const mainBeforeCrash = git(primary, ['rev-parse', 'main']).stdout.trim();
      runCompletionGate(fixture, worktreeOne, actionableOne);
      recordDriverCommand(fixture, HOST_COMMAND.finishMerge);
      const crashed = helperWithFault(
        fixture,
        worktreeOne,
        'scripts/contract-worktree.sh',
        ['finish', '--merge'],
        'lifecycle_applied',
      );
      expect(crashed.status).not.toBe(0);

      const dirs = journalDirs(fixture);
      expect(dirs).toHaveLength(1);
      const journalDir = dirs[0]!;
      const crashedJournal = journalStatus(journalDir);
      expect(crashedJournal.status).toBe('in_progress');
      expect(crashedJournal.phases[crashedJournal.phases.length - 1]).toBe('lifecycle_applied');
      expect(crashedJournal.phases).not.toContain('complete');
      // Nothing external landed: main still points at the exact pre-crash
      // commit (HEAD-vs-main would be vacuous here -- HEAD is a symref to
      // main in the primary tree).
      expect(git(primary, ['rev-parse', 'main']).stdout.trim()).toBe(mainBeforeCrash);

      // No auto-resume: the plain rerun fails closed on the unfinished journal.
      const blocked = helper(worktreeOne, 'scripts/contract-worktree.sh', ['finish', '--merge']);
      expect(blocked.status).toBe(1);
      expect(blocked.stderr).toContain('unfinished closeout journal blocks this finish');
      expect(blocked.stderr).toContain('recover inspect');

      // Recovery is explicit, and a fresh process locates everything it needs.
      const inspect = helper(worktreeOne, 'scripts/contract-worktree.sh', ['recover', 'inspect']);
      expect(inspect.status, `${inspect.stdout}\n${inspect.stderr}`).toBe(0);
      expect(inspect.stdout).toContain(journalDir);
      expect(inspect.stdout).toContain('status: in_progress');
      expect(inspect.stdout).toContain('last phase: lifecycle_applied');
      expect(inspect.stdout).toContain('snapshot present: yes');

      const abort = helper(worktreeOne, 'scripts/contract-worktree.sh', ['recover', 'abort']);
      expect(abort.status, `${abort.stdout}\n${abort.stderr}`).toBe(0);
      expect(abort.stdout).toContain('restored the pre-closeout state');
      expect(journalStatus(journalDir).status).toBe('aborted');

      // The rolled-back state is exactly the pre-closeout one: the envelope
      // still routes to the same unit, and the retry completes cleanly.
      const afterAbort = tick(worktreeOne);
      expect(afterAbort.route).toBe('verify_or_finish');
      expect(afterAbort.unit_ref).toBe(planOne);

      runCompletionGate(fixture, worktreeOne, afterAbort);
      const retry = executeHostCommand(fixture, worktreeOne, HOST_COMMAND.finishMerge);
      expect(retry.status, `${retry.stdout}\n${retry.stderr}`).toBe(0);
      expect(retry.stdout).toContain('Merged codex/row-one into main');
      // The retry derives the same transaction key (same worktree, plan,
      // contract, original HEAD, base), so it reuses the rolled-back entry
      // rather than accumulating a second one.
      expect(journalDirs(fixture)).toEqual([journalDir]);
      expect(journalStatus(journalDir).status).toBe('complete');
      expect(existsSync(join(journalDir, 'snapshot'))).toBe(false);

      // --- Row 2, tick 4: back in the primary tree. ------------------------
      const secondRow = tick(primary);
      expect(secondRow.route).toBe('advance_sprint');
      expect(secondRow.unit_ref).toBe(SPRINT);

      const advanceTwo = executeHostCommand(fixture, primary, secondRow.command!);
      expect(advanceTwo.status, `${advanceTwo.stdout}\n${advanceTwo.stderr}`).toBe(0);
      const worktreeTwo = createdWorktree(advanceTwo.stdout);

      const openPlanTwo = tick(worktreeTwo);
      expect(openPlanTwo.route).toBe('continue_active_plan');
      const resolvedTwo = executeHostCommand(fixture, worktreeTwo, openPlanTwo.command!);
      const planTwo = planFromResolvedState(resolvedTwo);
      expect(planTwo).toBe(openPlanTwo.unit_ref!);
      expect(planTwo).toMatch(/^plans\/plan-\d{8}-\d{4}-row-two\.md$/);

      // --- The stall: two completed turns that moved nothing. --------------
      let stallOpening = openPlanTwo;
      let halted: ContinuationEnvelopeV1 | null = null;
      for (let turn = 0; turn < 2; turn += 1) {
        const resolved = executeHostCommand(fixture, worktreeTwo, stallOpening.command!);
        expect(planFromResolvedState(resolved)).toBe(planTwo);
        const closing = tick(worktreeTwo);
        recordAttempt(worktreeTwo, {
          unitRef: planTwo,
          outcome: 'completed',
          token: stallOpening.progress_token,
          afterToken: closing.progress_token,
        });
        const postReceipt = tick(worktreeTwo);
        if (turn === 0) {
          expect(postReceipt.route).toBe('continue_active_plan');
          stallOpening = postReceipt;
        } else {
          halted = postReceipt;
        }
      }

      expect(halted).not.toBeNull();
      expect(halted!.route).toBe('halt');
      expect(halted!.reason).toBe('no_progress');
      expect(halted!.unit_ref).toBe(planTwo);
      expect(halted!.command).toBeNull();
      // A halt is stable: retrying without a state change reproduces it byte
      // for byte, which is what makes "never retry a halt" enforceable.
      expect(rawTick(worktreeTwo)).toBe(rawTick(worktreeTwo));

      // The operator's explicit override clears the stall; nothing else does.
      recordAttempt(worktreeTwo, { unitRef: planTwo, outcome: 'resumed' });
      const resumed = tick(worktreeTwo);
      expect(resumed.route).toBe('continue_active_plan');
      expect(resumed.progress_token).toBe(openPlanTwo.progress_token);

      // --- Row 2 completes uninterrupted. ----------------------------------
      const resumedResolution = executeHostCommand(fixture, worktreeTwo, resumed.command!);
      completeBoundedUnit(worktreeTwo, planFromResolvedState(resumedResolution), 'row-two');

      const readyTwo = tick(worktreeTwo);
      recordAttempt(worktreeTwo, {
        unitRef: planTwo,
        outcome: 'completed',
        token: resumed.progress_token,
        afterToken: readyTwo.progress_token,
      });
      const actionableTwo = tick(worktreeTwo);
      expect(actionableTwo.route).toBe('verify_or_finish');
      expect(actionableTwo.unit_ref).toBe(planTwo);

      runCompletionGate(fixture, worktreeTwo, actionableTwo);
      const finishTwo = executeHostCommand(fixture, worktreeTwo, HOST_COMMAND.finishMerge);
      expect(finishTwo.status, `${finishTwo.stdout}\n${finishTwo.stderr}`).toBe(0);
      expect(finishTwo.stdout).toContain('Merged codex/row-two into main');

      // --- The loop ends. --------------------------------------------------
      const done = tick(primary);
      expect(done.route).toBe('complete');
      expect(done.unit_ref).toBe(SPRINT);
      expect(done.command).toBeNull();
      expect(done.reason).toBe('sprint_backlog:complete');

      // Both rows landed on main through their own closeout, and the sprint
      // authority -- not the driver's memory -- records that.
      const sprint = readFileSync(join(primary, SPRINT), 'utf-8');
      expect(sprint).toMatch(/\| 1 \| \[x\] \| row-one \|/);
      expect(sprint).toMatch(/\| 2 \| \[x\] \| row-two \|/);
      expect(existsSync(join(primary, 'src/row-one.ts'))).toBe(true);
      expect(existsSync(join(primary, 'src/row-two.ts'))).toBe(true);

      const driverCommands = readFileSync(fixture.driverLog, 'utf-8').trim().split('\n');
      expect(driverCommands).toEqual([
        HOST_COMMAND.advanceSprint,
        HOST_COMMAND.resolveState,
        HOST_COMMAND.prepareAcceptance,
        HOST_COMMAND.recordAcceptance,
        HOST_COMMAND.verifySprint,
        HOST_COMMAND.finishMerge,
        HOST_COMMAND.prepareAcceptance,
        HOST_COMMAND.recordAcceptance,
        HOST_COMMAND.verifySprint,
        HOST_COMMAND.finishMerge,
        HOST_COMMAND.advanceSprint,
        HOST_COMMAND.resolveState,
        HOST_COMMAND.resolveState,
        HOST_COMMAND.resolveState,
        HOST_COMMAND.resolveState,
        HOST_COMMAND.prepareAcceptance,
        HOST_COMMAND.recordAcceptance,
        HOST_COMMAND.verifySprint,
        HOST_COMMAND.finishMerge,
      ]);

      // The attempt ledger stayed ignored runtime evidence throughout: it never
      // entered the tracked tree of either worktree.
      expect(existsSync(join(worktreeTwo, LEDGER))).toBe(true);
      expect(git(worktreeTwo, ['status', '--porcelain', '--untracked-files=all']).stdout).toBe('');
    });
  });
});
