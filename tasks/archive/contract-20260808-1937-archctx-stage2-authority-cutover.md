> **Archived**: 2026-08-08 19:37
> **Related Plan**: plans/archive/plan-20260808-1326-archctx-stage2-authority-cutover.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260808-1937

# Task Contract: archctx-stage2-authority-cutover

> **Status**: Fulfilled
> **Plan**: plans/plan-20260808-1326-archctx-stage2-authority-cutover.md
> **Task Profile**: migration
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-08 17:12
> **Review File**: `tasks/reviews/20260808-1326-archctx-stage2-authority-cutover.review.md`
> **Notes File**: `tasks/notes/20260808-1326-archctx-stage2-authority-cutover.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Stage 0 landed the full archcontext file-source resolution chain behind a policy switch, but this repo still runs on the legacy `.ai/context/capabilities.json`. The archctx side has delivered its gating items (verified 2026-08-08 against branch `codex/archctx-capability-docs-projection`, PR #96). Per 20260705 §7, authority cutover is its own work-package with the explicit correction that registry retirement must migrate consumer surfaces in-package. Shipping this wrong strands dual authority (policy violation) or breaks workflow-contract/scaffold/test consumers wholesale.

## Goal

This repo resolves capabilities from `.archcontext/model/nodes/*.yaml` under `capability_source: "archcontext"`; the 10 nodes round-trip exactly (resolver output from nodes equals resolver output from the retired registry: same ids, prefixes in order, contract files, architecture_module, workstream_dir); `.ai/context/capabilities.json` is deleted with every consumer surface migrated in the same package; the migration script retires with it; the post-edit drift card thins to a checkpoint nudge; the 10 baseline architecture docs carry §2-partition ownership markers with byte-for-byte human-section preservation; `.archcontext/model/nodes/` is tracked. All checks green.

## Scope

- In scope: migration script + node YAMLs; `.ai/harness/policy.json` capability_source flip; `.ai/context/capabilities.json` deletion with grep-verified consumer migration (workflow-contract requiredFiles, context-map, scaffold parity, helper tests, seeders); post-edit drift card thinning; ownership markers in `docs/architecture/modules/**`; gitignore audit for `.archcontext/`.
- Out of scope: `check-architecture-sync` freshness delegation to archctx CLI (gated on archctx release); projection takeover of machine sections (gated on archctx §3.6); archctx-contracts pin change; arch-context repo changes; downstream scaffold defaults (new repos keep registry mode).
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the round-trip gate cannot reach equality for any capability, the D2 grammar or extensions mapping loses information the registry carries — stop and report the exact field before flipping. If any consumer surface cannot migrate without keeping `capabilities.json` alive (dual authority), the 20260705 §7 concern is confirmed in an unabsorbed form — stop and report. Cheapest proof point: build the 10 nodes and run the resolver in archcontext mode against the untouched registry output before touching any consumer.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260808-1326-archctx-stage2-authority-cutover.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260808-1326-archctx-stage2-authority-cutover.review.md`
- Notes file: `tasks/notes/20260808-1326-archctx-stage2-authority-cutover.notes.md`
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
  - AGENTS.md
  - CLAUDE.md
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260808-1326-archctx-stage2-authority-cutover.contract.md
  - tasks/reviews/20260808-1326-archctx-stage2-authority-cutover.review.md
  - tasks/notes/20260808-1326-archctx-stage2-authority-cutover.notes.md
  - .ai/context/
  - .ai/harness/policy.json
  - .ai/hooks/
  - .archcontext/
  - .gitignore
  - docs/architecture/
  - docs/reference-configs/
  - scripts/
  - src/
  - tests/
  - assets/
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
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260808-1326-archctx-stage2-authority-cutover.notes.md
  tests_pass:
    - path: tests/capabilities/registry.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
    - bun src/cli/index.ts init --repo . --dry-run
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior: this repo resolves its ten capabilities from `.archcontext/model/nodes/*.yaml` under `capability_source: "archcontext"`; `.ai/context/capabilities.json` is deleted. Nodes and the retired registry were proven to resolve identically before the switch flipped, and re-proven independently at acceptance (all compared fields equal, 15/15 path-match parity against the `main` registry resolver).
- Edge cases: `check-task-workflow` selects its required capability artifact by source mode and fails closed in all four combinations; both seeder paths that would have resurrected an empty registry are gated on the target repo's own source and were shown to be live and directional; `capability-config` and `capability-context sync --apply` refuse to write the registry under archcontext instead of silently recreating it; a missing or unreadable nodes directory resolves as `invalid`, never `absent`.
- Regression risks: downstream generated repos keep registry mode — verified by initialising throwaway repos from this worktree and from `main` and diffing the trees (identical modulo fixture names and transaction timestamps). Registry-mode state hashing stays byte-identical, so existing fixtures and goldens are unaffected. Residual risks and follow-ups are enumerated in the review file.

## Rollback Point

- Commit / checkpoint: `1eaf63019aadd2129376987957170d8310b35c3f` (branch point, equal to `origin/main` at the time of the cut).
- Revert strategy: revert `1ffe78de` to restore registry authority, the registry file, and the pre-thin drift card in one step; `65b808b4` is workflow-artifact-only and can be reverted with it or left in place. The nodes directory and the architecture-doc markers are additive and inert under `capability_source: "registry"`, so no cleanup follows a revert.
