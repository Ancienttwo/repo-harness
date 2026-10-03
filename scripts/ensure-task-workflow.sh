#!/bin/bash
set -euo pipefail
# Preparing ordinary work creates runtime recovery space, not approval artifacts.
[[ "$#" -eq 0 ]] || { echo 'Usage: repo-harness run ensure-task-workflow (no plan/contract projection)' >&2; exit 2; }
repo="${REPO_HARNESS_TARGET_REPO_ROOT:-$(git rev-parse --show-toplevel)}"
cd "$repo"
for path in .ai .ai/harness .ai/harness/handoff .ai/harness/checks .ai/harness/runs; do
  [[ ! -L "$path" ]] || { echo "Unsafe runtime directory: $path" >&2; exit 1; }
  mkdir -p "$path"
done
printf '%s\n' '[workflow] use Goal/Scope/Verify/Rollback in the delegation brief or PR description; no plan/contract/review/notes, workstream or automatic architecture block was created'
