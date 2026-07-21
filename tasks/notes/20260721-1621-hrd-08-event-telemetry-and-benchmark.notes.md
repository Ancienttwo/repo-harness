# Implementation Notes: hrd-08-event-telemetry-and-benchmark

> **Status**: Active
> **Plan**: plans/plan-20260721-1621-hrd-08-event-telemetry-and-benchmark.md
> **Contract**: tasks/contracts/20260721-1621-hrd-08-event-telemetry-and-benchmark.contract.md
> **Review**: tasks/reviews/20260721-1621-hrd-08-event-telemetry-and-benchmark.review.md
> **Last Updated**: 2026-07-21 16:21
> **Lifecycle**: notes

## Design Decisions

- `src/cli/hook/runtime.ts#runHook` is the event boundary. A new `event-telemetry.ts` accumulator will write one `loop-engine-hook-event/v1` record per eligible handled host event.
- `.ai/harness/runs/hook-events.jsonl` replaces `.ai/harness/runs/hook-invocations.jsonl` as the sole runtime telemetry authority. HRD-08 removes every live old reader/writer in the same work-package; ignored old files are abandoned residue, not a migration source.
- `child_processes` means direct children launched by the route runtime. Internal `git`/`bun` invocation counts remain a separate HRD-01 characterization diagnostic.
- File counters are unique logical repo-relative accesses explicitly observed by the runtime. They are not filesystem syscalls, and opaque legacy-script I/O is marked incomplete rather than inferred.
- Durable writes and write transactions exclude the telemetry sink. PostEdit journal writes and the existing Stop projection batch are observed at their explicit in-process boundaries.
- Hook safety and evidence validity are separate: telemetry append failure does not block a host event, while report generation fails closed on missing, malformed, mixed, or incomplete required samples.
- `hook-dispatch-diet-report` remains the single committed reporting surface and moves to protocol v2. It records actual target failures; HRD-08 does not absorb HRD-09 optimization.
- The provider-backed profile comparison report is stale for its recorded benchmark subject and is outside this contract. `run-harness-profile-benchmark.ts` receives only the mandatory reader cutover; the 27-arm matrix is not rerun.

## Deviations From Plan Or Spec

- Targeted verification showed that `tests/state/fixtures/loop-semantics/characterization.json`, in addition to the planned per-route characterization fixture, freezes the telemetry write path in six cells. The contract was widened to that exact fixture only; the accepted delta is the old-to-new authority path, while verdict, state, and every other side effect must stay unchanged.
- Final verifier calibration moved the already-frozen full `bun test` result and self-host `adopt --dry-run` result into exact manual evidence. Re-running the 681.69-second full suite inside the fixed 600-second verifier budget would duplicate expensive evidence and time out; `adopt` is intentionally rejected as an evidence-producing command by `verify-contract`. The accidental self-recursive `verify-contract` command was removed. Strict verification still executes every targeted test and all remaining bounded repository gates.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Post-hoc grouping of per-script lines | Reject | No event ID exists and concurrent hooks can interleave. |
| Dual-read transition | Reject | It preserves two telemetry authorities and violates the no-compatibility rule. |
| Fixture-only metrics | Reject | They cannot satisfy the one-record-per-host-event acceptance line. |
| OS syscall/process profiler | Defer unless falsifier trips | It changes the measurement boundary and hot-path cost; current targets are defined at the logical/direct-runtime boundary. |

## Open Questions

- Falsifier checkpoint remains: if a later contract requires syscall-complete process/file counts instead of the frozen logical/direct-runtime definitions, use a separately approved profiler design rather than relabeling these metrics.
- Measured follow-up: PreEdit p50/p95 is 381.68/429.05 ms in the frozen 20-sample route fixture, above both the 150 ms target and 250 ms initial budget. HRD-08 records this failure without absorbing optimization work; it is the concrete input to the next bounded runtime-diet slice.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Sprint audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md#loop-12`
- Characterization authority: `tests/hook-runtime-characterization.test.ts` and `tests/fixtures/loop-runtime/characterization.json`
- Planned committed report: `docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.{json,md}`
- Final event sample set: 220/220 valid records, 20 per public route, 220 unique event IDs, zero malformed/mixed/duplicate records.
- LOOP-12 result: 6/7 targets pass; only PreEdit p95 fails. Runtime evidence is available and target metric coverage is 1.0.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
