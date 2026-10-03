#!/bin/bash
set -euo pipefail
case "${1:-sync-latest}" in
  sync-latest|sync-event) ;;
  --help|-h) echo 'Architecture context is read from AGENTS.md and model/docs on demand; this command writes no agent blocks'; exit 0 ;;
  *) echo 'Unknown architecture context observation command' >&2; exit 2 ;;
esac
printf '%s\n' '[architecture] context-contract-sync is observation-only; read architecture documents on demand, update real boundaries explicitly; no agent/capability block or workstream was written'
