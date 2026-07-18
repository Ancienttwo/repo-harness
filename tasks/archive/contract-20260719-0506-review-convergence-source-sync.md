# Task Contract: review-convergence-source-sync

> **Status**: Active
> **Plan**: plans/plan-20260719-0432-review-convergence-source-sync.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-19 04:32
> **Review File**: `tasks/reviews/20260719-0432-review-convergence-source-sync.review.md`
> **Notes File**: `tasks/notes/20260719-0432-review-convergence-source-sync.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

This repo generates harness config for downstream projects. The review-trigger convergence and the claude-plan external-brain skill were applied only to installed host copies (`~/.claude`, `~/.codex`); without flowing them back into `assets/`, every future `repo-harness init` ships stale skills (330s codex-review budget, unpinned claude-review model) and omits claude-plan entirely.

## Goal

`assets/skills/` matches the newer installed copies (claude-review fable pin + opus retry; codex-review 1800s budget), `assets/skills/claude-plan/` exists and installs host-aware to Codex via init, and the reference-config docs describe the three cross-model skills and the review trigger discipline.

## Scope

- In scope: `assets/skills/{claude-review,codex-review,claude-plan}/SKILL.md`, `src/cli/commands/init.ts` bundled-skill table, `tests/cli/init.test.ts` fixtures/assertions, `docs/reference-configs/external-tooling.md`, `assets/reference-configs/{external-tooling,global-working-rules}.md`.
- Out of scope: installed host copies under `~/.claude` and `~/.codex` (already applied), Waza-managed skills, gstack tree, merge-gate runtime.
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

- Source plan: `plans/plan-20260719-0432-review-convergence-source-sync.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260719-0432-review-convergence-source-sync.review.md`
- Notes file: `tasks/notes/20260719-0432-review-convergence-source-sync.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and canonical `## External Acceptance Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - docs/reference-configs/external-tooling.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260719-0432-review-convergence-source-sync.contract.md
  - tasks/reviews/20260719-0432-review-convergence-source-sync.review.md
  - tasks/notes/20260719-0432-review-convergence-source-sync.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - assets/skills/
  - assets/reference-configs/
  - src/
  - tests/
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
    - assets/skills/claude-plan/SKILL.md
    - assets/skills/claude-review/SKILL.md
    - assets/skills/codex-review/SKILL.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260719-0432-review-convergence-source-sync.notes.md
  tests_pass:
    - path: tests/cli/init.test.ts
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - bun run check:type
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "assets/skills SKILL.md files are byte-identical to the installed host copies they were synced from"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
