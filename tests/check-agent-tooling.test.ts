import { describe, expect, test } from "bun:test";
import {
  chmodSync,
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

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/check-agent-tooling.sh");
const WAZA_SKILLS = ["think", "hunt", "check", "health"];
const WAZA_RULES = ["anti-patterns.md", "chinese.md", "durable-context.md", "english.md"];

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

function writeFakeNpx(fakeBin: string, logFile?: string) {
  const items = WAZA_SKILLS
    .map((skill) => ({ name: skill, agents: ["Claude Code", "Codex"] }))
    .map((item) => JSON.stringify(item))
    .join(",");
  writeExecutable(
    join(fakeBin, "npx"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      logFile ? `echo "npx $*" >> "${logFile}"` : "",
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
  test("reports gstack and Waza presence while keeping gbrain manual-only when MCP is disabled", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling");
    try {
      mkdirSync(join(envRoot.home, ".claude", "skills", "gstack"), { recursive: true });
      mkdirSync(join(envRoot.home, ".codex", "skills", "gstack"), { recursive: true });
      mkdirSync(join(envRoot.home, ".agents", "skills"), { recursive: true });
      writeFileSync(join(envRoot.home, ".claude", "skills", "gstack", "VERSION"), "1.2.3\n");
      writeFileSync(join(envRoot.home, ".claude", "settings.json"), "{}\n");
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n# no gbrain mcp\n");
      writeWazaBundle(join(envRoot.home, ".agents", "skills"), "3.0.0");
      writeWazaBundle(join(envRoot.home, ".codex", "skills"), "3.0.0");
      writeWazaRules(join(envRoot.home, ".agents"), "3.0.0");
      writeWazaRules(join(envRoot.home, ".codex"), "3.0.0");
      writeSkill(join(envRoot.home, ".codex", "skills"), "mermaid", "1.0.0");
      symlinkClaudeWazaToAgents(envRoot.home);
      writeWazaLock(envRoot.home);
      writeFakeNpx(envRoot.fakeBin);
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
      expect(report.runtime_capabilities.npx.owner).toBe("external-skills-cli");
      expect(report.runtime_capabilities.skills_cli.status).toBe("available");
      expect(report.runtime_capabilities.rsync.required).toBe(false);
      expect(report.runtime_capabilities.symlink.required_for).toContain("copy mode remains the fallback");
      expect(report.tools.gstack.status).toBe("present");
      expect(report.tools.gstack.hosts.claude.version).toBe("1.2.3");
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
      writeFakeNpx(envRoot.fakeBin);
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
      writeFakeNpx(envRoot.fakeBin);
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
      mkdirSync(join(envRoot.home, ".claude", "skills", "gstack", ".git"), { recursive: true });
      mkdirSync(join(envRoot.home, ".codex", "skills", "gstack", ".git"), { recursive: true });
      mkdirSync(join(envRoot.home, ".agents", "skills"), { recursive: true });
      writeFileSync(join(envRoot.home, ".claude", "skills", "gstack", "VERSION"), "1.2.3\n");
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
          "set -euo pipefail",
          `echo "git $*" >> "${logFile}"`,
          "case \"$*\" in",
          "  *\"remote get-url origin\"*) echo 'https://github.com/garrytan/gstack.git' ;;",
          "  *\"rev-parse HEAD\"*) echo 'abc123' ;;",
          "  *\"ls-remote --symref origin HEAD\"*) printf 'ref: refs/heads/main\\tHEAD\\nabc123\\tHEAD\\n' ;;",
          "  *) exit 1 ;;",
          "esac",
          "",
        ].join("\n")
      );

      writeExecutable(
        join(envRoot.fakeBin, "npx"),
        [
          "#!/bin/bash",
          "set -euo pipefail",
          `echo "npx $*" >> "${logFile}"`,
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
      const log = readFileSync(logFile, "utf-8");
      expect(log).toContain("git -C");
      expect(log).toContain("remote get-url origin");
      expect(log).toContain("rev-parse HEAD");
      expect(log).toContain("ls-remote --symref origin HEAD");
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
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("fails strict readiness when CodeGraph is not configured for Codex", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-codegraph-strict");
    try {
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "# no codegraph mcp\n");
      writeFakeNpx(envRoot.fakeBin);
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
      writeFakeNpx(envRoot.fakeBin);
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
      writeFakeNpx(envRoot.fakeBin);
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
      writeFakeNpx(envRoot.fakeBin);
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
      writeFakeNpx(envRoot.fakeBin);
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
});
