# HRD-09 Legacy Retirement Evidence

> **Date**: 2026-07-21
> **Scope**: `hook-runtime-diet` / HRD-09
> **Source contract**: `tasks/contracts/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.contract.md`

## P1 — Boundary

The public hook contract remains 11 `(event, routeId, matcher)` tuples in
`src/cli/hook/route-registry.ts`. The route shape now contains `handler` and no
`scripts` field. `handler-registry.ts` binds the eight typed handlers, and
`runtime.ts` invokes exactly one handler for an eligible event. The former
per-event Bash host runtime, `run-hook.sh`, hook shim, and root helper runtime
are absent from the product surface. Only `assets/hooks/lib/workflow-state.sh`
and its `.ai/hooks/lib/` projection remain as operator workflow-state helpers.

## P2 — Trace and migration evidence

Host adapter → route lookup → typed handler → host output → telemetry is one
execution path. The event telemetry authority is
`.ai/harness/runs/hook-events.jsonl`; a valid typed record carries
`loop-engine-hook-event/v1`, `runtime_entries: 1`, one `in_process` step,
`child_processes: 0`, and `opaque_steps: []`. File and write fields are only
authoritative where explicit observers record the boundary; incomplete metrics
remain unavailable rather than being inferred from zero.

Adoption and init share `src/core/adoption/standard-plan.ts` and one
`src/effects/fs-transaction.ts` executor. Retired generated paths require the
declared exact SHA-256 fingerprint. A mismatch is preserved with a warning.
Managed repo-local adapter commands are removed only by the explicit migration
operation; custom siblings and unrelated events remain. No host runtime
reader consumes the old command shapes, so migration does not create a
steady-state dual-read path.

The scaffold entrypoints are deliberately not migration authorities:
`create-project-dirs.sh` and `init-project.sh` install the operator helper and
print the user-level adapter notice, but never strip existing host `hooks`
objects or delete top-level `.ai/hooks/*` by pathname. Active entrypoint
fixtures preserve custom configs, modified legacy files, and custom hook
scripts; retirement remains exclusive to the fingerprinted adoption plan.

The implementation evidence set includes:

- route/handler parity tests covering all public tuples;
- typed prompt, subagent, command-observed, trace-observer, mutation, and
  protocol tests;
- adoption fixture coverage for exact-hash removal, mismatch preservation, and
  custom sibling preservation;
- tarball smoke coverage asserting typed sources are packaged and retired
  runtime files are absent.

The integrated adopted-repo fixture therefore proves **zero legacy invocations**
after one canonical migration transaction: 11 route records, 11
unique event IDs, one typed `in_process` step per record, and no provider-backed
review call.

SubagentStart's cutover also closes the deferred same-scope delegation writer
boundary. `src/cli/hook/delegation-state.ts` serializes advisor creation,
SubagentStart, and Stop through one lock-internal read/merge/projection
transaction. `spawned` and `fallback_used` are monotonic. A real two-process
barrier fixture pauses Stop immediately before lock acquisition, lets
SubagentStart commit, then proves Stop's in-lock eligibility recheck neither
overwrites `spawned` nor emits an uncommitted fallback claim. The reverse order
proves a committed `fallback_used` value survives the later spawn update.

## P3 — Decision and residual risk

The authority cutover is deliberately a deletion boundary: Markdown review
cards, shell projections, and archived legacy artifacts are not execution
authorities. Keeping the workflow-state helper is safe because it is a
declared operator projection and does not dispatch host events.

The remaining measurement risk is telemetry coverage, not duplicate execution.
At higher event volume, synchronous append contention or an unavailable
observer is expected before a second handler can appear. Evidence consumers
must continue to fail closed on missing, malformed, duplicate, or incomplete
records.

## Verification pointers

- `docs/architecture/modules/runtime-harness/hook-adapters.md`
- `docs/architecture/global-hook-runtime.md`
- `docs/architecture/transactional-adoption-planner.md`
- `scripts/hook-dispatch-diet-report.ts`
- `src/cli/hook/event-telemetry.ts`
