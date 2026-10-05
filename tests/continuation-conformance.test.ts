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
import { readLease } from '../src/effects/state/coordination-lease-store';
import type { ContinuationEnvelopeV1 } from '../src/core/state/types';
import { fixtureTaskId } from './helpers/sprint-fixture';
import { copyHelpers } from './helpers/helper-script-fixture';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const LEDGER = '.ai/harness/runs/continuation/attempts.jsonl';
const SPRINT = 'plans/sprints/20260803-0000-conformance.sprint.md';

// The full two-worktree lifecycle shares this budget; avoid a shorter per-case
// override that measures host/pool contention instead of conformance.
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

/** A `repo-harness` entrypoint bound to this checkout, for the shell helpers. */
const CLI_WRAPPER = (() => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'conformance-cli-')));
  const wrapper = join(dir, 'repo-harness');
  writeExecutable(wrapper, `#!/bin/bash\nexec ${process.execPath} ${CLI} "$@"\n`);
  return wrapper;
})();

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
  }, 30_000);

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
  }, 30_000);
});

/**
 * Real sprint claim/start/select/complete and contract-worktree publication over
 * two authored execution inputs. Local verification executes real source tests.
 * The provider boundary is an isolated merge-gate shim sealing the exact HEAD;
 * the surrounding lease, publication, crash and recovery paths are real.
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
  '> **Backlog Schema**: 2',
  '',
  '## PRD',
  '',
  'Real problem statement with concrete user outcomes.',
  '',
  '## Backlog',
  '',
  '| # | ID | Status | Task | Mode | Acceptance | Plan |',
  '|---|----|--------|------|------|------------|------|',
  `| 1 | ${fixtureTaskId('row-one')} | [ ] | row-one | contract | first slice lands | \`plans/plan-20260803-0000-row-one.md\` |`,
  `| 2 | ${fixtureTaskId('row-two')} | [ ] | row-two | contract | second slice lands | \`plans/plan-20260803-0000-row-two.md\` |`,
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
    '.claude/templates',
    'tasks/contracts',
    'tasks/reviews',
    'tasks/notes',
    'tasks/archive',
  ]) {
    mkdirSync(join(primary, dir), { recursive: true });
  }
  copyHelpers(primary, { linkDependencies: false });
  copyFileSync(
    join(ROOT, '.claude/templates/contract.template.md'),
    join(primary, '.claude/templates/contract.template.md'),
  );
  copyFileSync(
    join(ROOT, 'assets/hooks/lib/workflow-state.sh'),
    join(primary, '.ai/hooks/lib/workflow-state.sh'),
  );

  writeFileSync(
    join(primary, 'scripts/merge-gate.ts'),
    [
      'import { spawnSync } from "child_process"; import { appendFileSync } from "fs";',
      'if (process.env.CONFORMANCE_GATE_LOG) appendFileSync(process.env.CONFORMANCE_GATE_LOG, \"merge-gate run\\n\");',
      'if (process.env.CONFORMANCE_REFUSE_GATE === \"1\") { process.stderr.write(\"provider fixture refused\\n\"); process.exit(73); }',
      'const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();',
      'process.stdout.write(`${head}\\n`);',
      '',
    ].join('\n'),
  );
  writeExecutable(join(primary, 'scripts/check-architecture-sync.sh'), '#!/bin/bash\nexit 0\n');

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
  mkdirSync(join(primary, 'src'), { recursive: true });
  mkdirSync(join(primary, 'tests'), { recursive: true });
  writeFileSync(join(primary, 'package.json'), JSON.stringify({ scripts: { 'check:type': 'bun typecheck.ts', test: 'bun test' } }));
  writeFileSync(join(primary, 'typecheck.ts'), 'import { readdirSync, readFileSync } from "fs"; for (const name of readdirSync("src").filter(name => name.endsWith(".ts"))) if (!/^export const [a-z_]+ = 1;\\n$/.test(readFileSync(`src/${name}`, "utf8"))) throw Error("invalid source: " + name);\n');
  for (const row of ['row-one', 'row-two']) {
    const plan = `plans/plan-20260803-0000-${row}.md`;
    const contract = `tasks/contracts/${row}.contract.md`;
    writeFileSync(join(primary, plan), [
      `# Execution plan: ${row}`, '', '> **Status**: Approved',
      `> **Source Ref**: sprint:${SPRINT}#${row}`, `> **Task Contract**: ${contract}`,
      '', '## Task Breakdown', '', `- [ ] Implement src/${row}.ts exporting its named value.`, '',
    ].join('\n'));
    writeFileSync(join(primary, contract), [
      `# Execution brief: ${row}`, '', '## Goal', '', `Ship src/${row}.ts with its named export equal to 1.`,
      '', '## Why', '', 'The named source row must land through its own fenced sprint execution.',
      '', '## Scope', '', `- In scope: src/${row}.ts and its execution plan checkbox.`,
      '- Out of scope: other source rows and configuration.', '',
      '## Allowed Paths', '', '```yaml', 'allowed_paths:', '  - src/', `  - ${plan}`, '```', '',
      '## Exit Criteria', '', '```yaml', 'exit_criteria:', '  files_exist:', `    - src/${row}.ts`, '```', '',
    ].join('\n'));
    writeFileSync(join(primary, `tests/${row}.test.ts`), `import { expect, test } from "bun:test"; import { ${row.replaceAll('-', '_')} } from "../src/${row}"; test("${row} source outcome", () => expect(${row.replaceAll('-', '_')}).toBe(1));\n`);
  }

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
      '.ai/harness/active-plan',
      '',
    ].join('\n'),
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

/**
 * Argv for a command string the envelope published, read the way a POSIX
 * shell would: whitespace-separated words, single-quoted spans, and backslash
 * escapes. The driver never synthesizes argv of its own -- it runs the string
 * it was handed -- so a command the envelope names but cannot succeed fails
 * here instead of passing against a driver-invented variant.
 */
function shellArgv(command: string): string[] {
  const argv: string[] = [];
  let current = '';
  let started = false;
  let quoted = false;
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i]!;
    if (quoted) {
      if (char === "'") quoted = false;
      else current += char;
      continue;
    }
    if (char === "'") {
      quoted = true;
      started = true;
      continue;
    }
    if (char === '\\' && i + 1 < command.length) {
      current += command[i + 1]!;
      started = true;
      i += 1;
      continue;
    }
    // Tripwire, not a parser extension: this reader only understands
    // whitespace-separated words, single-quoted spans, and backslash escapes.
    // A double quote or a bare newline outside single quotes is a form real
    // bash parses differently, so it fails loudly here instead of being
    // misread into a plausible-looking argv.
    expect(
      char === '"' || char === '\n',
      `shellArgv only parses single-quoted words; unquoted ${char === '\n' ? 'newline' : 'double quote'} in command: ${command}`,
    ).toBe(false);
    if (char === ' ' || char === '\t') {
      if (started) {
        argv.push(current);
        current = '';
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }
  expect(quoted, `unterminated quote in command: ${command}`).toBe(false);
  if (started) argv.push(current);
  return argv;
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
    // The sprint lease verbs live in the CLI; a disposable repository has no
    // copy of it, and an ambient `repo-harness` on PATH would be a different
    // build than the source under test.
    REPO_HARNESS_CLI_BIN: CLI_WRAPPER,
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
      REPO_HARNESS_CLI_BIN: CLI_WRAPPER,
      REPO_HARNESS_WORKFLOW_STATE_LIB: join(cwd, '.ai/hooks/lib/workflow-state.sh'),
      REPO_HARNESS_GIT_BIN: fixture.fakeGit,
      FAULT_PID_FILE: fixture.pidFile,
      FAULT_AFTER_PHASE: phase,
      FAULT_JOURNAL_DIR: join(fixture.journalRoot, 'finish'),
      CONFORMANCE_GATE_LOG: fixture.gateLog,
    },
  );
}

/**
 * `advance_sprint`'s command names the row it claims, so its string is not a
 * constant. The driver matches on this prefix and executes the argv it parses
 * out of whatever follows.
 */
const ADVANCE_SPRINT_PREFIX = 'repo-harness run sprint-backlog start-task';

/** The exact string the envelope is expected to publish for one backlog row. */
function advanceSprintCommand(task: string): string {
  return `${ADVANCE_SPRINT_PREFIX} --task '${task}' --execute`;
}

const HOST_COMMAND = {
  resolveState: 'repo-harness state resolve --json',
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
  if (command.startsWith(`${ADVANCE_SPRINT_PREFIX} `)) {
    // Literal execution: `repo-harness run <helper> <args...>` maps onto the
    // fixture's own copy of that helper, with the published args unchanged.
    return helper(cwd, 'scripts/sprint-backlog.sh', shellArgv(command).slice(3), gateEnv);
  }
  switch (command) {
    case HOST_COMMAND.resolveState:
      return run(process.execPath, [CLI, 'state', 'resolve', '--json'], cwd);
    case HOST_COMMAND.verifySprint:
      return helper(cwd, 'scripts/verify-sprint.sh', ['--test', `tests/${readFileSync(join(cwd, '.ai/harness/active-plan'), 'utf8').trim().includes('row-one') ? 'row-one' : 'row-two'}.test.ts`], gateEnv);
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
  const completion = helper(worktree, 'scripts/sprint-backlog.sh', ['complete-task', '--task', marker, '--sprint', SPRINT, '--plan', planPath, '--defer-lease-release']);
  expect(completion.status, completion.stdout + completion.stderr).toBe(0);
  expect(git(worktree, ['add', '-A']).status).toBe(0);
  expect(git(worktree, ['commit', '-qm', `${marker} slice`]).status).toBe(0);
}

/** The worktree the executed `advance_sprint` command reported creating. */
function createdWorktree(stdout: string): string {
  const match = stdout.match(/\[ContractWorktree\] Created worktree: (\S+)/);
  expect(match, `advance_sprint output did not name a worktree:\n${stdout}`).not.toBeNull();
  return match![1]!;
}

describe('fresh sprint execution input admission', () => {
  for (const fault of ['dirty-plan', 'stale-contract', 'missing-contract'] as const) {
    test(`refuses an existing worktree with ${fault} without overwriting or claiming it`, () => {
      withTempDir('sprint-existing-execution-input', container => {
        const { primary } = installFixture(container);
        const existing = join(container, 'existing-user-worktree');
        expect(git(primary, ['worktree', 'add', '-b', 'codex/row-one', existing]).status).toBe(0);
        const plan = join(existing, 'plans/plan-20260803-0000-row-one.md');
        const contract = join(existing, 'tasks/contracts/row-one.contract.md');
        if (fault === 'dirty-plan') writeFileSync(plan, readFileSync(plan, 'utf8') + '\nUser work to preserve\n');
        if (fault === 'stale-contract') writeFileSync(contract, '# Existing user contract revision\n');
        if (fault === 'missing-contract') rmSync(contract);
        const beforePlan = readFileSync(plan, 'utf8');
        const beforeContract = existsSync(contract) ? readFileSync(contract, 'utf8') : null;
        const beforeTopology = git(primary, ['worktree', 'list', '--porcelain']).stdout;
        const beforeStatus = git(existing, ['status', '--porcelain']).stdout;
        const result = helper(primary, 'scripts/sprint-backlog.sh', ['start-task', '--task', 'row-one', '--execute']);
        expect(result.status, result.stdout + result.stderr).toBe(1);
        expect(result.stderr).toContain('--fresh refuses');
        expect(result.stdout).toContain("Claimed backlog task 'row-one'");
        expect(readFileSync(plan, 'utf8')).toBe(beforePlan);
        expect(existsSync(contract) ? readFileSync(contract, 'utf8') : null).toBe(beforeContract);
        expect(git(existing, ['status', '--porcelain']).stdout).toBe(beforeStatus);
        expect(git(primary, ['worktree', 'list', '--porcelain']).stdout).toBe(beforeTopology);
        expect(readLease(primary, fixtureTaskId('row-one')).record).toBeNull();
        for (const tree of [primary, existing]) {
          expect(existsSync(join(tree, '.ai/harness/sprint/claims', `${fixtureTaskId('row-one')}.claim`))).toBe(false);
          expect(existsSync(join(tree, '.ai/harness/active-plan'))).toBe(false);
        }
      });
    }, 30_000);
  }
  for (const fault of ['stale', 'missing'] as const) {
    test(`refuses a fresh worktree whose actual contract is ${fault} before selection or bind`, () => {
      withTempDir('sprint-fresh-execution-input', container => {
        const { primary } = installFixture(container);
        const contractPath = 'tasks/contracts/row-one.contract.md';
        const canonicalContract = readFileSync(join(primary, contractPath), 'utf8');
        expect(git(primary, ['switch', '-c', 'source-head-with-different-input']).status).toBe(0);
        if (fault === 'missing') expect(git(primary, ['rm', contractPath]).status).toBe(0);
        else writeFileSync(join(primary, contractPath), '# Stale contract on source HEAD\n');
        expect(git(primary, ['add', '-A']).status).toBe(0);
        expect(git(primary, ['commit', '-m', 'different source HEAD contract']).status).toBe(0);
        // The primary input passes canonical preflight, while a worktree from
        // HEAD would inherit different bytes. Destination validation owns this.
        writeFileSync(join(primary, contractPath), canonicalContract);
        const beforeHead = git(primary, ['rev-parse', 'HEAD']).stdout;
        const beforeStatus = git(primary, ['status', '--porcelain']).stdout;
        const result = helper(primary, 'scripts/sprint-backlog.sh', ['start-task', '--task', 'row-one', '--execute']);
        expect(result.status, result.stdout + result.stderr).toBe(1);
        expect(result.stderr).toContain(`execution worktree input does not match canonical admission: ${contractPath}`);
        const destination = createdWorktree(result.stdout);
        expect(existsSync(destination)).toBe(true);
        expect(readFileSync(join(primary, contractPath), 'utf8')).toBe(canonicalContract);
        expect(git(primary, ['rev-parse', 'HEAD']).stdout).toBe(beforeHead);
        expect(git(primary, ['status', '--porcelain']).stdout).toBe(beforeStatus);
        expect(readLease(primary, fixtureTaskId('row-one')).record).toBeNull();
        expect(existsSync(join(destination, '.ai/harness/active-plan'))).toBe(false);
        expect(existsSync(join(destination, '.ai/harness/sprint/claims', `${fixtureTaskId('row-one')}.claim`))).toBe(false);
        expect(existsSync(join(destination, contractPath)) ? readFileSync(join(destination, contractPath), 'utf8') : null)
          .toBe(fault === 'missing' ? null : '# Stale contract on source HEAD\n');
      });
    }, 30_000);
  }
});

describe('host Goal conformance: the full tick over a disposable repository', () => {
  test('a chat-memoryless driver completes two rows, survives a SIGKILLed closeout, stalls, and ends at complete', () => {
    withTempDir('continuation-conformance', (container) => {
      const fixture = installFixture(container);
      const { primary } = fixture;

      // --- Row 1, tick 1: the only input is the envelope. ------------------
      const start = tick(primary);
      expect(start.route).toBe('advance_sprint');
      expect(start.unit_ref).toBe(SPRINT);
      expect(start.command).toBe(advanceSprintCommand('row-one'));

      const advance = executeHostCommand(fixture, primary, start.command!);
      expect(advance.status, `${advance.stdout}\n${advance.stderr}`).toBe(0);
      const worktreeOne = createdWorktree(advance.stdout);
      const claimDir = join(worktreeOne, '.ai/harness/sprint/claims');
      const claimFiles = readdirSync(claimDir);
      expect(claimFiles).toHaveLength(1);
      const claimFile = join(claimDir, claimFiles[0]!);
      const originalClaimToken = readFileSync(claimFile, 'utf-8');
      const taskId = originalClaimToken.match(/^task_id=(.+)$/m)?.[1] ?? '';
      const originalClaimId = originalClaimToken.match(/^claim_id=(.+)$/m)?.[1] ?? '';
      expect(taskId).not.toBe('');
      expect(originalClaimId).not.toBe('');

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

      // A real provider-gate refusal aborts the prepared journal and restores
      // ownership to bound while the target branch remains unchanged.
      const rejectedFinish = helper(worktreeOne, 'scripts/contract-worktree.sh', ['finish', '--merge'], {
        CONFORMANCE_REFUSE_GATE: '1', CONFORMANCE_GATE_LOG: fixture.gateLog,
      });
      expect(rejectedFinish.status).not.toBe(0);
      expect(rejectedFinish.stderr).toContain('provider fixture refused');
      expect(readLease(worktreeOne, taskId).record).toMatchObject({
        state: 'bound', claim_id: originalClaimId, execution_worktree: worktreeOne, finish_transaction_key: null,
      });
      expect(git(primary, ['rev-parse', 'main']).stdout.trim()).toBe(git(worktreeOne, ['merge-base', 'HEAD', 'main']).stdout.trim());
      expect(journalDirs(fixture)).toHaveLength(1);
      expect(journalStatus(journalDirs(fixture)[0]!).status).toBe('aborted');

      // Completion gate, then closeout -- and the closeout is SIGKILLed the
      // moment the journal durably records `publication_prepared`.
      const mainBeforeCrash = git(primary, ['rev-parse', 'main']).stdout.trim();
      runCompletionGate(fixture, worktreeOne, actionableOne);
      recordDriverCommand(fixture, HOST_COMMAND.finishMerge);
      const crashed = helperWithFault(
        fixture,
        worktreeOne,
        'scripts/contract-worktree.sh',
        ['finish', '--merge'],
        'publication_prepared',
      );
      expect(crashed.status).not.toBe(0);

      const dirs = journalDirs(fixture);
      expect(dirs).toHaveLength(1);
      const journalDir = dirs[0]!;
      const crashedJournal = journalStatus(journalDir);
      expect(crashedJournal.status).toBe('in_progress');
      expect(crashedJournal.phases[crashedJournal.phases.length - 1]).toBe('publication_prepared');
      expect(crashedJournal.phases).not.toContain('complete');
      expect(readLease(worktreeOne, taskId).record?.state).toBe('completing');
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
      expect(inspect.stdout).toContain('last phase: publication_prepared');
      expect(inspect.stdout).toContain('snapshot present: yes');

      const abort = helper(worktreeOne, 'scripts/contract-worktree.sh', ['recover', 'abort']);
      expect(abort.status, `${abort.stdout}\n${abort.stderr}`).toBe(0);
      expect(abort.stdout).toContain('restored the pre-closeout state');
      expect(journalStatus(journalDir).status).toBe('aborted');

      const recoveredLease = readLease(worktreeOne, taskId).record;
      expect(recoveredLease).toMatchObject({
        state: 'bound',
        claim_id: originalClaimId,
        execution_worktree: worktreeOne,
        finish_transaction_key: null,
      });

      // Recovery re-opens the existing ownership state, so another Agent can
      // take over through the ordinary fenced steal/bind path. Rebind the new
      // generation to this fixture worktree and replace only the local fencing
      // token; the subsequent real finish proves the handoff is executable.
      const steal = run(process.execPath, [
        CLI,
        'sprint',
        'steal',
        '--expected-claim-id', originalClaimId,
        '--reason', 'recover failed finish in a replacement session',
        '--session-id', 'replacement-session',
      ], primary);
      expect(steal.status, `${steal.stdout}\n${steal.stderr}`).toBe(0);
      const replacement = JSON.parse(steal.stdout) as { claim_id: string };
      expect(replacement.claim_id).not.toBe(originalClaimId);
      const branch = git(worktreeOne, ['branch', '--show-current']).stdout.trim();
      const bind = run(process.execPath, [
        CLI,
        'sprint',
        'bind',
        '--claim-id', replacement.claim_id,
        '--worktree', worktreeOne,
        '--branch', branch,
        '--unit-ref', planOne,
      ], primary);
      expect(bind.status, `${bind.stdout}\n${bind.stderr}`).toBe(0);
      writeFileSync(claimFile, originalClaimToken.replace(
        `claim_id=${originalClaimId}`,
        `claim_id=${replacement.claim_id}`,
      ));

      // The rolled-back state is exactly the pre-closeout one: the envelope
      // still routes to the same unit, and the retry completes cleanly.
      const afterAbort = tick(worktreeOne);
      expect(afterAbort.route).toBe('verify_or_finish');
      expect(afterAbort.unit_ref).toBe(planOne);

      runCompletionGate(fixture, worktreeOne, afterAbort);
      const retry = executeHostCommand(fixture, worktreeOne, HOST_COMMAND.finishMerge);
      expect(retry.status, `${retry.stdout}\n${retry.stderr}`).toBe(0);
      expect(retry.stdout).toContain('Merged codex/row-one into main');
      // A stolen claim is a new ownership generation, so the old journal
      // remains aborted and the successful replacement has its own key.
      const retryJournals = journalDirs(fixture);
      expect(retryJournals).toHaveLength(2);
      expect(retryJournals).toContain(journalDir);
      expect(journalStatus(journalDir).status).toBe('aborted');
      const completedJournal = retryJournals.find(path => path !== journalDir)!;
      expect(journalStatus(completedJournal).status).toBe('complete');
      expect(existsSync(join(completedJournal, 'snapshot'))).toBe(false);

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

      // finish retires the merged worktree on its own success path, so the
      // ledger's runtime-evidence state has to be read while the worktree is
      // still on disk. The durable half of the claim -- that it never entered
      // anyone's tracked tree -- is asserted against published history below.
      const ledgerPresentBeforeFinish = existsSync(join(worktreeTwo, LEDGER));
      const worktreeStatusBeforeFinish = git(worktreeTwo, ['status', '--porcelain', '--untracked-files=all']).stdout;

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
      expect(sprint).toMatch(/\| 1 \| [0-9a-f]{64} \| \[x\] \| row-one \|/);
      expect(sprint).toMatch(/\| 2 \| [0-9a-f]{64} \| \[x\] \| row-two \|/);
      expect(existsSync(join(primary, 'src/row-one.ts'))).toBe(true);
      expect(existsSync(join(primary, 'src/row-two.ts'))).toBe(true);

      const driverCommands = readFileSync(fixture.driverLog, 'utf-8').trim().split('\n');
      expect(driverCommands).toEqual([
        advanceSprintCommand('row-one'),
        HOST_COMMAND.resolveState,
        HOST_COMMAND.verifySprint,
        HOST_COMMAND.finishMerge,
        HOST_COMMAND.verifySprint,
        HOST_COMMAND.finishMerge,
        advanceSprintCommand('row-two'),
        HOST_COMMAND.resolveState,
        HOST_COMMAND.resolveState,
        HOST_COMMAND.resolveState,
        HOST_COMMAND.resolveState,
        HOST_COMMAND.verifySprint,
        HOST_COMMAND.finishMerge,
      ]);

      // Each real closeout consumes the provider gate once. The local
      // verification above executes the selected fixture's actual source test.
      expect(readFileSync(fixture.gateLog, 'utf8').trim().split('\n')).toEqual([
        'merge-gate run', 'merge-gate run', 'merge-gate run', 'merge-gate run',
      ]);

      // The attempt ledger stayed ignored runtime evidence throughout: it never
      // entered the tracked tree of either worktree.
      expect(ledgerPresentBeforeFinish).toBe(true);
      expect(worktreeStatusBeforeFinish).toBe('');
      expect(git(primary, ['log', '--all', '--oneline', '--', LEDGER]).stdout).toBe('');
    });
  });
});
