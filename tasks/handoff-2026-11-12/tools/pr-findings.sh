#!/bin/bash
# Read-only: the findings of the review records of a PR. Arguments: <pr> [max body chars per record].
# A record comment holds a "| Round |" table; the comment before it holds the reviewer's finding lines.
cd "${REPO_HARNESS_CHECKOUT:-$HOME/Projects/repo-harness}" || exit 1
pr="$1"; max="${2:-1500}"
gh pr view "$pr" --json comments --jq --arg max "$max" '
  .comments
  | map(select(.body | test("Round: [0-9]+|\\| Round \\|")))
  | .[]
  | "---- \(.createdAt)\n\(.body[0:($max|tonumber)])"
' 2>/dev/null || gh pr view "$pr" --json comments --jq '.comments | map(select(.body | test("Round: [0-9]+|\\| Round \\|"))) | .[] | "---- \(.createdAt)\n\(.body[0:1500])"'
