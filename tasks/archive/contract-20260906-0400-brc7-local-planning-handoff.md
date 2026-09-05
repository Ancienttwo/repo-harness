> **Archived**: 2026-09-06 04:00
> **Related Plan**: plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260906-0400
> **Archive Projection V1**: `plans/plan-20260906-0134-brc7-local-planning-handoff.md` => `plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md`
> **Archive Projection V1**: `tasks/notes/20260906-0134-brc7-local-planning-handoff.notes.md` => `tasks/archive/notes-20260906-0400-brc7-local-planning-handoff.md`
> **Archive Projection V1**: `tasks/contracts/20260906-0134-brc7-local-planning-handoff.contract.md` => `tasks/archive/contract-20260906-0400-brc7-local-planning-handoff.md`
> **Archive Projection V1**: `tasks/reviews/20260906-0134-brc7-local-planning-handoff.review.md` => `tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md`

# Task Contract: brc7-local-planning-handoff

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-06 01:34
> **Review File**: `tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md`
> **Notes File**: `tasks/archive/notes-20260906-0400-brc7-local-planning-handoff.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

BRC6 creates canonical repair tasks with pending plans. BRC7 must hand planning to the authorized local parent without letting an unbound, unsupported or protected plan acquire execution readiness. Existing TaskOffer and ExternalSourceBinding remain the sole readiness and source identity authorities.

## Goal

Deliver the approved BRC7 local planning handoff, exact observation/task/plan/evidence admission and hard feature/protection rejection, with no controller planning or worker dispatch.

## Scope

- In scope: approved BRC7 plan contracts, campaign post-adoption step and host result, exact external-source selectors, preflight evidence readback, TaskOffer admission and verification.
- Out of scope:
  - BRC8 worker dispatch, Claim/Lease/WorkEnvelope changes, BRC9 budgets, campaign state-machine redesign, provider authoring, automatic merge, Task/Lease/Acceptance/Publication protocol changes.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A campaign task reaches execution_ready without current exact source/plan/evidence binding, or the controller invokes hunt/LLM/worker. Cheapest proof: a disposable canonical task with a superficially Approved plan but no campaign admission must remain planning_required.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md`
- Notes file: `tasks/archive/notes-20260906-0400-brc7-local-planning-handoff.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"brc7-behavior","kind":"deterministic_test","paths":["*"]},{"id":"brc7-canonical-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/automation/campaign-planning.ts
  - src/effects/automation/campaign-planning.ts
  - src/effects/automation/campaign-planning-proof.ts
  - src/effects/automation/campaign-planning-store.ts
  - src/effects/fleet/acquire.ts
  - src/effects/external-sources/refresh.ts
  - src/cli/runtime/helper-runner.ts
  - src/cli/commands/campaign.ts
  - src/cli/commands/external-source.ts
  - assets/templates/helpers/contract-run.ts
  - scripts/contract-run.ts
  - tests/unit/campaign-planning.test.ts
  - tests/unit/fleet-acquire-effect.test.ts
  - tests/helpers/campaign-adoption-repository.ts
  - tests/effects/issue-batch-adoption.test.ts
  - tests/effects/campaign-planning.test.ts
  - tests/effects/external-source-github.test.ts
  - tests/cli/campaign-planning.test.ts
  - tests/fleet-acquire-concurrency.test.ts
  - tests/cli/fleet-offer-acquire.test.ts
  - tests/contract-run.test.ts
  - tests/unit/collaboration-authority-baseline.test.ts
  - docs/researches/20260905-repair-campaign-sprint-execution-boundaries.md
  - docs/architecture/
  - .archcontext/
  - plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md
  - plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/archive/contract-20260906-0400-brc7-local-planning-handoff.md
  - tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md
  - tasks/archive/notes-20260906-0400-brc7-local-planning-handoff.md
  - tasks/workstreams/
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
    - src/core/automation/campaign-planning.ts
    - src/effects/automation/campaign-planning.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260906-0400-brc7-local-planning-handoff.md
  tests_pass: []
  commands_succeed:
    - bun run check:type
    - bun run check:state-boundaries
    - bun test --timeout 60000
criterion_reuse:
  tests_pass: []
  commands_succeed:
    - bun run check:type
    - bun run check:state-boundaries
    - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: Exact local-host handoff and existing TaskOffer transition only.
- Edge cases: feature/protected hard stops, missing evidence, source/task/evidence drift, replay and host conflict, off/shadow.
- Regression risks: external-source mandatory inputs and fleet admission. Full suite required by user-supplied runtime rule, expected 20–25 minutes, once after freeze.

## Rollback Point

- Commit / checkpoint: main 86fac685
- Revert strategy: revert BRC7 implementation; retain immutable BRC6/provider artifacts.
