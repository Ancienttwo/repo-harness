> **Archived**: 2026-09-05 18:16
> **Related Plan**: plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260905-1816
> **Archive Projection V1**: `plans/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md` => `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/notes/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.notes.md` => `tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.contract.md` => `tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.review.md` => `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`

# Task Contract: brc5-heartbeat-observation-slot-reconciliation

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 11:56
> **Review File**: `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Notes File**: `tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Provider Issues cannot be adopted safely until a complete local snapshot establishes exact slot identity and bounded follow-up behavior.

## Goal

Deliver BRC5 as frozen in the source plan: deterministic slot reconciliation, immutable observation evidence, and a persist-first heartbeat step with at most one external mutation.

## Scope

- In scope: BRC5 core, provider observer, durable step, CLI, focused tests and workflow evidence.
- Out of scope: BRC6 adoption, BRC7 planning, BRC8 acquisition, BRC9 budget authority, later cleanup and audits.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
- Notes file: `tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"brc5-reconciliation-matrix","kind":"deterministic_test","paths":["src/core/automation/issue-batch-reconcile.ts"]},{"id":"brc5-provider-observation","kind":"deterministic_test","paths":["src/effects/automation/issue-batch-observer.ts"]},{"id":"brc5-step-replay-and-target-binding","kind":"deterministic_test","paths":["src/effects/automation/campaign-step.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - docs/researches/
  - docs/architecture/
  - .archcontext/model/nodes/capability.runtime-harness.development-campaign.yaml
  - .archcontext/model/nodes/component.development-campaign.journal.yaml
  - tasks/current.md
  - tasks/workstreams/
  - AGENTS.md
  - CLAUDE.md
  - plans/
  - tasks/todos.md
  - tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md
  - tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md
  - tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - scripts/check-agent-tooling.sh
  - assets/templates/helpers/check-agent-tooling.sh
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

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md
  tests_pass:
    - path: tests/cli/codegraph-resolver.test.ts
    - path: tests/unit/issue-batch-reconcile.test.ts
    - path: tests/effects/issue-batch-observer.test.ts
    - path: tests/effects/campaign-step.test.ts
    - path: tests/cli/development-campaign.test.ts
    - path: tests/effects/gpt-pro-issue-authoring.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:state-boundaries
    - bun test --timeout 60000 tests/agents-assembly.test.ts tests/contract-run.test.ts tests/harness-runtime-profiles.test.ts tests/runtime-profile-enforcement.test.ts tests/mutation-guard.test.ts tests/state/project-effective-state.test.ts tests/architecture-projection-provider.test.ts tests/unit/refactor-candidate-verification.test.ts tests/unit/refactor-materialization-contract.test.ts tests/unit/refactor-multi-work-package.test.ts tests/unit/refactor-program-contract.test.ts tests/unit/refactor-execution-binding.test.ts tests/unit/refactor-post-merge-resolution.test.ts
    - bun test --timeout 60000 tests/helper-scripts.test.ts --test-name-pattern 'verify-contract reuses a passing expensive criterion|verify-sprint composes executed and reused criteria|verify-sprint reports unavailable authority|check-task-workflow delegates missing-contract admission'
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Full-suite baseline: source `3958ce3f`, target `ca0ede71ab4888cd0ecb2dd8c20da2dabbeef154`, run `run-20260905T170222-80330`: 4363 pass, 0 fail, 4 skip; all 13 executable criteria passed. The enclosing prepare failed only on target drift. This is evidence for that original source, not a pass for the integrated subject.
- Parent-approved delivery scope: user requested BRC5 merge into main. Integrated main `0d6bc102` as `5fcffc15`; BRC5 core/effect/CLI executable files are byte-identical to the full-suite baseline. The only merge conflict was generated architecture provenance, regenerated against BRC5's existing semantic baseline (no human actions or refresh signals).
- Final criteria revision: current root verification policy permits baseline plus focused delta checks. There is no separate user/release instruction requiring another full-suite run. Replace the inherited full-suite command with the six BRC5 suites, complete type/boundary checks, tests for changed workflow/profile/refactor boundaries, changed verifier context/reuse behavior, and repository-integrity commands. Do not claim exact-context cache reuse or relabel baseline evidence.
- Regression risks: new main changes workflow admission/context reporting and refactor multi-package closure. Named focused suites exercise those changed paths while the BRC5 suites cover their integration with heartbeat dispatch. At the pre-review integration checkpoint no uncovered BRC5 executable delta remained; failures stop acceptance rather than automatically escalating to a full rerun.

- Post-review repair delta: campaign-aware metadata validity now governs both slot classification and authorized body repair; campaign decisions and journal fingerprints use one locked snapshot, with a reservation-time per-issue edit limit. The two affected suites contain failing-before/passing-after regressions and remain mandatory final criteria. The historical full-suite baseline does not cover these repairs; current focused evidence covers their concrete behavior.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
