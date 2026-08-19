> **Archived**: 2026-08-20 01:20
> **Related Plan**: plans/archive/plan-20260819-2109-wp2-board-projection.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-0120

# Task Contract: wp2-board-projection

> **Status**: Fulfilled
> **Plan**: plans/plan-20260819-2109-wp2-board-projection.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-19 21:09
> **Review File**: `tasks/reviews/20260819-2109-wp2-board-projection.review.md`
> **Notes File**: `tasks/notes/20260819-2109-wp2-board-projection.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The coordination plane (WP1 + hardening, shipped in 0.15.3) fixes correctness — no
duplicate claims, no false completions — but gives an orchestrator zero visibility:
seeing who owns what requires hand-running `git worktree list` and inspecting owner
records per task. WP3's hook injection (the point where agents get told about each
other) has no input until a deterministic board document exists. Two latent defects
also ride on this WP: without a bind-time `resumed` receipt, a steal-then-rebind
inherits the previous claim's no-progress receipts and the first board user sees a
false `stalled`; and a sprint-only snapshot check would report `stable` while lease
owners flip underneath it — `tasks/todos.md`'s WP2 addendum row forbids exactly that.

## Goal

Deliver the plan's T1-T12 (`plans/plan-20260819-2109-wp2-board-projection.md`
Task Breakdown is the execution list):

- `repo-harness state board --json [--sprint <path>] [--target-ref <ref>]` emitting
  the frozen `BoardDocumentV1`: four columns with precedence done > blocked > doing
  > todo, three separated dimensions (task / lease / progress), per-dimension +
  composite input revisions, `snapshot_consistency: stable | changed_during_read`
  via collect-project-collect with one full-round retry
- lease vocabulary passed through unchanged (`available | reserving | bound |
  completing | released | unknown`); `orphaned` derived into diagnostics; residual
  `released` in blocked; done rows with any non-available lease carry
  `lease_cleanup_required` + an executable reconcile action
- board reads: canonical sprint bytes via `git show`, this sprint's leases (raw
  owner bytes for digests), `git worktree list --porcelain` raw, owner-worktree
  attempt ledgers + `resolveEffectiveStateReadOnly` progress tokens; the board
  never reads worktree metadata and never takes a task lock
- bind-time `resumed` receipt appended before the owner record is written
- WP-A frozen products: board types in `src/core/state/types.ts` and
  `docs/architecture/shared-coordination-plane.md` (amended from the original
  `docs/architecture/modules/workflow-engine/` placement: that directory is a
  closed capability-derived set — orphan check in `scripts/capability-resolver.ts`,
  count and shape pinned by `tests/architecture-projection-e2e.test.ts` — so
  hand-written prose lives at the docs/architecture root beside
  `effective-state-authority.md` and its siblings; a capability node was rejected
  because the plane spans four top-level areas, not one longest-prefix boundary)

## Scope

- In scope: the new pure projector, input collector, resolver, and CLI verb; the
  `LeaseRead.raw` read-only field; the `git worktree list --porcelain` TS reader;
  the bind-time resumed receipt; the module doc + index link; tests T9-T11
  including the 20-run stability probe; todos ledger closeout (T12).
- Out of scope: conflict projection (`actual_path_overlap` / `scope_overlap` —
  fields absent, not empty); any `scripts/*.sh` or `assets/templates/helpers/*`
  change; any lease-schema or protocol change; edits to
  `src/core/state/coordination-identity.ts` or
  `src/effects/state/coordination-canonical-source.ts`; audit events log;
  reconcile topology cleanup; hook injection (WP3); metadata relocation (WP4);
  TUI or human-readable rendering.
- Taste constraints: mirror the projector/effect/CLI split used by
  `project-continuation-envelope.ts` / `collect-state-inputs.ts` /
  `state.ts`; digests use the JSON-array domain separation from
  `coordination-identity.ts`; pure layer stays zero-IO and zero-clock.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if implementing T4/T6 turns out to require reading worktree metadata or taking a task lock — both contradict frozen design verdicts and mean the plan's premise needs re-adjudication.

## Falsifier

If the T11 stability probe (20 consecutive `state board` runs under 2-3 active
worktrees) yields a `stable` ratio below ~80%, the lock-free A/B consistency
premise has collapsed. Do not redesign: apply the plan's pre-authorized ~15-line
fallback (drop the `evidence` dimension from the composite consistency digest and
mark the progress overlay explicitly possibly-stale), record the measured ratio in
the notes file, and continue. Cheapest earlier probe: after T6, run
collect-project-collect twice in an idle repo — anything other than `stable` there
means the digest inputs include self-perturbing state and T4's input set is wrong.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260819-2109-wp2-board-projection.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260819-2109-wp2-board-projection.review.md`
- Notes file: `tasks/notes/20260819-2109-wp2-board-projection.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"board-deterministic-suite","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260819-2109-wp2-board-projection.md
  - tasks/todos.md
  - tasks/contracts/20260819-2109-wp2-board-projection.contract.md
  - tasks/reviews/20260819-2109-wp2-board-projection.review.md
  - tasks/notes/20260819-2109-wp2-board-projection.notes.md
  - src/core/state/types.ts
  - src/core/state/project-board.ts
  - src/effects/state/collect-board-inputs.ts
  - src/effects/state/resolve-board.ts
  - src/effects/state/coordination-lease-store.ts
  - src/effects/git/worktree-topology.ts
  - src/cli/commands/state.ts
  - src/cli/commands/sprint.ts
  - src/cli/index.ts
  - tests/board-projection.test.ts
  - tests/board-snapshot-consistency.test.ts
  - tests/sprint-claim-concurrency.test.ts
  - tests/coordination-lease-store.test.ts
  - tests/continuation-attempt.test.ts
  - docs/architecture/shared-coordination-plane.md
  - docs/architecture/index.md
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
    - src/core/state/project-board.ts
    - docs/architecture/shared-coordination-plane.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260819-2109-wp2-board-projection.notes.md
  tests_pass:
    - path: tests/board-projection.test.ts
    - path: tests/board-snapshot-consistency.test.ts
    - path: tests/sprint-claim-concurrency.test.ts
    - path: tests/coordination-lease-store.test.ts
  commands_succeed:
    # check-architecture-sync.sh and check:release stay OUT of this sandboxed
    # gate on purpose: the bounded verifier's scrubHarnessEnv() strips
    # REPO_HARNESS_NODE_BIN while archctx needs Node >=24 <26 absent from the
    # protected PATH on this machine (see the tasks/todos.md ledger row and the
    # 2026-08-19 lesson). Run them outside the sandbox as part of the plan's
    # Verification section; record the outputs in the notes file.
    - bun run check:type
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: worktree base is main at branch creation (`git merge-base HEAD main`)
- Revert strategy: pure additive surface — one synthesized publication commit, one revert; no disk-format, lease-schema, or protocol change; residual `resumed` receipts in the ignored runtime ledger only clear stall counts
