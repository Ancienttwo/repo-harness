#!/bin/bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[task-sync] Not a git repository; skipping task-sync check."
  exit 0
fi

get_changed_files() {
  if ! git diff --cached --quiet --ignore-submodules --; then
    git diff --cached --name-only --diff-filter=ACMR
    return
  fi

  git diff --name-only --diff-filter=ACMR
  git ls-files --others --exclude-standard
}

changed_files=()
while IFS= read -r line; do
  [[ -n "$line" ]] && changed_files+=("$line")
done < <(get_changed_files)

if [[ "${#changed_files[@]}" -eq 0 ]]; then
  echo "[task-sync] No changes detected."
  exit 0
fi

has_non_task_change=0
has_task_sync_change=0

for file in "${changed_files[@]}"; do
  case "$file" in
    tasks/archive/*)
      has_non_task_change=1
      ;;
    tasks/*)
      has_task_sync_change=1
      ;;
    docs/researches/*)
      has_task_sync_change=1
      ;;
    *)
      has_non_task_change=1
      ;;
  esac
done

if [[ "$has_non_task_change" -eq 0 ]]; then
  if [[ "$has_task_sync_change" -eq 1 ]]; then
    echo "[task-sync] Only task/research sync files changed."
  else
    echo "[task-sync] No substantive repo changes detected."
  fi
  exit 0
fi

if [[ "$has_task_sync_change" -eq 1 ]]; then
  echo "[task-sync] Repo changes include synchronized tasks/ updates."
  exit 0
fi

echo "[task-sync] Substantive repo changes detected without tasks/ synchronization."
echo "[task-sync] Update tasks/current.md, tasks/todos.md, tasks/lessons.md, docs/researches/*.md, tasks/notes/*.md, or an active tasks/contracts/*.md file."
exit 1
