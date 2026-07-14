> **Archived**: 2026-07-14 23:15
> **Related Plan**: plans/archive/plan-20260714-2128-3p-cli-skill-mcp-boundary.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260714-2315

# Implementation Notes: 3p-cli-skill-mcp-boundary

> **Status**: Active
> **Plan**: plans/plan-20260714-2128-3p-cli-skill-mcp-boundary.md
> **Contract**: tasks/contracts/20260714-2128-3p-cli-skill-mcp-boundary.contract.md
> **Review**: tasks/reviews/20260714-2128-3p-cli-skill-mcp-boundary.review.md
> **Last Updated**: 2026-07-14 21:28
> **Lifecycle**: notes

## Design Decisions

- `helpers.descriptions` is a sibling map keyed by helper id rather than converting `helpers.scripts` entries to objects: the string array is asserted by ~18 `toContain` expectations across contract/parity tests, and the fail-closed 1:1 validation makes the two-field shape drift-proof anyway.
- Doctor triplication from the audit was closed as no-change: `harness_doctor` (MCP tool) returns MCP session diagnostics, `mcp doctor` checks MCP setup, top-level `doctor` checks runtime readiness — different implementations, already-scoped descriptions, no dual authority to remove.
- Rebase onto origin/main (5 commits) exercised the new invariant live: upstream added `run-bounded-verifier-command.ts` and `validate-harness-profile-benchmark.ts`, and the fail-closed check demanded their descriptions before anything could ship.

## Deviations From Plan Or Spec

- The plan artifact was captured retroactively at ship time (PlanStatusGuard fired on the post-rebase contract edit); execution had already completed under direct user approval before the plan/contract files existed.
- The contract worktree auto-started by `capture-plan --execute` was not used (work was already committed on local main); it was removed after copying the plan-lifecycle artifacts back.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Enumerate helper ids only in `run --help` | Rejected | Opaque ids are not agent-usable; descriptions are the point of the audit fix |
| Fallback list in check skill when `## Required Checks` missing | Rejected | Repo principles forbid semantic fallbacks; fail closed with a blocking finding |
| Autostash rebase vs checkpoint-committing user WIP | Autostash | 8 WIP files belong to parallel sessions; committing them to main was the worse violation; stash preserved for user adjudication |

## Open Questions

- origin/main `tasks/todos.md` regression (PR #73/#74 merged a stale ledger: BDD3 EXECUTED annotations reverted, two backlog rows dropped while `evals/bdd3/reports/phase-*-gate.md` exist) — owner adjudication needed; pre-rebase WIP snapshot preserved in `stash@{0}`.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Gatekeeper acceptance (pre-rebase, same diff scope): PASS — full `bun test` 1421/0, all required checks green, 8 descriptions spot-checked against script sources.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- The stale-branch todos regression pattern (parallel PRs overwriting ledger rows) is a `tasks/lessons.md` candidate only if it recurs.
