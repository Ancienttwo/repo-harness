# Plan scoped work

Planning and verification share the Bot entrypoint.

Map the real boundary. Trace one real path. Read why the current design exists.
Preserve its invariant. Choose the smallest coherent change.
Ask only when a missing decision can change scope, data authority, cost or an
irreversible action. Use reversible defaults when evidence supports them.
Record goal, scope, owning paths, checks, risk and rollback in the GitHub issue
or PR description. Use `repo-harness-issue-flow` for a tracked requirement; no
local plan file holds task state. A plan does not grant implementation approval.
A worker follows the claimed issue and its boundary.
Ordinary work uses the issue or PR description without extra artifacts.

Do not edit implementation files in planning mode. Stop before any action
that needs approval outside the existing task authorization. Mark unresolved
assumptions `[ASSUMED]` and missing facts `[UNKNOWN]` when they affect the decision.
