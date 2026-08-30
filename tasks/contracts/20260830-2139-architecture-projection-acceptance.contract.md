# Task Contract: architecture-projection-acceptance

> **Status**: Active
> **Plan**: plans/plan-20260830-2139-architecture-projection-acceptance.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-31 00:00
> **Review File**: `tasks/reviews/20260830-2139-architecture-projection-acceptance.review.md`
> **Notes File**: `tasks/notes/20260830-2139-architecture-projection-acceptance.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`ProjectionRequestV1.acceptedChange` is the only protocol input that resolves a
major architecture delta, but no production CLI caller supplies it. Operators
currently need an untracked throwaway script, while the durable drain discards
the structured refresh signal into an opaque dead-letter message. A wrong
implementation could accept a different delta, reuse stale evidence, or let the
strict architecture gate pass without a content-bound receipt.

## Goal

Deliver one fail-closed manual `architecture-projection accept` command that
binds an explicit approval reference to the exact reasons, node ids, repository
identity, and worktree snapshot in a persisted unresolved-major refresh signal;
runs the existing ArchContext apply boundary; and writes an idempotent receipt
that the strict architecture gate validates.

Also close the proven proof-refresh lifecycle gap with a distinct fail-closed
reconciliation receipt. Reconciliation may retire only a proof-only candidate after
the current provider returns a CodeGraph-ready empty `noop` in check mode; it must
never carry an accepted change or apply receipt.

## Scope

- In scope:
  - Persist exact unresolved-major candidates from direct CLI and durable drain paths.
  - Add `accept --signal-id <sha256> --approval-reference <event-id> --json`.
  - Refuse malformed, mismatched, or stale candidates before provider execution.
  - Copy reason/node identity only from the signal, preserve approval identity exactly,
    consume canonical refresh actions, and atomically record reproducible evidence.
  - Teach the strict gate to resolve a candidate only through a matching valid receipt.
  - Add `reconcile --signal-id <sha256> --json` for an exact
    `verified-flow-proof-changed` candidate and validate current deterministic proof.
  - Persist a separate, reproducible reconciliation receipt and let the strict gate
    resolve the candidate through exactly one valid resolution kind.
  - Serialize the full resolution effect and close an automatic-drain dead letter
    through an exact terminal job receipt when reconciliation succeeds.
  - Add focused regression tests and synchronize source/template workflow surfaces.
- Out of scope:
  - collaboration runtime and R1 Agent Runtime worktree.
  - Automatic architecture acceptance, semantic inference, compatibility aliases,
    and historical rewriting of earlier C1/C3 acceptance records.
  - Reconciliation of semantic change reasons, provider apply, inferred proof, or use
    of a human approval reference as verification evidence.
- Taste constraints: one authority per datum; invalid states fail closed rather than being inferred.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the ArchContext refresh signal lacks sufficient repository/worktree identity
or resulting projection digest to derive and stale-check the accepted-change
reference, persisting that signal cannot form a safe CLI authority. The cheapest
proof is the focused fixture test against `ArchitectureRefreshSignalV1` before
wiring Commander or the shell gate.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260830-2139-architecture-projection-acceptance.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260830-2139-architecture-projection-acceptance.review.md`
- Notes file: `tasks/notes/20260830-2139-architecture-projection-acceptance.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"architecture-projection-acceptance-tests","kind":"deterministic_test","paths":["src/effects/architecture/projection-acceptance.ts"]},{"id":"architecture-projection-status-readback","kind":"runtime_readback","paths":["src/effects/architecture/projection-acceptance.ts"]}]}
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
  - tasks/contracts/20260830-2139-architecture-projection-acceptance.contract.md
  - tasks/reviews/20260830-2139-architecture-projection-acceptance.review.md
  - tasks/notes/20260830-2139-architecture-projection-acceptance.notes.md
  - tasks/current.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - assets/templates/helpers/check-architecture-sync.sh
  - assets/reference-configs/external-tooling.md
  - assets/reference-configs/harness-overview.md
  - docs/architecture/index.md
  - docs/reference-configs/external-tooling.md
  - docs/reference-configs/harness-overview.md
  - scripts/check-architecture-sync.sh
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
    - src/effects/architecture/projection-acceptance.ts
    - tests/unit/architecture-projection-acceptance.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260830-2139-architecture-projection-acceptance.notes.md
  tests_pass:
    - path: tests/unit/architecture-projection-acceptance.test.ts
  commands_succeed:
    - bun test tests/unit/architecture-projection-acceptance.test.ts tests/architecture-projection-provider.test.ts tests/architecture-projection-orchestration.test.ts --timeout 60000
    - bun test --timeout 60000
    - bun src/cli/index.ts architecture-projection status --json
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

- Functional behavior: exact signal-bound manual acceptance and durable gate evidence.
- Edge cases: missing signal, mismatched approval retry, stale snapshot, provider/refresh failure,
  semantic candidate reconciliation, unavailable proof, non-noop reconciliation,
  and conflicting resolution receipts.
- Regression risks: gate/source-template drift and durable drain acknowledgement semantics.

## Rollback Point

- Commit / checkpoint: exact branch diff on `codex/architecture-projection-acceptance`.
- Revert strategy: revert CLI, acceptance store/orchestrator, gate mirror, tests, and workflow artifacts as one unit.
