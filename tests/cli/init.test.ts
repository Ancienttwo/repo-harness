import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  chmodSync,
  cpSync,
  copyFileSync,
} from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { PassThrough, Writable } from "stream";
import {
  runInit,
  runInteractiveInit,
  resolveOsAccountHome,
  syncCrossReviewSkills,
  writeGlobalContextFiles,
} from "../../src/cli/commands/init";
import { configuredBrainRoot } from "../../src/cli/commands/brain-root";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");
const CODEGRAPH_INIT_TIMEOUT_MS = 30000;

function makeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function setupFakeSource(root: string): void {
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "assets"), { recursive: true });
  mkdirSync(join(root, "assets", "reference-configs"), { recursive: true });
  cpSync(join(ROOT, "assets", "templates", "helpers"), join(root, "scripts"), { recursive: true });
  copyFileSync(join(ROOT, "assets", "workflow-contract.v1.json"), join(root, "assets", "workflow-contract.v1.json"));
  writeFileSync(
    join(root, "assets", "reference-configs", "global-working-rules.md"),
    [
      "# Global Working Rules",
      "",
      "```md",
      "# Global Working Rules",
      "",
      "Rule 0: You may spend as much time as needed thinking. Do not send optional commentary progress messages. Use tools only when they are required. For tasks that do not require tools, complete the reasoning first, then answer in final.",
      "",
      "Reasoning: Prefer first principles over pattern matching. Before solving, first identify the observable and controllable conditions. For quantitative logic problems, before the final answer, you must prove the strategy is sufficient in the worst case. Numeric answers must have their arithmetic rechecked.",
      "",
      "Generality: These are general working rules. Do not tailor behavior to any specific evaluation or expected answer.",
      "",
      "- Use the user's language for reports; keep technical terms in English.",
      "- Finish and verify the concrete task.",
      "```",
      "",
    ].join("\n"),
  );
  makeExecutable(
    join(root, "scripts", "sync-codex-installed-copies.sh"),
    "#!/bin/bash\nset -euo pipefail\necho \"sync link=${AGENTIC_DEV_LINK_INSTALLED_COPIES:-unset}\"\n",
  );
  writeFileSync(
    join(root, "scripts", "inspect-project-state.ts"),
    "console.log('mode: initialize')\n",
  );
  mkdirSync(join(root, "assets", "skills", "codex-review"), { recursive: true });
  writeFileSync(
    join(root, "assets", "skills", "codex-review", "SKILL.md"),
    "---\nname: codex-review\n---\n",
  );
  mkdirSync(join(root, "assets", "skills", "claude-review"), { recursive: true });
  writeFileSync(
    join(root, "assets", "skills", "claude-review", "SKILL.md"),
    "---\nname: claude-review\n---\n",
  );
  mkdirSync(join(root, "assets", "skills", "claude-plan"), { recursive: true });
  writeFileSync(
    join(root, "assets", "skills", "claude-plan", "SKILL.md"),
    "---\nname: claude-plan\n---\n",
  );
}

function writeFakeCodegraph(fakeBin: string, logFile: string): void {
  makeExecutable(
    join(fakeBin, "codegraph"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      `echo "codegraph $*" >> "${logFile}"`,
      "case \"${1:-}\" in",
      "  \"--version\") echo '0.9.6' ;;",
      "  \"status\")",
      "    if [[ -f .codegraph/initialized ]]; then",
      "      echo 'CodeGraph Status'",
      "      echo 'Index is up to date'",
      "    else",
      "      echo 'CodeGraph Status'",
      "      echo 'Not initialized'",
      "      echo 'Run \"codegraph init\" to initialize'",
      "    fi",
      "    ;;",
      "  \"init\") mkdir -p .codegraph; touch .codegraph/initialized; echo 'initialized' ;;",
      "  \"sync\") mkdir -p .codegraph; touch .codegraph/initialized; echo 'synced' ;;",
      "  \"install\") echo 'installed' ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n"),
  );
}

describe("init command", () => {
  test("defaults --repo to cwd and applies the existing-repo harness", () => {
    const tmp = join(tmpdir(), `repo-harness-init-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const previousCwd = process.cwd();
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      process.chdir(repo);

      const result = runInit({
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        codegraph: false,
      });

      expect(result.exitCode).toBe(0);
      expect(realpathSync(result.repoRoot)).toBe(realpathSync(repo));
      expect(result.steps.map((step) => step.step)).toContain("apply repo harness");
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(true);
    } finally {
      process.chdir(previousCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30000);

  test("runInit registers an adopted repo in the global repo-harness registry", () => {
    const tmp = join(tmpdir(), `repo-harness-init-registry-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      setupFakeSource(source);

      const result = runInit({
        repo,
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        verify: false,
        codegraph: false,
        env: {
          ...process.env,
          HOME: home,
          REPO_HARNESS_HOME: join(home, ".repo-harness"),
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "register repo harness repo")?.status).toBe("ok");
      const registry = JSON.parse(readFileSync(join(home, ".repo-harness", "registered-repos.json"), "utf-8"));
      expect(registry.repos).toEqual([
        expect.objectContaining({ source: "adopt", path: realpathSync(repo) }),
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("runInit refreshes Codex handoff before outer workflow verification", () => {
    const tmp = join(tmpdir(), `repo-harness-init-handoff-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const previousCwd = process.cwd();
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      process.chdir(repo);

      const result = runInit({
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        codegraph: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "refresh handoff packet")?.status).toBe("ok");
      expect(result.steps.find((step) => step.step === "verify repo harness")?.status).toBe("ok");
      expect(readFileSync(join(repo, ".ai", "harness", "handoff", "current.md"), "utf-8")).toContain("repo-harness-adopt-verify");
      expect(readFileSync(join(repo, ".ai", "harness", "handoff", "resume.md"), "utf-8")).toContain("Codex Resume Packet");
    } finally {
      process.chdir(previousCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30000);

  test("runInit can bootstrap core Waza, Mermaid, and cross-review skills for Claude and Codex", () => {
    const tmp = join(tmpdir(), `repo-harness-init-skills-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const bunxLog = join(tmp, "bunx.log");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      mkdirSync(join(home, ".agents", "rules"), { recursive: true });
      writeFileSync(join(home, ".agents", "rules", "anti-patterns.md"), "anti\n");
      writeFileSync(join(home, ".agents", "rules", "chinese.md"), "zh\n");
      writeFileSync(join(home, ".agents", "rules", "durable-context.md"), "durable\n");
      writeFileSync(join(home, ".agents", "rules", "english.md"), "en\n");
      makeExecutable(
        join(fakeBin, "bunx"),
        `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunxLog}"\nexit 0\n`,
      );

      const result = runInit({
        repo,
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        verify: false,
        codegraph: false,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(readFileSync(bunxLog, "utf-8")).toContain(
        "skills add tw93/Waza -g -a claude-code codex -s think hunt check health -y",
      );
      expect(readFileSync(join(home, ".claude", "rules", "anti-patterns.md"), "utf-8")).toBe("anti\n");
      expect(readFileSync(join(home, ".codex", "rules", "anti-patterns.md"), "utf-8")).toBe("anti\n");
      expect(readFileSync(bunxLog, "utf-8")).toContain(
        "skills add BfdCampos/dotfiles -g -a claude-code codex -s mermaid -y",
      );
      // Cross-model skills install host-aware: codex-review on Claude; claude-review and claude-plan on Codex.
      expect(existsSync(join(home, ".claude", "skills", "codex-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "claude-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "claude-plan", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "codex-review", "SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "claude-review", "SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "claude-plan", "SKILL.md"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("dry-run does not mutate host runtime or apply the target harness", () => {
    const tmp = join(tmpdir(), `repo-harness-init-dry-run-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);

      const result = runInit({
        repo,
        sourceRoot: source,
        apply: false,
        target: "codex",
        env: {
          ...process.env,
          HOME: home,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "sync repo-harness skills")?.detail).toBe("dry-run");
      expect(result.steps.find((step) => step.step === "install host adapters")?.detail).toBe("dry-run");
      expect(existsSync(join(home, ".codex", "hooks.json"))).toBe(false);
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("npx cache sources force copy-based installed skill sync", () => {
    const tmp = join(tmpdir(), `repo-harness-init-npx-${Date.now()}`);
    const source = join(tmp, "_npx", "abc123", "node_modules", "repo-harness");
    const repo = join(tmp, "repo");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);

      const result = runInit({
        repo,
        sourceRoot: source,
        hostAdapters: false,
        externalSkills: false,
        verify: false,
        codegraph: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "sync repo-harness skills")?.stdout).toContain(
        "sync link=0",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("CLI adopt --dry-run --json returns the adoption planner protocol", () => {
    const tmp = join(tmpdir(), `repo-harness-init-cli-codegraph-${Date.now()}`);
    try {
      mkdirSync(tmp, { recursive: true });
      const res = spawnSync(
        "bun",
        [
          CLI,
          "adopt",
          "--repo",
          tmp,
          "--dry-run",
          "--no-verify",
          "--no-codegraph",
          "--json",
        ],
        {
          cwd: ROOT,
          encoding: "utf-8",
        },
      );

      expect(res.status).toBe(0);
      const result = JSON.parse(res.stdout);
      expect(result.protocol).toBe(1);
      expect(result.command).toBe("adopt");
      expect(result.apply).toBe(false);
      expect(result.summary.byKind.mkdir).toBeGreaterThan(0);
      expect(result.steps).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30000);

  test("CLI exposes adopt help for repo-local refresh", () => {
    const res = spawnSync("bun", [CLI, "adopt", "--help"], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Usage: repo-harness adopt");
    expect(res.stdout).toContain("--repo <path>");
    expect(res.stdout).toContain("--dry-run");
    expect(res.stdout).not.toContain("--experimental-ts-apply");
    expect(res.stdout).toContain("--no-codegraph");
  });

  test("CLI update rejects repo refresh flags with an adopt hint", () => {
    const res = spawnSync("bun", [CLI, "update", "--repo", ".", "--json"], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(res.status).toBe(2);
    expect(res.stderr).toContain("repo-harness update no longer refreshes repositories");
    expect(res.stderr).toContain("repo-harness adopt --repo <path>");
  });

  test("CLI adopt rejects user-level brain configuration flags", () => {
    const tmp = join(tmpdir(), `repo-harness-adopt-brain-${Date.now()}`);
    try {
      mkdirSync(tmp, { recursive: true });
      const res = spawnSync("bun", [CLI, "adopt", "--repo", tmp, "--brain-mode", "manifest-only", "--json"], {
        cwd: ROOT,
        encoding: "utf-8",
      });

      expect(res.status).toBe(2);
      expect(res.stderr).toContain("brain configuration writes user-level state");
      expect(existsSync(join(tmp, ".repo-harness"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("adopt refuses HOME before running migration or host bootstrap", () => {
    const tmp = join(tmpdir(), `repo-harness-adopt-home-${Date.now()}`);
    const home = join(tmp, "home");
    try {
      mkdirSync(home, { recursive: true });
      const res = spawnSync(
        "bun",
        [
          CLI,
          "adopt",
          "--dry-run",
          "--no-verify",
          "--no-codegraph",
          "--json",
        ],
        {
          cwd: home,
          encoding: "utf-8",
          env: { ...process.env, HOME: home },
        },
      );

      expect(res.status).toBe(2);
      const result = JSON.parse(res.stdout);
      expect(result.protocol).toBe(1);
      expect(result.command).toBe("adopt");
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          code: "invalid_repo_target",
          message: expect.stringContaining("refusing to apply repo harness to HOME"),
        }),
      );
      expect(result.operations).toEqual([]);
      expect(existsSync(join(home, ".ai"))).toBe(false);
      expect(existsSync(join(home, ".codex"))).toBe(false);
      expect(existsSync(join(home, ".claude"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 15000);

  test("configures CodeGraph MCP only when explicitly requested", () => {
    const tmp = join(tmpdir(), `repo-harness-init-configure-codegraph-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const logFile = join(tmp, "codegraph.log");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      writeFakeCodegraph(fakeBin, logFile);

      const result = runInit({
        repo,
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        verify: false,
        configureCodegraphMcp: true,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "ensure codegraph index")?.detail).toContain(
        "init-index:changed",
      );
      const configureStep = result.steps.find((step) => step.step === "configure codegraph mcp");
      expect(configureStep?.status).toBe("ok");
      expect(configureStep?.detail).toContain("configure-codex:changed");
      expect(configureStep?.detail).toContain("configure-claude:changed");

      const log = readFileSync(logFile, "utf-8");
      expect(log).toContain("codegraph init -i .");
      expect(log).toContain("codegraph install --target codex --location global --yes");
      expect(log).toContain("codegraph install --target claude --location global --yes");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, CODEGRAPH_INIT_TIMEOUT_MS);

  test("adopt reports CodeGraph readiness exceptions as a structured failed step", () => {
    const tmp = join(tmpdir(), `repo-harness-init-codegraph-failure-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      makeExecutable(join(fakeBin, "node"), "#!/bin/bash\necho 'not json'\nexit 0\n");

      const result = runInit({
        repo,
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        verify: false,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        },
      });

      const codegraphStep = result.steps.find((step) => step.step === "ensure codegraph index");
      expect(result.exitCode).toBe(1);
      expect(codegraphStep?.status).toBe("failed");
      expect(codegraphStep?.detail).toBe("CodeGraph readiness check failed");
      expect(codegraphStep?.stderr).toContain("JSON Parse error");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("writes global working rules as an idempotent managed block", () => {
    const tmp = join(tmpdir(), `repo-harness-init-global-rules-${Date.now()}`);
    const source = join(tmp, "source");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      setupFakeSource(source);
      mkdirSync(join(home, ".codex"), { recursive: true });
      writeFileSync(join(home, ".codex", "AGENTS.md"), "user content\n");

      const first = writeGlobalContextFiles(
        source,
        "both",
        { reportLanguageInstruction: "Use Chinese to report to user." },
        { ...process.env, HOME: home },
      );
      const second = writeGlobalContextFiles(
        source,
        "both",
        { reportLanguageInstruction: "Use Chinese to report to user." },
        { ...process.env, HOME: home },
      );

      expect(first.status).toBe("ok");
      expect(second.detail).toContain("unchanged");
      const codex = readFileSync(join(home, ".codex", "AGENTS.md"), "utf-8");
      const claude = readFileSync(join(home, ".claude", "CLAUDE.md"), "utf-8");
      expect(codex).toContain("user content");
      expect(codex).toContain("<!-- BEGIN: repo-harness global-working-rules -->");
      expect(codex).toContain(
        "<!-- repo-harness manages this block; edits inside are overwritten on sync. Keep personal rules outside the markers. -->",
      );
      expect(codex).toContain("- Use Chinese to report to user.");
      expect(codex).toContain("Rule 0: You may spend as much time as needed thinking.");
      expect(codex).toContain("Reasoning: Prefer first principles over pattern matching.");
      expect(codex).toContain("Generality: These are general working rules.");
      expect(claude).toContain("- Use Chinese to report to user.");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("blocks the global working rules write when repo-harness markers are unbalanced", () => {
    const tmp = join(tmpdir(), `repo-harness-init-global-rules-unbalanced-${Date.now()}`);
    const source = join(tmp, "source");
    const home = join(tmp, "home");
    const duplicated = [
      "<!-- BEGIN: repo-harness global-working-rules -->",
      "# Global Working Rules",
      "- one",
      "<!-- END: repo-harness global-working-rules -->",
      "",
      "<!-- BEGIN: repo-harness global-working-rules -->",
      "# Global Working Rules",
      "- two",
      "<!-- END: repo-harness global-working-rules -->",
      "",
    ].join("\n");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      setupFakeSource(source);
      mkdirSync(join(home, ".codex"), { recursive: true });
      writeFileSync(join(home, ".codex", "AGENTS.md"), duplicated);

      const result = writeGlobalContextFiles(
        source,
        "codex",
        { reportLanguageInstruction: "Use Chinese to report to user." },
        { ...process.env, HOME: home },
      );

      expect(result.status).toBe("failed");
      expect(result.detail).toContain(`blocked:${join(home, ".codex", "AGENTS.md")}`);
      const codex = readFileSync(join(home, ".codex", "AGENTS.md"), "utf-8");
      expect(codex).toBe(duplicated);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("resolves host context paths from USERPROFILE when HOME is absent", () => {
    const tmp = join(tmpdir(), `repo-harness-init-userprofile-${Date.now()}`);
    const source = join(tmp, "source");
    const home = join(tmp, "profile");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      setupFakeSource(source);

      const result = writeGlobalContextFiles(
        source,
        "codex",
        { reportLanguageInstruction: "Use Chinese to report to user." },
        { ...process.env, HOME: undefined, USERPROFILE: home } as NodeJS.ProcessEnv,
      );

      expect(result.status).toBe("ok");
      expect(existsSync(join(home, ".codex", "AGENTS.md"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("does not insert global working rules when the user already has them", () => {
    const tmp = join(tmpdir(), `repo-harness-init-global-rules-existing-${Date.now()}`);
    const source = join(tmp, "source");
    const home = join(tmp, "home");
    const existing = [
      "# Global Working Rules",
      "",
      "- Custom user-owned rule.",
      "",
    ].join("\n");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      setupFakeSource(source);
      mkdirSync(join(home, ".codex"), { recursive: true });
      writeFileSync(join(home, ".codex", "AGENTS.md"), existing);

      const result = writeGlobalContextFiles(
        source,
        "codex",
        { reportLanguageInstruction: "Use Chinese to report to user." },
        { ...process.env, HOME: home },
      );

      expect(result.status).toBe("ok");
      expect(result.detail).toContain(`skipped-legacy:${join(home, ".codex", "AGENTS.md")}`);
      const codex = readFileSync(join(home, ".codex", "AGENTS.md"), "utf-8");
      expect(codex).toBe(existing);
      expect(codex).not.toContain("<!-- BEGIN: repo-harness global-working-rules -->");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("resolves brain roots from REPO_HARNESS_BRAIN_ROOT", () => {
    const tmp = join(tmpdir(), `repo-harness-brain-root-${Date.now()}`);
    try {
      mkdirSync(tmp, { recursive: true });
      const root = configuredBrainRoot({
        ...process.env,
        HOME: join(tmp, "home"),
        REPO_HARNESS_BRAIN_ROOT: "~/custom-brain",
      });
      expect(root).toBe(join(tmp, "home", "custom-brain"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("interactive init collects a plan then calls existing init primitives", async () => {
    const tmp = join(tmpdir(), `repo-harness-init-interactive-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const bunxLog = join(tmp, "bunx.log");
    const codegraphLog = join(tmp, "codegraph.log");
    const outputChunks: string[] = [];
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      writeFakeCodegraph(fakeBin, codegraphLog);
      makeExecutable(join(fakeBin, "bunx"), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunxLog}"\nexit 0\n`);

      const input = new PassThrough();
      // Answers, in prompt order: host target, reporting language (English),
      // brain location, brain mode, external skills confirm, CodeGraph
      // confirm, final "Proceed" confirm. Blank lines take each prompt's
      // default (defaults to "yes" for the two new confirms), preserving
      // today's default-on outcome.
      ["\n", "3\n", "\n", "\n", "\n", "\n", "y\n"].forEach((answer, index) => {
        setTimeout(() => input.write(answer), index * 5);
      });
      setTimeout(() => input.end(), 40);
      const output = new Writable({
        write(chunk, _encoding, callback) {
          outputChunks.push(String(chunk));
          callback();
        },
      });
      const result = await runInteractiveInit({
        repo,
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        verify: false,
        input,
        output,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "global working rules")?.status).toBe("ok");
      expect(result.steps.find((step) => step.step === "ensure brain root")?.detail).toBe(join(home, "Documents", "brain"));
      expect(readFileSync(join(home, ".codex", "AGENTS.md"), "utf-8")).toContain("Use English to report to user.");
      expect(readFileSync(bunxLog, "utf-8")).toContain("skills add tw93/Waza");
      expect(readFileSync(codegraphLog, "utf-8")).toContain("codegraph sync .");
      expect(outputChunks.join("")).toContain("externalSkills=true");
      expect(outputChunks.join("")).toContain("CodeGraph=ensure --init --sync plus global MCP configure");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, CODEGRAPH_INIT_TIMEOUT_MS);

  test("interactive init skips external skills and CodeGraph when declined", async () => {
    const tmp = join(tmpdir(), `repo-harness-init-interactive-declined-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const outputChunks: string[] = [];
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      setupFakeSource(source);

      const input = new PassThrough();
      // Same prompt order as above, but decline both new confirms ("n").
      // Neither bunx nor codegraph should be invoked, so no fake binaries
      // are needed on PATH for this run.
      ["\n", "3\n", "\n", "\n", "n\n", "n\n", "y\n"].forEach((answer, index) => {
        setTimeout(() => input.write(answer), index * 5);
      });
      setTimeout(() => input.end(), 40);
      const output = new Writable({
        write(chunk, _encoding, callback) {
          outputChunks.push(String(chunk));
          callback();
        },
      });
      const result = await runInteractiveInit({
        repo,
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        verify: false,
        input,
        output,
        env: {
          ...process.env,
          HOME: home,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "external skills")?.status).toBe("skipped");
      expect(result.steps.find((step) => step.step === "external skills")?.detail).toBe("disabled");
      expect(result.steps.find((step) => step.step === "ensure codegraph index")?.status).toBe("skipped");
      expect(result.steps.find((step) => step.step === "ensure codegraph index")?.detail).toBe("disabled");
      expect(outputChunks.join("")).toContain("externalSkills=false");
      expect(outputChunks.join("")).toContain("CodeGraph=skip");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, CODEGRAPH_INIT_TIMEOUT_MS);
});

describe("bundled host runtimes", () => {
  function makeSource(root: string): void {
    mkdirSync(join(root, "assets", "skills", "codex-review"), { recursive: true });
    writeFileSync(
      join(root, "assets", "skills", "codex-review", "SKILL.md"),
      "---\nname: codex-review\n---\n",
    );
    mkdirSync(join(root, "assets", "skills", "claude-review"), { recursive: true });
    writeFileSync(
      join(root, "assets", "skills", "claude-review", "SKILL.md"),
      "---\nname: claude-review\n---\n",
    );
    mkdirSync(join(root, "assets", "skills", "claude-plan"), { recursive: true });
    writeFileSync(
      join(root, "assets", "skills", "claude-plan", "SKILL.md"),
      "---\nname: claude-plan\n---\n",
    );
  }

  test("installs host-aware: codex-review to Claude, claude-review to Codex", () => {
    const tmp = join(tmpdir(), `cross-review-both-${Date.now()}`);
    const source = join(tmp, "source");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      makeSource(source);

      const steps = syncCrossReviewSkills(source, "both", { ...process.env, HOME: home });

      expect(steps.every((s) => s.status === "ok")).toBe(true);
      expect(existsSync(join(home, ".claude", "skills", "codex-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "claude-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "claude-plan", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "codex-review", "SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "claude-review", "SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "claude-plan", "SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "merge-gate", "SKILL.md"))).toBe(false);

      const again = syncCrossReviewSkills(source, "both", { ...process.env, HOME: home });
      expect(again.some((s) => /already present/.test(s.detail ?? ""))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("resolves merge-gate authority from the OS account rather than caller HOME", () => {
    const callerHome = join(tmpdir(), `caller-home-${Date.now()}`);
    const previous = process.env.HOME;
    process.env.HOME = callerHome;
    try {
      expect(resolveOsAccountHome()).not.toBe(callerHome);
    } finally {
      if (previous === undefined) delete process.env.HOME;
      else process.env.HOME = previous;
    }
  });

  test("respects target=claude (only codex-review) and target=codex (only claude-review)", () => {
    const tmp = join(tmpdir(), `cross-review-target-${Date.now()}`);
    const source = join(tmp, "source");
    const claudeHome = join(tmp, "home-claude");
    const codexHome = join(tmp, "home-codex");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(claudeHome, { recursive: true });
      mkdirSync(codexHome, { recursive: true });
      makeSource(source);

      syncCrossReviewSkills(source, "claude", { ...process.env, HOME: claudeHome });
      expect(existsSync(join(claudeHome, ".claude", "skills", "codex-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(claudeHome, ".claude", "skills", "merge-gate", "SKILL.md"))).toBe(false);
      expect(existsSync(join(claudeHome, ".codex", "skills", "claude-review", "SKILL.md"))).toBe(false);
      expect(existsSync(join(claudeHome, ".codex", "skills", "claude-plan", "SKILL.md"))).toBe(false);

      syncCrossReviewSkills(source, "codex", { ...process.env, HOME: codexHome });
      expect(existsSync(join(codexHome, ".codex", "skills", "claude-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexHome, ".codex", "skills", "claude-plan", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexHome, ".claude", "skills", "codex-review", "SKILL.md"))).toBe(false);
      expect(existsSync(join(codexHome, ".codex", "skills", "merge-gate", "SKILL.md"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("skips (does not fail) when the bundled source is missing", () => {
    const tmp = join(tmpdir(), `cross-review-missing-${Date.now()}`);
    const source = join(tmp, "source");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });

      const steps = syncCrossReviewSkills(source, "both", { ...process.env, HOME: home });
      expect(steps.every((s) => s.status !== "failed")).toBe(true);
      expect(steps.some((s) => s.status === "skipped")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
