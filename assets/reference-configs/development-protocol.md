# Development Protocol Reference

> Partially externalized: full pattern lives in default brain.

## Default Brain

- File vault: `brain/repo-harness/patterns/pattern-agentic-development-protocol.md`

## Repo Role

The executable source of truth is repo-local:

- Ordinary tasks: the PR description holds the goal, scope, changes, verification, risk and rollback. No plan, contract, review or notes file is mandatory.
- Task identity, claim, dependencies and status: GitHub issue and PR.
- Product intent: `docs/prds/*.prd.md`.
- One-time decision: a `repo-harness decision` comment in the issue.
- Hook ownership and parity: `docs/reference-configs/hook-operations.md`

Use the external pattern for broader feature, bug, and response-shaping guidance.
