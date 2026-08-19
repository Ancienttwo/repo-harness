> **Archived**: 2026-08-20 03:49
> **Related Plan**: plans/archive/plan-20260820-0159-wp3-hook-visibility.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-0349

# Task Contract: wp3-hook-visibility

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-0159-wp3-hook-visibility.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 01:59
> **Review File**: `tasks/reviews/20260820-0159-wp3-hook-visibility.review.md`
> **Notes File**: `tasks/notes/20260820-0159-wp3-hook-visibility.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The coordination plane has correctness (WP1 + hardening) and visibility on demand
(WP2's `state board --json`), but agents still learn nothing about each other at
the moments that matter: a freshly spawned subagent starts blind to peer claims,
and an agent editing under a stolen or drifted lease only finds out at finish,
after the work is already wasted. WP3 is the last block before 0.16.0. Shipping
it wrong has a specific catastrophic mode: claim tokens are write-only (no GC
path exists in `sprint-backlog.sh`), so a naive "token exists → arm" predicate
would permanently arm any tree that once ran an inline sprint task and block
every subsequent edit against a dead lease — violating the falsification-matrix
row "non-sprint execution is unaffected by the lease gate".

## Goal

Deliver the plan's T1-T8 (`plans/plan-20260820-0159-wp3-hook-visibility.md`
Task Breakdown is the execution list; its `## Design verdicts (frozen)` A-H and
`## Measured cost basis` are settled — do not re-litigate):

- byte-identical read-only `BoardSliceV1` injected at Codex
  `SubagentStart.context` and Claude `PreToolUse.subagent`'s `Task|Agent` branch
  (`SendUserMessage` branch unchanged by zero bytes); one pure projector, one
  shared renderer, hosts only wrap; `env.HOOK_HOST !== 'codex'` guard for
  exactly-once
- thin collector (~22ms measured) — never `resolveEffectiveStateReadOnly`,
  never attempt ledgers, no caching, single collection; slice structurally
  omits `progress_state`, `column`, and all conflict fields
- `PreToolUse.edit` lease gate armed only by the double predicate (unique
  claim token with `unit_ref === active-plan marker` AND linked worktree);
  five steps once armed, each failure an explicit `exit(2)` with its own
  reason token; pre-arming IO failure → advisory + pass
- docs: §9 appended to `docs/architecture/shared-coordination-plane.md` and a
  route-table annotation in `docs/architecture/global-hook-runtime.md`; never
  create files under `docs/architecture/modules/`

## Scope

- In scope: the slice type/projector/collector/renderer, the shared
  task/lease/diagnostics derivation extraction from `project-board.ts`, the
  claim-token reader with ambiguity-fail-closed semantics, three mounts inside
  existing handlers, the `Ctx` memo field, tests T7, docs T8, and the ledger
  closeout (former WP3 todos rows plus a new row for the claim-token GC gap).
- Out of scope: any route addition or reorder; per-`PostToolUse` progress
  records or `AttemptReceiptV1` changes; Stop auto-release/steal; SessionStart
  full-board injection; generic Bash mutation parsing;
  `actual_path_overlap` / `scope_overlap` / `stalled` computation; claim-token
  GC implementation; any `scripts/*.sh` or `assets/templates/helpers/*` change;
  any lease-schema or protocol change; `session-context-budget` widening.
- Taste constraints: marker idempotence follows the existing
  `RETURN_CONTRACT_MARKER` / `LONG_COMMAND_GUARDRAIL_MARKER` pattern;
  fail-closed outcomes are explicit `exit(2)` calls, never escaping exceptions
  (`runtime.ts` maps throws to exit 1 = host fail-open); module-top
  "What is deliberately NOT read" comments follow the `collect-board-inputs.ts`
  idiom.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if the slice cannot stay under the measured cost thresholds (armed `PreToolUse.edit` p50 delta < 15% of the 256.2ms baseline; unarmed < 2%) without violating a frozen verdict — that is a premise re-adjudication, not an implementation choice.

## Falsifier

If a linked worktree accumulates two claim tokens with the same `unit_ref` and
different `task_id` (claim two sprint rows for one plan, or steal-then-reclaim),
the arming predicate degrades to ambiguous → fail-closed, importing the
primary-tree blocking failure into linked worktrees. Cheapest probe: after T2,
write two such tokens in a fixture and assert the reader reports ambiguous;
if real flows can produce this state, apply the plan's pre-authorized minimal
correction (tighten the match key to the `(unit_ref, task_id)` composite,
lease record adjudicates) in T2's reader only — no mount-point changes.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260820-0159-wp3-hook-visibility.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-0159-wp3-hook-visibility.review.md`
- Notes file: `tasks/notes/20260820-0159-wp3-hook-visibility.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"hook-slice-deterministic-suite","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260820-0159-wp3-hook-visibility.md
  - tasks/todos.md
  - tasks/contracts/20260820-0159-wp3-hook-visibility.contract.md
  - tasks/reviews/20260820-0159-wp3-hook-visibility.review.md
  - tasks/notes/20260820-0159-wp3-hook-visibility.notes.md
  - src/core/state/types.ts
  - src/core/state/project-board.ts
  - src/core/state/project-board-slice.ts
  - src/effects/state/coordination-claim-token.ts
  - src/effects/state/collect-slice-inputs.ts
  - src/cli/hook/board-slice-context.ts
  - src/cli/hook/subagent-handler.ts
  - src/cli/hook/mutation-guard.ts
  - tests/board-slice.test.ts
  - tests/subagent-handler.test.ts
  - tests/mutation-guard.test.ts
  - tests/hook-protocol.test.ts
  - docs/architecture/shared-coordination-plane.md
  - docs/architecture/global-hook-runtime.md
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
    - src/core/state/project-board-slice.ts
    - src/cli/hook/board-slice-context.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260820-0159-wp3-hook-visibility.notes.md
  tests_pass:
    - path: tests/board-slice.test.ts
    - path: tests/subagent-handler.test.ts
    - path: tests/mutation-guard.test.ts
    - path: tests/hook-protocol.test.ts
  commands_succeed:
    # check-architecture-sync.sh and check:release stay OUT of this sandboxed
    # gate on purpose: the bounded verifier's scrubHarnessEnv() strips
    # REPO_HARNESS_NODE_BIN while archctx needs Node >=24 <26 absent from the
    # protected PATH on this machine (ledger row + 2026-08-19 lesson). Run
    # arch-sync outside the sandbox per the plan's Verification section and
    # record the output in the notes file.
    - bun run check:type
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: worktree base is main at branch creation (`git merge-base HEAD main`)
- Revert strategy: zero persistent writes, zero schema change, zero route change — rollback deletes three additive call sites inside existing handlers (≤35 lines each); new files become dead code; no migration, no state cleanup, no lease impact
