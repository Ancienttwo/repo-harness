#!/bin/bash
# Subagent Return Channel Guard — PreToolUse on Task|Agent|SendUserMessage.
# Spawned subagents return only their final text to the caller. If they send a
# report through SendUserMessage, the user may see it but the parent Agent tool
# result receives only a tiny transition/final text. This guard appends that
# return-channel contract to spawned agent prompts and blocks subagent
# SendUserMessage calls that would bypass the caller.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

hook_read_stdin_once
input="$HOOK_STDIN_JSON"
[[ -n "$input" ]] || exit 0

CONTRACT_MARKER="[repo-harness:return-channel]"
CONTRACT_TEXT=$'\n\n[repo-harness:return-channel] Your final text message is the only channel returned to your caller. Put the complete findings/report in final text. Do not call SendUserMessage for report delivery; content sent through SendUserMessage is delivered outside the Agent tool result.'

if command -v bun >/dev/null 2>&1; then
  JSON_INPUT="$input" \
  RETURN_CONTRACT_MARKER="$CONTRACT_MARKER" \
  RETURN_CONTRACT_TEXT="$CONTRACT_TEXT" \
  bun -e '
    try {
      const input = JSON.parse(process.env.JSON_INPUT ?? "");
      const toolName = String(input.tool_name ?? "");
      const marker = process.env.RETURN_CONTRACT_MARKER ?? "";
      const contract = process.env.RETURN_CONTRACT_TEXT ?? "";

      if (toolName === "Task" || toolName === "Agent") {
        const toolInput = input.tool_input;
        if (!toolInput || typeof toolInput !== "object" || Array.isArray(toolInput)) process.exit(0);
        if (typeof toolInput.prompt !== "string" || toolInput.prompt.includes(marker)) process.exit(0);

        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason: "subagent-return-channel-guard: delivery contract appended to spawn prompt",
            updatedInput: {
              ...toolInput,
              prompt: toolInput.prompt + contract,
            },
          },
        }) + "\n");
        process.exit(0);
      }

      if (toolName === "SendUserMessage") {
        const agentId = String(input.agent_id ?? "");
        const transcriptPath = String(input.transcript_path ?? "");
        if (!agentId && !transcriptPath.includes("/subagents/agent-")) process.exit(0);

        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "subagent-return-channel-guard: SendUserMessage from a spawned subagent does not reach the caller Agent tool result. Put the full report in final text and end the subagent turn.",
          },
        }) + "\n");
      }
    } catch {
      process.exit(0);
    }
  ' 2>/dev/null || true
  exit 0
fi

command -v jq >/dev/null 2>&1 || exit 0

tool_name="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)"
case "$tool_name" in
  Task|Agent)
    printf '%s' "$input" | jq -e '.tool_input | type == "object"' >/dev/null 2>&1 || exit 0
    printf '%s' "$input" | jq -e '.tool_input.prompt | type == "string"' >/dev/null 2>&1 || exit 0
    if printf '%s' "$input" | jq -e --arg marker "$CONTRACT_MARKER" '.tool_input.prompt | contains($marker)' >/dev/null 2>&1; then
      exit 0
    fi

    printf '%s' "$input" | jq -c --arg contract "$CONTRACT_TEXT" '
      .tool_input as $toolInput
      | {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason: "subagent-return-channel-guard: delivery contract appended to spawn prompt",
            updatedInput: ($toolInput + {prompt: ($toolInput.prompt + $contract)})
          }
        }'
    ;;
  SendUserMessage)
    agent_id="$(printf '%s' "$input" | jq -r '.agent_id // empty' 2>/dev/null || true)"
    transcript_path="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)"
    [[ -n "$agent_id" || "$transcript_path" == *"/subagents/agent-"* ]] || exit 0

    jq -nc '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "subagent-return-channel-guard: SendUserMessage from a spawned subagent does not reach the caller Agent tool result. Put the full report in final text and end the subagent turn."
      }
    }'
    ;;
esac
