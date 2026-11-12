#!/bin/bash
# Wait until the orchestrator seat ends its turn, then run the product reset for its RESET-REQUEST.
# Arguments: <hc address> <handoff path> <handoff sha256>
addr="$1"
until [ "$(hc get "$addr" | jq -r '.status.state')" != "working" ]; do
  sleep 5
done
exec repo-harness seats reset "$2" "$3"
