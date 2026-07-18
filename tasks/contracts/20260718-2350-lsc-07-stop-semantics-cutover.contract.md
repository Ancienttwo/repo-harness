# Task Contract: lsc-07-stop-semantics-cutover

> **Status**: Active
> **Plan**: plans/plan-20260718-2350-lsc-07-stop-semantics-cutover.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-18 23:55
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **LSC-07 Execution Base**: `origin/main@574c5c66` (post-LSC-06 merge PR #88 plus backfill)
> **Review File**: `tasks/reviews/20260718-2350-lsc-07-stop-semantics-cutover.review.md`
> **Notes File**: `tasks/notes/20260718-2350-lsc-07-stop-semantics-cutover.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Stop today infers its profile from a raw cache read with an install-state
fallback (`.ai/hooks/stop-orchestrator.sh:591-617`) and papers over its own
write-ordering with an mtime touch (`:279-285`). It never consumes the
readiness authority: the three frozen stop cells record
`profile_source: "effective_state_cache_with_install_profile_fallback"` and
`missing_semantic_fields: [allowedToStop, readyToShip, requirements,
nextAction]`. Until Stop consumes shared readiness and the three named
crutches are removed, the allowed-to-stop/not-ready-to-ship distinction
exists only inside an unconsumed module.

## Goal

Cut Stop over to the shared readiness authority and remove all three named
crutches: (1) expose one additive `readiness` projection on
`EffectiveStateV1` computed by `evaluateReadiness` in the pure projector;
(2) `stop-orchestrator.sh` consumes canonical state through the hook CLI —
no install-profile fallback, no raw cache-as-authority read; (3) the mtime
freshness touch is removed by fixing the write ordering it compensated for.
`readyToShip=false` is reported, never converted into a Stop block. Public
routes, CLI command names, and the two orthogonal Stop gates
(PlanCompletenessGate, DelegationFallback) are unchanged.

## Scope

- In scope:
  - `src/core/state/project-effective-state.ts` + `src/core/state/types.ts`:
    one additive `readiness` field on `EffectiveStateV1` — the
    `evaluateReadiness` result (allowedToEdit/allowedToStop/readyToShip
    decisions, requirements, nextAction) computed purely from inputs the
    projector already has (per-operation `resolve()` decisions, contract
    presence, worktree ownership, review/external/checks freshness,
    blockers). Existing fields (`blockers`, `phase`, `next_action`,
    `guidance`) keep byte-identical semantics — the LSC-03 edit-blocker path
    stays as-is; the readiness projection is additive alongside.
  - `.ai/hooks/stop-orchestrator.sh` + `assets/hooks/stop-orchestrator.sh`
    (must stay cmp-identical):
    - Replace `stop_workflow_profile()` (lines ~591-617) with one canonical
      resolution through the existing hook CLI surface
      (`state resolve --json` / `--field`): profile and readiness come from
      the resolver output. Delete the install-state fallback entirely and
      the raw `jq .workflow_profile` cache read. Resolver
      unavailable/failing → log to stderr and skip readiness-driven
      behavior (no invented profile, no block) — the orthogonal gates still
      run; document this fail-direction in notes.
    - Consume readiness: `allowedToStop=block` (if it ever occurs) is the
      only readiness-driven `emit_stop_block_json` path;
      `readyToShip=false` with `allowedToStop=allow` surfaces as a
      stderr/handoff note and exits 0 (frozen strict.stop delta). Unrequired
      review/external acceptance must not block Stop (standard.stop delta).
    - Remove the `touch -r` mtime crutch (`:279-285`) by reordering the
      writes it compensated for (append the minimal-change handoff section
      before the resume packet is finalized, or consolidate to one write per
      the lite.stop "one compact checkpoint" delta) so
      `check_handoff_resume_pair` passes naturally.
      `scripts/check-task-workflow.sh` and its asset mirror stay untouched.
    - PlanCompletenessGate, DelegationFallback, minimal-change review
      verdict handling, and the review-freshness stderr nudge keep their
      current logic and inputs.
  - `.ai/hooks/.projection.json`: refreshed ONLY via
    `bun scripts/sync-hook-sources.ts --write` (LSC-04 precedent).
  - AUTHORIZED UPFRONT — delta-shaped golden updates (precedents LSC-03/04):
    - Characterization stop cells: regenerate via
      `UPDATE_LOOP_SEMANTICS_GOLDEN=1`; the three stop cells' `current`
      blocks may change ONLY in fields expressing this cutover
      (profile_source, cache/fallback observations, readiness fields,
      side_effects from the write reordering); every `approved_target_delta`
      byte and every non-stop cell's `current` block stay unchanged; the
      `esa_goldens` content-hash cross-references may shift if flat goldens
      regenerate.
    - The in-test literal assertions that pin the removed source strings
      (e.g. `tests/state/loop-semantics-characterization.test.ts:354`
      asserting the install_state line) may be edited ONLY to assert the
      new canonical-consumption reality (e.g. the fallback string is
      ABSENT); TARGET_DELTAS and all other test lines stay byte-identical.
    - Flat ESA goldens + adapter field lists: the additive `readiness` field
      flows into `tests/state/fixtures/*.json` via
      `UPDATE_EFFECTIVE_STATE_GOLDENS=1` (additive-only diffs), and the
      field-list/dynamic-key sets in `tests/state/adapter-parity.test.ts` /
      `tests/state/cli-state-golden.test.ts` plus fixture literals in
      `tests/cli/state-command.test.ts` / `tests/harness-context-budget.test.ts`
      may be extended additively.
  - Tests: re-pin `tests/hook-runtime.test.ts:1804-1806` (mtime invariant —
    now holds without the touch) and `:1819-1841` (profile now canonical,
    not raw-cache); add a regression asserting the install-state fallback is
    gone (install-state present + cache absent → no profile inference); add
    the allowed-to-stop/not-ready-to-ship hook-level fixture the row
    acceptance names; keep `:2551-2573` (review nudge) passing unchanged.
  - Pin `LSC-07 Execution Base` in the sprint header per successor rule.
  - Notes: migration note per sprint DoD (fallback removal one-shot
    behavior differences, fail-direction on resolver failure, write
    reordering), plus the LSC-08 remainder (adapter parity).
- Out of scope:
  - Any new CLI command/route/tool name; MCP/Skill surface changes and
    cross-adapter parity proofs (LSC-08).
  - `scripts/check-task-workflow.sh` + asset mirror; `hook-input.sh`;
    `pre-edit-guard.sh`; every other hook.
  - The two orthogonal Stop gates' logic; minimal-change review semantics.
  - `evaluateReadiness` internals and the requirement matrix (established
    rows); state_version/allocation; compatibility shims, dual authorities,
    or a cache-fallback "just in case" path — the removed crutches must not
    survive behind flags.
- Taste constraints: the hook consumes the resolver's readiness verbatim
  (jq field reads), re-deriving nothing; one CLI invocation per Stop run,
  reused for profile + readiness.

## Stop Conditions

- Stop and hand back if the change would require editing a path outside
  Allowed Paths.
- Stop if any characterization NON-stop cell's `current` block or any
  `approved_target_delta`/TARGET_DELTAS byte would change.
- Stop if any flat-golden diff is more than additive, or the two orthogonal
  Stop gates' behavior shifts.
- Stop if removing the mtime touch cannot be done by write
  reordering/consolidation alone (i.e. it would require changing
  `check-task-workflow.sh`).
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The cutover direction is falsified if Stop cannot obtain profile+readiness
from one canonical resolver invocation without the removed crutches — e.g.
if hook-runtime environments genuinely lack the CLI, forcing a fallback
back in. Cheapest proof: replace `stop_workflow_profile()` first and run
the Lite early-exit hook-runtime tests; if they cannot pass without a raw
cache read, stop.

## Root Cause Evidence

Not applicable: this is a `code-change` semantic-cutover package, not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md` (LOOP-02:304-344; Stop-related LOOP sections)
- Source sprint: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md` (row 7)
- Delta authority: `tests/state/fixtures/loop-semantics/characterization.json` (three stop cells)
- Readiness authority: `src/core/workflow/operation-readiness.ts`
- Active plan: `plans/plan-20260718-2350-lsc-07-stop-semantics-cutover.md`
- Review file: `tasks/reviews/20260718-2350-lsc-07-stop-semantics-cutover.review.md`
- Notes file: `tasks/notes/20260718-2350-lsc-07-stop-semantics-cutover.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `574c5c66` / `codex/lsc-07-stop-semantics-cutover` /
  `/Users/kito/Projects/repo-harness-loop-control-wt-lsc-07-stop-semantics-cutover`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260718-2350-lsc-07-stop-semantics-cutover.md
  - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260718-2350-lsc-07-stop-semantics-cutover.contract.md
  - tasks/reviews/20260718-2350-lsc-07-stop-semantics-cutover.review.md
  - tasks/notes/20260718-2350-lsc-07-stop-semantics-cutover.notes.md
  - src/core/state/types.ts
  - src/core/state/project-effective-state.ts
  - src/effects/state/resolve-effective-state.ts
  - .ai/hooks/stop-orchestrator.sh
  - assets/hooks/stop-orchestrator.sh
  - .ai/hooks/.projection.json
  - tests/hook-runtime.test.ts
  - tests/effective-state.test.ts
  - tests/state/project-effective-state.test.ts
  - tests/state/adapter-parity.test.ts
  - tests/state/cli-state-golden.test.ts
  - tests/cli/state-command.test.ts
  - tests/harness-context-budget.test.ts
  - tests/state/loop-semantics-characterization.test.ts
  - tests/state/fixtures/loop-semantics/characterization.json
  - tests/state/fixtures/idle-inspect.json
  - tests/state/fixtures/missing-contract.json
  - tests/state/fixtures/executing-fresh-evidence.json
  - tests/state/fixtures/explicit-strict-without-path-signals.json
  - tests/state/fixtures/corrupt-cache-reconstruction.json
  - tests/state/fixtures/deleted-cache-reconstruction.json
  - tests/state/fixtures/foreign-worktree-owner.json
  - tests/state/fixtures/invalid-capability-registry.json
  - tests/state/fixtures/live-lock-waits-for-release.json
  - tests/state/fixtures/profile-below-strict-floor.json
  - tests/state/fixtures/stale-dead-lock-reclaimed.json
  - tests/state/fixtures/stale-projections.json
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: scope_and_acceptance_owner
    explorer:
      mode: read_only
      purpose: stop_surface_archaeology
    worker:
      mode: edit_within_allowed_paths
      purpose: stop_cutover_and_crutch_removal
    verifier:
      mode: read_only
      purpose: exit_criteria_and_orthogonal_gate_review
  runner:
    preferred:
      - subagent
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - plans/plan-20260718-2350-lsc-07-stop-semantics-cutover.md
    - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
    - tasks/contracts/20260718-2350-lsc-07-stop-semantics-cutover.contract.md
    - tasks/reviews/20260718-2350-lsc-07-stop-semantics-cutover.review.md
    - tasks/notes/20260718-2350-lsc-07-stop-semantics-cutover.notes.md
  artifacts_exist:
    - tasks/reviews/20260718-2350-lsc-07-stop-semantics-cutover.review.md
    - tasks/notes/20260718-2350-lsc-07-stop-semantics-cutover.notes.md
  tests_pass:
    - path: tests/hook-runtime.test.ts
    - path: tests/effective-state.test.ts
    - path: tests/state/adapter-parity.test.ts
    - path: tests/state/cli-state-golden.test.ts
  commands_succeed:
    - bun test tests/hook-runtime.test.ts tests/effective-state.test.ts tests/state/project-effective-state.test.ts tests/state/adapter-parity.test.ts tests/state/cli-state-golden.test.ts tests/cli/state-command.test.ts tests/harness-context-budget.test.ts
    - bun test tests/state/loop-semantics-characterization.test.ts
    - bun run check:type
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-architecture-sync.sh
    - repo-harness run check-task-workflow --strict
    - repo-harness state resolve --json
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
    - git diff --check
    - cmp .ai/hooks/stop-orchestrator.sh assets/hooks/stop-orchestrator.sh
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: code_quality
      min: 8
  manual_checks:
    - "grep of stop-orchestrator.sh shows no install-state.json reference, no raw effective.json jq read, and no touch -r crutch"
    - "One canonical CLI invocation per Stop run supplies profile + readiness; resolver failure skips readiness-driven behavior without inventing a profile or blocking"
    - "readyToShip=false with allowedToStop=allow exits 0 with a report, never a block; unrequired review/external acceptance cannot block Stop"
    - "PlanCompletenessGate, DelegationFallback, minimal-change review, and the review-freshness nudge behave identically (their tests unchanged and passing)"
    - "check_handoff_resume_pair passes without the mtime touch (write ordering fixed); check-task-workflow.sh untouched"
    - "Characterization diff: only the three stop cells' current blocks (+esa_goldens hashes if flat goldens moved); in-test edits limited to the removed-source-string assertions; TARGET_DELTAS byte-identical"
    - "Flat ESA golden diffs additive-only (readiness field); adapter field lists extended additively"
    - "cmp hook mirrors identical; .projection.json refreshed only via sync-hook-sources"
    - "Final diff contains only Allowed Paths"
    - "Fresh task review and independent external acceptance both pass for the frozen subject"
```

## Acceptance Notes (Human Review)

- Functional behavior: Stop consumes one readiness authority; the three
  crutches are gone; the stop/ship distinction is visible at the hook level;
  everything orthogonal is untouched.
- Edge cases: resolver unavailable in hook runtime; lite early-exit; strict
  not-ready-to-ship; install-state present but ignored; handoff/resume pair
  freshness without the touch.
- Regression risks: silently re-adding a fallback; blocking Stop on
  readiness; orthogonal gate drift; more-than-additive golden diffs; hook
  mirror divergence.

## Rollback Point

- Commit / checkpoint: `574c5c66`.
- Revert strategy: revert the independent LSC-07 PR; Stop returns to the
  characterized crutch behavior; no persisted migration to unwind.
