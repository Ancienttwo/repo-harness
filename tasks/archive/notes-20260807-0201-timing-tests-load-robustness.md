> **Archived**: 2026-08-07 02:01
> **Related Plan**: plans/archive/plan-20260807-0104-timing-tests-load-robustness.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260807-0201

# Implementation Notes: timing-tests-load-robustness

> **Status**: Active
> **Plan**: plans/plan-20260807-0104-timing-tests-load-robustness.md
> **Contract**: tasks/contracts/20260807-0104-timing-tests-load-robustness.contract.md
> **Review**: tasks/reviews/20260807-0104-timing-tests-load-robustness.review.md
> **Last Updated**: 2026-08-07 01:04
> **Lifecycle**: notes

## Design Decisions

Diagnosis came from the retained failure log the previous work-package added — `.ai/harness/runs/run-20260807T004613-2770-bun-test.log` in the bundle worktree. Before retention existed these five were `exit=1` and nothing else; each failure's output is now quoted below. None of the five is a product-guarantee breach, so the Falsifier does not fire.

**1-3. `tests/continuation-attempt.test.ts` (5029ms / 5035ms / 5052ms).** All three spawn several `bun` CLI subprocesses through `runStateCli`. The reported assertion failure is `expect(run.status).toBe(0)` receiving `null` — `status: null` means the child was killed by a signal, which is bun's own 5000ms per-test timeout tearing down the subprocess mid-flight, not a CLI error. Each is followed by `^ this test timed out after 5000ms` and `killed 1 dangling process`, confirming the timeout as cause rather than symptom. Fix class: explicit `}, 30_000)` per test, matching the file's own existing idiom at line 264 (`}, 120_000`) and the repo-wide convention (`tests/harness-circuit-breakers.test.ts:282`, `tests/hook-dispatch-diet-report.test.ts:210`). Invariant preserved: every assertion is untouched, and hang detection survives — a genuinely hung CLI still fails, six times slower to notice.

**4. `closeout-runner-guardrails.test.ts` "supervised spawn failure returns a bounded error" (`toBeLessThan(500)` got 641).** The test asserts a spawn failure of a missing binary returns instead of hanging on pipe close. 641ms is well inside the call's own `timeoutMs: 1_000`, and the run still reported `timedOut === false`, so the product bound was never breached — the 500 was a wall-clock sample, not a product guarantee, and no constant anywhere requires it. Widened to 5_000. Invariant preserved: `timedOut === false` is what proves the failure was detected at spawn rather than by consuming the 1s bound; the duration assertion only has to separate "returned" from "hung", and a hang is unbounded, so any finite ceiling catches it.

**5. `closeout-runner-guardrails.test.ts` "retains its token until a leaderless provider group is drained" (contender entered during `Bun.sleep(100)`).** The old shape waited for the contender to announce it was attempting, slept 100ms, then asserted the contender had not acquired the lock. Under load the producer's drain completed inside that window and the contender entered — correct product behavior that the fixed sleep read as a violation. The assertion was unsound in both directions: it passed only when the drain happened to be slower than 100ms, which is a property of machine load, not of the guarantee.

  Replaced with synchronization on the ordering the invariant actually claims. `installProducerSignalCleanup` (`scripts/run-harness-profile-benchmark.ts:293-313`) runs `terminateActiveProviderGroups()` → `releaseActiveExpensiveRunLock()` → `process.exit(exitCode)`, so "token retained until drained" is observable as: the contender cannot enter before the producer is gone. The test now races `waitForPath(contenderEntered)` against `producer.exited` and asserts the producer wins. No production code was touched, so the Stop Condition on that point does not fire.

  Non-vacuity proven by mutation rather than claimed: removing `withHarnessBenchmarkExecutionLock` from the fixture's producer worker (so the token is never retained) flips the race and fails the assertion — `Expected: false, Received: true`. The mutation was reverted immediately. Stability proven by 12 consecutive isolated runs of this test (0 failures) plus three consecutive full runs of both files and one run under three parallel `bun test` load generators.

## Deviations From Plan Or Spec

- None. All five stayed inside the two named test files; no production code, no other tests, no bun config.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Raise the sleep in test 5 from 100ms to something larger | Rejected | Keeps the unsound premise — it would still be asserting that the drain is slower than an arbitrary constant, and would re-flake on the next slower machine |
| Assert test 5's ordering against the descendant's death instead of the producer's exit | Rejected | The descendant's PID is not observable from the test, and reaching it would require a production probe — an explicit Stop Condition |
| Tighten test 4 toward the 1s `timeoutMs` instead of 5_000 | Rejected | The wall-clock number carries no guarantee; `timedOut === false` already fences the timeout path, so a tighter bound only re-buys load sensitivity |

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
