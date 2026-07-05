#!/bin/bash
set -euo pipefail

if command -v node >/dev/null 2>&1; then
  RUNTIME_BIN="$(command -v node)"
elif command -v bun >/dev/null 2>&1; then
  RUNTIME_BIN="$(command -v bun)"
elif [[ -x "${HOME}/.bun/bin/bun" ]]; then
  RUNTIME_BIN="${HOME}/.bun/bin/bun"
else
  echo "install-agent-fleet.sh requires node or bun" >&2
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

// Only (opus, max) and (sonnet, max) are recognized. Any other model or a
// non-"max" effort is a fail-closed error -- the generator never guesses a mapping.
const MODEL_EFFORT_MAP = {
  opus: { max: { model: "gpt-5.5", effort: "xhigh" } },
  sonnet: { max: { model: "gpt-5.5", effort: "medium" } },
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

function parseFrontmatter(raw) {
  const lines = raw.split("\n");
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

  const fields = {};
  for (const line of frontmatterLines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!match) continue;
    fields[match[1]] = match[2];
  }

  return {
    name: fields.name,
    description: fields.description,
    model: fields.model,
    effort: fields.effort,
    hasTools: Object.hasOwn(fields, "tools"),
    body: bodyLines.join("\n"),
  };
}

function validateFrontmatter(parsed) {
  if (!parsed) {
    return { ok: false, reason: "missing or malformed frontmatter delimiters" };
  }
  if (!parsed.name || !parsed.description || !parsed.model || !parsed.effort) {
    return { ok: false, reason: "missing required frontmatter field (name/description/model/effort)" };
  }
  const modelMap = MODEL_EFFORT_MAP[parsed.model];
  const mapped = modelMap ? modelMap[parsed.effort] : undefined;
  if (!mapped) {
    return { ok: false, reason: `unmapped model/effort combination: ${parsed.model}/${parsed.effort}` };
  }
  return { ok: true, mapped };
}

function tomlBasicString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function generateToml(parsed, mapped) {
  const lines = [];
  lines.push(`name = ${tomlBasicString(parsed.name)}`);
  lines.push(`description = ${tomlBasicString(parsed.description)}`);
  lines.push(`model = ${tomlBasicString(mapped.model)}`);
  lines.push(`model_reasoning_effort = ${tomlBasicString(mapped.effort)}`);
  if (parsed.hasTools) {
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

let anyProcessed = false;
let anyTargetAlreadyPresent = false;
const results = [];

for (const agent of MANAGED_AGENTS) {
  const claudeTarget = path.join(CLAUDE_TARGET_DIR, `${agent}.md`);
  const codexTarget = path.join(CODEX_TARGET_DIR, `${agent}.toml`);
  if (fs.existsSync(claudeTarget) || fs.existsSync(codexTarget)) {
    anyTargetAlreadyPresent = true;
  }

  const source = fetchSource(agent);
  if (!source.ok) {
    results.push({ host: "claude", file: `${agent}.md`, status: "fetch-failed" });
    results.push({ host: "codex", file: `${agent}.toml`, status: "fetch-failed" });
    continue;
  }

  const parsed = parseFrontmatter(source.text);
  const validation = validateFrontmatter(parsed);
  if (!validation.ok) {
    results.push({ host: "claude", file: `${agent}.md`, status: "invalid" });
    results.push({ host: "codex", file: `${agent}.toml`, status: "invalid" });
    continue;
  }

  const claudeStatus = compareAndWrite(claudeTarget, source.text);
  results.push({ host: "claude", file: `${agent}.md`, status: claudeStatus });

  const tomlContent = generateToml(parsed, validation.mapped);
  const codexStatus = compareAndWrite(codexTarget, tomlContent);
  results.push({ host: "codex", file: `${agent}.toml`, status: codexStatus });

  anyProcessed = true;
}

for (const entry of results) {
  console.log(`[fleet] ${entry.host}/${entry.file}: ${entry.status}`);
}

const totalFailure = !anyProcessed && !anyTargetAlreadyPresent;
process.exit(totalFailure ? 1 : 0);
NODE_EOF
