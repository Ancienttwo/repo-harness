# Task Contract: merge-gate-enforcement

> **Status**: In Progress
> **Plan**: plans/plan-20260714-1713-merge-gate-enforcement.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-14 23:41
> **Review File**: `tasks/reviews/20260714-1713-merge-gate-enforcement.review.md`
> **Notes File**: `tasks/notes/20260714-1713-merge-gate-enforcement.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The current ship boundary trusts review and check artifacts but does not invoke or verify a single semantic gatekeeper verdict bound to the exact merge candidate. Without a fail-closed receipt, an agent-driven flow can accidentally merge after HEAD or the diff moves, or bypass the intended gatekeeper entirely.

## Goal

Install one local, read-only merge-gate protocol and require the ship orchestrator to produce and verify a PASS receipt bound to the repository, target base SHA, candidate head SHA, and diff fingerprint before a contract worktree can be pushed or merged.

## Scope

- In scope: a concise `merge-gate` skill; one local Claude gatekeeper runner contract; deterministic receipt generation/validation; ship-worktrees fail-closed enforcement; runtime skill installation; focused tests; architecture and workflow projections.
- Out of scope: GitHub App/check-run publication, hosted execution, provider fallback, compatibility receipt shapes, changes to worker agents, and unrelated agent-fleet model routing.
- Taste constraints: Keep the agent runtime wrapper thin. The skill owns review semantics; the orchestrator owns receipt persistence and all repository mutations.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a valid receipt cannot be deterministically invalidated by changing only HEAD or the base-to-head diff. The cheapest proof is a fixture that reuses one PASS receipt after a new commit and must fail before any ship side effect.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260714-1713-merge-gate-enforcement.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260714-1713-merge-gate-enforcement.review.md`
- Notes file: `tasks/notes/20260714-1713-merge-gate-enforcement.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/context/capabilities.json
  - .ai/harness/policy.json
  - .ai/harness/workflow-contract.json
  - assets/skills/merge-gate/
  - assets/reference-configs/external-tooling.md
  - assets/templates/helpers/contract-worktree.sh
  - assets/templates/helpers/archive-workflow.sh
  - assets/templates/helpers/merge-gate.ts
  - assets/templates/helpers/ship-worktrees.sh
  - assets/templates/helpers/verify-sprint.sh
  - assets/workflow-contract.v1.json
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/reference-configs/external-tooling.md
  - plans/
  - scripts/contract-worktree.sh
  - scripts/archive-workflow.sh
  - scripts/merge-gate.ts
  - scripts/ship-worktrees.sh
  - scripts/verify-sprint.sh
  - src/cli/commands/init.ts
  - src/cli/commands/global-runtime.ts
  - src/cli/runtime/helper-runner.ts
  - src/effects/process-runner.ts
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260714-1713-merge-gate-enforcement.contract.md
  - tasks/reviews/20260714-1713-merge-gate-enforcement.review.md
  - tasks/notes/20260714-1713-merge-gate-enforcement.notes.md
  - tasks/workstreams/workflow-engine/contract-assets/
  - tests/cli/init.test.ts
  - tests/cli/global-runtime-init.test.ts
  - tests/cli/run.test.ts
  - tests/helper-scripts.test.ts
  - tests/merge-gate.test.ts
  - tests/process-runner.test.ts
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
    - assets/skills/merge-gate/SKILL.md
    - assets/skills/merge-gate/agents/openai.yaml
    - scripts/merge-gate.ts
    - assets/templates/helpers/merge-gate.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260714-1713-merge-gate-enforcement.notes.md
  tests_pass:
    - path: tests/merge-gate.test.ts
    - path: tests/cli/init.test.ts
    - path: tests/process-runner.test.ts
  commands_succeed:
    - bun test tests/merge-gate.test.ts tests/cli/init.test.ts tests/cli/global-runtime-init.test.ts tests/cli/run.test.ts tests/process-runner.test.ts
    - bun test tests/helper-scripts.test.ts tests/archive-evidence-gates.test.ts --test-name-pattern 'merge gate runs after|ship-worktrees default mode|restores live workflow state|contract-worktree does not mask'
    - bun run check:type
    - cmp scripts/merge-gate.ts assets/templates/helpers/merge-gate.ts
    - cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh
    - cmp scripts/ship-worktrees.sh assets/templates/helpers/ship-worktrees.sh
    - python3 /Users/kito/.codex/skills/.system/skill-creator/scripts/quick_validate.py assets/skills/merge-gate
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: PASS receipts are generated by the orchestrator from strict JSON output and verified immediately before ship side effects.
- Edge cases: missing runner, malformed output, FAIL/BLOCKED, moved HEAD, changed diff, wrong repository, and stale base all fail closed.
- Regression risks: downstream helper projection and skill installation must remain byte-identical and host-scoped.

## Rollback Point

- Commit / checkpoint: the single merge-gate enforcement commit for this work-package.
- Revert strategy: revert the skill, runner/verifier, ship integration, policy, projection, and tests together.
