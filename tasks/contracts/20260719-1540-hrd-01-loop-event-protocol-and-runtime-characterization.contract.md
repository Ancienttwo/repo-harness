# Task Contract: hrd-01-loop-event-protocol-and-runtime-characterization

> **Status**: Partial
> **Plan**: plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-19 15:50
> **Sprint Planning Base**: `origin/main@2c39c4a46c83c604fc9ce2fe2752a79d93edbddc`
> **HRD-01 Execution Base**: `origin/main@4f4666efd3810ed50dd1d5da17e44fd721d84689` (post-sprint-planning push; this branch's fork point)
> **Review File**: `tasks/reviews/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.review.md`
> **Notes File**: `tasks/notes/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

HRD-02..09 will collapse the per-event shell script fan-out into in-process
handlers one package at a time. Without a host-neutral typed protocol and a
frozen runtime baseline established first, every later cutover would re-derive
its expected behavior ad hoc, and its parity claim ("same decision, reason,
exit code, write set as before") would have no committed before-surface to be
audited against. If this package ships wrong, every HRD cutover inherits an
unauditable or wrong baseline, exactly the failure mode the Program forbids
(characterization mixed with semantic change).

## Goal

Deliver one pure host-neutral `LoopEvent`/`LoopEventResult` protocol module
with zero consumers, plus characterization fixtures that freeze the current
per-event runtime baseline for all 11 public routes: script invocation
sequence, child-invocation counts, decision/reason/exit code, and
durable-write set. No host-visible behavior changes anywhere; no script is
touched or retired.

## Scope

- In scope:
  - New pure module `src/core/loop/loop-event-protocol.ts`: the `LoopEvent`
    discriminated union (session_started, prompt_submitted,
    mutation_requested, mutation_observed, command_observed,
    subagent_started, subagent_stopped, session_stopping — per audit §6,
    `plans/sprints/20260715-harness-loop-audit-and-optimization.md:1239-1298`),
    the `LoopEventResult` shape (protocol: 1, eventId, decision verdict
    allow/block/advise/noop with structured reasons and nextAction, planned
    effects, telemetry counters), and a total `routeToLoopEvent` mapping
    covering exactly the 11 route tuples of
    `src/cli/hook/route-registry.ts:56-123`. Type-only imports from existing
    core modules (e.g. `EvaluateReadinessResult`) are allowed; no I/O, no
    environment access, no fs/child_process, and no production file imports
    this module in this package. Must pass `check:state-boundaries`.
  - New test `tests/loop-event-protocol.test.ts`: route-mapping totality (all
    11 tuples covered, no extras) and purity smoke (module has no runtime
    side effects on import).
  - New test `tests/hook-runtime-characterization.test.ts` with fixture
    `tests/fixtures/loop-runtime/characterization.json`: for each of the 11
    routes, invoke `runHook()` against a temp fixture repo carrying this
    repo's hook projection and record (a) script invocation sequence and
    count, (b) child-invocation counts of `bun`/`git`/CLI observed via
    PATH-instrumented stubs, (c) decision/reason/exit code and host-visible
    output shape, (d) the durable-write set as a before/after tree diff.
    Normalize only nondeterministic path/time/PID data — never decision,
    reason, ordering, counts, or write set.
  - Pin the HRD-01 execution base in the sprint header of
    `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md` (replace the
    Pending line), following the LSC successor-pin precedent.
- Out of scope:
  - Any consumer wiring: `src/cli/hook/runtime.ts`,
    `src/cli/hook/route-registry.ts`, CLI/MCP/Skill surfaces, and every
    `.ai/hooks/` / `assets/hooks/` script stay byte-identical.
  - HRD-02..09 work: no StateInputCollector, no handler cutover, no journal,
    no circuit/lock change, no telemetry aggregation, no retirement.
  - Every path outside Allowed Paths, including `.ai/hooks/`, `assets/`,
    `scripts/`, installer, and Skill surfaces.
  - Compatibility code, dual authority, semantic fallback, or a second
    representation of the route table (the mapping consumes
    `route-registry.ts` types; it must not restate script lists).
- Taste constraints: The protocol is explicit typed data, not clever
  generation; totality over the 11 route tuples must be enforced by types or
  an exhaustiveness check, not by runtime defaults. Characterization asserts
  recorded fixtures verbatim; helper indirection that hides what is frozen is
  worse than repetition.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path
  outside Allowed Paths.
- Stop if characterizing a route deterministically would require normalizing
  anything beyond path/time/PID; record the offending route and hand back
  rather than widening normalization.
- Stop if mapping a route onto the `LoopEvent` union would require a
  host-specific branch or changing `route-registry.ts`.
- Stop if any existing test, golden, or hook script changes value; this
  package must be behavior-inert outside its new files.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The host-neutral protocol direction is falsified if the 11 routes' observed
behavior cannot map onto the 8 `LoopEvent` kinds without a host-specific
branch. Cheapest proof point: map `PostToolUse.always`, `SubagentStart.context`,
and `SubagentStop.quality` first (the least obvious cells); if any needs a
per-host event kind, stop before writing the characterization harness.

## Root Cause Evidence

Not applicable: this is a `code-change` protocol/characterization package,
not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md`
- Source sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`
- Runtime authority characterized: `src/cli/hook/runtime.ts` (`runHook()`),
  `src/cli/hook/route-registry.ts` (route table)
- Active plan: `plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md`
- Review file: `tasks/reviews/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.review.md`
- Notes file: `tasks/notes/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `4f4666efd3810ed50dd1d5da17e44fd721d84689` /
  `codex/hrd-01-loop-event-protocol-and-runtime-characterization` /
  `/Users/kito/Projects/repo-harness-wt-hrd-01-loop-event-protocol-and-runtime-characterization`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md
  - plans/sprints/20260719-1531-hook-runtime-diet.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md
  - tasks/reviews/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.review.md
  - tasks/notes/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.notes.md
  - src/core/loop/loop-event-protocol.ts
  - tests/loop-event-protocol.test.ts
  - tests/hook-runtime-characterization.test.ts
  - tests/fixtures/loop-runtime/characterization.json
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/core/loop/loop-event-protocol.ts
    - tests/fixtures/loop-runtime/characterization.json
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.notes.md
  tests_pass:
    - path: tests/loop-event-protocol.test.ts
    - path: tests/hook-runtime-characterization.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:state-boundaries
    - bun run check:hooks
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
    - "Diff outside the four new files touches only workflow envelope artifacts and the sprint header pin"
```

## Acceptance Notes (Human Review)

- Functional behavior: behavior-inert package; the protocol module has zero
  consumers and the characterization suite only observes `runHook()`.
- Edge cases: `PostToolUse.always` trace route, subagent routes, and Codex-only
  routes must characterize cleanly; per-host output-routing differences are
  recorded as data, not normalized away.
- Regression risks: over-normalized fixtures would silently weaken every later
  HRD parity claim; review the normalization helper by hand.

## Rollback Point

- Commit / checkpoint: branch fork point `4f4666efd3810ed50dd1d5da17e44fd721d84689`
- Revert strategy: revert branch `codex/hrd-01-loop-event-protocol-and-runtime-characterization`; the package adds four new files plus workflow envelope edits and touches no production path.
