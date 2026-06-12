> **Archived**: 2026-06-12 11:46
> **Related Plan**: plans/archive/plan-20260612-0539-loop-engine-07-cutover-delete-classifier.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260612-1146

# Implementation Notes: loop-engine-07-cutover-delete-classifier

> **Status**: Completed
> **Plan**: plans/plan-20260612-0539-loop-engine-07-cutover-delete-classifier.md
> **Contract**: tasks/contracts/20260612-0539-loop-engine-07-cutover-delete-classifier.contract.md
> **Review**: tasks/reviews/20260612-0539-loop-engine-07-cutover-delete-classifier.review.md
> **Last Updated**: 2026-06-12 06:26
> **Lifecycle**: notes

## Design Decisions

- Row3 shadow evidence is still inside the timebox (`prompt_count=1`, `timebox.complete=false`, `recommendation=continue_shadow`), so G2 is not passed.
- The owner explicitly instructed this Goal to continue after the blocker was reported; record that as G2 owner override, not as G2 pass.
- Remove the old `prompt-intents.ts` semantic-classifier surface by moving prompt text handling to `prompt-triggers.ts` trigger facts.
- Replace the exported intent x plan-state decision table with direct deterministic action routing branches.
- Keep runtime behavior stable by moving the large shell body to `lib/prompt-guard-runtime.sh`; the route entrypoint remains `prompt-guard.sh` and is <=300 lines.

## Deviations From Plan Or Spec

- G2 precondition remains false, but implementation proceeded under owner override.
- Claude validation remains skipped per owner instruction; it is not recorded as an external pass.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Delete classifier now with G2 pass claim | Rejected | Would misstate the shadow evidence. |
| Delete classifier now under owner override | Accepted | User explicitly instructed this Goal to continue after the G2 blocker was surfaced. |
| Generate synthetic shadow prompts | Rejected | Would not represent real hook traffic and would weaken the gate. |
| Record blocker and keep row7 pending | Rejected by owner override | Preserves safety, but conflicts with the owner's continuation instruction for this Goal. |

## Open Questions

- None for row7 implementation; residual risk is recorded in the review because G2 is overridden, not passed.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Shadow summary: `.ai/harness/runs/loop-engine-03-shadow-summary.json`
- Trace file: `.claude/.trace.jsonl`
- Focused row7 tests: `tests/unit/loop-engine-07-cutover-delete-classifier.test.ts`
- Full tests: `bun test` (663 pass, 0 fail)
- Route eval: `bun scripts/route-nl-vs-ts-eval.ts --check-report .ai/harness/runs/route-nl-vs-ts-report.json` (`go_no_go=go`)
- State snapshot smoke: `bun src/cli/hook-entry.ts state-snapshot --json` emitted one 425-byte JSON line.
- Prompt-guard timing smoke: `/usr/bin/time -p bun test tests/hook-runtime.test.ts --test-name-pattern "prompt-guard: emits advisory Waza route hints without blocking"` (`real 0.78`).
- Workflow gates: `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, and `bash scripts/verify-sprint.sh` passed.
- Verify-sprint snapshot: `.ai/harness/runs/run-20260612T114508-32240-20260612-0539-loop-engine-07-cutover-delete-classifier.json`

## Promotion Candidates

- Promote owner-override vs gate-pass distinction to `tasks/lessons.md`.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
