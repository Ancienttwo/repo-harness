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

if [[ -f "scripts/prepare-handoff.sh" ]]; then
  bash scripts/prepare-handoff.sh "$reason"
fi

if command -v bun >/dev/null 2>&1 && [[ -f "scripts/context-budget.ts" ]]; then
  bun scripts/context-budget.ts --format json --cwd "$repo" --write-status >/dev/null 2>&1 || true
fi

resume_args=(scripts/codex-handoff-resume.sh --cwd "$repo" --reason "$reason")
if [[ "$print_prompt" -eq 1 ]]; then
  resume_args+=(--print-prompt)
fi

resume_output=""
if [[ -f "scripts/codex-handoff-resume.sh" ]]; then
  resume_output="$(bash "${resume_args[@]}")"
fi

codex_home="${CODEX_HOME:-$HOME/.codex}"
global_dir="$codex_home/handoffs"
global_file="$global_dir/handoff-$(date '+%y%m%d').md"
repo_handoff=".ai/harness/handoff/current.md"
resume_file=".ai/harness/handoff/resume.md"
budget_file=".ai/harness/context-budget/latest.json"

mkdir -p "$global_dir"

repo_key="$(printf '%s' "$repo" | shasum | awk '{print substr($1, 1, 12)}')"

python3 - "$global_file" "$repo" "$repo_key" "$reason" "$repo_handoff" "$resume_file" "$budget_file" <<'PY_EOF'
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
budget_file = Path(sys.argv[7])

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
        f"- context_budget: `{budget_file}`",
        "",
        "### Context Budget",
        "",
        "```json",
        read_text(budget_file, 4000).strip(),
        "```",
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

if [[ -n "$resume_output" ]]; then
  printf '%s\n' "$resume_output"
fi
