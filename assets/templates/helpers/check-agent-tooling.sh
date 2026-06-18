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
let strictReadiness = false;
let hostMode = "both";

function usage() {
  console.log(`Usage: scripts/check-agent-tooling.sh [--json] [--check-updates] [--strict-readiness] [--host claude|codex|both]`);
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
  if (arg === "--strict-readiness") {
    strictReadiness = true;
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
const WAZA_MANAGED_SKILLS = ["think", "hunt", "check", "health"];
const WAZA_SHARED_RULES = ["anti-patterns.md", "chinese.md", "durable-context.md", "english.md"];
const CODEX_AUTOMATION_SKILLS = ["health", "check", "mermaid"];
const CODEGRAPH_PACKAGE = "@colbymchenry/codegraph";
const CODEGRAPH_GLOBAL_INSTALL_COMMAND = `bun add -g ${CODEGRAPH_PACKAGE} && repo-harness tools configure codegraph --target codex --location global`;
const GBRAIN_INSTALL_COMMAND = "bun install -g github:garrytan/gbrain";
const GBRAIN_INSTALL_NOTE =
  "Install from GitHub; npm registry package gbrain is an unrelated GPU library and does not ship this CLI.";
const CODEGRAPH_MCP_CONFIGURE_COMMAND = "repo-harness tools configure codegraph --target <codex|claude|both> --location global";
const CODEGRAPH_LOCAL_INSTALL_COMMAND = "bun install";
const CODEGRAPH_ENSURE_COMMAND = [
  ".ai/harness/scripts/ensure-codegraph.sh",
  "scripts/ensure-codegraph.sh",
].find((relPath) => fs.existsSync(path.join(REPO_ROOT, relPath)));
const CODEGRAPH_ENSURE_BASH_COMMAND = CODEGRAPH_ENSURE_COMMAND
  ? `bash ${CODEGRAPH_ENSURE_COMMAND}`
  : null;
const WAZA_STAGING_ROOT = path.join(HOME, ".agents");
const WAZA_STAGING_DIR = path.join(WAZA_STAGING_ROOT, "skills");
const WAZA_STAGING_RULES_DIR = path.join(WAZA_STAGING_ROOT, "rules");
let timeoutBin;
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

function fileIsExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

function detectTimeoutBin() {
  if (timeoutBin !== undefined) return timeoutBin;
  timeoutBin = resolvePathCommand("timeout") || "";
  return timeoutBin;
}

function commandCapability(command, requiredFor, owner, required = false) {
  const binPath = resolvePathCommand(command);
  return {
    name: command,
    status: binPath ? "present" : "missing",
    path: binPath,
    owner,
    required,
    required_for: requiredFor,
  };
}

function detectSymlinkCapability() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-harness-symlink-check-"));
  const source = path.join(tmpDir, "source");
  const link = path.join(tmpDir, "link");
  try {
    fs.writeFileSync(source, "ok\n");
    fs.symlinkSync(source, link);
    return {
      name: "symlink",
      status: "supported",
      path: null,
      owner: "platform-filesystem",
      required: false,
      required_for: "installed-copy link mode and host skill aliasing; copy mode remains the fallback",
    };
  } catch (error) {
    return {
      name: "symlink",
      status: "unsupported",
      path: null,
      owner: "platform-filesystem",
      required: false,
      required_for: "installed-copy link mode and host skill aliasing; copy mode remains the fallback",
      reason: String(error?.message || error),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function run(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 0;
  const externalTimeout = timeoutMs > 0 ? detectTimeoutBin() : "";
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const spawnCommand = externalTimeout || command;
  const spawnArgs = externalTimeout ? ["--kill-after=1s", `${timeoutSeconds}s`, command, ...args] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    timeout: externalTimeout ? timeoutMs + 1000 : timeoutMs,
  });

  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error.message || result.error) : "",
    timed_out: result.error?.code === "ETIMEDOUT" || result.status === 124,
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

function sha1Buffer(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
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

function readFileHash(filePath) {
  try {
    return {
      exists: true,
      hash: sha1Buffer(fs.readFileSync(filePath)),
    };
  } catch (_error) {
    return {
      exists: false,
      hash: null,
    };
  }
}

function collectDirectoryHashes(dirPath) {
  try {
    if (!fs.statSync(dirPath).isDirectory()) return null;
  } catch (_error) {
    return null;
  }

  const files = {};
  function visit(currentDir, relativeDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_error) {
      return;
    }
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      let stat;
      try {
        stat = fs.statSync(absolutePath);
      } catch (_error) {
        continue;
      }
      if (stat.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (stat.isFile()) {
        files[relativePath] = sha1Buffer(fs.readFileSync(absolutePath));
      }
    }
  }

  visit(dirPath, "");
  return files;
}

function compareFileMaps(localFiles, referenceFiles) {
  const missing = [];
  const extra = [];
  const changed = [];
  const localKeys = new Set(Object.keys(localFiles || {}));
  const referenceKeys = new Set(Object.keys(referenceFiles || {}));

  for (const key of [...referenceKeys].sort()) {
    if (!localKeys.has(key)) {
      missing.push(key);
    } else if (localFiles[key] !== referenceFiles[key]) {
      changed.push(key);
    }
  }

  for (const key of [...localKeys].sort()) {
    if (!referenceKeys.has(key)) {
      extra.push(key);
    }
  }

  return { missing, extra, changed };
}

function inspectDirectorySync(localDir, stagingDir) {
  const localFiles = collectDirectoryHashes(localDir);
  const stagingFiles = collectDirectoryHashes(stagingDir);

  if (!localFiles && !stagingFiles) {
    return {
      status: "unknown",
      missing_files: [],
      extra_files: [],
      changed_files: [],
    };
  }

  if (!localFiles && stagingFiles) {
    return {
      status: "missing-local",
      missing_files: Object.keys(stagingFiles).sort(),
      extra_files: [],
      changed_files: [],
    };
  }

  if (localFiles && !stagingFiles) {
    return {
      status: "unknown",
      missing_files: [],
      extra_files: [],
      changed_files: [],
    };
  }

  const diff = compareFileMaps(localFiles, stagingFiles);
  const clean = diff.missing.length === 0 && diff.extra.length === 0 && diff.changed.length === 0;
  return {
    status: clean ? "synced" : "drift",
    missing_files: diff.missing,
    extra_files: diff.extra,
    changed_files: diff.changed,
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
    reason: "No repo-local gstack team-mode traces detected in CLAUDE.md or the shared .ai/hooks/ layer.",
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
      rules: {},
    };
  }

  const skills = {};
  const rules = {};
  const failures = [];

  for (const skill of WAZA_MANAGED_SKILLS) {
    const url = `${WAZA_RAW_BASE_URL}/skills/${skill}/SKILL.md`;
    const result = run("curl", ["-fsSL", "--max-time", "5", url], { timeoutMs: 7000 });
    if (!result.ok || !result.stdout) {
      failures.push(`skills/${skill}/SKILL.md`);
      continue;
    }

    skills[skill] = {
      version: parseSkillVersion(result.stdout),
      hash: sha1(result.stdout),
      source_url: url,
    };
  }

  for (const rule of WAZA_SHARED_RULES) {
    const url = `${WAZA_RAW_BASE_URL}/rules/${rule}`;
    const result = run("curl", ["-fsSL", "--max-time", "5", url], { timeoutMs: 7000 });
    if (!result.ok || !result.stdout) {
      failures.push(`rules/${rule}`);
      continue;
    }

    rules[rule] = {
      hash: sha1(result.stdout),
      source_url: url,
    };
  }

  if (failures.length > 0) {
    return {
      status: "unknown",
      reason: `Unable to fetch upstream Waza files for: ${failures.join(", ")}.`,
      skills,
      rules,
    };
  }

  return {
    status: "fetched",
    reason: "Fetched upstream Waza SKILL.md and shared rule files from GitHub raw URLs.",
    skills,
    rules,
  };
}

function hostUsesStagingSkillSymlinks(host) {
  const meta = HOSTS[host];
  const presentSkillDirs = WAZA_MANAGED_SKILLS
    .map((skill) => path.join(meta.skillsDir, skill))
    .filter((skillDir) => fs.existsSync(skillDir));

  if (presentSkillDirs.length === 0) return false;

  const stagingRealPath = resolveRealPath(WAZA_STAGING_DIR) || WAZA_STAGING_DIR;
  return presentSkillDirs.every((skillDir) => {
    const realPath = resolveRealPath(skillDir);
    return realPath
      ? realPath.startsWith(`${WAZA_STAGING_DIR}${path.sep}`) || realPath.startsWith(`${stagingRealPath}${path.sep}`)
      : false;
  });
}

function resolveWazaRulePath(host, rule) {
  const meta = HOSTS[host];
  const hostRulesPath = path.join(path.dirname(meta.skillsDir), "rules", rule);
  if (fs.existsSync(hostRulesPath)) return hostRulesPath;
  if (hostUsesStagingSkillSymlinks(host)) {
    return path.join(WAZA_STAGING_RULES_DIR, rule);
  }
  return hostRulesPath;
}

function inspectWazaSharedRule(host, rule, upstreamRules) {
  const localFile = resolveWazaRulePath(host, rule);
  const stagingFile = path.join(WAZA_STAGING_RULES_DIR, rule);
  const local = readFileHash(localFile);
  const staging = readFileHash(stagingFile);
  const upstream = upstreamRules[rule] || null;

  return {
    name: rule,
    path: localFile,
    real_path: resolveRealPath(localFile),
    present: local.exists,
    hash: local.hash,
    staging_present: staging.exists,
    staging_hash: staging.hash,
    staging_sync: local.exists && staging.exists
      ? (local.hash === staging.hash ? "synced" : "drift")
      : staging.exists
        ? "missing-local"
        : "unknown",
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

function inspectWazaSkill(host, skill, skillLock, skillItems, upstreamSkills) {
  const meta = HOSTS[host];
  const skillDir = path.join(meta.skillsDir, skill);
  const skillFile = path.join(skillDir, "SKILL.md");
  const stagingFile = path.join(WAZA_STAGING_DIR, skill, "SKILL.md");
  const stagingDir = path.join(WAZA_STAGING_DIR, skill);
  const local = readSkillFile(skillFile);
  const staging = readSkillFile(stagingFile);
  const directorySync = inspectDirectorySync(skillDir, stagingDir);
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
    staging_sync: directorySync.status,
    staging_missing_files: directorySync.missing_files,
    staging_extra_files: directorySync.extra_files,
    staging_changed_files: directorySync.changed_files,
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
    const sharedRules = WAZA_SHARED_RULES.map((rule) => inspectWazaSharedRule(host, rule, upstream.rules));
    const installedSkills = skills.filter((entry) => entry.present).map((entry) => entry.name);
    const missingSkills = skills.filter((entry) => !entry.present).map((entry) => entry.name);
    const driftSkills = skills.filter((entry) => entry.staging_sync === "drift").map((entry) => entry.name);
    const unsyncedSkills = skills
      .filter((entry) => entry.staging_sync === "drift" || entry.staging_sync === "missing-local")
      .map((entry) => entry.name);
    const staleSkills = skills.filter((entry) => entry.stale_status === "stale").map((entry) => entry.name);
    const installedSharedRules = sharedRules.filter((entry) => entry.present).map((entry) => entry.name);
    const missingSharedRules = sharedRules.filter((entry) => !entry.present).map((entry) => entry.name);
    const driftSharedRules = sharedRules.filter((entry) => entry.staging_sync === "drift").map((entry) => entry.name);
    const unsyncedSharedRules = sharedRules
      .filter((entry) => entry.staging_sync === "drift" || entry.staging_sync === "missing-local")
      .map((entry) => entry.name);
    const staleSharedRules = sharedRules
      .filter((entry) => entry.stale_status === "stale" || entry.stale_status === "missing-local")
      .map((entry) => entry.name);
    const status = missingSkills.length === 0 ? "present" : installedSkills.length > 0 ? "partial" : "missing";
    const stagingSync = status === "missing"
      ? "missing"
      : unsyncedSkills.length > 0 || unsyncedSharedRules.length > 0
        ? "drift"
        : skills.every((entry) => entry.staging_sync === "synced") && sharedRules.every((entry) => entry.staging_sync === "synced")
          ? "synced"
          : "unknown";
    const staleStatus = !checkUpdates
      ? "not-checked"
      : staleSkills.length > 0 || staleSharedRules.length > 0
        ? "stale"
        : skills.every((entry) => entry.stale_status === "up-to-date") && sharedRules.every((entry) => entry.stale_status === "up-to-date")
          ? "up-to-date"
          : "unknown";
    const sharedRulesStagingSync = unsyncedSharedRules.length > 0
      ? "drift"
      : sharedRules.every((entry) => entry.staging_sync === "synced")
        ? "synced"
        : "unknown";
    const sharedRulesStaleStatus = !checkUpdates
      ? "not-checked"
      : staleSharedRules.length > 0
        ? "stale"
        : sharedRules.every((entry) => entry.stale_status === "up-to-date")
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
      shared_rules: installedSharedRules,
      missing_shared_rules: missingSharedRules,
      drift_shared_rules: driftSharedRules,
      stale_shared_rules: staleSharedRules,
      shared_rules_staging_sync: sharedRulesStagingSync,
      shared_rules_stale_status: sharedRulesStaleStatus,
      versions: Object.fromEntries(skills.filter((entry) => entry.present).map((entry) => [entry.name, entry.version])),
      staging_sync: stagingSync,
      stale_status: staleStatus,
      skills,
      shared_rule_details: sharedRules,
      reason: status === "present"
        ? `Detected all ${WAZA_MANAGED_SKILLS.length} Waza skills for ${HOSTS[host].label} from the real host skill path.`
        : status === "partial"
          ? `Detected ${installedSkills.length}/${WAZA_MANAGED_SKILLS.length} Waza skills for ${HOSTS[host].label}; missing ${missingSkills.join(", ")}.`
          : `No Waza skills detected at ${HOSTS[host].skillsDir}.`,
    };
  }

  const staleSkillSet = new Set();
  const staleRuleSet = new Set();
  for (const host of Object.values(hostStatuses)) {
    for (const skill of host.stale_skills) staleSkillSet.add(skill);
    for (const rule of host.stale_shared_rules) staleRuleSet.add(rule);
  }
  const updateStatus = !checkUpdates
    ? "not-checked"
    : upstream.status === "unknown"
      ? "unknown"
      : staleSkillSet.size > 0 || staleRuleSet.size > 0
        ? "update-available"
        : "up-to-date";
  const updateReason = !checkUpdates
    ? "Update checks were skipped."
    : upstream.status === "unknown"
      ? upstream.reason
      : staleSkillSet.size > 0 || staleRuleSet.size > 0
        ? `Upstream Waza files differ for: ${[
            ...[...staleSkillSet].sort().map((skill) => `skills/${skill}/SKILL.md`),
            ...[...staleRuleSet].sort().map((rule) => `rules/${rule}`),
          ].join(", ")}.`
        : "Local Waza SKILL.md and shared rule files match upstream GitHub raw content.";

  const status = summarizeWazaStatus(hostStatuses);
  const installCommand = `npx -y skills add tw93/Waza -g -a ${
    hostMode === "both" ? "claude-code codex" : hostMode === "claude" ? "claude-code" : "codex"
  } -s think hunt check health -y`;
  const rulesList = WAZA_SHARED_RULES.join(" ");
  const syncCommand = `for d in ${WAZA_MANAGED_SKILLS.join(" ")}; do rsync -a --delete ~/.agents/skills/$d/ ~/.codex/skills/$d/; done; mkdir -p ~/.codex/rules; for f in ${rulesList}; do cp ~/.agents/rules/$f ~/.codex/rules/$f; done`;

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
    shared_rules: WAZA_SHARED_RULES,
    primary_host: "codex",
    codex_primary_path: path.join(HOME, ".codex", "skills"),
    staging_cache_path: WAZA_STAGING_DIR,
    staging_rules_path: WAZA_STAGING_RULES_DIR,
    sync_mode: "codex-first-copy-from-staging",
    host_drift_policy: "report-per-host-directory-rule-staging-and-upstream-drift",
    skills_cli_status: skillsResult.ok ? "available" : skillsResult.timed_out ? "timed-out" : "unavailable",
    source_lock_entries: wazaEntries.map(([name]) => name).sort(),
    upstream_status: upstream.status,
    upstream_reason: upstream.reason,
    upstream_skills: upstream.skills,
    upstream_rules: upstream.rules,
    hosts: hostStatuses,
    update_status: updateStatus,
    update_reason: updateReason,
    install_command: installCommand,
    stage_command: "npx -y skills update",
    sync_command: syncCommand,
    verify_command: `for d in ${WAZA_MANAGED_SKILLS.join(" ")}; do diff -qr ~/.agents/skills/$d ~/.codex/skills/$d; done; for f in ${rulesList}; do cmp -s ~/.agents/rules/$f ~/.codex/rules/$f; done`,
    upgrade_command: `npx -y skills update && ${syncCommand}`,
    impact: {
      complex_tasks: "unaffected",
      simple_tasks: status === "present" ? "full" : status === "partial" ? "degraded" : "missing",
      knowledge_tasks: "unaffected",
    },
  };
}

function detectRuntimeCapabilities(waza) {
  return {
    bun: commandCapability(
      "bun",
      "repo-harness-owned global installs, local package dependency install, and test/runtime execution",
      "repo-harness",
      true
    ),
    npm: commandCapability(
      "npm",
      "npm registry readbacks, publish gates, and opt-in update checks; not used for repo-harness-owned global install repair",
      "npm-registry",
      false
    ),
    npx: commandCapability(
      "npx",
      "external Skills CLI bootstrap/update commands for Waza and Mermaid",
      "external-skills-cli",
      false
    ),
    skills_cli: {
      name: "skills_cli",
      status: waza.skills_cli_status === "available" ? "available" : waza.skills_cli_status,
      path: null,
      owner: "external-skills-cli",
      required: false,
      required_for: "Waza/Mermaid external skill bootstrap; repo-harness reports this as an explicit exception boundary",
      command: "npx -y skills ls -g --json",
    },
    bash: commandCapability(
      "bash",
      "repo-harness helper scripts, migration, setup checks, and contract verification wrappers",
      "repo-harness",
      true
    ),
    rsync: commandCapability(
      "rsync",
      "Waza staging-to-Codex sync and installed-copy runtime mirroring",
      "platform-filesystem",
      false
    ),
    symlink: detectSymlinkCapability(),
  };
}

function inspectCodexAutomationSkill(skill) {
  const skillFile = path.join(HOSTS.codex.skillsDir, skill, "SKILL.md");
  const local = readSkillFile(skillFile);

  return {
    name: skill,
    path: skillFile,
    real_path: resolveRealPath(skillFile),
    present: local.exists,
    version: local.version,
    hash: local.hash,
  };
}

function detectCodexAutomationProfile() {
  const skills = CODEX_AUTOMATION_SKILLS.map((skill) => inspectCodexAutomationSkill(skill));
  const installedSkills = skills.filter((entry) => entry.present).map((entry) => entry.name);
  const missingSkills = skills.filter((entry) => !entry.present).map((entry) => entry.name);
  const status = missingSkills.length === 0 ? "present" : installedSkills.length > 0 ? "partial" : "missing";

  return {
    name: "codex_automation_profile",
    status,
    reason: status === "present"
      ? "Detected all required Codex automation skills from the Codex runtime path."
      : status === "partial"
        ? `Detected ${installedSkills.length}/${CODEX_AUTOMATION_SKILLS.length} required Codex automation skills; missing ${missingSkills.join(", ")}.`
        : "No required Codex automation skills were found in the Codex runtime path.",
    required_skills: CODEX_AUTOMATION_SKILLS,
    optional_skills: [],
    mode: "codex-runtime-reference",
    source: HOSTS.codex.skillsDir,
    routes: {
      workflow_health: "waza:health",
      review_gate: "waza:check",
      architecture_diagram: "mermaid",
    },
    vendoring_policy: "do-not-vendor-skill-body",
    installed_skills: installedSkills,
    missing_skills: missingSkills,
    skills,
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

function isGbrainFastOnlyConnectionSkip(doctorJson) {
  if (!doctorJson || doctorJson.status !== "warnings") return false;
  if (!Array.isArray(doctorJson.checks)) return false;
  const warnings = doctorJson.checks.filter((entry) => entry?.status === "warn" || entry?.status === "warning");
  if (warnings.length !== 1) return false;
  const warning = warnings[0];
  const message = String(warning.message || "");
  return warning.name === "connection"
    && (/Skipping DB checks \((--fast mode|"--fast mode)/i.test(message) || /fast mode skipped DB checks/i.test(message));
}

function detectGbrain() {
  const gbrainBin = resolvePathCommand("gbrain");
  let versionResult = gbrainBin
    ? run(gbrainBin, ["--version"], { timeoutMs: 1000 })
    : { ok: false, stdout: "", timed_out: false };
  if (!versionResult.ok && versionResult.timed_out) {
    versionResult = run(gbrainBin, ["--version"], { timeoutMs: 1000 });
  }
  const present = versionResult.ok;
  const version = present ? versionResult.stdout.trim().replace(/^gbrain\s+/i, "") : null;
  let doctorCommand = ["doctor", "--json", "--fast"];
  let doctorResult = present ? run(gbrainBin, doctorCommand, { timeoutMs: 1500 }) : null;
  let doctorJson = doctorResult?.ok ? parseJson(doctorResult.stdout) : null;
  if (present && !doctorJson) {
    doctorCommand = ["doctor", "--json"];
    doctorResult = run(gbrainBin, doctorCommand, { timeoutMs: 1500 });
    doctorJson = doctorResult?.ok ? parseJson(doctorResult.stdout) : null;
  }
  const checkUpdateResult = present && checkUpdates ? run(gbrainBin, ["check-update", "--json"], { timeoutMs: 1500 }) : null;
  const checkUpdateJson = checkUpdateResult?.ok ? parseJson(checkUpdateResult.stdout) : null;
  const integrationsResult = present ? run(gbrainBin, ["integrations", "list", "--json"], { timeoutMs: 1500 }) : null;
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
  const acceptedFastWarning = doctorCommand.join(" ") === "doctor --json --fast" && isGbrainFastOnlyConnectionSkip(doctorJson);
  const status = !present
    ? "missing"
    : (doctorJson?.status === "ok" || acceptedFastWarning ? "present" : doctorJson?.status === "warnings" ? "warning" : "warning");
  const updateStatus = !checkUpdates
    ? "not-checked"
    : checkUpdateJson?.update_available
      ? "update-available"
      : checkUpdateJson
        ? "up-to-date"
        : "unknown";

  return {
    name: "gbrain",
    required: false,
    status,
    reason: !present
      ? "gbrain CLI is not installed; install the official GitHub package, not npm registry package gbrain."
      : acceptedFastWarning
        ? "gbrain CLI is present; fast doctor only skipped DB checks."
      : doctorJson
        ? `gbrain CLI is present; doctor status is ${doctorJson.status}.`
        : "gbrain CLI is present, but doctor output could not be parsed.",
    cli_present: present,
    version,
    doctor_command: present ? `gbrain ${doctorCommand.join(" ")}` : null,
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
    install_command: GBRAIN_INSTALL_COMMAND,
    install_note: GBRAIN_INSTALL_NOTE,
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

function detectCodeGraphMcp(host) {
  const meta = HOSTS[host];
  const content = readText(meta.configPath);
  function claudeEntryResult(entry, source) {
    if (!entry || typeof entry !== "object") return null;
    if (entry.alwaysLoad === true) {
      return {
        status: "configured",
        always_load: true,
        tool_search: "always-load",
        reason: `${source} contains a codegraph MCP server entry with alwaysLoad=true.`,
      };
    }
    return {
      status: "deferred",
      always_load: false,
      tool_search: "deferred",
      reason: `${source} contains a codegraph MCP server entry, but alwaysLoad is not true; Claude Code MCP Tool Search may defer CodeGraph tools.`,
    };
  }
  function claudeTextFallback(source, sourcePath) {
    return {
      status: "deferred",
      always_load: false,
      tool_search: "unknown",
      reason: `${source} contains a codegraph MCP server entry at ${sourcePath}, but alwaysLoad could not be verified.`,
    };
  }

  if (!content) {
    if (host === "claude") {
      const claudeRootConfig = path.join(HOME, ".claude.json");
      const rootJson = readJson(claudeRootConfig);
      const rootEntry = claudeEntryResult(rootJson?.mcpServers?.codegraph, `Claude root config at ${claudeRootConfig}`);
      if (rootEntry) return rootEntry;
      const rootContent = readText(claudeRootConfig);
      if (/codegraph/i.test(rootContent)) {
        return claudeTextFallback("Claude root config", claudeRootConfig);
      }
    }

    return {
      status: "missing",
      reason: `No ${meta.label} config found at ${meta.configPath}.`,
    };
  }

  if (host === "codex") {
    if (/\[mcp_servers\.codegraph\]/.test(content)) {
      return {
        status: "configured",
        reason: "Codex config contains a codegraph MCP server entry.",
      };
    }

    return {
      status: "missing",
      reason: "Codex config does not contain a codegraph MCP server entry.",
    };
  }

  const settingsJson = readJson(meta.configPath);
  const settingsEntry = claudeEntryResult(settingsJson?.mcpServers?.codegraph, `Claude settings at ${meta.configPath}`);
  if (settingsEntry) return settingsEntry;
  if (/"mcpServers"\s*:\s*{[\s\S]*"codegraph"/i.test(content)) {
    return claudeTextFallback("Claude settings", meta.configPath);
  }

  const claudeRootConfig = path.join(HOME, ".claude.json");
  const rootJson = readJson(claudeRootConfig);
  const rootEntry = claudeEntryResult(rootJson?.mcpServers?.codegraph, `Claude root config at ${claudeRootConfig}`);
  if (rootEntry) return rootEntry;
  const rootContent = readText(claudeRootConfig);
  if (/"mcpServers"\s*:\s*{[\s\S]*"codegraph"/i.test(rootContent)) {
    return claudeTextFallback("Claude root config", claudeRootConfig);
  }

  return {
    status: "missing",
    reason: "Claude config does not contain a codegraph MCP server entry.",
  };
}

function parseCodeGraphProjectStatus(output) {
  if (/Not initialized/i.test(output)) return "not-initialized";
  if (/Index is up to date/i.test(output)) return "up-to-date";
  if (/Pending Changes/i.test(output) || /Run "codegraph sync/i.test(output)) return "stale";
  if (/CodeGraph Status/i.test(output)) return "unknown";
  return "unavailable";
}

function resolvePathCommand(command) {
  const pathValue = process.env.PATH || "";
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    if (fileIsExecutable(candidate)) return candidate;
  }
  return null;
}

function codeGraphPackageDeclared() {
  const pkg = readJson(path.join(REPO_ROOT, "package.json"));
  if (!pkg || typeof pkg !== "object") return false;
  return Boolean(
    pkg.devDependencies?.[CODEGRAPH_PACKAGE] ||
      pkg.dependencies?.[CODEGRAPH_PACKAGE] ||
      pkg.optionalDependencies?.[CODEGRAPH_PACKAGE]
  );
}

function codeGraphPlatformPackageName() {
  return `${CODEGRAPH_PACKAGE}-${process.platform}-${process.arch}`;
}

function codeGraphPlatformBundleBin() {
  if (process.platform === "win32") return null;
  return path.join(REPO_ROOT, "node_modules", codeGraphPlatformPackageName(), "bin", "codegraph");
}

function resolveCodeGraphBinary() {
  const allowRepoLocal = process.env.AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL !== "0";
  const allowGlobal = process.env.AGENTIC_DEV_CODEGRAPH_ALLOW_GLOBAL !== "0";
  const localCandidates = [];
  const localOverride = process.env.AGENTIC_DEV_CODEGRAPH_LOCAL_BIN;
  const globalOverride = process.env.AGENTIC_DEV_CODEGRAPH_GLOBAL_BIN;

  if (localOverride) localCandidates.push(localOverride);
  if (allowRepoLocal) {
    localCandidates.push(codeGraphPlatformBundleBin());
    localCandidates.push(path.join(REPO_ROOT, "node_modules", ".bin", "codegraph"));
  }

  let localBinPath = null;
  for (const candidate of localCandidates) {
    if (candidate && fileIsExecutable(candidate)) {
      localBinPath = candidate;
      break;
    }
  }

  let globalBinPath = null;
  if (allowGlobal) {
    if (globalOverride && fileIsExecutable(globalOverride)) {
      globalBinPath = globalOverride;
    } else if (!globalOverride) {
      globalBinPath = resolvePathCommand("codegraph");
    }
  }

  if (localBinPath) {
    return {
      source: "local",
      bin_path: localBinPath,
      local_bin_path: localBinPath,
      global_bin_path: globalBinPath,
      global_fallback_used: false,
    };
  }

  if (globalBinPath) {
    return {
      source: "global",
      bin_path: globalBinPath,
      local_bin_path: null,
      global_bin_path: globalBinPath,
      global_fallback_used: true,
    };
  }

  return {
    source: "missing",
    bin_path: null,
    local_bin_path: null,
    global_bin_path: null,
    global_fallback_used: false,
  };
}

function codeGraphVersion(binPath) {
  if (!binPath) return null;
  const result = run(binPath, ["--version"], { timeoutMs: 1000 });
  if (result.ok) return result.stdout.trim() || null;
  if (result.timed_out) {
    const retry = run(binPath, ["--version"], { timeoutMs: 1000 });
    if (retry.ok) return retry.stdout.trim() || null;
  }
  return null;
}

function detectCodeGraph() {
  const resolution = resolveCodeGraphBinary();
  const cliPresent = Boolean(resolution.bin_path);
  const version = codeGraphVersion(resolution.bin_path);
  const globalVersion = resolution.global_bin_path && resolution.global_bin_path !== resolution.bin_path
    ? codeGraphVersion(resolution.global_bin_path)
    : resolution.source === "global"
      ? version
      : null;
  const localVersion = resolution.source === "local" ? version : null;
  const packageDeclared = codeGraphPackageDeclared();
  const mcpHosts = {};

  for (const host of SELECTED_HOSTS) {
    mcpHosts[host] = {
      label: HOSTS[host].label,
      ...detectCodeGraphMcp(host),
    };
  }

  const selectedMcpConfigured = SELECTED_HOSTS.every((host) => mcpHosts[host]?.status === "configured");
  const statusResult = cliPresent ? run(resolution.bin_path, ["status", "."], { timeoutMs: 1500 }) : null;
  const statusOutput = `${statusResult?.stdout || ""}\n${statusResult?.stderr || ""}`;
  const projectIndexStatus = cliPresent ? parseCodeGraphProjectStatus(statusOutput) : "unavailable";
  const indexInitialized = fs.existsSync(path.join(REPO_ROOT, ".codegraph"))
    || ["up-to-date", "stale", "unknown"].includes(projectIndexStatus);
  const updateResult = cliPresent && checkUpdates
    ? run("npm", ["view", CODEGRAPH_PACKAGE, "version", "--json"], { timeoutMs: 3000 })
    : null;
  const latestVersion = updateResult?.ok ? (parseJson(updateResult.stdout) || updateResult.stdout.trim().replace(/^"|"$/g, "")) : null;
  const updateStatus = !checkUpdates
    ? "not-checked"
    : latestVersion && version
      ? (String(latestVersion) === String(version) ? "up-to-date" : "update-available")
      : "unknown";
  const localDependencyMissing = packageDeclared && resolution.source === "global";
  const status = !cliPresent
    ? "missing"
    : localDependencyMissing || !selectedMcpConfigured || projectIndexStatus === "not-initialized" || projectIndexStatus === "unavailable"
      ? "partial"
      : projectIndexStatus === "stale" || projectIndexStatus === "unknown"
        ? "warning"
        : "present";

  return {
    name: "codegraph",
    status,
    reason: !cliPresent
      ? "CodeGraph CLI is not installed."
      : localDependencyMissing
        ? "CodeGraph global fallback is present, but this repo declares a local dev dependency that is not installed."
      : !selectedMcpConfigured
        ? "CodeGraph CLI is present, but one or more selected host MCP configs are missing or deferred."
        : projectIndexStatus === "not-initialized"
          ? "CodeGraph CLI and MCP are present, but this repo has not been indexed."
          : projectIndexStatus === "unavailable"
            ? "CodeGraph CLI and MCP are present, but project index status could not be read."
          : projectIndexStatus === "stale"
            ? "CodeGraph is configured, but this repo index has pending changes."
            : projectIndexStatus === "unknown"
              ? "CodeGraph is configured, but this repo index status is unknown."
            : "CodeGraph CLI, selected host MCP config, and project index are ready.",
    package: CODEGRAPH_PACKAGE,
    primary_host: "codex",
    cli_present: cliPresent,
    source: resolution.source,
    bin_path: resolution.bin_path,
    local_bin_path: resolution.local_bin_path,
    global_bin_path: resolution.global_bin_path,
    global_fallback_used: resolution.global_fallback_used,
    version,
    local_version: localVersion,
    global_version: globalVersion,
    dependency_declared: packageDeclared,
    drift: localVersion && globalVersion && localVersion !== globalVersion
      ? { local: localVersion, global: globalVersion, using: resolution.source }
      : null,
    latest_version: latestVersion,
    update_status: updateStatus,
    update_reason: !checkUpdates
      ? "Update checks were skipped."
      : updateResult?.timed_out
        ? "CodeGraph npm version check timed out."
        : latestVersion && version
          ? (String(latestVersion) === String(version) ? "Local CodeGraph matches npm latest." : "npm reports a newer CodeGraph version.")
          : "CodeGraph update status is unknown.",
    mcp_hosts: mcpHosts,
    project_index: {
      status: projectIndexStatus,
      initialized: indexInitialized,
      path: path.join(REPO_ROOT, ".codegraph"),
      command: "codegraph status .",
    },
    install_command: packageDeclared ? CODEGRAPH_LOCAL_INSTALL_COMMAND : CODEGRAPH_GLOBAL_INSTALL_COMMAND,
    ensure_command: packageDeclared ? CODEGRAPH_ENSURE_BASH_COMMAND : null,
    mcp_install_command: CODEGRAPH_MCP_CONFIGURE_COMMAND,
    init_command: packageDeclared && CODEGRAPH_ENSURE_BASH_COMMAND ? `${CODEGRAPH_ENSURE_BASH_COMMAND} --init` : "codegraph init -i .",
    sync_command: packageDeclared && CODEGRAPH_ENSURE_BASH_COMMAND ? `${CODEGRAPH_ENSURE_BASH_COMMAND} --sync` : "codegraph sync .",
    upgrade_command: packageDeclared && CODEGRAPH_ENSURE_BASH_COMMAND ? `bun update @colbymchenry/codegraph && ${CODEGRAPH_ENSURE_BASH_COMMAND} --sync` : `bun add -g ${CODEGRAPH_PACKAGE}@latest && codegraph sync .`,
    uninstall_command: "codegraph uninstall --target codex --location global --yes",
    readiness: {
      required_for: "codex-agent-code-navigation",
      hook_policy: "do-not-block-hooks",
      user_setup: "one-terminal-command-or-authorized-agent-action",
    },
    impact: {
      code_navigation: status === "present" ? "full" : status === "warning" ? "stale-index" : "missing",
      hook_correctness: "unaffected",
    },
  };
}

const wazaReport = detectWaza();
const report = {
  generated_at: new Date().toISOString(),
  repo_root: REPO_ROOT,
  hosts: SELECTED_HOSTS,
  check_updates: checkUpdates,
  runtime_capabilities: detectRuntimeCapabilities(wazaReport),
  tools: {
    gstack: detectGstack(),
    waza: wazaReport,
    codex_automation_profile: detectCodexAutomationProfile(),
    gbrain: detectGbrain(),
    codegraph: detectCodeGraph(),
  },
};

const strictFailures = [];
if (strictReadiness && ["missing", "partial"].includes(report.tools.codegraph.status)) {
  strictFailures.push(`CodeGraph readiness is ${report.tools.codegraph.status}: ${report.tools.codegraph.reason}`);
}

function printText(result) {
  console.log("External Tooling Report");
  console.log(`Hosts: ${result.hosts.join(", ")}`);
  console.log("");

  console.log("Runtime capabilities");
  for (const capability of Object.values(result.runtime_capabilities || {})) {
    const required = capability.required ? "required" : "optional";
    const pathBits = capability.path ? ` at ${capability.path}` : "";
    console.log(`  - ${capability.name}: ${capability.status} (${required})${pathBits}`);
    console.log(`    owner=${capability.owner}; required_for=${capability.required_for}`);
  }
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
    console.log(`    shared rules: ${entry.shared_rules.length}/${waza.shared_rules.length}, sync=${entry.shared_rules_staging_sync}, stale=${entry.shared_rules_stale_status}`);
    if (entry.missing_skills.length) {
      console.log(`    missing: ${entry.missing_skills.join(", ")}`);
    }
    if (entry.drift_skills.length) {
      console.log(`    drift: ${entry.drift_skills.join(", ")}`);
    }
    if (entry.stale_skills.length) {
      console.log(`    stale: ${entry.stale_skills.join(", ")}`);
    }
    if (entry.missing_shared_rules.length) {
      console.log(`    missing shared rules: ${entry.missing_shared_rules.join(", ")}`);
    }
    if (entry.drift_shared_rules.length) {
      console.log(`    drift shared rules: ${entry.drift_shared_rules.join(", ")}`);
    }
    if (entry.stale_shared_rules.length) {
      console.log(`    stale shared rules: ${entry.stale_shared_rules.join(", ")}`);
    }
  }
  console.log(`  - Updates: ${waza.update_status} (${waza.update_reason})`);
  console.log(`  - Impact: simple=${waza.impact.simple_tasks}`);
  console.log(`  - Install: ${waza.install_command}`);
  console.log(`  - Stage: ${waza.stage_command}`);
  console.log(`  - Sync Codex: ${waza.sync_command}`);
  console.log(`  - Verify: ${waza.verify_command}`);
  console.log("");

  const codexAutomation = result.tools.codex_automation_profile;
  console.log(`Codex automation profile [${codexAutomation.status}]`);
  console.log(`  - Required: ${codexAutomation.required_skills.join(", ")}`);
  console.log(`  - Source: ${codexAutomation.source}`);
  console.log(`  - Mode: ${codexAutomation.mode}`);
  if (codexAutomation.missing_skills.length) {
    console.log(`  - Missing: ${codexAutomation.missing_skills.join(", ")}`);
  }
  console.log(`  - Routes: health=${codexAutomation.routes.workflow_health}, check=${codexAutomation.routes.review_gate}, diagram=${codexAutomation.routes.architecture_diagram}`);
  console.log(`  - Vendoring: ${codexAutomation.vendoring_policy}`);
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
  console.log("");

  const codegraph = result.tools.codegraph;
  console.log(`CodeGraph [${codegraph.status}]`);
  console.log(`  - CLI: ${codegraph.cli_present ? `present${codegraph.version ? ` (v${codegraph.version})` : ""} via ${codegraph.source}` : "missing"}`);
  if (codegraph.drift) {
    console.log(`  - Drift: local=${codegraph.drift.local}, global=${codegraph.drift.global}, using=${codegraph.drift.using}`);
  }
  for (const host of SELECTED_HOSTS) {
    const entry = codegraph.mcp_hosts[host];
    const suffix = entry.tool_search ? ` (${entry.tool_search})` : "";
    console.log(`  - ${entry.label} MCP: ${entry.status}${suffix}`);
  }
  console.log(`  - Project index: ${codegraph.project_index.status}`);
  console.log(`  - Updates: ${codegraph.update_status} (${codegraph.update_reason})`);
  console.log(`  - Impact: code-navigation=${codegraph.impact.code_navigation}, hooks=${codegraph.impact.hook_correctness}`);
  console.log(`  - Install deps: ${codegraph.install_command}`);
  if (codegraph.ensure_command) {
    console.log(`  - Ensure: ${codegraph.ensure_command}`);
  }
  console.log(`  - Init index: ${codegraph.init_command}`);
  console.log(`  - Sync index: ${codegraph.sync_command}`);
}

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printText(report);
}

if (strictFailures.length > 0) {
  for (const failure of strictFailures) {
    console.error(`[readiness] ${failure}`);
  }
  process.exit(2);
}
NODE_EOF
