> **Archived**: 2026-09-04 22:39
> **Related Plan**: plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260904-2239
> **Archive Projection V1**: `plans/plan-20260904-1950-bounded-frontier-stress-test-eval.md` => `plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md`
> **Archive Projection V1**: `tasks/notes/20260904-1950-bounded-frontier-stress-test-eval.notes.md` => `tasks/archive/notes-20260904-2239-bounded-frontier-stress-test-eval.md`
> **Archive Projection V1**: `tasks/contracts/20260904-1950-bounded-frontier-stress-test-eval.contract.md` => `tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md`
> **Archive Projection V1**: `tasks/reviews/20260904-1950-bounded-frontier-stress-test-eval.review.md` => `tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md`

# Task Contract: bounded-frontier-stress-test-eval

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-04 19:50
> **Review File**: `tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md`
> **Notes File**: `tasks/archive/notes-20260904-2239-bounded-frontier-stress-test-eval.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The frontier method is promising but conflicts with repo-harness's bounded,
delivery-first interview contract if adopted wholesale. A closed A/B eval is the
cheapest way to test the incremental method without creating product authority.

## Goal

Deliver a runnable, isolated comparison between the current minimum-effective
interview and an eval-only bounded-frontier treatment, grounded in historical
complex tasks and guarded by deterministic positive and negative cases.

## Scope

- In scope: eval-only treatment, five cases, local benchmark config, structural
  grader, evaluator isolation guard, static contract tests, wiring-only dry run,
  and a durable research verdict.
- Out of scope: managed Skills, manifests, profiles, hooks, product CLI changes,
  live provider runs, and effectiveness claims.
- Taste constraints: preserve one authority per decision; do not add context,
  ADR, decision-tree, or session-log artifacts.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the treatment cannot be isolated from managed Skill surfaces or cannot reject
the simple-task negative control deterministically, stop before any productization.
The cheapest proof is the static eval contract test plus a dry-run matrix.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md`
- Notes file: `tasks/archive/notes-20260904-2239-bounded-frontier-stress-test-eval.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"frontier-eval-contract-tests","kind":"deterministic_test","paths":["*"]},{"id":"frontier-eval-dry-run-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/architecture/.projection-manifest.json
  - docs/researches/20260904-bounded-frontier-stress-test-eval.md
  - evals/frontier-stress-test/
  - scripts/run-skill-evals.ts
  - plans/
  - tasks/todos.md
  - tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md
  - tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md
  - tasks/archive/notes-20260904-2239-bounded-frontier-stress-test-eval.md
  - tests/frontier-stress-test-eval.test.ts
  - tests/run-skill-evals.test.ts
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
    - docs/researches/20260904-bounded-frontier-stress-test-eval.md
    - evals/frontier-stress-test/evals.json
    - evals/frontier-stress-test/treatment/SKILL.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260904-2239-bounded-frontier-stress-test-eval.md
  tests_pass:
    - path: tests/frontier-stress-test-eval.test.ts
    - path: tests/run-skill-evals.test.ts
  commands_succeed:
    - bun -e 'import { runSkillEvals } from "./scripts/run-skill-evals.ts"; runSkillEvals({ evalsPath: "evals/frontier-stress-test/evals.json", configPath: "evals/frontier-stress-test/benchmark.config.json", dryRun: true })'
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: the five-case A/B matrix, isolated treatment, structural
  validator, zero-workspace-diff guard, and disposable live-run boundary are
  implemented. Managed planning behavior remains unchanged.
- Edge cases: the suite covers prerequisite ordering, answered-decision
  persistence, Human decision authority, forbidden artifacts, Approved plans
  with blocking unknowns, implementation starts, and simple-task dormancy.
- Regression risks: all current evidence is wiring-only dry-run evidence. The
  treatment remains eval-only until matched live trials satisfy the research
  decision gate.

## Rollback Point

- Commit / checkpoint: branch `codex/bounded-frontier-stress-test-eval`
- Revert strategy: revert the eval, research, test, and coupled workflow artifacts;
  runtime product behavior remains unchanged.
