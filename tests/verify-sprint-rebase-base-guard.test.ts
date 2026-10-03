import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { spawnSync } from "child_process";
import { sandboxEnv } from "./helpers/repo-fixture";

const ROOT = join(import.meta.dir, "..");
const HELPER = join(ROOT, "scripts/verify-sprint.sh");
const REAL_GIT = Bun.which("git");
if (!REAL_GIT) throw new Error("git executable is required for verification boundary tests");

function git(cwd: string, ...args: string[]) {
  const result = spawnSync(REAL_GIT!, args, { cwd, encoding: "utf-8", env: sandboxEnv() });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

// Real Node/TypeScript and Bun execute these checks. No checker or test runner
// is replaced. Legacy metadata is test input, not verification evidence.
function installChecks(dir: string): void {
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "tests"), { recursive: true });
  mkdirSync(join(dir, ".fixture-home"), { recursive: true });
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");
  writeFileSync(join(dir, ".gitignore"), "node_modules\n.ai/\n.fixture-home/\n.local-checks.log\nnojq-bin/\n");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", scripts: { "check:type": "node typecheck.ts" } }));
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "ES2022", types: [], noEmit: true }, include: ["src/**/*.ts"] }));
  writeFileSync(join(dir, "typecheck.ts"), [
    'import { spawnSync } from "node:child_process";',
    'import { appendFileSync } from "node:fs";',
    'const result = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"], { stdio: "inherit" });',
    'appendFileSync(".local-checks.log", `typecheck:${result.status}\\n`);',
    'console.log(`Node ${process.version}: TypeScript exit ${result.status}`);',
    'process.exit(result.status ?? 1);',
  ].join("\n"));
  writeFileSync(join(dir, "src/line-total.ts"), 'export function lineTotal(quantity: number, unitPrice: number): number { return quantity * unitPrice; }\n');
  writeFileSync(join(dir, "tests/line-total.test.ts"), [
    'import { expect, test } from "bun:test";',
    'import { appendFileSync } from "node:fs";',
    'import { lineTotal } from "../src/line-total";',
    'test("line total uses quantity and unit price", () => {',
    '  appendFileSync(".local-checks.log", "business\\n");',
    '  expect(lineTotal(3, 125)).toBe(375);',
    '  expect(lineTotal(0, 125)).toBe(0);',
    '});',
  ].join("\n"));
}

function runLocal(dir: string, extraEnv: Record<string, string> = {}) {
  return spawnSync("bash", [HELPER, "--test", "tests/line-total.test.ts"], {
    cwd: dir,
    encoding: "utf-8",
    env: { ...sandboxEnv(), HOME: join(dir, ".fixture-home"), REPO_HARNESS_TARGET_REPO_ROOT: dir,
      REPO_HARNESS_BUN_BIN: realpathSync(process.execPath), ...extraEnv },
  });
}

function expectLocalChecks(dir: string, extraEnv: Record<string, string> = {}): void {
  const head = git(dir, "rev-parse", "HEAD");
  const main = git(dir, "rev-parse", "main");
  const result = runLocal(dir, extraEnv);
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("TypeScript exit 0");
  expect(result.stderr).toContain("1 pass");
  expect(readFileSync(join(dir, ".local-checks.log"), "utf8")).toBe("typecheck:0\nbusiness\n");
  expect(git(dir, "rev-parse", "HEAD")).toBe(head);
  expect(git(dir, "rev-parse", "main")).toBe(main);
  expect(existsSync(join(dir, ".ai/harness/checks/latest.json"))).toBe(false);
  expect(existsSync(join(dir, ".ai/harness/runs"))).toBe(false);
  expect(readdirSync(join(dir, ".fixture-home"))).toEqual([]);
}

function pathWithoutJq(dir: string): string {
  const shim = join(dir, "nojq-bin");
  mkdirSync(shim);
  for (const tool of ["bash", "node", "dirname"]) {
    const resolved = Bun.which(tool);
    if (!resolved) throw new Error(`${tool} is required`);
    symlinkSync(resolved, join(shim, tool));
  }
  expect(existsSync(join(shim, "jq"))).toBe(false);
  return shim;
}

function initRepo(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  installChecks(dir);
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "seed");
  return dir;
}

function commit(dir: string, file: string, message: string): string {
  writeFileSync(join(dir, file), `${file}\n`);
  git(dir, "add", file);
  git(dir, "commit", "-q", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

function writeMetadata(dir: string, name: string, record: Record<string, unknown>): void {
  const target = join(dir, ".ai/harness/worktrees", name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(record)}\n`);
}

function selfMetadata(dir: string, name: string, extra: Record<string, unknown>): void {
  writeMetadata(dir, name, {
    slug: "demo",
    branch: git(dir, "branch", "--show-current"),
    worktree: dir,
    base_branch: "main",
    ...extra,
  });
}

/**
 * A clone whose `main` tracks `origin/main`, so the base-sync guard has a real
 * upstream to compare against. The caller then moves local `main` to whichever
 * quadrant it is exercising (equal, ahead, behind, diverged).
 */
function seedTrackingClone(prefix: string): { upstream: string; dir: string } {
  const upstream = initRepo("verify-sprint-upstream-");
  commit(upstream, "main-only.txt", "main advances");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  spawnSync(REAL_GIT!, ["clone", "-q", upstream, dir], { encoding: "utf-8" });
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");
  mkdirSync(join(dir, ".fixture-home"));
  return { upstream, dir };
}

/**
 * The shape observed twice in production: a worktree forks from `main`, `main`
 * advances, the worktree is rebased onto it, and the recorded base is never
 * refreshed. The recorded base stays reachable from HEAD -- the new `main` grew
 * out of it -- so an ancestry check passes while the diff base is already wrong
 * by every commit `main` gained.
 */
function seedRebasedOntoAdvancedMain(): { dir: string; recorded: string; forkPoint: string } {
  const dir = initRepo("verify-sprint-rebased-");
  const recorded = git(dir, "rev-parse", "HEAD");

  git(dir, "checkout", "-q", "-b", "feat");
  commit(dir, "feat.txt", "contract work");

  git(dir, "checkout", "-q", "main");
  const forkPoint = commit(dir, "main-only.txt", "main advances");

  git(dir, "checkout", "-q", "feat");
  git(dir, "rebase", "-q", "main");

  selfMetadata(dir, "demo.json", { base_commit: recorded });
  return { dir, recorded, forkPoint };
}

/** Healthy: the worktree forked from `main` and `main` has not moved since. */
function seedHealthy(): string {
  const dir = initRepo("verify-sprint-healthy-");
  const forkPoint = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "-b", "feat");
  commit(dir, "feat.txt", "contract work");
  selfMetadata(dir, "demo.json", { base_commit: forkPoint });
  return dir;
}

// The old local metadata selector and its base/parser guards were removed.
// Provider head/base/current-CI rejection belongs to merge-readiness-v1 and its
// effect tests. Local --test cannot create acceptance or change Git refs.
describe("verify-sprint explicit local verification boundary", () => {
  const metadataCases: Array<{ name: string; arrange: (dir: string, recorded: string, forkPoint: string) => void }> = [
    { name: "stale base remains reachable after a real rebase", arrange() {} },
    { name: "missing legacy metadata", arrange(dir) { rmSync(join(dir, ".ai/harness/worktrees"), { recursive: true }); } },
    { name: "empty exact record before stale branch record", arrange(dir, recorded) {
      rmSync(join(dir, ".ai/harness/worktrees/demo.json"));
      writeMetadata(dir, "00-empty.json", { worktree: dir, base_commit: "", base_branch: "", started_at: "" });
      writeMetadata(dir, "10-stale.json", { branch: "feat", base_commit: recorded, base_branch: "main" });
    } },
    { name: "duplicate exact-worktree records", arrange(dir, recorded) {
      selfMetadata(dir, "a.json", { base_commit: recorded });
      selfMetadata(dir, "b.json", { base_commit: git(dir, "rev-parse", "HEAD") });
    } },
    { name: "current exact record and stale branch record", arrange(dir, recorded, forkPoint) {
      selfMetadata(dir, "demo.json", { base_commit: forkPoint });
      writeMetadata(dir, "10-branch.json", { branch: "feat", base_commit: recorded, base_branch: "main" });
    } },
    { name: "missing base_branch", arrange(dir, recorded) { writeMetadata(dir, "demo.json", { worktree: dir, base_commit: recorded, base_branch: "" }); } },
    { name: "unresolvable base_branch", arrange(dir, recorded) { selfMetadata(dir, "demo.json", { base_commit: recorded, base_branch: "no-such-branch" }); } },
    { name: "invalid JSON", arrange(dir) { writeFileSync(join(dir, ".ai/harness/worktrees/broken.json"), "{not json\n"); } },
  ];
  for (const scenario of metadataCases) {
    test(`${scenario.name} cannot influence local checks or grant main acceptance`, () => {
      const { dir, recorded, forkPoint } = seedRebasedOntoAdvancedMain();
      try {
        expect(spawnSync(REAL_GIT!, ["merge-base", "--is-ancestor", recorded, "HEAD"], { cwd: dir }).status).toBe(0);
        expect(git(dir, "merge-base", "HEAD", "main")).toBe(forkPoint);
        expect(recorded).not.toBe(forkPoint);
        scenario.arrange(dir, recorded, forkPoint);
        expectLocalChecks(dir);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  }
  test("a healthy recorded fork point cannot replace explicit checks", () => {
    const dir = seedHealthy();
    try { expectLocalChecks(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("legacy JSON parser availability does not control local verification", () => {
    const { dir } = seedRebasedOntoAdvancedMain();
    try { expectLocalChecks(dir, { PATH: pathWithoutJq(dir) }); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("an old diff-base environment override cannot replace explicit checks", () => {
    const { dir, forkPoint } = seedRebasedOntoAdvancedMain();
    try { expectLocalChecks(dir, { REPO_HARNESS_DIFF_BASE: forkPoint }); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("a stacked source history does not authorize or prevent local checks", () => {
    const dir = initRepo("verify-sprint-stacked-");
    try {
      git(dir, "checkout", "-q", "-b", "parent");
      const sourceHead = commit(dir, "parent.txt", "parent work");
      git(dir, "checkout", "-q", "-b", "contract");
      commit(dir, "contract.txt", "contract work");
      selfMetadata(dir, "demo.json", { base_commit: sourceHead });
      expectLocalChecks(dir);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("multiple best merge bases do not authorize or prevent local checks", () => {
    const dir = initRepo("verify-sprint-crisscross-");
    try {
      const root = git(dir, "rev-parse", "HEAD");
      git(dir, "checkout", "-q", "-b", "a1");
      const a1 = commit(dir, "a1.txt", "a1");
      git(dir, "checkout", "-q", root);
      git(dir, "checkout", "-q", "-b", "b1");
      const b1 = commit(dir, "b1.txt", "b1");
      git(dir, "checkout", "-q", "-b", "feat", a1);
      git(dir, "merge", "-q", "--no-edit", b1);
      git(dir, "branch", "-f", "main", b1);
      git(dir, "checkout", "-q", "main");
      git(dir, "merge", "-q", "--no-edit", a1);
      git(dir, "checkout", "-q", "feat");
      const bases = git(dir, "merge-base", "--all", "HEAD", "main").split("\n");
      expect(bases).toHaveLength(2);
      selfMetadata(dir, "demo.json", { base_commit: bases[0] });
      expectLocalChecks(dir);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  for (const relation of ["behind", "equal", "ahead", "diverged"] as const) {
    test(`main ${relation} its upstream cannot synthesize local verification or acceptance`, () => {
      const { upstream, dir } = seedTrackingClone("verify-sprint-tracking-");
      try {
        if (relation === "ahead") commit(dir, "local-ahead.txt", "unpushed main commit");
        git(dir, "checkout", "-q", "-b", "feat");
        if (relation === "behind" || relation === "diverged") git(dir, "branch", "-f", "main", "feat~1");
        if (relation === "diverged") {
          git(dir, "checkout", "-q", "main");
          commit(dir, "local-divergent.txt", "divergent main");
          git(dir, "checkout", "-q", "feat");
        }
        commit(dir, "feat.txt", "feature work");
        selfMetadata(dir, "demo.json", { base_commit: git(dir, "merge-base", "HEAD", "main") });
        const counts = git(dir, "rev-list", "--left-right", "--count", "main...origin/main").split(/\s+/).map(Number);
        expect(counts).toEqual({ behind: [0, 1], equal: [0, 0], ahead: [1, 0], diverged: [1, 1] }[relation]);
        expectLocalChecks(dir);
      } finally { rmSync(dir, { recursive: true, force: true }); rmSync(upstream, { recursive: true, force: true }); }
    });
  }
  for (const failure of ["typecheck", "business"] as const) {
    test(`legacy metadata cannot mask a real ${failure} failure`, () => {
      const { dir, forkPoint } = seedRebasedOntoAdvancedMain();
      try {
        selfMetadata(dir, "demo.json", { base_commit: forkPoint, status: "pass", ready_to_merge: true });
        const expression = failure === "typecheck" ? '"invalid number"' : 'quantity + unitPrice';
        writeFileSync(join(dir, "src/line-total.ts"), `export function lineTotal(quantity: number, unitPrice: number): number { return ${expression}; }\n`);
        const result = runLocal(dir);
        expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0);
        const checks = readFileSync(join(dir, ".local-checks.log"), "utf8");
        if (failure === "typecheck") {
          expect(checks).toMatch(/^typecheck:[1-9][0-9]*\n$/);
          expect(result.status).toBe(Number(checks.slice("typecheck:".length).trim()));
          expect(result.stdout).toContain("TS2322");
        } else {
          expect(result.status).toBe(1);
          expect(checks).toBe("typecheck:0\nbusiness\n");
          expect(result.stderr).toContain("1 fail");
        }
        expect(existsSync(join(dir, ".ai/harness/checks/latest.json"))).toBe(false);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  }
  test("provider evidence consumption remains separate from local check execution", () => {
    const helper = readFileSync(HELPER, "utf8");
    expect(helper).toContain('exec "$BUN_BIN" "$SCRIPT_DIR/merge-gate.ts" run --base "$base"');
    expect(helper).not.toContain(".ai/harness/worktrees");
    expect(helper).not.toContain("REPO_HARNESS_DIFF_BASE");
    const { dir } = seedRebasedOntoAdvancedMain();
    try {
      const result = spawnSync("bash", [HELPER, "--base", "main", "--test", "tests/line-total.test.ts"], {
        cwd: dir, encoding: "utf8", env: { ...sandboxEnv(), HOME: join(dir, ".fixture-home"), REPO_HARNESS_BUN_BIN: realpathSync(process.execPath) },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("choose local execution or provider evidence consumption");
      expect(existsSync(join(dir, ".local-checks.log"))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
