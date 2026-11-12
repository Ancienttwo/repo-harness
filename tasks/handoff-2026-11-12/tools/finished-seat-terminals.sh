#!/bin/bash
# Read-only: the finished repo-harness seat terminals, their labels and whether their cwd still exists.
hc ls --all --json --label repo-harness.repository=1186405141 \
  | jq -r '.terminals[] | select(.state != "live") | select(.address | contains("/") | not) | .address' \
  | while read -r address; do
      hc get "$address" | jq -r '[.address, .state, (.labels["repo-harness.seat"] // "-"), (.labels["repo-harness.pr"] // "-"), (.labels["repo-harness.issue"] // "-"), (.cwd // "null")] | @tsv'
    done | while IFS=$'\t' read -r address state seat pr issue cwd; do
      if [[ "$cwd" == null ]]; then exists="cwd-null"; elif [[ -d "$cwd" ]]; then exists="dir-exists"; else exists="dir-gone"; fi
      printf '%s %s seat=%s pr=%s issue=%s %s %s\n' "$address" "$state" "$seat" "$pr" "$issue" "$exists" "$cwd"
    done
