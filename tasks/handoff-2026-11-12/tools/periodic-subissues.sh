#!/bin/bash
# Open sub-issues of each batch parent (read-only).
for p in "$@"; do
  echo "== #$p open: $(gh api "repos/aimpact-inc/repo-harness/issues/$p/sub_issues?per_page=100" --jq '[.[] | select(.state=="open") | "#\(.number)"] | join(" ")')"
done
