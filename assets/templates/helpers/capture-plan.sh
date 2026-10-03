#!/bin/bash
set -euo pipefail
# Explicit optional planning capture. Ordinary work is described in its PR.
usage() { echo 'Usage: repo-harness run capture-plan --slug <slug> [--title <title>] [--body-file <file>]'; }
slug='' title='' body_file=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug) slug="${2:?--slug requires a value}"; shift 2 ;;
    --title) title="${2:?--title requires a value}"; shift 2 ;;
    --body-file) body_file="${2:?--body-file requires a value}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unsupported capture argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
[[ "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo 'A safe non-empty --slug is required' >&2; exit 2; }
repo="${REPO_HARNESS_TARGET_REPO_ROOT:-$(git rev-parse --show-toplevel)}"
cd "$repo"
[[ ! -L plans ]] || { echo 'plans must not be a symlink' >&2; exit 1; }
mkdir -p plans
path="plans/${slug}.md"
[[ ! -e "$path" && ! -L "$path" ]] || { echo "Preserving existing plan: $path" >&2; exit 1; }
temporary="$(mktemp "plans/.${slug}.XXXXXX")"
trap 'rm -f -- "$temporary"' EXIT
[[ -z "$title" ]] || printf '# %s\n\n' "$title" > "$temporary"
if [[ -n "$body_file" ]]; then cat -- "$body_file" >> "$temporary"; else cat >> "$temporary"; fi
[[ -s "$temporary" ]] || { echo 'Planning body is empty' >&2; exit 1; }
# Link publication refuses a racing creator rather than overwriting user work.
ln "$temporary" "$path"
echo "[planning] captured optional reference: $path; no approval, contract, review or execution was created"
