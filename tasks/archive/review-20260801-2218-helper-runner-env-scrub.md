> **Archived**: 2026-08-01 22:18
> **Related Plan**: plans/archive/plan-20260801-2012-helper-runner-env-scrub.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260801-2218

# Task Review: helper-runner-env-scrub

> **Status**: Pending
> **Plan**: plans/plan-20260801-2012-helper-runner-env-scrub.md
> **Contract**: tasks/contracts/20260801-2012-helper-runner-env-scrub.contract.md
> **Notes File**: tasks/notes/20260801-2012-helper-runner-env-scrub.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-01 21:55
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 62daea2e542ef0a30cb0d2004f92b84f285bee31

## Human Review Card

- Verdict: pass
- Change type: bugfix
- Intended files changed: `scripts/run-bounded-verifier-command.ts`, `assets/templates/helpers/run-bounded-verifier-command.ts`, `tests/unit/verifier-evidence-lifecycle-cutover.test.ts`, `tasks/todos.md`, plus the plan/contract/notes/pre-fix artifacts named in the contract's Allowed Paths.
- Actual files changed: exactly those eight paths (`git show --stat 62daea2e`), all inside Allowed Paths; no path outside the contract scope.
- Commands passed: `bun test` full suite; `bun scripts/sync-helper-sources.ts --check`; `bash scripts/check-task-sync.sh`; `bun test tests/unit/verifier-evidence-lifecycle-cutover.test.ts` (the regression guard).
- Residual risks: a verification command that legitimately needs a `REPO_HARNESS_*` variable would now see it stripped. The contract's Falsifier names this and the cheapest proof point; the runner itself reads none of them, and the full suite is green.
- Reviewer action required: none; merged as PR #152 into `main` at `62daea2e`.
- Rollback: revert `62daea2e`; the bounded runner returns to inheriting the full environment, restoring the leak and no other behaviour change.

## Mode Evidence

- Selected route: bugfix (contract Task Profile `bugfix`, Root Cause Evidence gate satisfied).
- P1/P2/P3 evidence: `plans/plan-20260801-2012-helper-runner-env-scrub.md` plus `tasks/notes/20260801-2012-helper-runner-env-scrub.notes.md`, which records why the fix landed at the bounded runner's `spawn` rather than at the `helper-runner.ts:375-391` injection site.
- Root cause or plan evidence: `scripts/run-bounded-verifier-command.ts:49` spawned the verification command with the inherited environment, so the `REPO_HARNESS_*` set injected for helper dispatch reached the nested command and overrode fixture-local repo-root resolution.

## Verification Evidence

- Waza `/check` run: gatekeeper acceptance pass on the delivered branch before merge.
- Commands run: `bun test` (full suite), `bun scripts/sync-helper-sources.ts --check`, `bash scripts/check-task-sync.sh`, `bun test tests/unit/verifier-evidence-lifecycle-cutover.test.ts`.
- Manual checks: red-before-green causality confirmed against the captured pre-fix run — the same bounded-runner invocation exits 1 with `12 pass / 1 fail` at `tests/evidence-recovery-materializer.test.ts:220` on the unfixed code and exits 0 with `13 pass / 0 fail` after the fix.
- Supporting artifacts: `tasks/notes/20260801-env-scrub.pre-fix.log`. The original capture recorded the symptom suite (`tests/evidence-recovery-materializer.test.ts`) rather than the declared `regression_guard`, and carried no `PRE_FIX_EXIT=` line, so the Root Cause Evidence gate failed at closeout. A clearly labelled retroactive capture of the declared guard was appended during this closeout — the original bytes are untouched — showing `6 pass / 1 fail` on `62daea2e^` with `PRE_FIX_EXIT=1`. The guard itself was always the right one; only the capture was wrong.
- Implementation notes reviewed: yes — `tasks/notes/20260801-2012-helper-runner-env-scrub.notes.md`.
- Run snapshot: `.ai/harness/runs/` (gitignored runtime evidence for this closeout run).

## Manual Check Evidence

- [x] Downstream helper surface stays green after the scrub
  - Evidence: full `bun test` run on the delivered branch — 123 pass / 0 fail across the helper-facing surface, no test relying on an inherited `REPO_HARNESS_*` value.
- [x] Packaged helper mirror is byte-identical to its source
  - Evidence: `bun scripts/sync-helper-sources.ts --check` reports the projection OK, so `assets/templates/helpers/run-bounded-verifier-command.ts` matches `scripts/run-bounded-verifier-command.ts` exactly.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:0691639bc234c94cd7b082b85acd5492939a2829b45cb98287d838321b41844a
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 62daea2e542ef0a30cb0d2004f92b84f285bee31
> **Verification Evidence SHA256**: sha256:6b5cc235e7c26589008a0eefcabb7b774376f3f8ede6f7794ec466f5ff80afd3
> **Issued At**: 2026-08-01T14:16:52.204Z

- Summary: PR #152 merged at 62daea2e: bounded verifier runner strips the whole REPO_HARNESS_ prefix from its child environment. Contract allowed_paths held exactly, packaged mirror byte-identical, downstream helper surface 123/0, contract exit criteria 14/0 Fulfilled. Closeout appended a labelled retroactive capture of the declared regression_guard to the pre-fix artifact rather than rewriting it.
- Findings: none

## Behavior Diff Notes

- A bounded verifier child no longer sees any `REPO_HARNESS_`-prefixed variable; every other variable passes through untouched.
- The scrub is by whole prefix, not a curated list, so a newly added harness variable cannot silently re-open the hole.
- `src/cli/runtime/helper-runner.ts`'s injection is unchanged — it remains the legitimate contract of helper dispatch.

## Residual Risks / Follow-ups

- The `checks/latest.json` provenance-overlay defect observed during this task was out of scope here and was ledgered separately; it is fixed in the sibling `verify-provenance-overlay` work-package.
- The pre-fix artifact was captured against the symptom suite instead of the declared `regression_guard`, and the gap only surfaced at closeout because the Root Cause Evidence gate never ran before merge. The gate did its job; the capture step is where the discipline slipped.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Root cause fixed at the correct boundary; red-before-green causality proven against a captured pre-fix artifact. |
| Product depth | 8/10 | Restores the gate's core promise — evidence produced in the project's real environment, not a mutated one. |
| Design quality | 9/10 | Whole-prefix categorical invariant instead of a curated deny-list; injection site left alone. |
| Code quality | 9/10 | Small, commented, mirrored into the packaged helper, covered by a regression guard. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/unit/verifier-evidence-lifecycle-cutover.test.ts`
- Re-check: `bun scripts/sync-helper-sources.ts --check`

## Summary

- Merged as PR #152 (`62daea2e`). The bounded verifier runner strips the whole `REPO_HARNESS_` prefix from its child environment, so a gate's verification command observes the project's real behaviour. Contract Allowed Paths held exactly, the packaged mirror is byte-identical, and the downstream helper surface is 123/0. Closeout found one defect in the package's own evidence — the pre-fix artifact captured the symptom suite, not the declared `regression_guard` — and resolved it by appending a labelled retroactive capture of the declared guard rather than rewriting the artifact or the contract. Recommendation: pass, archive as Completed.
