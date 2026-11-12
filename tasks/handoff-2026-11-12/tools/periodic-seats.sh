#!/bin/bash
# Seats of the repository with labels, status and unpushed or dirty work (read-only).
hc ls --label repo-harness.repository=1186405141 | python3 -I -c '
import json,sys
for t in json.load(sys.stdin)["terminals"]:
    if "/" in t["address"]: continue
    print(t["address"], t.get("agent"), t.get("status"), t.get("cwd"), sep="\t")
' | while IFS=$'\t' read -r addr agent status cwd; do
  labels=$(hc get "$addr" 2>/dev/null | python3 -I -c 'import json,sys; d=json.load(sys.stdin); l=d.get("labels") or {}; print(" ".join(f"{k[13:]}={v}" for k,v in sorted(l.items()) if k.startswith("repo-harness.") and k!="repo-harness.repository"), "idle_min=%s" % (round((__import__("time").time()*1000-(d.get("status",{}) or {}).get("since_ms",0))/60000) if isinstance(d.get("status"),dict) and d["status"].get("since_ms") else "?"))')
  extra=""
  case "$cwd" in *wt*)
    br=$(git -C "$cwd" branch --show-current 2>/dev/null)
    if [ -n "$br" ] && git -C "$cwd" rev-parse -q --verify "origin/$br" >/dev/null 2>&1; then
      extra="branch=$br unpushed=$(git -C "$cwd" log --oneline "origin/$br..HEAD" 2>/dev/null | wc -l | tr -d ' ')"
    elif [ -n "$br" ]; then
      extra="branch=$br no-remote commits=$(git -C "$cwd" log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')"
    fi
    extra="$extra dirty=$(git -C "$cwd" status --short 2>/dev/null | wc -l | tr -d ' ')";;
  esac
  echo "$addr $agent $status | $labels | $(basename "$cwd") $extra"
done
