> **Archived**: 2026-08-20 14:33
> **Related Plan**: plans/archive/plan-20260820-1255-fail-closed-codegraph-init.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1433

# Task Contract: fail-closed-codegraph-init

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-1255-fail-closed-codegraph-init.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 12:55
> **Review File**: `tasks/reviews/20260820-1255-fail-closed-codegraph-init.review.md`
> **Notes File**: `tasks/notes/20260820-1255-fail-closed-codegraph-init.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

CodeGraph is explicitly enabled by the selected install profile, but applied init currently converts a missing CLI or non-ready repository index into a skipped/warning step and can still return exit 0. That reports a successful adoption while the code-navigation authority requested by the profile is unusable.

## Goal

An applied init with CodeGraph enabled returns exit 0 only when `ensureCodegraph()` reports the repository index as exactly `up-to-date`; all other index states and failed ensure actions produce one actionable failed step and a non-zero init result. Disabled and dry-run paths retain their current semantics. The same final candidate also closes the Action/help-budget trigger created by touching the CLI surface: every real `run` helper remains visible under one curated group, while tests cap both the real helper count and rendered help lines.

## Scope

- In scope: typed CodeGraph project-index readiness projection; applied-init fail-closed decision; enabled/missing/non-ready/ready regression coverage; complete grouped `run --help` projection; real helper-count and help-line budgets; fulfilled Todo removal.
- Out of scope: making CodeGraph mandatory for disabled profiles; changing MCP registration policy; installing a fallback runtime; changing `doctor` semantics; accepting alternate status vocabularies.
- Taste constraints: Preserve one status authority in `src/cli/tools/codegraph.ts`; `init.ts` must not parse command output or invent a fallback status.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If current applied init already returns a failed step and exit 1 for both a missing CodeGraph binary and a typed `stale` project index, the premise is false. The cheapest proof is the two focused `tests/cli/init.test.ts` cases before production changes.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260820-1255-fail-closed-codegraph-init.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-1255-fail-closed-codegraph-init.review.md`
- Notes file: `tasks/notes/20260820-1255-fail-closed-codegraph-init.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"codegraph-init-readiness-suite","kind":"deterministic_test","paths":["src/cli/commands/init.ts","src/cli/tools/codegraph.ts","tests/cli/init.test.ts"]},{"id":"run-help-budget-suite","kind":"deterministic_test","paths":["src/cli/commands/run.ts","tests/cli/run.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260820-1255-fail-closed-codegraph-init.md
  - tasks/todos.md
  - tasks/contracts/20260820-1255-fail-closed-codegraph-init.contract.md
  - tasks/reviews/20260820-1255-fail-closed-codegraph-init.review.md
  - tasks/notes/20260820-1255-fail-closed-codegraph-init.notes.md
  - src/cli/commands/init.ts
  - src/cli/tools/codegraph.ts
  - tests/cli/init.test.ts
  - src/cli/commands/run.ts
  - tests/cli/run.test.ts
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
    - src/cli/commands/init.ts
    - src/cli/tools/codegraph.ts
    - tests/cli/init.test.ts
    - src/cli/commands/run.ts
    - tests/cli/run.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260820-1255-fail-closed-codegraph-init.notes.md
  tests_pass:
    - path: tests/cli/init.test.ts
    - path: tests/install-profiles.test.ts
    - path: tests/cli/run.test.ts
  commands_succeed:
    - bun run check:type
    - bun src/cli/index.ts init --repo . --dry-run
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bash scripts/check-architecture-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior: enabled applied init fails for missing/non-ready index and succeeds for `up-to-date`.
- Edge cases: failed init/sync action remains failed even if a later probe is ready; unknown/malformed status fails closed; disabled and dry-run remain skipped.
- Regression risks: CodeGraph overall status also contains MCP readiness, but this slice gates only the explicit repository-index invariant.

## Rollback Point

- Commit / checkpoint: pre-change branch base `fa2a4b8d`.
- Revert strategy: revert the typed project-index field and the init readiness predicate together; keep the tests with the reverted expectation only if product policy is deliberately reversed.
