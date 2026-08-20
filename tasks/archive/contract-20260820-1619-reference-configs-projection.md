> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260730-2149-reference-configs-projection.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1619

# Task Contract: reference-configs-projection

> **Status**: Active
> **Plan**: plans/plan-20260730-2149-reference-configs-projection.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-30 21:49
> **Review File**: `tasks/reviews/20260730-2149-reference-configs-projection.review.md`
> **Notes File**: `tasks/notes/20260730-2149-reference-configs-projection.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The docs/reference-configs and assets/reference-configs mirror (23 pairs) has only 6 scattered equality guards; harness-overview.md has already shipped divergent (docs newer than assets, including retired "compatibility fallbacks" wording on the assets side). Separately, a test-suite audit proved the README prose-assertion layer is pure sync tax (20/20 commits in readme-dx.test.ts history are same-commit updates, zero interceptions). Without convergence, every vocabulary or config change keeps fanning out across unguarded projections.

## Goal

`assets/reference-configs/` is the declared source and `docs/reference-configs/` its byte-identical generated projection, enforced by a new `scripts/sync-reference-configs.ts` (--check/--write, modeled on sync-helper-sources.ts) wired into check-ci and one loop test; harness-overview.md is re-unified taking the docs-side content as truth; the 6 scattered equality assertions are replaced by that loop; and the audited LOW-risk test simplifications (S1-S5: README prose cuts, duplicate assertions, binary-scan skip, manifest-derived retired names, byte-parity dedup) land per the source plan.

## Scope

- In scope: new scripts/sync-reference-configs.ts + package.json script entries + check-ci wiring; harness-overview.md assets-side re-unification (content from docs side); new tests/reference-configs-projection.test.ts loop guard; deletion of 6 scattered mirror-equality assertions; prose-assertion cuts in tests/readme-dx.test.ts and tests/install-scripts.test.ts; mechanical dedup in tests/bootstrap-files.test.ts; binary skip + manifest-derived RETIRED_NAMES in tests/skill-surface/retired-names-scan.test.ts; redundant byte-parity deletions covered by the helper-scripts parity loop.
- Out of scope: S6 (helper-scripts workspace refactor) and S7 (CI per-file isolation) — separate package; any README body or reference-configs content change beyond harness-overview re-unification; load-bearing locks (adoption-plan at-rest protocol, --help assertions, falsifier tests, allowlist anti-rot section); anything not listed in the source plan.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If any of the 23 mirror pairs legitimately needs to diverge (audience-split content, not drift), forcing byte-equality would destroy intentional differences and the projection premise is wrong. Cheapest proof point: after harness-overview re-unification, `bun run check:reference-configs` must pass on all 23 pairs with zero content edits beyond that one file — if other pairs fail the check, they are undiagnosed divergences that must be reported (stop), not silently overwritten.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260730-2149-reference-configs-projection.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260730-2149-reference-configs-projection.review.md`
- Notes file: `tasks/notes/20260730-2149-reference-configs-projection.notes.md`
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
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260730-2149-reference-configs-projection.contract.md
  - tasks/reviews/20260730-2149-reference-configs-projection.review.md
  - tasks/notes/20260730-2149-reference-configs-projection.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - scripts/
  - package.json
  - assets/reference-configs/harness-overview.md
  - docs/reference-configs/
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
    - docs/spec.md
    - scripts/sync-reference-configs.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260730-2149-reference-configs-projection.notes.md
  tests_pass:
    - path: tests/reference-configs-projection.test.ts
    - path: tests/readme-dx.test.ts
    - path: tests/skill-surface/retired-names-scan.test.ts
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
    - bun run check:reference-configs
    - bun run check:helpers
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: stacked on `codex/cli-init-rename` tip (`a43c4abe` at branch creation); this package must merge only after cli-init-rename merges, rebasing onto its final tip first.
- Revert strategy: drop the `codex/reference-configs-projection` branch/worktree before merge; after merge, revert the merge commit — the sync tool and loop test disappear together, restoring the scattered-guard state with no data migration to unwind.
