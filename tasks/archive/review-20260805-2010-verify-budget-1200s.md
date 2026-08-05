> **Archived**: 2026-08-05 20:10
> **Related Plan**: plans/archive/plan-20260805-1950-verify-budget-1200s.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260805-2010

# Task Review: verify-budget-1200s

> **Status**: Complete
> **Plan**: plans/plan-20260805-1950-verify-budget-1200s.md
> **Contract**: tasks/contracts/20260805-1950-verify-budget-1200s.contract.md
> **Notes File**: tasks/notes/20260805-1950-verify-budget-1200s.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-05 20:35
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

The two `pending` header fields are rubric metadata only; the authoritative
reviewed-subject hash and target revision are the ones the receipt tooling
writes into the Acceptance Receipt Projection below. They are not hand-copied
here, because editing this file after the receipt is recorded would invalidate
the recorded subject hash.

## Human Review Card

- Verdict: pass (second review round; the first round returned FAIL)
- Change type: code-change
- Intended files changed: the budget constant in both helper copies, the pinned assertion in `tests/unit/verifier-evidence-lifecycle-cutover.test.ts`, one new projection drift-check test under `tests/unit/`
- Actual files changed: exactly that set. 4 modified (`scripts/verify-contract.sh`, `assets/templates/helpers/verify-contract.sh`, `tests/unit/verifier-evidence-lifecycle-cutover.test.ts`, `tasks/todos.md` ledger header) totalling +4 -4, plus 5 new files (`tests/unit/helper-projection-drift.test.ts` and the plan/contract/notes/review workflow artifacts). Every path is inside the widened `allowed_paths`; no other line of either helper moved.
- Commands passed: `bun run check:type`; `grep -q 'VERIFICATION_BUDGET_MS=1200000' scripts/verify-contract.sh`; `grep -q 'VERIFICATION_BUDGET_MS=1200000' assets/templates/helpers/verify-contract.sh`; `bash scripts/check-task-sync.sh`; `bun test tests/unit/verifier-evidence-lifecycle-cutover.test.ts tests/unit/helper-projection-drift.test.ts` (11 pass / 0 fail); `bun scripts/sync-helper-sources.ts --check`; `cmp` byte-equality of the two helper copies
- Residual risks: see Residual Risks / Follow-ups
- Reviewer action required: none
- Rollback: revert the single commit; both copies return to 600000, the pinned assertion returns with them, and the drift test disappears. No migration involved.

## Mode Evidence

- Selected route: two-round acceptance gate. Round 1 reviewed a diff that changed only `scripts/verify-contract.sh:5` and returned FAIL with three findings. Round 2 reviewed the remediated diff.
- P1/P2/P3 evidence: P1 - the gate surface is the verification helper, which exists twice: `scripts/` (what this repo runs) and `assets/templates/helpers/` (the shipped projection a downstream repo receives, and the package-sourced copy `src/cli/runtime/helper-runner.ts:292` resolves when `REPO_HARNESS_SOURCE_ROOT` is unset). P2 - traced the constant to its two consumers inside the helper: `:635` builds the whole-round deadline as `verification_started_ms + VERIFICATION_BUDGET_MS`, `:555` emits it as the report's `budget_ms`, so one constant governs both the kill and the evidence. P3 - the budget stays a fixed policy line rather than an env knob, because a per-invocation override would let a failing round be relaxed into a passing one; that is exactly why the contract lists env-override mechanisms as out of scope.
- Root cause or plan evidence: Task Profile is `code-change`, so the Root Cause Evidence block is not required.

## Verification Evidence

- Waza `/check` run: not run as a separate skill; the contract exit criteria plus targeted independent probes were run directly.
- Commands run:

| Command | Result |
|---|---|
| `bun run check:type` | exit 0 |
| `grep -q 'VERIFICATION_BUDGET_MS=1200000' scripts/verify-contract.sh` | exit 0 |
| `grep -q 'VERIFICATION_BUDGET_MS=1200000' assets/templates/helpers/verify-contract.sh` | exit 0 |
| `bash scripts/check-task-sync.sh` | exit 0 |
| `bun test tests/unit/verifier-evidence-lifecycle-cutover.test.ts tests/unit/helper-projection-drift.test.ts` | 11 pass / 0 fail, 40 expect() calls |
| `cmp scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh` | identical |
| `bun scripts/sync-helper-sources.ts --check` | exit 0, `[helpers] projection OK: 52 helpers (sha256:5debed2440918a23edca54cac47816da76e079ccd2321c4e0828b687adba42ea)` |

- Manual checks (independent of the worker's own enumeration):
  - Pair count recomputed from the two directory listings: 52 filenames in both `scripts/` and `assets/templates/helpers/`.
  - Baseline divergence swept independently with `cmp` over `git show HEAD:` on both sides of all 52 pairs: exactly one divergent pair, `capability-resolver.ts`. The exclusion list is therefore complete and minimal - 51 pairs are genuinely asserted, and nothing else is being quietly excluded.
  - The `capability-resolver.ts` exclusion reasoning was verified from the artifacts, not taken on trust: the assets copy opens with `// @generated-from src/core/capabilities/registry.ts sha256:015424e6…` and `Standalone typed Bun projection. Regenerate from scripts/capability-resolver.ts; do not edit by hand.`, and inlines the registry types (27,719 bytes) that the scripts copy imports from `../src/core/capabilities/registry` (12,646 bytes). It is a generated non-copy projection, not drift. Excluding it leaves no unguarded hole: `tests/capability-resolver.test.ts:98-104` recomputes that sha256 and pins the provenance header, so the generated copy has its own authority.
  - Round-1 finding 1 closed: the previously failing assertion now passes as part of the 11/0 run above.
  - Round-1 finding 3 closed: both copies read 1200000 and are byte-identical again, confirmed by `cmp` and by the repo's own `sync-helper-sources.ts --check`.
- Supporting artifacts: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`
- Implementation notes reviewed: `tasks/notes/20260805-1950-verify-budget-1200s.notes.md` - the recorded pair enumeration (52 pairs, 51 asserted, 1 excluded) matches my independent sweep exactly, including the two file sizes and the provenance-header reasoning.
- Run snapshot: `.ai/harness/runs/`

## Round 1 Findings And Their Remediation

| # | Round-1 finding | Status | Evidence it is closed |
|---|---|---|---|
| 1 | CRITICAL `tests/unit/verifier-evidence-lifecycle-cutover.test.ts:123` asserted `VERIFICATION_BUDGET_MS=600000`; the diff turned that test red (measured 6 pass / 1 fail), and the contract's exit criteria excluded `bun test` so the gate could not see it | Closed | Assertion synced to `1200000`; the file now runs 11 pass / 0 fail together with the new drift test, and both files are now listed under the contract's `tests_pass` |
| 2 | CRITICAL the change did not affect the executed code path: `src/cli/runtime/helper-runner.ts:277-294` resolves helpers from `REPO_HARNESS_SOURCE_ROOT` (set on this machine to the global install) or else the packaged `assets/templates/helpers/`; a probe run reported `"budget_ms": 600000` while the worktree script already read 1200000 | Handled outside the diff | Two parts. The projection half is fixed here (the packaged copy now carries 1200000, so a fresh install gets the new budget). The stale-global-install half is an orchestration decision, not a code defect: verification rounds are run with `REPO_HARNESS_SOURCE_ROOT` pointed at the reviewed worktree so the committed helper executes. Confirmed at acceptance time by reading `budget_ms` back out of the run report. |
| 3 | HIGH `assets/templates/helpers/verify-contract.sh:5` still read 600000, breaking a byte-identical projection pair with no local test comparing the two copies | Closed | Both copies at 1200000, `cmp` identical, `sync-helper-sources.ts --check` OK, and `tests/unit/helper-projection-drift.test.ts` now pins byte-equality for all 51 copy pairs inside `bun test` |

## Behavior Diff Notes

- The whole-round verification deadline moves from 600s to 1200s. Kill behavior, fail-closed semantics, the deadline arithmetic at `:635`, and the `budget_ms` evidence field at `:555` are otherwise untouched - one constant feeds all of them.
- No env override was introduced. `tests/unit/verifier-evidence-lifecycle-cutover.test.ts` still asserts `not.toContain('REPO_HARNESS_VERIFICATION_BUDGET')`, so the budget remains a fixed policy line rather than a per-invocation knob.
- Downstream and freshly installed repos now receive the same budget as this repo, because the packaged projection carries the same constant.
- New failure mode added deliberately: a one-sided helper edit now fails `bun test` instead of diverging silently.

## Residual Risks / Follow-ups

- The raised budget does not retroactively fix an already-installed global package. Until `repo-harness` is republished and reinstalled, any `repo-harness run verify-*` invocation without `REPO_HARNESS_SOURCE_ROOT` pointed at a current checkout still executes the old 600000 helper from the global install. This is orchestration state, not a defect in this diff.
- `VERIFIER_HELPER_TIMEOUT_MS = 720_000` at `src/cli/runtime/helper-runner.ts:13` is a second, outer ceiling that this change does not touch. With a worst measured full round near 604s it currently fits, but it now sits below the 1200s internal budget, so a round between 720s and 1200s would be killed by the wrapper rather than by the gate. Out of scope here; worth a follow-up if full rounds keep growing.
- Guard overlap, accepted: `scripts/check-ci.sh:56` already ran `bun run check:helpers` (`sync-helper-sources.ts --check`), so CI would have caught the round-1 projection drift at PR time even though nothing failed locally. The new test is not redundant in practice - it moves the guard into `bun test`, where contract exit criteria actually look, and adds two things the sync tool does not express: an honesty check that every documented exclusion is still a real divergent pair, and a direct cross-copy assertion of the budget constant.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Both copies, the pinned assertion, and a runtime-enumerated drift guard; the residual outer 720s ceiling is named rather than papered over |
| Product depth | 9/10 | Fixes the class (silent one-sided helper edits) rather than only the instance that was found |
| Design quality | 9/10 | One constant, no env knob, exclusions carry reasons and are themselves checked for staleness |
| Code quality | 9/10 | The drift test enumerates the intersection at runtime instead of hard-coding a list, so later helper pairs are covered without maintenance |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/unit/verifier-evidence-lifecycle-cutover.test.ts tests/unit/helper-projection-drift.test.ts`; `bun run check:type`; `bun scripts/sync-helper-sources.ts --check`
- Re-check: `cmp scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh`, and read `budget_ms` back out of a verify run report to confirm which helper copy actually executed.

## Summary

Second-round PASS. The remediated diff closes both closable round-1 findings with evidence: the pinned assertion is synced and green, and the shipped projection is byte-identical again by `cmp`, by the repo's own `sync-helper-sources.ts --check`, and now by a test inside `bun test`. I re-derived the pair enumeration independently rather than trusting the notes - 52 intersecting filenames, exactly one baseline-divergent pair, and that pair (`capability-resolver.ts`) is a generated standalone projection carrying its own `@generated-from … sha256:` provenance and guarded by `tests/capability-resolver.test.ts`, so excluding it from byte-equality leaves no hole. The change stays one constant plus its guards: no env override, no other helper line touched, deadline and evidence semantics unchanged. The remaining execution-path concern from round 1 is not a property of this diff - it is which copy the runner resolves - and is handled at acceptance time by pointing `REPO_HARNESS_SOURCE_ROOT` at this reviewed worktree and reading `budget_ms` back from the run report. Recommendation: pass.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:83d390fbddd3de42358fa95ad1aa9e4c4ea2a37d1001716cb9890a8e2c252e85
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 699bc70c6b58bcb37bca8b0673f865ef2b3c1059
> **Verification Evidence SHA256**: sha256:42112b9bbd1cf38559c95beca2babc640d63a083b0f738104629a40686c30954
> **Issued At**: 2026-08-05T12:09:36.420Z

- Summary: Gatekeeper second-round PASS. Round 1 returned FAIL on a stale assets/templates/helpers projection and a pinned 600000 assertion; both are closed with evidence. Both helper copies read VERIFICATION_BUDGET_MS=1200000 and are byte-identical (cmp, plus sync-helper-sources.ts --check reporting 52 helpers OK), the pinned assertion is synced, and tests/unit/helper-projection-drift.test.ts pins byte-equality for 51 copy pairs with capability-resolver.ts excluded as a generated non-copy projection (independently re-derived: 52 intersecting filenames, exactly one baseline-divergent pair, guarded separately by tests/capability-resolver.test.ts). Verification run with REPO_HARNESS_SOURCE_ROOT pointed at this reviewed worktree reported budget_ms 1200000 and total=11 failed=0 Fulfilled.
- Findings: none

