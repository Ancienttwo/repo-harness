# Sprint: Hook Runtime Diet

> **Status**: Approved
> **Slug**: hook-runtime-diet
> **Created**: 2026-07-19 15:31
> **Updated**: 2026-07-21 02:13
> **Source PRD**: (none; source authority is the Harness Loop audit)
> **Source Audit**: `plans/sprints/20260715-harness-loop-audit-and-optimization.md`
> **Source Spec**: `docs/spec.md`
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d`
> **Program Planning Base**: `origin/main@be3e93ce72c812a33045a15c4d97452c59fa3fbb` (PR #80)
> **Sprint A Completion**: Loop Semantics Convergence Done 8/8 (PRs #82, #84-#90; sprint marked Done at `351139fd`)
> **Sprint Planning Base**: `origin/main@2c39c4a46c83c604fc9ce2fe2752a79d93edbddc` (live at drafting time; includes post-LSC mainline packages #91-#93 and 0.10.1 release prep, which HRD builds on)
> **HRD-01 Execution Base**: `origin/main@4f4666efd3810ed50dd1d5da17e44fd721d84689` (post-sprint-planning push)
> **HRD-02 Execution Base**: origin/main@b57d6323fb8ba6a0edb55117abaf9953913d9ddf (post-HRD-01 merge plus backfill)
> **Predecessor**: Loop Semantics Convergence (Sprint A). Its semantic modules — `ArtifactRequirementPolicy`, `evaluateReadiness`, the authority/subject/evidence/projection revision partition, the progress token, stable state-version allocation, and the Stop readiness cutover — are fixed inputs to this sprint, not change surfaces
> **Successor Order**: Evidence & Projection Convergence -> Skill Surface & Discovery Convergence
> **Goal Mode**: incremental

This is the machine-operable Sprint B projection of the preserved Harness Loop
Program audit. Each backlog row is an independent work-package, worktree,
branch, PR, verification subject, and rollback boundary. The public 11-route
contract (`src/cli/hook/route-registry.ts`) does not change; only the internal
execution model converges: one runtime entry, one repo-fact collection, one
Effective State resolution, one decision, and at most one small durable write
per regular event. Every successor row pins the live `origin/main` produced by
its predecessor.

Row numbering note: rows 5 and 6 follow the audit's own §13 PR order (PostEdit
journal before Stop checkpoint), which swaps the audit backlog's HRD-05/HRD-06
labels. This sprint's `hrd-NN` slugs are the execution authority; the audit
rows map 1:1 by content.

Recalibration against post-LSC reality (this sprint was drafted from a fresh
runtime survey, not from the audit's pre-LSC snapshot):

- LSC-04 (PR #86) already keys the circuit breaker on the progress token
  (`src/cli/hook/circuit-breaker.ts:74-86`); HRD-07 therefore covers only
  oscillation/churn detection and lock unification, not token plumbing.
- LSC-07 (PR #89) already removed Stop's install-profile fallback, mtime
  touch, and cache-as-authority, and wired shared readiness
  (`.ai/hooks/stop-orchestrator.sh:604-779`); HRD-06 is a runtime-shape
  cutover of the remaining 812-line script, not a semantic change.
- SessionStart already resolves Effective State exactly once in TS and
  budget-caps context (`src/cli/hook/runtime.ts:127-189,343-553`); HRD-04
  collapses the three shell scripts into that existing aggregation rather
  than building budgeting from scratch.
- Per-script telemetry (`src/cli/hook/runtime.ts:45-69` →
  `.ai/harness/runs/hook-invocations.jsonl`) and the route-count diet report
  (`scripts/hook-dispatch-diet-report.ts`) exist; HRD-08 adds the missing
  event-level aggregation on top of them instead of a new benchmark surface.
- `assets/hooks/` is the only human-authored hook source and `.ai/hooks/` is
  a generated projection (`scripts/sync-hook-sources.ts`, `bun run
  check:hooks`); every script retirement edits `assets/hooks/` and re-syncs.

## PRD

### Problem

The public route contract is stable and the loop semantics are now converged,
but one host event still fans out into serial `spawnSync('bash', ...)` script
chains with nested CLI subprocesses and repeated state reads: PreEdit runs two
scripts plus an embedded `state resolve` cold start, PostEdit re-renders full
recovery projections on the hot edit path (`.claude/.task-handoff.md` rewrite
plus a ~200-line `workflow_write_handoff` regeneration per qualifying edit),
and Stop remains an 812-line shell orchestrator. The circuit breaker counts
attempts per exact key but cannot see A-B-A oscillation or superficial churn,
and it carries its own bespoke lock beside the shared primitive. Telemetry
records per-script invocations but no per-event cost, so the real runtime
price of the harness cannot be measured or gated.

### Users

- Agents whose edit/stop latency and write amplification are harness overhead.
- Maintainers who need each script-to-handler cutover independently
  reviewable, reversible, and SHA-bound, with a frozen behavior baseline.
- Operators of adopted downstream repos whose packaged hooks must migrate
  one-shot to the new runtime with no dual dispatch.

### Success Criteria

- A regular event enters the runtime once, collects repo facts once, resolves
  Effective State exactly once, and produces one decision.
- PostEdit writes at most one small journal event and zero full recovery
  projections; maintenance sync becomes dirty bits processed at explicit
  verify, phase transition, or Stop.
- Stop performs one batched projection-write transaction.
- The circuit breaker detects exact no-progress repeats, A-B-A oscillation,
  and superficial churn, resets on real progress, and uses the shared lock
  primitive.
- Event-level telemetry measures processes, resolutions, reads, writes, and
  elapsed time per event, and the diet report carries real runtime evidence.
- Every replaced script is deleted from `assets/hooks/` in its cutover
  package with the projection re-synced; no steady-state compatibility code,
  dual authority, semantic fallback, or silent migration is introduced.

### Acceptance Scenarios

- An edit event on a Standard fixture spawns no nested bash script chain and
  produces the same decision, reason, and exit code as the frozen HRD-01
  baseline.
- A qualifying `tasks/`/`plans/` edit writes one journal event and leaves
  `.ai/harness/handoff/current.md` and `.claude/.task-handoff.md` untouched
  until Stop, verify, or phase transition.
- A Stop after N edits resolves Effective State once, flushes the pending
  journal, and performs exactly one write transaction.
- An A-B-A guard oscillation trips the breaker while a subject-revision
  advance resets it; a projection-only churn does not reset it.
- `hook-dispatch-diet-report` reports `runtime_evidence.available: true` with
  measured per-event counts against the LOOP-12 target table.

### Non-goals

- No public Hook route, CLI command, or MCP tool rename; the 11-tuple list in
  `src/cli/hook/route-registry.ts` stays byte-stable.
- No semantic change to `ArtifactRequirementPolicy`, `evaluateReadiness`, the
  revision partition, the progress token, or state-version allocation; LSC
  outputs are consumed verbatim.
- No Evidence Ledger, `checks/latest.json` materializer, canonical checkpoint
  artifact, or Context Packet content redesign (EPC scope); no Skill surface
  or discovery work (SSD scope).
- No fix for the deferred `verify-contract` qa_scores normalization or the
  solo-operator external-acceptance policy rows in `tasks/todos.md`; both
  remain separate packages.
- No compatibility alias, shim, fallback window, or dual dispatch; any
  approved one-shot migration fails closed and deletes the old path in the
  same package.
- No combining HRD rows with each other or with EPC/SSD in one work-package,
  worktree, branch, or PR.

## Architecture Notes

### Capabilities Touched

- Hook runtime entry and dispatch: `src/cli/hook/runtime.ts` (`runHook()`),
  `src/cli/hook/route-registry.ts` (frozen route table).
- Repo-pinned hook scripts `.ai/hooks/*` as generated projection of the
  canonical `assets/hooks/*` source (`scripts/sync-hook-sources.ts`).
- Circuit breaker `src/cli/hook/circuit-breaker.ts`; shared lock primitive
  `src/effects/locking/exclusive-directory-lock.ts` and its consumers.
- Telemetry writer `recordHookInvocation()` and
  `scripts/hook-dispatch-diet-report.ts`.
- LSC seams as read-only inputs: `src/core/workflow/artifact-requirement-policy.ts`,
  `src/core/workflow/operation-readiness.ts`,
  `src/core/state/project-effective-state.ts`,
  `src/effects/state/git-state-version-store.ts`.

### Concrete Trace

Today one PreEdit event runs: host adapter (`~/.claude/settings.json` /
`~/.codex/hooks.json`) → `repo-harness-hook PreToolUse --route edit` →
`runHook()` → `spawnSync bash worktree-guard.sh` → `spawnSync bash
pre-edit-guard.sh` → nested `bun ... state resolve --field workflow_profile`
(`.ai/hooks/pre-edit-guard.sh:111-123`) — three-plus processes and two
independent state readings for one decision. Target: `runHook()` consumes one
`StateInputCollector` result in-process and returns one decision; the same
convergence applies to SessionStart (3 scripts → existing TS aggregation),
PostEdit (full projection re-render → one journal event), and Stop (812-line
shell orchestrator → readiness + flush + one write transaction).

### Design Decision

Keep the public route contract frozen and converge the interior. HRD-01 first
freezes current per-event behavior (script sequence, subprocess count,
decision, durable-write set) as characterization fixtures, so every later
cutover row proves parity against a committed baseline instead of a
re-derived one. Each cutover row deletes its replaced scripts from
`assets/hooks/` and re-syncs the projection in the same package — shell
survives only as host/external-tool adapter, never as a state machine. Host
output-routing differences (Codex vs Claude quirks currently encoded in
`.ai/hooks/run-hook.sh`) are preserved via host-parity fixtures, and the
second-level dispatcher itself is retired in HRD-09 once telemetry proves
nothing invokes it.

### Dependency Order

```text
ESA@3b33cea2 -> Program@be3e93ce -> CRG-01 -> LSC-01..08 (Done)
    -> HRD-01 -> HRD-02 -> HRD-03 -> HRD-04
    -> HRD-05 -> HRD-06 -> HRD-07 -> HRD-08 -> HRD-09
    -> EPC -> SSD
```

### HRD-01 Start Gate

HRD-01 starts only after this sprint-planning package is independently
committed, pushed, reviewed, and merged, and after the owner promotes this
sprint's `Status` from `Draft` to `Approved` (the `sprint-backlog start-task`
runner refuses anything below `Approved`). Fetch live `origin/main`, record
its exact post-planning SHA in this header, and run the explicit
`sprint-backlog start-task` command from a clean primary checkout or
standalone non-linked control checkout — not from a linked planning worktree.

```bash
repo-harness run sprint-backlog start-task \
  --sprint plans/sprints/20260719-1531-hook-runtime-diet.sprint.md \
  --task hrd-01-loop-event-protocol-and-runtime-characterization \
  --execute
```

Immediately after generation, calibrate both the plan and contract before any
implementation:

- record both the Sprint Planning Base and the exact HRD-01 execution base;
- replace the generated allowlist with the exact protocol-module, fixture,
  test, and docs paths; HRD-01 adds a pure typed module and fixtures only —
  no consumer wiring, no script change, no host-visible behavior change;
- make the architecture map, concrete trace, design decision, non-goals,
  stop conditions, and machine/manual acceptance self-contained;
- run `repo-harness run contract-run preflight --contract <contract> --repo . --json`,
  `repo-harness run check-task-workflow --strict`, and
  `repo-harness state resolve --json`; confirm the allowlist is exact and
  blockers are empty.

The generated defaults are not acceptance evidence. Any production cutover or
script retirement inside HRD-01 fails this gate.

### Risks

- A characterization fixture that over-normalizes would hide the baseline;
  only nondeterministic path/time/PID data may be normalized, never decision,
  reason, ordering, subprocess count, or write set.
- Deferring PostEdit maintenance sync to dirty bits delays the
  contract-verification signal; mitigation: explicit verify, phase
  transition, and Stop all flush dirty bits, and advisory failures are
  recorded as evidence, never silently dropped.
- After HRD-05, recovery projections are no longer refreshed per edit; a
  crash between edits must be survivable via the pending journal, which the
  next SessionStart/Stop replays. The journal-replay fixture is mandatory,
  not optional.
- Two dispatch surfaces exist today (`runtime.ts` `spawnSync` per script, and
  the `.ai/hooks/run-hook.sh` second-level dispatcher); hosts verifiably
  register `repo-harness-hook` → `runHook()`, but HRD-09 must prove via
  telemetry that nothing still invokes `run-hook.sh` before deleting it.
- Changing the circuit breaker's bespoke lock to the shared primitive could
  silently change its no-stale-reclaim semantics; the cutover must pin
  `reclaimStaleOwner: false` and prove it with a fixture.
- A row that starts from stale local `main` could bind the wrong authority;
  every row fetches and pins live `origin/main` after its predecessor merges.
- Final expensive evidence runs once after each package's code freeze; any
  fail-fix-reverify issue stops after three rounds and escalates.

## Backlog

Ordered execution queue. Every row uses the full plan -> contract -> worktree
flow and lands through an independent PR.

| # | Status | Task | Mode | Acceptance | Plan |
|---|--------|------|------|------------|------|
| 1 | [x] | hrd-01-loop-event-protocol-and-runtime-characterization | contract | In an independent PR, establish host-neutral `LoopEvent`/`LoopEventResult` typed contracts as a pure module with zero consumers, and freeze the current per-event runtime baseline for all 11 routes (script sequence, subprocess count, decision/reason/exit code, durable-write set) as characterization fixtures; no host-visible behavior change, no script retired, and the fixtures normalize only path/time/PID data | `plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md` |
| 2 | [x] | hrd-02-state-input-collector | contract | In an independent PR, implement a one-shot `StateInputCollector` at the `runHook()` entry that gathers repo facts and the single Effective State resolution once per event and hands the collected input to downstream handlers; determinism fixtures pass, SessionStart and Stop keep exactly one resolution, and no consumer behavior changes yet — consumers cut over in HRD-03..06 | `plans/plan-20260720-0020-hrd-02-state-input-collector.md` |
| 3 | [x] | hrd-03-pre-edit-one-decision-cutover | contract | In an independent PR, replace `worktree-guard.sh` + `pre-edit-guard.sh` + the embedded `state resolve --field workflow_profile` subprocess with one in-process mutation-guard handler consuming the HRD-02 collected input and producing one decision; decision/reason/exit-code parity against the HRD-01 baseline holds for both hosts, both scripts are deleted from `assets/hooks/` with the projection re-synced in the same package, and the public route tuple is unchanged | `plans/plan-20260720-0419-hrd-03-pre-edit-one-decision-cutover.md` |
| 4 | [x] | hrd-04-session-start-consolidation | contract | In an independent PR, collapse `session-start-context.sh`, `minimal-change-context.sh`, and `security-sentinel.sh` into the existing TS aggregation/budget path with one context assembly and one budget pass per event; the 1500-token hard cap and fail-closed overflow are retained, content parity against the HRD-01 baseline holds modulo approved cost-only deltas, no packet content redesign occurs (EPC-08 scope), and the three scripts are deleted with the projection re-synced in the same package | `plans/plan-20260720-0829-hrd-04-session-start-consolidation.md` |
| 5 | [x] | hrd-05-post-edit-event-journal | contract | In an independent PR, replace PostEdit full projection re-rendering with at most one small journal event carrying dirty bits per edit: PostEdit no longer rewrites `.claude/.task-handoff.md` or invokes `workflow_write_handoff`, contract verification / architecture queue / context sync / capability requests become dirty bits processed at explicit verify, phase transition, or Stop, repeated same-path events dedupe within a session, advisory sync failures record evidence without blocking, pending journal events survive crash and are replayed by the next SessionStart/Stop (fixture required), and `post-edit-guard.sh` + `minimal-change-observer.sh` are deleted with the projection re-synced in the same package | `plans/plan-20260720-1146-hrd-05-post-edit-event-journal.md` |
| 6 | [x] | hrd-06-stop-handler-slim | contract | In an independent PR, port the Stop orchestrator to an in-process handler that consumes the HRD-02 collected input and the LSC-07 shared readiness verbatim, flushes the pending journal, and performs exactly one batched projection-write transaction per Stop; minimal-change and delegation checks consume already-collected facts with no second Effective State resolution and no readiness recomputation, the stale pre-cutover docstring in `operation-readiness.ts` is corrected, and `stop-orchestrator.sh` is deleted with the projection re-synced in the same package | `plans/plan-20260720-2256-hrd-06-stop-handler-slim.md` |
| 7 | [ ] | hrd-07-circuit-oscillation-and-shared-lock | contract | In an independent PR, extend `recordCircuitAttempt()` beyond exact-key attempt counting with exact no-progress repeat, A-B-A oscillation, and superficial-churn detection plus a real-progress reset, each with positive/negative fixtures (progress-token keying already landed in LSC-04 and is not re-implemented); move the breaker's bespoke `openSync`/`Atomics.wait` lock onto `withExclusiveDirectoryLock` pinning `reclaimStaleOwner: false` with a semantics-preservation fixture; no new global lock is introduced | (pending) |
| 8 | [ ] | hrd-08-event-telemetry-and-benchmark | contract | In an independent PR, aggregate per-script records into one event-level telemetry record per host event (child processes, Effective State resolutions, files read/written, durable writes, elapsed ms) and upgrade `hook-dispatch-diet-report` to `runtime_evidence.available: true` with measured p50/p95 against the LOOP-12 targets (runtime entry 1/event, nested subprocess ≤1, resolution exactly 1, PreEdit p95 ≤150ms target / ≤250ms budget, PostEdit full-projection writes 0 and event writes ≤1, Stop write transaction ≤1); a committed baseline-vs-target measured report exists | (pending) |
| 9 | [ ] | hrd-09-legacy-retirement-and-adopted-migration | contract | In an independent PR, prove via a one-shot adopted-fixture migration that a downstream adopted repo runs the new runtime with no dual dispatch, prove via telemetry that zero legacy script or `run-hook.sh` invocations remain, delete every remaining replaced script and the second-level dispatcher from `assets/hooks/` with the projection re-synced and `route-registry.ts` script references dropped, keep `bun run check:hooks` green, and leave no compatibility shim or release-line window | (pending) |

## Definition of Done

- The 11 public route tuples, CLI command names, and MCP tool names are
  unchanged.
- A regular event has one repo-harness runtime entry, at most one nested
  subprocess, and exactly one Effective State resolution.
- PostEdit re-renders no recovery projection and writes at most one small
  journal event; Stop performs exactly one write transaction and replays the
  pending journal.
- The circuit breaker detects no-progress repeats, oscillation, and
  superficial churn, resets on real progress, and shares the lock primitive
  with pinned no-stale-reclaim semantics.
- Event-level telemetry and the diet report carry real measured runtime
  evidence, and the baseline-vs-target report is committed.
- Every replaced script (including `run-hook.sh`) is deleted from
  `assets/hooks/` in its cutover package, the `.ai/hooks/` projection is
  re-synced, `bun run check:hooks` passes, and no steady-state shim, dual
  dispatch, compatibility code, or semantic fallback exists.
- LSC semantic modules are consumed verbatim; no artifact, readiness,
  revision, or state-version semantics changed in this sprint.
- Every cutover PR records before/after behavior against the HRD-01 baseline
  and a migration note for each intentional cost-only delta.
- Each row has targeted and root checks, fresh review/external acceptance,
  merge-gate, commit/push/merge evidence, backlog backfill, and the next
  exact remote-main SHA.

## Execution Log

`repo-harness run sprint-backlog complete-task` appends completed rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
| 2026-07-20 00:18 | hrd-01-loop-event-protocol-and-runtime-characterization | `plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md` | done |
| 2026-07-20 01:53 | hrd-02-state-input-collector | `plans/plan-20260720-0020-hrd-02-state-input-collector.md` | done |
| 2026-07-20 08:29 | hrd-03-pre-edit-one-decision-cutover | `plans/plan-20260720-0419-hrd-03-pre-edit-one-decision-cutover.md` | done |
| 2026-07-20 11:45 | hrd-04-session-start-consolidation | `plans/plan-20260720-0829-hrd-04-session-start-consolidation.md` | done |
| 2026-07-20 22:50 | hrd-05-post-edit-event-journal | `plans/plan-20260720-1146-hrd-05-post-edit-event-journal.md` | done |
| 2026-07-21 02:13 | hrd-06-stop-handler-slim | `plans/plan-20260720-2256-hrd-06-stop-handler-slim.md` | done |
