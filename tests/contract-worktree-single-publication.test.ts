import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const REAL_GIT = Bun.which("git");
if (!REAL_GIT) throw new Error("git executable is required for contract-worktree publication tests");
const PLAN = "plans/plan-20260814-1629-demo.md";
const CONTRACT = "tasks/contracts/20260814-1629-demo.contract.md";
const REVIEW = "tasks/reviews/20260814-1629-demo.review.md";
const NOTES = "tasks/notes/20260814-1629-demo.notes.md";

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const isolated = { ...process.env };
  for (const key of [
    "REPO_HARNESS_TARGET_REPO_ROOT",
    "REPO_HARNESS_HELPER_SOURCE_PATH",
    "REPO_HARNESS_SOURCE_ROOT",
    "REPO_HARNESS_GIT_BIN",
  ]) delete isolated[key];
  return spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...isolated,
      REPO_HARNESS_BUN_BIN: process.execPath,
      REPO_HARNESS_WORKFLOW_STATE_LIB: join(cwd, ".ai/hooks/lib/workflow-state.sh"),
      ...env,
    },
  });
}

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function commitAll(cwd: string, message: string): string {
  expect(run("git", ["add", "-A"], cwd).status).toBe(0);
  const committed = run("git", ["commit", "-m", message], cwd);
  expect(committed.status, `${committed.stdout}\n${committed.stderr}`).toBe(0);
  return run("git", ["rev-parse", "HEAD"], cwd).stdout.trim();
}

// finish cleans the merged worktree up on its own success path, so after a
// successful `finish --merge` neither the linked worktree nor the source branch
// name survives to be queried. The publication commit's own trailer is the
// surviving record of the tip it was built from, and that object stays readable
// from the shared store.
function sourceWorktreeHead(primary: string): string {
  const body = run("git", ["log", "-1", "--format=%B", "main"], primary).stdout;
  const match = /^Source-Worktree-Head: ([0-9a-f]{40})$/m.exec(body);
  expect(match, `publication commit carries no Source-Worktree-Head trailer:\n${body}`).not.toBeNull();
  return match![1];
}

function installFixture(container: string): { primary: string; linked: string } {
  const primary = join(container, "primary");
  const linked = join(container, "linked");
  mkdirSync(primary, { recursive: true });
  expect(run("git", ["init", "-b", "main"], primary).status).toBe(0);
  expect(run("git", ["config", "user.name", "Publication Test"], primary).status).toBe(0);
  expect(run("git", ["config", "user.email", "publication@test.local"], primary).status).toBe(0);
  expect(run("git", ["config", "commit.gpgsign", "false"], primary).status).toBe(0);

  for (const dir of [
    "scripts",
    ".ai/hooks/lib",
    ".ai/harness/checks",
    "docs/architecture",
    "plans/archive",
    "tasks/archive",
    "tasks/contracts",
    "tasks/reviews",
    "tasks/notes",
    "src/cli",
  ]) mkdirSync(join(primary, dir), { recursive: true });

  for (const helper of ["contract-worktree.sh", "worktree-merge-lib.sh", "archive-workflow.sh"]) {
    copyFileSync(join(ROOT, "scripts", helper), join(primary, "scripts", helper));
    chmodSync(join(primary, "scripts", helper), 0o755);
  }
  copyFileSync(join(ROOT, "assets/hooks/lib/workflow-state.sh"), join(primary, ".ai/hooks/lib/workflow-state.sh"));
  writeFileSync(join(primary, "scripts/acceptance-receipt.ts"), "process.exit(0);\n");
  writeFileSync(
    join(primary, "scripts/merge-gate.ts"),
    [
      'import { readFileSync, writeFileSync } from "fs";',
      'import { spawnSync } from "child_process";',
      'const counterFile = process.env.MERGE_GATE_COUNTER_FILE;',
      'const count = counterFile ? Number(readFileSync(counterFile, "utf-8") || "0") + 1 : 0;',
      'if (counterFile) writeFileSync(counterFile, String(count));',
      'if (process.env.MOVE_TARGET_ON_SECOND_GATE === "1" && count === 2) {',
      '  const moved = spawnSync("git", ["-C", process.env.PUBLICATION_TARGET_WORKTREE!, "commit", "--allow-empty", "-m", "concurrent target movement"], { encoding: "utf-8" });',
      '  if (moved.status !== 0) process.exit(moved.status ?? 1);',
      '}',
      'const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();',
      'process.stdout.write(`${head}\\n`);',
      "",
    ].join("\n"),
  );
  writeExecutable(join(primary, "scripts/check-architecture-sync.sh"), "#!/bin/bash\nexit 0\n");
  writeExecutable(join(primary, "scripts/verify-sprint.sh"), "#!/bin/bash\nexit 0\n");
  writeFileSync(
    join(primary, "src/cli/index.ts"),
    [
      'import { mkdirSync, writeFileSync } from "fs";',
      'import { join } from "path";',
      'const args = process.argv.slice(2);',
      'if (args[0] !== "architecture-projection" || args[1] !== "acknowledge-publication") process.exit(64);',
      'const shaIndex = args.indexOf("--publication-sha");',
      'const publicationSha = shaIndex >= 0 ? args[shaIndex + 1] : "";',
      'if (!/^[0-9a-f]{40}$/.test(publicationSha)) process.exit(65);',
      'const stateDir = join(process.cwd(), ".ai/harness/state");',
      'mkdirSync(stateDir, { recursive: true });',
      'writeFileSync(join(stateDir, "architecture-drift-cursor.json"), JSON.stringify({ head_sha: publicationSha }) + "\\n");',
      'process.stdout.write(JSON.stringify({ publicationSha }) + "\\n");',
      "",
    ].join("\n"),
  );
  writeExecutable(
    join(primary, "scripts/refresh-current-status.sh"),
    "#!/bin/bash\nprintf '# Current Status Snapshot\\n\\n> **Status**: Idle\\n' > tasks/current.md\n",
  );
  writeFileSync(
    join(primary, ".ai/harness/policy.json"),
    `${JSON.stringify({ architecture: { projection_apply: "automatic" }, worktree_strategy: { review_base: "main", merge_back: { target: "main" } } }, null, 2)}\n`,
  );
  writeFileSync(join(primary, ".gitignore"), ".ai/harness/state/\n");
  writeFileSync(join(primary, "docs/architecture/index.md"), "# Architecture Index\n\n## Pending Requests\n\n- (none)\n");
  writeFileSync(
    join(primary, PLAN),
    ["# Plan: demo", "", "> **Status**: Executing", "", "## Task Breakdown", "", "- [x] demo", ""].join("\n"),
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
      "  - plans/",
      "  - tasks/",
      "  - src/",
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
  writeFileSync(join(primary, REVIEW), "# Task Review: demo\n\n> **Recommendation**: pass\n");
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
  writeFileSync(join(primary, ".ai/harness/active-plan"), PLAN);
  writeFileSync(
    join(primary, ".ai/harness/checks/latest.json"),
    `{"status":"pass","source":"verify-sprint","exit_code":0,"contract":{"file":"${CONTRACT}"},"review":{"file":"${REVIEW}"},"benchmark_evidence":{"status":"not_applicable","report_sha256":"","benchmark_subject_sha256":""}}\n`,
  );
  writeFileSync(join(primary, ".acceptance-pass"), "pass\n");

  commitAll(primary, "fixture base");
  expect(run("git", ["worktree", "add", "-b", "codex/demo", linked], primary).status).toBe(0);
  return { primary, linked };
}

describe("contract-worktree single publication commit", () => {
  test("finish --merge publishes all checkpoints and lifecycle output as one target commit", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-single-publication-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();

      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/first.ts"), "export const first = 1;\n");
      commitAll(linked, "checkpoint one");
      writeFileSync(join(linked, "src/second.ts"), "export const second = 2;\n");
      commitAll(linked, "checkpoint two");
      writeFileSync(
        join(linked, "docs/architecture/.projection-manifest.json"),
        '{"projection":"reviewed-with-contract"}\n',
      );

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked);
      expect(finish.status, `${finish.stdout}\n${finish.stderr}`).toBe(0);

      const published = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const sourceHead = sourceWorktreeHead(primary);
      const commitCount = Number(run("git", ["rev-list", "--count", `${base}..main`], primary).stdout.trim());
      const parent = run("git", ["rev-parse", "main^"], primary).stdout.trim();
      const publishedTree = run("git", ["rev-parse", "main^{tree}"], primary).stdout.trim();
      const sourceTree = run("git", ["rev-parse", `${sourceHead}^{tree}`], primary).stdout.trim();

      expect(commitCount).toBe(1);
      expect(parent).toBe(base);
      expect(publishedTree).toBe(sourceTree);
      expect(published).not.toBe(sourceHead);
      expect(run("git", ["merge-base", "--is-ancestor", sourceHead, "main"], primary).status).not.toBe(0);
      expect(readFileSync(join(primary, "src/first.ts"), "utf-8")).toBe("export const first = 1;\n");
      expect(readFileSync(join(primary, "src/second.ts"), "utf-8")).toBe("export const second = 2;\n");
      expect(readFileSync(join(primary, "docs/architecture/.projection-manifest.json"), "utf-8"))
        .toBe('{"projection":"reviewed-with-contract"}\n');
      expect(run("git", ["show", "--pretty=format:", "--name-only", "main"], primary).stdout)
        .toContain("docs/architecture/.projection-manifest.json");
      expect(
        JSON.parse(readFileSync(join(primary, ".ai/harness/state/architecture-drift-cursor.json"), "utf-8")),
      ).toEqual({ head_sha: published });
      expect(existsSync(join(primary, "plans/archive"))).toBe(true);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("finish fails closed when the target moves after the gate freezes its base", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-target-move-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const counterFile = join(container, "merge-gate-count");
      writeFileSync(counterFile, "0");
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before target movement");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked, {
        MERGE_GATE_COUNTER_FILE: counterFile,
        MOVE_TARGET_ON_SECOND_GATE: "1",
        PUBLICATION_TARGET_WORKTREE: primary,
      });

      expect(finish.status).not.toBe(0);
      expect(finish.stderr).toContain("target branch moved after merge-gate review");
      expect(run("git", ["rev-list", "--count", `${base}..main`], primary).stdout.trim()).toBe("1");
      expect(run("git", ["log", "-1", "--format=%s", "main"], primary).stdout.trim()).toBe("concurrent target movement");
      expect(existsSync(join(linked, PLAN))).toBe(true);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("finish fails closed when the target advanced past the un-rebased worktree fork point", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-stale-base-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();

      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint from the original base");

      expect(run("git", ["commit", "--allow-empty", "-m", "parallel session one"], primary).status).toBe(0);
      expect(run("git", ["commit", "--allow-empty", "-m", "parallel session two"], primary).status).toBe(0);
      const advanced = run("git", ["rev-parse", "main"], primary).stdout.trim();
      expect(advanced).not.toBe(base);

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked);

      expect(finish.status).not.toBe(0);
      expect(finish.stderr).toContain("target branch advanced past this worktree's fork point");
      expect(run("git", ["rev-parse", "main"], primary).stdout.trim()).toBe(advanced);
      expect(run("git", ["log", "-1", "--format=%s", "main"], primary).stdout.trim()).toBe("parallel session two");
      expect(run("git", ["rev-list", "--count", `${base}..main`], primary).stdout.trim()).toBe("2");
      expect(existsSync(join(linked, PLAN))).toBe(true);
      expect(existsSync(join(linked, "src/change.ts"))).toBe(true);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("finish rejects a synthesized commit whose tree differs from the verified lifecycle tree", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-tree-mismatch-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const wrongTree = run("git", ["rev-parse", `${base}^{tree}`], primary).stdout.trim();
      const fakeGit = join(container, "fake-git.sh");
      writeExecutable(
        fakeGit,
        [
          "#!/bin/bash",
          'if [[ "${1:-}" == "commit-tree" && -n "${WRONG_PUBLICATION_TREE:-}" ]]; then',
          "  shift 2",
          `  exec ${JSON.stringify(REAL_GIT)} commit-tree "$WRONG_PUBLICATION_TREE" "$@"`,
          "fi",
          `exec ${JSON.stringify(REAL_GIT)} "$@"`,
          "",
        ].join("\n"),
      );
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before tree mismatch");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked, {
        REPO_HARNESS_GIT_BIN: fakeGit,
        WRONG_PUBLICATION_TREE: wrongTree,
      });

      expect(finish.status).not.toBe(0);
      expect(finish.stderr).toContain("synthesized publication tree does not match verified lifecycle tree");
      expect(run("git", ["rev-parse", "main"], primary).stdout.trim()).toBe(base);
      expect(existsSync(join(linked, PLAN))).toBe(true);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("finish refuses an empty publication when lifecycle and frozen target trees match", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-empty-publication-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const fixedTree = run("git", ["rev-parse", "main^{tree}"], primary).stdout.trim();
      const fakeGit = join(container, "equal-tree-git.sh");
      writeExecutable(
        fakeGit,
        [
          "#!/bin/bash",
          'if [[ "${1:-}" == "rev-parse" && "${2:-}" == *"^{tree}" ]]; then',
          '  printf "%s\\n" "$FIXED_PUBLICATION_TREE"',
          "  exit 0",
          "fi",
          `exec ${JSON.stringify(REAL_GIT)} "$@"`,
          "",
        ].join("\n"),
      );
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before empty publication");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked, {
        REPO_HARNESS_GIT_BIN: fakeGit,
        FIXED_PUBLICATION_TREE: fixedTree,
      });

      expect(finish.status).not.toBe(0);
      expect(finish.stderr).toContain("refusing empty publication");
      expect(run("git", ["rev-parse", "main"], primary).stdout.trim()).toBe(base);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("commit.gpgsign requires the signed commit-tree path and fails before target mutation", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-signed-publication-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const fakeGit = join(container, "signed-git.sh");
      writeExecutable(
        fakeGit,
        [
          "#!/bin/bash",
          'if [[ "${1:-}" == "config" && "${2:-}" == "--get" && "${3:-}" == "commit.gpgsign" ]]; then printf "true\\n"; exit 0; fi',
          'if [[ "${1:-}" == "config" && "${2:-}" == "--bool" && "${3:-}" == "--get" && "${4:-}" == "commit.gpgsign" ]]; then printf "true\\n"; exit 0; fi',
          'if [[ "${1:-}" == "commit-tree" ]]; then',
          '  for arg in "$@"; do',
          '    if [[ "$arg" == "-S" ]]; then echo "injected signing failure" >&2; exit 55; fi',
          "  done",
          "  echo 'commit-tree omitted -S' >&2",
          "  exit 56",
          "fi",
          `exec ${JSON.stringify(REAL_GIT)} "$@"`,
          "",
        ].join("\n"),
      );
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before signing failure");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked, {
        REPO_HARNESS_GIT_BIN: fakeGit,
      });

      expect(finish.status).not.toBe(0);
      expect(finish.stderr).toContain("injected signing failure");
      expect(finish.stderr).not.toContain("commit-tree omitted -S");
      expect(run("git", ["rev-parse", "main"], primary).stdout.trim()).toBe(base);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("an invalid commit.gpgsign value fails closed before commit-tree", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-invalid-signing-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const fakeGit = join(container, "invalid-signing-git.sh");
      writeExecutable(
        fakeGit,
        [
          "#!/bin/bash",
          'if [[ "${1:-}" == "config" && "${2:-}" == "--get" && "${3:-}" == "commit.gpgsign" ]]; then printf "sometimes\\n"; exit 0; fi',
          'if [[ "${1:-}" == "config" && "${2:-}" == "--bool" && "${3:-}" == "--get" && "${4:-}" == "commit.gpgsign" ]]; then exit 3; fi',
          'if [[ "${1:-}" == "commit-tree" ]]; then echo "commit-tree must not run" >&2; exit 57; fi',
          `exec ${JSON.stringify(REAL_GIT)} "$@"`,
          "",
        ].join("\n"),
      );
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before invalid signing config");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked, {
        REPO_HARNESS_GIT_BIN: fakeGit,
      });

      expect(finish.status).not.toBe(0);
      expect(finish.stderr).toContain("commit.gpgsign is configured but is not a valid boolean");
      expect(finish.stderr).not.toContain("commit-tree must not run");
      expect(run("git", ["rev-parse", "main"], primary).stdout.trim()).toBe(base);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);
});

// Regression guard for the cleanup attempt at the tail of finish's merge-back
// success path. cleanup_worktree was already fail-closed and correct, but
// nothing ever invoked it after a successful finish, so contract worktrees
// accumulated on disk without bound. See:
//   plans/plan-20260819-2155-finish-auto-cleanup.md
describe("contract-worktree finish cleans up the merged worktree", () => {
  test("a successful finish --merge removes the worktree, the branch, and the start metadata", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-finish-cleanup-")));
    try {
      const { primary, linked } = installFixture(container);

      // `start` writes this metadata inside the worktree; publishing carries it
      // to the target, where cleanup is the only thing that retires it.
      mkdirSync(join(linked, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(linked, ".ai/harness/worktrees/demo.json"), '{"slug":"demo"}\n');
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before cleanup");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked);
      expect(finish.status, `${finish.stdout}\n${finish.stderr}`).toBe(0);

      expect(existsSync(linked)).toBe(false);
      expect(
        run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], primary).status,
      ).not.toBe(0);
      expect(existsSync(join(primary, ".ai/harness/worktrees/demo.json"))).toBe(false);

      // The caller's shell is left sitting in a deleted directory, so finish
      // has to name where to go.
      expect(finish.stdout).toContain(`cd ${primary}`);

      // Cleanup runs strictly after the transaction commits: it must not be
      // able to unwind the publication it just proved was absorbed.
      expect(run("git", ["log", "-1", "--format=%s", "main"], primary).stdout.trim()).toBe(
        "feat(contract): complete demo",
      );
      expect(existsSync(join(primary, "src/change.ts"))).toBe(true);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("a refused cleanup keeps the publication and still exits 0", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-cleanup-refused-")));
    try {
      const { primary, linked } = installFixture(container);
      // finish itself never runs `git worktree remove` -- only the cleanup it
      // delegates to does -- so failing exactly that verb injects a cleanup
      // refusal without disturbing any step of the publication.
      const fakeGit = join(container, "refuse-remove-git.sh");
      writeExecutable(
        fakeGit,
        [
          "#!/bin/bash",
          'if [[ "${1:-}" == "worktree" && "${2:-}" == "remove" ]]; then',
          '  echo "injected worktree remove failure" >&2',
          "  exit 42",
          "fi",
          `exec ${JSON.stringify(REAL_GIT)} "$@"`,
          "",
        ].join("\n"),
      );
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before refused cleanup");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked, {
        REPO_HARNESS_GIT_BIN: fakeGit,
      });

      // finish already succeeded before cleanup was attempted; a cleanup
      // refusal must not be reported back to the caller as a failed finish.
      expect(finish.status, `${finish.stdout}\n${finish.stderr}`).toBe(0);
      expect(finish.stderr).toContain("automatic worktree cleanup refused");
      expect(finish.stderr).toContain("cleanup --slug demo --target main");
      expect(existsSync(linked)).toBe(true);
      expect(
        run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], primary).status,
      ).toBe(0);
      expect(run("git", ["log", "-1", "--format=%s", "main"], primary).stdout.trim()).toBe(
        "feat(contract): complete demo",
      );
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);
});
