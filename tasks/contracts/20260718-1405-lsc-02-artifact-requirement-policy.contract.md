# Task Contract: lsc-02-artifact-requirement-policy

> **Status**: Active
> **Plan**: plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-18 14:05
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **LSC-02 Execution Base**: `origin/main@64673ee2c1148c2edfcea0afa097375898323841` (post-LSC-01 merge, PR #82)
> **Review File**: `tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md`
> **Notes File**: `tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

LSC-03..08 will cut PreEdit, Stop, ship, and adapter consumers over to a single
artifact-requirement authority one package at a time. Without one pure matrix
established first, each cutover would re-derive requirements ad hoc, mixing
policy definition with consumer switching, and the current-behavior baseline
frozen by LSC-01 would have no explicit target authority to converge on. If
this package ships wrong, every later semantic cutover inherits a wrong or
ambiguous requirement source.

## Goal

Deliver one pure `ArtifactRequirementPolicy` module whose matrix covers
Lite/Standard/Strict x edit/stop/ship, whose content is exactly the nine
approved target-delta records frozen in
`tests/state/fixtures/loop-semantics/characterization.json`, with
positive/negative fixture-driven tests. No consumer is switched, no readiness
evaluator is implemented, and no production behavior changes anywhere.

## Scope

- In scope:
  - New pure module `src/core/workflow/artifact-requirement-policy.ts`: the
    machine-readable requirement matrix plus a `resolve({ profile, operation,
    risk, policy })`-shaped accessor per the audit signature
    (`plans/sprints/20260715-harness-loop-audit-and-optimization.md:224-242`).
    No I/O, no environment access, imports only types from
    `src/core/workflow/profile.ts`.
  - The edit/stop/ship operation axis is a NEW type owned by this module. It
    is not `WorkflowOperationKind` (that is the risk-signal input axis:
    inspect/edit/bugfix/feature/...; it has no stop or ship member). Do not
    conflate or extend `WorkflowOperationKind`.
  - Requirement keys and per-cell values derive 1:1 from the nine
    `target_delta` records in
    `tests/state/fixtures/loop-semantics/characterization.json` (e.g.
    `separate_contract` not_required by default for standard.edit and
    standard.ship with risk/policy raise; strict.ship full envelope:
    `separate_contract`, `isolated_contract_worktree`, `fresh_review`,
    `external_acceptance`, `fresh_checks`, `candidate_revision_precondition`).
    Cells or keys not supported by a frozen target delta or the audit matrix
    (audit lines 238-242) must not be invented.
  - New test `tests/state/artifact-requirement-policy.test.ts` and fixture
    `tests/state/fixtures/loop-semantics/artifact-requirement-policy.json`
    (nested under `loop-semantics/` because a top-level JSON in
    `tests/state/fixtures/` is swept into ESA adapter-parity enumeration; see
    `tasks/notes/20260716-0150-lsc-01-profile-operation-characterization.notes.md:54-58`).
    Positive cases pin all nine cells; negative cases pin raise semantics
    (risk/policy raising a not_required requirement) and invalid
    profile/operation rejection.
  - Pin the LSC-02 execution base in the sprint header of
    `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`
    following the LSC-01 successor-pin precedent.
- Out of scope:
  - Switching any consumer: `src/core/state/project-effective-state.ts`,
    `src/effects/state/resolve-effective-state.ts`, `.ai/hooks/pre-edit-guard.sh`,
    `.ai/hooks/stop-orchestrator.sh`, `scripts/verify-sprint.sh`,
    `scripts/ship-worktrees.sh`, CLI/MCP/Skill surfaces. No production file
    imports the new module in this package.
  - Readiness evaluator or allowedToEdit/allowedToStop/readyToShip fields
    (LSC-06), Stop semantics cleanup (LSC-07), revision partition (LSC-04),
    state-version allocation (LSC-05), adapter parity (LSC-08).
  - Every path outside Allowed Paths, including `.ai/hooks/`, `assets/`,
    `scripts/`, installer, and Skill surfaces.
  - Compatibility code, dual authority, semantic fallback, or any second
    representation of the matrix.
- Taste constraints: The matrix is explicit policy data, not derived logic.
  Prefer one literal, exhaustively typed matrix over clever generation;
  totality over the 9 cells must be enforced by types or an exhaustiveness
  check, not by runtime defaults.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path
  outside Allowed Paths.
- Stop if a required cell or requirement key is not explicitly supported by a
  frozen `target_delta` record or the audit matrix; do not invent semantics.
- Stop if expressing a cell requires consulting or changing consumer behavior.
- Stop if any existing test or golden changes value; this package must be
  behavior-inert outside its new files.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The single-matrix direction is falsified if the nine approved target deltas
cannot be expressed as one pure total matrix plus a raise rule, without
consumer-specific branches. Cheapest proof point: encode `standard.edit` and
`standard.ship` first (the two "not_required by default, risk/policy may
raise" cells); if raise semantics need consumer context there, stop.

## Root Cause Evidence

Not applicable: this is a `code-change` policy-module package, not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md`
- Source sprint: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`
- Delta authority: `tests/state/fixtures/loop-semantics/characterization.json`
- Active plan: `plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md`
- Review file: `tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md`
- Notes file: `tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `64673ee2c1148c2edfcea0afa097375898323841` /
  `codex/lsc-02-artifact-requirement-policy` /
  `/Users/kito/Projects/repo-harness-loop-control-wt-lsc-02-artifact-requirement-policy`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md
  - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md
  - tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md
  - tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md
  - src/core/workflow/artifact-requirement-policy.ts
  - tests/state/artifact-requirement-policy.test.ts
  - tests/state/fixtures/loop-semantics/artifact-requirement-policy.json
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
      purpose: scope_and_acceptance_owner
    explorer:
      mode: read_only
      purpose: target_delta_and_audit_archaeology
    worker:
      mode: edit_within_allowed_paths
      purpose: pure_policy_module_and_fixtures
    verifier:
      mode: read_only
      purpose: exit_criteria_and_scope_review
  runner:
    preferred:
      - subagent
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md
    - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
    - tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md
    - tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md
    - tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md
    - src/core/workflow/artifact-requirement-policy.ts
    - tests/state/artifact-requirement-policy.test.ts
    - tests/state/fixtures/loop-semantics/artifact-requirement-policy.json
  artifacts_exist:
    - tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md
    - tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md
  tests_pass:
    - path: tests/state/artifact-requirement-policy.test.ts
  commands_succeed:
    - bun test tests/state/artifact-requirement-policy.test.ts
    - bun run check:type
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-architecture-sync.sh
    - repo-harness run check-task-workflow --strict
    - repo-harness state resolve --json
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
    - git diff --check
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: code_quality
      min: 8
  manual_checks:
    - "Module is pure: no fs/process/env/network access; imports only types from src/core/workflow/profile.ts"
    - "No production file imports the new module (grep -r artifact-requirement-policy src/ shows only the module itself)"
    - "Matrix content matches the nine frozen target_delta records 1:1; no invented requirement key, cell, or semantics"
    - "Operation axis is a module-owned edit/stop/ship type, not WorkflowOperationKind"
    - "Negative fixtures cover risk/policy raise semantics and invalid profile/operation rejection"
    - "Full bun test passes with no change to any existing test or golden"
    - "Final diff contains only Allowed Paths"
    - "Fresh task review and independent external acceptance both pass for the frozen subject"
```

## Acceptance Notes (Human Review)

- Functional behavior: additive only; the new module exists with total 9-cell
  coverage, and zero behavior changes anywhere else in the repo.
- Edge cases: standard.edit and standard.ship raisable requirements; strict
  fail-closed full envelope; lite zero-ceremony rows; unknown profile or
  operation rejected, not defaulted.
- Regression risks: accidentally importing the module from a consumer;
  encoding LSC-01's current-behavior cells instead of the approved target
  deltas; widening `WorkflowOperationKind`.

## Rollback Point

- Commit / checkpoint: `64673ee2c1148c2edfcea0afa097375898323841`.
- Revert strategy: revert the independent LSC-02 PR; no consumer depends on
  the module, so the revert is behavior-inert and needs no compatibility path.
