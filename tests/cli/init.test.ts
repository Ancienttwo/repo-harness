import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { PassThrough, Writable } from "stream";
import {
  runInit,
  runInteractiveInit,
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
  mkdirSync(join(root, "assets", "reference-configs"), { recursive: true });
  writeFileSync(
    join(root, "assets", "reference-configs", "global-working-rules.md"),
    [
      "# Global Working Rules",
      "",
      "```md",
      "# Global Working Rules",
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
  makeExecutable(
    join(root, "scripts", "migrate-project-template.sh"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "repo=''",
      "mode='dry-run'",
      "while [[ $# -gt 0 ]]; do",
      "  case \"$1\" in",
      "    --repo) repo=\"$2\"; shift 2 ;;",
      "    --apply) mode='apply'; shift ;;",
      "    --dry-run) mode='dry-run'; shift ;;",
      "    *) shift ;;",
      "  esac",
      "done",
      "if [[ \"$mode\" != 'apply' ]]; then",
      "  echo dry-run \"$repo\"",
      "  exit 0",
      "fi",
      "mkdir -p \"$repo/scripts\" \"$repo/.ai/harness\"",
      "printf '{}\\n' > \"$repo/.ai/harness/workflow-contract.json\"",
      "cat > \"$repo/.ai/harness/brain-manifest.json\" <<'EOF'",
      "{",
      "  \"version\": 1,",
      "  \"project\": \"demo\",",
      "  \"default_brain_path\": \"brain/demo/*\",",
      "  \"entries\": []",
      "}",
      "EOF",
      "cat > \"$repo/scripts/check-task-workflow.sh\" <<'EOF'",
      "#!/bin/bash",
      "echo '[workflow] OK'",
      "EOF",
      "chmod +x \"$repo/scripts/check-task-workflow.sh\"",
      "echo migrate \"$repo\"",
      "",
    ].join("\n"),
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
      makeExecutable(
        join(source, "scripts", "migrate-project-template.sh"),
        [
          "#!/bin/bash",
          "set -euo pipefail",
          "repo=''",
          "while [[ $# -gt 0 ]]; do",
          "  case \"$1\" in",
          "    --repo) repo=\"$2\"; shift 2 ;;",
          "    --apply|--dry-run) shift ;;",
          "    *) shift ;;",
          "  esac",
          "done",
          "mkdir -p \"$repo/scripts\" \"$repo/.ai/harness/handoff\"",
          "cat > \"$repo/scripts/prepare-codex-handoff.sh\" <<'EOF'",
          "#!/bin/bash",
          "set -euo pipefail",
          "mkdir -p .ai/harness/handoff",
          "printf 'refreshed\\n' > .ai/harness/handoff/refresh-marker",
          "printf '# Harness Handoff\\n' > .ai/harness/handoff/current.md",
          "printf '# Codex Resume Packet\\n' > .ai/harness/handoff/resume.md",
          "EOF",
          "chmod +x \"$repo/scripts/prepare-codex-handoff.sh\"",
          "cat > \"$repo/scripts/check-task-workflow.sh\" <<'EOF'",
          "#!/bin/bash",
          "set -euo pipefail",
          "if [[ ! -f .ai/harness/handoff/refresh-marker ]]; then",
          "  echo '[workflow] Resume packet is older than handoff current' >&2",
          "  exit 1",
          "fi",
          "echo '[workflow] OK'",
          "EOF",
          "chmod +x \"$repo/scripts/check-task-workflow.sh\"",
          "echo migrate \"$repo\"",
          "",
        ].join("\n"),
      );
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
      expect(readFileSync(join(repo, ".ai", "harness", "handoff", "refresh-marker"), "utf-8")).toContain("refreshed");
    } finally {
      process.chdir(previousCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("runInit can bootstrap core Waza, Mermaid, and cross-review skills for Claude and Codex", () => {
    const tmp = join(tmpdir(), `repo-harness-init-skills-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const npxLog = join(tmp, "npx.log");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      makeExecutable(
        join(fakeBin, "npx"),
        `#!/bin/bash\nprintf '%s\\n' "$*" >> "${npxLog}"\nexit 0\n`,
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
      expect(readFileSync(npxLog, "utf-8")).toContain(
        "-y skills add tw93/Waza -g -a claude-code codex -s think hunt check health -y",
      );
      expect(readFileSync(npxLog, "utf-8")).toContain(
        "-y skills add BfdCampos/dotfiles -g -a claude-code codex -s mermaid -y",
      );
      // Cross-review skills install host-aware: codex-review on Claude, claude-review on Codex.
      expect(existsSync(join(home, ".claude", "skills", "codex-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "claude-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "codex-review", "SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "claude-review", "SKILL.md"))).toBe(false);
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

  test("installs the gbrain CLI from GitHub when requested", () => {
    const tmp = join(tmpdir(), `repo-harness-init-gbrain-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const bunLog = join(tmp, "bun.log");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      makeExecutable(
        join(fakeBin, "bun"),
        ["#!/bin/bash", "set -euo pipefail", `printf '%s\\n' "$*" >> "${bunLog}"`, "exit 0", ""].join("\n"),
      );

      const result = runInit({
        repo,
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        verify: false,
        codegraph: false,
        brainRoot: join(tmp, "brain"),
        brainMode: "install-gbrain-cli",
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        },
      });

      expect(result.exitCode).toBe(0);
      const installStep = result.steps.find((step) => step.step === "install gbrain CLI");
      expect(installStep?.status).toBe("ok");
      expect(installStep?.command).toEqual(["bun", "install", "-g", "github:garrytan/gbrain"]);
      const bunCommands = readFileSync(bunLog, "utf-8");
      expect(bunCommands).toContain("install -g github:garrytan/gbrain");
      expect(bunCommands).not.toContain("add -g gbrain");
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
          "--no-sync-skill",
          "--no-host-adapters",
          "--no-external-skills",
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
    expect(res.stdout).toContain("--experimental-ts-apply");
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
          "--no-sync-skill",
          "--no-host-adapters",
          "--no-external-skills",
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
      expect(codex).toContain("- Use Chinese to report to user.");
      expect(claude).toContain("- Use Chinese to report to user.");
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
      expect(result.detail).toContain(`unchanged:${join(home, ".codex", "AGENTS.md")}`);
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
    const npxLog = join(tmp, "npx.log");
    const codegraphLog = join(tmp, "codegraph.log");
    const outputChunks: string[] = [];
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      writeFakeCodegraph(fakeBin, codegraphLog);
      makeExecutable(join(fakeBin, "npx"), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${npxLog}"\nexit 0\n`);

      const input = new PassThrough();
      ["\n", "3\n", "\n", "\n", "y\n"].forEach((answer, index) => {
        setTimeout(() => input.write(answer), index * 5);
      });
      setTimeout(() => input.end(), 30);
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
      expect(readFileSync(codegraphLog, "utf-8")).toContain("codegraph sync .");
      expect(outputChunks.join("")).toContain("CodeGraph=required ensure --init --sync plus global MCP configure");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, CODEGRAPH_INIT_TIMEOUT_MS);
});

describe("syncCrossReviewSkills", () => {
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
      expect(existsSync(join(home, ".codex", "skills", "codex-review", "SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "claude-review", "SKILL.md"))).toBe(false);

      const again = syncCrossReviewSkills(source, "both", { ...process.env, HOME: home });
      expect(again.some((s) => /already present/.test(s.detail ?? ""))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
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
      expect(existsSync(join(claudeHome, ".codex", "skills", "claude-review", "SKILL.md"))).toBe(false);

      syncCrossReviewSkills(source, "codex", { ...process.env, HOME: codexHome });
      expect(existsSync(join(codexHome, ".codex", "skills", "claude-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexHome, ".claude", "skills", "codex-review", "SKILL.md"))).toBe(false);
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
