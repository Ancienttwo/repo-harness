# Plan scoped work

Planning and verification share the Bot entrypoint.

Map the real boundary. Trace one real path. Read why the current design exists.
Preserve its invariant. Choose the smallest coherent change.
Ask only when a missing decision can change scope, data authority, cost or an
irreversible action. Use reversible defaults when evidence supports them.
Record goal, scope, owning paths, checks, risk and rollback in the requested plan.
Use `repo-harness run capture-plan --slug <slug> --title <title>` only when a
file-backed plan is requested. A plan does not grant implementation approval.
A file-coupled worker still requires its actual contract and preflight.
Ordinary work uses the request or PR description without extra artifacts.

Do not edit implementation files in planning mode. Stop before any action
that needs approval outside the existing task authorization. Mark unresolved
assumptions `[ASSUMED]` and missing facts `[UNKNOWN]` when they affect the decision.
