# Task Contract: obsidian-companion-dependencies

> **Status**: Active
> **Plan**: plans/plan-20260821-0021-obsidian-companion-dependencies.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-21 02:40
> **Review File**: `tasks/reviews/20260821-0021-obsidian-companion-dependencies.review.md`
> **Notes File**: `tasks/notes/20260821-0021-obsidian-companion-dependencies.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`obsidian-memory` currently declares two hard companion Skills in its own body,
but the catalog and installer do not model or install them. A profile install can
therefore report success while the first explicit memory operation fails. The
catalog must become the single dependency authority without making vault access
or third-party downloads part of the default workflow.

## Goal

Register pinned, integrity-checked `obsidian-markdown` and `obsidian-cli`
external packages; model `obsidian-memory`'s dependency closure; and install or
refresh that exact bundle only when `repo-harness install|update
--with-obsidian-skills` is explicitly supplied. Preserve optional `brainRoot`,
non-vault hooks/CI, and the existing atomic global-runtime transaction.

## Scope

- In scope: manifest provenance/integrity entries and dependency edges; catalog
  dependency validation/closure selection; install/update CLI opt-in; external
  Skill projection/receipt/rollback; tooling readiness projection; focused
  tests and install-profile documentation; plus the user-approved, test-only
  removal of the stale per-test timeout that blocked the required full suite.
  The separately approved closeout slice also resizes the fixed verifier and
  outer helper budgets to contain the measured required suite, without adding
  a per-invocation override, and commits the contract authority before binding
  canonical evidence.
- Out of scope: vendoring upstream Skill bodies; installing or launching the
  `obsidian` executable or desktop App; npm runtime dependencies; vault
  discovery; hook/CI/workflow vault access; `brain sync` behavior.
- Taste constraints: one catalog dependency authority; no duplicate Obsidian
  Skill constant, compatibility parser, semantic fallback, or silent download.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if the existing external-Skill transaction cannot verify and project two
  subpaths from one immutable provider without weakening per-Skill full-tree
  integrity.

The user explicitly approved the bounded closeout-journal timeout unblocker on
2026-08-21. It may change only the regression guard's timeout ownership, not
the production closeout implementation or semantics.

## Falsifier

The direction is wrong if the current external-Skill transaction cannot express
two independently integrity-bound subpaths from one pinned provider. Cheapest
proof: pin the provider, compute both subtree hashes, and exercise the existing
fetch/verify path before broad installer changes.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260821-0021-obsidian-companion-dependencies.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260821-0021-obsidian-companion-dependencies.review.md`
- Notes file: `tasks/notes/20260821-0021-obsidian-companion-dependencies.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - docs/reference-configs/install-profiles.md
  - plans/
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260821-0021-obsidian-companion-dependencies.contract.md
  - tasks/reviews/20260821-0021-obsidian-companion-dependencies.review.md
  - tasks/notes/20260821-0021-obsidian-companion-dependencies.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - assets/skill-commands/manifest.json
  - assets/skills/obsidian-memory/
  - assets/templates/helpers/check-agent-tooling.sh
  - assets/templates/helpers/verify-contract.sh
  - scripts/check-agent-tooling.sh
  - scripts/verify-contract.sh
  - src/
  - tests/
  - docs/architecture/modules/verification/evals-checks.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/architecture/.projection-manifest.json
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
    - tasks/notes/20260821-0021-obsidian-companion-dependencies.notes.md
  tests_pass:
    - path: tests/skill-surface/catalog.test.ts
    - path: tests/skill-surface/obsidian-memory-contract.test.ts
    - path: tests/check-agent-tooling.test.ts
    - path: tests/install-profiles.test.ts
  commands_succeed:
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: explicit opt-in installs/updates exactly the two pinned
  companion Skills for requested hosts; ordinary install/update does not fetch
  them.
- Edge cases: dependency graph rejects unknown, self, duplicate, cyclic, and
  host-incompatible edges; managed drift fails atomically after opt-in.
- Regression risks: default profile installs, global-runtime rollback, and
  optional no-`brainRoot` operation must stay unchanged.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
