import { recordInstallOwnership } from "../helpers/install-ownership";
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
  chmodSync,
  copyFileSync,
  symlinkSync,
} from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { createHash } from "crypto";
import {
  runInit,
  resolveOsAccountHome,
  syncCrossReviewSkills,
} from "../../src/cli/commands/init";
import { globalRuntimeScope, withRuntimeTransactionLock } from "../../src/effects/locking/runtime-transaction-lock";
import { beginInstallHostTransaction, rollbackInstallHostTransaction } from "../../src/cli/installer/install-profile";
import { configuredBrainRoot } from "../../src/cli/commands/brain-root";
import { listHelperFiles } from "../../src/effects/runtime/helper-runner";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");
const CODEGRAPH_INIT_TIMEOUT_MS = 30000;

function makeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function writeOfficialCodexPluginFixture(pluginRoot: string): void {
  mkdirSync(join(pluginRoot, "scripts"), { recursive: true });
  mkdirSync(join(pluginRoot, ".claude-plugin"), { recursive: true });
  mkdirSync(join(pluginRoot, "schemas"), { recursive: true });
  writeFileSync(join(pluginRoot, "scripts", "codex-companion.mjs"), "// fixture\n");
  writeFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({
    name: "codex",
    version: "1.0.6",
    author: { name: "OpenAI" },
  }));
  writeFileSync(join(pluginRoot, "schemas", "review-output.schema.json"), JSON.stringify({
    required: ["verdict", "summary", "findings", "next_steps"],
    properties: {
      verdict: { enum: ["approve", "needs-attention"] },
      findings: { items: { properties: { severity: { enum: ["critical", "high", "medium", "low"] } } } },
    },
  }));
}

function writeReadyOfficialCodexPluginCli(fakeBin: string, home: string): string {
  const pluginRoot = join(home, '.claude', 'plugins', 'cache', 'openai-codex', 'codex', '1.0.6');
  writeOfficialCodexPluginFixture(pluginRoot);
  const claude = join(fakeBin, 'claude');
  makeExecutable(claude, [
    '#!/bin/bash',
    'if [[ "$*" == "plugin list --json" ]]; then',
    `  touch '${join(home, 'plugin-invoked')}'`,
    `  printf '%s\\n' '${JSON.stringify([{ id: 'codex@openai-codex', version: '1.0.6', enabled: true, installPath: pluginRoot }])}'`,
    '  exit 0',
    'fi',
    'exit 9',
    '',
  ].join('\n'));
  return claude;
}

/**
 * Every entry under root, keyed by absolute path: a file's content digest, a
 * symlink's target, or the entry kind. A projected skill can be a link, so a
 * file-only view would miss it.
 */
function snapshotTree(root: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name);
    entries[path] = entry.isSymbolicLink() ? `link:${readlinkSync(path)}`
      : entry.isFile() ? `file:${createHash("sha256").update(readFileSync(path)).digest("hex")}`
        : entry.isDirectory() ? "dir" : "other";
  }
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
}

function setupFakeSource(root: string): void {
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "assets"), { recursive: true });
  mkdirSync(join(root, "assets", "reference-configs"), { recursive: true });
  // A real skill-surface manifest keeps this synthetic package tree loadable
  // exactly like the real repo.
  mkdirSync(join(root, "assets", "skill-commands"), { recursive: true });
  copyFileSync(
    join(ROOT, "assets", "skill-commands", "manifest.json"),
    join(root, "assets", "skill-commands", "manifest.json"),
  );
  // The package ships scripts/ beside src/, and helpers import package modules.
  for (const helper of listHelperFiles({ REPO_HARNESS_SOURCE_ROOT: ROOT })) {
    copyFileSync(join(ROOT, "scripts", helper), join(root, "scripts", helper));
  }
  symlinkSync(join(ROOT, "src"), join(root, "src"), "dir");
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
  mkdirSync(join(root, "assets", "skills", "repo-harness-cross-review"), { recursive: true });
  writeFileSync(
    join(root, "assets", "skills", "repo-harness-cross-review", "SKILL.md"),
    "---\nname: repo-harness-cross-review\n---\n",
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
      "    if [[ -f .codegraph/unavailable ]]; then",
      "      echo 'Temporary status failure'",
      "    elif [[ -f .codegraph/unknown ]]; then",
      "      echo 'CodeGraph Status'",
      "      echo 'Status output unavailable'",
      "    elif [[ -f .codegraph/stale ]]; then",
      "      echo 'CodeGraph Status'",
      "      echo 'Pending Changes'",
      "      echo 'Run \"codegraph sync\" to update the index'",
      "    elif [[ -f .codegraph/initialized ]]; then",
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
  test("init leaves account architecture defaults to update and names the command", () => {
    const tmp = join(tmpdir(), `repo-harness-init-architecture-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const accountHome = join(tmp, "account");
    const configPath = join(accountHome, ".repo-harness/config.json");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(dirname(configPath), { recursive: true });
      setupFakeSource(source);
      writeFileSync(configPath, JSON.stringify({ brainRoot: "/existing/brain" }));
      const options = {
        repo, sourceRoot: source, codegraph: false, verify: false,
        env: { ...process.env, HOME: accountHome, REPO_HARNESS_HOME: join(accountHome, ".repo-harness") },
      };
      const initial = readFileSync(configPath, "utf8");
      expect(runInit({ ...options, apply: false }).exitCode).toBe(0);
      expect(readFileSync(configPath, "utf8")).toBe(initial);

      const applied = runInit(options);
      expect(applied.exitCode).toBe(0);
      expect(readFileSync(configPath, "utf8")).toBe(initial);
      expect(applied.steps.find((step) => step.step === "global architecture projection")).toBeUndefined();
      expect(applied.steps.find((step) => step.step === "architecture projection readiness")).toMatchObject({
        status: "skipped",
        detail: expect.stringContaining("run repo-harness update"),
      });
      const disabled = JSON.stringify({
        architecture: { projection_provider: "disabled", projection_apply: "disabled" },
        refactor_recommendations: { enabled: false },
      });
      writeFileSync(configPath, disabled);
      expect(runInit(options).exitCode).toBe(0);
      expect(readFileSync(configPath, "utf8")).toBe(disabled);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);

  test("init applies while an install transaction holds the host lock and writes no host state", () => {
    const tmp = join(tmpdir(), `repo-harness-init-host-lock-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const configPath = join(home, ".repo-harness/config.json");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(dirname(configPath), { recursive: true });
      setupFakeSource(source);
      const original = JSON.stringify({ brainRoot: "/existing/brain" });
      writeFileSync(configPath, original);
      const env = { ...process.env, HOME: home, REPO_HARNESS_HOME: join(home, ".repo-harness") };
      const options = { repo, sourceRoot: source, env, codegraph: false, verify: false };
      // Init takes no part in the host transaction, so a held update lock and
      // its rollback preimage neither block init nor see an init write.
      withRuntimeTransactionLock(globalRuntimeScope(env), (runtimeLock) => {
        const transaction = beginInstallHostTransaction([configPath], env, { runtimeLock });
        try {
          const result = runInit(options);
          expect(result.exitCode).toBe(0);
          expect(result.steps.find((step) => step.step === "global automation defaults")).toBeUndefined();
          expect(readFileSync(configPath, "utf8")).toBe(original);
        } finally {
          rollbackInstallHostTransaction(transaction);
        }
      });
      expect(readFileSync(configPath, "utf8")).toBe(original);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30000);

  test("applied init leaves install-managed HOME state unchanged", () => {
    const tmp = join(tmpdir(), `repo-harness-init-home-unchanged-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    // Init owns the registry entry and no host handoff projection.
    const registry = join(home, ".repo-harness", "registered-repos.json");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      for (const [path, content] of [
        [".repo-harness/config.json", JSON.stringify({ brainRoot: "/existing/brain" })],
        [".claude/settings.json", "{}\n"],
        [".claude/CLAUDE.md", "user rules\n"],
        [".codex/AGENTS.md", "user rules\n"],
        [".codex/hooks.json", "{}\n"],
      ] as const) {
        mkdirSync(dirname(join(home, path)), { recursive: true });
        writeFileSync(join(home, path), content);
      }
      const before = snapshotTree(home);

      // Verify runs bun child processes; their transpiler cache is Bun's, not a
      // repo-harness host surface, so it lives beside HOME instead of under it.
      const result = runInit({
        repo, sourceRoot: source, codegraph: false,
        env: {
          ...process.env,
          HOME: home,
          REPO_HARNESS_HOME: join(home, ".repo-harness"),
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(tmp, "bun-cache"),
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "register repo harness repo")?.status).toBe("ok");
      expect(result.steps.find((step) => step.step === "required Herdr skill")).toMatchObject({
        status: "skipped",
        detail: "missing for claude,codex; run: repo-harness update --target both",
      });
      const after = snapshotTree(home);
      expect(Object.keys(after).filter((path) => path !== registry)).toEqual(Object.keys(before));
      for (const [path, entry] of Object.entries(before)) expect(after[path]).toBe(entry);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);

  test("defaults --repo to cwd and applies the existing-repo harness", () => {
    const tmp = join(tmpdir(), `repo-harness-init-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const previousCwd = process.cwd();
    try {
      mkdirSync(join(tmp, "home"), { recursive: true });
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      process.chdir(repo);

      const result = runInit({
        sourceRoot: source,
        env: { ...process.env, HOME: join(tmp, "home"), REPO_HARNESS_HOME: join(tmp, "home", ".repo-harness") },
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
        expect.objectContaining({ source: "init", path: realpathSync(repo) }),
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("runInit in a linked worktree adds no registry row and names the primary checkout", () => {
    const tmp = join(tmpdir(), `repo-harness-init-linked-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const linked = join(tmp, "linked");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      setupFakeSource(source);
      writeFileSync(join(repo, "README.md"), "fixture\n");
      for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["commit", "-qm", "base"], ["worktree", "add", "-q", "-b", "feature", linked]]) {
        const git = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
        expect(git.status, git.stderr).toBe(0);
      }

      const result = runInit({
        repo: linked,
        sourceRoot: source,
        verify: false,
        codegraph: false,
        env: { ...process.env, HOME: home, REPO_HARNESS_HOME: join(home, ".repo-harness") },
      });

      expect(result.exitCode).not.toBe(0);
      expect(JSON.stringify(result.steps)).toContain(`register the primary checkout ${realpathSync(repo)} instead`);
      const registry = join(home, ".repo-harness", "registered-repos.json");
      expect(existsSync(registry) ? JSON.parse(readFileSync(registry, "utf-8")).repos : []).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("runInit creates no handoff files and checks context without a plan file", () => {
    const tmp = join(tmpdir(), `repo-harness-init-handoff-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const previousCwd = process.cwd();
    try {
      mkdirSync(join(tmp, "home"), { recursive: true });
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      process.chdir(repo);

      const result = runInit({
        sourceRoot: source,
        env: { ...process.env, HOME: join(tmp, "home"), REPO_HARNESS_HOME: join(tmp, "home", ".repo-harness") },
        codegraph: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "refresh handoff packet")).toBeUndefined();
      expect(result.steps.find((step) => step.step === "verify repo harness")?.status).toBe("ok");
      expect(result.steps.find((step) => step.step === "verify repo harness")?.detail).toBe("repo-harness run check-context-files");
      expect(existsSync(join(repo, ".ai", "harness", "active-plan"))).toBe(false);
      expect(existsSync(join(repo, ".ai", "harness", "handoff"))).toBe(false);
      expect(existsSync(join(repo, ".ai", "harness", "handoff", "current.md"))).toBe(false);
      expect(existsSync(join(repo, ".ai", "harness", "handoff", "resume.md"))).toBe(false);
    } finally {
      process.chdir(previousCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30000);

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
      expect(existsSync(home)).toBe(false);
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("npx cache sources without a caller env register the repo under process.env", () => {
    // Init passes the caller env to the adoption apply unchanged. With no caller
    // env, registerRepoHarnessRepo resolves REPO_HARNESS_HOME ?? HOME ?? homedir()
    // from process.env (src/effects/repo-registry.ts). A constructed env that
    // dropped that base would silently redirect the registry write to the
    // operator's real home, the one hole tests/preload-home-isolation.ts cannot
    // defend.
    const tmp = join(tmpdir(), `repo-harness-init-npx-env-base-${Date.now()}`);
    const source = join(tmp, "_npx", "abc123", "node_modules", "repo-harness");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const harnessHome = join(tmp, "harness-home");
    // This test drives the no-env path on purpose, so the marker has to live in
    // process.env itself: REPO_HARNESS_HOME points at harnessHome, and the guard
    // asserts the registry write lands there. Measured, not assumed: Bun caches
    // os.homedir() at process start, so setting process.env.HOME mid-run does
    // NOT redirect the homedir() fallback — on unfixed code this test writes to
    // the operator's real ~/.repo-harness, which is precisely the leak under
    // guard here. HOME is still set for the env.HOME readers inside runInit.
    const previous = {
      HOME: process.env.HOME,
      REPO_HARNESS_HOME: process.env.REPO_HARNESS_HOME,
      AGENTIC_DEV_LINK_INSTALLED_COPIES: process.env.AGENTIC_DEV_LINK_INSTALLED_COPIES,
    };
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      setupFakeSource(source);
      process.env.HOME = home;
      process.env.REPO_HARNESS_HOME = harnessHome;
      delete process.env.AGENTIC_DEV_LINK_INSTALLED_COPIES;

      const result = runInit({
        repo,
        sourceRoot: source,
        verify: false,
        codegraph: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "register repo harness repo")?.status).toBe("ok");
      const registry = JSON.parse(readFileSync(join(harnessHome, "registered-repos.json"), "utf-8"));
      expect(registry.repos).toEqual([
        expect.objectContaining({ source: "init", path: realpathSync(repo) }),
      ]);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("CLI init --dry-run --json returns the adoption planner protocol", () => {
    const tmp = join(tmpdir(), `repo-harness-init-cli-codegraph-${Date.now()}`);
    try {
      mkdirSync(tmp, { recursive: true });
      const res = spawnSync(
        "bun",
        [
          CLI,
          "init",
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
      expect(result.command).toBe("init");
      expect(result.apply).toBe(false);
      expect(result.summary.byKind.mkdir).toBeGreaterThan(0);
      expect(result.steps).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30000);

  test("CLI exposes init help for repo-local refresh", () => {
    const res = spawnSync("bun", [CLI, "init", "--help"], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Usage: repo-harness init");
    expect(res.stdout).toContain("--repo <path>");
    expect(res.stdout).toContain("--dry-run");
    expect(res.stdout).not.toContain("--experimental-ts-apply");
    expect(res.stdout).toContain("--no-codegraph");
  }, 30_000);

  test("CLI update rejects retired repo refresh flags", () => {
    const res = spawnSync("bun", [CLI, "update", "--repo", ".", "--json"], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("unknown option");
  }, 30_000);

  test.each([
    ['init', '--configure-codegraph', []],
    ['init', '--brain-root', ['unused']],
    ['init', '--brain-mode', ['manifest-only']],
    ['init', '--interactive', []],
    ['update', '--repo', ['.']],
    ['update', '--dry-run', []],
    ['update', '--interactive', []],
  ] as const)('retired %s %s fails before any repository or host write', (command, flag, values) => {
    const tmp = join(tmpdir(), `retired-cli-option-${command}-${flag.slice(2)}-${Date.now()}`);
    const repo = join(tmp, 'repo');
    const home = join(tmp, 'home');
    try {
      mkdirSync(repo, { recursive: true }); mkdirSync(home);
      const result = spawnSync('bun', [CLI, command, flag, ...values], {
        cwd: repo, encoding: 'utf8', env: { ...process.env, HOME: home, REPO_HARNESS_HOME: join(home, '.repo-harness'), BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(tmp, 'bun-cache') },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unknown option');
      expect(result.stderr).toContain(flag);
      expect(readdirSync(repo)).toEqual([]);
      expect(readdirSync(home)).toEqual([]);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }, 30_000);

  test("CLI init rejects user-level brain configuration flags", () => {
    const tmp = join(tmpdir(), `repo-harness-init-brain-${Date.now()}`);
    try {
      mkdirSync(tmp, { recursive: true });
      const res = spawnSync("bun", [CLI, "init", "--repo", tmp, "--brain-mode", "manifest-only", "--json"], {
        cwd: ROOT,
        encoding: "utf-8",
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("unknown option");
      expect(existsSync(join(tmp, ".repo-harness"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  test("init refuses HOME before running migration or host bootstrap", () => {
    const tmp = join(tmpdir(), `repo-harness-init-home-${Date.now()}`);
    const home = join(tmp, "home");
    try {
      mkdirSync(home, { recursive: true });
      const res = spawnSync(
        "bun",
        [
          CLI,
          "init",
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
      expect(result.command).toBe("init");
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

  test("enabled applied init fails closed when the CodeGraph CLI is missing", () => {
    const tmp = join(tmpdir(), `repo-harness-init-codegraph-missing-${Date.now()}`);
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
        verify: false,
        env: {
          ...process.env,
          HOME: home,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
          AGENTIC_DEV_CODEGRAPH_ALLOW_GLOBAL: "0",
        },
      });

      const codegraphStep = result.steps.find((step) => step.step === "ensure codegraph index");
      expect(result.exitCode).toBe(1);
      expect(codegraphStep?.status).toBe("failed");
      expect(codegraphStep?.detail).toContain("index unavailable");
      expect(codegraphStep?.stderr).toContain("install with: bun add -g @colbymchenry/codegraph");
      expect(codegraphStep?.stderr).toContain("repo-harness tools configure codegraph --target codex --location global");
      expect(codegraphStep?.stderr).toContain("then run: codegraph init -i . && codegraph sync .");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, CODEGRAPH_INIT_TIMEOUT_MS);

  test("enabled applied init fails closed when the CodeGraph index remains stale", () => {
    const tmp = join(tmpdir(), `repo-harness-init-codegraph-stale-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const logFile = join(tmp, "codegraph.log");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(join(repo, ".codegraph"), { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(repo, ".codegraph", "stale"), "stale\n");
      setupFakeSource(source);
      writeFakeCodegraph(fakeBin, logFile);

      const result = runInit({
        repo,
        sourceRoot: source,
        verify: false,
        syncCodegraph: true,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      const codegraphStep = result.steps.find((step) => step.step === "ensure codegraph index");
      expect(result.exitCode).toBe(1);
      expect(codegraphStep?.status).toBe("failed");
      expect(codegraphStep?.detail).toContain("index stale");
      expect(codegraphStep?.stderr).toContain("run: codegraph sync .");
      expect(readFileSync(logFile, "utf8")).toContain("codegraph sync .");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, CODEGRAPH_INIT_TIMEOUT_MS);

  test("enabled applied init fails closed with a diagnostic command when the CodeGraph index status is unknown", () => {
    const tmp = join(tmpdir(), `repo-harness-init-codegraph-unknown-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const logFile = join(tmp, "codegraph.log");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(join(repo, ".codegraph"), { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(repo, ".codegraph", "unknown"), "unknown\n");
      setupFakeSource(source);
      writeFakeCodegraph(fakeBin, logFile);

      const result = runInit({
        repo,
        sourceRoot: source,
        verify: false,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      const codegraphStep = result.steps.find((step) => step.step === "ensure codegraph index");
      expect(result.exitCode).toBe(1);
      expect(codegraphStep?.status).toBe("failed");
      expect(codegraphStep?.detail).toContain("index unknown");
      expect(codegraphStep?.stderr).toContain("inspect with: codegraph status .");
      expect(codegraphStep?.stderr).not.toContain("codegraph init -i .");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, CODEGRAPH_INIT_TIMEOUT_MS);

  test("enabled applied init diagnoses unreadable status without reinstalling an available CodeGraph CLI", () => {
    const tmp = join(tmpdir(), `repo-harness-init-codegraph-unavailable-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const logFile = join(tmp, "codegraph.log");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(join(repo, ".codegraph"), { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(repo, ".codegraph", "unavailable"), "unavailable\n");
      setupFakeSource(source);
      writeFakeCodegraph(fakeBin, logFile);

      const result = runInit({
        repo,
        sourceRoot: source,
        verify: false,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      const codegraphStep = result.steps.find((step) => step.step === "ensure codegraph index");
      expect(result.exitCode).toBe(1);
      expect(codegraphStep?.status).toBe("failed");
      expect(codegraphStep?.detail).toContain("index unavailable");
      expect(codegraphStep?.stderr).toContain("inspect with: codegraph status .");
      expect(codegraphStep?.stderr).not.toContain("install with:");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, CODEGRAPH_INIT_TIMEOUT_MS);

  test("init reports CodeGraph readiness exceptions as a structured failed step", () => {
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

});

/**
 * The lease plane is retired (#917). `init` no longer gates on sprint execution
 * state and no longer records a coordination cutover marker.
 */
describe("init without the retired coordination cutover", () => {
  function liveContractWorktreeRepo(tmp: string): { source: string; repo: string } {
    mkdirSync(join(tmp, "home"), { recursive: true });
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    mkdirSync(source, { recursive: true });
    mkdirSync(repo, { recursive: true });
    setupFakeSource(source);
    expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
    writeFileSync(join(repo, "README.md"), "fixture\n");
    expect(spawnSync("git", ["add", "-A"], { cwd: repo }).status).toBe(0);
    expect(
      spawnSync("git", ["-c", "user.email=t@e.st", "-c", "user.name=t", "commit", "-qm", "base"], {
        cwd: repo,
      }).status,
    ).toBe(0);

    // A linked worktree carrying its own contract metadata. The retired gate
    // refused init on exactly this state.
    const live = join(tmp, "live");
    expect(spawnSync("git", ["worktree", "add", "-q", live, "-b", "codex/live"], { cwd: repo }).status).toBe(0);
    mkdirSync(join(live, ".ai", "harness", "worktrees"), { recursive: true });
    writeFileSync(join(live, ".ai", "harness", "worktrees", "codex-live.json"), "{}\n");

    return { source, repo };
  }

  const initOptions = {
    verify: false,
    codegraph: false,
  } as const;

  test("applies with a live contract worktree and writes no coordination marker", () => {
    const tmp = join(tmpdir(), `init-no-cutover-${Date.now()}`);
    try {
      const { source, repo } = liveContractWorktreeRepo(tmp);

      const result = runInit({
        repo, sourceRoot: source, ...initOptions,
        env: { ...process.env, HOME: join(tmp, "home"), REPO_HARNESS_HOME: join(tmp, "home", ".repo-harness") },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "cutover quiescence")).toBeUndefined();
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(true);
      expect(existsSync(join(repo, ".git", "repo-harness", "coordination", "v1", "protocol.json"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30000);
});

describe("bundled host runtimes", () => {
  function makeSource(root: string): void {
    // syncCrossReviewSkills() now reads sourceRoot's skill-surface manifest
    // (see loadSkillSurfaceCatalog in init.ts) before touching bundled skill
    // content; seed it so this synthetic tree parses like the real repo.
    mkdirSync(join(root, "assets", "skill-commands"), { recursive: true });
    copyFileSync(
      join(ROOT, "assets", "skill-commands", "manifest.json"),
      join(root, "assets", "skill-commands", "manifest.json"),
    );
    mkdirSync(join(root, "assets", "skills", "repo-harness-cross-review"), { recursive: true });
    writeFileSync(
      join(root, "assets", "skills", "repo-harness-cross-review", "SKILL.md"),
      "---\nname: repo-harness-cross-review\n---\n",
    );
    mkdirSync(join(root, "assets", "skills", "repo-harness-herdr-portal"), { recursive: true });
    writeFileSync(
      join(root, "assets", "skills", "repo-harness-herdr-portal", "SKILL.md"),
      "---\nname: repo-harness-herdr-portal\n---\n",
    );
    mkdirSync(join(root, "assets", "skills", "claude-plan"), { recursive: true });
    writeFileSync(
      join(root, "assets", "skills", "claude-plan", "SKILL.md"),
      "---\nname: claude-plan\n---\n",
    );
  }

  test.each(["skill", "reference"])("upgrades owned bundled trees (%s) and rejects user drift", change => {
    const tmp = join(tmpdir(), `cross-review-owned-${Date.now()}`);
    const source = join(tmp, "source"), home = join(tmp, "home");
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
    try {
      makeSource(source);
      mkdirSync(home, { recursive: true });
      const fakeBin = join(tmp, "bin");
      mkdirSync(fakeBin, { recursive: true });
      env.REPO_HARNESS_CLAUDE_EXECUTABLE = writeReadyOfficialCodexPluginCli(fakeBin, home);
      const reference = join(source, "assets/skills/repo-harness-cross-review/reference.md");
      writeFileSync(reference, "old reference");
      expect(syncCrossReviewSkills(source, "both", env).every(step => step.status === "ok")).toBe(true);
      const paths = [".claude", ".codex"].map(host => join(home, host, "skills/repo-harness-cross-review"));
      recordInstallOwnership(paths, env);
      if (change === "skill") writeFileSync(join(source, "assets/skills/repo-harness-cross-review/SKILL.md"), "---\nname: repo-harness-cross-review\n---\nUpdated instructions\n");
      rmSync(reference);
      writeFileSync(join(source, "assets/skills/repo-harness-cross-review/new-reference.md"), "new reference");
      expect(syncCrossReviewSkills(source, "both", env).every(step => step.status === "ok")).toBe(true);
      recordInstallOwnership(paths, env);
      for (const host of [".claude", ".codex"]) {
        const dest = join(home, host, "skills/repo-harness-cross-review");
        expect(existsSync(join(dest, "reference.md"))).toBe(false);
        expect(readFileSync(join(dest, "new-reference.md"), "utf8")).toBe("new reference");
        writeFileSync(join(dest, "new-reference.md"), "user edit");
      }
      const blocked = syncCrossReviewSkills(source, "both", env);
      expect(blocked.filter(step => step.status === "failed")).toHaveLength(2);
      for (const host of [".claude", ".codex"]) {
        expect(readFileSync(join(home, host, "skills/repo-harness-cross-review/new-reference.md"), "utf8")).toBe("user edit");
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });

  test("installs cross-review on both hosts without the retired plan skill", () => {
    const tmp = join(tmpdir(), `cross-review-both-${Date.now()}`);
    const source = join(tmp, "source");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      makeSource(source);

      const fakeBin = join(tmp, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const claude = writeReadyOfficialCodexPluginCli(fakeBin, home);
      const steps = syncCrossReviewSkills(source, "both", { ...process.env, HOME: home, REPO_HARNESS_CLAUDE_EXECUTABLE: claude });

      expect(steps.every((s) => s.status === "ok")).toBe(true);
      expect(existsSync(join(home,'plugin-invoked'))).toBe(false);
      expect(existsSync(join(home,'.claude/plugins/cache/openai-codex/codex/1.0.6/.claude-plugin/plugin.json'))).toBe(true);
      expect(existsSync(join(home, ".claude", "skills", "repo-harness-cross-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "repo-harness-cross-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "claude-plan", "SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "claude-plan", "SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "merge-gate", "SKILL.md"))).toBe(false);

      const again = syncCrossReviewSkills(source, "both", { ...process.env, HOME: home, REPO_HARNESS_CLAUDE_EXECUTABLE: claude });
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

  test("respects target=claude (repo-harness-cross-review only) and target=codex (repo-harness-cross-review only)", () => {
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
      expect(existsSync(join(claudeHome, ".claude", "skills", "repo-harness-cross-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(claudeHome, ".claude", "skills", "merge-gate", "SKILL.md"))).toBe(false);
      expect(existsSync(join(claudeHome, ".codex", "skills", "repo-harness-cross-review", "SKILL.md"))).toBe(false);
      expect(existsSync(join(claudeHome, ".codex", "skills", "claude-plan", "SKILL.md"))).toBe(false);

      const fakeBin = join(tmp, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const claude = writeReadyOfficialCodexPluginCli(fakeBin, codexHome);
      syncCrossReviewSkills(source, "codex", { ...process.env, HOME: codexHome, REPO_HARNESS_CLAUDE_EXECUTABLE: claude });
      expect(existsSync(join(codexHome, ".codex", "skills", "repo-harness-cross-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexHome, ".codex", "skills", "claude-plan", "SKILL.md"))).toBe(false);
      expect(existsSync(join(codexHome, ".claude", "skills", "repo-harness-cross-review", "SKILL.md"))).toBe(false);
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
      // Manifest present (so the catalog itself loads), but deliberately no
      // assets/skills/* content: this is what "bundled source is missing"
      // actually exercises now that syncCrossReviewSkills() reads the
      // catalog before checking per-skill content.
      mkdirSync(join(source, "assets", "skill-commands"), { recursive: true });
      copyFileSync(
        join(ROOT, "assets", "skill-commands", "manifest.json"),
        join(source, "assets", "skill-commands", "manifest.json"),
      );

      const fakeBin = join(tmp, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const claude = writeReadyOfficialCodexPluginCli(fakeBin, home);
      const steps = syncCrossReviewSkills(source, "both", { ...process.env, HOME: home, REPO_HARNESS_CLAUDE_EXECUTABLE: claude });
      expect(steps.every((s) => s.status !== "failed")).toBe(true);
      expect(steps.some((s) => s.status === "skipped")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
