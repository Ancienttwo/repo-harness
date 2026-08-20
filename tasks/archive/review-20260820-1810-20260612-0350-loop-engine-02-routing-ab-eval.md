> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260612-0350-loop-engine-02-routing-ab-eval.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: orphan-family-sweep

# Sprint Review: loop-engine-02-routing-ab-eval

> **Status**: Pass
> **Plan**: plans/archive/plan-20260612-0350-loop-engine-02-routing-ab-eval.md
> **Contract**: tasks/contracts/20260612-0350-loop-engine-02-routing-ab-eval.contract.md
> **Notes File**: tasks/archive/notes-20260612-0433-loop-engine-02-routing-ab-eval.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-12 11:42 +0800
> **Recommendation**: pass

## Mode Evidence

- Selected route: contract worktree from sprint backlog row 2, reopened for current-state verification after the row 2 branch already existed.
- P1/P2/P3 evidence: runtime prompt guard remains unchanged; this slice only adds eval/report surfaces and records G1 evidence for the classifier-replacement track.
- Root cause or plan evidence: `docs/researches/20260612-loop-in-hook-vs-nlah-loop-engineering.md` requires evidence before shadow injection or classifier deletion.

## Verification Evidence

- Waza `/check` run: local contract review equivalent completed in this review file.
- Commands run:
  - `bun test --timeout 20000 tests/route-nl-vs-ts-eval.test.ts tests/evals-contract.test.ts tests/run-skill-evals.test.ts`
  - `bun run benchmark:skills -- --eval route-nl-vs-ts --agent codex --profile with_skill --iteration route-nl-vs-ts-codex-rerun`
  - `timeout 60 claude -p --output-format text --no-session-persistence --permission-mode bypassPermissions 'Reply with exactly: ok'`
  - `timeout 240 claude -p --output-format text --no-session-persistence --permission-mode bypassPermissions "$(cat .ai/harness/runs/route-nl-vs-ts-claude-prompt.txt)"`
  - `bun scripts/route-nl-vs-ts-eval.ts --agent claude --decisions .ai/harness/runs/route-nl-vs-ts-claude-decisions.json --out .ai/harness/runs/route-nl-vs-ts-claude-report.json`
  - `bun scripts/route-nl-vs-ts-eval.ts --check-report .ai/harness/runs/route-nl-vs-ts-report.json`
- Manual checks:
  - Codex with_skill non-dry-run benchmark passed: 8/8 scenarios, 0 false positives, 0 false negatives, estimated token delta 1132, `go`.
  - Claude CLI smoke passed, then Claude direct non-dry-run produced valid NL decisions from the same table and scenario pack.
  - Claude benchmark wrapper was terminated after it created the baseline workspace but did not write report artifacts; the direct Claude run is the accepted Claude non-dry-run evidence for this review.
  - Claude direct report is `no-go`: 1/8 exact compliance, 0 false positives, 0 false negatives, 7 enum/action-vocabulary mismatches, estimated token delta 1132.
- Supporting artifacts:
  - `evals/benchmark.md`
  - `/Users/chris/Projects/repo-harness-workspace/iteration-20260612-112618-route-nl-vs-ts-codex-rerun/manifest.json`
  - `/Users/chris/Projects/repo-harness-workspace/iteration-20260612-112618-route-nl-vs-ts-codex-rerun/codex/with_skill/route-nl-vs-ts/.ai/harness/runs/route-nl-vs-ts-report.json`
  - `.ai/harness/runs/route-nl-vs-ts-claude-report.json`
  - `.ai/harness/runs/loop-engine-02-routing-ab-eval.json`
- Implementation notes reviewed: `tasks/archive/notes-20260612-0433-loop-engine-02-routing-ab-eval.md`
- Run snapshot: `.ai/harness/runs/loop-engine-02-routing-ab-eval.json`

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Codex
> **External Source**: codex-review
> **External Started**: 2026-06-12 11:25 +08
> **External Completed**: 2026-06-12 11:42 +08

- P1 blockers: none
- P2 advisories: G1 is `no-go`; do not proceed to shadow injection or classifier deletion until the NL table/eval output vocabulary is repaired and rerun.
- Acceptance checklist: pass; row 2 produced decisive A/B evidence and a go/no-go conclusion.

## Behavior Diff Notes

- Runtime prompt-guard behavior did not change.
- New behavior is limited to benchmark assets and report generation:
  - `scripts/route-nl-vs-ts-eval.ts` emits scenarios, validates agent-authored NL decisions, and writes go/no-go reports.
  - `evals/evals.json` exposes `route-nl-vs-ts` to `bun run benchmark:skills`.
  - `tests/route-nl-vs-ts-eval.test.ts` locks TS-arm parity and report semantics.
- Current G1 result is `no-go`: Codex can follow the table with exact action names, but Claude naturally emits semantically equivalent action phrases that fail exact enum matching.

## Residual Risks / Follow-ups

- The next Track A slice should be the no-go repair path: keep TS classifier authoritative, repair/normalize the NL output vocabulary, and shrink classifier scope only around deterministic explicit triggers after another eval pass.
- Existing speculative branches for shadow/cutover should not be treated as approved mainline until this no-go path is resolved.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 8/10 | Eval harness works and captures both go and no-go outcomes without changing runtime behavior. |
| Product depth | 8/10 | G1 now gives a real routing decision instead of relying on an owner override. |
| Design quality | 8/10 | The result preserves TS authority when NL routing evidence is unstable. |
| Code quality | 8/10 | Focused tests pass; direct Claude evidence uncovered an output-contract gap. |

## Failing Items

- None for row 2. The `no-go` result is the intended gate output, not a row 2 failure.

## Retest Steps

- Re-run:
  - `bun test --timeout 20000 tests/route-nl-vs-ts-eval.test.ts tests/evals-contract.test.ts tests/run-skill-evals.test.ts`
  - `bun run benchmark:skills -- --eval route-nl-vs-ts --agent codex --profile with_skill --iteration route-nl-vs-ts-codex-rerun`
  - `bun scripts/route-nl-vs-ts-eval.ts --check-report .ai/harness/runs/route-nl-vs-ts-report.json`
- Re-check:
  - Run a Claude non-dry-run with the scenario pack and NL decision table; if exact action vocabulary stabilizes, regenerate `.ai/harness/runs/loop-engine-02-routing-ab-eval.json`.

## Summary

- Pass with G1 no-go. Row 2 has produced decisive evidence: Codex benchmark is go, Claude NL self-routing is no-go due action-vocabulary instability, so Track A must route to no-go repair instead of shadow injection.
