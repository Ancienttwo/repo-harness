#!/bin/bash
# Read-only: list the resume-evidence entries of a transcript (prompt entries, RESUMED sends, their results).
# Argument: transcript path.
jq -c '
  . as $e
  | ($e.message.content) as $c
  | if $e.type == "user" and (($c | type) == "string") and ($c | contains("You are orchestrator")) then
      {t: $e.timestamp, kind: "prompt-string", head: ($c[0:60])}
    elif $e.type == "user" and (($c | type) == "array") then
      ($c[] | if .type == "text" and ((.text // "") | contains("You are orchestrator")) then {t: $e.timestamp, kind: "prompt-part", head: (.text[0:60])}
              elif .type == "tool_result" then {t: $e.timestamp, kind: "result", id: .tool_use_id, err: .is_error, body: ((.content | tostring)[0:80])}
              else empty end)
    elif $e.type == "assistant" and (($c | type) == "array") then
      ($c[] | select(.type == "tool_use" and .name == "Bash") | {t: $e.timestamp, kind: "bash", id: .id, cmd: (.input.command[0:120])})
    else empty end
' "$1" 2>/dev/null | head -40
