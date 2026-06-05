---
name: repo-harness-upgrade
description: Refreshes an already-installed repo-harness harness using manifest-owned upgrade actions from assets/workflow-contract.v1.json.
when_to_use: "repo-harness-upgrade, upgrade installed harness, refresh repo-harness contract, reconfigure current tasks-first harness, upgrade workflow contract"
---

# repo-harness-upgrade

Use this command when a repo already has a current harness surface but needs the latest contract, helpers, templates, or policy.

## Protocol

1. Confirm source repo versus installed runtime copy before changing anything.
2. Run `bun scripts/inspect-project-state.ts --repo <repo> --format text`.
3. Read `upgrade_plan` and `assets/workflow-contract.v1.json#migrations.upgrade.actions`.
4. Apply only manifest-owned actions through the migration engine.
5. Verify runtime manifest parity and workflow gates.

## CHECKPOINTS

- CHECKPOINT: before applying upgrade actions, confirm the target repo and installed runtime copy are not being conflated.

## Failure Modes

- If the inspector reports legacy docs, route to `repo-harness-migrate`.
- If `upgrade_plan` is empty, report no-op readiness instead of touching files.
- If the target is an installed Codex copy, verify source and installed paths separately before mutation.

## Boundaries

- Delete only `known_generated` surfaces listed by the contract.
- Preserve `_ref/`, `_ops/`, secrets, local env, custom hooks, and user-authored legacy material.
- If the target is the Codex installed copy, verify source and installed paths separately.
