# Task Contract: reverse-skill-recommended-dependency

> **Status**: Active
> **Plan**: plans/plan-20260810-1128-reverse-skill-recommended-dependency.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-10 11:28
> **Review File**: `tasks/reviews/20260810-1128-reverse-skill-recommended-dependency.review.md`
> **Notes File**: `tasks/notes/20260810-1128-reverse-skill-recommended-dependency.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Reverse Skill is useful as a discoverable dependency, but its upstream pack
explicitly treats a mentioned target as authorization. That conflicts with
repo-harness authority boundaries, so recommendation cannot mean automatic
profile installation. The catalog must remain selection and integrity
authority for a bounded explicit route.

## Goal

Register `reverse-skill-router` as a recommended, explicit-only dependency for
Claude and Codex. Install or refresh it only through
`--with-reverse-skill`, pin the audited upstream commit and selected-tree
digest, fail closed before host projection on drift, and keep both profile
projections unchanged.

## Scope

- In scope: catalog registration, pinned provider identity and integrity,
  explicit install/update projection, host transaction ownership paths,
  user-facing help/docs, and focused regression coverage.
- Out of scope: executing Reverse Skill workflows, installing its optional
  toolchains/MCP servers, vendoring upstream content, or changing the minimal
  profile.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the pinned upstream commit cannot expose
`reverse-skill-router`, if the selected tree does not match the catalog digest,
or if either normal profile selects it. Cheapest upstream proof: `bunx skills
add zhaoxuya520/reverse-skill@539899ddc7608d63dc66e08e794d572e080f1a55
--list` must list `reverse-skill-router`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260810-1128-reverse-skill-recommended-dependency.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260810-1128-reverse-skill-recommended-dependency.review.md`
- Notes file: `tasks/notes/20260810-1128-reverse-skill-recommended-dependency.notes.md`
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
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260810-1128-reverse-skill-recommended-dependency.contract.md
  - tasks/reviews/20260810-1128-reverse-skill-recommended-dependency.review.md
  - tasks/notes/20260810-1128-reverse-skill-recommended-dependency.notes.md
  - .ai/context/capabilities.json
  - .archcontext/model/nodes/
  - .claude/templates/
  - assets/skill-commands/manifest.json
  - assets/reference-configs/external-tooling.md
  - assets/reference-configs/harness-overview.md
  - docs/CHANGELOG.md
  - docs/architecture/
  - docs/reference-configs/external-tooling.md
  - docs/reference-configs/install-profiles.md
  - docs/reference-configs/harness-overview.md
  - README.md
  - README.es.md
  - README.fr.md
  - README.ja.md
  - README.zh-CN.md
  - src/
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
    - assets/skill-commands/manifest.json
  artifacts_exist:
    - tasks/notes/20260810-1128-reverse-skill-recommended-dependency.notes.md
  tests_pass:
    - path: tests/skill-surface/catalog.test.ts
    - path: tests/cli/init.test.ts
    - path: tests/cli/global-runtime-init.test.ts
    - path: tests/install-profiles.test.ts
    - path: tests/effects/skill-tree-integrity.test.ts
  commands_succeed:
    - bun test tests/skill-surface/catalog.test.ts tests/cli/init.test.ts tests/cli/global-runtime-init.test.ts tests/install-profiles.test.ts tests/effects/skill-tree-integrity.test.ts
    - bun run check:type
    - bun run check:reference-configs
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
```

## Acceptance Notes (Human Review)

- Functional behavior: install/update project the pinned router to the selected
  host only with `--with-reverse-skill`; minimal, full, and init never select it.
- Edge cases: Waza shared-rule synchronization remains provider-specific while
  provider enumeration is catalog-driven.
- Regression risks: an external provider can install successfully but stage
  drifted bytes; full-tree digest mismatch and missing catalog selection must
  both fail closed before host projection.

## Rollback Point

- Commit / checkpoint:
- Revert strategy: remove the catalog entry, generic provider projection, test
  expectations, and documentation changes as one unit.
