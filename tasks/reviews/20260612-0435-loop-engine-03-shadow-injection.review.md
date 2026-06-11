# Sprint Review: loop-engine-03-shadow-injection

> **Status**: Pass
> **Plan**: plans/plan-20260612-0435-loop-engine-03-shadow-injection.md
> **Contract**: tasks/contracts/20260612-0435-loop-engine-03-shadow-injection.contract.md
> **Notes File**: tasks/notes/20260612-0435-loop-engine-03-shadow-injection.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-12 04:49
> **Recommendation**: pass

## Mode Evidence

- Selected route: `repo-harness-sprint` row 3, contract mode.
- P1/P2/P3 evidence: prompt path traced from `.ai/hooks/prompt-guard.sh` to `src/cli/commands/prompt-guard-decision.ts`, then back to shell rendering; `.claude/.trace.jsonl` remains the prompt/tool trace sink.
- Root cause or plan evidence: G1 raw route report and row 2 summary both recommend `go`; Claude row 2 verification remains skipped by explicit owner override for this Goal.

## Verification Evidence

- Waza `/check` run: local equivalent recorded here after focused verification; Claude verification is skipped in this Goal per user instruction.
- Commands run:
  - `bun test tests/hook-runtime.test.ts tests/loop-engine-shadow-report.test.ts tests/workflow-contract.test.ts` -> 116 pass / 0 fail.
  - `printf '%s' '{"prompt":"shadow smoke: report current loop-engine state"}' | bash .ai/hooks/prompt-guard.sh` -> emitted `[LoopEngineShadow]`, state snapshot, NL table pointer, and exited 0.
  - `bun scripts/loop-engine-shadow-report.ts --out .ai/harness/runs/loop-engine-03-shadow-summary.json` -> `prompts=1 divergence_count=0 timebox_complete=false recommendation=continue_shadow`.
- Manual checks:
  - TS verdict remains authoritative: prompt-guard still renders from `PG_ACTION`; shadow functions only append trace and echo advisory context.
  - `.claude/.trace.jsonl` has `event_type=UserPromptSubmit` with `loop_engine_shadow.divergence=false`.
  - `assets/hooks/prompt-guard.sh` matches `.ai/hooks/prompt-guard.sh` via `tests/workflow-contract.test.ts`.
- Supporting artifacts:
  - `.ai/harness/runs/loop-engine-02-routing-ab-eval.json`
  - `.ai/harness/runs/route-nl-vs-ts-report.json`
  - `.ai/harness/runs/loop-engine-03-shadow-summary.json`
- Implementation notes reviewed: `tasks/notes/20260612-0435-loop-engine-03-shadow-injection.notes.md`
- Run snapshot: pending `scripts/verify-sprint.sh` rerun after this review update.

## External Acceptance Advice

> **External Acceptance**: manual_override
> **External Reviewer**: chris
> **External Source**: owner-override
> **External Started**: 2026-06-12T04:49:00+0800
> **External Completed**: 2026-06-12T04:49:00+0800

- Manual Override: User explicitly instructed this Goal to skip Claude verification and continue; local Codex verification plus focused tests are accepted for row 3.
- P1 blockers: none.
- P2 advisories: row 7 cutover must wait for this shadow timebox to complete; current summary is `continue_shadow`, not cutover approval.
- Acceptance checklist: pass for row 3 shadow injection; not a classifier cutover.

## Behavior Diff Notes

- `prompt-guard.sh` now emits `[LoopEngineShadow]` only when G1 evidence is `go`; missing/no-go evidence leaves existing prompt behavior unchanged.
- The prompt trace adds a `loop_engine_shadow` object with `state_snapshot`, `nl_decision_table`, `ts_verdict`, `nl_decision`, and `divergence`.
- Summary generation is explicit via `scripts/loop-engine-shadow-report.ts`; no cron/heartbeat behavior is introduced in this row.

## Residual Risks / Follow-ups

- Shadow evidence is still sparse: 1 local prompt, 0 divergence. This is sufficient to prove the instrumentation, but not enough for row 7 cutover.
- The NL shadow route is advisory/deterministic in-hook; real LLM interpretation remains represented by the injected table pointer and the row 2 eval evidence.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 8/10 | G1-gated injection, prompt trace divergence, smoke summary, and focused tests are in place. |
| Product depth | 8/10 | Preserves staged clean path: evidence first, TS authoritative, no classifier cutover. |
| Design quality | 8/10 | Injection is compact and avoids in-hook LLM calls or full NL table inlining. |
| Code quality | 8/10 | Hook/assets parity covered; focused tests validate divergence and report behavior. |

## Failing Items

- None for row 3 acceptance.

## Retest Steps

- Re-run: `bun test tests/hook-runtime.test.ts tests/loop-engine-shadow-report.test.ts tests/workflow-contract.test.ts`
- Re-check: `bun scripts/loop-engine-shadow-report.ts --check --out .ai/harness/runs/loop-engine-03-shadow-summary.json`

## Summary

- Row 3 passes for shadow injection. G1 is enforced from row 2 go evidence, prompt-guard injects the state snapshot plus NL table pointer without changing authoritative TS behavior, prompt traces carry a `divergence` field, and a timebox summary report is generated.
