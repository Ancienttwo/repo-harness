#!/bin/bash
set -euo pipefail

MIN_BUN_VERSION="1.1.35"

bun_version_is_supported() {
  local version="$1"
  [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+) ]] &&
    (( BASH_REMATCH[1] > 1 ||
      (BASH_REMATCH[1] == 1 && BASH_REMATCH[2] > 1) ||
      (BASH_REMATCH[1] == 1 && BASH_REMATCH[2] == 1 && BASH_REMATCH[3] >= 35) ))
}

RUNTIME_BIN=""
BUN_VERSION=""
PATH_BUN="$(command -v bun 2>/dev/null || true)"
for candidate in "$PATH_BUN" "${HOME}/.bun/bin/bun"; do
  [[ -n "$candidate" && -x "$candidate" ]] || continue
  candidate_version="$("$candidate" --version 2>/dev/null || true)"
  [[ -n "$BUN_VERSION" ]] || BUN_VERSION="$candidate_version"
  if bun_version_is_supported "$candidate_version"; then
    RUNTIME_BIN="$candidate"
    BUN_VERSION="$candidate_version"
    break
  fi
done

if [[ -z "$RUNTIME_BIN" && -z "$BUN_VERSION" ]]; then
  echo "install-agent-fleet.sh requires bun" >&2
  exit 1
fi
if [[ -z "$RUNTIME_BIN" ]]; then
  echo "install-agent-fleet.sh requires Bun >= ${MIN_BUN_VERSION} (found: ${BUN_VERSION:-unknown})" >&2
  exit 1
fi

exec "$RUNTIME_BIN" - "$@" <<'NODE_EOF'
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const argv = process.argv.slice(2);
let force = false;

function usage() {
  console.log("Usage: scripts/install-agent-fleet.sh [--force]");
}

for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--force") {
    force = true;
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

const HOME = os.homedir();
const MANAGED_AGENTS = ["deep-reasoner", "fast-worker", "gatekeeper"];
const RAW_BASE = "https://raw.githubusercontent.com/Ancienttwo/Fable-agents/main/assets";
const CLAUDE_TARGET_DIR = path.join(HOME, ".claude", "agents");
const CODEX_TARGET_DIR = path.join(HOME, ".codex", "agents");
const SOURCE_DIR_OVERRIDE = process.env.REPO_HARNESS_FLEET_SOURCE_DIR || "";

// Canonical anti-extras clause. Must stay byte-identical to the EXECUTION_BOUNDARY
// constant in scripts/contract-run.ts (tests/install-agent-fleet.test.ts asserts
// parity) so every generated Codex agent carries the same boundary as the Claude
// worker prompts, the MCP codex-goal path, and the Codex delegation advisor hook.
const EXECUTION_BOUNDARY = [
  "Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief. Treat absent requirements as forbidden design space, not as permission to improve.",
  "",
  "Do not add optional features, alternate UX, extra integrations, migration paths, compatibility behavior, fallback behavior, telemetry, broad cleanup, refactors, new abstractions, extra docs, or polish unless that work is explicitly listed under In scope or required by Exit Criteria.",
  "",
  "If you discover useful additional work, record it under Out of scope / Future work in the notes or review artifact. Do not implement it. Do not end with unsolicited offers to do more work.",
  "",
  "If the requested outcome cannot be completed without expanding scope, fail closed: stop, name the missing decision, and cite the exact file/section that blocks execution.",
].join("\n");

// Only (opus, max) and (sonnet, max) are recognized. Each mapping also owns the
// exact provider label rewritten in Codex metadata so the generated role never
// claims to run a different model. Any mismatch is a fail-closed error.
const MODEL_EFFORT_MAP = {
  opus: {
    max: {
      model: "gpt-5.6-sol",
      effort: "xhigh",
      sourceDescription: "Opus 4.8 at max effort",
      targetDescription: "GPT-5.6 Sol at extra high reasoning",
    },
  },
  sonnet: {
    max: {
      model: "gpt-5.6-luna",
      effort: "xhigh",
      sourceDescription: "Sonnet 5 at max effort",
      targetDescription: "GPT-5.6 Luna at extra high reasoning",
    },
  },
};

function fetchSource(agent) {
  if (SOURCE_DIR_OVERRIDE) {
    const localPath = path.join(SOURCE_DIR_OVERRIDE, `${agent}.md`);
    try {
      return { ok: true, text: fs.readFileSync(localPath, "utf8") };
    } catch (_error) {
      return { ok: false, text: "" };
    }
  }

  const url = `${RAW_BASE}/${agent}.md`;
  const result = spawnSync("curl", ["-fsSL", "--max-time", "10", url], { encoding: "utf8" });
  if (!result || result.status !== 0 || result.error || !result.stdout) {
    return { ok: false, text: "" };
  }
  return { ok: true, text: result.stdout };
}

function parseRoleNameScalar(rawValue) {
  if (typeof rawValue !== "string") return undefined;
  const match = rawValue.trim().match(/^(?:"([A-Za-z0-9_-]+)"|'([A-Za-z0-9_-]+)'|([A-Za-z0-9_-]+))(?:\s+#.*)?$/);
  return match?.[1] || match?.[2] || match?.[3];
}

function parseFrontmatter(raw) {
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") return null;

  let closeIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      closeIndex = index;
      break;
    }
  }
  if (closeIndex === -1) return null;

  const frontmatterLines = lines.slice(1, closeIndex);
  const bodyLines = lines.slice(closeIndex + 1);
  while (bodyLines.length > 0 && bodyLines[0].trim() === "") bodyLines.shift();
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === "") bodyLines.pop();

  const fieldLines = frontmatterLines.filter((line) => line.trim() && !line.trimStart().startsWith("#"));
  const firstField = fieldLines[0]?.match(/^( *)([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
  if (!firstField) return null;
  const rootIndent = firstField[1].length;
  const fields = {};
  for (const line of fieldLines) {
    const match = line.match(/^( *)([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!match || match[1].length !== rootIndent) return null;
    if (Object.hasOwn(fields, match[2])) return null;
    fields[match[2]] = match[3];
  }

  return {
    name: parseRoleNameScalar(fields.name),
    description: fields.description,
    model: fields.model,
    effort: fields.effort,
    hasTools: Object.hasOwn(fields, "tools"),
    body: bodyLines.join("\n"),
  };
}

function validateFrontmatter(parsed, expectedAgent) {
  if (!parsed) {
    return { ok: false, kind: "identity-invalid", reason: "missing or malformed frontmatter delimiters" };
  }
  if (parsed.name && parsed.name !== expectedAgent) {
    return {
      ok: false,
      kind: "identity-mismatch",
      reason: `frontmatter name does not match source role: ${parsed.name}/${expectedAgent}`,
    };
  }
  if (!parsed.name) {
    return { ok: false, kind: "identity-invalid", reason: "missing or malformed frontmatter name" };
  }
  if (!parsed.description || !parsed.model || !parsed.effort) {
    return { ok: false, reason: "missing required frontmatter field (name/description/model/effort)" };
  }
  const modelMap = MODEL_EFFORT_MAP[parsed.model];
  const mapped = modelMap ? modelMap[parsed.effort] : undefined;
  if (!mapped) {
    return { ok: false, reason: `unmapped model/effort combination: ${parsed.model}/${parsed.effort}` };
  }
  if (!parsed.description.includes(mapped.sourceDescription)) {
    return { ok: false, reason: `description missing expected model label: ${mapped.sourceDescription}` };
  }
  return { ok: true, mapped };
}

function tomlBasicString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function generateToml(agent, parsed, mapped) {
  const lines = [];
  const description = parsed.description.replace(mapped.sourceDescription, mapped.targetDescription);
  lines.push(`name = ${tomlBasicString(parsed.name)}`);
  lines.push(`description = ${tomlBasicString(description)}`);
  lines.push(`model = ${tomlBasicString(mapped.model)}`);
  lines.push(`model_reasoning_effort = ${tomlBasicString(mapped.effort)}`);
  if (agent === "fast-worker") {
    lines.push(`sandbox_mode = "workspace-write"`);
  } else if (parsed.hasTools) {
    lines.push(`sandbox_mode = "read-only"`);
  }
  const developerInstructions = `${parsed.body}\n\n${EXECUTION_BOUNDARY}`;
  lines.push(`developer_instructions = '''${developerInstructions}'''`);
  return `${lines.join("\n")}\n`;
}

function compareAndWrite(targetPath, content) {
  let existing = null;
  try {
    existing = fs.readFileSync(targetPath, "utf8");
  } catch (_error) {
    existing = null;
  }

  if (existing === content) return "up-to-date";

  if (existing === null) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content);
    return "installed";
  }

  if (force) {
    fs.writeFileSync(targetPath, content);
    return "installed";
  }

  return "drift";
}

function readTomlRootRoleName(content) {
  try {
    const parsed = Bun.TOML.parse(content);
    return typeof parsed.name === "string" && MANAGED_AGENTS.includes(parsed.name) ? parsed.name : undefined;
  } catch (_error) {
    return undefined;
  }
}

function readInstalledRoleName(targetPath, host) {
  let content;
  try {
    content = fs.readFileSync(targetPath, "utf8");
  } catch (_error) {
    return undefined;
  }
  if (host === "claude") {
    const parsedName = parseFrontmatter(content)?.name;
    return typeof parsedName === "string" && MANAGED_AGENTS.includes(parsedName) ? parsedName : undefined;
  }
  return readTomlRootRoleName(content);
}

function deactivateMismatchedTarget(targetPath, host, expectedAgent) {
  const installedRoleName = readInstalledRoleName(targetPath, host);
  if (!installedRoleName || installedRoleName === expectedAgent) return false;
  fs.rmSync(targetPath, { force: true });
  return true;
}

let anyProcessed = false;
let anyTargetAlreadyPresent = false;
let fleetFailure = false;
const results = [];

for (const agent of MANAGED_AGENTS) {
  const claudeTarget = path.join(CLAUDE_TARGET_DIR, `${agent}.md`);
  const codexTarget = path.join(CODEX_TARGET_DIR, `${agent}.toml`);
  if (fs.existsSync(claudeTarget) || fs.existsSync(codexTarget)) {
    anyTargetAlreadyPresent = true;
  }
  const claudeDeactivated = deactivateMismatchedTarget(claudeTarget, "claude", agent);
  const codexDeactivated = deactivateMismatchedTarget(codexTarget, "codex", agent);

  const source = fetchSource(agent);
  if (!source.ok) {
    const roleUnavailable = !fs.existsSync(claudeTarget) || !fs.existsSync(codexTarget);
    fleetFailure ||= roleUnavailable;
    results.push({
      host: "claude",
      file: `${agent}.md`,
      status: claudeDeactivated ? "deactivated-fetch-failed" : "fetch-failed",
    });
    results.push({
      host: "codex",
      file: `${agent}.toml`,
      status: codexDeactivated ? "deactivated-fetch-failed" : "fetch-failed",
    });
    continue;
  }

  const parsed = parseFrontmatter(source.text);
  const validation = validateFrontmatter(parsed, agent);
  if (!validation.ok) {
    const identityIssue = validation.kind === "identity-mismatch" || validation.kind === "identity-invalid";
    const roleUnavailable = !fs.existsSync(claudeTarget) || !fs.existsSync(codexTarget);
    fleetFailure ||= identityIssue || roleUnavailable;
    const claudeStatus = claudeDeactivated ? "deactivated-invalid" : "invalid";
    const codexStatus = codexDeactivated ? "deactivated-invalid" : "invalid";
    results.push({ host: "claude", file: `${agent}.md`, status: claudeStatus });
    results.push({ host: "codex", file: `${agent}.toml`, status: codexStatus });
    continue;
  }

  const claudeStatus = compareAndWrite(claudeTarget, source.text);
  results.push({ host: "claude", file: `${agent}.md`, status: claudeStatus });

  const tomlContent = generateToml(agent, parsed, validation.mapped);
  const codexStatus = compareAndWrite(codexTarget, tomlContent);
  results.push({ host: "codex", file: `${agent}.toml`, status: codexStatus });

  anyProcessed = true;
}

for (const entry of results) {
  console.log(`[fleet] ${entry.host}/${entry.file}: ${entry.status}`);
}

const totalFailure = !anyProcessed && !anyTargetAlreadyPresent;
process.exit(totalFailure || fleetFailure ? 1 : 0);
NODE_EOF
