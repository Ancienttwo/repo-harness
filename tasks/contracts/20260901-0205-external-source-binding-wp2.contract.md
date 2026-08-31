# Task Contract: external-source-binding-wp2

> **Status**: Active
> **Plan**: plans/plan-20260901-0205-external-source-binding-wp2.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-01 02:05
> **Review File**: `tasks/reviews/20260901-0205-external-source-binding-wp2.review.md`
> **Notes File**: `tasks/notes/20260901-0205-external-source-binding-wp2.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

P0 records provider Issues as inert evidence, but there is no auditable bridge from one immutable observation revision to the canonical task that Fleet can offer. Skipping this slice leaves automated discovery disconnected from the existing Board/Lease/worker path; implementing it incorrectly could let mutable provider metadata become a second scheduler.

## Goal

Deliver an append-only, authorization-fenced `ExternalSourceBindingReceiptV1` that binds one exact provider observation revision to one exact canonical pending task revision and approved plan/contract proof. Expose bind, binding-list and explicitly untrusted context CLI surfaces. Multiple edge receipts must support one-to-many and many-to-one provenance while Fleet authority remains unchanged.

## Scope

- In scope:
  - Closed binding receipt schema, canonical digest and explicit drift projection.
  - Git-common-dir append-only binding store with safe paths, locking, idempotence and conflict rejection.
  - Exact registry/source/canonical task/plan revalidation before binding.
  - CLI `external-source bind`, `bindings`, and `context` surfaces.
  - Focused tests, architecture/docs and workflow synchronization.
- Out of scope:
  - Creating or editing GitHub Issues, labels, assignees, comments or PRs.
  - Generating product requirements or canonical plans from provider text.
  - Changing TaskOffer classification, priority, Claim/Lease, WorkEnvelope, worker runtime or publication semantics.
  - Operator UI, background polling, webhook, GitLab adapter or mutable indexes.
  - Semantic duplicate detection or heuristic task matching.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If an exact canonical task and plan/contract proof cannot be revalidated from the named target ref and current canonical workflow authorities, the binding write must fail. Do not substitute filenames, task labels, provider metadata or heuristic matching.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260901-0205-external-source-binding-wp2.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260901-0205-external-source-binding-wp2.review.md`
- Notes file: `tasks/notes/20260901-0205-external-source-binding-wp2.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"external-source-binding-tests","kind":"deterministic_test","paths":["*"],"description":"Focused protocol/store/effect/CLI tests prove exact binding, N:M edges, drift projection, unsafe-content framing and fail-closed authority checks."},{"id":"external-source-binding-readback","kind":"runtime_readback","paths":["*"],"description":"CLI JSON readback proves persisted binding receipts project the exact immutable source and canonical task identities without mutating Fleet/Lease/runtime authorities."}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260901-0205-external-source-binding-wp2.contract.md
  - tasks/reviews/20260901-0205-external-source-binding-wp2.review.md
  - tasks/notes/20260901-0205-external-source-binding-wp2.notes.md
  - tasks/workstreams/runtime-harness/external-source-intake/external-source-intake-p0.md
  - .ai/context/capabilities.json
  - .archcontext/
  - .claude/templates/
  - assets/
  - docs/architecture/
  - docs/reference-configs/
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
    - tasks/notes/20260901-0205-external-source-binding-wp2.notes.md
  tests_pass:
    - path: tests/unit/external-source-binding-wp2.test.ts
    - path: tests/effects/external-source-binding-store.test.ts
    - path: tests/effects/external-source-binding.test.ts
    - path: tests/cli/external-source-binding.test.ts
  commands_succeed:
    - bun run check:type
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

- Functional behavior: exact immutable source-to-canonical-task binding reaches the existing Board/TaskOffer path without minting execution authority.
- Edge cases: N:M provenance, source/canonical/auth drift, concurrent idempotence, invalid or ineligible observations, read-only registration and untrusted provider content.
- Regression risks: schema drift in the P0 observation store and accidental coupling to Fleet readiness.

## Rollback Point

- Commit / checkpoint:
- Revert strategy: revert the single branch/PR; persisted bindings remain inert append-only evidence.
