#!/bin/bash
set -euo pipefail
while [[ $# -gt 0 ]]; do
  case "$1" in
    --validate-waivers-only) echo '[task-sync] waiver admission was removed; historical records grant no permission.'; exit 0 ;;
    --help|-h) echo 'Usage: check-task-sync (read-only diff observation)'; exit 0 ;;
    *) echo "[task-sync] unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then echo '[task-sync] repository unavailable; no synchronization fact claimed.'; exit 0; fi
base="${REPO_HARNESS_DIFF_BASE:-HEAD}"
if ! base="$(git rev-parse --verify "$base^{commit}" 2>/dev/null)"; then echo '[task-sync] diff base unavailable; observation incomplete.'; exit 0; fi
case "${REPO_HARNESS_DIFF_MODE:-direct}" in
  direct) ;;
  merge-base) if ! base="$(git merge-base HEAD "$base")"; then echo '[task-sync] common base unavailable; observation incomplete.'; exit 0; fi ;;
  *) echo '[task-sync] invalid diff mode; observation incomplete.'; exit 0 ;;
esac
printf '[task-sync] observed diff base=%s head=%s\n' "$base" "$(git rev-parse HEAD)"
# -z plus %q preserve names without treating filenames as shell syntax.
while IFS= read -r -d '' file; do printf '[task-sync] changed: %q\n' "$file"; done < <(git diff --name-only -z "$base" --)
while IFS= read -r -d '' file; do printf '[task-sync] staged: %q\n' "$file"; done < <(git diff --cached --name-only -z --)
while IFS= read -r -d '' file; do printf '[task-sync] untracked: %q\n' "$file"; done < <(git ls-files --others --exclude-standard -z)
echo '[task-sync] Record goal/change/verification/risk/rollback in the PR; no plan, contract, review, notes, digest line, or waiver is required.'
exit 0
