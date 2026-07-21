#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/prepare-codex-handoff.sh [--reason <reason>] [--print-prompt]
USAGE_EOF
}

reason="manual"
print_prompt=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reason)
      reason="${2:-manual}"
      shift 2
      ;;
    --print-prompt)
      print_prompt=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo"
helper_source="$0"
if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
      && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "$0")" ]]; then
  helper_source="$REPO_HARNESS_HELPER_SOURCE_PATH"
fi
helper_dir="$(cd "$(dirname "$helper_source")" && pwd)"

if [[ -f "$helper_dir/prepare-handoff.sh" ]]; then
  REPO_HARNESS_SKIP_RESUME_REFRESH=1 bash "$helper_dir/prepare-handoff.sh" "$reason"
fi

resume_args=("$helper_dir/codex-handoff-resume.sh" --cwd "$repo" --reason "$reason")
if [[ "$print_prompt" -eq 1 ]]; then
  resume_args+=(--print-prompt)
fi

resume_output=""
if [[ -f "$helper_dir/codex-handoff-resume.sh" ]]; then
  resume_output="$(bash "${resume_args[@]}")"
fi

codex_home="${CODEX_HOME:-$HOME/.codex}"
global_dir="$codex_home/handoffs"
global_file="$global_dir/handoff-$(date '+%y%m%d').md"
repo_handoff=".ai/harness/handoff/current.md"
resume_file=".ai/harness/handoff/resume.md"

mkdir -p "$global_dir"

repo_key="$(printf '%s' "$repo" | shasum | awk '{print substr($1, 1, 12)}')"

if command -v node >/dev/null 2>&1; then
  node - "$global_file" "$repo" "$repo_key" "$reason" "$repo_handoff" "$resume_file" <<'JS_EOF'
const fs = require("fs");
const path = require("path");

const [, , globalFile, repo, repoKey, reason, repoHandoff, resumeFile] = process.argv;

fs.mkdirSync(path.dirname(globalFile), { recursive: true });
const start = `<!-- repo:${repoKey} start -->`;
const end = `<!-- repo:${repoKey} end -->`;

function pad(value) {
  return String(value).padStart(2, "0");
}

function yymmdd(date) {
  return `${String(date.getFullYear()).slice(-2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function timestamp(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function readText(filePath, limit = 12000) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return text.length <= limit ? text : `${text.slice(0, limit - 1)}...`;
  } catch {
    return "(missing)";
  }
}

const now = new Date();
const header = `# Codex Handoff ${yymmdd(now)}\n\nFilesystem-first fallback handoffs for compact-independent Codex sessions.\n\n`;
const section = [
  start,
  `## ${timestamp(now)} ${path.basename(repo)}`,
  "",
  `- cwd: \`${repo}\``,
  `- reason: \`${reason}\``,
  `- repo_handoff: \`${repoHandoff}\``,
  `- resume_packet: \`${resumeFile}\``,
  "",
  "### Repo Handoff",
  "",
  readText(path.join(repo, repoHandoff), 8000).trim(),
  "",
  "### Resume Packet",
  "",
  readText(path.join(repo, resumeFile), 8000).trim(),
  "",
  end,
  "",
].join("\n");

let content = fs.existsSync(globalFile) ? fs.readFileSync(globalFile, "utf8") : header;
if (content.includes(start) && content.includes(end)) {
  const [prefix, rest] = content.split(start, 2);
  const suffix = rest.split(end, 2)[1] ?? "";
  content = prefix + section + suffix.replace(/^\n+/, "");
} else {
  if (!content.endsWith("\n")) {
    content += "\n";
  }
  content += section;
}

fs.writeFileSync(globalFile, content, "utf8");
console.log(globalFile);
JS_EOF
else
  python3 - "$global_file" "$repo" "$repo_key" "$reason" "$repo_handoff" "$resume_file" <<'PY_EOF'
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

global_file = Path(sys.argv[1])
repo = Path(sys.argv[2])
repo_key = sys.argv[3]
reason = sys.argv[4]
repo_handoff = Path(sys.argv[5])
resume_file = Path(sys.argv[6])

global_file.parent.mkdir(parents=True, exist_ok=True)
start = f"<!-- repo:{repo_key} start -->"
end = f"<!-- repo:{repo_key} end -->"

def read_text(path: Path, limit: int = 12000) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return "(missing)"
    return text if len(text) <= limit else text[: limit - 1] + "..."

header = f"# Codex Handoff {datetime.now().strftime('%y%m%d')}\n\nFilesystem-first fallback handoffs for compact-independent Codex sessions.\n\n"
section = "\n".join(
    [
        start,
        f"## {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} {repo.name}",
        "",
        f"- cwd: `{repo}`",
        f"- reason: `{reason}`",
        f"- repo_handoff: `{repo_handoff}`",
        f"- resume_packet: `{resume_file}`",
        "",
        "### Repo Handoff",
        "",
        read_text(repo / repo_handoff, 8000).strip(),
        "",
        "### Resume Packet",
        "",
        read_text(repo / resume_file, 8000).strip(),
        "",
        end,
        "",
    ]
)

content = global_file.read_text(encoding="utf-8") if global_file.exists() else header
if start in content and end in content:
    prefix, rest = content.split(start, 1)
    _, suffix = rest.split(end, 1)
    content = prefix + section + suffix.lstrip("\n")
else:
    if not content.endswith("\n"):
        content += "\n"
    content += section

global_file.write_text(content, encoding="utf-8")
print(global_file)
PY_EOF
fi

if [[ -n "$resume_output" ]]; then
  printf '%s\n' "$resume_output"
fi
