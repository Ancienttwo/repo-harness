# Task Contract: bdd2-e-03-run-experiment-a-audit-hypothesis

> **Status**: Active
> **Plan**: plans/plan-20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.md
> **Task Profile**: eval-only
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-12 18:15
> **Review File**: `tasks/reviews/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.review.md`
> **Notes File**: `tasks/notes/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

BDD² Audit is still an unverified product hypothesis. Without a frozen comparison
against the existing review rubric, the project cannot know whether behavior audit
finds more real journey/exposure/recovery defects or merely produces more plausible
findings. Shipping product surfaces before this proof would recreate the
overengineering problem the module is intended to prevent.

## Goal

Deliver an independently reviewable Experiment A result from 12 held-out fixtures,
two review conditions, and two repetitions: 48 successful outputs, 48 locked
condition-blind Agent-panel scores, a deterministic durable evidence projection,
and a Pass or Kill report covering precision, overall/P0-P1 recall, clean false
positives, correct no-findings, severity agreement, and correction cost.

## Scope

- In scope:
  - Directly cut evaluation authority to v3 with per-experiment score/metric files.
  - Rename the global Shape schema to a Shape-only path without an alias.
  - Complete six seeded and six clean held-out Audit fixtures plus exhaustive truth.
  - Implement fail-closed Audit score, coordinate, evidence, and summary validation.
  - Seal and run A with the exact Codex 0.144.1 / gpt-5.6-sol / xhigh profile.
  - Record Agent-panel proxy limitations, Pass/Kill gates, and one E-03 PR.
  - Synchronize Sprint/plan/current workflow evidence for E-02 and E-03.
- Out of scope:
  - Rerunning or changing Experiment S.
  - Browser/ImageGen Experiment E, implementation pilot I, or final Phase E decision.
  - Public BDD skill, CLI/MCP tool, hook, `/check` integration, catalog, sidecar,
    validator, lifecycle, or product runtime.
  - New dependencies, generic eval framework/service/database, compatibility reader,
    or human-panel claim.
- Taste constraints: one authority per datum; exact schemas; fail closed on leakage,
  ambiguity, coordinate drift, duplicate truth matches, and missing evidence.

## Stop Conditions

- Stop before execution if any prompt, task, truth, rubric, schema, metric, runner,
  model, version, sampling, or environment value is not frozen and hashed.
- Stop and invalidate the revision if held-out truth/treatment identity reaches an
  agent/reviewer packet, or if source-commit evidence cannot be reconstructed.
- Stop if completing A requires an Experiment E/I or Phase P product surface.
- Record `Kill` without threshold changes if any pre-registered Audit gate fails.
- Stop and hand back if a required change falls outside Allowed Paths.

## Falsifier

The direction is falsified when treatment precision is below 70%, overall seeded
recall below 80%, P0/P1 recall below 100%, clean false-positive rate above 20%,
correct no-findings below 80%, severity agreement below 85%, or any P0/P1 issue is
underestimated. The cheapest proof is the deterministic summary over validated
locked scores; no product code is needed.

## Root Cause Evidence

Not applicable; this is an evaluation work package, not a bugfix.

## Workflow Inventory

- Source plan: `plans/plan-20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.md`
- Source Sprint: `plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.review.md`
- Notes file: `tasks/notes/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/bdd2/`
- Scope gate: only `allowed_paths` below.
- Completion gate: strict contract, exact-diff external acceptance, full CI, hosted
  PR Test and matrix, and report decision with no manual threshold override.

## Allowed Paths

```yaml
allowed_paths:
  - evals/bdd2/evaluation-manifest.json
  - evals/bdd2/tasks/held-out.json
  - evals/bdd2/truth/held-out.json
  - evals/bdd2/rubrics/score.schema.json
  - evals/bdd2/rubrics/shape-score.schema.json
  - evals/bdd2/rubrics/audit-score.schema.json
  - evals/bdd2/rubrics/blind-adjudication.md
  - evals/bdd2/metrics/audit-metrics.md
  - evals/bdd2/reports/experiment-a-evidence.json
  - evals/bdd2/reports/experiment-a.md
  - scripts/run-bdd2-evals.ts
  - tests/run-bdd2-evals.test.ts
  - tests/bdd2-evals-contract.test.ts
  - plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md
  - plans/plan-20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.md
  - tasks/contracts/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.contract.md
  - tasks/reviews/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.review.md
  - tasks/notes/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.notes.md
  - tasks/current.md
  - .ai/harness/handoff/current.md
  - .ai/harness/handoff/resume.md
  - .ai/harness/runs/bdd2
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
      purpose: experiment_owner
    runner:
      mode: read_only_isolated
      purpose: produce_frozen_audit_responses
    blind_reviewer:
      mode: write_evaluation_scores_only
      purpose: condition_blind_finding_adjudication
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - main-thread
      - codex-exec
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - evals/bdd2/rubrics/shape-score.schema.json
    - evals/bdd2/rubrics/audit-score.schema.json
    - evals/bdd2/metrics/audit-metrics.md
    - evals/bdd2/reports/experiment-a-evidence.json
    - evals/bdd2/reports/experiment-a.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/bdd2/bdd2-e03-audit-a-v1/run.json
    - tasks/notes/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.notes.md
  tests_pass:
    - path: tests/run-bdd2-evals.test.ts
    - path: tests/bdd2-evals-contract.test.ts
  commands_succeed:
    - bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts
    - bun scripts/run-bdd2-evals.ts validate
    - bun scripts/run-bdd2-evals.ts plan --experiment A --partition held_out --dry-run
    - bun scripts/run-bdd2-evals.ts validate-scores --experiment A --run .ai/harness/runs/bdd2/bdd2-e03-audit-a-v1
    - repo-harness run check-task-workflow --strict
  qa_scores:
    - dimension: functionality
      min: 8
```

## Acceptance Notes (Human Review)

- Functional behavior: exact 48-coordinate run, 48 locked scores, generated evidence,
  every Audit metric/gate, and explicit Pass or Kill.
- Edge cases: clean pass/inconclusive distinction, duplicate truth match, unmatched
  finding, missing coordinate/score, prompt drift, P0/P1 underestimation, zero
  findings denominator, authority gap, and Agent failure.
- Regression risks: breaking historical Shape projection, coupling S/A freeze, or
  presenting Agent-panel proxy evidence as human judgment.

## Rollback Point

- Commit / checkpoint: sealed A authority commit before model execution, followed by
  locked-score and report commits.
- Revert strategy: revert the E-03 PR and remove ignored A-v1 run evidence; no
  product runtime, data migration, or compatibility state exists.
