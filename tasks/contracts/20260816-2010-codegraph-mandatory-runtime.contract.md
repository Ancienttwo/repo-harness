# Task Contract: codegraph-mandatory-runtime

> **Status**: Active
> **Plan**: plans/plan-20260816-2010-codegraph-mandatory-runtime.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: verification-codegraph-readiness
> **Last Updated**: 2026-08-16 21:21
> **Review File**: `tasks/reviews/20260816-2010-codegraph-mandatory-runtime.review.md`
> **Notes File**: `tasks/notes/20260816-2010-codegraph-mandatory-runtime.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

CodeGraph currently appears in the self-host package as a dev dependency and in
global runtime setup as an optional ecosystem, while repo adoption can skip a
missing CLI and still complete. That split authority means a nominally installed
repo-harness can lack the structural navigation/index capability its generated
workflow describes as required readiness. The user explicitly made CodeGraph a
hard dependency; package delivery, global reconciliation, and repo adoption must
therefore enforce one exact fail-closed contract.

## Goal

Promote `@colbymchenry/codegraph@1.5.0` (the registry-verified current `latest`)
to a direct production dependency, make global install/update always reconcile
that exact CLI plus MCP configuration, and make every applied `repo-harness init`
initialize or confirm a usable repo-local CodeGraph index without writing HOME.

## Scope

- In scope: package/lock dependency classification; install/update/init CLI
  options and execution; mandatory failure/idempotency tests; generated helper,
  reference, architecture, and workflow projections affected by the contract.
- Out of scope: CodeGraph source changes, hosted MCP, plugin-market packaging,
  unrelated external skills, or a compatibility alias for removed opt-outs.
- Taste constraints: keep one exact version authority from `archctx-contracts`;
  fail closed instead of preserving optional semantics through a fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if the registry no longer reports `1.5.0` as `latest`, or if repo-local
  init would need to mutate HOME to satisfy CodeGraph readiness.

## Falsifier

The direction is wrong if the supported package manager cannot install the
platform-specific CodeGraph binary transitively from a direct production
dependency, or if `codegraph init -i .` cannot be made idempotent. Cheapest proof:
focused manifest/CLI tests followed by a disposable-repo init with a fake exact
CodeGraph binary.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260816-2010-codegraph-mandatory-runtime.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260816-2010-codegraph-mandatory-runtime.review.md`
- Notes file: `tasks/notes/20260816-2010-codegraph-mandatory-runtime.notes.md`
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
  - package.json
  - bun.lock
  - README.md
  - README.zh-CN.md
  - README.ja.md
  - README.fr.md
  - README.es.md
  - docs/spec.md
  - docs/architecture/
  - docs/reference-configs/
  - docs/CHANGELOG.md
  - plans/
  - tasks/current.md
  - tasks/todos.md
  - tasks/workstreams/
  - tasks/contracts/20260816-2010-codegraph-mandatory-runtime.contract.md
  - tasks/reviews/20260816-2010-codegraph-mandatory-runtime.review.md
  - tasks/notes/20260816-2010-codegraph-mandatory-runtime.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - assets/
  - scripts/
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - package.json
    - src/cli/index.ts
    - src/cli/commands/global-runtime.ts
    - src/cli/commands/init.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260816-2010-codegraph-mandatory-runtime.notes.md
  tests_pass:
    - path: tests/cli/init.test.ts
    - path: tests/cli/global-runtime-init.test.ts
    - path: tests/tooling/codegraph-integration.test.ts
  commands_succeed:
    - bun test tests/cli/init.test.ts tests/cli/global-runtime-init.test.ts tests/tooling/codegraph-integration.test.ts
    - bun run check:type
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: install/update always reconcile exact CodeGraph; init
  initializes or confirms the repo index and fails if mandatory readiness fails.
- Edge cases: dry-run writes nothing; initialized repo is idempotent; repo init
  never configures user-level MCP or writes HOME.
- Regression risks: package size and removal of `--no-codegraph` are deliberate
  contract changes and must be visible in help/docs/tests.

## Rollback Point

- Commit / checkpoint: branch base `546142c57334bf455ebe5d21fcf1060f8268b59e`.
- Revert strategy: revert the single work-package commit, restoring manifest,
  CLI semantics, tests, templates, and docs together.
