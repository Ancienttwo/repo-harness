#!/bin/bash
# Read-only state for the periodic advisor review.
cd "${REPO_HARNESS_CHECKOUT:-$HOME/Projects/repo-harness}" || exit 1
echo "TIME $(date -u +%Y-%m-%dT%H:%M:%SZ) local $(date +%Y%m%d-%H%M)"
git fetch -q origin
echo "=== main"
git log --format='%h %cI %s' -10 origin/main | cut -c1-150
echo "=== rate limit"
gh api rate_limit --jq '.resources | "core \(.core.remaining) graphql \(.graphql.remaining)"'
echo "=== open PRs"
gh pr list --state open --json number,title,headRefName,headRefOid,mergeStateStatus,statusCheckRollup,labels,updatedAt \
  --jq '.[] | "\(.number) \(.mergeStateStatus) head=\(.headRefOid[0:9]) ci=\([.statusCheckRollup[] | select(.name=="Required / CI") | (.conclusion // .status)] | join(",")) labels=\([.labels[].name]|join(",")) \(.headRefName[0:44]) | \(.title[0:70])"'
echo "=== merge queue"
gh api graphql -f query='{repository(owner:"aimpact-inc",name:"repo-harness"){mergeQueue(branch:"main"){entries(first:10){nodes{position state pullRequest{number}}}}}}' \
  --jq '.data.repository.mergeQueue.entries.nodes[] | "\(.position) \(.state) #\(.pullRequest.number)"'
echo "=== merged since 16:36Z"
gh pr list --state merged --limit 30 --json number,title,mergedAt --jq '.[] | select(.mergedAt >= "2026-11-11T16:36:00Z") | "\(.number) \(.mergedAt) \(.title[0:80])"'
echo "=== closed unmerged since 16:36Z"
gh pr list --state closed --limit 20 --json number,title,closedAt,mergedAt --jq '.[] | select(.mergedAt == null and .closedAt >= "2026-11-11T16:36:00Z") | "\(.number) \(.closedAt) \(.title[0:80])"'
echo "=== seats"
hc ls --label repo-harness.repository=1186405141 | jq -r '.terminals[] | select(.address | contains("/") | not) | "\(.address) \(.agent) \(.status) \(.where | split(" / ")[1] // "") \(.cwd)"' > /tmp/repo-harness-advisor/probe/seats.txt
while read -r addr agent status tab cwd; do
  extra=""
  if [ -d "$cwd/.git" ] || [ -f "$cwd/.git" ]; then
    br=$(git -C "$cwd" branch --show-current 2>/dev/null)
    if [ -n "$br" ] && git -C "$cwd" rev-parse -q --verify "origin/$br" >/dev/null 2>&1; then
      extra="unpushed=$(git -C "$cwd" log --oneline "origin/$br..HEAD" 2>/dev/null | wc -l | tr -d ' ')"
    elif [ -n "$br" ]; then
      extra="no-remote-branch commits=$(git -C "$cwd" log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')"
    fi
    extra="$extra dirty=$(git -C "$cwd" status --short 2>/dev/null | wc -l | tr -d ' ')"
  fi
  echo "$addr $agent $status $tab $(basename "$cwd") $extra"
done < /tmp/repo-harness-advisor/probe/seats.txt
echo "=== attention watchers"
hc ls --all --label repo-harness.service=attention | jq -r '.terminals[] | "\(.address) \(.state) \(.status // "")"' | sort | uniq -c -f1 | head -12
echo "=== quota"
repo-harness quota 2>&1 | head -30 | cut -c1-200
echo "=== daily"
gh run list --workflow ci.yml --event schedule --limit 2 --json conclusion,status,createdAt,headSha --jq '.[] | "\(.createdAt) \(.status) \(.conclusion) \(.headSha[0:9])"'
echo "=== npm and host cli"
npm view repo-harness version 2>/dev/null; repo-harness --version 2>/dev/null | head -1
