# Sprint Review: loop-engine-02-routing-ab-eval

> **Status**: Pass
> **Plan**: plans/plan-20260612-0350-loop-engine-02-routing-ab-eval.md
> **Contract**: tasks/contracts/20260612-0350-loop-engine-02-routing-ab-eval.contract.md
> **Notes File**: tasks/notes/20260612-0350-loop-engine-02-routing-ab-eval.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-12 12:13
> **Recommendation**: pass

## Mode Evidence

- Selected route: contract worktree from sprint backlog row 2.
- P1/P2/P3 evidence: runtime prompt guard remains unchanged; new work lives in benchmark/eval/report surfaces only.
- Root cause or plan evidence: first proof point from `docs/researches/20260612-loop-in-hook-vs-nlah-loop-engineering.md` requires TS verdict vs NL decision-table self-routing evidence.

## Verification Evidence

- Waza `/check` run: skipped in this Goal per owner instruction to skip Claude verification; not recorded as passed.
- Commands run:
  - `bun test --timeout 20000 tests/route-nl-vs-ts-eval.test.ts tests/evals-contract.test.ts tests/run-skill-evals.test.ts`
  - `bun run benchmark:skills -- --eval route-nl-vs-ts --agent codex --profile with_skill --iteration route-nl-vs-ts-codex`
  - `bun scripts/route-nl-vs-ts-eval.ts --check-report .ai/harness/runs/route-nl-vs-ts-report.json`
  - `claude -p --output-format text --no-session-persistence --permission-mode bypassPermissions 'Reply with exactly: ok'`
- Manual checks:
  - Codex with_skill non-dry-run completed successfully.
  - Claude with_skill is skipped for this Goal by explicit owner instruction: "在这个Goal里，跳过Claude验证，继续".
- Supporting artifacts:
  - `evals/benchmark.md`
  - `/Users/chris/Projects/repo-harness-workspace/iteration-20260612-040450-route-nl-vs-ts-codex/manifest.json`
  - `/Users/chris/Projects/repo-harness-workspace/iteration-20260612-040001-route-nl-vs-ts-claude/manifest.json`
- Implementation notes reviewed: `tasks/notes/20260612-0350-loop-engine-02-routing-ab-eval.notes.md`
- Run snapshot: `.ai/harness/runs/loop-engine-02-routing-ab-eval.json`

## External Acceptance Advice

> **External Acceptance**: manual_override
> **External Reviewer**: chris
> **External Source**: owner-override
> **External Started**: 2026-06-12 04:26 +08
> **External Completed**: 2026-06-12 04:26 +08

- P1 blockers: none
- Manual Override: owner explicitly instructed this Goal to skip Claude verification and continue; Codex with_skill non-dry-run is accepted as sufficient row 2 evidence for this sprint run.
- P2 advisories: token delta is approximate; Claude with_skill can be rerun later for cross-agent confidence but is no longer a blocking gate in this Goal.
- Acceptance checklist: pass by owner override; implemented eval harness and Codex-side proof satisfy row 2 for this Goal.

## Behavior Diff Notes

- Runtime prompt-guard behavior did not change.
- New behavior is limited to benchmark assets and report generation:
  - `scripts/route-nl-vs-ts-eval.ts` emits scenarios, validates agent-authored NL decisions, and writes go/no-go reports.
  - `evals/evals.json` exposes `route-nl-vs-ts` to `bun run benchmark:skills`.
  - `tests/route-nl-vs-ts-eval.test.ts` locks TS-arm parity and report semantics.

## Residual Risks / Follow-ups

- Claude with_skill non-dry-run was skipped by owner override; later rerun remains useful for cross-agent confidence but is not required to continue this Goal.
- Because G1 is accepted by owner override, `loop-engine-03-shadow-injection` may start after row 2 ledger closeout.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 8/10 | Eval harness and Codex proof work; Claude proof is explicitly skipped by owner override. |
| Product depth | 8/10 | Captures go/no-go and token/false-positive evidence without runtime changes. |
| Design quality | 8/10 | Separates deterministic A arm from agent-authored NL B arm. |
| Code quality | 8/10 | Focused tests cover report and parity behavior. |

## Failing Items

- None for this Goal after owner override.

## Retest Steps

- Re-run:
  - `bun scripts/route-nl-vs-ts-eval.ts --check-report .ai/harness/runs/route-nl-vs-ts-report.json`
- Re-check:
  - Optional: rerun `bun run benchmark:skills -- --eval route-nl-vs-ts --agent claude --profile with_skill --iteration route-nl-vs-ts-claude-rerun` after Claude resets for extra evidence.

## Summary

- Implemented the row 2 eval harness and obtained a passing Codex with_skill non-dry-run: 8/8 route scenarios, 0 false positives, 0 false negatives, estimated token delta 1132, go. Claude with_skill was skipped by explicit owner override for this Goal, so row 2 is accepted and may close.
