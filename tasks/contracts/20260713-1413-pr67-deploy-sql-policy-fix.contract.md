# Task Contract: pr67-deploy-sql-policy-fix

> **Status**: Active
> **Plan**: plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-13 15:06
> **Review File**: `tasks/reviews/20260713-1413-pr67-deploy-sql-policy-fix.review.md`
> **Notes File**: `tasks/notes/20260713-1413-pr67-deploy-sql-policy-fix.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

PR #67 introduces a policy-controlled deployment SQL gate used by downstream strict workflow checks. The submitted branch is stale and its new fail-closed claims are falsified by control-character injection, missing invariant files, duplicate basenames across roots, and symlinked SQL files. Shipping it unchanged would let invalid migration assets receive a green workflow result while installed hooks and skills continue to instruct agents to use a contradictory layout.

## Goal

Rebuild PR #67 on current `main` as one coherent work-package that makes `operations.deploy_sql` the single optional override authority, closes every reproduced hollow-green path, preserves the existing `--root deploy/sql` assertion contract, synchronizes the installed guidance surfaces, and reaches green local plus remote PR verification without carrying commit `3bf58a8` or unrelated workflow history.

## Scope

- In scope:
  - Apply only the intended configurable deploy-SQL feature on top of current `main`.
  - Reject policy record injection, explicit missing invariant files, duplicate-basename invariant false positives, and regular or escaping SQL symlinks.
  - Preserve `--root deploy/sql` as a non-authoritative assertion and reject other CLI root values.
  - Align source/package helper mirrors, policy seed wording, hooks, deploy skill, generated root guidance, deploy README content, architecture truth, and their existing tests.
  - Maintain the plan, contract, notes, review, workstream/architecture artifacts, and current-status projection required for verified workflow closeout.
- Out of scope:
  - SQL execution, migrations, compatibility fallbacks, new dependencies, unrelated workflow cleanup, and changes to other active worktrees.
- Taste constraints: use direct validation and existing helpers; add no dependency, compatibility alias, parser framework, migration layer, or broad refactor.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the intended three-file feature patch cannot apply to current `main`, or if a regression fixture still gets exit 0 for a forged policy record, explicit missing invariant path, duplicate basename reference, or SQL symlink. The cheapest proof is the focused deploy-SQL helper test group before any distribution-surface edits.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260713-1413-pr67-deploy-sql-policy-fix.review.md`
- Notes file: `tasks/notes/20260713-1413-pr67-deploy-sql-policy-fix.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/harness/policy.json
  - .ai/harness/handoff/current.md
  - .ai/harness/handoff/resume.md
  - .ai/hooks/.projection.json
  - .ai/hooks/pre-edit-guard.sh
  - .ai/hooks/post-edit-guard.sh
  - AGENTS.md
  - CLAUDE.md
  - assets/hooks/pre-edit-guard.sh
  - assets/hooks/post-edit-guard.sh
  - assets/partials/04-project-structure.partial.md
  - assets/partials-agents/02-operating-mode.partial.md
  - assets/skill-commands/repo-harness-deploy/SKILL.md
  - assets/templates/helpers/check-deploy-sql-order.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - deploy/README.md
  - docs/CHANGELOG.md
  - docs/architecture/index.md
  - docs/architecture/modules/verification/evals-checks.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/architecture/requests/
  - plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md
  - scripts/check-deploy-sql-order.sh
  - scripts/create-project-dirs.sh
  - scripts/ensure-task-workflow.sh
  - scripts/init-project.sh
  - scripts/lib/project-init-lib.sh
  - scripts/migrate-project-template.sh
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260713-1413-pr67-deploy-sql-policy-fix.contract.md
  - tasks/reviews/20260713-1413-pr67-deploy-sql-policy-fix.review.md
  - tasks/notes/20260713-1413-pr67-deploy-sql-policy-fix.notes.md
  - tasks/workstreams/workflow-engine/contract-assets/
  - tests/action-command-skills.test.ts
  - tests/bootstrap-files.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/helper-scripts.test.ts
  - tests/hook-runtime.test.ts
  - tests/migration-script.test.ts
  - tests/workflow-contract.test.ts
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
    - scripts/check-deploy-sql-order.sh
    - assets/templates/helpers/check-deploy-sql-order.sh
    - assets/skill-commands/repo-harness-deploy/SKILL.md
    - docs/architecture/modules/verification/evals-checks.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260713-1413-pr67-deploy-sql-policy-fix.notes.md
  tests_pass:
    - path: tests/helper-scripts.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/action-command-skills.test.ts
    - path: tests/create-project-dirs.runtime.test.ts
    - path: tests/migration-script.test.ts
  commands_succeed:
    - bun test --timeout 60000 --max-concurrency 4 tests/helper-scripts.test.ts tests/hook-runtime.test.ts tests/action-command-skills.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts tests/workflow-contract.test.ts
    - REPO_HARNESS_BRAIN_ROOT=/private/tmp/repo-harness-pr67-ci-no-vault bash scripts/check-ci.sh
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
    - git diff --check
  files_contain:
    - path: scripts/check-deploy-sql-order.sh
      pattern: "operations.deploy_sql"
    - path: assets/hooks/pre-edit-guard.sh
      pattern: "operations.deploy_sql"
    - path: assets/skill-commands/repo-harness-deploy/SKILL.md
      pattern: "deploy_sql"
  qa_scores:
    - dimension: functionality
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: default deploy/sql ordered4 semantics remain intact; explicit policy roots become the only alternate authority.
- Edge cases: control characters, missing explicit invariant, duplicate basenames, symlinked SQL, overlapping roots, traversal, unknown naming, and CLI --root behavior are covered.
- Regression risks: shell/Bun record parsing, packaged helper resolution, hook guidance parity, scaffold policy wording, and strict workflow integration.

## Rollback Point

- Commit / checkpoint: rebased `origin/main` at `f248e76f81a00d6b9a306cb4c69119c3ea9c5805` and pre-remediation remote PR head `0bfbb657367b253b29ba430065bc2027de9c5a95`.
- Revert strategy: revert the single rebuilt PR commit, or restore the recorded remote PR head with `--force-with-lease` before merge.
