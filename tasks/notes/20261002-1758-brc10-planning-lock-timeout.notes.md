# Implementation Notes: brc10-planning-lock-timeout

> **Status**: Active
> **Plan**: plans/plan-20261002-1758-brc10-planning-lock-timeout.md
> **Contract**: tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md
> **Review**: tasks/reviews/20261002-1758-brc10-planning-lock-timeout.review.md
> **Last Updated**: 2026-10-02 17:58
> **Lifecycle**: notes

## Design Decisions

- ...

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

## Root cause and concrete trace

- Pre-fix exact main9aef6693 in this worktree: `/tmp/brc10-lock-pre-fix.log`, PRE_FIX_EXIT=1. Unchanged two-OS-caller brc10 test fails at247 while waiting for group planning.lock.
- P1: campaign recovery owns retirement/recovery-intent/recovered/final ordering; group planning lock protects immutable journal and recovery mutation; existing Binding/Task locks protect exact next generation, token and actor; budget/attempt locks own idempotent settlement.
- P2: two OS calls -> recoverCampaignDispatch -> retireCampaignDispatch -> withCampaignPlanningLock -> automaticReclaimLease -> resumeReclaimedEngineerTask -> persistPlanningRecord(recovered) -> settleRecoveredCampaignWorkerFinal -> budget/attempt settlement. Temporary timestamps discriminate valid long-held lock from leak/re-entry. `/tmp/brc10-lock-phase-trace.jsonl` shows PID90750 acquired at1790935282269, recovered publication/settlement start1790935286846, settlement end1790935288360, release1790935288361:6092ms hold,1514ms settlement; PID90748 starts waiting at1790935282294 and times out before release. Lock releases normally. Logs `/tmp/brc10-lock-instrumented-repro.log`; no claim that host load caused it.
- Root cause: recoverCampaignDispatch unnecessarily retains group planning.lock through slow final authority readback/settlement after recovered publication, exceeding existing5000ms acquisition budget for its concurrent peer.
- P3: keep persisted recovery intent, exactly-once generation transition/rebind and immutable recovered publication under existing group lock; release it before existing idempotent final settlement. Settlement still calls live campaign/envelope/actor validation and uses existing automation usage and attempt mutexes/conflict checks. Crash hook after_recovered remains before lock release/settlement, so crash replay boundaries remain. No lock bypass, scope weakening, duplicate generation or compensating cleanup. At10x callers journal/rebind remains serialized; final readback no longer extends that critical section. Extreme slow I/O may still produce intentional bounded contention; no universal latency guarantee is claimed.
- Independently verified store ownership: appendAutomationUsage uses run lock; recordTaskAutomationAttemptOutcome uses work-package lock and rejects differing replay. settleRecoveredCampaignWorkerFinal requires durable exact next generation plus current campaign/envelope/ClaimActor authority before settling.
- Repair is only campaign-recovery.ts: move existing settlement after withCampaignPlanningLock returns, retaining returned final/disposition. No new dependency, file abstraction, adapter, output parser, test assertion or timeout change. Temporary lock instrumentation restored byte-identical to main.

## Development evidence and regression guard

- Initial repair attempt had a duplicate local `final` declaration after moving it out of the nested block; Bun compile rejected it before execution. `/tmp/brc10-lock-fixed-instrumented.log` retained; corrected local name to settledFinal. No result from that failed attempt is counted as pass.
- Runtime repair proof: `/tmp/brc10-lock-fixed-instrumented-2.log` exit0,1pass/0fail/16filtered,8expects,28.04s. `/tmp/brc10-lock-fixed-phase-trace.jsonl` shows recovery lock holds3970ms/3029ms; both original OS callers return exact same next-generation Claim and settled_final.
- Regression guard is the unchanged existing tests/effects/brc10-lifecycle.test.ts two-OS-caller case; no assertion, case declaration or timeout changed. Formal verification removes all instrumentation.
- Canonical final execution report target: `.ai/harness/checks/brc10-lock-verification.latest.json`; full/raw criteria disposition must come from actual execution, not inferred from this focused pass. Normal package test, explicit low concurrency, lock contention guards, owner-authorized full inventory, typecheck and nine integrity checks are declared once in contract Verification Plan. PATH uses existing Node24.21.0; Bun1.4.2, dependency lock unchanged.
- Local commit only. No push, PR, Ready, merge, deletion, main/S4 edits, fake AcceptanceReceipt/verdict/Recommendation.

Unchanged brc10 test SHA256: `274ba62dafc8c1b3689328a47eaed72413e11d78aa5a32bb0fe925ae143b8565`.

## Final verified result and local delivery

- Canonical execution command: `PATH=/opt/homebrew/opt/node@24/bin:$PATH bun scripts/verification-plan.ts execute --repo . --contract tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md --report-file .ai/harness/checks/brc10-lock-verification.latest.json --timeout-ms 7200000`; actual exit0,14/14 passed. Report SHA256: `838f6d2fdf21fd42647b1ada15a3ff8adf635f2203fc0149e05cb4c5f8faa1e9`; console `/tmp/brc10-lock-final-verification.log`.
- Frozen HEAD `9aef6693b483f36b67f72c9a910a2854ac0b5b18`; virtual tree `a8851bd16805cecae50683396e9b922832b54343`; execution snapshot `sha256:4f8c78897aa19e60041e612205c017b5f46726379aeb34710d01206c6f140b2b`; snapshot_changed_during_execution=false. The following results were added to workflow artifacts afterwards; only notes/review/plan delivery metadata changed. Implementation remains byte-identical to the exact full/typecheck execution. Do not substitute the final commit tree for this frozen execution subject.
- Full run uses unchanged CI default60000 test timeout,4 isolated file workers and max concurrency1 per file. Actual canonical per-file logs collected without modifying their contents: `/tmp/brc10-lock-full-suite-collected.log`; provenance `/tmp/brc10-lock-full-suite-collection.json`:457files,5737pass/0fail/81skip. brc10 in that normal4-file pool:13pass/0fail/4skip,130expects,124.88s (`/tmp/brc10-lock-full-pool-brc10.log`). Skipped tests are reported as skipped, not validated.
- Normal package brc10 exit0 (145902ms), low-parallelism entire brc10 exit0 (149349ms), unchanged contention guards exit0. Original testcase60000 and lock5000 budgets unchanged. No fixture/assertion/timeout edits.

| Check | Actual executed command | Exit |
|---|---|---|
| brc10-normal | `/Users/chris/.bun/bin/bun run --cwd . test -- tests/effects/brc10-lifecycle.test.ts` | 0 |
| brc10-low | `/bin/bash --noprofile --norc -c bun test --timeout 60000 --max-concurrency 1 tests/effects/brc10-lifecycle.test.ts` | 0 |
| lock-contention-guards | `/Users/chris/.bun/bin/bun run --cwd . test -- tests/unit/issue-282-automation-budget-contention.test.ts` | 0 |
| full-local-suite | `/bin/bash --noprofile --norc -c BUN_TEST_ISOLATE_FILES=1 BUN_TEST_JOBS=4 BUN_TEST_MAX_CONCURRENCY=1 bash -c 'source scripts/lib/ci-run-tests.sh; run_bun_tests'` | 0 |
| type | `/bin/bash --noprofile --norc -c bun run check:type` | 0 |
| hooks | `/bin/bash --noprofile --norc -c bun run check:hooks` | 0 |
| helpers | `/bin/bash --noprofile --norc -c bun run check:helpers` | 0 |
| reference-configs | `/bin/bash --noprofile --norc -c bun run check:reference-configs` | 0 |
| deploy-sql | `/bin/bash --noprofile --norc -c bash scripts/check-deploy-sql-order.sh` | 0 |
| architecture | `/bin/bash --noprofile --norc -c bash scripts/check-architecture-sync.sh` | 0 |
| task-sync | `/bin/bash --noprofile --norc -c bash scripts/check-task-sync.sh` | 0 |
| task-workflow | `/bin/bash --noprofile --norc -c bash scripts/check-task-workflow.sh --strict` | 0 |
| state | `/bin/bash --noprofile --norc -c bun scripts/inspect-project-state.ts --repo . --format text` | 0 |
| adoption-dry-run | `/bin/bash --noprofile --norc -c bun src/cli/index.ts init --repo . --dry-run` | 0 |

- Verified implementation SHA256: `bc3fdb60bd9f45ee3de6931805e968b3505ab6aa83b2cf770142161413d2a018`; raw source diff SHA256: `17befd603fe82078432183f5cf22963733625698cd3ac100b735d6e2779c460b`. Existing brc10 test SHA256 and generic lock bytes still match main. No temporary diagnostic code remains.
- Sibling sweep: settleRecoveredCampaignWorkerFinal has one production caller (this recovery path); store settlement already has independent budget/work-package locks and replay conflict checks. No unrelated caller, mutex, adapter, timeout or test changed.
- Residual scope: group serialization still has the existing finite wait budget, so arbitrary contention/slow I/O is not claimed infallible. No remote action, independent acceptance verdict or AcceptanceReceipt. Existing review artifact remains Pending; this is local verified repair delivery.
