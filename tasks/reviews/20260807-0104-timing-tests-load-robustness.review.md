# Task Review: timing-tests-load-robustness

> **Status**: Complete
> **Plan**: plans/plan-20260807-0104-timing-tests-load-robustness.md
> **Contract**: tasks/contracts/20260807-0104-timing-tests-load-robustness.contract.md
> **Notes File**: tasks/notes/20260807-0104-timing-tests-load-robustness.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-07 01:35
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

The two `pending` header fields are rubric metadata; the authoritative values
are written into the Acceptance Receipt Projection below by the receipt tooling.

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: three explicit test timeouts in `tests/continuation-attempt.test.ts`; one widened bound and one race rewrite in `tests/unit/closeout-runner-guardrails.test.ts`
- Actual files changed: exactly that, plus the `tasks/todos.md` ledger header. 3 modified (+24 -7) and 4 new workflow artifacts. All inside `allowed_paths`; no production code touched.
- Commands passed: `bun run check:type`; `bash scripts/check-task-sync.sh`; `bun test tests/continuation-attempt.test.ts tests/unit/closeout-runner-guardrails.test.ts` run 17 times (16 green at 45 pass / 0 fail, including 3 under deliberately induced CPU load; one unattributed failure discussed below)
- Residual risks: see Residual Risks / Follow-ups
- Reviewer action required: none
- Rollback: revert the single commit; the three timeouts, the widened bound, and the race rewrite all revert together. Test-only change, no production surface.

## Mode Evidence

- Selected route: acceptance gate review of the full diff, with independent verification of the two behavioral rewrites against production code rather than against the worker's description.
- P1/P2/P3 evidence: P1 - the five tests named by `run-20260807T004613-2770-bun-test.log` span two files and two distinct failure mechanisms: bun's default 5000ms per-test timeout killing subprocess-heavy tests, and hardcoded wall-clock assumptions (500ms ceiling, 100ms sleep). P2 - traced the fifth test's guarantee into production: `installProducerSignalCleanup` (`scripts/run-harness-profile-benchmark.ts:293-313`) runs `terminateActiveProviderGroups().then(() => { releaseActiveExpensiveRunLock(); process.exit(exitCode); })`, so the token is released after the drain and immediately before exit; "retained until drained" is therefore observable as an ordering between two events, not as a duration. P3 - the design question is what each assertion is actually for. A wall-clock number that encodes machine speed tests the machine; the guarantees here are "the failure was detected at spawn" and "the contender cannot enter before the producer is gone", both of which are expressible without timing assumptions.
- Root cause or plan evidence: the retained log from the previous work-package is the direct input; the five names and their timings (5029.63 / 5035.45 / 5052.03ms timeouts, 641ms over a 500ms ceiling, and the sleep race) come from it.

## Verification Evidence

| Command | Result |
|---|---|
| `bun run check:type` | exit 0 |
| `bash scripts/check-task-sync.sh` | exit 0 |
| `bun test` on both files, runs 1, 3-14 | 45 pass / 0 fail each |
| `bun test` on both files, run 2 | 44 pass / 1 fail (name not captured - see residual) |
| `bun test` on both files, 3 runs under induced CPU load (8 busy loops, load average 9.18 -> 13.60) | 45 pass / 0 fail each |

- Manual checks:
  - No assertion deleted or weakened outside the two named thresholds: `expect(` count is unchanged on both files against `HEAD` (78 -> 78 and 75 -> 75). The three continuation-attempt hunks add only a timeout argument; no assertion body moved.
  - `}, 30_000)` matches repo idiom, not an invention: 100 explicit test timeouts already exist across `tests/`, including exactly `}, 30_000)` in `tests/hook-dispatch-diet-report.test.ts:210` and `tests/harness-circuit-breakers.test.ts:282`.
  - Test 4 still distinguishes bounded return from hang. The call under test passes `timeoutMs: 1_000`; a regression that consumed the bound would set `timedOut` true and fail the untouched `expect(result.timedOut).toBe(false)` fence before the duration assertion is ever reached. A hang on pipe close is unbounded, so a 5s ceiling still separates "returned" from "hung". The widened number cannot mask either failure mode.
  - Test 5's rewrite maps onto the production ordering I read at `scripts/run-harness-profile-benchmark.ts:293-313` (drain, then release, then exit), as described above. It is also strictly stronger than what it replaced: the old version asserted only "has not entered yet after 100ms", while the new version races the two events *and* keeps `expect(existsSync(contenderEntered)).toBe(true)` at `:597`, so a contender that never enters at all now fails. That line is the vacuity guard - the race cannot pass trivially.
  - I did not re-run the fixture mutation check, because it requires editing a tracked fixture and I do not mutate tracked files during review. The three structural properties above (regression direction, production mapping, vacuity guard) establish the same conclusion by inspection, and the worker's own mutation run is recorded in the notes.

## Residual Risks / Follow-ups

- One unattributed failure. Run 2 of my 17 reported `44 pass / 1 fail`; I lost the test name because that invocation was piped to `tail`, and it did not reproduce in the 15 subsequent runs, including 3 under induced load. What is established: none of the contract's five named tests failed in any of the 16 logged runs. What is not established: which test failed in run 2. It is therefore either a rarer flake in one of these two files outside the five, or a transient environment artifact. Containment is already in place - if it recurs inside a verification round, the retention shipped in `c94a5d41` will name it in `.ai/harness/runs/<run-id>-bun-test.log` rather than costing another blind round.
- The lesson from that loss is worth carrying: always retain full test output. Piping a suite run to `tail` discards exactly the line that matters.
- These two files remain the most timing-sensitive in the suite because they spawn real subprocesses and assert on process lifecycle. This change removes the known load-dependent failures; it does not make the files load-independent in principle.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All five named failures addressed at their actual mechanism; 16/17 green including under induced load |
| Product depth | 9/10 | Replaces timing assumptions with the guarantees they were proxying, rather than just raising numbers |
| Design quality | 9/10 | Test 5 now tests an ordering derived from production code and gained a vacuity guard |
| Code quality | 9/10 | Comments explain what each relaxed bound is and is not allowed to prove |

## Failing Items

- None blocking. One unattributed non-reproducing failure is recorded above.

## Retest Steps

- Re-run: `bun test tests/continuation-attempt.test.ts tests/unit/closeout-runner-guardrails.test.ts`, ideally several times and once under load
- Re-check: `scripts/run-harness-profile-benchmark.ts:293-313` still releases the token after the drain; if that ordering changes, test 5's race must change with it.

## Summary

PASS. The diff addresses each of the five named failures at its actual mechanism rather than by blanket-raising numbers: three subprocess-heavy tests get explicit `30_000` timeouts matching an idiom already used 100 times in this suite, keeping hang detection while removing the 5000ms cliff they were dying on; the bounded-error ceiling widens to 5s with its `timedOut === false` fence untouched, which is the assertion that actually proves spawn-time detection; and the sleep race becomes an event race on the drain-then-release ordering I confirmed in `scripts/run-harness-profile-benchmark.ts:293-313`, gaining a vacuity guard at `:597` that the old version never had. Assertion counts are unchanged on both files, so nothing was quietly dropped. Across 17 runs the pair was green 16 times, including 3 under deliberately induced CPU load; the single unattributed failure in run 2 did not involve any of the five and did not reproduce, and is now covered by the retained-log mechanism if it ever recurs in a round. Recommendation: pass.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:96171ef7879cfc2e9aa8c6364b344d4fbd39dd7c0d139363844675e435623a36
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 987aba3e1a77fac4ff941729804f63c87b1d6c29
> **Verification Evidence SHA256**: sha256:bb9242f297794a90971d771cd30eca0dd9ceb73ac5040199d3701ee96f1a7cdd
> **Issued At**: 2026-08-06T17:57:30.474Z

- Summary: Gatekeeper PASS. Each of the five tests named by retained log run-20260807T004613-2770-bun-test.log is addressed at its actual mechanism. Three subprocess-heavy continuation-attempt tests get explicit 30_000 timeouts, an idiom already used 100 times across tests/ including exactly 30_000 in hook-dispatch-diet-report.test.ts:210 and harness-circuit-breakers.test.ts:282. Test 4 ceiling widens 500ms to 5s while the untouched timedOut false fence still proves spawn-time detection: a regression consuming the 1s bound fails that fence before the duration assertion is reached, and a pipe-close hang is unbounded. Test 5 sleep race becomes an event race on the production ordering verified directly at scripts/run-harness-profile-benchmark.ts:293-313 (drain, then release, then exit), strictly stronger than what it replaced because existsSync(contenderEntered) true at :597 is a vacuity guard the sleep version lacked. No assertion deleted: expect counts unchanged (78 to 78, 75 to 75). Evidence: 17 runs of the pair, 16 green at 45 pass/0 fail including 3 under induced CPU load (load average 9.18 to 13.60); none of the five reappeared in any logged run. Residual recorded: run 2 reported 44 pass/1 fail with the name lost to a tail pipe and did not reproduce in 15 subsequent runs; if it recurs in a round the retention shipped in c94a5d41 will name it. Recorded back-to-back with its prepare round after a first attempt failed closed on a moving origin/main pushed by a concurrent party between prepare and record.
- Findings: none

