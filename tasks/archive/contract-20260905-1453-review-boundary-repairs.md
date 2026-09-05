> **Archived**: 2026-09-05 14:53
> **Related Plan**: plans/archive/plan-20260905-0342-review-boundary-repairs.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260905-1453
> **Archive Projection V1**: `plans/plan-20260905-0342-review-boundary-repairs.md` => `plans/archive/plan-20260905-0342-review-boundary-repairs.md`
> **Archive Projection V1**: `tasks/notes/20260905-0342-review-boundary-repairs.notes.md` => `tasks/archive/notes-20260905-1453-review-boundary-repairs.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0342-review-boundary-repairs.contract.md` => `tasks/archive/contract-20260905-1453-review-boundary-repairs.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0342-review-boundary-repairs.review.md` => `tasks/archive/review-20260905-1453-review-boundary-repairs.md`

# Task Contract: review-boundary-repairs

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260905-0342-review-boundary-repairs.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 03:42
> **Review File**: `tasks/archive/review-20260905-1453-review-boundary-repairs.md`
> **Notes File**: `tasks/archive/notes-20260905-1453-review-boundary-repairs.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Recent execution lanes validate individual records but lose identity across stores and lifecycle stages. Incorrect joins can attribute a run to another task, bypass refactor scope approval, or strand canonical work after publication. Host completion must also remain bounded after the agent has answered.

## Goal

Repair the seven reviewed authority/recovery defects and the verified cause of post-answer Running hook stalls, using parallel workers with disjoint ownership and parent integration. Preserve unrelated main work and BRC4 WIP. Deliver regression evidence and run all required checks in the isolated worktree.

## Scope

- In scope: acquisition/dispatch identity, Refactor Program semantic identity and final-main ancestry, WorkDemand CAS recovery, Campaign authorization lifecycle and CLI idempotence, cross-sprint task ID uniqueness, bounded hook completion, injected browser I/O at the Campaign CLI/effect boundary, affected tests/docs/generated mirrors.
- Out of scope: agent-fleet WIP, BRC4 implementation, real campaign/provider effects, releases, external messages, feature activation and dirty worktree cleanup.
- Taste constraints: existing core/effects boundaries; no dependency, semantic fallback, or second authority store.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If an existing downstream authority rejects the reported mismatch before any effect, or a deterministic replay already returns the same receipt, the corresponding review finding is false and must be narrowed or dropped. Run the focused red regression before modifying each boundary. Hook changes require observed process/timing evidence, not a guessed timeout increase.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260905-0342-review-boundary-repairs.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260905-1453-review-boundary-repairs.md`
- Notes file: `tasks/archive/notes-20260905-1453-review-boundary-repairs.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"authority-and-recovery-regressions","kind":"deterministic_test","paths":["*"]},{"id":"packaged-runtime-and-sprint-migration-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - AGENTS.md
  - CLAUDE.md
  - assets/partials/
  - assets/partials-agents/
  - assets/skill-commands/repo-harness-check/
  - assets/reference-configs/hook-operations.md
  - docs/
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/lessons.md
  - tasks/archive/contract-20260905-1453-review-boundary-repairs.md
  - tasks/archive/review-20260905-1453-review-boundary-repairs.md
  - tasks/archive/notes-20260905-1453-review-boundary-repairs.md
  - assets/templates/helpers/
  - assets/hooks/
  - .ai/hooks/
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260905-1453-review-boundary-repairs.md
  tests_pass:
    - path: tests/unit/issue-279-automation-controller-run.test.ts
    - path: tests/unit/refactor-materialization-effect.test.ts
    - path: tests/unit/refactor-board.test.ts
    - path: tests/unit/issue-285-work-demand-materialization.test.ts
    - path: tests/effects/development-campaign-store.test.ts
    - path: tests/cli/development-campaign.test.ts
    - path: tests/coordination-identity.test.ts
    - path: tests/stop-handler.test.ts
    - path: tests/unit/refactor-candidate-verification.test.ts
    - path: tests/effects/gpt-pro-issue-authoring.test.ts
    - path: tests/sprint-cross-carrier-identity.test.ts
    - path: tests/unit/hook-entry-single-file-bundle.test.ts
    - path: tests/agents-assembly.test.ts
    - path: tests/unit/sprint-schema-migrate.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:state-boundaries
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
    - bash scripts/check-tarball-install-smoke.sh
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: each repaired boundary consumes exact existing authority and supports its documented normal/recovery path.
- Edge cases: mismatched task/claim/binding, mismatched provider semantics, multiple merges, CAS interruption, authorization expiry, repeated CLI requests, duplicate sprint identities, stuck hook children.
- Regression risks: active features remain off; preserve fail-closed authorization and durable journals while restoring valid lifecycle transitions.

## Rollback Point

- Commit / checkpoint: 41f52197.
- Revert strategy: revert this isolated repair diff; retain already published immutable receipts; never reset unrelated main or BRC4 changes.
