> **Archived**: 2026-08-29 21:13
> **Related Plan**: plans/archive/plan-20260829-1853-c0-two-plane-authority-freeze.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260829-2113

# Task Contract: c0-two-plane-authority-freeze

> **Status**: Fulfilled
> **Plan**: plans/plan-20260829-1853-c0-two-plane-authority-freeze.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-collaboration
> **Last Updated**: 2026-08-29 18:53
> **Review File**: `tasks/reviews/20260829-1853-c0-two-plane-authority-freeze.review.md`
> **Notes File**: `tasks/notes/20260829-1853-c0-two-plane-authority-freeze.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

C1-C9 all write against the boundary between the collaboration plane and the
existing Task / Lease / Publication / Acceptance delivery authorities. If that
boundary is not decided first, every row renegotiates it, and the cheapest way to
make a collaboration feature "work" is to quietly give it delivery authority --
which is exactly the kill gate the program is built to avoid. C0 pays the freeze
cost once, before any store exists.

## Goal

Produce the authority freeze for `capability.runtime-harness.collaboration` with
zero runtime behavior change:

1. An accepted (Resolved, archived) architecture request for the new capability.
2. A durable freeze record carrying the P1 map, four P2 traces and frozen
   decisions D1-D12, including the `max_parallel_readers=3` admission decision
   table with its test vectors and the recorded baseline negative proof that
   today's `admitReadOnlyDelegation()` does not consume `delegation_policy`.
3. A durable C0-C9 slice ledger inside that freeze record.
4. One baseline contract test that only enumerates existing authority protocol
   versions and wire identities and pins the negative proof.

## Scope

- In scope: `plans/`, `docs/architecture/requests/`, `docs/architecture/index.md`,
  `docs/researches/`, `tasks/` workflow artifacts, and
  `tests/unit/collaboration-authority-baseline.test.ts`.
- Out of scope: every file under `src/` (C0 makes no runtime change); the five
  program plan files under `plans/prds/20260828-2321-*` and
  `plans/sprints/20260828-2321-*`; `.ai/harness/policy.json` feature-flag wiring
  (C1 and later); the `.archcontext` capability node, `docs/architecture/modules/`
  and `tasks/workstreams/` (all three require a registered capability with
  existing prefixes and entrypoint anchors, so they land with C1's real source);
  any Review, Verification or Merge surface.
- Taste constraints: no compatibility shim, no placeholder branch for Deferred or
  Unsupported actor kinds, and no assertion of runtime behavior C0 does not
  produce -- the admission table is a model-layer freeze and the runtime canary
  belongs to C4.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The freeze would be wrong if the collaboration plane could not carry its context
into a delegated run without changing `DelegatedRunIntentV1.context_packet_sha256`
semantics. Cheapest proof point, already checked: the two assertions at
`src/effects/engineers/delegated-run-store.ts:731` and `:791` bind that field to
`DelegationExecutionPacketV1.packet_sha256`, so an additive
`CollaborationRunContextBindingV1` is the only shape that works without a protocol
bump.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260829-1853-c0-two-plane-authority-freeze.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260829-1853-c0-two-plane-authority-freeze.review.md`
- Notes file: `tasks/notes/20260829-1853-c0-two-plane-authority-freeze.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"collaboration-authority-baseline","kind":"deterministic_test","paths":["*"]},{"id":"repo-full-suite","kind":"deterministic_test","paths":["*"]},{"id":"c0-architecture-acceptance","kind":"manual_acceptance","paths":["docs/architecture/requests/archive/2026/runtime-harness-collaboration.md","docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260829-1853-c0-two-plane-authority-freeze.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260829-1853-c0-two-plane-authority-freeze.contract.md
  - tasks/reviews/20260829-1853-c0-two-plane-authority-freeze.review.md
  - tasks/notes/20260829-1853-c0-two-plane-authority-freeze.notes.md
  - docs/architecture/index.md
  - docs/architecture/requests/
  - docs/researches/
  - tests/unit/collaboration-authority-baseline.test.ts
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
    runner_invocations: null
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/architecture/requests/archive/2026/runtime-harness-collaboration.md
    - docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260829-1853-c0-two-plane-authority-freeze.notes.md
  tests_pass:
    - path: tests/unit/collaboration-authority-baseline.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-sync.sh
    - bash scripts/check-architecture-sync.sh
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: none. C0 adds documentation, one workstream ledger and one
  test file. `git diff --name-only <base>..HEAD -- src/` must print nothing.
- Edge cases: the frozen inventory digest in the baseline test is derived from live
  exported constants, so it stays green through comment and refactor churn and goes
  red on a real authority identity change. The negative-proof assertions read
  `delegated-run-store.ts` and hold because C4's admission bridge is a new file
  under `src/effects/collaboration/`, not an edit to the existing admission path.
- Regression risks: none to runtime. The remaining risk is documentation drift --
  if a later row changes an authority identity without justifying it, the frozen
  inventory digest fails the suite rather than passing silently.

## Rollback Point

- Commit / checkpoint: `main@a490a5ef76b439228a4b3282934c29ba15090cdf`
- Revert strategy: revert the branch commits. No runtime code, no persisted state
  and no configuration change to unwind.
