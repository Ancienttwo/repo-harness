# Task Contract: bdd2-eval-foundation

> **Status**: Active
> **Plan**: plans/plan-20260712-0450-bdd2-eval-foundation.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-12 04:52
> **Review File**: `tasks/reviews/20260712-0450-bdd2-eval-foundation.review.md`
> **Notes File**: `tasks/notes/20260712-0450-bdd2-eval-foundation.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Every later BDD² claim depends on treatment, task, rubric, and run coordinates
remaining stable and blind. If this foundation leaks truth labels, silently accepts
drift, or creates product code before the hypothesis passes, Phase E results cannot
authorize or kill productization.

## Goal

Create the sole committed evaluation authority and a deterministic eval-only runner
for the separate Shape (S) and Audit (A) hypotheses. The runner must fail closed on
input drift, keep truth and condition identity out of agent-visible packets, and
capture reproducible raw evidence without adding public BDD product surface.

## Scope

- In scope: approved PRD/Sprint, versioned S/A manifest, frozen treatment prompts,
  development/held-out task partitions, blind adjudication rubric/score schema,
  strict validation, deterministic selection/repetition/dry-run, configured agent
  execution, raw artifact capture, blinded packet emission, and stub-driven tests.
- Out of scope: any public `repo-harness-bdd` skill/CLI/MCP/hook/check integration;
  Behavior Brief catalog/validator, sidecar/lifecycle; S/A outcome claims;
  Browser/ImageGen execution; implementation pilot; Phase P productization.
- Taste constraints: one manifest authority; content-addressed inputs; no semantic
  fallback, compatibility parser, shadow authority, or product implementation hidden
  in evaluation helpers.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if execution requires installing or registering a BDD product skill.
- Stop if held-out truth or the semantic treatment name must enter an agent packet.
- Stop if reproducibility requires a second handwritten authority beside the manifest.

## Falsifier

The design is wrong if a byte change in a frozen input can execute without an
explicit manifest update, or if an agent-visible packet contains truth/treatment
identity. The cheapest proof is a focused test that mutates a prompt and injects a
truth sentinel, then expects validation to fail before any agent command runs.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260712-0450-bdd2-eval-foundation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-0450-bdd2-eval-foundation.review.md`
- Notes file: `tasks/notes/20260712-0450-bdd2-eval-foundation.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Execution Boundary

The requirements and Allowed Paths below are exhaustive. Absent requirements are
forbidden design space, not permission to improve adjacent evaluation or product
systems. Unrequested extras fail closed and require an explicit contract revision.

## Allowed Paths

```yaml
allowed_paths:
  - evals/bdd2
  - scripts/run-bdd2-evals.ts
  - tests/run-bdd2-evals.test.ts
  - tests/bdd2-evals-contract.test.ts
  - plans/prds/20260712-0409-bdd2-shape-audit.prd.md
  - plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md
  - plans/plan-20260712-0450-bdd2-eval-foundation.md
  - tasks/contracts/20260712-0450-bdd2-eval-foundation.contract.md
  - tasks/reviews/20260712-0450-bdd2-eval-foundation.review.md
  - tasks/notes/20260712-0450-bdd2-eval-foundation.notes.md
  - tasks/current.md
  - .ai/harness/handoff/current.md
  - .ai/harness/handoff/resume.md
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
    - evals/bdd2/evaluation-manifest.json
    - evals/bdd2/prompts/shape-baseline.md
    - evals/bdd2/prompts/shape-treatment.md
    - evals/bdd2/prompts/audit-baseline.md
    - evals/bdd2/prompts/audit-treatment.md
    - evals/bdd2/rubrics/blind-adjudication.md
    - evals/bdd2/rubrics/score.schema.json
    - evals/bdd2/tasks/development.json
    - evals/bdd2/tasks/held-out.json
    - evals/bdd2/truth/development.json
    - evals/bdd2/truth/held-out.json
    - scripts/run-bdd2-evals.ts
    - tests/run-bdd2-evals.test.ts
    - tests/bdd2-evals-contract.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260712-0450-bdd2-eval-foundation.notes.md
  files_not_exist:
    - assets/skill-commands/repo-harness-bdd/SKILL.md
    - plans/behaviors
    - src/cli/commands/bdd.ts
    - src/cli/mcp/behavior-tools.ts
  tests_pass:
    - path: tests/run-bdd2-evals.test.ts
    - path: tests/bdd2-evals-contract.test.ts
  commands_succeed:
    - bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts
    - bun scripts/run-bdd2-evals.ts validate
    - bun scripts/run-bdd2-evals.ts plan --experiment S --partition development --dry-run
    - repo-harness run check-task-workflow --strict
  qa_scores:
    - dimension: functionality
      min: 9
    - dimension: code quality
      min: 9
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: exact frozen coordinates produce exact execution plans and
  blinded artifacts; drift and leakage fail before agent execution.
- Edge cases: empty selection, unknown experiment/partition/condition, invalid
  repetition count, duplicate IDs, path escape, missing file, checksum drift,
  failed agent command, and pre-existing output path.
- Regression risks: evaluation runner accidentally becomes product runtime or a
  competing general benchmark authority; scope/review must reject both.

## Rollback Point

- Commit / checkpoint: branch `codex/bdd2-eval-foundation` from `origin/main` at
  `788ba60cca5e0072febc19833002a3ffe497b0a1`.
- Revert strategy: revert the module commit; no runtime cutover, migration, user
  data, or compatibility path exists.
