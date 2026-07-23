# Setup Mode: Upgrade

Source facade: `assets/skill-commands/repo-harness-upgrade`.

Use when a repo already has a current harness surface but needs the latest
contract, helpers, templates, or policy. Run the shared preflight in
`../SKILL.md` first.

## Protocol

1. Confirm source repo versus installed runtime copy before changing anything.
2. Read `upgrade_plan` and `assets/workflow-contract.v1.json#migrations.upgrade.actions`.
3. Apply only manifest-owned actions through the migration engine.
4. Verify runtime manifest parity and workflow gates.

## Checkpoints

- Before applying upgrade actions, confirm the target repo and installed runtime copy are not being conflated.

## Failure Modes

- If `upgrade_plan` is empty, report no-op readiness instead of touching files.
- If the target is an installed Codex copy, verify source and installed paths separately before mutation.

## Boundaries

- Delete only `known_generated` surfaces listed by the contract.
- Preserve `_ref/`, `_ops/`, secrets, local env, custom hooks, and user-authored legacy material.
- If the target is the Codex installed copy, verify source and installed paths separately.
