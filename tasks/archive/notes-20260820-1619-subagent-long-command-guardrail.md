> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260819-0049-subagent-long-command-guardrail.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1619

# Implementation Notes: subagent-long-command-guardrail

> **Status**: Active
> **Plan**: plans/plan-20260819-0049-subagent-long-command-guardrail.md
> **Contract**: tasks/contracts/20260819-0049-subagent-long-command-guardrail.contract.md
> **Review**: tasks/reviews/20260819-0049-subagent-long-command-guardrail.review.md
> **Last Updated**: 2026-08-19 00:49
> **Lifecycle**: notes

## Design Decisions

- The advisory rides the SubagentStart `additionalContext` string, not the PreToolUse Task-prompt path that `RETURN_CONTRACT_TEXT` uses. The contract names `RETURN_CONTRACT_MARKER`/`RETURN_CONTRACT_TEXT` (`src/cli/hook/subagent-handler.ts:86-87`) as the *shape* to copy (one marker constant, one text constant, marker-dedupe), and the Goal pins SubagentStart as the delivery point. Falsifier cleared: the context array is joined and emitted verbatim with no size budget or truncation, so appended text reaches workers.
- Dedupe lives in an exported pure `appendLongCommandGuardrail(context)` rather than inline in `runSubagentStart`. The SubagentStart context is assembled from literals, so an inline `includes` check could never fire and could never be tested; exporting the function makes "already marked -> no second copy" a real, directly asserted invariant and keeps the guard honest if the context array later grows a line containing the marker.
- Wording pins the mechanism (600s host stream watchdog on silence) and the default action (`RESULT: BLOCKED`, name the command) rather than a command allowlist. A list of long commands would drift; the watchdog rule does not.

## Deviations From Plan Or Spec

- `docs/reference-configs/sprint-contracts.md` is a byte-identical projection of `assets/reference-configs/sprint-contracts.md`, enforced by `tests/reference-configs-projection.test.ts`. The contract named only the projection path, so the convention subsection was authored in the asset source and regenerated with `bun run sync:reference-configs`; `assets/reference-configs/sprint-contracts.md` was added to `allowed_paths` for the same reason.
- The contract's `allowed_paths` block omitted `docs/reference-configs/sprint-contracts.md` even though `## Scope` (In scope) and the dispatch brief both require editing it. Resolved through the contract's own scope gate ("update this contract before widening scope") by adding that one path to `allowed_paths`; no scope was widened beyond what Goal/Scope already declared. Flagged to the parent rather than treated as a silent fix.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Inline `includes` dedupe in `runSubagentStart` | Rejected | Vacuous against a literal-only array; not testable, so the "no duplication" exit criterion would be asserted against nothing |
| Export `appendLongCommandGuardrail` helper | Chosen | Smallest surface that makes single-injection a verifiable property; no new abstraction layer |
| Enumerate long commands (`verify-sprint`, `bun test`) in the advisory | Rejected | The list drifts; the ~5-minute expectation plus the watchdog mechanism is the stable rule |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
