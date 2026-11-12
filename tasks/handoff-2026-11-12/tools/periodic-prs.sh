#!/bin/bash
# Acceptance records, head times and review threads of each open PR (read-only).
cd "${REPO_HARNESS_CHECKOUT:-$HOME/Projects/repo-harness}" || exit 1
for n in "$@"; do
  gh pr view "$n" --json number,headRefOid,mergeStateStatus,mergeable,labels,comments,commits,closingIssuesReferences --jq '
    "## #\(.number) head=\(.headRefOid[0:9]) \(.mergeStateStatus)/\(.mergeable) labels=\([.labels[].name]|join(",")) closes=\([.closingIssuesReferences[].number]|join(",")) lastCommit=\(.commits[-1].committedDate)",
    (.comments[] | select(.body | startswith("repo-harness acceptance record")) | "  record \(.createdAt) " + ([.body | split("\n")[] | select(test("^\\| [0-9]"))] | join(" ") | .[0:200])),
    (.comments[-2:][] | select(.body | startswith("repo-harness acceptance") | not) | "  last \(.createdAt) \(.author.login): \(.body[0:160] | gsub("\n";" "))")'
done
