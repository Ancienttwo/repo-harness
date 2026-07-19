# Task Contract: hrd-02-state-input-collector

> **Status**: Partial
> **Plan**: plans/plan-20260720-0020-hrd-02-state-input-collector.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-20 00:25
> **HRD-01 Delivered**: PR #94 squash-merged at `9fcd33ec`; frozen baseline `tests/fixtures/loop-runtime/characterization.json`
> **HRD-02 Execution Base**: `origin/main@b57d6323fb8ba6a0edb55117abaf9953913d9ddf` (post-HRD-01 merge plus backfill; this branch's fork point)
> **Review File**: `tasks/reviews/20260720-0020-hrd-02-state-input-collector.review.md`
> **Notes File**: `tasks/notes/20260720-0020-hrd-02-state-input-collector.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

HRD-03..06 replace per-event shell scripts with in-process handlers, and each
handler needs repo facts and the Effective State without re-reading or
re-resolving what the event already knows. Without one collector established
first, each cutover would invent its own fact-gathering, reproducing today's
duplicate-read problem inside TypeScript instead of shell. If this package
ships wrong — eager collection, double resolution, or nondeterministic
snapshots — every later handler inherits either the old fan-out cost or a
flaky input surface.

## Goal

Deliver a lazy, memoizing, once-per-event `StateInputCollector` constructed at
the `runHook()` entry and handed to downstream code, such that each repo fact
and the Effective State resolution are collected at most once per event and
only when first requested. Host-visible behavior is unchanged: the HRD-01
characterization golden passes byte-identically, and SessionStart/Stop keep
exactly one Effective State resolution each.

## Scope

- In scope:
  - New module `src/effects/loop/state-input-collector.ts`: a factory that
    builds one collector per hook event. Interface covers the audit §5.1
    Sense inputs (`plans/sprints/20260715-harness-loop-audit-and-optimization.md:1153-1170`):
    repo identity/root, policy, active work package and contract markers,
    worktree ownership, candidate/diff summary, capability mapping, latest
    evidence heads, and the Effective State resolution. Every getter is lazy
    and memoized (at most one underlying collection per fact per event); no
    collection happens at construction. Each getter delegates to the existing
    authority (e.g. the current resolve path under `src/effects/state/`) —
    no new parsers, no second representation of any authority.
  - Wire `runHook()` (`src/cli/hook/runtime.ts`) to construct exactly one
    collector per event and thread it to the internal call sites that will
    consume it in HRD-03..06. For SessionStart, route the existing single
    Effective State resolution (`effectiveStateSessionSection`) through the
    collector so the memoized path is exercised in production with identical
    output and identical subprocess count. No other call site changes
    behavior; scripts are untouched.
  - New test `tests/state-input-collector.test.ts` (fixture
    `tests/fixtures/loop-runtime/state-input-collector.json` if a golden is
    needed): determinism (same fixture repo → same collected snapshot,
    normalizing only path/time/PID), memoization (N gets → 1 underlying
    collection, proven with a counting probe), laziness (constructing a
    collector performs zero collections), and the SessionStart
    single-resolution invariant.
  - Regression gate: `tests/hook-runtime-characterization.test.ts` must pass
    with the HRD-01 golden byte-identical — this is the machine proof that
    the wiring is behavior-inert. Do not regenerate the golden.
  - Pin the HRD-02 execution base in the sprint header of
    `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md` (add the line
    under the HRD-01 pin), following the successor-pin precedent.
- Out of scope:
  - Any handler cutover: PreEdit (HRD-03), SessionStart script consolidation
    (HRD-04), PostEdit journal (HRD-05), Stop handler (HRD-06). No script
    under `.ai/hooks/` / `assets/hooks/` changes; no script is retired.
  - Eager entry-point collection for events whose scripts still self-resolve
    (PreEdit/Stop) — adding a second resolution anywhere fails this contract.
  - Circuit/lock changes (HRD-07), telemetry aggregation (HRD-08),
    retirement (HRD-09); LoopEventResult production or protocol changes
    (`src/core/loop/loop-event-protocol.ts` stays untouched).
  - Semantic changes to `ArtifactRequirementPolicy`, `evaluateReadiness`,
    revisions, progress token, or state-version allocation.
  - Every path outside Allowed Paths; compatibility code, dual authority,
    semantic fallback, or a second fact-parsing path.
- Taste constraints: the collector is a thin memoizing facade over existing
  effects functions — if a getter needs new parsing logic, the getter is
  wrong; move on or hand back. Laziness must be structural (thunks/once
  wrappers), not flag-checked at each call site.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path
  outside Allowed Paths.
- Stop if exercising the collector on SessionStart cannot keep output and
  subprocess count byte-identical to the HRD-01 golden.
- Stop if any fact cannot be served by delegating to an existing authority
  without new parsing.
- Stop if the HRD-01 characterization golden would need regeneration or any
  existing test changes value.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The one-collector-per-event direction is falsified if lazy memoized
collection cannot keep SessionStart byte-identical (meaning the existing
resolution path has hidden per-call side effects the collector cannot
preserve). Cheapest proof point: route `effectiveStateSessionSection` through
the collector first and run the characterization test before building any
other getter; if the golden shifts, stop.

## Root Cause Evidence

Not applicable: this is a `code-change` establishment package, not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md`
- Source sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`
- Frozen baseline: `tests/fixtures/loop-runtime/characterization.json` (HRD-01)
- Runtime entry wired: `src/cli/hook/runtime.ts` (`runHook()`)
- Active plan: `plans/plan-20260720-0020-hrd-02-state-input-collector.md`
- Review file: `tasks/reviews/20260720-0020-hrd-02-state-input-collector.review.md`
- Notes file: `tasks/notes/20260720-0020-hrd-02-state-input-collector.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `b57d6323fb8ba6a0edb55117abaf9953913d9ddf` /
  `codex/hrd-02-state-input-collector` /
  `/Users/kito/Projects/repo-harness-wt-hrd-02-state-input-collector`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260720-0020-hrd-02-state-input-collector.md
  - plans/sprints/20260719-1531-hook-runtime-diet.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md
  - tasks/reviews/20260720-0020-hrd-02-state-input-collector.review.md
  - tasks/notes/20260720-0020-hrd-02-state-input-collector.notes.md
  - src/effects/loop/state-input-collector.ts
  - src/cli/hook/runtime.ts
  - tests/state-input-collector.test.ts
  - tests/fixtures/loop-runtime/state-input-collector.json
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
    - src/effects/loop/state-input-collector.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260720-0020-hrd-02-state-input-collector.notes.md
  tests_pass:
    - path: tests/state-input-collector.test.ts
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
    - "HRD-01 characterization golden is byte-identical to its merged state"
```

## Acceptance Notes (Human Review)

- Functional behavior: collector exists and is threaded from the entry, but
  the only production path exercising it is SessionStart's existing single
  resolution; all host-visible outputs identical to the HRD-01 baseline.
- Edge cases: events with no repo (opt-out), corrupt cache, and concurrent
  events must not break laziness or memoization; collector must not leak
  state across events.
- Regression risks: hidden side effects in the existing resolution path
  (cache writes, version allocation) must flow through unchanged — the
  characterization golden and the state tests are the guards.

## Rollback Point

- Commit / checkpoint: branch fork point `b57d6323fb8ba6a0edb55117abaf9953913d9ddf`
- Revert strategy: revert the independent HRD-02 PR; the package adds one effects module and tests plus a thin entry wiring in `runtime.ts` — reverting restores the exact HRD-01 baseline.
