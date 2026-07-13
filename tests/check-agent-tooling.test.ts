import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { createHash } from "crypto";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/check-agent-tooling.sh");
const WAZA_SKILLS = ["think", "hunt", "check", "health"];
const WAZA_RULES = ["anti-patterns.md", "chinese.md", "durable-context.md", "english.md"];
const MANAGED_AGENTS = ["explorer", "deep-reasoner", "fast-worker", "gatekeeper", "root-cause-prover", "harness-evaluator"];
const FLEET_SOURCE_DIR = join(ROOT, "agents/fleet");

function sha256File(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

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
  writeExecutable(
    join(fakeBin, "timeout"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "if [[ \"${1:-}\" == --kill-after=* ]]; then shift; fi",
      "if [[ \"${1:-}\" == *s ]]; then shift; fi",
      "exec \"$@\"",
      "",
    ].join("\n")
  );

  return { root, home, fakeBin };
}

function skillContent(name: string, version: string) {
  return [
    "---",
    `name: ${name}`,
    "metadata:",
    `  version: \"${version}\"`,
    "---",
    `# ${name}`,
    "",
  ].join("\n");
}

function ruleContent(name: string, version: string) {
  return [`# ${name}`, `version: ${version}`, ""].join("\n");
}

function writeSkill(root: string, name: string, version: string) {
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, "SKILL.md"), skillContent(name, version));
}

function writeWazaBundle(root: string, version: string) {
  for (const skill of WAZA_SKILLS) {
    writeSkill(root, skill, version);
  }
}

function writeWazaRules(root: string, version: string) {
  mkdirSync(join(root, "rules"), { recursive: true });
  for (const rule of WAZA_RULES) {
    writeFileSync(join(root, "rules", rule), ruleContent(rule, version));
  }
}

function writeWazaLock(home: string) {
  mkdirSync(join(home, ".agents"), { recursive: true });
  writeFileSync(
    join(home, ".agents", ".skill-lock.json"),
    JSON.stringify(
      {
        skills: Object.fromEntries(WAZA_SKILLS.map((skill) => [skill, { source: "tw93/Waza" }])),
      },
      null,
      2
    )
  );
}

function writeClaudeCodeGraphConfig(home: string, alwaysLoad: boolean) {
  const codegraph: Record<string, unknown> = {
    type: "stdio",
    command: "codegraph",
    args: ["serve", "--mcp"],
  };
  if (alwaysLoad) codegraph.alwaysLoad = true;
  writeFileSync(
    join(home, ".claude.json"),
    JSON.stringify({ mcpServers: { codegraph } }, null, 2)
  );
}

function symlinkClaudeWazaToAgents(home: string) {
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  for (const skill of WAZA_SKILLS) {
    symlinkSync(`../../.agents/skills/${skill}`, join(home, ".claude", "skills", skill), "dir");
  }
}

function writeFakeBunx(fakeBin: string, logFile?: string) {
  const items = WAZA_SKILLS
    .map((skill) => ({ name: skill, agents: ["Claude Code", "Codex"] }))
    .map((item) => JSON.stringify(item))
    .join(",");
  writeExecutable(
    join(fakeBin, "bunx"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      logFile ? `echo "bunx $*" >> "${logFile}"` : "",
      "if [[ \"$*\" == *\"skills ls -g --json\"* ]]; then",
      `  echo '[${items}]'`,
      "  exit 0",
      "fi",
      "if [[ \"$*\" == *\"skills check\"* || \"$*\" == *\"skills update\"* ]]; then",
      "  echo 'unexpected mutating skill command' >&2",
      "  exit 2",
      "fi",
      "exit 1",
      "",
    ].join("\n")
  );
}

function writeFakeGbrain(fakeBin: string, logFile?: string) {
  writeExecutable(
    join(fakeBin, "gbrain"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      logFile ? `echo "gbrain $*" >> "${logFile}"` : "",
      "case \"$*\" in",
      "  \"--version\")",
      "    echo 'gbrain 0.12.0'",
      "    ;;",
      "  \"doctor --json --fast\")",
      "    echo '{\"status\":\"warnings\",\"health_score\":90,\"checks\":[{\"name\":\"connection\",\"status\":\"warn\",\"message\":\"fast mode skipped DB checks\"}]}'",
      "    ;;",
      "  \"doctor --json\")",
      "    echo '{\"status\":\"warnings\",\"health_score\":90}'",
      "    ;;",
      "  \"integrations list --json\")",
      "    echo '{\"local\":[\"repo-sync\"]}'",
      "    ;;",
      "  \"check-update --json\")",
      "    echo '{\"update_available\":false}'",
      "    ;;",
      "  *)",
      "    exit 1",
      "    ;;",
      "esac",
      "",
    ].join("\n")
  );
}

function writeFakeCodeGraph(
  fakeBin: string,
  options: { version?: string; status?: "up-to-date" | "stale" | "not-initialized"; logFile?: string } = {}
) {
  const version = options.version ?? "0.9.6";
  const status = options.status ?? "up-to-date";
  const statusLines =
    status === "up-to-date"
      ? ["echo 'CodeGraph Status'", "echo '✓ Index is up to date'"]
      : status === "stale"
        ? ["echo 'CodeGraph Status'", "echo 'Pending Changes:'", "echo 'Run \"codegraph sync\" to update the index'"]
        : ["echo 'CodeGraph Status'", "echo '⚠ Not initialized'", "echo 'Run \"codegraph init\" to initialize'"];

  writeExecutable(
    join(fakeBin, "codegraph"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      options.logFile ? `echo "codegraph $*" >> "${options.logFile}"` : "",
      "case \"${1:-}\" in",
      "  \"--version\")",
      `    echo '${version}'`,
      "    ;;",
      "  \"status\")",
      ...statusLines.map((line) => `    ${line}`),
      "    ;;",
      "  *)",
      "    exit 1",
      "    ;;",
      "esac",
      "",
    ].join("\n")
  );
}

function writeFakeNpm(fakeBin: string, version: string, logFile?: string) {
  writeExecutable(
    join(fakeBin, "npm"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      logFile ? `echo "npm $*" >> "${logFile}"` : "",
      "if [[ \"$*\" == \"view @colbymchenry/codegraph version --json\" ]]; then",
      `  echo '"${version}"'`,
      "  exit 0",
      "fi",
      "exit 1",
      "",
    ].join("\n")
  );
}

function writeFakeCurl(fakeBin: string, version: string, logFile?: string) {
  writeExecutable(
    join(fakeBin, "curl"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      logFile ? `echo "curl $*" >> "${logFile}"` : "",
      "skill=''",
      "rule=''",
      ...WAZA_SKILLS.flatMap((name) => [
        `if [[ "$*" == *"/skills/${name}/SKILL.md"* ]]; then`,
        `  skill="${name}"`,
        "fi",
      ]),
      ...WAZA_RULES.flatMap((name) => [
        `if [[ "$*" == *"/rules/${name}"* ]]; then`,
        `  rule="${name}"`,
        "fi",
      ]),
      "if [[ -n \"$skill\" ]]; then",
      "  cat <<EOF",
      "---",
      "name: $skill",
      "metadata:",
      `  version: \"${version}\"`,
      "---",
      "# $skill",
      "EOF",
      "  exit 0",
      "fi",
      "if [[ -n \"$rule\" ]]; then",
      "  cat <<EOF",
      "# $rule",
      `version: ${version}`,
      "EOF",
      "  exit 0",
      "fi",
      "if [[ -z \"$skill\" ]]; then",
      "  exit 22",
      "fi",
      "",
    ].join("\n")
  );
}

describe("check-agent-tooling", () => {
  test("reports active tooling without the retired planning provider", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling");
    try {
      mkdirSync(join(envRoot.home, ".agents", "skills"), { recursive: true });
      mkdirSync(join(envRoot.home, ".claude"), { recursive: true });
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".claude", "settings.json"), "{}\n");
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n# no gbrain mcp\n");
      writeWazaBundle(join(envRoot.home, ".agents", "skills"), "3.0.0");
      writeWazaBundle(join(envRoot.home, ".codex", "skills"), "3.0.0");
      writeWazaRules(join(envRoot.home, ".agents"), "3.0.0");
      writeWazaRules(join(envRoot.home, ".codex"), "3.0.0");
      writeSkill(join(envRoot.home, ".codex", "skills"), "mermaid", "1.0.0");
      symlinkClaudeWazaToAgents(envRoot.home);
      writeWazaLock(envRoot.home);

      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(envRoot.fakeBin);

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "both"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(Object.keys(report.runtime_capabilities)).toEqual(
        expect.arrayContaining(["bun", "npm", "npx", "skills_cli", "bash", "rsync", "symlink"])
      );
      expect(report.runtime_capabilities.bun.required).toBe(true);
      expect(report.runtime_capabilities.npx.owner).toBe("npm-registry");
      expect(report.runtime_capabilities.skills_cli.status).toBe("available");
      expect(report.runtime_capabilities.rsync.required).toBe(false);
      expect(report.runtime_capabilities.symlink.required_for).toContain("copy mode remains the fallback");
      expect(report.tools).not.toHaveProperty("gstack");
      expect(report.tools.waza.status).toBe("present");
      expect(report.tools.waza.source_repo).toBe("tw93/Waza");
      expect(report.tools.waza.primary_host).toBe("codex");
      expect(report.tools.waza.hosts.claude.installed_skills).toEqual(WAZA_SKILLS);
      expect(report.tools.waza.hosts.claude.skills[0].symlink_target).toBe("../../.agents/skills/think");
      expect(report.tools.waza.hosts.claude.shared_rules).toEqual(WAZA_RULES);
      expect(report.tools.waza.hosts.codex.staging_sync).toBe("synced");
      expect(report.tools.waza.hosts.codex.shared_rules_staging_sync).toBe("synced");
      expect(report.tools.waza.hosts.codex.stale_status).toBe("not-checked");
      expect(report.tools.codex_automation_profile.status).toBe("present");
      expect(report.tools.codex_automation_profile.required_skills).toEqual(["health", "check", "mermaid"]);
      expect(report.tools.codex_automation_profile.routes).toEqual({
        workflow_health: "waza:health",
        review_gate: "waza:check",
        architecture_diagram: "mermaid",
      });
      expect(report.tools.codex_automation_profile.vendoring_policy).toBe("do-not-vendor-skill-body");
      expect(report.tools.gbrain.status).toBe("present");
      expect(report.tools.gbrain.required).toBe(false);
      expect(report.tools.gbrain.reason).toContain("fast doctor only skipped DB checks");
      expect(report.tools.gbrain.install_command).toBe("bun install -g github:garrytan/gbrain");
      expect(report.tools.gbrain.install_command).not.toContain("bun add -g gbrain");
      expect(report.tools.gbrain.install_note).toContain("npm registry package gbrain");
      expect(report.tools.gbrain.mcp_hosts.claude.status).toBe("disabled");
      expect(report.tools.gbrain.mcp_hosts.codex.status).toBe("disabled");
      expect(report.tools.gbrain.impact.knowledge_tasks).toBe("manual-only");
      expect(report.tools.codegraph.status).toBe("partial");
      expect(report.tools.codegraph.primary_host).toBe("codex");
      expect(report.tools.codegraph.source).toBe("global");
      expect(report.tools.codegraph.version).toBe("0.9.6");
      expect(report.tools.codegraph.mcp_hosts.codex.status).toBe("configured");
      expect(report.tools.codegraph.project_index.status).toBe("up-to-date");
      expect(report.tools.codegraph.impact.code_navigation).toBe("missing");

      const textRes = spawnSync("bash", [SCRIPT, "--host", "both"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });
      expect(textRes.status).toBe(0);
      expect(textRes.stdout.toLowerCase()).not.toContain("gstack");
      expect(textRes.stdout).toContain("Waza [present]");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("keeps gbrain warning when fast doctor reports a real warning", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-gbrain-warning");
    try {
      writeExecutable(
        join(envRoot.fakeBin, "gbrain"),
        [
          "#!/bin/bash",
          "set -euo pipefail",
          "case \"$*\" in",
          "  \"--version\")",
          "    echo 'gbrain 0.12.0'",
          "    ;;",
          "  \"doctor --json --fast\")",
          "    echo '{\"status\":\"warnings\",\"health_score\":80,\"checks\":[{\"name\":\"sync_freshness\",\"status\":\"warn\",\"message\":\"stale source\"}]}'",
          "    ;;",
          "  \"integrations list --json\")",
          "    echo '{}'",
          "    ;;",
          "  *)",
          "    exit 1",
          "    ;;",
          "esac",
          "",
        ].join("\n")
      );

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "codex"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.tools.gbrain.status).toBe("warning");
      expect(report.tools.gbrain.reason).toContain("doctor status is warnings");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("reports Claude CodeGraph MCP as deferred when alwaysLoad is missing", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-codegraph-claude-deferred");
    try {
      writeClaudeCodeGraphConfig(envRoot.home, false);
      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(envRoot.fakeBin);

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "claude"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_LOCAL_BIN: join(envRoot.fakeBin, "codegraph"),
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.tools.codegraph.status).toBe("partial");
      expect(report.tools.codegraph.reason).toContain("missing or deferred");
      expect(report.tools.codegraph.mcp_hosts.claude.status).toBe("deferred");
      expect(report.tools.codegraph.mcp_hosts.claude.always_load).toBe(false);
      expect(report.tools.codegraph.mcp_hosts.claude.tool_search).toBe("deferred");
      expect(report.tools.codegraph.mcp_hosts.claude.reason).toContain("alwaysLoad is not true");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("reports Claude CodeGraph MCP as configured when alwaysLoad is true", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-codegraph-claude-always-load");
    try {
      writeClaudeCodeGraphConfig(envRoot.home, true);
      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(envRoot.fakeBin);

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "claude"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_LOCAL_BIN: join(envRoot.fakeBin, "codegraph"),
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.tools.codegraph.status).toBe("present");
      expect(report.tools.codegraph.mcp_hosts.claude.status).toBe("configured");
      expect(report.tools.codegraph.mcp_hosts.claude.always_load).toBe(true);
      expect(report.tools.codegraph.mcp_hosts.claude.tool_search).toBe("always-load");
      expect(report.tools.codegraph.impact.code_navigation).toBe("full");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("uses only read-only probes during update checks", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-updates");
    const logFile = join(envRoot.root, "tool.log");
    try {
      mkdirSync(join(envRoot.home, ".agents", "skills"), { recursive: true });
      mkdirSync(join(envRoot.home, ".claude"), { recursive: true });
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".claude", "settings.json"), "{}\n");
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n# no gbrain mcp\n");
      writeWazaBundle(join(envRoot.home, ".agents", "skills"), "3.0.0");
      writeWazaBundle(join(envRoot.home, ".codex", "skills"), "3.0.0");
      writeWazaRules(join(envRoot.home, ".agents"), "3.0.0");
      writeWazaRules(join(envRoot.home, ".codex"), "3.0.0");
      writeSkill(join(envRoot.home, ".codex", "skills"), "mermaid", "1.0.0");
      symlinkClaudeWazaToAgents(envRoot.home);
      writeWazaLock(envRoot.home);

      writeExecutable(
        join(envRoot.fakeBin, "git"),
        [
          "#!/bin/bash",
          `echo "git $*" >> "${logFile}"`,
          "exit 1",
          "",
        ].join("\n"),
      );

      writeExecutable(
        join(envRoot.fakeBin, "bunx"),
        [
          "#!/bin/bash",
          "set -euo pipefail",
          `echo "bunx $*" >> "${logFile}"`,
          "if [[ \"$*\" == *\"skills ls -g --json\"* ]]; then",
          `  echo '[${WAZA_SKILLS.map((skill) => JSON.stringify({ name: skill, agents: ["Claude Code", "Codex"] })).join(",")}]'`,
          "  exit 0",
          "fi",
          "if [[ \"$*\" == *\"skills check\"* ]]; then",
          "  echo 'unexpected mutating skill command' >&2",
          "  exit 2",
          "fi",
          "if [[ \"$*\" == *\"skills update\"* ]]; then",
          "  echo 'unexpected mutating skill command' >&2",
          "  exit 2",
          "fi",
          "exit 1",
          "",
        ].join("\n")
      );

      writeFakeGbrain(envRoot.fakeBin, logFile);
      writeFakeCodeGraph(envRoot.fakeBin, { logFile });
      writeFakeNpm(envRoot.fakeBin, "0.9.6", logFile);
      writeFakeCurl(envRoot.fakeBin, "3.0.0", logFile);

      const res = spawnSync("bash", [SCRIPT, "--json", "--check-updates", "--host", "both"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      const log = readFileSync(logFile, "utf-8");
      expect(log).not.toContain("git ");
      expect(log).toContain("curl -fsSL --max-time 5 https://raw.githubusercontent.com/tw93/Waza/main/skills/check/SKILL.md");
      expect(log).toContain("curl -fsSL --max-time 5 https://raw.githubusercontent.com/tw93/Waza/main/rules/durable-context.md");
      expect(log).toContain("gbrain doctor --json --fast");
      expect(log).toContain("gbrain check-update --json");
      expect(log).toContain("gbrain integrations list --json");
      expect(log).toContain("codegraph --version");
      expect(log).toContain("codegraph status .");
      expect(log).toContain("npm view @colbymchenry/codegraph version --json");
      expect(log).not.toContain("setup");
      expect(log).not.toContain("skills check");
      expect(log).not.toContain("skills update");
      expect(log).not.toContain("gbrain serve");
      expect(log).not.toContain("gbrain sync");
      expect(log).not.toContain("gbrain upgrade");
      expect(log).not.toContain("codegraph init");
      expect(log).not.toContain("codegraph sync");
      expect(log).not.toContain("codegraph install");
      expect(report.tools.waza.stage_command).toContain("skills add tw93/Waza");
      expect(report.tools.waza.stage_command).not.toContain("skills update");
      expect(report.tools.waza.sync_command).toContain("~/.claude/rules");
      expect(report.tools.waza.sync_command).toContain("~/.codex/rules");
      expect(report.tools.waza.upgrade_command).toContain("~/.claude/rules");
      expect(report.tools.waza.upgrade_command).toContain("~/.codex/rules");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("fails strict readiness when CodeGraph is not configured for Codex", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-codegraph-strict");
    try {
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "# no codegraph mcp\n");
      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(envRoot.fakeBin);

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "codex", "--strict-readiness"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(res.status).toBe(2);
      const report = JSON.parse(res.stdout);
      expect(report.tools.codegraph.status).toBe("partial");
      expect(report.tools.codegraph.source).toBe("global");
      expect(report.tools.codegraph.mcp_hosts.codex.status).toBe("missing");
      expect(res.stderr).toContain("CodeGraph readiness is partial");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("reports Codex stale drift instead of missing when staging has newer Waza", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-waza-drift");
    try {
      mkdirSync(join(envRoot.home, ".agents", "skills"), { recursive: true });
      mkdirSync(join(envRoot.home, ".claude"), { recursive: true });
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".claude", "settings.json"), "{}\n");
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n# no gbrain mcp\n");
      writeWazaBundle(join(envRoot.home, ".agents", "skills"), "9.0.0");
      writeWazaBundle(join(envRoot.home, ".codex", "skills"), "1.0.0");
      writeWazaRules(join(envRoot.home, ".agents"), "9.0.0");
      writeWazaRules(join(envRoot.home, ".codex"), "1.0.0");
      writeSkill(join(envRoot.home, ".codex", "skills"), "mermaid", "1.0.0");
      symlinkClaudeWazaToAgents(envRoot.home);
      writeWazaLock(envRoot.home);
      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(envRoot.fakeBin);
      writeFakeNpm(envRoot.fakeBin, "0.9.6");
      writeFakeCurl(envRoot.fakeBin, "9.0.0");

      const res = spawnSync("bash", [SCRIPT, "--json", "--check-updates", "--host", "both"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.tools.waza.status).toBe("present");
      expect(report.tools.waza.hosts.codex.status).toBe("present");
      expect(report.tools.waza.hosts.codex.missing_skills).toEqual([]);
      expect(report.tools.waza.hosts.codex.staging_sync).toBe("drift");
      expect(report.tools.waza.hosts.codex.stale_status).toBe("stale");
      expect(report.tools.waza.hosts.codex.stale_skills).toEqual(WAZA_SKILLS);
      expect(report.tools.waza.hosts.codex.shared_rules_staging_sync).toBe("drift");
      expect(report.tools.waza.hosts.codex.shared_rules_stale_status).toBe("stale");
      expect(report.tools.waza.hosts.codex.stale_shared_rules).toEqual(WAZA_RULES);
      expect(report.tools.waza.hosts.codex.skills[0].symlink_target).toBe(null);
      expect(report.tools.waza.hosts.claude.staging_sync).toBe("synced");
      expect(report.tools.waza.hosts.claude.shared_rules_staging_sync).toBe("synced");
      expect(report.tools.waza.hosts.claude.skills[0].symlink_target).toBe("../../.agents/skills/think");
      expect(report.tools.waza.update_status).toBe("update-available");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("reports Waza directory and shared-rule drift beyond SKILL.md", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-waza-shared-drift");
    try {
      mkdirSync(join(envRoot.home, ".agents", "skills"), { recursive: true });
      mkdirSync(join(envRoot.home, ".claude"), { recursive: true });
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".claude", "settings.json"), "{}\n");
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n# no gbrain mcp\n");
      writeWazaBundle(join(envRoot.home, ".agents", "skills"), "3.0.0");
      writeWazaBundle(join(envRoot.home, ".codex", "skills"), "3.0.0");
      writeWazaRules(join(envRoot.home, ".agents"), "3.0.0");
      writeWazaRules(join(envRoot.home, ".codex"), "3.0.0");
      mkdirSync(join(envRoot.home, ".agents", "skills", "check", "references"), { recursive: true });
      writeFileSync(join(envRoot.home, ".agents", "skills", "check", "references", "project-context.md"), "staging-only\n");
      writeFileSync(join(envRoot.home, ".codex", "rules", "durable-context.md"), ruleContent("durable-context.md", "2.0.0"));
      writeSkill(join(envRoot.home, ".codex", "skills"), "mermaid", "1.0.0");
      symlinkClaudeWazaToAgents(envRoot.home);
      writeWazaLock(envRoot.home);
      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(envRoot.fakeBin);
      writeFakeNpm(envRoot.fakeBin, "0.9.6");
      writeFakeCurl(envRoot.fakeBin, "3.0.0");

      const res = spawnSync("bash", [SCRIPT, "--json", "--check-updates", "--host", "codex"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      const codex = report.tools.waza.hosts.codex;
      expect(codex.staging_sync).toBe("drift");
      expect(codex.drift_skills).toEqual(["check"]);
      expect(codex.skills.find((skill: { name: string }) => skill.name === "check")?.staging_missing_files).toEqual([
        "references/project-context.md",
      ]);
      expect(codex.shared_rules_staging_sync).toBe("drift");
      expect(codex.drift_shared_rules).toEqual(["durable-context.md"]);
      expect(codex.shared_rules_stale_status).toBe("stale");
      expect(codex.stale_shared_rules).toEqual(["durable-context.md"]);
      expect(report.tools.waza.update_status).toBe("update-available");
      expect(report.tools.waza.update_reason).toContain("rules/durable-context.md");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("prefers a local CodeGraph binary and reports global drift", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-codegraph-local");
    const localBin = join(envRoot.root, "localbin");
    try {
      mkdirSync(localBin, { recursive: true });
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n");
      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(localBin, { version: "0.9.6" });
      writeFakeCodeGraph(envRoot.fakeBin, { version: "0.8.0" });

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "codex"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_LOCAL_BIN: join(localBin, "codegraph"),
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.tools.codegraph.status).toBe("present");
      expect(report.tools.codegraph.source).toBe("local");
      expect(report.tools.codegraph.local_version).toBe("0.9.6");
      expect(report.tools.codegraph.global_version).toBe("0.8.0");
      expect(report.tools.codegraph.drift).toEqual({ local: "0.9.6", global: "0.8.0", using: "local" });
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("uses the local CodeGraph platform bundle when the npm shim is unusable", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-codegraph-bundle");
    const bundleBin = join(
      envRoot.root,
      "node_modules",
      `@colbymchenry/codegraph-${process.platform}-${process.arch}`,
      "bin"
    );
    const shimBin = join(envRoot.root, "node_modules", ".bin");
    try {
      mkdirSync(bundleBin, { recursive: true });
      mkdirSync(shimBin, { recursive: true });
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n");
      writeFileSync(
        join(envRoot.root, "package.json"),
        JSON.stringify({ devDependencies: { "@colbymchenry/codegraph": "1.0.1" } }, null, 2)
      );
      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(bundleBin, { version: "1.0.1" });
      writeExecutable(join(shimBin, "codegraph"), "#!/bin/bash\necho 'bad shim used' >&2\nexit 99\n");

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "codex"], {
        cwd: envRoot.root,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.tools.codegraph.status).toBe("present");
      expect(report.tools.codegraph.source).toBe("local");
      expect(report.tools.codegraph.bin_path).toContain(`@colbymchenry/codegraph-${process.platform}-${process.arch}`);
      expect(report.tools.codegraph.local_version).toBe("1.0.1");
      expect(report.tools.codegraph.project_index.status).toBe("up-to-date");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("fails strict readiness when the managed agent fleet is missing from an empty agents directory", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-fleet-missing");
    try {
      writeClaudeCodeGraphConfig(envRoot.home, true);
      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(envRoot.fakeBin);

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "claude", "--strict-readiness"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_LOCAL_BIN: join(envRoot.fakeBin, "codegraph"),
        },
      });

      expect(res.status).toBe(2);
      const report = JSON.parse(res.stdout);
      expect(report.tools.codegraph.status).toBe("present");
      expect(report.tools.agent_fleet.status).toBe("missing");
      expect(report.tools.agent_fleet.managed_agents).toEqual(MANAGED_AGENTS);
      expect(report.tools.agent_fleet.hosts.claude.status).toBe("missing");
      expect(report.tools.agent_fleet.hosts.claude.missing_agents).toEqual(MANAGED_AGENTS);
      expect(res.stderr).toContain("Agent fleet readiness is missing");
      expect(res.stderr.toLowerCase()).toContain("fleet");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("fails strict readiness when the managed agent fleet is only partially installed", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-fleet-partial");
    try {
      writeClaudeCodeGraphConfig(envRoot.home, true);
      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(envRoot.fakeBin);

      mkdirSync(join(envRoot.home, ".claude", "agents"), { recursive: true });
      for (const agent of ["deep-reasoner", "fast-worker"]) {
        copyFileSync(join(ROOT, ".claude", "agents", `${agent}.md`), join(envRoot.home, ".claude", "agents", `${agent}.md`));
      }

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "claude", "--strict-readiness"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_LOCAL_BIN: join(envRoot.fakeBin, "codegraph"),
        },
      });

      expect(res.status).toBe(2);
      const report = JSON.parse(res.stdout);
      expect(report.tools.codegraph.status).toBe("present");
      expect(report.tools.agent_fleet.status).toBe("partial");
      expect(report.tools.agent_fleet.hosts.claude.status).toBe("partial");
      expect(report.tools.agent_fleet.hosts.claude.installed_agents).toEqual(["deep-reasoner", "fast-worker"]);
      expect(report.tools.agent_fleet.hosts.claude.missing_agents).toEqual([
        "explorer",
        "gatekeeper",
        "root-cause-prover",
        "harness-evaluator",
      ]);
      expect(res.stderr).toContain("Agent fleet readiness is partial");
      expect(res.stderr.toLowerCase()).toContain("fleet");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("reports the agent fleet as present and passes strict readiness once all managed agents are installed", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-fleet-present");
    try {
      writeClaudeCodeGraphConfig(envRoot.home, true);
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n");
      mkdirSync(join(envRoot.home, ".claude", "agents"), { recursive: true });
      mkdirSync(join(envRoot.home, ".codex", "agents"), { recursive: true });
      for (const agent of MANAGED_AGENTS) {
        copyFileSync(join(ROOT, ".claude", "agents", `${agent}.md`), join(envRoot.home, ".claude", "agents", `${agent}.md`));
        copyFileSync(join(ROOT, ".codex", "agents", `${agent}.toml`), join(envRoot.home, ".codex", "agents", `${agent}.toml`));
      }
      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(envRoot.fakeBin);

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "both", "--strict-readiness"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_LOCAL_BIN: join(envRoot.fakeBin, "codegraph"),
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.tools.codegraph.status).toBe("present");
      expect(report.tools.agent_fleet.status).toBe("present");
      expect(report.tools.agent_fleet.hosts.claude.status).toBe("present");
      expect(report.tools.agent_fleet.hosts.claude.installed_agents).toEqual(MANAGED_AGENTS);
      expect(report.tools.agent_fleet.hosts.codex.status).toBe("present");
      expect(report.tools.agent_fleet.hosts.codex.installed_agents).toEqual(MANAGED_AGENTS);
      expect(report.tools.agent_fleet.source).toBe("package:agents/fleet");
      expect(report.tools.agent_fleet.install_command).toBe("repo-harness run install-agent-fleet");
      expect(report.tools.agent_fleet.native_role_routing.status).toBe("unverified");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("fails strict readiness on aggregated negative or malformed Codex role-routing evidence and accepts verified evidence", () => {
    for (const testCase of [
      { evidenceStatus: "unavailable", reportedStatus: "unavailable", exitCode: 2 },
      { evidenceStatus: "mismatch", reportedStatus: "mismatch", exitCode: 2 },
      { evidenceStatus: "malformed-verified", reportedStatus: "invalid", exitCode: 2 },
      { evidenceStatus: "malformed-unverified", reportedStatus: "invalid", exitCode: 2 },
      { evidenceStatus: "verified-config-drift", reportedStatus: "invalid", exitCode: 2 },
      { evidenceStatus: "verified", reportedStatus: "verified", exitCode: 0 },
    ]) {
      const envRoot = setupFakeEnvironment(`check-agent-tooling-role-${testCase.evidenceStatus}`);
      try {
        mkdirSync(join(envRoot.home, ".codex", "agents"), { recursive: true });
        writeFileSync(
          join(envRoot.home, ".codex", "config.toml"),
          "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n",
        );
        for (const agent of MANAGED_AGENTS) {
          copyFileSync(
            join(ROOT, ".codex", "agents", `${agent}.toml`),
            join(envRoot.home, ".codex", "agents", `${agent}.toml`),
          );
        }
        const delegationRoot = join(envRoot.root, ".ai", "harness", "delegation");
        const evidenceDir = join(delegationRoot, "role-routing", "fixture-current");
        mkdirSync(evidenceDir, { recursive: true });
        writeFileSync(
          join(delegationRoot, "latest.json"),
          `${JSON.stringify({
            native_role_routing: {
              required: true,
              status: "unverified",
              reason: "awaiting observations",
              evidence_dir: "role-routing/fixture-current",
            },
          }, null, 2)}\n`,
        );
        const semanticStatus = testCase.evidenceStatus === "malformed-verified" || testCase.evidenceStatus === "verified-config-drift"
          ? "verified"
          : testCase.evidenceStatus === "malformed-unverified"
            ? "unverified"
            : testCase.evidenceStatus;
        writeFileSync(
          join(evidenceDir, "agent-a.json"),
          `${JSON.stringify({
            schema_version: 1,
            required: true,
            status: semanticStatus,
            reason: `fixture ${testCase.evidenceStatus}`,
            agent_id: "agent-a",
            turn_id: "turn-a",
            agent_type: semanticStatus === "unavailable" ? "default" : "fast-worker",
            observed_model: semanticStatus === "mismatch" ? "gpt-5.6-terra" : "gpt-5.6-sol",
            configured_model: semanticStatus === "unavailable" ? null : "gpt-5.6-sol",
            config_path: testCase.evidenceStatus === "malformed-verified"
              ? null
              : semanticStatus === "unavailable"
                ? null
                : join(envRoot.home, ".codex", "agents", "fast-worker.toml"),
            config_sha256: semanticStatus === "unavailable" || testCase.evidenceStatus === "malformed-verified"
              ? null
              : sha256File(join(envRoot.home, ".codex", "agents", "fast-worker.toml")),
            checked_at: "2026-07-12T00:00:00.000Z",
          }, null, 2)}\n`,
        );
        if (testCase.evidenceStatus === "verified-config-drift") {
          const configPath = join(envRoot.home, ".codex", "agents", "fast-worker.toml");
          writeFileSync(configPath, `${readFileSync(configPath, "utf8")}# drift\n`);
        }
        writeFakeCodeGraph(envRoot.fakeBin);

        const res = spawnSync("bash", [SCRIPT, "--json", "--host", "codex", "--strict-readiness"], {
          cwd: envRoot.root,
          encoding: "utf-8",
          env: {
            ...process.env,
            HOME: envRoot.home,
            PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
            AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
          },
        });

        expect(res.status).toBe(testCase.exitCode);
        const report = JSON.parse(res.stdout);
        expect(report.tools.agent_fleet.status).toBe("present");
        expect(report.tools.agent_fleet.native_role_routing.status).toBe(testCase.reportedStatus);
        if (testCase.exitCode === 2) {
          expect(res.stderr).toContain(`Codex native role routing is ${testCase.reportedStatus}`);
        } else {
          expect(res.stderr).not.toContain("Codex native role routing is");
        }
      } finally {
        rmSync(envRoot.root, { recursive: true, force: true });
      }
    }
  }, 30000);

  test("aggregates every sibling observation and retains the last completed negative canary across an empty reset", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-role-aggregate");
    try {
      mkdirSync(join(envRoot.home, ".codex", "agents"), { recursive: true });
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n");
      for (const agent of MANAGED_AGENTS) {
        copyFileSync(join(ROOT, ".codex", "agents", `${agent}.toml`), join(envRoot.home, ".codex", "agents", `${agent}.toml`));
      }
      const delegationRoot = join(envRoot.root, ".ai", "harness", "delegation");
      const previousDir = join(delegationRoot, "role-routing", "previous");
      mkdirSync(previousDir, { recursive: true });
      const base = {
        schema_version: 1,
        required: true,
        turn_id: "turn-a",
        checked_at: "2026-07-12T00:00:00.000Z",
      };
      writeFileSync(join(previousDir, "negative.json"), `${JSON.stringify({
        ...base,
        status: "unavailable",
        reason: "default child",
        agent_id: "agent-negative",
        agent_type: "default",
        observed_model: "gpt-5.6-sol",
        configured_model: null,
        config_path: null,
        config_sha256: null,
      })}\n`);
      writeFileSync(join(previousDir, "verified.json"), `${JSON.stringify({
        ...base,
        status: "verified",
        reason: "verified child",
        agent_id: "agent-verified",
        agent_type: "fast-worker",
        observed_model: "gpt-5.6-sol",
        configured_model: "gpt-5.6-sol",
        config_path: join(envRoot.home, ".codex", "agents", "fast-worker.toml"),
        config_sha256: sha256File(join(envRoot.home, ".codex", "agents", "fast-worker.toml")),
      })}\n`);
      mkdirSync(join(delegationRoot, "role-routing", "empty-current"), { recursive: true });
      writeFileSync(join(delegationRoot, "latest.json"), `${JSON.stringify({
        native_role_routing: {
          required: true,
          status: "unverified",
          reason: "awaiting observations",
          evidence_dir: "role-routing/empty-current",
        },
      })}\n`);
      writeFakeCodeGraph(envRoot.fakeBin);

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "codex", "--strict-readiness"], {
        cwd: envRoot.root,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });
      expect(res.status).toBe(2);
      const report = JSON.parse(res.stdout);
      expect(report.tools.agent_fleet.native_role_routing.status).toBe("unavailable");
      expect(report.tools.agent_fleet.native_role_routing.observations).toHaveLength(2);
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("classifies Claude agent drift against the packaged repo-owned source without network access", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-fleet-updates");
    try {
      const localContent: Record<string, string> = {};
      for (const agent of MANAGED_AGENTS) {
        localContent[agent] = readFileSync(join(FLEET_SOURCE_DIR, `${agent}.md`), "utf-8");
      }
      localContent["fast-worker"] += "\n# local drift\n";

      mkdirSync(join(envRoot.home, ".claude", "agents"), { recursive: true });
      mkdirSync(join(envRoot.home, ".codex", "agents"), { recursive: true });
      for (const agent of MANAGED_AGENTS) {
        writeFileSync(join(envRoot.home, ".claude", "agents", `${agent}.md`), localContent[agent]);
        writeFileSync(join(envRoot.home, ".codex", "agents", `${agent}.toml`), `name = "${agent}"\n`);
      }

      writeFakeBunx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCodeGraph(envRoot.fakeBin);
      writeFakeNpm(envRoot.fakeBin, "0.9.6");

      const res = spawnSync("bash", [SCRIPT, "--json", "--check-updates", "--host", "both"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      const claude = report.tools.agent_fleet.hosts.claude;
      expect(claude.update_status).toBe("drift");
      expect(claude.drift_agents).toEqual(["fast-worker"]);
      expect(claude.synced_agents).toEqual([
        "explorer",
        "deep-reasoner",
        "gatekeeper",
        "root-cause-prover",
        "harness-evaluator",
      ]);
      expect(claude.source_missing_agents).toEqual([]);
      const codex = report.tools.agent_fleet.hosts.codex;
      expect(codex.update_status).toBe("not-applicable");
      expect(codex.drift_agents).toEqual([]);
      expect(codex.synced_agents).toEqual([]);

      expect(readFileSync(SCRIPT, "utf-8")).not.toContain("Fable-agents");
      expect(readFileSync(SCRIPT, "utf-8")).not.toContain("fetchAgentFleetUpstream");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);
});
