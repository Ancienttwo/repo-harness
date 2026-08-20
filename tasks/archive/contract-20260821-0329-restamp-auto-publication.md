> **Archived**: 2026-08-21 03:29
> **Related Plan**: plans/archive/plan-20260821-0222-restamp-auto-publication.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260821-0329

# Task Contract: restamp-auto-publication

> **Status**: Fulfilled
> **Plan**: plans/plan-20260821-0222-restamp-auto-publication.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-21 02:22
> **Review File**: `tasks/reviews/20260821-0222-restamp-auto-publication.review.md`
> **Notes File**: `tasks/notes/20260821-0222-restamp-auto-publication.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The permanent ` M docs/architecture/.projection-manifest.json` on the primary checkout is not cosmetic: `scripts/contract-worktree.sh:1822` and `:2002` refuse merge on any dirty target worktree, so every finish needs a manual batching commit first (`e0e575f4` precedent). If this ships wrong the failure modes are severe: a classifier hole could auto-commit a SEMANTIC projection delta (silent architecture-doc change without review), or a synthesis bug could sweep user WIP into a machine commit. Both are guarded fail-closed: classification authority is archctx's own `ProjectionResultV1.files`, and `commit-tree` never reads untracked/unstaged state.

## Goal

Execute the plan's `## Task Breakdown` (5 slices) exactly; frozen decisions 1-12 in `plans/plan-20260821-0222-restamp-auto-publication.md` are authoritative. Outcome: after a successful Stop drain whose only effect was a digest-only manifest restamp, the hook auto-synthesizes a single-path commit (`commit-tree` + `update-ref` CAS, no push, no cursor writes, never blocks Stop), so steady-state `git status` is clean; semantic deltas never auto-commit; a `architecture-projection publish-restamp --json` manual entry shares the implementation; `drain --json` output shape and all shell scripts are byte-unchanged.

## Scope

- In scope: `src/core/architecture/restamp-publication.ts` (new pure classifier+gate), `src/effects/architecture/restamp-publication.ts` (new git effect), `src/cli/hook/stop-handler.ts` (one call site + advisory), `src/cli/commands/architecture-projection.ts` (publish-restamp subcommand), new tests (`tests/architecture-restamp-*.test.ts`, drain-shape lock, stop-gate assertions), `docs/reference-configs/sprint-contracts.md` + `assets/reference-configs/` mirror prose.
- Out of scope: any shell script (`scripts/`, `assets/templates/helpers/`), any push automation, drift-cursor writers, policy.json keys/schema, downstream templates' behavior, `verify-sprint` base-sync criterion (companion work-package), archctx binary/provenance format, reverting restamps via checkout.
- Taste constraints: pure core / effect split per existing `src/core` vs `src/effects` convention; structured results not exceptions across the effect boundary; no new locks (git update-ref CAS is the concurrency primitive).

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Direction is wrong if a real receipt exists where `files.length === 1` but the single entry is NOT the manifest, or a semantic change ships without listing its `.md` files (classifier authority broken): cheapest proof is scanning `.ai/harness/architecture-projection/receipts/` for those shapes before wiring. Also wrong if `PROJECTION_WORKTREE_IGNORE_PATHS` does not actually make the restamp a fixed point (check `archctx-provider.ts:48-54` and prove one manifest-only commit yields `idle` on the next drain).

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260821-0222-restamp-auto-publication.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260821-0222-restamp-auto-publication.review.md`
- Notes file: `tasks/notes/20260821-0222-restamp-auto-publication.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"restamp-unit-suites","kind":"deterministic_test","paths":["*"]},{"id":"full-suite","kind":"deterministic_test","paths":["*"]},{"id":"real-stop-clean-status","kind":"runtime_readback","paths":["*"]},{"id":"gatekeeper-acceptance","kind":"manual_acceptance","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260821-0222-restamp-auto-publication.contract.md
  - tasks/reviews/20260821-0222-restamp-auto-publication.review.md
  - tasks/notes/20260821-0222-restamp-auto-publication.notes.md
  - src/core/architecture/
  - src/effects/architecture/
  - src/cli/hook/stop-handler.ts
  - src/cli/commands/architecture-projection.ts
  - tests/
  - docs/reference-configs/sprint-contracts.md
  - assets/reference-configs/
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
    - src/core/architecture/restamp-publication.ts
    - src/effects/architecture/restamp-publication.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260821-0222-restamp-auto-publication.notes.md
  tests_pass:
    - path: tests/architecture-restamp-classifier.test.ts
    - path: tests/architecture-restamp-publication.test.ts
    - path: tests/architecture-drift.test.ts
    - path: tests/unit/projection-publication-ownership.test.ts
    - path: tests/unit/contract-worktree-projection-restore.test.ts
  commands_succeed:
    - bun run check:type
    - bash -c 'git diff --quiet HEAD~1..HEAD -- scripts/ assets/templates/helpers/ || true; git log -1 --format=%s >/dev/null'
```

## Acceptance Notes (Human Review)

- Functional behavior: restamp-only drain result auto-commits a single-path commit; semantic deltas untouched; manual publish-restamp entry; ahead-of-origin advisory.
- Edge cases: detached HEAD, dirty index, other dirty tracked paths, linked worktrees, gpgsign, second-restamp window between add and update-ref, concurrent Stops, CAS refusal.
- Regression risks: Stop must never be blocked by the new path; strict-gate criteria set unchanged; drain --json operator shape byte-stable; staged/untracked never swept; shell byte-identity tests must stay green (no shell edits).

## Rollback Point

- Commit / checkpoint: worktree base (branch codex/restamp-auto-publication fork point from main)
- Revert strategy: single revert of the publication commit removes the stop-handler call site and both new modules; no shell, policy, or template surface touched, so no compatibility decision needed.
