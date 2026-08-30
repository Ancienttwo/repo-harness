# Task Contract: archive-acceptance-authority

> **Status**: Active
> **Plan**: plans/plan-20260831-0345-archive-acceptance-authority.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-31 03:45
> **Review File**: `tasks/reviews/20260831-0345-archive-acceptance-authority.review.md`
> **Notes File**: `tasks/notes/20260831-0345-archive-acceptance-authority.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Archived workflow artifacts currently retain live Plan/Contract/Review/Notes
pointers after those files move. Rewriting those pointers naively changes the
contract and goal fingerprints bound by an existing AcceptanceReceipt, so a
closed workflow cannot be re-verified after a legitimate target rebase.

## Goal

Archive one workflow family with resolvable internal pointers while preserving
the exact pre-archive AcceptanceReceipt contract and goal identities. The
projection must be explicit, versioned, deterministic, transactional, and
fail closed when malformed.

## Scope

- In scope:
  - Add a strict archive path-projection envelope owned by `archive-workflow.sh`.
  - Bind the projection manifest and exact archived artifact bytes in a host-owned
    ArchiveProjectionReceipt chained to the semantic AcceptanceReceipt.
  - Rewrite exact live workflow paths to their precomputed archive destinations
    in plan, contract, review, notes, and archived todo bodies.
  - Reverse-normalize only a valid declared projection before AcceptanceReceipt
    contract/goal hashing.
  - Preserve receipt verification for historical strict envelopes that predate
    the projection field.
  - Add focused archive and receipt identity regression tests and close the
    deferred Todo.
- Out of scope:
  - Broad migration of all historical archives, heuristic slug/path lookup,
    automatic acceptance, provider action, or changes to implementation-subject
    path classification.
  - The architecture-projection acceptance implementation and the separate R1
    worktree.
- Taste constraints: one writer and one identity normalizer; invalid projection
  syntax or cross-family mappings fail closed instead of being inferred.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If an exact pointer rewrite cannot reproduce the pre-archive contract and goal
fingerprints without ignoring unrelated Markdown, the projection envelope is
insufficient. The cheapest proof is an acceptance fixture that records a receipt,
archives and rewrites the family, then verifies the same receipt byte-for-byte.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260831-0345-archive-acceptance-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260831-0345-archive-acceptance-authority.review.md`
- Notes file: `tasks/notes/20260831-0345-archive-acceptance-authority.notes.md`
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
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260831-0345-archive-acceptance-authority.contract.md
  - tasks/reviews/20260831-0345-archive-acceptance-authority.review.md
  - tasks/notes/20260831-0345-archive-acceptance-authority.notes.md
  - scripts/archive-workflow.sh
  - scripts/acceptance-receipt.ts
  - scripts/merge-gate.ts
  - assets/templates/helpers/archive-workflow.sh
  - assets/templates/helpers/acceptance-receipt.ts
  - assets/templates/helpers/merge-gate.ts
  - tests/helper-scripts.test.ts
  - tests/acceptance-receipt.test.ts
  - tests/archive-evidence-gates.test.ts
  - tests/merge-gate.test.ts
  - tests/continuation-conformance.test.ts
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
    - scripts/archive-workflow.sh
    - scripts/acceptance-receipt.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260831-0345-archive-acceptance-authority.notes.md
  tests_pass:
    - path: tests/acceptance-receipt.test.ts
    - path: tests/helper-scripts.test.ts
    - path: tests/archive-evidence-gates.test.ts
    - path: tests/merge-gate.test.ts
    - path: tests/continuation-conformance.test.ts
  commands_succeed:
    - bun test tests/acceptance-receipt.test.ts tests/helper-scripts.test.ts tests/archive-evidence-gates.test.ts tests/merge-gate.test.ts --timeout 60000
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: archived internal workflow pointers resolve to files in
  the same archive family; AcceptanceReceipt preserves pre-archive authority.
- Edge cases: collision-suffixed destinations, absent optional artifacts,
  malformed/duplicate projection lines, and historical envelopes without a map.
- Regression risks: archive prediction manifests and packaged helper parity must
  remain byte-consistent.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
