> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260811-1659-mutation-observed-in-repo-qualifier.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1619

# Task Contract: mutation-observed-in-repo-qualifier

> **Status**: Active
> **Plan**: plans/plan-20260811-1659-mutation-observed-in-repo-qualifier.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-11 16:59
> **Review File**: `tasks/reviews/20260811-1659-mutation-observed-in-repo-qualifier.review.md`
> **Notes File**: `tasks/notes/20260811-1659-mutation-observed-in-repo-qualifier.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Out-of-repository absolute paths (host-side plan files under `~/.claude/plans/`, memory files under `~/.claude/projects/`) currently qualify as post-edit journal events, become architecture projection jobs, and archctx rejects them with non-retryable `AC_SCHEMA_INVALID` — permanently blocking the Stop-hook strict projection gate. Reproduced twice in session 6021a7db on 2026-08-11; every plan-mode or memory write re-poisons the queue until this gate lands.

## Goal

`runMutationObserved` no-ops (no advisory, no dirty bits, no journal write) for any file path that does not canonicalize inside the repository, using the existing `canonicalRepoRelativePath` helper; in-repo paths keep writing exactly one `change_observed` event.

## Scope

- In scope: `src/cli/hook/mutation-observed.ts` qualifier gate; red-green regressions in `tests/mutation-observed.test.ts`.
- Out of scope: digest ignore-contract convergence with archctx's validator; `repo-harness@0.14.2` publish/install readback; any journal schema or storage change.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a legitimate in-repo edit stops producing its journal event (existing journal-schema test fails), the gate is over-broad and the direction is wrong; cheapest proof point is `bun test tests/mutation-observed.test.ts`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: src/cli/hook/mutation-observed.ts:85 runMutationObserved only rejects an empty file path while normalizeFilePath returns out-of-repo absolute paths unchanged, so host-side files set dirty bits and write journal events.
- repro: bun test tests/mutation-observed.test.ts
- regression_guard: tests/mutation-observed.test.ts
- pre_fix_failure_artifact: .ai/harness/evidence/pre-fix-mutation-observed-in-repo-qualifier.log

## Workflow Inventory

- Source plan: `plans/plan-20260811-1659-mutation-observed-in-repo-qualifier.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260811-1659-mutation-observed-in-repo-qualifier.review.md`
- Notes file: `tasks/notes/20260811-1659-mutation-observed-in-repo-qualifier.notes.md`
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
  - tasks/contracts/20260811-1659-mutation-observed-in-repo-qualifier.contract.md
  - tasks/reviews/20260811-1659-mutation-observed-in-repo-qualifier.review.md
  - tasks/notes/20260811-1659-mutation-observed-in-repo-qualifier.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260811-1659-mutation-observed-in-repo-qualifier.notes.md
  tests_pass:
    - path: tests/mutation-observed.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: branch codex/mutation-observed-in-repo-qualifier off main@ee33d127
- Revert strategy: single-commit revert of the qualifier gate + tests; no schema, storage, or policy change.
