import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

function writeExecutable(filePath: string, content: string) {
  writeFileSync(filePath, content);
  chmodSync(filePath, 0o755);
}

function setupFakeEnvironment(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const home = join(root, "home");
  const fakeBin = join(root, "fakebin");
  mkdirSync(home, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  return { root, home, fakeBin };
}

function writeFakeCodeGraph(fakeBin: string, logFile: string) {
  writeExecutable(
    join(fakeBin, "codegraph"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      `echo "codegraph $*" >> "${logFile}"`,
      "case \"${1:-}\" in",
      "  \"--version\") echo '0.9.6' ;;",
      "  \"status\") echo 'CodeGraph Status'; echo 'Index is up to date' ;;",
      "  \"install\")",
      "    if [[ \" $* \" == *\" --target codex \"* ]]; then",
      "      mkdir -p \"$HOME/.codex\"",
      "      cat > \"$HOME/.codex/config.toml\" <<'TOML'",
      "[mcp_servers.codegraph]",
      "command = \"codegraph\"",
      "args = [\"serve\", \"--mcp\"]",
      "TOML",
      "    fi",
      "    if [[ \" $* \" == *\" --target claude \"* && ! -f \"$HOME/.claude.json\" ]]; then",
      "      cat > \"$HOME/.claude.json\" <<'JSON'",
      "{",
      "  \"mcpServers\": {",
      "    \"codegraph\": {",
      "      \"type\": \"stdio\",",
      "      \"command\": \"codegraph\",",
      "      \"args\": [\"serve\", \"--mcp\"]",
      "    }",
      "  }",
      "}",
      "JSON",
      "    fi",
      "    echo 'installed' ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n")
  );
}

function writeFakeGbrain(fakeBin: string) {
  writeExecutable(
    join(fakeBin, "gbrain"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "case \"$1 ${2:-}\" in",
      "  \"--version \") echo 'gbrain 0.12.0' ;;",
      "  \"doctor --json\") echo '{\"status\":\"warnings\",\"health_score\":90}' ;;",
      "  \"integrations list\") echo '{\"local\":[]}' ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n")
  );
}

function writeFakeNpx(fakeBin: string) {
  writeExecutable(
    join(fakeBin, "npx"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "if [[ \"$*\" == *\"skills ls -g --json\"* ]]; then echo '[]'; exit 0; fi",
      "exit 1",
      "",
    ].join("\n")
  );
}

type RunConfigureOptions = {
  // null / undefined → seed empty {} settings.json so the claude-allowed-tools
  // step has something to mutate. Pass "missing" to skip seeding entirely and
  // exercise the "no Claude Code installed" branch.
  seedClaudeSettings?: Record<string, unknown> | "missing" | null;
  seedClaudeRootConfig?: Record<string, unknown> | null;
};

function runConfigure(target: string, options: RunConfigureOptions = {}) {
  const envRoot = setupFakeEnvironment(`repo-harness-tools-configure-${target}`);
  const logFile = join(envRoot.root, "tool.log");
  const claudeSettingsPath = join(envRoot.home, ".claude", "settings.json");
  const claudeRootConfigPath = join(envRoot.home, ".claude.json");
  try {
    mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
    writeFileSync(join(envRoot.home, ".codex", "config.toml"), "# no codegraph yet\n");

    const seed = options.seedClaudeSettings;
    if (seed !== "missing") {
      mkdirSync(dirname(claudeSettingsPath), { recursive: true });
      writeFileSync(claudeSettingsPath, `${JSON.stringify(seed ?? {}, null, 2)}\n`);
    }
    if (options.seedClaudeRootConfig) {
      writeFileSync(claudeRootConfigPath, `${JSON.stringify(options.seedClaudeRootConfig, null, 2)}\n`);
    }

    writeFakeCodeGraph(envRoot.fakeBin, logFile);
    writeFakeGbrain(envRoot.fakeBin);
    writeFakeNpx(envRoot.fakeBin);

    const res = spawnSync("bun", [CLI, "tools", "configure", "codegraph", "--target", target, "--location", "global", "--json", "--repo", ROOT], {
      cwd: ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        HOME: envRoot.home,
        PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
        AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
      },
    });

    const log = readFileSync(logFile, "utf-8");
    let claudeSettingsAfter: any = null;
    let claudeRootConfigAfter: any = null;
    let codexConfigAfter = "";
    try {
      claudeSettingsAfter = JSON.parse(readFileSync(claudeSettingsPath, "utf-8"));
    } catch (_error) {
      claudeSettingsAfter = null;
    }
    try {
      claudeRootConfigAfter = JSON.parse(readFileSync(claudeRootConfigPath, "utf-8"));
    } catch (_error) {
      claudeRootConfigAfter = null;
    }
    try {
      codexConfigAfter = readFileSync(join(envRoot.home, ".codex", "config.toml"), "utf-8");
    } catch (_error) {
      codexConfigAfter = "";
    }
    return { res, log, claudeSettingsAfter, claudeRootConfigAfter, codexConfigAfter };
  } finally {
    rmSync(envRoot.root, { recursive: true, force: true });
  }
}

describe("tools configure codegraph", () => {
  test("configures Codex through the CodeGraph target adapter", () => {
    const { res, log, codexConfigAfter } = runConfigure("codex");
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    expect(result.target).toBe("codex");
    expect(result.location).toBe("global");
    expect(result.actions.map((entry: { action: string }) => entry.action)).toEqual([
      "configure-codex",
      "codex-project-path",
    ]);
    expect(log).toContain("codegraph install --target codex --location global --yes");
    expect(codexConfigAfter).toContain('args = ["serve", "--mcp", "--path", "."]');
  }, 15000);

  test("configures Claude and registers codegraph for eager schema load", () => {
    const { res, log, claudeSettingsAfter, claudeRootConfigAfter } = runConfigure("claude");
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    expect(result.target).toBe("claude");
    expect(result.actions.map((entry: { action: string }) => entry.action)).toEqual([
      "configure-claude",
      "claude-project-path",
      "claude-always-load",
      "claude-allowed-tools",
    ]);
    expect(log).toContain("codegraph install --target claude --location global --yes");

    const alwaysLoad = (result.actions as Array<{ action: string; status: string }>).find(
      (entry) => entry.action === "claude-always-load",
    );
    const allowedTools = (result.actions as Array<{ action: string; status: string }>).find(
      (entry) => entry.action === "claude-allowed-tools",
    );
    expect(alwaysLoad?.status).toBe("changed");
    expect(allowedTools?.status).toBe("changed");
    expect(claudeRootConfigAfter?.mcpServers?.codegraph?.args).toEqual(["serve", "--mcp", "--path", "."]);
    expect(claudeRootConfigAfter?.mcpServers?.codegraph?.alwaysLoad).toBe(true);
    expect(claudeSettingsAfter?.allowedTools).toContain("mcp__codegraph__*");
  }, 15000);

  test("claude-always-load is idempotent when CodeGraph is already pinned", () => {
    const { res, claudeRootConfigAfter } = runConfigure("claude", {
      seedClaudeRootConfig: {
        mcpServers: {
          codegraph: {
            type: "stdio",
          command: "codegraph",
          args: ["serve", "--mcp", "--path", "."],
          alwaysLoad: true,
        },
      },
      },
    });
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    const alwaysLoad = (result.actions as Array<{ action: string; status: string }>).find(
      (entry) => entry.action === "claude-always-load",
    );
    const projectPath = (result.actions as Array<{ action: string; status: string }>).find(
      (entry) => entry.action === "claude-project-path",
    );
    expect(projectPath?.status).toBe("unchanged");
    expect(alwaysLoad?.status).toBe("unchanged");
    expect(claudeRootConfigAfter?.mcpServers?.codegraph?.alwaysLoad).toBe(true);
  }, 15000);

  test("claude-allowed-tools is idempotent when the wildcard is already present", () => {
    const { res, claudeSettingsAfter } = runConfigure("claude", {
      seedClaudeSettings: { allowedTools: ["Edit", "mcp__codegraph__*"] },
    });
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    const allowedTools = (result.actions as Array<{ action: string; status: string }>).find(
      (entry) => entry.action === "claude-allowed-tools",
    );
    expect(allowedTools?.status).toBe("unchanged");
    expect(claudeSettingsAfter?.allowedTools).toEqual(["Edit", "mcp__codegraph__*"]);
  }, 15000);

  test("claude-allowed-tools is skipped when Claude Code is not installed", () => {
    const { res, claudeSettingsAfter } = runConfigure("claude", { seedClaudeSettings: "missing" });
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    const allowedTools = (result.actions as Array<{ action: string; status: string; stderr?: string }>).find(
      (entry) => entry.action === "claude-allowed-tools",
    );
    expect(allowedTools?.status).toBe("skipped");
    expect(allowedTools?.stderr ?? "").toContain("not found");
    expect(claudeSettingsAfter).toBeNull();
  }, 15000);

  test("configures both hosts without exposing host-specific tool call syntax", () => {
    const { res, log } = runConfigure("both");
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    expect(result.target).toBe("both");
    expect(result.actions.map((entry: { action: string }) => entry.action)).toEqual([
      "configure-codex",
      "codex-project-path",
      "configure-claude",
      "claude-project-path",
      "claude-always-load",
      "claude-allowed-tools",
    ]);
    expect(log).toContain("codegraph install --target codex --location global --yes");
    expect(log).toContain("codegraph install --target claude --location global --yes");
    // CLI output may carry the host-agnostic wildcard mcp__codegraph__* as a
    // configuration value (it is the actual Claude allowedTools entry). What it
    // must NOT carry is concrete codegraph tool invocations such as
    // codegraph_context(...), codegraph_callers(...) etc -- those belong to
    // agent prompts, not adapter output.
    expect(res.stdout).not.toMatch(/codegraph_\w+\s*\(/);
  }, 15000);
});
