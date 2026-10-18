import { fixtureTaskId } from './helpers/sprint-fixture';
import { describe, expect, test, setDefaultTimeout } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn, spawnSync } from "child_process";
import { withRepo, resolveFixtureState } from "./state/effective-state-fixture";

// Regression guard for CloseoutJournalV1: the crash-durable closeout
// transaction behind `ship-worktrees`. See:
//   plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md
//   tasks/contracts/20260803-1824-wp1-crash-durable-closeout-transaction.contract.md
//   docs/researches/20260803-loopx-comparative-analysis.md (7.1 + addendum)
//
// The defect this file pins: before the journal, the pre-closeout snapshot lived
// in `mktemp -d` and the original HEAD only in a shell variable, recoverable
// solely from an EXIT trap -- so a SIGKILL left a half-applied closeout with no
// discoverable, verifiable recovery entry. Every fault-injection case below
// kills the helper with SIGKILL at a named phase and then proves a *fresh*
// process can locate the journal, the snapshot, and the original HEAD.

const ROOT = join(import.meta.dir, "..");
const REAL_GIT = Bun.which("git");
if (!REAL_GIT) throw new Error("git executable is required for closeout journal tests");

setDefaultTimeout(120_000);

const FIXTURE_AUTHORITY_ENV_KEYS = [
  "REPO_HARNESS_TARGET_REPO_ROOT",
  "REPO_HARNESS_HELPER_SOURCE_PATH",
  "REPO_HARNESS_SOURCE_ROOT",
  "REPO_HARNESS_GIT_BIN",
  "REPO_HARNESS_BUN_BIN",
] as const;

function fixtureEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const isolated = { ...process.env };
  for (const key of FIXTURE_AUTHORITY_ENV_KEYS) delete isolated[key];
  return { ...isolated, HOOK_HOST: "codex", REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"), ...env };
}

function runProcess(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(command, args, { cwd, encoding: "utf-8", env: fixtureEnv(env) });
}


function runHelper(script: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync("bash", [script, ...args], {
    cwd,
    encoding: "utf-8",
    env: fixtureEnv({
      REPO_HARNESS_BUN_BIN: process.execPath,
      ...env,
    }),
  });
}

function runHelperAsync(script: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return new Promise<{ status: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn("bash", [script, ...args], {
      cwd,
      env: fixtureEnv({
        REPO_HARNESS_BUN_BIN: process.execPath,
        ...env,
      }),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (status) => resolve({ status: status ?? 1, stdout, stderr }));
  });
}

// Runs a helper under a launcher that publishes its own PID before exec'ing, so
// the injected fault can SIGKILL the exact helper process (not the test runner)
// the moment the journal reaches a named phase.
function runHelperWithFault(
  script: string,
  args: string[],
  cwd: string,
  pidFile: string,
  env: NodeJS.ProcessEnv,
) {
  return spawnSync(
    "bash",
    ["-c", 'echo $$ > "$FAULT_PID_FILE"; exec "$@"', "closeout-fault", "bash", script, ...args],
    {
      cwd,
      encoding: "utf-8",
      env: fixtureEnv({
        REPO_HARNESS_BUN_BIN: process.execPath,
        FAULT_PID_FILE: pidFile,
        ...env,
      }),
    },
  );
}

function withTempRepo(prefix: string, fn: (cwd: string) => void): void {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  try {
    fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

async function withTempRepoAsync(prefix: string, fn: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function installCloseoutBarrier(container: string, operation: "finish" | "ship") {
  const barrierDir = join(container, `${operation}-closeout-barrier`);
  const shimDir = join(container, `${operation}-mkdir-shim`);
  mkdirSync(barrierDir, { recursive: true });
  mkdirSync(shimDir, { recursive: true });
  writeExecutable(
    join(shimDir, "mkdir"),
    [
      "#!/bin/bash",
      'target=""',
      'for arg in "$@"; do target="$arg"; done',
      'case "$target" in',
      `  */repo-harness/transactions/${operation}/*/snapshot|*/repo-harness/transactions/claims/${operation}/*.lock)`,
      '    touch "$CLOSEOUT_BARRIER_DIR/$PPID"',
      '    count=0',
      '    for _ in $(seq 1 500); do',
      '      count="$(find "$CLOSEOUT_BARRIER_DIR" -type f | wc -l | tr -d " ")"',
      '      [[ "$count" -ge 2 ]] && break',
      '      sleep 0.01',
      '    done',
      '    [[ "$count" -ge 2 ]] || exit 70',
      '    ;;',
      'esac',
      'exec /bin/mkdir "$@"',
      "",
    ].join("\n"),
  );
  return { barrierDir, shimDir };
}

// A trusted-git shim: passes every call through to real git, except that it
// SIGKILLs the helper as soon as the journal has durably recorded the phase
// under test. That makes each fault land strictly *after* the phase record and
// strictly *before* whatever effect the helper does next.
const FAKE_GIT = [
  "#!/bin/bash",
  'if [[ -n "${FAULT_AFTER_PHASE:-}" && -n "${FAULT_JOURNAL_DIR:-}" && -f "${FAULT_PID_FILE:-/nonexistent}" ]]; then',
  "  matched=0",
  '  for status_file in "$FAULT_JOURNAL_DIR"/*/status.json; do',
  '    [[ -f "$status_file" ]] || continue',
  '    grep -q "\\"phase\\": \\"$FAULT_AFTER_PHASE\\"" "$status_file" && matched=1',
  "  done",
  '  if [[ "$matched" -eq 1 && -z "${FAULT_ON_GIT:-}" ]]; then',
  '    kill -9 "$(cat "$FAULT_PID_FILE")" 2>/dev/null || true',
  "    exit 137",
  "  fi",
  '  if [[ "$matched" -eq 1 && "${1:-}" == "${FAULT_ON_GIT:-}" ]]; then',
  '    kill -9 "$(cat "$FAULT_PID_FILE")" 2>/dev/null || true',
  "    exit 137",
  "  fi",
  "fi",
  `exec ${JSON.stringify(REAL_GIT)} "$@"`,
  "",
].join("\n");

// A trusted pass-through for the journal's own atomic write (temp file + fsync
// + rename streams the document through `dd`). It kills the helper only when the
// *ship* journal's `complete` document is about to be written -- the one window
// no git or gh call separates from the phase before it. Every other write,
// including unrelated journal operations, passes straight
// through to the real binary.
const FAKE_DD = [
  "#!/bin/bash",
  'payload="$(cat)"',
  'if [[ -z "$payload" ]]; then /bin/dd "$@" </dev/null; exit $?; fi',
  'kill_on_complete=0',
  `[[ "\$payload" == *'"operation": "ship"'* && "\$payload" == *'"status": "complete"'* ]] && kill_on_complete=1`,
  `[[ "\${FAULT_BEFORE_PUBLICATION_PREPARED:-0}" == "1" && "\$payload" == *'"phase": "publication_prepared"'* ]] && kill_on_complete=1`,
  `if [[ "\${FAULT_FAIL_MERGED_WRITE:-0}" == "1" && "\$payload" == *'"phase": "merged"'* ]]; then exit 74; fi`,
  'if [[ -f "${FAULT_PID_FILE:-/nonexistent}" && "$kill_on_complete" == "1" ]]; then',
  '  kill -9 "$(cat "$FAULT_PID_FILE")" 2>/dev/null || true',
  "  exit 137",
  "fi",
  `printf '%s\\n' "\$payload" | /bin/dd "\$@"`,
  "",
].join("\n");

const PLAN = "plans/plan-20260711-1200-demo.md";
const CONTRACT = "tasks/contracts/20260711-1200-demo.contract.md";
const REVIEW = "tasks/reviews/20260711-1200-demo.review.md";
const NOTES = "tasks/notes/20260711-1200-demo.notes.md";
const SPRINT = "plans/sprints/demo.sprint.md";
const ARCHIVED_PLAN = "plans/archive/plan-20260711-1200-demo.md";

interface Fixture {
  readonly primary: string;
  readonly linked: string;
  readonly fakeGit: string;
  readonly journalRoot: string;
  readonly pidFile: string;
}

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

// Primary worktree on `main` plus a linked `codex/demo` contract worktree, wired
// with the same helper stubs the archive-evidence fixture uses (verify-sprint,
// architecture freshness, current-status refresh, sprint backlog, acceptance
// receipt) plus a merge-gate stub, so a real finish can run end to end offline.
function installFixture(container: string): Fixture {
  const primary = join(container, "primary");
  const linked = join(container, "linked");
  mkdirSync(primary, { recursive: true });
  expect(runProcess("git", ["init", "-b", "main"], primary).status).toBe(0);
  expect(runProcess("git", ["config", "user.name", "Journal Test"], primary).status).toBe(0);
  expect(runProcess("git", ["config", "user.email", "journal@test.local"], primary).status).toBe(0);
  expect(runProcess("git", ["config", "commit.gpgsign", "false"], primary).status).toBe(0);

  for (const dir of [
    "scripts",
    ".ai/hooks/lib",
    ".ai/harness/checks",
    "plans/archive",
    "plans/sprints",
    "tasks/archive",
    "tasks/contracts",
    "tasks/reviews",
    "tasks/notes",
  ]) {
    mkdirSync(join(primary, dir), { recursive: true });
  }
  for (const helper of [
    "contract-worktree.sh",
    "ship-worktrees.sh",
    "worktree-merge-lib.sh",
  ]) {
    copyFileSync(join(ROOT, "scripts", helper), join(primary, "scripts", helper));
    chmodSync(join(primary, "scripts", helper), 0o755);
  }
  writeFileSync(join(primary, "scripts/acceptance-receipt.ts"), "process.exit(0);\n");
  writeFileSync(
    join(primary, ".ai/harness/policy.json"),
    `${JSON.stringify({ worktree_strategy: { review_base: "main", branch_prefix: "codex/", merge_back: { target: "main" } } }, null, 2)}\n`,
  );
  // The merge gate is not under test here: the stub seals whatever the branch
  // HEAD currently is, which is exactly what the real gate returns for a
  // candidate that has not moved.
  writeFileSync(
    join(primary, "scripts/merge-gate.ts"),
    [
      'import { spawnSync } from "child_process";',
      'const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();',
      'process.stdout.write(`${head}\\n`);',
      "",
    ].join("\n"),
  );
  writeExecutable(join(primary, "scripts/check-architecture-sync.sh"), "#!/bin/bash\nexit 0\n");
  writeExecutable(join(primary, "scripts/verify-sprint.sh"), "#!/bin/bash\nexit 0\n");
  writeExecutable(
    join(primary, "scripts/refresh-current-status.sh"),
    "#!/bin/bash\nprintf '# Current Status Snapshot\\n\\n> **Status**: Idle\\n' > tasks/current.md\n",
  );
  writeFileSync(
    join(primary, PLAN),
    [
      "# Plan: demo",
      "",
      "> **Status**: Executing",
      `> **Source Ref**: sprint:${SPRINT}#demo`,
      "",
      "## Task Breakdown",
      "",
      "- [x] demo",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(primary, CONTRACT),
    [
      "# Task Contract: demo",
      "",
      "> **Status**: Fulfilled",
      `> **Review File**: \`${REVIEW}\``,
      `> **Notes File**: \`${NOTES}\``,
      "",
      "```yaml",
      "allowed_paths:",
      "  - .ai/harness/",
      "  - plans/",
      "  - tasks/",
      "```",
      "",
      "## Evidence Requirements",
      "",
      "```yaml",
      "evidence_requirements:",
      "  benchmark: not_applicable",
      "```",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(primary, REVIEW),
    [
      "# Task Review: demo",
      "",
      "> **Recommendation**: pass",
      "",
      "## External Acceptance Advice",
      "",
      "> **External Acceptance**: pass",
      "",
    ].join("\n"),
  );
  writeFileSync(join(primary, NOTES), "# Implementation Notes: demo\n");
  writeFileSync(
    join(primary, "tasks/todos.md"),
    [
      "# Deferred Goal Ledger",
      "",
      "> **Status**: Backlog",
      "> **Updated**: fixture",
      "",
      "## Deferred Goals",
      "",
      "| Goal | Why Deferred | Tradeoff | Revisit Trigger |",
      "|------|--------------|----------|-----------------|",
      "| (none) | none | none | none |",
      "",
    ].join("\n"),
  );
  writeFileSync(join(primary, "tasks/current.md"), "# Current Status Snapshot\n\n> **Status**: Active\n");
  writeFileSync(join(primary, SPRINT), ["# Sprint: demo","> **Status**: Executing","> **Backlog Schema**: 2","","## Backlog","| # | ID | Status | Task | Mode | Acceptance | Plan |","|---|----|--------|------|------|------------|------|",`| 1 | ${fixtureTaskId('demo')} | [ ] | demo | contract | done | (pending) |`,""].join("\n"));
  writeFileSync(join(primary, ".ai/harness/active-plan"), PLAN);
  writeFileSync(
    join(primary, ".ai/harness/checks/latest.json"),
    `{"status":"pass","source":"verify-sprint","exit_code":0,"contract":{"file":"${CONTRACT}"},"review":{"file":"${REVIEW}"},"benchmark_evidence":{"status":"not_applicable","report_sha256":"","benchmark_subject_sha256":""}}\n`,
  );
  writeFileSync(join(primary, ".acceptance-pass"), "pass\n");

  expect(runProcess("git", ["add", "."], primary).status).toBe(0);
  expect(runProcess("git", ["commit", "-m", "fixture"], primary).status).toBe(0);
  expect(runProcess("git", ["worktree", "add", "-b", "codex/demo", linked], primary).status).toBe(0);

  const fakeGit = join(container, "fake-git.sh");
  writeExecutable(fakeGit, FAKE_GIT);

  return {
    primary,
    linked,
    fakeGit,
    journalRoot: join(primary, ".git/repo-harness/transactions"),
    pidFile: join(container, "fault.pid"),
  };
}

function journalDirs(fixture: Fixture, operation: string): string[] {
  const base = join(fixture.journalRoot, operation);
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((name) => join(base, name))
    .filter((dir) => existsSync(join(dir, "status.json")));
}

function readJournal(dir: string): { status: string; phases: string[] } {
  const raw = JSON.parse(readFileSync(join(dir, "status.json"), "utf-8")) as {
    status: string;
    phases: { phase: string }[];
  };
  return { status: raw.status, phases: raw.phases.map((entry) => entry.phase) };
}

function onlyJournal(fixture: Fixture, operation: string): string {
  const dirs = journalDirs(fixture, operation);
  expect(dirs).toHaveLength(1);
  return dirs[0]!;
}

describe("ship-worktrees closeout journal", () => {
  interface ShipFixture extends Fixture {
    readonly remote: string;
    readonly ghBin: string;
    readonly ghLog: string;
  }

  function installShipFixture(container: string): ShipFixture {
    const fixture = installFixture(container);
    mkdirSync(join(fixture.linked,"src"),{recursive:true});
    symlinkSync(join(ROOT,"src/effects"),join(fixture.linked,"src/effects"),"dir");
    symlinkSync(join(ROOT,"src/core"),join(fixture.linked,"src/core"),"dir");
    symlinkSync(join(ROOT,"node_modules"),join(fixture.linked,"node_modules"),"dir");
    const exclude=runProcess("git",["rev-parse","--git-path","info/exclude"],fixture.linked).stdout.trim();
    writeFileSync(exclude,".ai/harness/\nnode_modules/\nsrc/effects\nsrc/core\n");
    const remote = join(container, "remote.git");
    expect(runProcess("git", ["init", "--bare", "-b", "main", remote], container).status).toBe(0);
    expect(runProcess("git", ["remote", "add", "origin", remote], fixture.primary).status).toBe(0);
    expect(runProcess("git", ["push", "origin", "main"], fixture.primary).status).toBe(0);

    const ghLog = join(container, "gh.log");
    const ghBin = join(container, "fake-gh.sh");
    writeExecutable(
      ghBin,
      [
        "#!/bin/bash",
        'printf \'%s\\n\' "$*" >> "$GH_LOG"',
        'if [[ "${1:-}" == "pr" && "${2:-}" == "list" ]]; then',
        // No PR exists until `pr create` runs, so reconcile has real work left.
        '  if grep -q "^pr create" "$GH_LOG"; then printf \'https://example.invalid/pr/1\\n\'; else printf \'\\n\'; fi',
        "  exit 0",
        "fi",
        `if [[ "\${1:-}" == "pr" && "\${2:-}" == "view" ]]; then printf '{"number":1,"url":"https://example.invalid/pr/1","headRefName":"codex/demo","baseRefName":"main","headRefOid":"%s","baseRefOid":"%s"}\n' "$(git rev-parse HEAD)" "$(git rev-parse origin/main)"; exit 0; fi`,
        'if [[ "${1:-}" == "pr" && "${2:-}" == "create" ]]; then',
        '  if [[ -n "${FAULT_PID_FILE:-}" && -f "$FAULT_PID_FILE" && "${FAULT_ON_PR_CREATE:-0}" == "1" ]]; then',
        '    kill -9 "$(cat "$FAULT_PID_FILE")" 2>/dev/null || true',
        "    exit 137",
        "  fi",
        "  printf 'https://example.invalid/pr/1\\n'",
        "  exit 0",
        "fi",
        "exit 0",
        "",
      ].join("\n"),
    );
    writeFileSync(ghLog, "");
    return { ...fixture, remote, ghBin, ghLog };
  }

  test("simultaneous ship calls elect exactly one owner before push or PR", async () => {
    await withTempRepoAsync("closeout-journal-concurrent-ship", async (container) => {
      const fixture = installShipFixture(container);
      const { barrierDir, shimDir } = installCloseoutBarrier(container, "ship");
      const env = {
        PATH: `${shimDir}:${process.env.PATH ?? ""}`,
        CLOSEOUT_BARRIER_DIR: barrierDir,
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      };
      const results = await Promise.all([
        runHelperAsync("scripts/ship-worktrees.sh", ["--target", "main", "--remote", "origin"], fixture.linked, env),
        runHelperAsync("scripts/ship-worktrees.sh", ["--target", "main", "--remote", "origin"], fixture.linked, env),
      ]);

      // Same rendezvous proof as the finish race: both callers arrived at the
      // claim path rather than merely overlapping in time.
      expect(readdirSync(barrierDir).length).toBeGreaterThanOrEqual(2);

      expect(results.filter((result) => result.status === 0)).toHaveLength(1);
      const loser = results.find((result) => result.status !== 0);
      expect(loser).toBeDefined();
      expect(loser!.stderr).toContain("closeout already owned for this worktree and operation");
      expect(journalDirs(fixture, "ship")).toHaveLength(1);
      expect(readJournal(onlyJournal(fixture, "ship")).status).toBe("complete");
      const prCreates = readFileSync(fixture.ghLog, "utf-8")
        .split("\n")
        .filter((line) => line.startsWith("pr create"));
      expect(prCreates).toHaveLength(1);
      expect(runProcess("git", ["rev-parse", "refs/heads/codex/demo"], fixture.remote).status).toBe(0);
    });
  }, 30_000);



  test("SIGKILL right after the prepared phase rolls back with nothing pushed", () => {
    withTempRepo("closeout-journal-ship-prepared", (container) => {
      const fixture = installShipFixture(container);
      // Seed the committed branch before the independent ship transaction.
      expect(runProcess('git', ['add', '-A'], fixture.linked).status).toBe(0);
      expect(runProcess('git', ['commit', '-m', 'candidate'], fixture.linked).status).toBe(0);
      const planBefore = readFileSync(join(fixture.linked, PLAN), "utf-8");
      const sprintBefore = readFileSync(join(fixture.linked, SPRINT), "utf-8");
      const headBefore = runProcess("git", ["rev-parse", "HEAD"], fixture.linked).stdout.trim();

      // The first git call after `prepared` is durably recorded -- the earliest
      // ship window, where the snapshot exists and no external effect does.
      const crashed = runHelperWithFault(
        "scripts/ship-worktrees.sh",
        ["--target", "main", "--remote", "origin"],
        fixture.linked,
        fixture.pidFile,
        {
          REPO_HARNESS_GIT_BIN: fixture.fakeGit,
          REPO_HARNESS_GH_BIN: fixture.ghBin,
          GH_LOG: fixture.ghLog,
          FAULT_AFTER_PHASE: "prepared",
          FAULT_JOURNAL_DIR: join(fixture.journalRoot, "ship"),
        },
      );
      expect(crashed.status).not.toBe(0);

      const dir = onlyJournal(fixture, "ship");
      const journal = readJournal(dir);
      expect(journal.status).toBe("in_progress");
      expect(journal.phases).toEqual(["prepared"]);

      // Nothing external happened: the branch never reached the remote and no
      // PR was attempted.
      expect(runProcess("git", ["rev-parse", "refs/heads/codex/demo"], fixture.remote).status).not.toBe(0);
      expect(readFileSync(fixture.ghLog, "utf-8")).not.toContain("pr create");

      // A fresh process locates the journal, the snapshot, and the original HEAD.
      const inspect = runHelper("scripts/ship-worktrees.sh", ["--recover", "inspect"], fixture.linked);
      expect(inspect.status, `${inspect.stdout}\n${inspect.stderr}`).toBe(0);
      expect(inspect.stdout).toContain(dir);
      expect(inspect.stdout).toContain("status: in_progress");
      expect(inspect.stdout).toContain("last phase: prepared");
      expect(inspect.stdout).toContain(`original HEAD: ${headBefore}`);
      expect(inspect.stdout).toContain("snapshot present: yes");
      expect(existsSync(join(dir, "snapshot/paths.tsv"))).toBe(true);

      // No auto-resume: a plain rerun fails closed on the unfinished journal.
      const blocked = runHelper("scripts/ship-worktrees.sh", ["--target", "main", "--remote", "origin"], fixture.linked, {
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      });
      expect(blocked.status).toBe(1);
      expect(blocked.stderr).toContain("unfinished ship journal blocks this ship");

      // Reconcile refuses without a landed push; abort is the correct path here.
      const reconcile = runHelper("scripts/ship-worktrees.sh", ["--recover", "reconcile"], fixture.linked, {
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      });
      expect(reconcile.status).toBe(1);
      expect(reconcile.stderr).toContain("no landed push to reconcile");

      const abort = runHelper("scripts/ship-worktrees.sh", ["--recover", "abort"], fixture.linked, {
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      });
      expect(abort.status, `${abort.stdout}\n${abort.stderr}`).toBe(0);
      expect(abort.stdout).toContain("restored the pre-ship state");

      expect(readFileSync(join(fixture.linked, PLAN), "utf-8")).toBe(planBefore);
      expect(readFileSync(join(fixture.linked, SPRINT), "utf-8")).toBe(sprintBefore);
      expect(runProcess("git", ["rev-parse", "HEAD"], fixture.linked).stdout.trim()).toBe(headBefore);
      expect(existsSync(join(fixture.linked, ARCHIVED_PLAN))).toBe(false);
      expect(readJournal(dir).status).toBe("aborted");
      expect(runProcess("git", ["rev-parse", "refs/heads/codex/demo"], fixture.remote).status).not.toBe(0);
    });
  }, 30_000);

  test("SIGKILL between the PR record and complete reconciles without a second push or PR", () => {
    withTempRepo("closeout-journal-ship-pr-observed", (container) => {
      const fixture = installShipFixture(container);
      const shimDir = join(container, "dd-shim");
      mkdirSync(shimDir, { recursive: true });
      writeExecutable(join(shimDir, "dd"), FAKE_DD);

      // No git or gh call separates `pr_observed` from `complete`, so the fault
      // rides the journal's own atomic write: the shim kills the helper exactly
      // when the ship journal's `complete` document is about to land, leaving
      // `pr_observed` durable and `complete` absent.
      const crashed = runHelperWithFault(
        "scripts/ship-worktrees.sh",
        ["--target", "main", "--remote", "origin"],
        fixture.linked,
        fixture.pidFile,
        {
          PATH: `${shimDir}:${process.env.PATH ?? ""}`,
          REPO_HARNESS_GH_BIN: fixture.ghBin,
          GH_LOG: fixture.ghLog,
        },
      );
      expect(crashed.status).not.toBe(0);

      const dir = onlyJournal(fixture, "ship");
      const journal = readJournal(dir);
      expect(journal.status).toBe("in_progress");
      expect(journal.phases).toEqual(["prepared", "implementation_committed", "candidate_frozen", "push_started", "pushed", "pr_create_started", "pr_observed"]);
      expect(journal.phases).not.toContain("complete");
      const raw = JSON.parse(readFileSync(join(dir, "status.json"), "utf-8")) as {
        phases: { phase: string; publication?: Record<string, unknown> }[];
      };
      expect(raw.phases.find((entry) => entry.phase === "pr_observed")?.publication).toEqual({
        kind: 'branch-pr-observation', pr_number: 1, url: 'https://example.invalid/pr/1',
        head_sha: runProcess('git', ['rev-parse', 'HEAD'], fixture.linked).stdout.trim(),
        base_sha: runProcess('git', ['rev-parse', 'origin/main'], fixture.linked).stdout.trim(),
      });

      // Both external effects already happened: the push landed and the PR exists.
      const remoteSha = runProcess("git", ["rev-parse", "refs/heads/codex/demo"], fixture.remote).stdout.trim();
      expect(remoteSha).toBe(runProcess("git", ["rev-parse", "HEAD"], fixture.linked).stdout.trim());
      const createdBefore = readFileSync(fixture.ghLog, "utf-8")
        .split("\n")
        .filter((line) => line.startsWith("pr create"));
      expect(createdBefore).toHaveLength(1);

      const inspect = runHelper("scripts/ship-worktrees.sh", ["--recover", "inspect"], fixture.linked);
      expect(inspect.status, `${inspect.stdout}\n${inspect.stderr}`).toBe(0);
      expect(inspect.stdout).toContain(dir);
      expect(inspect.stdout).toContain("status: in_progress");
      expect(inspect.stdout).toContain("last phase: pr_observed");

      // No auto-resume, and abort must never undo an applied external effect.
      const blocked = runHelper("scripts/ship-worktrees.sh", ["--target", "main", "--remote", "origin"], fixture.linked, {
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      });
      expect(blocked.status).toBe(1);
      expect(blocked.stderr).toContain("unfinished ship journal blocks this ship");

      const refused = runHelper("scripts/ship-worktrees.sh", ["--recover", "abort"], fixture.linked, {
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("refusing abort after the push landed");

      const reconcile = runHelper("scripts/ship-worktrees.sh", ["--recover", "reconcile"], fixture.linked, {
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      });
      expect(reconcile.status, `${reconcile.stdout}\n${reconcile.stderr}`).toBe(0);
      expect(reconcile.stdout).toContain("the push was already applied");
      // Only the missing step ran: no second push, and no second PR creation.
      expect(reconcile.stdout).not.toContain("git push");
      const createdAfter = readFileSync(fixture.ghLog, "utf-8")
        .split("\n")
        .filter((line) => line.startsWith("pr create"));
      expect(createdAfter).toHaveLength(1);
      expect(runProcess("git", ["rev-parse", "refs/heads/codex/demo"], fixture.remote).stdout.trim()).toBe(remoteSha);

      const done = readJournal(dir);
      expect(done.status).toBe("complete");
      expect(done.phases).toEqual(["prepared", "implementation_committed", "candidate_frozen", "push_started", "pushed", "pr_create_started", "pr_observed", "complete"]);
      expect(existsSync(join(dir, "snapshot"))).toBe(false);
    });
  }, 30_000);



  test("SIGKILL between push and PR creation reconciles to PR creation only", () => {
    withTempRepo("closeout-journal-ship", (container) => {
      const fixture = installShipFixture(container);

      const crashed = runHelperWithFault(
        "scripts/ship-worktrees.sh",
        ["--target", "main", "--remote", "origin"],
        fixture.linked,
        fixture.pidFile,
        {
          REPO_HARNESS_GH_BIN: fixture.ghBin,
          GH_LOG: fixture.ghLog,
          FAULT_ON_PR_CREATE: "1",
        },
      );
      expect(crashed.status).not.toBe(0);

      const dir = onlyJournal(fixture, "ship");
      const journal = readJournal(dir);
      expect(journal.status).toBe("in_progress");
      expect(journal.phases).toEqual(["prepared", "implementation_committed", "candidate_frozen", "push_started", "pushed", "pr_create_started"]);

      // The external effect is real: the branch is on the remote already.
      const remoteSha = runProcess("git", ["rev-parse", "refs/heads/codex/demo"], fixture.remote).stdout.trim();
      const localSha = runProcess("git", ["rev-parse", "HEAD"], fixture.linked).stdout.trim();
      expect(remoteSha).toBe(localSha);

      const inspect = runHelper("scripts/ship-worktrees.sh", ["--recover", "inspect"], fixture.linked);
      expect(inspect.status, `${inspect.stdout}\n${inspect.stderr}`).toBe(0);
      expect(inspect.stdout).toContain("last phase: pr_create_started");
      expect(inspect.stdout).toContain(dir);

      // A plain rerun fails closed, and abort is refused after the push.
      const blocked = runHelper("scripts/ship-worktrees.sh", ["--target", "main", "--remote", "origin"], fixture.linked, {
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      });
      expect(blocked.status).toBe(1);
      expect(blocked.stderr).toContain("unfinished ship journal blocks this ship");

      const refused = runHelper("scripts/ship-worktrees.sh", ["--recover", "abort"], fixture.linked, {
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("refusing abort after the push landed");

      const reconcile = runHelper("scripts/ship-worktrees.sh", ["--recover", "reconcile"], fixture.linked, {
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      });
      expect(reconcile.status, `${reconcile.stdout}\n${reconcile.stderr}`).toBe(0);
      expect(reconcile.stdout).toContain("the push was already applied");
      // Only the missing step ran: no second push, exactly one PR creation.
      expect(reconcile.stdout).not.toContain("git push");
      const ghCalls = readFileSync(fixture.ghLog, "utf-8").split("\n").filter((line) => line.startsWith("pr create"));
      expect(ghCalls).toHaveLength(1);
      expect(runProcess("git", ["rev-parse", "refs/heads/codex/demo"], fixture.remote).stdout.trim()).toBe(remoteSha);

      const done = readJournal(dir);
      expect(done.status).toBe("complete");
      expect(done.phases).toEqual(["prepared", "implementation_committed", "candidate_frozen", "push_started", "pushed", "pr_create_started", "pr_observed", "complete"]);
    });
  }, 30_000);

  test("SIGKILL after the push but before its phase record still reconciles from the remote", () => {
    withTempRepo("closeout-journal-ship-window", (container) => {
      const fixture = installShipFixture(container);

      // `git branch --set-upstream-to` is the first git call after the push and
      // before the `pushed` record -- the narrow window where the journal alone
      // cannot prove the effect and the remote has to be consulted.
      const crashed = runHelperWithFault(
        "scripts/ship-worktrees.sh",
        ["--target", "main", "--remote", "origin"],
        fixture.linked,
        fixture.pidFile,
        {
          REPO_HARNESS_GIT_BIN: fixture.fakeGit,
          REPO_HARNESS_GH_BIN: fixture.ghBin,
          GH_LOG: fixture.ghLog,
          FAULT_AFTER_PHASE: "candidate_frozen",
          FAULT_ON_GIT: "branch",
          FAULT_JOURNAL_DIR: join(fixture.journalRoot, "ship"),
        },
      );
      expect(crashed.status).not.toBe(0);

      const dir = onlyJournal(fixture, "ship");
      const journal = readJournal(dir);
      expect(journal.status).toBe("in_progress");
      expect(journal.phases).toEqual(["prepared","implementation_committed","candidate_frozen","push_started"]);
      expect(journal.phases).not.toContain("pushed");

      const remoteSha = runProcess("git", ["rev-parse", "refs/heads/codex/demo"], fixture.remote).stdout.trim();
      expect(remoteSha).toMatch(/^[0-9a-f]{40}$/);

      // Abort must still refuse: the push is observable even though no phase
      // recorded it.
      const refused = runHelper("scripts/ship-worktrees.sh", ["--recover", "abort"], fixture.linked, {
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("refusing abort after the push landed");

      const reconcile = runHelper("scripts/ship-worktrees.sh", ["--recover", "reconcile"], fixture.linked, {
        REPO_HARNESS_GH_BIN: fixture.ghBin,
        GH_LOG: fixture.ghLog,
      });
      expect(reconcile.status, `${reconcile.stdout}\n${reconcile.stderr}`).toBe(0);
      expect(reconcile.stdout).not.toContain("git push");
      expect(readJournal(dir).phases).toEqual(["prepared", "implementation_committed", "candidate_frozen", "push_started", "pushed", "pr_observed", "complete"]);
      expect(runProcess("git", ["rev-parse", "refs/heads/codex/demo"], fixture.remote).stdout.trim()).toBe(remoteSha);
    });
  }, 30_000);
});

describe("closeout journal no-read guard", () => {
  // The journal records operation progress, never workflow state. Effective
  // State resolution must be byte-identical with and without one present --
  // otherwise the journal becomes a second state authority.
  test("Effective State resolution is byte-identical with and without an in_progress journal", () => {
    withRepo((cwd) => {
      const nowMs = Date.parse("2026-08-03T12:00:00.000Z");
      const before = JSON.stringify(resolveFixtureState(cwd, nowMs), null, 2);

      const dir = join(cwd, ".git/repo-harness/transactions/finish/abc123");
      mkdirSync(join(dir, "snapshot"), { recursive: true });
      writeFileSync(
        join(dir, "meta.json"),
        `{\n  "version": 1,\n  "operation": "finish",\n  "key": "abc123",\n  "worktree": "${cwd}",\n  "plan": "plans/plan-20260712-2327-effective-fixture.md",\n  "original_head": "deadbeef"\n}\n`,
      );
      writeFileSync(
        join(dir, "status.json"),
        '{\n  "version": 1,\n  "operation": "finish",\n  "key": "abc123",\n  "status": "in_progress",\n  "updated_at": "2026-08-03T12:00:00+0000",\n  "phases": [\n    {"phase": "prepared", "at": "2026-08-03T12:00:00+0000", "ref": "deadbeef"},\n    {"phase": "lifecycle_committed", "at": "2026-08-03T12:00:01+0000", "ref": "deadbeef"}\n  ]\n}\n',
      );
      writeFileSync(join(dir, "snapshot/paths.tsv"), "0\tplans\t1\n1\ttasks\t1\n");

      const after = JSON.stringify(resolveFixtureState(cwd, nowMs), null, 2);
      expect(after).toBe(before);
    });
  }, 30_000);
});
