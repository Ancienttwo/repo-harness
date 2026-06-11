> **Archived**: 2026-06-12 04:57
> **Related Plan**: plans/archive/plan-20260612-0435-loop-engine-03-shadow-injection.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260612-0457

# Implementation Notes: loop-engine-03-shadow-injection

> **Status**: Active
> **Plan**: plans/plan-20260612-0435-loop-engine-03-shadow-injection.md
> **Contract**: tasks/contracts/20260612-0435-loop-engine-03-shadow-injection.contract.md
> **Review**: tasks/reviews/20260612-0435-loop-engine-03-shadow-injection.review.md
> **Last Updated**: 2026-06-12 04:49
> **Lifecycle**: notes

## Design Decisions

- G1 precondition is file-backed: `.ai/hooks/prompt-guard.sh` enables shadow only when `.ai/harness/runs/loop-engine-02-routing-ab-eval.json` records Codex `go` and either Claude `go` or the owner override from this Goal. It falls back to `.ai/harness/runs/route-nl-vs-ts-report.json` only for the raw route eval report.
- TS verdict remains authoritative. The hook still renders and blocks from `PG_ACTION`; the shadow path only appends a `UserPromptSubmit` trace event with `loop_engine_shadow.divergence`.
- Runtime injection is intentionally small: one line with the state snapshot JSON, one line with the NL decision-table path and timebox. The NL table document is not inlined into every prompt.
- Shadow summary is a read-only report script (`scripts/loop-engine-shadow-report.ts`) over `.claude/.trace.jsonl`; it decides `continue_shadow`, `ready_for_cutover_review`, or `no_go` from the 14-day / 100-prompt timebox and divergence count.

## Deviations From Plan Or Spec

- No classifier cutover was attempted. The NL shadow projection defaults to the current prompt verdict and supports explicit divergence injection for tests; this keeps the hot path deterministic until row 7.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Inline the full NL table into prompt-guard output | Rejected | The table is ~5KB and row 2 measured a 1132-token per-prompt delta; row 3 only needs a pointer while collecting divergence. |
| Run an LLM from the hook for the NL arm | Rejected | Hooks must stay lightweight and deterministic; shadow evidence should not add an in-hook model dependency. |
| Record trace only when divergence is true | Rejected | The acceptance line requires every prompt to carry a `divergence` field during shadow. |

## Open Questions

- Shadow summary currently has 1 prompt / 0 divergence from the local smoke. The row 7 cutover gate still requires the timebox to complete and critical routes to remain zero-miss.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Shadow trace: `.claude/.trace.jsonl` contains `loop_engine_shadow.protocol=loop-engine-shadow/v1`.
- Shadow summary: `.ai/harness/runs/loop-engine-03-shadow-summary.json` shows `prompt_count=1`, `divergence_count=0`, `recommendation=continue_shadow`.
- Focused tests: `bun test tests/hook-runtime.test.ts tests/loop-engine-shadow-report.test.ts tests/workflow-contract.test.ts` -> 116 pass / 0 fail.
- Report commands: `bun scripts/loop-engine-shadow-report.ts --out .ai/harness/runs/loop-engine-03-shadow-summary.json`; `bun scripts/loop-engine-shadow-report.ts --check --out .ai/harness/runs/loop-engine-03-shadow-summary.json`.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
