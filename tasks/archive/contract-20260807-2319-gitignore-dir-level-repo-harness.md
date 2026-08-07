> **Archived**: 2026-08-07 23:19
> **Related Plan**: plans/archive/plan-20260807-1128-gitignore-dir-level-repo-harness.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260807-2319

# Task Contract: gitignore-dir-level-repo-harness

> **Status**: Fulfilled
> **Plan**: plans/plan-20260807-1128-gitignore-dir-level-repo-harness.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-07 11:28
> **Review File**: `tasks/reviews/20260807-1128-gitignore-dir-level-repo-harness.review.md`
> **Notes File**: `tasks/notes/20260807-1128-gitignore-dir-level-repo-harness.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The downstream gitignore template protects only two dead `.repo-harness/` files while the four files the MCP server actually writes (including OAuth access/refresh tokens in `mcp.oauth-tokens.json`) are unprotected unless the user runs `mcp setup chatgpt` with repo scope. A user who starts `repo-harness mcp serve --transport http` directly gets credentials on disk in NOT-IGNORED state inside the repo working tree. This repo's own `.gitignore` has the same fail-open per-file shape. Shipping this wrong keeps the credential-leak path open in every generated downstream repo.

## Goal

Per-file `.repo-harness/` gitignore entries become one directory-level `.repo-harness/` rule in three places: the managed-block content in `src/core/adoption/gitignore-plan.ts`, this repo's own `.gitignore` (scattered `.repo-harness/*` entries consolidated), and any other authored template that projects gitignore content for downstream repos (check `assets/templates/gitignore.template`; report if it carries no `.repo-harness` entries). `git check-ignore -q .repo-harness/anything.json` reports IGNORED in this repo. Zero behavior change elsewhere.

## Scope

- In scope: `src/core/adoption/gitignore-plan.ts` managed-block content; this repo's `.gitignore`; other gitignore-projecting authored templates if found; tests/fixtures asserting the old per-file managed-block content.
- Out of scope: retiring repo config scope, `McpConfigScope` changes, `setup.ts` `ensureGitignoreEntries` compensation removal (its per-file lines become redundant next to the directory rule — acceptable overlap, removal is Slice 2), `chatgpt-browser.local.json` relocation, any `src/cli/mcp/` change.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the directory-level rule causes `repo-harness init --repo . --dry-run` to produce a different operation model than a fixture apply, or hides files the workflow intentionally tracks (nothing under `.repo-harness/` is intentionally tracked today — verify with `git ls-files .repo-harness/` returning empty), the direction is wrong. Cheapest proof point: `git ls-files .repo-harness/` before the change.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260807-1128-gitignore-dir-level-repo-harness.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260807-1128-gitignore-dir-level-repo-harness.review.md`
- Notes file: `tasks/notes/20260807-1128-gitignore-dir-level-repo-harness.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260807-1128-gitignore-dir-level-repo-harness.contract.md
  - tasks/reviews/20260807-1128-gitignore-dir-level-repo-harness.review.md
  - tasks/notes/20260807-1128-gitignore-dir-level-repo-harness.notes.md
  - .ai/context/capabilities.json
  - .gitignore
  - assets/templates/gitignore.template
  - scripts/lib/project-init-lib.sh
  - src/core/adoption/gitignore-plan.ts
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260807-1128-gitignore-dir-level-repo-harness.notes.md
  tests_pass:
    - path: tests/unit/gitignore-plan.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
    - bun src/cli/index.ts init --repo . --dry-run
    - git check-ignore -q .repo-harness/anything.json
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
