#!/bin/bash
# Read-only: the failed test lines of one workflow run. Argument: <run id>
cd "${REPO_HARNESS_CHECKOUT:-$HOME/Projects/repo-harness}" || exit 1
run="$1"
out="/tmp/repo-harness-advisor/probe/run-${run}.log"
gh run view "$run" --json name,headBranch,headSha,conclusion,event,createdAt --jq '"\(.name) | \(.event) | \(.headBranch) \(.headSha[0:9]) | \(.conclusion) | \(.createdAt)"'
gh run view "$run" --log-failed > "$out" 2>/dev/null
echo "log lines: $(wc -l < "$out")"
# Bun marks a failed case with "(fail)"; keep the case names and the first error lines.
grep -E '\(fail\)' "$out" | sed -E 's/^[^\t]*\t[^\t]*\t[0-9TZ:.-]+ //' | cut -c1-200 | sort -u | head -40
echo "--- error samples"
grep -E 'error:|ENOENT|EACCES|is not recognized|spawn|#!/' "$out" | sed -E 's/^[^\t]*\t[^\t]*\t[0-9TZ:.-]+ //' | cut -c1-220 | sort | uniq -c | sort -rn | head -12
