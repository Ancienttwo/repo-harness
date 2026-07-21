# Task Contract: ship-tooling-fixes

> **Status**: Active
> **Plan**: plans/plan-20260721-2256-ship-tooling-fixes.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-21 23:05
> **Review File**: `tasks/reviews/20260721-2256-ship-tooling-fixes.review.md`
> **Notes File**: `tasks/notes/20260721-2256-ship-tooling-fixes.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Shipping `bdd2-followthrough` (PR #109) surfaced four ship-tooling defects: the finish flow's predict-manifest step nests the checks evidence into `checks/checks/` in its scratch clone and fail-closes every gated finish; a bare `node` call in `check-architecture-sync.sh` is unreachable from the protected helper PATH (currently masked by a machine-local `~/.bun/bin/node` symlink); the archive `Completed` gate can never be satisfied for a historical plan because `verify-sprint` binds only the active contract (the completed design-options plan sits unarchived with a stale `Executing` header); and `tests/hook-dispatch-diet-report.test.ts` reads live telemetry, breaking deterministic full-suite green in every interactive checkout. Left unfixed, every future contract worktree must hand-ship the way #109 did.

## Goal

Deliver exactly four fixes plus their proofs:

1. **T1 predict-manifest cp-nest (anchor bugfix)**: `scripts/archive-workflow.sh:222-225` compensation copy merges directory contents (`mkdir -p` + `cp -Rp .ai/harness/checks/. "$scratch_repo/.ai/harness/checks/"`) instead of nesting; regression test added to `tests/archive-evidence-gates.test.ts` (temp repo with tracked `.ai/harness/checks/.gitkeep` + gitignored non-empty passing `latest.json`; `--predict-manifest` run exits 0). Red-first: the test is added BEFORE the fix and its failing run on unfixed code is captured to the artifact below.
2. **T2 protected-PATH node**: `scripts/check-architecture-sync.sh:284` capability-id extraction becomes jq-primary (`jq` is in `/usr/bin`, inside protectedPath) with the existing guarded-node fallback pattern from `:70-75`; sweep `rg 'node -e'` across `scripts/` and `assets/templates/helpers/` for unguarded siblings and fix them the same way; after landing, remove the machine-local `~/.bun/bin/node` and `~/.bun/bin/jq` symlinks and smoke the script under `env -i PATH="<bun-dir>:/usr/bin:/bin:/usr/sbin:/sbin"`.
3. **T3 archive contract binding**: `scripts/verify-sprint.sh` gains an explicit `--contract <path>` override consulted before the active-marker/fallback resolution chain; all downstream evidence/receipt/gate validations bind to that contract unchanged (no gate relaxation). Scope adjudication (orchestrator, 2026-07-22, after the live-proof attempt): the flag works — bound to the historical design-options contract it resolves the right contract/review/notes and evaluates its criteria — but the historical archive itself is BLOCKED by post-authoring schema drift (`evidence_requirements.benchmark` requirement, `adopt --dry-run` reclassified as a forbidden evidence producer, `manual_checks` exact-evidence-item requirement) plus the structural allowed_paths mismatch when binding a historical contract from a mid-flight worktree. Mutating the frozen contract or relaxing `completed_archive_gate` are both out of scope, so the archive stays deferred as a rewritten ledger row carrying the deepened finding; the flag ships on its own regression coverage.
4. **T4 diet-report hermeticity**: `tests/hook-dispatch-diet-report.test.ts` `reportFor()` passes an isolated empty `eventsPath` fixture; assertion semantics unchanged; full `bun test` becomes deterministically green in this interactive worktree.

Plus **T5** ledger closeout: delist the diet-report hermeticity row (resolved by T4); REWRITE the design-options archive row (not delist) to carry the deepened T3 finding — `--contract` landed, and the remaining blocker is an owner-level design decision on the archive gate's evidence model for historical plans (accept the plan's sealed terminal state: contract Fulfilled + review pass + recorded receipt, versus schema-migrating frozen contracts — neither may be done unilaterally).

## Scope

- In scope: `scripts/archive-workflow.sh`, `scripts/check-architecture-sync.sh`, `scripts/verify-sprint.sh` (+ their `assets/templates/helpers/` projections via `bun run sync:helpers`), `tests/archive-evidence-gates.test.ts`, `tests/hook-dispatch-diet-report.test.ts`, the design-options plan archive move, `tasks/todos.md` delisting, this contract's notes/review artifacts, and the machine-local symlink removals (repo-external).
- Out of scope (fail closed): any change to `workflow_checks_pass`, `completed_archive_gate`, or receipt validation semantics; any new helper/flag beyond `--contract`; `evals/**`; workflow-contract files; policy keys; `src/cli/**` runtime code (the diet-report fix is test-only — `scripts/hook-dispatch-diet-report.ts` itself stays untouched).
- EXECUTION_BOUNDARY: absent requirements are forbidden design space; unrequested extras fail closed. Fix the named defects with the smallest honest change; no drive-by refactors of the helper scripts.
- Taste constraints: match surrounding script style; keep the jq expression's output byte-identical to the node expression it replaces.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if any PreToolUse guard blocks an edit — do not retry (the guard latches terminal after 2 repeats); return BLOCKED with the guard JSON.
- Stop if the design-options archive still fails after T3 with a NEW error class — report instead of loosening any gate.

## Falsifier

If the gated finish flow still fails its predict step after T1+T2 with symlinks removed, the environment theory is wrong. Cheapest proof point: the T7 protected-env smoke of `archive-workflow --predict-manifest` in a scratch clone-derived fixture.

## Root Cause Evidence

Required when Task Profile is `bugfix`; anchor defect T1 (root-cause-prover, DIAGNOSIS: CONFIRMED, 2026-07-21).

- root_cause: `scripts/archive-workflow.sh:224` `cp -Rp .ai/harness/checks "$scratch_repo/.ai/harness/checks"` nests the ignored evidence at `checks/checks/latest.json` because the destination dir already exists in the scratch clone (tracked `.ai/harness/checks/.gitkeep` recreates it), so the nested Completed gate fails `workflow_checks_pass`'s `[[ ! -s ".ai/harness/checks/latest.json" ]]` guard (`assets/hooks/lib/workflow-state.sh:1653`).
- repro: scratch git repo with tracked `.ai/harness/checks/.gitkeep` and gitignored non-empty passing `latest.json`, cloned, then the exact `:222-225` copy replayed — `find` shows `checks/checks/latest.json` and the guard fires with `Structured checks file is missing or empty`.
- regression_guard: tests/archive-evidence-gates.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/pre-fix-archive-cp-nest.log

## Workflow Inventory

- Source plan: `plans/plan-20260721-2256-ship-tooling-fixes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260721-2256-ship-tooling-fixes.review.md`
- Notes file: `tasks/notes/20260721-2256-ship-tooling-fixes.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/
  - scripts/
  - assets/templates/helpers/
  - tests/
  - assets/hooks/
  - .ai/hooks/
  - docs/architecture/
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/archive-workflow.sh
    - scripts/verify-sprint.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/pre-fix-archive-cp-nest.log
    - tasks/notes/20260721-2256-ship-tooling-fixes.notes.md
  tests_pass:
    - path: tests/archive-evidence-gates.test.ts
    - path: tests/hook-dispatch-diet-report.test.ts
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:helpers
    - repo-harness run check-task-workflow --strict
```

## Acceptance Notes (Human Review)

- Functional behavior: gated finish's predict step passes with evidence in the standard location; `check-architecture-sync` runs under the protected PATH with no `node` on PATH; historical-plan archives work through explicit contract binding without weakening any gate; full suite deterministically green in interactive checkouts.
- Edge cases: scratch-clone fixture with pre-existing destination dir; multi-capability + missing-id MATCHES_JSON input for the jq expression; `--contract` pointing at a missing/malformed contract must fail closed with a clear message.
- Regression risks: helper projections must stay in parity (`check:helpers`); the `--contract` flag must not change default resolution when absent.

## Rollback Point

- Commit / checkpoint: branch `codex/ship-tooling-fixes` forked from `9e9dce6e` (post-#109 main); no commits at dispatch time.
- Revert strategy: revert/delete the branch; restore `~/.bun/bin/{node,jq}` symlinks if the protected-env smoke regresses (machine-local, reversible); no data migration, no schema.
