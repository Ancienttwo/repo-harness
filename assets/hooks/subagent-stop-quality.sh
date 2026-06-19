#!/bin/bash
# Subagent Stop Quality Gate - SubagentStop.quality
# Continues a subagent only when its final report is clearly incomplete.

set -euo pipefail

[[ "${HOOK_HOST:-}" == "codex" ]] || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

hook_read_stdin_once
input="$HOOK_STDIN_JSON"
[[ -n "$input" ]] || exit 0
command -v bun >/dev/null 2>&1 || exit 0

JSON_INPUT="$input" REPO_ROOT="${HOOK_REPO_ROOT:-$(pwd)}" bun -e '
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");

  function firstString(input, keys) {
    for (const key of keys) {
      const value = input?.[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return "";
  }

  let input;
  try {
    input = JSON.parse(process.env.JSON_INPUT || "");
  } catch {
    process.exit(0);
  }

  if (input.stop_hook_active === true || input.subagent_stop_hook_active === true) {
    process.exit(0);
  }

  const message = firstString(input, [
    "final_message",
    "last_assistant_message",
    "subagent_result",
    "result",
    "response",
    "output",
    "message",
    "assistant_message",
  ]);
  if (!message) process.exit(0);

  const trimmed = message.trim();
  const tooThin = trimmed.length < 120;
  const looksLikeBareApproval = /^(looks good|lgtm|ok|done|no issues|all good)[.!\s]*$/i.test(trimmed);
  const mentionsUnresolvedError = /\b(error|failed|failure|blocked|exception|timeout)\b/i.test(trimmed) &&
    !/\b(risk|uncertain|recommend|next|because|原因|风险|建议|不确定)\b/i.test(trimmed);
  const hasEvidence = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+|\.(ts|tsx|js|jsx|sh|md|json|toml)\b|\b(symbols?|files?|evidence|tests?|commands?)\b|文件|证据|测试|命令)/i.test(trimmed);

  let reason = "";
  if (looksLikeBareApproval || tooThin) {
    reason = "The subagent final report is too thin for repo-harness delegation.";
  } else if (mentionsUnresolvedError) {
    reason = "The subagent reported an unresolved error without a risk or parent-action recommendation.";
  } else if (!hasEvidence && /\b(review|explore|investigate|audit|map)\b/i.test(trimmed)) {
    reason = "The subagent report lacks file, symbol, command, or evidence references.";
  }
  if (!reason) process.exit(0);

  const repoRoot = process.env.REPO_ROOT || process.cwd();
  const stateDir = path.join(repoRoot, ".ai", "harness", "delegation");
  fs.mkdirSync(stateDir, { recursive: true });
  const statePath = path.join(stateDir, "subagent-stop-quality.json");
  const hash = crypto.createHash("sha1").update(trimmed).digest("hex");
  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (state.last_blocked_hash === hash) process.exit(0);
  } catch {
    // First quality block for this result.
  }
  fs.writeFileSync(statePath, `${JSON.stringify({
    version: 1,
    last_blocked_hash: hash,
    updated_at: new Date().toISOString(),
  }, null, 2)}\n`);

  process.stdout.write(`${JSON.stringify({
    decision: "block",
    reason: `[SubagentQualityGate] ${reason} Continue the subagent once and return a complete final response with: files and symbols inspected, evidence, risks or uncertainty, tests or commands run when relevant, and recommended parent action. Do not claim overall task completion.`,
  })}\n`);
'
