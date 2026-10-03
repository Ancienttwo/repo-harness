# Task Contract: projection-timeout

> **Status**: Active
> **Plan**: plans/plan-20260909-1853-projection-timeout.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-09 18:53
> **Review File**: `tasks/reviews/20260909-1853-projection-timeout.review.md`
> **Notes File**: `tasks/notes/20260909-1853-projection-timeout.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The archctx `projection run` apply for 60+ changed paths exceeds the 120s provider bound under
host load, so this repo's projection job dead-letters after four consecutive
`process timed out after 118xxxms` failures. Without a longer provider bound the automatic
architecture projection cannot complete here.

## Goal

Allow `.ai/harness/policy.json#architecture.projection_timeout_ms` to be 300000 in this repo,
with each attempt's reclaim window bound to the policy timeout resolved at claim time, so
neither a longer provider bound nor a later policy edit can reclaim a live attempt, and a
reclaimed attempt cannot publish its receipt afterwards.

## Scope

- In scope: projection policy validator upper bound (600000, default unchanged at 120000);
  this repo's policy value (300000, deferred to a follow-up: the installed runtime still validates 1000..120000); the per-attempt reclaim budget persisted on the running
  job record (`attemptTimeoutMs`, `attemptDeadlineAt`) by
  `claimNextArchitectureProjectionJob` and consumed by
  `recoverAbandonedArchitectureProjectionJobs` in
  `src/effects/architecture/projection-jobs.ts`; the typed
  `ArchitectureProjectionOwnershipError` raised by the publish-time claim check and its
  `lost-ownership` drain classification in
  `src/effects/architecture/projection-orchestrator.ts`; the affected tests.
- Out of scope: Stop-hook host budgets, downstream policy seeds in `scripts/` and
  `assets/templates/` (they keep the 120000 default), any second timeout constant, PID
  liveness as a reclaim signal, and guarding the provider apply itself (only the receipt is
  ownership-guarded).
- Taste constraints: one source of truth for the timeout; the reclaim window is the attempt's
  own persisted budget, never a parallel constant and never a re-derivation from a policy value
  edited after the claim.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260909-1853-projection-timeout.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260909-1853-projection-timeout.review.md`
- Notes file: `tasks/notes/20260909-1853-projection-timeout.notes.md`
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
  - .ai/harness/policy.json
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260909-1853-projection-timeout.contract.md
  - tasks/reviews/20260909-1853-projection-timeout.review.md
  - tasks/notes/20260909-1853-projection-timeout.notes.md
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed.

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260909-1853-projection-timeout.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "focused-regression",
      "kind": "package_test",
      "path": "tests/architecture-projection-orchestration.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the changed behavior named by this contract.",
      "inputs": { "env": [] }
    },
    {
      "id": "focused-regression-acceptance",
      "kind": "package_test",
      "path": "tests/unit/architecture-projection-acceptance.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the claim-signature change consumed by the acceptance surface.",
      "inputs": { "env": [] }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Checks TypeScript contracts before behavioral verification.",
      "inputs": { "env": [] }
    }
  ]
}
```

This is the sole executable verification authority. Use `baseline_with_delta`
only when a referenced immutable baseline plus named current delta checks prove
the intended coverage; do not infer that choice from paths or command text.

## Acceptance Notes (Human Review)

- Functional behavior: the validator accepts 300000 and rejects 600001; this repo's projection
  provider still reports `state: ready` with the 300000 policy; a claim persists
  `attemptTimeoutMs` plus `attemptDeadlineAt = claimedAt + policy.timeoutMs`, and recovery
  reclaims only at `attemptDeadlineAt + 30_000`.
- Edge cases: a claim taken under a 300000 policy survives a later shrink to 120000 at
  claim+180s and is reclaimed at claim+330s; a legacy running record without
  `attemptDeadlineAt` still falls back to `policy.timeoutMs + 30_000` and records that
  fallback in its `lastFailure.message`; a claimant whose record was reclaimed and re-claimed
  cannot write the receipt and the drain reports `lost-ownership` instead of throwing; the
  receipt-exists short-circuit still wins crash recovery; the disabled-provider branch still
  returns the 120000 default without validating the value.
- Not guarded: the provider apply runs before the receipt, so a reclaimed attempt can still
  have written architecture docs and agent context to the worktree; only the receipt and the
  failure transition are ownership-gated, and the reclaiming owner re-runs an idempotent
  snapshot-checked apply.
- Policy bump deferred: `.ai/harness/policy.json` stays at 120000 in this PR because the installed
  `repo-harness` runtime (Stop hook, global CLI) validates the old 1000..120000 cap; raising the value
  before that runtime is rebuilt from this change would break every hook-driven drain. The 300000 bump
  is a follow-up one-line change gated on the installed runtime version.
- Runtime skew: the installed `repo-harness` 0.18.0 CLI still enforces the old
  `1000..120000` validator bound, so `repo-harness architecture-projection drain` against this
  repo's 300000 policy fails until this branch ships; the branch source CLI resolves it.
- Reclaim latency: the stale window is a single upper bound over every path, so a Stop-hook job
  clamped to its 20s host budget is reclaimed after 330s instead of 150s and an always-abandoned
  job reaches dead-letter after roughly 16.5 minutes instead of 7.5; the hook itself returns idle,
  so this is drain-progression latency, not a hook stall.
- Regression risks: none for hook budgets — `deadlineMs` still clamps to the host deadline, so
  only an explicit `drain` without a host deadline gets the longer window.

## Rollback Point

- Commit / checkpoint: `origin/main` at the branch merge-base.
- Revert strategy: revert the single commit; the validator cap, this repo's policy value, and
  the stale window return to their prior behavior.
