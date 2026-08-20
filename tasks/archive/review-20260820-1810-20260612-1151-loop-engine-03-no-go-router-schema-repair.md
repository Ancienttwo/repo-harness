> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260612-1151-loop-engine-03-no-go-router-schema-repair.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: orphan-family-sweep

# Sprint Review: loop-engine-03-no-go-router-schema-repair

> **Status**: Complete
> **Plan**: plans/plan-20260612-1151-loop-engine-03-no-go-router-schema-repair.md
> **Contract**: tasks/contracts/20260612-1151-loop-engine-03-no-go-router-schema-repair.contract.md
> **Notes File**: tasks/notes/20260612-1151-loop-engine-03-no-go-router-schema-repair.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-12 12:02 +0800
> **Recommendation**: pass

## Mode Evidence

- Selected route: contract slice from loop-engine sprint row 3.
- P1/P2/P3 evidence: the row 2 no-go was caused by NL B-arm output vocabulary instability, not runtime prompt-guard behavior; this slice repairs eval schema/normalization only.
- Root cause or plan evidence: Claude produced valid but non-enum actions (`enter_done_gate`, `capture_pending_plan`, `scaffold_contract`) in row 2, so shadow injection remained blocked until the route output contract was tightened.

## Verification Evidence

- Waza `/check` run: local contract review equivalent completed in this review file.
- Commands run:
  - `bun test --timeout 20000 tests/route-nl-vs-ts-eval.test.ts tests/evals-contract.test.ts tests/run-skill-evals.test.ts`
  - `bun run benchmark:skills -- --eval route-nl-vs-ts --agent codex --profile with_skill --iteration route-nl-vs-ts-codex-schema-repair`
  - `timeout 240 claude -p --output-format text --no-session-persistence --permission-mode bypassPermissions "$(cat .ai/harness/runs/route-nl-vs-ts-claude-schema-repair-prompt.txt)"`
  - `bun scripts/route-nl-vs-ts-eval.ts --agent claude --decisions .ai/harness/runs/route-nl-vs-ts-claude-schema-repair-decisions.json --out .ai/harness/runs/route-nl-vs-ts-claude-schema-repair-report.json`
  - `bun scripts/route-nl-vs-ts-eval.ts --check-report .ai/harness/runs/route-nl-vs-ts-report.json`
- Manual checks:
  - Codex with_skill non-dry-run benchmark passed: compliance 100%, 0 false positives, 0 false negatives, normalization count 0, token delta 1393.
  - Claude direct non-dry-run passed: compliance 100%, 0 false positives, 0 false negatives, normalization count 0, token delta 1393.
  - Runtime prompt-guard code path was not changed.
- Supporting artifacts:
  - `evals/benchmark.md`
  - `/Users/chris/Projects/repo-harness-workspace/iteration-20260612-115446-route-nl-vs-ts-codex-schema-repair/manifest.json`
  - `.ai/harness/runs/route-nl-vs-ts-report.json`
  - `.ai/harness/runs/loop-engine-03-no-go-router-schema-repair.json`
- Implementation notes reviewed: `tasks/notes/20260612-1151-loop-engine-03-no-go-router-schema-repair.notes.md`
- Run snapshot: `.ai/harness/runs/loop-engine-03-no-go-router-schema-repair.json`

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Codex
> **External Source**: codex-review
> **External Started**: 2026-06-12 11:51 +0800
> **External Completed**: 2026-06-12 12:02 +0800

- P1 blockers: none
- P2 advisories: Second G1: go. Shadow remains a separate future slice; this slice did not inject runtime dual routing.
- Acceptance checklist: pass; Claude and Codex both produce controlled intent/action vocabulary after schema repair.

## Behavior Diff Notes

- `route-nl-vs-ts` scenario packs now expose `allowed_intents` and `allowed_actions`.
- The NL decision table now names the exact controlled output vocabulary.
- The evaluator normalizes known action aliases while still preserving true allow/block mistakes as no-go evidence.
- The benchmark prompt tells agents not to invent action synonyms.

## Residual Risks / Follow-ups

- Token delta increased to 1393 because the NL table now carries the explicit vocabulary.
- The next Track A slice can be a shadow injection only if it keeps TS verdict authoritative and records divergence; cutover remains blocked until shadow evidence exists.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | The no-go gap was repaired and rerun evidence is green for Codex and Claude. |
| Product depth | 8/10 | The eval now distinguishes schema/vocabulary instability from real routing false positives. |
| Design quality | 8/10 | Runtime authority stays unchanged while the eval contract is tightened. |
| Code quality | 8/10 | Focused tests cover schema exposure, alias normalization, and no-go regressions. |

## Failing Items

- None.

## Retest Steps

- Re-run the commands listed under Verification Evidence.

## Summary

- Pass. Second G1: go. Row 3 repaired the no-go vocabulary/schema gap; Track A may proceed to a separate shadow-injection slice with TS verdict still authoritative.
