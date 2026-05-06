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
const WAZA_SKILLS = ["check", "design", "health", "hunt", "learn", "read", "think", "write"];

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

function writeSkill(root: string, name: string, version: string) {
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, "SKILL.md"), skillContent(name, version));
}

function writeWazaBundle(root: string, version: string) {
  for (const skill of WAZA_SKILLS) {
    writeSkill(root, skill, version);
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
      "case \"$1 ${2:-}\" in",
      "  \"--version \")",
      "    echo 'gbrain 0.12.0'",
      "    ;;",
      "  \"doctor --json\")",
      "    echo '{\"status\":\"warnings\",\"health_score\":90}'",
      "    ;;",
      "  \"integrations list\")",
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

function writeFakeCurl(fakeBin: string, version: string, logFile?: string) {
  writeExecutable(
    join(fakeBin, "curl"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      logFile ? `echo "curl $*" >> "${logFile}"` : "",
      "skill=''",
      ...WAZA_SKILLS.flatMap((name) => [
        `if [[ "$*" == *"/skills/${name}/SKILL.md"* ]]; then`,
        `  skill="${name}"`,
        "fi",
      ]),
      "if [[ -z \"$skill\" ]]; then",
      "  exit 22",
      "fi",
      "cat <<EOF",
      "---",
      "name: $skill",
      "metadata:",
      `  version: \"${version}\"`,
      "---",
      "# $skill",
      "EOF",
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
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "# no gbrain mcp\n");
      writeWazaBundle(join(envRoot.home, ".agents", "skills"), "3.0.0");
      writeWazaBundle(join(envRoot.home, ".codex", "skills"), "3.0.0");
      symlinkClaudeWazaToAgents(envRoot.home);
      writeWazaLock(envRoot.home);
      writeFakeNpx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);

      const res = spawnSync("bash", [SCRIPT, "--json", "--host", "both"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.tools.gstack.status).toBe("present");
      expect(report.tools.gstack.hosts.claude.version).toBe("1.2.3");
      expect(report.tools.waza.status).toBe("present");
      expect(report.tools.waza.source_repo).toBe("tw93/Waza");
      expect(report.tools.waza.primary_host).toBe("codex");
      expect(report.tools.waza.hosts.claude.installed_skills).toEqual(WAZA_SKILLS);
      expect(report.tools.waza.hosts.claude.skills[0].symlink_target).toBe("../../.agents/skills/check");
      expect(report.tools.waza.hosts.codex.staging_sync).toBe("synced");
      expect(report.tools.waza.hosts.codex.stale_status).toBe("not-checked");
      expect(report.tools.gbrain.status).toBe("warning");
      expect(report.tools.gbrain.mcp_hosts.claude.status).toBe("disabled");
      expect(report.tools.gbrain.mcp_hosts.codex.status).toBe("disabled");
      expect(report.tools.gbrain.impact.knowledge_tasks).toBe("manual-only");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  });

  test("uses only read-only probes during update checks", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-updates");
    const logFile = join(envRoot.root, "tool.log");
    try {
      mkdirSync(join(envRoot.home, ".claude", "skills", "gstack", ".git"), { recursive: true });
      mkdirSync(join(envRoot.home, ".codex", "skills", "gstack", ".git"), { recursive: true });
      mkdirSync(join(envRoot.home, ".agents", "skills"), { recursive: true });
      writeFileSync(join(envRoot.home, ".claude", "skills", "gstack", "VERSION"), "1.2.3\n");
      writeFileSync(join(envRoot.home, ".claude", "settings.json"), "{}\n");
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "# no gbrain mcp\n");
      writeWazaBundle(join(envRoot.home, ".agents", "skills"), "3.0.0");
      writeWazaBundle(join(envRoot.home, ".codex", "skills"), "3.0.0");
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
      writeFakeCurl(envRoot.fakeBin, "3.0.0", logFile);

      const res = spawnSync("bash", [SCRIPT, "--json", "--check-updates", "--host", "both"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
        },
      });

      expect(res.status).toBe(0);
      const log = readFileSync(logFile, "utf-8");
      expect(log).toContain("git -C");
      expect(log).toContain("remote get-url origin");
      expect(log).toContain("rev-parse HEAD");
      expect(log).toContain("ls-remote --symref origin HEAD");
      expect(log).toContain("npx -y skills ls -g --json");
      expect(log).toContain("curl -fsSL --max-time 5 https://raw.githubusercontent.com/tw93/Waza/main/skills/check/SKILL.md");
      expect(log).toContain("gbrain doctor --json");
      expect(log).toContain("gbrain check-update --json");
      expect(log).toContain("gbrain integrations list --json");
      expect(log).not.toContain("setup");
      expect(log).not.toContain("skills check");
      expect(log).not.toContain("skills update");
      expect(log).not.toContain("gbrain serve");
      expect(log).not.toContain("gbrain sync");
      expect(log).not.toContain("gbrain upgrade");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  });

  test("reports Codex stale drift instead of missing when staging has newer Waza", () => {
    const envRoot = setupFakeEnvironment("check-agent-tooling-waza-drift");
    try {
      mkdirSync(join(envRoot.home, ".agents", "skills"), { recursive: true });
      mkdirSync(join(envRoot.home, ".claude"), { recursive: true });
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".claude", "settings.json"), "{}\n");
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "# no gbrain mcp\n");
      writeWazaBundle(join(envRoot.home, ".agents", "skills"), "9.0.0");
      writeWazaBundle(join(envRoot.home, ".codex", "skills"), "1.0.0");
      symlinkClaudeWazaToAgents(envRoot.home);
      writeWazaLock(envRoot.home);
      writeFakeNpx(envRoot.fakeBin);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeCurl(envRoot.fakeBin, "9.0.0");

      const res = spawnSync("bash", [SCRIPT, "--json", "--check-updates", "--host", "both"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
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
      expect(report.tools.waza.hosts.codex.skills[0].symlink_target).toBe(null);
      expect(report.tools.waza.hosts.claude.staging_sync).toBe("synced");
      expect(report.tools.waza.hosts.claude.skills[0].symlink_target).toBe("../../.agents/skills/check");
      expect(report.tools.waza.update_status).toBe("update-available");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  });
});
