> **Archived**: 2026-08-05 11:09
> **Related Plan**: plans/archive/plan-20260805-0001-github-issues-158-159.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260805-1109

# Task Contract: github-issues-158-159

> **Status**: Fulfilled
> **Plan**: plans/plan-20260805-0001-github-issues-158-159.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-05 00:01
> **Review File**: `tasks/reviews/20260805-0001-github-issues-158-159.review.md`
> **Notes File**: `tasks/notes/20260805-0001-github-issues-158-159.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The two currently open GitHub issues form one dependency chain: the deployed
helper cannot publish verification evidence, and once that evidence becomes
visible a failed result prevents the contract-authorized review edit required
to clear it. Leaving either half unresolved keeps downstream acceptance flows
either blind or deadlocked.

## Goal

Make the published helper bind the package-owned evidence emitter without a
source checkout override, and let `checks_failed` repair edits proceed only
when every target is repo-scoped and allowed by the active contract. Preserve
all other fail-closed profile, scope, stop, and ship behavior.

## Scope

- In scope: package-relative evidence-emitter resolution; the mirrored source
  and asset helpers; PreEdit profile projection for contract-authorized repair
  paths; deterministic red-green tests; required workflow synchronization.
- Out of scope: changing stop/ship readiness, permitting out-of-contract or
  out-of-repository edits, copying the emitter into a second authority,
  redesigning Effective State, publishing a PR, or closing GitHub issues.
- Taste constraints: smallest direct change, no new dependency, file, public
  configuration, compatibility alias, or semantic fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the packaged-layout test still reports cannot-bind,
or if a failed-check fixture either rejects an allowed review path or permits
an outside-contract/out-of-repository sibling. The cheapest proof is the two
focused regression tests before the full suite.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `assets/templates/helpers/verify-sprint.sh:439` resolves the emitter only as a nonexistent helper sibling or an explicit source-root override, while `src/cli/hook/mutation-guard.ts:480` suppresses a valid workflow profile for every blocker including repairable `checks_failed` before contract scope can authorize the target.
- repro: `bun test tests/helper-scripts.test.ts tests/mutation-guard.test.ts` with the issue-specific regression cases on the unfixed branch.
- regression_guard: tests/mutation-guard.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/github-issues-158-159/pre-fix-regressions.txt

## Workflow Inventory

- Source plan: `plans/plan-20260805-0001-github-issues-158-159.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260805-0001-github-issues-158-159.review.md`
- Notes file: `tasks/notes/20260805-0001-github-issues-158-159.notes.md`
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
  - AGENTS.md
  - CLAUDE.md
  - assets/AGENTS.md
  - assets/CLAUDE.md
  - assets/templates/helpers/verify-sprint.sh
  - assets/hooks/AGENTS.md
  - assets/hooks/CLAUDE.md
  - scripts/verify-sprint.sh
  - src/cli/hook/mutation-guard.ts
  - src/core/state/artifact-parsers.ts
  - src/core/state/project-effective-state.ts
  - src/core/workflow/operation-readiness.ts
  - src/effects/state/collect-state-inputs.ts
  - src/effects/state/resolve-effective-state.ts
  - tests/helper-scripts.test.ts
  - tests/mutation-guard.test.ts
  - tests/state/operation-readiness.test.ts
  - tests/state/project-effective-state.test.ts
  - tests/state/loop-semantics-characterization.test.ts
  - plans/plan-20260805-0001-github-issues-158-159.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260805-0001-github-issues-158-159.contract.md
  - tasks/reviews/20260805-0001-github-issues-158-159.review.md
  - tasks/notes/20260805-0001-github-issues-158-159.notes.md
  - tasks/workstreams/verification/evals-checks/
  - tasks/workstreams/runtime-harness/hook-adapters/
  - tasks/workstreams/workflow-engine/contract-assets/
  - docs/architecture/requests/
  - docs/architecture/index.md
  - docs/architecture/modules/runtime-harness/hook-adapters.md
  - docs/architecture/modules/verification/evals-checks.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - .ai/harness/
  - .ai/hooks/
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
    - assets/templates/helpers/verify-sprint.sh
    - scripts/emit-verify-evidence.ts
    - src/cli/hook/mutation-guard.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/github-issues-158-159/pre-fix-regressions.txt
    - tasks/notes/20260805-0001-github-issues-158-159.notes.md
  tests_pass:
    - path: tests/helper-scripts.test.ts
    - path: tests/mutation-guard.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior: package-owned emitter binds without `REPO_HARNESS_SOURCE_ROOT`; allowed repair edits pass.
- Edge cases: outside-contract and absolute outside-repository paths remain blocked; another hard blocker cannot use the repair exception.
- Regression risks: source/asset helper drift and accidental broad fail-open behavior.

## Rollback Point

- Commit / checkpoint: the final issue-fix commit on `codex/github-issues-158-159`.
- Revert strategy: revert the helper-resolution and mutation-guard changes together with their regression guards.
