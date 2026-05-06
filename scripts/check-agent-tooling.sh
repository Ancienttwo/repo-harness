#!/bin/bash
set -euo pipefail

if command -v node >/dev/null 2>&1; then
  RUNTIME_BIN="$(command -v node)"
elif command -v bun >/dev/null 2>&1; then
  RUNTIME_BIN="$(command -v bun)"
elif [[ -x "${HOME}/.bun/bin/bun" ]]; then
  RUNTIME_BIN="${HOME}/.bun/bin/bun"
else
  echo "check-agent-tooling.sh requires node or bun" >&2
  exit 1
fi

exec "$RUNTIME_BIN" - "$@" <<'NODE_EOF'
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const argv = process.argv.slice(2);
let jsonOutput = false;
let checkUpdates = false;
let hostMode = "both";

function usage() {
  console.log(`Usage: scripts/check-agent-tooling.sh [--json] [--check-updates] [--host claude|codex|both]`);
}

for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--json") {
    jsonOutput = true;
    continue;
  }
  if (arg === "--check-updates") {
    checkUpdates = true;
    continue;
  }
  if (arg === "--host") {
    const next = argv[index + 1];
    if (!next) {
      console.error("--host requires claude, codex, or both");
      process.exit(1);
    }
    hostMode = next;
    index += 1;
    continue;
  }
  if (arg === "--help" || arg === "-h") {
    usage();
    process.exit(0);
  }
  console.error(`Unknown argument: ${arg}`);
  usage();
  process.exit(1);
}

if (!["claude", "codex", "both"].includes(hostMode)) {
  console.error(`Unsupported host: ${hostMode}`);
  process.exit(1);
}

const HOME = os.homedir();
const REPO_ROOT = process.cwd();
const SELECTED_HOSTS = hostMode === "both" ? ["claude", "codex"] : [hostMode];
const WAZA_SOURCE_REPO = "tw93/Waza";
const WAZA_SOURCE_URL = "https://github.com/tw93/Waza.git";
const WAZA_RAW_BASE_URL = "https://raw.githubusercontent.com/tw93/Waza/main";
const WAZA_MANAGED_SKILLS = ["check", "design", "health", "hunt", "learn", "read", "think", "write"];
const WAZA_STAGING_DIR = path.join(HOME, ".agents", "skills");
const HOSTS = {
  claude: {
    label: "Claude Code",
    agentLabel: "Claude Code",
    skillsDir: path.join(HOME, ".claude", "skills"),
    gstackDir: path.join(HOME, ".claude", "skills", "gstack"),
    configPath: path.join(HOME, ".claude", "settings.json"),
  },
  codex: {
    label: "Codex",
    agentLabel: "Codex",
    skillsDir: path.join(HOME, ".codex", "skills"),
    gstackDir: path.join(HOME, ".codex", "skills", "gstack"),
    configPath: path.join(HOME, ".codex", "config.toml"),
  },
};

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return "";
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    timeout: options.timeoutMs ?? 0,
  });

  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error.message || result.error) : "",
    timed_out: result.error?.code === "ETIMEDOUT",
  };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function sha1(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function parseSkillVersion(text) {
  const match = text.match(/^\s*version:\s*["']?([^"'\n]+)["']?/m);
  return match ? match[1].trim() : null;
}

function resolveRealPath(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch (_error) {
    return null;
  }
}

function readSkillFile(filePath) {
  const content = readText(filePath);
  if (!content) {
    return {
      exists: false,
      version: null,
      hash: null,
    };
  }

  return {
    exists: true,
    version: parseSkillVersion(content),
    hash: sha1(content),
  };
}

function summarizeStatus(hostStatuses) {
  const values = Object.values(hostStatuses);
  const presentCount = values.filter((entry) => entry.present).length;
  if (presentCount === 0) return "missing";
  if (presentCount === values.length) return "present";
  return "partial";
}

function detectRepoGstackTeamMode() {
  const claudeMd = readText(path.join(REPO_ROOT, "CLAUDE.md"));
  const settings = readText(path.join(REPO_ROOT, ".claude", "settings.json"));
  const hookPath = path.join(REPO_ROOT, ".claude", "hooks", "check-gstack.sh");

  if (settings.includes("check-gstack.sh") || fs.existsSync(hookPath) || claudeMd.includes("## gstack (REQUIRED")) {
    return {
      status: "required",
      reason: "Repo has gstack enforcement traces (required CLAUDE.md section or check-gstack hook).",
    };
  }

  if (claudeMd.includes("## gstack")) {
    return {
      status: "optional",
      reason: "Repo has a gstack guidance section in CLAUDE.md but no enforcement hook.",
    };
  }

  return {
    status: "not-detected",
    reason: "No repo-local gstack team-mode traces detected in CLAUDE.md or .claude/hooks/.",
  };
}

function detectGstack() {
  const hostStatuses = {};

  for (const host of SELECTED_HOSTS) {
    const meta = HOSTS[host];
    const present = fs.existsSync(meta.gstackDir);
    const versionFile = path.join(meta.gstackDir, "VERSION");
    const gitDir = path.join(meta.gstackDir, ".git");
    const version = present && fs.existsSync(versionFile) ? readText(versionFile).trim() : "";
    let updateStatus = checkUpdates ? "unknown" : "not-checked";
    let origin = "";
    let head = "";
    let remoteHead = "";
    let updateReason = "";

    if (present && checkUpdates && fs.existsSync(gitDir)) {
      const originResult = run("git", ["-C", meta.gstackDir, "remote", "get-url", "origin"], { timeoutMs: 1000 });
      if (originResult.ok) {
        origin = originResult.stdout.trim();
      }

      const headResult = run("git", ["-C", meta.gstackDir, "rev-parse", "HEAD"], { timeoutMs: 1000 });
      if (headResult.ok) {
        head = headResult.stdout.trim();
      }

      const remoteResult = run("git", ["-C", meta.gstackDir, "ls-remote", "--symref", "origin", "HEAD"], { timeoutMs: 1500 });
      if (remoteResult.ok) {
        const match = remoteResult.stdout.match(/^([0-9a-f]+)\s+HEAD$/m);
        remoteHead = match ? match[1] : "";
      }

      if (head && remoteHead) {
        updateStatus = head === remoteHead ? "up-to-date" : "update-available";
        updateReason = head === remoteHead
          ? "Local gstack matches origin/HEAD."
          : "Local gstack HEAD differs from origin/HEAD."
      } else if (origin || head) {
        updateStatus = "unknown";
        updateReason = remoteResult.timed_out
          ? "Timed out while checking gstack origin/HEAD."
          : "Unable to resolve both local and remote HEAD for gstack."
      }
    } else if (present) {
      updateStatus = checkUpdates ? "unknown" : "not-checked";
      updateReason = fs.existsSync(gitDir)
        ? "Update checks were skipped."
        : "gstack install is present but not a full git checkout in this host path.";
    }

    hostStatuses[host] = {
      label: meta.label,
      present,
      path: meta.gstackDir,
      version: version || null,
      origin: origin || null,
      head: head || null,
      remote_head: remoteHead || null,
      update_status: updateStatus,
      reason: present
        ? (updateReason || `Detected gstack at ${meta.gstackDir}.`)
        : `Missing gstack at ${meta.gstackDir}.`,
      install_command: host === "claude"
        ? "git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup"
        : `${fs.existsSync(HOSTS.claude.gstackDir) ? "cd ~/.claude/skills/gstack" : "git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack"} && ./setup --host codex`,
      upgrade_command: host === "claude"
        ? "cd ~/.claude/skills/gstack && git pull && ./setup"
        : "cd ~/.claude/skills/gstack && git pull && ./setup --host codex",
    };
  }

  const repoTeamMode = detectRepoGstackTeamMode();
  const status = summarizeStatus(hostStatuses);
  const selectedMeta = Object.values(hostStatuses);
  const installCommand = SELECTED_HOSTS.length === 2
    ? "git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup && ./setup --host codex"
    : selectedMeta[0].install_command;
  const upgradeCommand = SELECTED_HOSTS.length === 2
    ? "cd ~/.claude/skills/gstack && git pull && ./setup && ./setup --host codex"
    : selectedMeta[0].upgrade_command;

  return {
    name: "gstack",
    status,
    reason: status === "present"
      ? `Detected gstack in all requested hosts (${SELECTED_HOSTS.join(", ")}).`
      : status === "partial"
        ? `Detected gstack in ${selectedMeta.filter((entry) => entry.present).length}/${selectedMeta.length} requested hosts.`
        : "gstack is missing from all requested hosts.",
    hosts: hostStatuses,
    repo_team_mode: repoTeamMode,
    install_command: installCommand,
    upgrade_command: upgradeCommand,
    impact: {
      complex_tasks: status === "present" ? "full" : status === "partial" ? "degraded" : "missing",
      simple_tasks: "unaffected",
      knowledge_tasks: "unaffected",
    },
  };
}

function summarizeWazaStatus(hostStatuses) {
  const values = Object.values(hostStatuses);
  const fullCount = values.filter((entry) => entry.status === "present").length;
  const installedCount = values.reduce((count, entry) => count + entry.installed_skills.length, 0);
  if (fullCount === values.length) return "present";
  if (installedCount > 0) return "partial";
  return "missing";
}

function fetchWazaUpstreamSkills() {
  if (!checkUpdates) {
    return {
      status: "not-checked",
      reason: "Update checks were skipped.",
      skills: {},
    };
  }

  const skills = {};
  const failures = [];

  for (const skill of WAZA_MANAGED_SKILLS) {
    const url = `${WAZA_RAW_BASE_URL}/skills/${skill}/SKILL.md`;
    const result = run("curl", ["-fsSL", "--max-time", "5", url], { timeoutMs: 7000 });
    if (!result.ok || !result.stdout) {
      failures.push(skill);
      continue;
    }

    skills[skill] = {
      version: parseSkillVersion(result.stdout),
      hash: sha1(result.stdout),
      source_url: url,
    };
  }

  if (failures.length > 0) {
    return {
      status: "unknown",
      reason: `Unable to fetch upstream Waza SKILL.md for: ${failures.join(", ")}.`,
      skills,
    };
  }

  return {
    status: "fetched",
    reason: "Fetched upstream Waza SKILL.md files from GitHub raw URLs.",
    skills,
  };
}

function inspectWazaSkill(host, skill, skillLock, skillItems, upstreamSkills) {
  const meta = HOSTS[host];
  const skillDir = path.join(meta.skillsDir, skill);
  const skillFile = path.join(skillDir, "SKILL.md");
  const stagingFile = path.join(WAZA_STAGING_DIR, skill, "SKILL.md");
  const local = readSkillFile(skillFile);
  const staging = readSkillFile(stagingFile);
  const upstream = upstreamSkills[skill] || null;
  let symlinkTarget = null;

  try {
    const stat = fs.lstatSync(skillDir);
    if (stat.isSymbolicLink()) {
      symlinkTarget = fs.readlinkSync(skillDir);
    }
  } catch (_error) {
    symlinkTarget = null;
  }

  const skillCliItem = skillItems.find((item) => item.name === skill);
  const skillCliAgents = Array.isArray(skillCliItem?.agents) ? skillCliItem.agents : [];
  const sourceLock = skillLock?.skills?.[skill] || null;

  return {
    name: skill,
    path: skillFile,
    real_path: resolveRealPath(skillFile),
    symlink_target: symlinkTarget,
    present: local.exists,
    version: local.version,
    hash: local.hash,
    source_locked: sourceLock?.source === WAZA_SOURCE_REPO,
    source_repo: sourceLock?.source || null,
    skills_cli_agents: skillCliAgents,
    staging_present: staging.exists,
    staging_version: staging.version,
    staging_hash: staging.hash,
    staging_sync: local.exists && staging.exists
      ? (local.hash === staging.hash ? "synced" : "drift")
      : staging.exists
        ? "missing-local"
        : "unknown",
    upstream_version: upstream?.version || null,
    upstream_hash: upstream?.hash || null,
    stale_status: !checkUpdates
      ? "not-checked"
      : upstream?.hash && local.exists
        ? (local.hash === upstream.hash ? "up-to-date" : "stale")
        : upstream?.hash
          ? "missing-local"
          : "unknown",
  };
}

function detectWaza() {
  const skillLockPath = path.join(HOME, ".agents", ".skill-lock.json");
  const skillLock = readJson(skillLockPath);
  const skillsResult = run("npx", ["-y", "skills", "ls", "-g", "--json"], { timeoutMs: 1500 });
  const skillItems = skillsResult.ok ? parseJson(skillsResult.stdout) || [] : [];
  const wazaEntries = Object.entries(skillLock?.skills || {}).filter(([, meta]) => meta?.source === WAZA_SOURCE_REPO);
  const upstream = fetchWazaUpstreamSkills();
  const hostStatuses = {};

  for (const host of SELECTED_HOSTS) {
    const skills = WAZA_MANAGED_SKILLS.map((skill) => inspectWazaSkill(host, skill, skillLock, skillItems, upstream.skills));
    const installedSkills = skills.filter((entry) => entry.present).map((entry) => entry.name);
    const missingSkills = skills.filter((entry) => !entry.present).map((entry) => entry.name);
    const driftSkills = skills.filter((entry) => entry.staging_sync === "drift").map((entry) => entry.name);
    const staleSkills = skills.filter((entry) => entry.stale_status === "stale").map((entry) => entry.name);
    const status = missingSkills.length === 0 ? "present" : installedSkills.length > 0 ? "partial" : "missing";
    const stagingSync = status === "missing"
      ? "missing"
      : driftSkills.length > 0
        ? "drift"
        : skills.every((entry) => entry.staging_sync === "synced")
          ? "synced"
          : "unknown";
    const staleStatus = !checkUpdates
      ? "not-checked"
      : staleSkills.length > 0
        ? "stale"
        : skills.every((entry) => entry.stale_status === "up-to-date")
          ? "up-to-date"
          : "unknown";

    hostStatuses[host] = {
      label: HOSTS[host].label,
      path: HOSTS[host].skillsDir,
      status,
      present: status === "present",
      installed_skills: installedSkills,
      missing_skills: missingSkills,
      drift_skills: driftSkills,
      stale_skills: staleSkills,
      versions: Object.fromEntries(skills.filter((entry) => entry.present).map((entry) => [entry.name, entry.version])),
      staging_sync: stagingSync,
      stale_status: staleStatus,
      skills,
      reason: status === "present"
        ? `Detected all ${WAZA_MANAGED_SKILLS.length} Waza skills for ${HOSTS[host].label} from the real host skill path.`
        : status === "partial"
          ? `Detected ${installedSkills.length}/${WAZA_MANAGED_SKILLS.length} Waza skills for ${HOSTS[host].label}; missing ${missingSkills.join(", ")}.`
          : `No Waza skills detected at ${HOSTS[host].skillsDir}.`,
    };
  }

  const staleSkillSet = new Set();
  for (const host of Object.values(hostStatuses)) {
    for (const skill of host.stale_skills) staleSkillSet.add(skill);
  }
  const updateStatus = !checkUpdates
    ? "not-checked"
    : upstream.status === "unknown"
      ? "unknown"
      : staleSkillSet.size > 0
        ? "update-available"
        : "up-to-date";
  const updateReason = !checkUpdates
    ? "Update checks were skipped."
    : upstream.status === "unknown"
      ? upstream.reason
      : staleSkillSet.size > 0
        ? `Upstream Waza SKILL.md differs for: ${[...staleSkillSet].sort().join(", ")}.`
        : "Local Waza SKILL.md files match upstream GitHub raw content.";

  const status = summarizeWazaStatus(hostStatuses);
  const installCommand = `npx -y skills add tw93/Waza -g -a ${
    hostMode === "both" ? "claude-code codex" : hostMode === "claude" ? "claude-code" : "codex"
  } -s check design health hunt learn read think write -y`;
  const syncCommand = `for d in ${WAZA_MANAGED_SKILLS.join(" ")}; do cp ~/.agents/skills/$d/SKILL.md ~/.codex/skills/$d/SKILL.md; done`;

  return {
    name: "waza",
    status,
    reason: status === "present"
      ? `Detected Waza in all requested real host paths (${SELECTED_HOSTS.join(", ")}).`
      : status === "partial"
        ? "Waza is installed for some requested host paths or only partially installed."
        : "No managed Waza skills were found in the requested real host paths.",
    source_lock_file: fs.existsSync(skillLockPath) ? skillLockPath : null,
    source_repo: WAZA_SOURCE_REPO,
    source_url: WAZA_SOURCE_URL,
    managed_skills: WAZA_MANAGED_SKILLS,
    primary_host: "codex",
    codex_primary_path: path.join(HOME, ".codex", "skills"),
    staging_cache_path: WAZA_STAGING_DIR,
    sync_mode: "codex-first-copy-from-staging",
    host_drift_policy: "report-per-host-version-staging-and-upstream-drift",
    skills_cli_status: skillsResult.ok ? "available" : skillsResult.timed_out ? "timed-out" : "unavailable",
    source_lock_entries: wazaEntries.map(([name]) => name).sort(),
    upstream_status: upstream.status,
    upstream_reason: upstream.reason,
    upstream_skills: upstream.skills,
    hosts: hostStatuses,
    update_status: updateStatus,
    update_reason: updateReason,
    install_command: installCommand,
    stage_command: "npx -y skills update",
    sync_command: syncCommand,
    verify_command: `for d in ${WAZA_MANAGED_SKILLS.join(" ")}; do cmp -s ~/.agents/skills/$d/SKILL.md ~/.codex/skills/$d/SKILL.md; done`,
    upgrade_command: `npx -y skills update && ${syncCommand}`,
    impact: {
      complex_tasks: "unaffected",
      simple_tasks: status === "present" ? "full" : status === "partial" ? "degraded" : "missing",
      knowledge_tasks: "unaffected",
    },
  };
}

function detectGbrainMcp(host) {
  const meta = HOSTS[host];
  const content = readText(meta.configPath);
  if (!content) {
    return {
      status: "disabled",
      reason: `No ${meta.label} config found at ${meta.configPath}.`,
    };
  }

  if (host === "codex") {
    if (/\[mcp_servers\.(gbrain|gbrain_http)\]/.test(content)) {
      return {
        status: "configured",
        reason: "Codex config contains a gbrain MCP server entry.",
      };
    }

    return {
      status: "disabled",
      reason: "Codex config does not contain a gbrain MCP server entry.",
    };
  }

  if (/gbrain/i.test(content)) {
    return {
      status: "configured",
      reason: "Claude settings contain a gbrain reference.",
    };
  }

  return {
    status: "disabled",
    reason: "Claude settings do not contain a gbrain MCP configuration.",
  };
}

function detectGbrain() {
  const versionResult = run("gbrain", ["--version"], { timeoutMs: 1000 });
  const present = versionResult.ok;
  const version = present ? versionResult.stdout.trim().replace(/^gbrain\s+/i, "") : null;
  const doctorResult = present ? run("gbrain", ["doctor", "--json"], { timeoutMs: 1500 }) : null;
  const doctorJson = doctorResult?.ok ? parseJson(doctorResult.stdout) : null;
  const checkUpdateResult = present && checkUpdates ? run("gbrain", ["check-update", "--json"], { timeoutMs: 1500 }) : null;
  const checkUpdateJson = checkUpdateResult?.ok ? parseJson(checkUpdateResult.stdout) : null;
  const integrationsResult = present ? run("gbrain", ["integrations", "list", "--json"], { timeoutMs: 1500 }) : null;
  const integrationsJson = integrationsResult?.ok ? parseJson(integrationsResult.stdout) : null;
  const integrationsAvailable = integrationsJson
    ? Object.values(integrationsJson).reduce((count, value) => count + (Array.isArray(value) ? value.length : 0), 0)
    : 0;
  const mcpHosts = {};

  for (const host of SELECTED_HOSTS) {
    mcpHosts[host] = {
      label: HOSTS[host].label,
      ...detectGbrainMcp(host),
    };
  }

  const mcpConfigured = Object.values(mcpHosts).some((entry) => entry.status === "configured");
  const status = !present
    ? "missing"
    : (doctorJson?.status === "ok" ? "present" : doctorJson?.status === "warnings" ? "warning" : "warning");
  const updateStatus = !checkUpdates
    ? "not-checked"
    : checkUpdateJson?.update_available
      ? "update-available"
      : checkUpdateJson
        ? "up-to-date"
        : "unknown";

  return {
    name: "gbrain",
    status,
    reason: !present
      ? "gbrain CLI is not installed."
      : doctorJson
        ? `gbrain CLI is present; doctor status is ${doctorJson.status}.`
        : "gbrain CLI is present, but doctor output could not be parsed.",
    cli_present: present,
    version,
    doctor: doctorJson,
    update_status: updateStatus,
    update_reason: checkUpdateJson?.error
      ? `gbrain check-update returned ${checkUpdateJson.error}.`
      : checkUpdateResult?.timed_out
        ? "gbrain check-update timed out before update status could be determined."
      : updateStatus === "update-available"
        ? "gbrain check-update reports a newer version."
        : updateStatus === "up-to-date"
          ? "gbrain check-update did not find a newer version."
          : "gbrain update status is unknown.",
    integrations_available: integrationsAvailable,
    mcp_hosts: mcpHosts,
    install_command: "bun add -g gbrain",
    upgrade_command: checkUpdateJson?.upgrade_command || "gbrain upgrade",
    sync_command: "gbrain sync --repo <path>",
    impact: {
      complex_tasks: "unaffected",
      simple_tasks: "unaffected",
      knowledge_tasks: !present
        ? "missing"
        : mcpConfigured
          ? "full"
          : "manual-only",
    },
  };
}

const report = {
  generated_at: new Date().toISOString(),
  repo_root: REPO_ROOT,
  hosts: SELECTED_HOSTS,
  check_updates: checkUpdates,
  tools: {
    gstack: detectGstack(),
    waza: detectWaza(),
    gbrain: detectGbrain(),
  },
};

function printText(result) {
  console.log("External Tooling Report");
  console.log(`Hosts: ${result.hosts.join(", ")}`);
  console.log("");

  const gstack = result.tools.gstack;
  console.log(`gstack [${gstack.status}]`);
  for (const host of SELECTED_HOSTS) {
    const entry = gstack.hosts[host];
    const versionBits = entry.version ? ` v${entry.version}` : "";
    const updateBits = entry.update_status && entry.update_status !== "not-checked" ? `, ${entry.update_status}` : "";
    console.log(`  - ${entry.label}: ${entry.present ? "present" : "missing"}${versionBits}${updateBits}`);
  }
  console.log(`  - Team mode: ${gstack.repo_team_mode.status} (${gstack.repo_team_mode.reason})`);
  console.log(`  - Impact: complex=${gstack.impact.complex_tasks}`);
  console.log(`  - Install: ${gstack.install_command}`);
  console.log(`  - Upgrade: ${gstack.upgrade_command}`);
  console.log("");

  const waza = result.tools.waza;
  console.log(`Waza [${waza.status}]`);
  console.log(`  - Source lock: ${waza.source_lock_file || "not found"}`);
  console.log(`  - Primary: ${waza.primary_host} (${waza.codex_primary_path})`);
  console.log(`  - Staging: ${waza.staging_cache_path}`);
  console.log(`  - Skills CLI: ${waza.skills_cli_status}`);
  for (const host of SELECTED_HOSTS) {
    const entry = waza.hosts[host];
    const versionBits = Object.entries(entry.versions)
      .map(([name, version]) => `${name}@${version || "unknown"}`)
      .join(", ");
    console.log(`  - ${entry.label}: ${entry.status}, ${entry.installed_skills.length}/${waza.managed_skills.length} skills, sync=${entry.staging_sync}, stale=${entry.stale_status}`);
    if (versionBits) {
      console.log(`    versions: ${versionBits}`);
    }
    if (entry.missing_skills.length) {
      console.log(`    missing: ${entry.missing_skills.join(", ")}`);
    }
    if (entry.drift_skills.length) {
      console.log(`    drift: ${entry.drift_skills.join(", ")}`);
    }
    if (entry.stale_skills.length) {
      console.log(`    stale: ${entry.stale_skills.join(", ")}`);
    }
  }
  console.log(`  - Updates: ${waza.update_status} (${waza.update_reason})`);
  console.log(`  - Impact: simple=${waza.impact.simple_tasks}`);
  console.log(`  - Install: ${waza.install_command}`);
  console.log(`  - Stage: ${waza.stage_command}`);
  console.log(`  - Sync Codex: ${waza.sync_command}`);
  console.log(`  - Verify: ${waza.verify_command}`);
  console.log("");

  const gbrain = result.tools.gbrain;
  console.log(`gbrain [${gbrain.status}]`);
  console.log(`  - CLI: ${gbrain.cli_present ? `present${gbrain.version ? ` (v${gbrain.version})` : ""}` : "missing"}`);
  if (gbrain.doctor?.status) {
    console.log(`  - Doctor: ${gbrain.doctor.status} (score ${gbrain.doctor.health_score ?? "n/a"})`);
  }
  for (const host of SELECTED_HOSTS) {
    const entry = gbrain.mcp_hosts[host];
    console.log(`  - ${entry.label} MCP: ${entry.status}`);
  }
  if (gbrain.integrations_available) {
    console.log(`  - Integrations available: ${gbrain.integrations_available}`);
  }
  console.log(`  - Updates: ${gbrain.update_status} (${gbrain.update_reason})`);
  console.log(`  - Impact: knowledge=${gbrain.impact.knowledge_tasks}`);
  console.log(`  - Install: ${gbrain.install_command}`);
  console.log(`  - Upgrade: ${gbrain.upgrade_command}`);
  console.log(`  - Manual sync: ${gbrain.sync_command}`);
}

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printText(report);
}
NODE_EOF
