# Sprint Review: loop-engine-07-cutover-delete-classifier

> **Status**: Passed
> **Plan**: plans/plan-20260612-0539-loop-engine-07-cutover-delete-classifier.md
> **Contract**: tasks/contracts/20260612-0539-loop-engine-07-cutover-delete-classifier.contract.md
> **Notes File**: tasks/notes/20260612-0539-loop-engine-07-cutover-delete-classifier.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-12 06:26
> **Recommendation**: pass

## Mode Evidence

- Selected route: owner-overridden G2 cutover implementation.
- P1/P2/P3 evidence: `.ai/harness/runs/loop-engine-03-shadow-summary.json` has `prompt_count=1`, `divergence_count=0`, `timebox.complete=false`, `ends_at=2026-06-25T20:49:11.000Z`, and `recommendation=continue_shadow`.
- Root cause or plan evidence: row7 acceptance requires G2 before deleting the classifier; owner explicitly overrode that gate in this Goal. This is not the same as passing G2 or passing Claude validation.

## Verification Evidence

- Waza `/check` run: skipped in this Goal per owner instruction to skip Claude verification; not recorded as passed.
- Commands run so far:
  - `cat .ai/harness/runs/loop-engine-03-shadow-summary.json`
  - `wc -l .claude/.trace.jsonl`
- `bun test tests/unit/loop-engine-07-cutover-delete-classifier.test.ts tests/cli/prompt-triggers.test.ts tests/cli/prompt-guard-decision.test.ts tests/hook-contracts.test.ts`
- Manual checks: G2 is not met; cutover proceeds only under owner override.
- Supporting artifacts: `.ai/harness/runs/loop-engine-03-shadow-summary.json`, `.claude/.trace.jsonl`
- Implementation notes reviewed: `tasks/notes/20260612-0539-loop-engine-07-cutover-delete-classifier.notes.md`
- Final verification:
  - `bun test` -> 663 pass, 0 fail.
  - `bun scripts/route-nl-vs-ts-eval.ts --check-report .ai/harness/runs/route-nl-vs-ts-report.json` -> `go_no_go=go`, TS/NL compliance 100%, false positives 0, false negatives 0.
  - `bun src/cli/hook-entry.ts state-snapshot --json` -> one 425-byte JSON line.
  - `/usr/bin/time -p bun test tests/hook-runtime.test.ts --test-name-pattern "prompt-guard: emits advisory Waza route hints without blocking"` -> pass, `real 0.78`.
  - `bash scripts/check-task-sync.sh` -> pass.
  - `bash scripts/check-task-workflow.sh --strict` -> pass.
  - `bash scripts/verify-sprint.sh` -> pass; run snapshot `.ai/harness/runs/run-20260612T114508-32240-20260612-0539-loop-engine-07-cutover-delete-classifier.json`.

## External Acceptance Advice

> **External Acceptance**: manual_override
> **External Reviewer**: owner
> **External Source**: user instruction: skip Claude validation and continue despite G2 blocker
> **External Started**: 2026-06-12T06:05:00+0800
> **External Completed**: 2026-06-12T06:05:00+0800

- P1 blockers: none after owner override.
- P2 advisories: G2 remains unproven; wait for 100 real prompts or 2026-06-25 timebox completion, then regenerate the shadow summary and verify key routes remain zero miss.
- Manual Override: owner instructed this Goal to skip Claude validation and continue despite the G2 shadow gate blocker.
- Acceptance checklist:
  - G2 owner override recorded, not marked pass.
  - `prompt-intents.ts` semantic-classifier surface removed.
  - Intent x plan-state table removed.
  - `prompt-guard.sh` entrypoints <=300 lines with runtime in hook lib.
  - Self-host/generated hook mirrors stay in sync.

## Behavior Diff Notes

- `src/cli/hook/prompt-intents.ts` is renamed to `src/cli/hook/prompt-triggers.ts`; prompt text handling is documented as trigger facts rather than semantic classifier authority.
- `src/cli/hook/prompt-guard-decision.ts` no longer exports `PROMPT_GUARD_EXECUTION_TABLE`; plan-state action routing is direct branch logic.
- `.ai/hooks/prompt-guard.sh` and `assets/hooks/prompt-guard.sh` are thin 10-line entrypoints that source mirrored `lib/prompt-guard-runtime.sh`.

## Residual Risks / Follow-ups

- G2 remains a residual risk because current evidence is one real prompt, zero divergence, and an incomplete timebox.
- Runtime behavior intentionally stays close to the pre-cutover hook because broad advisory route hints are not removed in this slice; this cut removes the old surface/table authority and slims the entrypoint.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 8/10 | Acceptance passes under explicit G2 owner override; runtime route smoke and full tests pass. |
| Product depth | 8/10 | Records the G2 override honestly instead of rewriting evidence. |
| Design quality | 8/10 | Removes the exported decision table and slims route entrypoints without changing edit-layer authority. |
| Code quality | 8/10 | Old file/table surfaces are removed, wrapper/runtime split is mirrored, and tests lock the new boundary. |

## Failing Items

- G2 remains unmet and owner-overridden.

## Retest Steps

- `bun test tests/unit/loop-engine-07-cutover-delete-classifier.test.ts tests/cli/prompt-triggers.test.ts tests/cli/prompt-guard-decision.test.ts tests/hook-contracts.test.ts`
- `bun test`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/check-task-sync.sh`
- `bun scripts/route-nl-vs-ts-eval.ts --check-report .ai/harness/runs/route-nl-vs-ts-report.json`
- `/usr/bin/time -p bun test tests/hook-runtime.test.ts --test-name-pattern "prompt-guard: emits advisory Waza route hints without blocking"`

## Summary

- Row7 passes under explicit G2 owner override. G2 remains unproven and should not be reworded as a passed shadow gate.
