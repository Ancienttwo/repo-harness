# Workstream: Cleanup script policy surface

> **Status**: completed
> **Capability ID**: `workflow-engine-contract-assets`
> **Functional Block**: `.ai/harness/policy.json`
> **Matched Prefix**: `.ai/harness/policy.json`
> **Architecture Domain**: `workflow-engine`
> **Architecture Capability**: `contract-assets`
> **Architecture Module**: `docs/architecture/modules/workflow-engine/contract-assets.md`
> **Source Plan**: (none)
> **Current Slice**: completed-20260529-cleanup-script-policy
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: docs/architecture/requests/archive/2026/20260529-020654-ai-harness-policy-json-ai-harness-policy-json.md

## Purpose

Track durable multi-session progress for `workflow-engine-contract-assets` without inflating local agent instructions.

## TODOs

- [x] completed-20260529-cleanup-script-policy: Close the `.ai/harness/policy.json` cleanup-script architecture request for `workflow-engine-contract-assets`.

## Notes

- `worktree_strategy.cleanup_script` is a contract-assets policy field; it does not move cleanup ownership out of `scripts/contract-worktree.sh`.
- `scripts/workstream-sync.sh` and `scripts/context-contract-sync.sh` now accept existing file prefixes as capability blocks, matching `scripts/capability-resolver.ts match`.
- Resolution artifacts: `docs/architecture/modules/workflow-engine/contract-assets.md`, `assets/AGENTS.md`, `assets/CLAUDE.md`.
