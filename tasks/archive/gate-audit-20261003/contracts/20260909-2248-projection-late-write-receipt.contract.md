# Task Contract: projection-late-write-receipt

> **Status**: Fulfilled
> **Plan**: plans/plan-20260909-2248-projection-late-write-receipt.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-09 22:48
> **Review File**: `tasks/reviews/20260909-2248-projection-late-write-receipt.review.md`
> **Notes File**: `tasks/notes/20260909-2248-projection-late-write-receipt.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

A durable projection receipt is the only repo-local record of what the projection wrote
under a jobId. When an attempt is killed or reclaimed after the archctx daemon already
committed its ChangeSet, the retry answers `noop` with `files: []` and the receipt claims
nothing was written. Every downstream consumer that gates on "the projection wrote
nothing" then reasons from a false statement: the refactor materialization transaction
omits the architecture writes, the reconciliation clean-current proof passes over a
committed apply, and the restamp classifier can call a partial write set manifest-only.

## Goal

The durable receipt declares every projection-owned write committed under its own jobId,
including a write committed by an earlier attempt of the same job, sourced only from
provider authority. Consumers that gate on "nothing written" read the declared writes.

## Scope

- In scope: the optional `priorCommittedApplies` field on `ProjectionResultV1` and its
  strict decoding; the provider authority check for that field; the receipt-level
  `declaredWrites` projection on `ArchitectureProjectionReceiptV1`; the "nothing written"
  readers in materialization, projection acceptance, and the restamp classifier; the
  regression guard and its pre-fix artifact.
- Out of scope: the archctx version pin, the `projection-prior-committed-applies-v1`
  capability handshake (deferred until the upstream version is pinned), sticky/fence/ignore
  sets, and any worktree-diff inference of writes.
- Taste constraints: `result` stays the provider's verbatim answer; `declaredWrites` is a
  deterministic projection of it, never a second authority and never a fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a prior committed apply can be observed by repo-harness without
provider authority, which would make a local derivation the cheaper fix. Cheapest proof
point: `assertProjectionResultAuthority` compares `outputSnapshot.worktreeDigest` against
the request's, and projection-owned paths are excluded from that digest, so a
projection-owned late write is invisible to every snapshot repo-harness captures.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: src/effects/architecture/projection-jobs.ts:382 mints the receipt from the last attempt's ProjectionResultV1 only, so a prior attempt's committed write under the same jobId is never declared; the applyReceipt channel is blocked by the acceptedChange gate at src/effects/architecture/archctx-provider.ts:516
- repro: bun test --timeout 60000 tests/architecture-projection-late-write-receipt.test.ts
- regression_guard: tests/architecture-projection-late-write-receipt.test.ts
- pre_fix_failure_artifact: .ai/harness/failures/projection-late-write-receipt-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260909-2248-projection-late-write-receipt.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260909-2248-projection-late-write-receipt.review.md`
- Notes file: `tasks/notes/20260909-2248-projection-late-write-receipt.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"projection-late-write-receipt-regression","kind":"deterministic_test","paths":["*"]}]}
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
  - tasks/contracts/20260909-2248-projection-late-write-receipt.contract.md
  - tasks/reviews/20260909-2248-projection-late-write-receipt.review.md
  - tasks/notes/20260909-2248-projection-late-write-receipt.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - .ai/harness/failures/
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
    - tasks/notes/20260909-2248-projection-late-write-receipt.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "late-write-receipt-guard",
      "kind": "package_test",
      "path": "tests/architecture-projection-late-write-receipt.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Fails on the unfixed receipt and proves the declared prior committed write.",
      "inputs": { "env": [] }
    },
    {
      "id": "projection-consumers",
      "kind": "package_test",
      "path": "tests/architecture-projection-orchestration.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the receipt writers and drain outcomes touched by declaredWrites.",
      "inputs": { "env": [] }
    },
    {
      "id": "projection-provider-authority",
      "kind": "package_test",
      "path": "tests/architecture-projection-provider.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the provider authority check that now admits priorCommittedApplies.",
      "inputs": { "env": [] }
    },
    {
      "id": "restamp-classifier",
      "kind": "package_test",
      "path": "tests/architecture-restamp-classifier.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the manifest-only classifier that now fails closed on prior applies.",
      "inputs": { "env": [] }
    },
    {
      "id": "projection-acceptance",
      "kind": "package_test",
      "path": "tests/unit/architecture-projection-acceptance.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the reconciliation clean-current proof changed in projection-acceptance.ts.",
      "inputs": { "env": [] }
    },
    {
      "id": "refactor-materialization",
      "kind": "package_test",
      "path": "tests/unit/refactor-materialization-effect.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the architecture write transaction changed in materialization.ts.",
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

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
