# Task Contract: bdd2-e-02-run-experiment-s-shape-hypothesis

> **Status**: Active
> **Plan**: plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-12 06:08
> **Review File**: `tasks/reviews/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.review.md`
> **Notes File**: `tasks/notes/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Experiment S is the first proof that a lightweight Behavior Card improves product
judgment rather than merely adding structure. A leaky, post-hoc, or cross-coupled
benchmark could authorize an unnecessary product module and invalidate every later
Phase E gate.

## Goal

Produce 72 frozen held-out Shape outputs, owner-authorized condition-blind Agent scores, reproducible
paired metrics, and an explicit Pass / Reshape / Kill decision without adding any
Phase P product surface.

## Scope

- In scope: per-experiment v2 evaluation authority; complete 12-task S set and
  private truth; isolated Codex execution; blind score validation; frozen Shape
  metrics; 72-output run; tracked report and decision.
- Out of scope: Experiment A/E/I execution or claims; Browser/ImageGen; public BDD
  skill/CLI/MCP/hook/check integration; Brief catalog/validator/sidecar/lifecycle;
  Agent scores represented as human evidence. Agent-panel results must remain
  explicitly labeled proxy evidence.
- Taste constraints: no dependencies, generic benchmark framework, compatibility
  parser, or second handwritten machine authority. Every new file must be a frozen
  authority or durable result with a named consumer.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if selected S authority is not clean, tracked, hash-valid, and independently
  sealed, or if agent/reviewer packets can expose truth or condition identity.
- Stop before result claims and PR completion when locked condition-blind owner-authorized Agent
  scores are unavailable.

## Falsifier

Kill or reshape Shape when unsupported expansion improves less than the
pre-registered threshold, wins do not exceed losses, required omissions increase,
or treatment introduces a P0/P1 protected omission. The cheapest proof is the
12-task proposal-only experiment; do not proceed to implementation pilot first.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.review.md`
- Notes file: `tasks/notes/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - evals/bdd2/evaluation-manifest.json
  - evals/bdd2/tasks/held-out.json
  - evals/bdd2/truth/held-out.json
  - evals/bdd2/rubrics/blind-adjudication.md
  - evals/bdd2/rubrics/score.schema.json
  - evals/bdd2/metrics/shape-metrics.md
  - evals/bdd2/reports/experiment-s.md
  - scripts/run-bdd2-evals.ts
  - tests/run-bdd2-evals.test.ts
  - tests/bdd2-evals-contract.test.ts
  - plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md
  - plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.contract.md
  - tasks/reviews/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.review.md
  - tasks/notes/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.notes.md
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
    blind_reviewer:
      mode: write_evaluation_scores_only
      purpose: owner_authorized_condition_blind_adjudication
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
    - evals/bdd2/metrics/shape-metrics.md
    - evals/bdd2/reports/experiment-s.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.notes.md
  tests_pass:
    - path: tests/run-bdd2-evals.test.ts
    - path: tests/bdd2-evals-contract.test.ts
  commands_succeed:
    - bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts
    - bun scripts/run-bdd2-evals.ts validate
    - bun scripts/run-bdd2-evals.ts plan --experiment S --partition held_out --dry-run
    - repo-harness run check-task-workflow --strict
  qa_scores:
    - dimension: functionality
      min: 8
  manual_checks:
    - "72 successful held-out S packets and 72 valid locked final scores exist"
    - "Owner-authorized blind Agent panel confirms scores were locked before reveal"
    - "Tracked report reproduces the pre-registered metrics and decision and discloses the proxy panel, truth-use, overlap, and filesystem-isolation limits"
    - "Evaluator review file recommends pass and confirms no Phase P surface"
```

## Acceptance Notes (Human Review)

- Functional behavior: independent S seal, isolated 72-coordinate run, blind score
  validation, deterministic aggregation, and explicit gate decision.
- Edge cases: zero baseline denominator, missing/duplicate/mismatched scores,
  unsealed A, command-version drift, dirty/untracked authority, agent failure.
- Regression risks: breaking the E-01 foundation contract is intentional only at
  the unused schema boundary; focused tests must prove the direct v2 cutover.

## Rollback Point

- Commit / checkpoint: E-02 authority commit before remote run, followed by the
  adjudicated report commit.
- Revert strategy: revert the E-02 PR and remove ignored raw evidence; no product
  runtime or data migration rollback exists.
