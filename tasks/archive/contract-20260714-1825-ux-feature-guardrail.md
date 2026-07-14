> **Archived**: 2026-07-14 18:25
> **Related Plan**: plans/archive/plan-20260714-1710-ux-feature-guardrail.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260714-1825

# Task Contract: ux-feature-guardrail

> **Status**: Fulfilled
> **Plan**: plans/plan-20260714-1710-ux-feature-guardrail.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-14 17:10
> **Review File**: `tasks/reviews/20260714-1710-ux-feature-guardrail.review.md`
> **Notes File**: `tasks/notes/20260714-1710-ux-feature-guardrail.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The current frontend gate confirms visual direction but does not make an agent
freeze product rules, distinguish an instruction from its payload, inventory
existing reuse targets, or specify fail-loud behavior before implementation.
Without that boundary, generated UX code can satisfy a happy-path mock while
changing product semantics, duplicating components/domain logic, or hiding the
authoritative failure behind a compatibility path.

## Goal

Ship one canonical UX feature pre-implementation convention that extends the
existing design-brief and BDD flow. A confirmed brief must record frozen
behavior/non-goals, instruction-versus-payload semantics, existing
component/domain reuse targets, failure/copy behavior, and positive, negative,
and failure Given/When/Then scenarios before frontend execution.

## Scope

- In scope: packaged/self-host runtime doc, agentic routing row, design-brief
  projection, PRD hand-off, BDD advisory copy, adoption inclusion, focused tests,
  and workflow closeout artifacts.
- Out of scope:
  - Public BDD skill, CLI/MCP tool, lifecycle, sidecar, ledger, score, or validator.
  - Automatic semantic inference of gameplay/product rules or memory payloads.
  - Compatibility paths, dual authority, silent fallback, or best-effort product behavior.
  - Unrelated agent-fleet changes already dirty in the user's main checkout.
- Taste constraints: keep this a short human-confirmed guard card; do not revive
  the BDD2/BDD3 validator machinery rejected by sealed evaluation evidence.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the existing design-brief/BDD chain cannot carry the four failure classes
without a second artifact or semantic validator, this direction is wrong. The
cheapest proof is a focused fixture proving the packaged convention, brief,
prompt advisory, and adoption surface remain coherent without new runtime state.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260714-1710-ux-feature-guardrail.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260714-1710-ux-feature-guardrail.review.md`
- Notes file: `tasks/notes/20260714-1710-ux-feature-guardrail.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260714-1710-ux-feature-guardrail.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260714-1710-ux-feature-guardrail.contract.md
  - tasks/reviews/20260714-1710-ux-feature-guardrail.review.md
  - tasks/notes/20260714-1710-ux-feature-guardrail.notes.md
  - assets/reference-configs/ux-feature-guard.md
  - docs/reference-configs/ux-feature-guard.md
  - assets/reference-configs/agentic-development-flow.md
  - docs/reference-configs/agentic-development-flow.md
  - assets/templates/design-brief.template.md
  - .claude/templates/design-brief.template.md
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - assets/skill-commands/repo-harness-prd/SKILL.md
  - assets/hooks/prompt-guard.sh
  - .ai/hooks/.projection.json
  - .ai/hooks/prompt-guard.sh
  - brain/repo-harness/references/agentic-development-flow.md
  - src/core/adoption/standard-plan.ts
  - tests/ux-feature-guardrail.test.ts
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
    - assets/reference-configs/ux-feature-guard.md
    - docs/reference-configs/ux-feature-guard.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260714-1710-ux-feature-guardrail.notes.md
  tests_pass:
    - path: tests/ux-feature-guardrail.test.ts
  commands_succeed:
    - bun test tests/ux-feature-guardrail.test.ts
```

## Acceptance Notes (Human Review)

- Functional behavior: UX feature requests route through one guard convention,
  then the existing design brief and Given/When/Then acceptance path.
- Edge cases: multi-direction taste choices still stop at `design-options`; an
  unavailable authority fails visibly instead of synthesizing product meaning.
- Regression risks: distributed template/hook copies can drift; parity tests
  cover the packaged and self-host projections.
- Review-only design gate: confirm the diff introduces no public BDD validator,
  ledger, sidecar, lifecycle, scoring surface, or semantic classifier.

## Rollback Point

- Commit / checkpoint: `codex/ux-feature-guardrail` work-package.
- Revert strategy: revert this branch as one unit; it adds no persisted runtime state.
