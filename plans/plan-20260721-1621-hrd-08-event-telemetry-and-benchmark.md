# Plan: HRD-08 event telemetry and benchmark

> **Status**: Review
> **Created**: 20260721-1621
> **Slug**: hrd-08-event-telemetry-and-benchmark
> **Planning Source**: waza-think
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-08-event-telemetry-and-benchmark
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: One event-level runtime authority, its LOOP-12 report, targeted tests, and the root required checks form one independently reviewable PR.
> **Rollback Surface**: Revert the HRD-08 commit; the ignored runtime JSONL is non-authoritative and needs no data rollback.
> **Spec**: `docs/spec.md`
> **Research**: `plans/sprints/20260715-harness-loop-audit-and-optimization.md`
> **Task Contract**: `tasks/contracts/20260721-1621-hrd-08-event-telemetry-and-benchmark.contract.md`
> **Task Review**: `tasks/reviews/20260721-1621-hrd-08-event-telemetry-and-benchmark.review.md`
> **Implementation Notes**: `tasks/notes/20260721-1621-hrd-08-event-telemetry-and-benchmark.notes.md`

## Goal

Replace the per-script hook invocation log with one structured event record for every eligible host hook event, then make `scripts/hook-dispatch-diet-report.ts` consume that authority and publish measured p50/p95 plus explicit pass/fail results for the LOOP-12 targets. Commit a reproducible baseline-vs-target report without running or regenerating the provider-backed harness profile matrix.

The sprint acceptance line remains authoritative: runtime entry exactly 1/event, direct runtime-dispatch child process count at most 1, Effective State resolution exactly 1, PreEdit p95 target 150 ms and budget 250 ms, PostEdit full-projection writes 0 and event writes at most 1, and Stop write transactions at most 1.

## P1: Architecture Map

- Host adapters invoke `repo-harness-hook <Event> --route <id>` through `src/cli/hook-entry.ts`; `src/cli/hook/runtime.ts#runHook` is the single event orchestration boundary.
- `src/cli/hook/runtime.ts` currently creates one `StateInputCollector`, selects the route, runs in-process handlers or one direct Bash child per step, and appends one protocol-v1 line per step to `.ai/harness/runs/hook-invocations.jsonl`.
- `scripts/hook-dispatch-diet-report.ts` is the human/reporting surface but currently uses static and synthetic probes and hard-codes `runtime_evidence.available: false`.
- `scripts/run-harness-profile-benchmark.ts` is a second consumer of the old JSONL. It must cut over in the same work-package so the retired authority has no live reader or writer.
- `tests/hook-runtime-characterization.test.ts` and `tests/fixtures/loop-runtime/characterization.json` are the frozen host-event behavior baseline. They count stubbed internal `git`/`bun` processes separately from the new direct-dispatch child-process metric.
- `assets/hooks/`, `.ai/hooks/`, route registration, provider review code, and HRD-09 legacy-script retirement are outside this slice.

## P2: Concrete Trace

1. A host sends one hook payload to `src/cli/hook-entry.ts`.
2. `runHook` resolves repo and opt-in state, creates the event-scoped collector, resolves exactly one route, and executes its ordered steps.
3. Today each step calls `recordHookInvocation`, so one host event can create multiple unrelated lines without an event identifier; concurrent events cannot be grouped safely.
4. In-process PreEdit/PostEdit/Stop handlers already expose the boundaries where state resolution and logical durable writes can be observed. Legacy Bash steps expose only their direct dispatch process and elapsed result; their hidden filesystem activity is opaque.
5. The new event accumulator records step outcomes and explicit counters during the trace, then appends exactly one record when the handled route returns. The report reads only these event records and refuses to claim runtime evidence when required samples are absent, malformed, or incomplete.
6. The final side effect is an ignored `.ai/harness/runs/hook-events.jsonl` runtime cache plus a committed, reproducible baseline-vs-target report under `docs/researches/`.

Pressure point: post-hoc grouping of the current per-script log is unsound because it has no stable host-event identity and can interleave concurrent events.

## P3: Design Decision

### Single event authority

Add `src/cli/hook/event-telemetry.ts` as the only runtime telemetry writer. Each eligible `runHook` invocation owns one accumulator and writes one `loop-engine-hook-event/v1` record to `.ai/harness/runs/hook-events.jsonl`. Stop all writes to `hook-invocations.jsonl` and remove its remaining consumer in the same work-package; do not add dual reads, migration logic, or fallback parsing.

Each record contains:

- stable event identity and available host/session/run identifiers;
- event, route, exit code, blocked verdict, start/end timestamps, total elapsed ms, and `runtime_entries: 1`;
- ordered step records with execution kind (`in_process` or `subprocess`), elapsed ms, exit code, and output bytes;
- counters for Effective State resolutions, direct runtime-dispatch child processes, logical files read/written, durable writes, write transactions, and PostEdit full-projection writes/event writes;
- measurement completeness plus named opaque steps.

### Metric semantics

- `child_processes` counts direct children created by the route runtime, not internal `git` or `bun` plumbing. Existing characterization continues to guard those internal subprocess counts separately.
- file counters are unique, repo-relative logical authority accesses explicitly observed by the hook runtime; they are not OS syscall counts.
- durable write and transaction counters exclude the telemetry append itself, preventing self-observation from falsifying PostEdit/Stop targets.
- opaque legacy Bash steps remain explicitly incomplete; the system does not synthesize their hidden I/O. Their step invocation remains visible so HRD-09 can later prove legacy execution reaches zero.
- the report may mark a metric available only when its required route samples are complete. Missing, malformed, mixed-protocol, or incomplete required evidence fails closed instead of becoming zero/pass.

### Instrumentation points

- Wrap the existing Effective State resolver inputs in `runtime.ts` so the event accumulator counts actual resolution calls without creating a second resolver.
- Record in-process and Bash step timing/results at the existing dispatch sites; increment direct child processes only for the existing `spawnSync` Bash boundary.
- Have `mutation-observed.ts` report its journal event write and transaction through an injected observer.
- Extend the existing Stop projection observer with one batch-transaction observation in `stop-handler.ts`; count the logical target writes while preserving the single atomic Stop commit.
- Do not add a lock, daemon, provider call, or profiler to the hot path. Telemetry append remains non-authoritative and fail-open for hook safety; report completeness/sample checks make evidence gaps visible.

### Reporting and evidence

Upgrade `scripts/hook-dispatch-diet-report.ts` to report protocol v2 and aggregate valid event records by route. Preserve the existing route-topology, synthetic phase, and SessionStart context sections, but make `runtime_evidence.available` truthful and include sample counts, p50/p95, metric coverage, LOOP-12 thresholds, and per-target pass/fail.

Update `scripts/run-harness-profile-benchmark.ts` to read only `hook-events.jsonl` and aggregate event-level measurements. The existing committed profile comparison is stale for its benchmark subject and the full provider-backed 27-arm matrix is not consumed by this contract; it will not be regenerated here.

After code freeze, run at least 20 local fixture iterations and generate:

- `docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.json`
- `docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.md`

The report must record failures honestly. HRD-08 delivers authoritative measurement; it does not silently expand into HRD-09 optimization or require every target to pass before the evidence can be committed.

### Alternatives rejected

| Option | Decision | Reason |
|---|---|---|
| Group current per-script lines by timestamp/event fields | Reject | No event ID exists and concurrent hooks can interleave. |
| Keep old and new JSONL readers during a transition | Reject | This creates dual authority and violates the no-compatibility rule. |
| Derive all runtime metrics only from the characterization fixture | Reject | It cannot produce the required per-host-event runtime record. |
| Count all OS processes and filesystem syscalls | Reject for this slice | It requires a platform profiler and changes the accepted logical runtime boundary. If reviewers require syscall-complete evidence, stop and redesign instead of relabeling these counters. |

### Scale and failure behavior

At 10x event volume, synchronous JSONL append contention or dropped telemetry is the first expected limit. Hook behavior must remain available, so telemetry failure cannot block the host event. Evidence generation detects missing/invalid samples and refuses to publish `available: true`; a buffered telemetry service is not justified until observed volume requires it.

## File Plan

| File | Change |
|---|---|
| `src/core/loop/loop-event-protocol.ts` | Define the event telemetry protocol and counter/result types. |
| `src/cli/hook/event-telemetry.ts` | Add the event-scoped accumulator, validation, and sole JSONL writer. |
| `src/cli/hook/runtime.ts` | Create/flush one accumulator per event; remove per-script writes; instrument state and step boundaries. |
| `src/cli/hook/mutation-observed.ts` | Observe the journal event write/transaction. |
| `src/cli/hook/stop-handler.ts` | Observe logical projection writes and the single Stop batch transaction. |
| `scripts/hook-dispatch-diet-report.ts` | Read event telemetry, calculate p50/p95/coverage/targets, and write JSON plus Markdown evidence. |
| `scripts/run-harness-profile-benchmark.ts` | Cut its runtime evidence reader to the new event protocol only. |
| Targeted tests and both runtime/loop-semantics characterization fixtures | Prove one record/event, counter semantics, fail-closed reporting, no old telemetry authority, and unchanged host decisions/state semantics. |
| Architecture, harness overview, and research report | Document the runtime truth, metric boundary, baseline, measured result, and residual limits. |

## Risks and Falsifiers

| Risk / falsifier | Cheapest proof | Response |
|---|---|---|
| A host invocation can flush zero or more than one record | Route fixture covering success, blocked, and error returns | Centralize flush in `runHook`; stop if a route escapes it. |
| Required metrics depend on hidden legacy-script I/O | Coverage assertion over the target-specific routes | Mark opaque metrics incomplete; do not infer. Widen only with a new approved profiler design. |
| Instrumentation changes user-visible decisions or child plumbing | Existing 11-route characterization fixture | Decisions and internal child counts must remain unchanged; only telemetry write-set changes are expected. |
| Hot-path telemetry failure blocks hooks | Writer-failure test | Preserve hook result and surface evidence unavailability later. |
| Report claims pass with empty/malformed evidence | Report unit tests | Fail closed on required sample/schema/coverage checks. |

## Promotion Gate

- **Merge/PR unit**: the event-level telemetry authority, both reader cutovers, LOOP-12 report, and target-specific instrumentation form one independently reversible work-package.
- **Rollback surface**: revert the HRD-08 PR; the ignored runtime JSONL is non-authoritative and requires no migration or compatibility reader.
- **Verification boundary**: targeted telemetry/runtime/report tests, both characterization fixtures, the frozen 220-record sample, the root required checks, strict contract verification, and one semantic acceptance.
- **Review/acceptance boundary**: verify exactly one record per eligible event, no live old authority, truthful incomplete coverage, unchanged hook decisions, and measured targets reported without hiding failures.
- **High-risk surface**: shared hook hot-path instrumentation and the runtime evidence consumed by later benchmark/retirement work.
- **Why not checklist row**: `verification_boundary` — this cuts over a cross-module runtime authority used by two independent report consumers and must land as one PR.

## Evidence Contract

- **State/progress path**: this plan, its contract/review/notes bundle, the active sprint row, and `tasks/current.md`.
- **Verification evidence**: focused tests, the full Bun suite, root required checks, strict contract verification, and `docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.{json,md}` generated from the frozen 220-record local fixture sample.
- **Evaluator rubric**: one event telemetry authority; no old reader/writer; exact route and metric coverage; honest incomplete/failed evidence; no host-visible behavior change; no provider matrix run.
- **Stop condition**: stop if any eligible event bypasses central finalization, a named metric requires fabricated legacy-script I/O, characterization changes beyond the declared telemetry path, or required checks fail.
- **Rollback surface**: revert the HRD-08 PR and discard ignored event samples; no persisted authority migration is needed.

## Task Breakdown

- [x] Complete `$think` P1/P2/P3 expansion and freeze metric semantics.
- [x] Receive explicit approval for this Draft plan and set it to Approved before implementation.
- [x] Add the event protocol and sole event-level telemetry authority.
- [x] Instrument runtime, PostEdit journal, and Stop transaction boundaries without changing hook decisions.
- [x] Cut both report consumers away from `hook-invocations.jsonl`; delete the per-script writer path.
- [x] Add targeted tests and update the frozen characterization fixtures only for the intentional telemetry authority change.
- [x] Freeze code, run at least 20 local iterations once, and commit JSON/Markdown baseline-vs-target evidence.
- [x] Update architecture/harness documentation and workflow artifacts.
- [x] Run targeted checks, root required checks, and strict contract verification.
- [ ] Freeze the final subject and record exactly one semantic acceptance or contract-authorized typed owner waiver.

## Acceptance

- Exactly one valid event record is written for every eligible handled host event across success, blocked, and error paths.
- No production writer or reader references `.ai/harness/runs/hook-invocations.jsonl`.
- One state collector remains authoritative; required target routes report exactly one Effective State resolution.
- Direct runtime-dispatch child, logical read/write, durable write, transaction, elapsed, and step data use the documented semantics and expose incomplete legacy coverage rather than fabricated values.
- `hook-dispatch-diet-report` publishes `runtime_evidence.available: true` only with sufficient valid samples and measured p50/p95, and evaluates all named LOOP-12 targets.
- PostEdit reports zero full-projection writes and at most one event write; Stop reports at most one write transaction for complete samples.
- Characterization decisions and internal process counts remain unchanged apart from the intentional telemetry output path/schema.
- The committed JSON/Markdown report is generated after code freeze, records sample counts and actual pass/fail, and makes no provider call.

## Handoff

- Checks cache: `.ai/harness/checks/latest.json`
- Runtime samples: `.ai/harness/runs/hook-events.jsonl`
- Session handoff: `.ai/harness/handoff/current.md`
- Scope authority: `tasks/contracts/20260721-1621-hrd-08-event-telemetry-and-benchmark.contract.md`
