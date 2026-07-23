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

helper_source="$0"
if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
      && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "$0")" ]]; then
  helper_source="$REPO_HARNESS_HELPER_SOURCE_PATH"
fi
helper_dir="$(cd "$(dirname "$helper_source")" && pwd)"
case "$helper_dir" in
  */assets/templates/helpers)
    package_root="$(cd "$helper_dir/../../.." && pwd)"
    ;;
  */scripts)
    package_root="$(cd "$helper_dir/.." && pwd)"
    ;;
  *)
    echo "install-agent-fleet.sh cannot resolve repo-harness package root from helper path: $helper_source" >&2
    exit 1
    ;;
esac
AGENT_FLEET_SOURCE_DIR="$package_root/agents/fleet"
if [[ ! -d "$AGENT_FLEET_SOURCE_DIR" ]]; then
  echo "install-agent-fleet.sh missing packaged agent fleet source: $AGENT_FLEET_SOURCE_DIR" >&2
  exit 1
fi
export REPO_HARNESS_AGENT_FLEET_SOURCE_DIR="$AGENT_FLEET_SOURCE_DIR"

exec "$RUNTIME_BIN" - "$@" <<'NODE_EOF'
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const argv = process.argv.slice(2);
let force = false;
let acceptUserManaged = false;

function usage() {
  console.log("Usage: scripts/install-agent-fleet.sh [--force|--accept-user-managed]");
}

for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--force") {
    force = true;
    continue;
  }
  if (arg === "--accept-user-managed") {
    acceptUserManaged = true;
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
if (force && acceptUserManaged) {
  console.error("--force and --accept-user-managed are mutually exclusive");
  usage();
  process.exit(1);
}

const HOME = os.homedir();
const MANAGED_AGENTS = ["explorer", "deep-reasoner", "fast-worker", "gatekeeper", "root-cause-prover", "harness-evaluator"];
const WRITABLE_AGENTS = new Set(["fast-worker", "root-cause-prover", "harness-evaluator"]);
const CLAUDE_TARGET_DIR = path.join(HOME, ".claude", "agents");
const CODEX_TARGET_DIR = path.join(HOME, ".codex", "agents");
const USER_MANAGED_RECEIPT_PATH = path.join(HOME, ".repo-harness", "agent-fleet-user-managed.json");
const SOURCE_DIR = process.env.REPO_HARNESS_AGENT_FLEET_SOURCE_DIR;

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

// Provider-native source tuples project deterministically to Codex-native labels.
// Validation remains fail-closed; reasoning effort is carried through unchanged.
const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

function buildFamilyEffortMap(sourceLabel, targetModel, targetLabel) {
  const map = {};
  for (const effort of EFFORT_LEVELS) {
    map[effort] = {
      model: targetModel,
      effort,
      sourceDescription: `${sourceLabel} at ${effort} effort`,
      targetDescription: `${targetLabel} at ${effort} reasoning`,
    };
  }
  return map;
}

const MODEL_EFFORT_MAP = {
  opus: buildFamilyEffortMap("Opus", "gpt-5.6-sol", "GPT-5.6 Sol"),
  sonnet: buildFamilyEffortMap("Sonnet", "gpt-5.6-luna", "GPT-5.6 Luna"),
  haiku: buildFamilyEffortMap("Haiku", "gpt-5.6-luna", "GPT-5.6 Luna"),
  fable: buildFamilyEffortMap("Fable", "gpt-5.6-sol", "GPT-5.6 Sol"),
};

function readSource(agent) {
  try {
    const text = fs.readFileSync(path.join(SOURCE_DIR, `${agent}.md`), "utf8");
    if (!text) return { ok: false, text: "" };
    return { ok: true, text };
  } catch (_error) {
    return { ok: false, text: "" };
  }
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
  if (WRITABLE_AGENTS.has(agent)) {
    lines.push(`sandbox_mode = "workspace-write"`);
  } else {
    lines.push(`sandbox_mode = "read-only"`);
  }
  const developerInstructions = `${parsed.body}\n\n${EXECUTION_BOUNDARY}`;
  lines.push(`developer_instructions = '''${developerInstructions}'''`);
  return `${lines.join("\n")}\n`;
}

function sha256(content) {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

function readRegularFile(targetPath) {
  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink() || !stat.isFile()) return { ok: false, text: "" };
    return { ok: true, text: fs.readFileSync(targetPath, "utf8") };
  } catch (_error) {
    return { ok: false, text: "" };
  }
}

function validateUserManagedClaude(agent, content) {
  const parsed = parseFrontmatter(content);
  const model = parseRoleNameScalar(parsed?.model);
  const effort = parseRoleNameScalar(parsed?.effort);
  return Boolean(
    parsed
    && parsed.name === agent
    && parsed.description
    && model
    && effort
    && EFFORT_LEVELS.includes(effort)
    && parsed.body.trim(),
  );
}

function validateUserManagedCodex(agent, content) {
  try {
    const parsed = Bun.TOML.parse(content);
    if (parsed.name !== undefined && parsed.name !== agent) return false;
    if (typeof parsed.model !== "string" || !parsed.model.trim()) return false;
    if (
      typeof parsed.model_reasoning_effort !== "string"
      || !EFFORT_LEVELS.includes(parsed.model_reasoning_effort)
    ) return false;
    if (typeof parsed.developer_instructions !== "string" || !parsed.developer_instructions.trim()) return false;
    if (
      parsed.sandbox_mode !== undefined
      && parsed.sandbox_mode !== "read-only"
      && parsed.sandbox_mode !== "workspace-write"
    ) return false;
    return true;
  } catch (_error) {
    return false;
  }
}

function loadUserManagedReceipt(allowedPaths) {
  if (!fs.existsSync(USER_MANAGED_RECEIPT_PATH)) return { ok: true, hashes: new Map() };
  try {
    const parsed = JSON.parse(fs.readFileSync(USER_MANAGED_RECEIPT_PATH, "utf8"));
    if (
      parsed?.protocol !== 1
      || parsed?.authority !== "user-managed-agent-fleet"
      || !Array.isArray(parsed.files)
    ) return { ok: false, hashes: new Map() };
    const hashes = new Map();
    for (const entry of parsed.files) {
      if (
        !entry
        || typeof entry.path !== "string"
        || !allowedPaths.has(entry.path)
        || typeof entry.sha256 !== "string"
        || !/^sha256:[a-f0-9]{64}$/.test(entry.sha256)
        || hashes.has(entry.path)
      ) return { ok: false, hashes: new Map() };
      hashes.set(entry.path, entry.sha256);
    }
    return { ok: true, hashes };
  } catch (_error) {
    return { ok: false, hashes: new Map() };
  }
}

function writeUserManagedReceipt(files) {
  fs.mkdirSync(path.dirname(USER_MANAGED_RECEIPT_PATH), { recursive: true });
  const receipt = {
    protocol: 1,
    authority: "user-managed-agent-fleet",
    accepted_at: new Date().toISOString(),
    files,
  };
  const temp = `${USER_MANAGED_RECEIPT_PATH}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, USER_MANAGED_RECEIPT_PATH);
}

function compareAndWrite(targetPath, content, acceptedHash) {
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

  if (acceptedHash === sha256(existing)) return "user-managed";

  return "drift";
}

const results = [];
const prepared = [];

for (const agent of MANAGED_AGENTS) {
  const source = readSource(agent);
  if (!source.ok) {
    results.push({ host: "claude", file: `${agent}.md`, status: "source-missing" });
    results.push({ host: "codex", file: `${agent}.toml`, status: "source-missing" });
    continue;
  }

  const parsed = parseFrontmatter(source.text);
  const validation = validateFrontmatter(parsed, agent);
  if (!validation.ok) {
    results.push({ host: "claude", file: `${agent}.md`, status: "source-invalid" });
    results.push({ host: "codex", file: `${agent}.toml`, status: "source-invalid" });
    continue;
  }

  prepared.push({ agent, source: source.text, parsed, mapped: validation.mapped });
}

if (prepared.length !== MANAGED_AGENTS.length) {
  for (const entry of results) console.log(`[fleet] ${entry.host}/${entry.file}: ${entry.status}`);
  process.exit(1);
}

const targets = prepared.flatMap(({ agent, source, parsed, mapped }) => {
  const tomlContent = generateToml(agent, parsed, mapped);
  Bun.TOML.parse(tomlContent);
  return [
    {
      agent,
      host: "claude",
      file: `${agent}.md`,
      path: path.join(CLAUDE_TARGET_DIR, `${agent}.md`),
      content: source,
    },
    {
      agent,
      host: "codex",
      file: `${agent}.toml`,
      path: path.join(CODEX_TARGET_DIR, `${agent}.toml`),
      content: tomlContent,
    },
  ];
});
const allowedTargetPaths = new Set(targets.map((target) => target.path));

if (acceptUserManaged) {
  const acceptedFiles = [];
  let invalid = false;
  for (const target of targets) {
    const existing = readRegularFile(target.path);
    if (!existing.ok) {
      results.push({ host: target.host, file: target.file, status: "user-managed-invalid" });
      invalid = true;
      continue;
    }
    if (existing.text === target.content) {
      results.push({ host: target.host, file: target.file, status: "up-to-date" });
      continue;
    }
    const valid = target.host === "claude"
      ? validateUserManagedClaude(target.agent, existing.text)
      : validateUserManagedCodex(target.agent, existing.text);
    if (!valid) {
      results.push({ host: target.host, file: target.file, status: "user-managed-invalid" });
      invalid = true;
      continue;
    }
    acceptedFiles.push({ path: target.path, sha256: sha256(existing.text) });
    results.push({ host: target.host, file: target.file, status: "user-managed" });
  }
  for (const entry of results) console.log(`[fleet] ${entry.host}/${entry.file}: ${entry.status}`);
  if (invalid) process.exit(1);
  writeUserManagedReceipt(acceptedFiles);
  console.log(`[fleet] user-managed receipt: accepted ${acceptedFiles.length} files`);
  process.exit(0);
}

const receipt = force
  ? { ok: true, hashes: new Map() }
  : loadUserManagedReceipt(allowedTargetPaths);
if (!receipt.ok) {
  console.log("[fleet] user-managed receipt: invalid");
  process.exit(1);
}

for (const target of targets) {
  const status = compareAndWrite(target.path, target.content, receipt.hashes.get(target.path));
  results.push({ host: target.host, file: target.file, status });
}

if (force && fs.existsSync(USER_MANAGED_RECEIPT_PATH)) {
  fs.rmSync(USER_MANAGED_RECEIPT_PATH, { force: true });
}

for (const entry of results) {
  console.log(`[fleet] ${entry.host}/${entry.file}: ${entry.status}`);
}

process.exit(results.some((entry) => entry.status === "drift") ? 1 : 0);
NODE_EOF
