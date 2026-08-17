# Task Review: unplanned-implementation-advice

> **Status**: Pending
> **Plan**: plans/plan-20260818-0450-unplanned-implementation-advice.md
> **Contract**: tasks/contracts/20260818-0450-unplanned-implementation-advice.contract.md
> **Notes File**: tasks/notes/20260818-0450-unplanned-implementation-advice.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-18 04:50
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `src/cli/hook/stop-handler.ts`, `tests/stop-handler-unplanned-implementation.test.ts`, plus this slice's plan/contract/notes/review
- Actual files changed: same; no other path touched
- Commands passed: `bun test` (2480 pass / 0 fail), `bun run check:type`, contract gate
- Residual risks: this runs on every Stop, the route already measured as the largest share of hook time. Added work is one `Array.filter` over an already-computed array plus, only on a hit, one file append. No new subprocess.
- Reviewer action required: inspect diff and card
- Rollback: revert the stop-handler change; the advisory is additive and the evidence file is ignored runtime state.

## Mode Evidence

- Selected route: code-change — closes an observation gap, not a defect in existing behavior.
- P1/P2/P3 evidence: P1 `PlanStatusGuard` lives only in `mutation-guard.ts:552`, reachable only through the `PreToolUse` `Edit|Write` route (`route-registry.ts`); no diff-derived equivalent exists in `src/` or `scripts/`. P2 traced a shell append to `.github/workflows/ci.yml` on 2026-08-18: no `PreToolUse` route matched, `PostToolUse.bash` routes to `command-observed` which observes rather than blocks, and with no contract present no `allowed_paths_check` ever ran. P3 the invariant to preserve is that authorization is decided from the changed set, not from the tool that produced it; the smallest change that respects it is to read the changed set Stop already computes, rather than to parse shell commands.
- Root cause or plan evidence: `plans/plan-20260818-0450-unplanned-implementation-advice.md`; notes record why a shell parser was rejected.

## Verification Evidence

- Waza `/check` run: not run; the contract gate plus the full suite covered this slice.
- Commands run: `bun test`, `bun run check:type`, `bash scripts/verify-sprint.sh --prepare-acceptance`.
- Manual checks: confirmed `computeArchitectureDriftChangedSet` reads `git status --porcelain -z` (`architecture-drift.ts:96`), which is the falsifier named in the contract — the changed set is git-derived, so it does not inherit the blind spot it covers.
- Supporting artifacts: `.ai/harness/runs/unplanned-implementation.jsonl` (created on first hit; ignored runtime evidence)
- Implementation notes reviewed: yes — `tasks/notes/20260818-0450-unplanned-implementation-advice.notes.md`
- Run snapshot: recorded by the contract gate under `.ai/harness/runs/`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:769698fe07b00c98833cc33d0c29454c2c7c0c2ce114394621462968b60ef3e6
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 9ccd6fb188d78e63381dbdbc385ef7f974618331
> **Verification Evidence SHA256**: sha256:c141796f0388f683a5921d3458327f55b0d42210f8bec78796b940706afd7d01
> **Issued At**: 2026-08-17T21:02:57.919Z

- Summary: Stop-time advisory over the git-derived changed set; shell-parser shape explicitly rejected. 7/7 contract criteria pass, full suite 2480 pass / 0 fail, typecheck clean.
- Findings: none

## Behavior Diff Notes

- Before: an implementation change written by any means other than an `Edit`/`Write` tool call, on `main` with no active plan, produced no signal anywhere.
- After: Stop emits two stderr lines naming the count, up to three paths, and the `capture-plan` remedy, and appends one JSONL record.
- Unchanged: exit code, the `decision: block` stdout path, lite profile, sessions with an active plan, and changed sets that are workflow-surface only.

## Residual Risks / Follow-ups

- Advisory only by design. Whether it should ever block is deliberately left undecided until the JSONL shows what actually trips it.
- A hit on `main` during ordinary quick fixes is expected and is not by itself evidence of a problem; the upgrade decision needs the hits read, not counted.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Four cases covering fire, active-plan silence, workflow-surface silence, and clean tree; exit code asserted unchanged in all |
| Product depth | 7/10 | Closes the one genuinely uncovered case and refuses to guess at the enforce decision |
| Design quality | 9/10 | Reuses the existing exported classifier and the already-computed changed set; explicitly rejects the shell-parser shape and says why |
| Code quality | 8/10 | One filter, two stderr lines, one wrapped append; no new subprocess, no new typed contract |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/stop-handler-unplanned-implementation.test.ts`
- Re-check: `bun test` and `bun run check:type`

## Summary

- Stop now observes implementation changes that carry no active plan, reading the git-derived changed set rather than the tool that produced the write. Advisory and evidence-collecting; the enforce question stays open until the evidence exists.
