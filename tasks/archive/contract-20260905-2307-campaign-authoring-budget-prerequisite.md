> **Archived**: 2026-09-05 23:07
> **Related Plan**: plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260905-2307
> **Archive Projection V1**: `plans/plan-20260905-1841-campaign-authoring-budget-prerequisite.md` => `plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/notes/20260905-1841-campaign-authoring-budget-prerequisite.notes.md` => `tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1841-campaign-authoring-budget-prerequisite.contract.md` => `tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1841-campaign-authoring-budget-prerequisite.review.md` => `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md`

# Task Contract: campaign-authoring-budget-prerequisite

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 18:42
> **Review File**: `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Notes File**: `tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

BRC6 cannot adopt partial batches without authoritative exhausted and quiescent authoring evidence. A separate counter or global-stop shortcut would permit duplicate calls or block legal challenge readback.

## Goal

Deliver campaign-scoped authoring admission and terminal evidence inside the existing automation budget authority, and wire real initial/followup effects through it.

## Scope

- In scope: frozen plan P1/P2/P3; campaign grant round limit; bound budget reservations, terminal seal and consumer proof; authoring adapter and focused regressions.
- Approved verification repair: synchronize state guidance goldens and the mutation-guard characterization with existing behavior; do not change state runtime semantics.
- Out of scope: BRC6 adoption/challenge implementation, all remaining BRC9 limits, real provider canaries, global deployment.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Direction is wrong if a final-round race admits two calls, or exhausted authoring allows mutation after sealing, or a legal challenge is blocked only by the per-group round limit. Prove these with store-level fixtures before wiring browser I/O.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md`
- Notes file: `tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"campaign-budget-deterministic-regressions","kind":"deterministic_test","paths":["*"]},{"id":"campaign-budget-persisted-ledger-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - .archcontext/model/nodes/capability.runtime-harness.automation-budget.yaml
  - .archcontext/model/flows/flow.automation-budget.reserve-before-act.yaml
  - docs/
  - tasks/current.md
  - tasks/workstreams/
  - AGENTS.md
  - CLAUDE.md
  - plans/
  - tasks/todos.md
  - tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md
  - tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md
  - tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
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

Choose the smallest checks that cover the changed behavior. Add a full suite
only for an explicit release requirement or an observed cross-module coverage
gap; state that reason and expected cost in Acceptance Notes. Do not duplicate
coverage between `tests_pass` and `commands_succeed`. Before the first run,
list eligible deterministic criteria in `criterion_reuse`; eligibility requires
all inputs to be bound by the frozen subject/toolchain context. Leave external
or mutable-state criteria ineligible. The canonical acceptance runner owns the
expensive execution; workers and reviewers consume its evidence.

If a full suite already passed before a bounded follow-up edit, preserve its
run identity as baseline evidence and choose focused checks for the actual delta.
The parent revises these criteria and records the baseline plus coverage rationale
in Acceptance Notes, unless an explicit user/release requirement still requires
a full run on the new subject. A cache miss alone does not justify another full
suite; never label the old subject's pass as a full pass for the new subject.

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md
  tests_pass: []
  commands_succeed:
    - bun test --timeout 60000 tests/unit/campaign-authoring-budget-prerequisite.test.ts tests/unit/issue-282-automation-budget-store.test.ts tests/effects/campaign-step.test.ts tests/state/cli-state-golden.test.ts tests/state/loop-semantics-characterization.test.ts tests/unit/collaboration-authority-baseline.test.ts
    - bun run check:type
    - bun run check:state-boundaries
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
criterion_reuse:
  tests_pass: []
  commands_succeed: []
```

## Acceptance Notes (Human Review)

- Functional behavior: reserve before I/O; round exhaustion seals only authoring for one group/intent; challenge remains globally budgeted.
- Edge cases: concurrent final round, repeated keys, unknown calls, stale identity/revision, early complete seal, global stop, dry-run.
- Regression risks: shared grant/reservation shapes and store replay; existing budget suites and typecheck are mandatory, the supplied Required Checks explicitly require the full suite for shared machine-executed contracts/runtime changes. Run full suite once via canonical acceptance after freezing code (expected 25–30 minutes); it subsumes the named development suites, so do not duplicate them as executable acceptance criteria.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:

## Final evidence baseline and contract-only delta

- Full suite passed on frozen candidate c2ed377a, subject `sha256:8ee76d43e52fb9f94a8d0933a8d0928ee31cc63adfb00d75f610d0723a8b9948`, target c73633f4, canonical run `run-20260905T210102-90177`, criterion duration 1270968ms. All 14 contract checks passed. The outer prepare failed solely because this contract had omitted its Change Assessment oracle declaration.
- The follow-up changes only contract/review/notes evidence; no product, test or architecture content changes. Retain the full pass for its original subject and use the named focused suite plus integrity checks to prepare current contract evidence; a contract hash change is not an uncovered runtime risk and does not require a third full suite.
- `campaign-budget-deterministic-regressions` is the named focused command, backed by the full-suite baseline. `campaign-budget-persisted-ledger-readback` is the runtime store/effect portion of that same command: real temporary Git common-dir ledgers, cross-process admission, durable not-started reconciliation, terminal re-read and digest verification. It applies to the work-package's reservation/terminal contract and its documentation projections; it does not claim production-provider, global deployment or release-canary evidence.
