# Task Contract: issue-284-dependency-authority

> **Status**: Active
> **Plan**: plans/plan-20260902-2101-issue-284-dependency-authority.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-02 21:01
> **Review File**: `tasks/reviews/20260902-2101-issue-284-dependency-authority.review.md`
> **Notes File**: `tasks/notes/20260902-2101-issue-284-dependency-authority.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`src/effects/engineers/scheduling.ts#defaultDependencyAuthority` implements only `canonical_done`; `module_accepted`, `publication_integrated` and `product_accepted` always return `authority_unavailable`. Every Work Package that depends on a real acceptance, publication or product gate is therefore permanently excluded from Engineer offers even when the authoritative receipt already exists. That pressure pushes callers to weaken dependency edges to `canonical_done` or to reconstruct acceptance from branch names, filenames or prose, which would create a second acceptance authority.

## Goal

One closed, read-only dependency-authority resolver at `src/effects/engineers/dependency-authority.ts` resolves every `WorkPackageDependencyState` from its existing sole authority and is wired as the default resolver in `src/effects/engineers/scheduling.ts`:

- `canonical_done` from the canonical Sprint row status;
- `module_accepted` from the exact-subject AcceptanceReceipt of the target repository;
- `publication_integrated` from the existing Lease publication pointer plus the immutable PublicationReceipt and integration observation;
- `product_accepted` from the ME-4C product acceptance projection.

A readable negative is `unsatisfied`; a missing, unreadable, unauthorized or unsupported authority is `authority_unavailable`; there is no "unknown means ready" path. `authority_revision` is derived from the canonical validated evidence projection so receipt, target-revision or registry movement stales the Engineer offer and forces `acquireScheduledEngineerTask` revalidation. Every enum member is handled exhaustively: a new state without an adapter fails typecheck and tests.

## Scope

- In scope:
  - New boundary `src/effects/engineers/dependency-authority.ts` with one exhaustive resolver returning `{ status, authority_revision, evidence_refs }`.
  - Closed, revision-bound `acceptance_authority` reference on the Work Graph dependency edge in `src/core/engineers/scheduling.ts`, because `required_acceptance` policy documents cannot select one exact AcceptanceReceipt or ME-4C authority.
  - Read-only listing entrypoints on the owning authorities (`src/effects/publication/publication-lifecycle.ts`, `src/effects/integration/product-acceptance.ts`) and two exports on the acceptance-receipt helper so the resolver reuses the single validator instead of re-deriving one.
  - Cross-repository resolution bound to the current adopted registry snapshot and each target repository's canonical commit.
  - Spec, architecture module doc and ArchContext selector updates.
- Out of scope:
  - Any second acceptance, publication or product-verdict authority; any prose, filename, branch-name or GitHub-state inference; any resolver-side completion, publication or acceptance mutation.
  - Task identity derivation in `src/core/state/coordination-identity.ts` (issue #283) and the collaboration dispatch fence (issue #278); both run in sibling worktrees.
- Taste constraints: fail closed; one authority per datum; no compatibility fallback for the pre-`acceptance_authority` dependency edge shape.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a dependency state can read `satisfied` from evidence that does not exactly bind the target Work Package. Cheapest proof point: an AcceptanceReceipt recorded for a different contract subject, and an ME-4C product projection whose envelope does not select the target task, must both leave the dependency `unsatisfied` while the offer stays excluded with `dependency_not_ready`. The second falsifier is staleness: mutating the source receipt, the target revision or the registry authorization must change `authority_revision` and make the previously asserted offer stale.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260902-2101-issue-284-dependency-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260902-2101-issue-284-dependency-authority.review.md`
- Notes file: `tasks/notes/20260902-2101-issue-284-dependency-authority.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"issue-284-dependency-authority","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - AGENTS.md
  - CLAUDE.md
  - docs/spec.md
  - docs/architecture/
  - .archcontext/model/
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260902-2101-issue-284-dependency-authority.contract.md
  - tasks/reviews/20260902-2101-issue-284-dependency-authority.review.md
  - tasks/notes/20260902-2101-issue-284-dependency-authority.notes.md
  - src/core/engineers/scheduling.ts
  - src/effects/engineers/dependency-authority.ts
  - src/effects/engineers/scheduling.ts
  - src/effects/integration/product-acceptance.ts
  - src/effects/publication/publication-lifecycle.ts
  - scripts/acceptance-receipt.ts
  - assets/templates/helpers/acceptance-receipt.ts
  - tests/unit/issue-284-dependency-authority.test.ts
  - tests/unit/me1a-engineer-scheduling.test.ts
  - tests/unit/me1a-engineer-scheduling-schema.test.ts
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
    - plans/plan-20260902-2101-issue-284-dependency-authority.md
  artifacts_exist:
    - tasks/contracts/20260902-2101-issue-284-dependency-authority.contract.md
    - tasks/reviews/20260902-2101-issue-284-dependency-authority.review.md
    - tasks/notes/20260902-2101-issue-284-dependency-authority.notes.md
  tests_pass:
    - path: tests/unit/issue-284-dependency-authority.test.ts
    - path: tests/unit/me1a-engineer-scheduling.test.ts
    - path: tests/unit/me1a-engineer-scheduling-schema.test.ts
  commands_succeed:
    - bun run check:type
    - bun test --timeout 60000
    - repo-harness run check-state-boundaries
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

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
