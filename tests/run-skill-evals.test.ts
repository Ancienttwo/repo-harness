import { describe, test, expect, setDefaultTimeout } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  assertDisposableEvaluationBoundary,
  assertDisposableRootBoundary,
  buildBenchmarkSummary,
  captureGitArtifacts,
  formatIterationName,
  initBenchmarkGitRepo,
  runDisposableAdoptionProfile,
  runSkillEvals,
} from "../scripts/run-skill-evals";

const ROOT = join(import.meta.dir, "..");

setDefaultTimeout(10000);

function tempPath(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents, "utf-8");
  spawnSync("chmod", ["+x", path], { encoding: "utf-8" });
}

function createStubCommands(dir: string): { claude: string; codex: string; fail: string } {
  const claudePath = join(dir, "claude-stub.sh");
  const codexPath = join(dir, "codex-stub.sh");
  const failPath = join(dir, "fail-stub.sh");

  writeExecutable(
    claudePath,
    `#!/usr/bin/env bash
set -euo pipefail
disable=0
prompt=""
for arg in "$@"; do
  if [[ "$arg" == "--disable-slash-commands" ]]; then
    disable=1
  fi
  prompt="$arg"
done
if [[ "$disable" -eq 0 && -L ".claude/skills/repo-harness" ]]; then
  printf "\\n- claude with skill\\n" >> AGENTS.md
  echo "claude with skill: $prompt"
else
  printf "\\n- claude baseline\\n" >> AGENTS.md
  echo "claude without skill: $prompt"
fi
`
  );

  writeExecutable(
    codexPath,
    `#!/usr/bin/env bash
set -euo pipefail
output=""
prompt=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == "-o" ]]; then
    output="$arg"
  fi
  prompt="$arg"
  prev="$arg"
done
if grep -q "Benchmark Skill Wrapper" AGENTS.md 2>/dev/null; then
  printf "\\n- codex with skill\\n" >> tasks/todos.md
  echo "codex with skill: $prompt" > "$output"
else
  printf "\\n- codex baseline\\n" >> tasks/todos.md
  echo "codex without skill: $prompt" > "$output"
fi
printf "%s\\n" "$HOME" > .observed-home
printf "%s\\n" "\${REPO_HARNESS_SOURCE_ROOT:-}" > .observed-source-root
echo "codex executed"
`
  );

  writeExecutable(
    failPath,
    `#!/usr/bin/env bash
set -euo pipefail
echo "simulated failure" >&2
exit 7
`
  );

  return { claude: claudePath, codex: codexPath, fail: failPath };
}

function writeEvalManifest(path: string, pattern = "skill"): void {
  writeFileSync(
    path,
    JSON.stringify(
      {
        skill_name: "repo-harness",
        evals: [
          {
            id: 1,
            slug: "repair-agents-task-sync",
            prompt: "Fix AGENTS.md and keep tasks aligned.",
            expected_output: "A task-sync aware response.",
            files: ["evals/fixtures/fix-agents"],
            graders: {
              files_exist: ["final-response.md"],
              files_contain: [{ path: "final-response.md", pattern }],
            },
            expectations: ["Mentions task-sync expectations."],
          },
        ],
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );
}

describe("run-skill-evals helpers", () => {
  test("formatIterationName builds a stable timestamped label", () => {
    const value = formatIterationName(new Date("2026-03-06T01:02:03Z"), "Bench Smoke");
    expect(value).toBe("iteration-20260306-010203-bench-smoke");
  });

  test("initBenchmarkGitRepo and captureGitArtifacts capture tracked and new files", () => {
    const cwd = tempPath("benchmark-git");
    try {
      writeFileSync(join(cwd, "README.md"), "# Fixture\n", "utf-8");
      initBenchmarkGitRepo(cwd);

      writeFileSync(join(cwd, "README.md"), "# Fixture changed\n", "utf-8");
      writeFileSync(join(cwd, "new-file.txt"), "new\n", "utf-8");

      const artifacts = captureGitArtifacts(cwd);
      expect(artifacts.changedFiles).toContain("README.md");
      expect(artifacts.changedFiles).toContain("new-file.txt");
      expect(artifacts.diffPatch).toContain("new-file.txt");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("disposable boundary rejects the real HOME before evaluator writes", () => {
    const boundary = tempPath("benchmark-real-home-guard");
    const repo = join(boundary, "repo");
    mkdirSync(repo, { recursive: true });
    try {
      expect(() => assertDisposableEvaluationBoundary({
        repoRoot: repo,
        home: process.env.HOME,
        evalsPath: join(repo, "evals", "evals.json"),
        configPath: join(repo, "evals", "benchmark.config.json"),
        workspaceRoot: join(repo, "workspace"),
        summaryPath: join(repo, "reports", "benchmark.md"),
      })).toThrow("refuses the real HOME");
    } finally {
      rmSync(boundary, { recursive: true, force: true });
    }
  });
});

describe("run-skill-evals execution", () => {
  test("keeps a writable skills profile inside a complete disposable repository", () => {
    const disposableBoundary = tempPath("benchmark-disposable-boundary");
    const disposableRepo = join(disposableBoundary, "repo");
    const disposableHome = join(disposableBoundary, "home");
    const ambientHome = join(disposableBoundary, "ambient-home");
    const stubDir = join(disposableRepo, "bin");
    const configPath = join(disposableRepo, "evals", "benchmark.config.json");
    const evalsPath = join(disposableRepo, "evals", "evals.json");
    const workspaceRoot = join(disposableRepo, ".ai", "harness", "evals", "workspace");
    const summaryPath = join(disposableRepo, "reports", "benchmark.md");
    mkdirSync(stubDir, { recursive: true });
    mkdirSync(disposableHome, { recursive: true });
    mkdirSync(ambientHome, { recursive: true });
    mkdirSync(join(disposableRepo, "evals", "fixtures"), { recursive: true });
    mkdirSync(join(disposableRepo, "assets", "templates"), { recursive: true });
    cpSync(join(ROOT, "evals", "fixtures", "fix-agents"), join(disposableRepo, "evals", "fixtures", "fix-agents"), {
      recursive: true,
    });
    cpSync(join(ROOT, "assets", "templates", "helpers"), join(disposableRepo, "assets", "templates", "helpers"), {
      recursive: true,
    });
    const verifyScript = join(disposableRepo, "assets", "templates", "helpers", "verify-contract.sh");
    const realVerifyScript = join(disposableRepo, "assets", "templates", "helpers", "verify-contract-real.sh");
    cpSync(verifyScript, realVerifyScript);
    writeExecutable(
      verifyScript,
      `#!/usr/bin/env bash\nset -euo pipefail\nprintf "%s|%s\\n" "$HOME" "\${REPO_HARNESS_SOURCE_ROOT:-}" > "$EVAL_GRADER_ENV_PROOF"\nexec "$(dirname "$0")/verify-contract-real.sh" "$@"\n`,
    );
    const hooksDir = join(disposableBoundary, "git-hooks");
    mkdirSync(hooksDir, { recursive: true });
    writeExecutable(
      join(hooksDir, "pre-commit"),
      `#!/usr/bin/env bash\nset -euo pipefail\nprintf "%s|%s\\n" "$HOME" "\${REPO_HARNESS_SOURCE_ROOT:-}" > "$EVAL_GIT_ENV_PROOF"\n`,
    );
    writeFileSync(join(disposableHome, ".gitconfig"), `[core]\n\thooksPath = ${hooksDir}\n`, "utf-8");
    cpSync(join(ROOT, "SKILL.md"), join(disposableRepo, "SKILL.md"));
    cpSync(join(ROOT, "package.json"), join(disposableRepo, "package.json"));
    expect(spawnSync("git", ["init"], { cwd: disposableRepo, encoding: "utf-8" }).status).toBe(0);
    const stubs = createStubCommands(stubDir);
    writeEvalManifest(evalsPath);
    writeFileSync(
      configPath,
      `${JSON.stringify({
        workspaceRoot: "../repo-harness-workspace",
        summaryPath: "reports/benchmark.md",
        agents: {
          claude: { command: stubs.claude, args: [] },
          codex: {
            command: stubs.codex,
            args: [],
            env: { REPO_HARNESS_SOURCE_ROOT: "/malicious/config/source-root" },
          },
        },
        profiles: { with_skill: { skillPath: "." }, without_skill: {} },
      }, null, 2)}\n`,
      "utf-8",
    );

    const originalSourceRoot = process.env.REPO_HARNESS_SOURCE_ROOT;
    const originalHome = process.env.HOME;
    const originalGitProof = process.env.EVAL_GIT_ENV_PROOF;
    const originalGraderProof = process.env.EVAL_GRADER_ENV_PROOF;
    const gitProof = join(disposableBoundary, "git-env-proof.txt");
    const graderProof = join(disposableBoundary, "grader-env-proof.txt");
    process.env.HOME = ambientHome;
    process.env.REPO_HARNESS_SOURCE_ROOT = ROOT;
    process.env.EVAL_GIT_ENV_PROOF = gitProof;
    process.env.EVAL_GRADER_ENV_PROOF = graderProof;
    try {
      const report = runSkillEvals({
        repoRoot: disposableRepo,
        home: disposableHome,
        requireDisposableBoundary: true,
        configPath,
        evalsPath,
        agent: "codex",
        profile: "with_skill",
        evalFilters: ["repair-agents-task-sync"],
        now: new Date("2026-07-12T22:30:00Z"),
      });

      const canonicalRepo = realpathSync(disposableRepo);
      expect(report.workspaceRoot.startsWith(canonicalRepo)).toBe(true);
      expect(report.summaryPath).toBe(join(canonicalRepo, "reports", "benchmark.md"));
      expect(report.manifestPath.startsWith(join(canonicalRepo, ".ai", "harness", "evals", "workspace"))).toBe(true);
      expect(existsSync(report.summaryPath)).toBe(true);
      expect(existsSync(report.manifestPath)).toBe(true);
      expect(report.records).toHaveLength(1);
      expect(readFileSync(join(report.records[0].workspacePath, ".observed-home"), "utf-8").trim()).toBe(realpathSync(disposableHome));
      expect(readFileSync(join(report.records[0].workspacePath, ".observed-source-root"), "utf-8").trim()).toBe("");
      expect(readFileSync(gitProof, "utf-8").trim()).toBe(`${realpathSync(disposableHome)}|`);
      expect(readFileSync(graderProof, "utf-8").trim()).toBe(`${realpathSync(disposableHome)}|`);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalSourceRoot === undefined) delete process.env.REPO_HARNESS_SOURCE_ROOT;
      else process.env.REPO_HARNESS_SOURCE_ROOT = originalSourceRoot;
      if (originalGitProof === undefined) delete process.env.EVAL_GIT_ENV_PROOF;
      else process.env.EVAL_GIT_ENV_PROOF = originalGitProof;
      if (originalGraderProof === undefined) delete process.env.EVAL_GRADER_ENV_PROOF;
      else process.env.EVAL_GRADER_ENV_PROOF = originalGraderProof;
      rmSync(disposableBoundary, { recursive: true, force: true });
    }
  });

  test("blocks disposable mode against the source checkout before writing", () => {
    const disposableHome = tempPath("benchmark-disposable-home");
    try {
      expect(() => runSkillEvals({
        repoRoot: ROOT,
        home: disposableHome,
        requireDisposableBoundary: true,
        agent: "codex",
        profile: "with_skill",
        evalFilters: ["repair-agents-task-sync"],
      })).toThrow("refuses the source checkout");
    } finally {
      rmSync(disposableHome, { recursive: true, force: true });
    }
  });

  test("blocks swapped source-checkout HOME and real-HOME repo inputs", () => {
    const boundary = tempPath("benchmark-swapped-boundary");
    const repo = join(boundary, "repo");
    const home = join(boundary, "home");
    mkdirSync(repo, { recursive: true });
    mkdirSync(home, { recursive: true });
    try {
      expect(() => assertDisposableRootBoundary({ repoRoot: repo, home: ROOT }))
        .toThrow("refuses the source checkout as HOME");
      expect(() => assertDisposableRootBoundary({ repoRoot: process.env.HOME!, home }))
        .toThrow("refuses the real HOME as repo");
    } finally {
      rmSync(boundary, { recursive: true, force: true });
    }
  });

  test("blocks a not-yet-created workspace beneath a symlinked ancestor", () => {
    const boundary = tempPath("benchmark-symlink-boundary");
    const repo = join(boundary, "repo");
    const home = join(boundary, "home");
    const outside = join(boundary, "outside");
    mkdirSync(join(repo, "evals"), { recursive: true });
    mkdirSync(join(repo, "assets", "templates", "helpers"), { recursive: true });
    mkdirSync(home, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(repo, "package.json"), "{}\n", "utf-8");
    writeFileSync(join(repo, "evals", "evals.json"), "{}\n", "utf-8");
    writeFileSync(join(repo, "evals", "benchmark.config.json"), "{}\n", "utf-8");
    expect(spawnSync("git", ["init"], { cwd: repo, encoding: "utf-8" }).status).toBe(0);
    symlinkSync(outside, join(repo, ".ai"), "dir");
    try {
      expect(() => assertDisposableEvaluationBoundary({
        repoRoot: repo,
        home,
        evalsPath: join(repo, "evals", "evals.json"),
        configPath: join(repo, "evals", "benchmark.config.json"),
        workspaceRoot: join(repo, ".ai", "harness", "evals", "workspace"),
        summaryPath: join(repo, "evals", "benchmark.md"),
      })).toThrow("workspace root escapes the disposable repo");

      const evalsPath = join(repo, "evals", "evals.json");
      const escapedManifest = join(outside, "escaped-evals.json");
      rmSync(evalsPath);
      writeFileSync(
        escapedManifest,
        `${JSON.stringify({
          skill_name: "repo-harness",
          evals: [{
            id: 1,
            slug: "escaped",
            prompt: "escaped",
            expected_output: "escaped",
            files: [],
            graders: {},
            expectations: [],
          }],
        })}\n`,
        "utf-8",
      );
      symlinkSync(escapedManifest, evalsPath);
      expect(() => runSkillEvals({
        repoRoot: repo,
        home,
        requireDisposableBoundary: true,
        dryRun: true,
      })).toThrow("eval manifest escapes the disposable repo");
    } finally {
      rmSync(boundary, { recursive: true, force: true });
    }
  });

  test("adoption profile injects one validated repo and HOME into both existing commands", () => {
    const boundary = tempPath("benchmark-adoption-boundary");
    const repo = join(boundary, "repo");
    const home = join(boundary, "home");
    mkdirSync(join(repo, "scripts"), { recursive: true });
    mkdirSync(join(repo, "src", "cli"), { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(join(repo, "package.json"), "{}\n", "utf-8");
    expect(spawnSync("git", ["init"], { cwd: repo, encoding: "utf-8" }).status).toBe(0);
    writeFileSync(
      join(repo, "scripts", "inspect-project-state.ts"),
      `import { writeFileSync } from "fs";\nwriteFileSync("inspector-proof.json", JSON.stringify({ home: process.env.HOME, sourceRoot: process.env.REPO_HARNESS_SOURCE_ROOT ?? null, args: process.argv.slice(2) }));\nconsole.log("inspector-ok");\n`,
      "utf-8",
    );
    writeFileSync(
      join(repo, "src", "cli", "index.ts"),
      `import { writeFileSync } from "fs";\nwriteFileSync("adopt-proof.json", JSON.stringify({ home: process.env.HOME, sourceRoot: process.env.REPO_HARNESS_SOURCE_ROOT ?? null, args: process.argv.slice(2) }));\nconsole.log("adopt-ok");\n`,
      "utf-8",
    );

    const originalSourceRoot = process.env.REPO_HARNESS_SOURCE_ROOT;
    process.env.REPO_HARNESS_SOURCE_ROOT = ROOT;
    try {
      const report = runDisposableAdoptionProfile({ repoRoot: repo, home });
      const canonicalRepo = realpathSync(repo);
      const canonicalHome = realpathSync(home);
      const inspector = JSON.parse(readFileSync(join(repo, "inspector-proof.json"), "utf-8"));
      const adopt = JSON.parse(readFileSync(join(repo, "adopt-proof.json"), "utf-8"));

      expect(report.repoRoot).toBe(canonicalRepo);
      expect(report.home).toBe(canonicalHome);
      expect(inspector).toEqual({ home: canonicalHome, sourceRoot: null, args: ["--repo", canonicalRepo, "--format", "json"] });
      expect(adopt).toEqual({ home: canonicalHome, sourceRoot: null, args: ["adopt", "--repo", canonicalRepo, "--dry-run", "--json"] });
    } finally {
      if (originalSourceRoot === undefined) delete process.env.REPO_HARNESS_SOURCE_ROOT;
      else process.env.REPO_HARNESS_SOURCE_ROOT = originalSourceRoot;
      rmSync(boundary, { recursive: true, force: true });
    }
  });

  test("runs a filtered benchmark matrix with grader metadata", () => {
    const tempDir = tempPath("benchmark-run");
    const stubDir = join(tempDir, "bin");
    mkdirSync(stubDir, { recursive: true });
    const summaryPath = join(tempDir, "benchmark.md");
    const workspaceRoot = join(tempDir, "workspace");
    const configPath = join(tempDir, "benchmark.config.json");
    const evalsPath = join(tempDir, "evals.json");
    const stubs = createStubCommands(stubDir);

    writeEvalManifest(evalsPath);

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          workspaceRoot,
          summaryPath,
          agents: {
            claude: { command: stubs.claude, args: [] },
            codex: { command: stubs.codex, args: [] },
          },
          profiles: {
            with_skill: { skillPath: ROOT },
            without_skill: {},
          },
        },
        null,
        2
      ) + "\n",
      "utf-8"
    );

    try {
      const report = runSkillEvals({
        repoRoot: ROOT,
        configPath,
        evalsPath,
        evalFilters: ["repair-agents-task-sync"],
        now: new Date("2026-03-06T01:02:03Z"),
      });

      expect(report.records.length).toBe(4);
      expect(existsSync(summaryPath)).toBe(true);
      expect(existsSync(report.manifestPath)).toBe(true);

      const summary = readFileSync(summaryPath, "utf-8");
      expect(summary).toContain("## Quality Metrics");
      expect(summary).toContain("| full_test_count | 4 |");
      expect(summary).toContain("| dry_run_count | 0 |");
      expect(summary).toContain("| dry_run_ratio | 0.0% |");
      expect(summary).toContain("effectiveness_authority | authoritative");
      expect(summary).toContain("## claude / with_skill");
      expect(summary).toContain("## codex / without_skill");
      expect(summary).toContain("repair-agents-task-sync");
      expect(summary).toContain("graders pass");

      const claudeWithSkill = report.records.find(
        (record) => record.agent === "claude" && record.profile === "with_skill"
      );
      expect(claudeWithSkill).toBeDefined();
      expect(claudeWithSkill?.changedFiles.length).toBeGreaterThan(0);
      expect(claudeWithSkill?.graderStatus).toBe("passed");
      expect(claudeWithSkill?.graderSummary.total).toBeGreaterThan(0);
      expect(claudeWithSkill?.graderReportPath).not.toBeNull();
      expect(existsSync(join(claudeWithSkill!.workspacePath, ".claude/skills/repo-harness"))).toBe(
        true
      );

      const codexWithSkill = report.records.find(
        (record) => record.agent === "codex" && record.profile === "with_skill"
      );
      expect(codexWithSkill).toBeDefined();
      expect(readFileSync(join(codexWithSkill!.workspacePath, "AGENTS.md"), "utf-8")).toContain(
        "Benchmark Skill Wrapper"
      );
      expect(readFileSync(codexWithSkill!.finalResponsePath, "utf-8")).toContain("codex with skill");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("records failures when graders fail even if agent exits 0", () => {
    const tempDir = tempPath("benchmark-grader-fail");
    const stubDir = join(tempDir, "bin");
    mkdirSync(stubDir, { recursive: true });
    const summaryPath = join(tempDir, "benchmark.md");
    const workspaceRoot = join(tempDir, "workspace");
    const configPath = join(tempDir, "benchmark.config.json");
    const evalsPath = join(tempDir, "evals.json");
    const stubs = createStubCommands(stubDir);

    writeEvalManifest(evalsPath, "this-pattern-will-not-match");

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          workspaceRoot,
          summaryPath,
          agents: {
            claude: { command: stubs.claude, args: [] },
            codex: { command: stubs.codex, args: [] },
          },
          profiles: {
            with_skill: { skillPath: ROOT },
            without_skill: {},
          },
        },
        null,
        2
      ) + "\n",
      "utf-8"
    );

    try {
      const report = runSkillEvals({
        repoRoot: ROOT,
        configPath,
        evalsPath,
        agent: "claude",
        profile: "with_skill",
        evalFilters: ["repair-agents-task-sync"],
        now: new Date("2026-03-06T01:02:03Z"),
      });

      expect(report.records).toHaveLength(1);
      expect(report.records[0].status).toBe("failed");
      expect(report.records[0].exitCode).toBe(0);
      expect(report.records[0].graderStatus).toBe("failed");
      expect(report.records[0].graderSummary.failed).toBeGreaterThan(0);
      expect(readFileSync(report.records[0].metadataPath, "utf-8")).toContain('"graderStatus": "failed"');

      const rendered = buildBenchmarkSummary(report, ROOT);
      expect(rendered).toContain("failed");
      expect(rendered).toContain("Grader results");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("records agent process failures without crashing the full report generation", () => {
    const tempDir = tempPath("benchmark-fail");
    const stubDir = join(tempDir, "bin");
    mkdirSync(stubDir, { recursive: true });
    const summaryPath = join(tempDir, "benchmark.md");
    const workspaceRoot = join(tempDir, "workspace");
    const configPath = join(tempDir, "benchmark.config.json");
    const evalsPath = join(tempDir, "evals.json");
    const stubs = createStubCommands(stubDir);

    writeEvalManifest(evalsPath);

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          workspaceRoot,
          summaryPath,
          agents: {
            claude: { command: stubs.fail, args: [] },
            codex: { command: stubs.codex, args: [] },
          },
          profiles: {
            with_skill: { skillPath: ROOT },
            without_skill: {},
          },
        },
        null,
        2
      ) + "\n",
      "utf-8"
    );

    try {
      const report = runSkillEvals({
        repoRoot: ROOT,
        configPath,
        evalsPath,
        agent: "claude",
        profile: "with_skill",
        evalFilters: ["repair-agents-task-sync"],
        now: new Date("2026-03-06T01:02:03Z"),
      });

      expect(report.records).toHaveLength(1);
      expect(report.records[0].status).toBe("failed");
      expect(report.records[0].exitCode).toBe(7);
      expect(report.records[0].agentStatus).toBe("failed");
      expect(readFileSync(report.records[0].stderrPath, "utf-8")).toContain("simulated failure");

      const rendered = buildBenchmarkSummary(report, ROOT);
      expect(rendered).toContain("failed");
      expect(rendered).toContain("repair-agents-task-sync");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("marks all-dry-run benchmark summaries as non-authoritative", () => {
    const tempDir = tempPath("benchmark-dry-run");
    const stubDir = join(tempDir, "bin");
    mkdirSync(stubDir, { recursive: true });
    const summaryPath = join(tempDir, "benchmark.md");
    const workspaceRoot = join(tempDir, "workspace");
    const configPath = join(tempDir, "benchmark.config.json");
    const evalsPath = join(tempDir, "evals.json");
    const stubs = createStubCommands(stubDir);

    writeEvalManifest(evalsPath);

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          workspaceRoot,
          summaryPath,
          agents: {
            claude: { command: stubs.claude, args: [] },
            codex: { command: stubs.codex, args: [] },
          },
          profiles: {
            with_skill: { skillPath: ROOT },
            without_skill: {},
          },
        },
        null,
        2
      ) + "\n",
      "utf-8"
    );

    try {
      const report = runSkillEvals({
        repoRoot: ROOT,
        configPath,
        evalsPath,
        agent: "codex",
        profile: "with_skill",
        evalFilters: ["repair-agents-task-sync"],
        dryRun: true,
        now: new Date("2026-03-06T01:02:03Z"),
      });

      const rendered = buildBenchmarkSummary(report, ROOT);
      expect(rendered).toContain("| full_test_count | 0 |");
      expect(rendered).toContain("| dry_run_count | 1 |");
      expect(rendered).toContain("| dry_run_ratio | 100.0% |");
      expect(rendered).toContain("effectiveness_authority | non_authoritative");
      expect(rendered).toContain("dry_run_ratio is above 30%");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
