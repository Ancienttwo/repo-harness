> **Archived**: 2026-08-20 12:19
> **Related Plan**: plans/archive/plan-20260820-0515-archctx-node-resilience.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1219

# Task Contract: archctx-node-resilience

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-0515-archctx-node-resilience.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 05:15
> **Review File**: `tasks/reviews/20260820-0515-archctx-node-resilience.review.md`
> **Notes File**: `tasks/notes/20260820-0515-archctx-node-resilience.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Every gate that reaches the architecture projection inside the bounded verifier
has failed on this machine since 0.15.3: `scrubHarnessEnv()` strips
`REPO_HARNESS_NODE_BIN` (whole-prefix, by design) and
`resolveCompatibleNodeRuntime()` then only scans a protected PATH that carries
no Node >=24 <26. Two consecutive release contracts had to carry bypass
annotations; the gatekeeper filed the same P2 twice. `helper-runner.ts` already
solves the identical problem with `trustedNodeCandidates()` — the fix is one
shared authority, not a second scanner.

## Goal

Deliver the plan's T1-T4 (`plans/plan-20260820-0515-archctx-node-resilience.md`):
move the trusted node-candidate scan to a shared module (placement decided by
the state-boundary rules, no copies), add it as the third resolution tier in
`resolveCompatibleNodeRuntime()` (after `REPO_HARNESS_NODE_BIN` and the PATH
scan; the version-range check applies to every tier; the fail-closed error is
extended but preserved), prove it with unit fixtures AND with this contract's
own sandboxed gate — `check-architecture-sync.sh` sits in `commands_succeed`
below, so `prepare-acceptance` runs it inside the exact scrubbed configuration
that has been failing.

## Scope

- In scope: the shared module extraction, the provider fallback tier, unit
  tests (nvm-fixture resolution + fail-closed exhaustion + helper-runner
  regression), and the todos ledger closeout (delete the archctx
  node-resolution resilience row).
- Out of scope: `scrubHarnessEnv()` semantics; `ARCHCONTEXT_NODE_RANGE`;
  archctx version; any release step; any `scripts/` or template change.
- Taste constraints: the move is byte-identical behavior for helper-runner
  (existing tests are the guard); do not suppress or special-case
  `check-state-boundaries` — its rules decide the module's home.

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
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260820-0515-archctx-node-resilience.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-0515-archctx-node-resilience.review.md`
- Notes file: `tasks/notes/20260820-0515-archctx-node-resilience.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"archctx-resolution-deterministic-suite","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260820-0515-archctx-node-resilience.md
  - tasks/todos.md
  - tasks/contracts/20260820-0515-archctx-node-resilience.contract.md
  - tasks/reviews/20260820-0515-archctx-node-resilience.review.md
  - tasks/notes/20260820-0515-archctx-node-resilience.notes.md
  - src/effects/architecture/archctx-provider.ts
  - src/effects/runtime/
  - src/cli/runtime/helper-runner.ts
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
    - src/effects/architecture/archctx-provider.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260820-0515-archctx-node-resilience.notes.md
  tests_pass:
    - path: tests/architecture-projection-orchestration.test.ts
  commands_succeed:
    # check-architecture-sync.sh is deliberately INSIDE this sandboxed gate:
    # it runs under the bounded verifier's scrubbed env, which is the exact
    # configuration this contract exists to fix. It passing here is the
    # end-to-end proof that closes the ledger row.
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: worktree base is main at branch creation (`git merge-base HEAD main`)
- Revert strategy: additive fallback tier plus one module move; one publication commit, one revert; environments that set `REPO_HARNESS_NODE_BIN` see zero behavior change
