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
const MANAGED_AGENTS = ["explorer", "deep-reasoner", "fast-worker", "gatekeeper", "root-cause-prover", "harness-evaluator"];
const WRITABLE_AGENTS = new Set(["fast-worker", "root-cause-prover", "harness-evaluator"]);
const CLAUDE_TARGET_DIR = path.join(HOME, ".claude", "agents");
const CODEX_TARGET_DIR = path.join(HOME, ".codex", "agents");
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

for (const { agent, source, parsed, mapped } of prepared) {
  const claudeTarget = path.join(CLAUDE_TARGET_DIR, `${agent}.md`);
  const codexTarget = path.join(CODEX_TARGET_DIR, `${agent}.toml`);
  const claudeStatus = compareAndWrite(claudeTarget, source);
  results.push({ host: "claude", file: `${agent}.md`, status: claudeStatus });

  const tomlContent = generateToml(agent, parsed, mapped);
  Bun.TOML.parse(tomlContent);
  const codexStatus = compareAndWrite(codexTarget, tomlContent);
  results.push({ host: "codex", file: `${agent}.toml`, status: codexStatus });
}

for (const entry of results) {
  console.log(`[fleet] ${entry.host}/${entry.file}: ${entry.status}`);
}

process.exit(results.some((entry) => entry.status === "drift") ? 1 : 0);
NODE_EOF
