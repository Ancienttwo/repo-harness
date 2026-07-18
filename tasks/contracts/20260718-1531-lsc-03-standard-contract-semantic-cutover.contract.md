# Task Contract: lsc-03-standard-contract-semantic-cutover

> **Status**: Active
> **Plan**: plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-18 15:45
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **LSC-03 Execution Base**: `origin/main@3c9cf80a` (post-LSC-02 merge PR #84 plus sprint backfill)
> **Review File**: `tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md`
> **Notes File**: `tasks/notes/20260718-1531-lsc-03-standard-contract-semantic-cutover.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Standard's promised low ceremony ("at most one active plan artifact; no
contract ... beyond it", `src/core/state/project-effective-state.ts:21`) is
contradicted by the unconditional `missing_contract` blocker
(`project-effective-state.ts:213-220`), which collapses Standard edits into a
generic `WorkflowProfileGuard` exit 2 in PreEdit (audit LOOP-01). LSC-02
established the single requirement authority; until a consumer actually reads
it, profile remains a ceremony label with no policy effect, and every later
cutover row inherits the contradiction.

## Goal

Make the approved Standard work-package contract policy identical across
State, PreEdit, Stop, docs, and Skill guidance by wiring the `missing_contract`
decision in `projectEffectiveState` to `ArtifactRequirementPolicy` (the first
consumer switch): Standard with an approved/executing plan and no separate
contract stops blocking (per the frozen `standard.edit` target delta), Strict
missing-contract/worktree states remain fail-closed, and an unresolvable
profile stays fail-closed. Ship semantics are untouched.

## Scope

- In scope:
  - `src/core/state/project-effective-state.ts`: replace the unconditional
    `missing_contract` push (lines 213-220) with a profile-aware decision that
    consults `resolve({ profile, operation: 'edit' })` from
    `src/core/workflow/artifact-requirement-policy.ts`. Push `missing_contract`
    only when the resolved cell marks `separate_contract` required (strict),
    or when the workflow profile is unresolvable (`riskResolution.ok` false /
    profile null) — fail closed. `CEREMONY_GUIDANCE` text stays unchanged
    (it already states the target policy; this package makes it true).
  - `src/effects/state/resolve-effective-state.ts` only if input wiring is
    strictly required to reach the profile at the decision point; no other
    semantic change there.
  - Test updates for the surfaces that pin the old collapse:
    `tests/effective-state.test.ts:248-254` and `:410-419` (Standard
    missing_contract assertions), `tests/state/project-effective-state.test.ts:145-166`,
    and the fixture-literal usage in `tests/cli/state-command.test.ts:106-123`
    (synthetic CLI blocker-suppression test — keep it if its synthetic fixture
    remains valid CLI behavior, re-anchor to a strict-shaped fixture if
    needed). New regression cases: Standard approved-plan-without-contract
    allows (no `missing_contract`, phase not blocked); Strict same state still
    blocks; lite unaffected; unresolvable profile fails closed.
  - The characterization test re-executes current behavior live, so this
    package's intended semantic change moves it off the frozen `current`
    snapshot. AUTHORIZED (decision 2026-07-18, recorded here and in notes):
    regenerate ONLY the `current` blocks via `UPDATE_LOOP_SEMANTICS_GOLDEN=1`,
    then verify the fixture diff cell-by-cell — every changed `current` block
    must correspond to a cell whose recorded `approved_target_delta` names
    exactly this package's behavior change (expected: `standard.edit`
    verdict/exit/reason/state_blockers per "separate_contract becomes
    not_required by default" + "remove the current missing_contract collapse
    into WorkflowProfileGuard"). Every `approved_target_delta` block stays
    byte-identical. A changed `current` block with NO matching recorded delta
    is a real regression: revert and stop. The fixture's baseline SHA header
    fields stay unchanged.
  - EXTENDED (decision 2026-07-18, round 2): the characterization test file
    carries a deliberate second lock — a hardcoded `standard.edit` current
    literal (`tests/state/loop-semantics-characterization.test.ts:866-880`)
    that throws before the JSON regeneration write. Editing EXACTLY that
    literal to the new current behavior (verdict allow / exit 0 / reason none
    / state_blockers []) is authorized; the `TARGET_DELTAS` literals and every
    other line of the test stay byte-identical. The loud test-file diff is the
    intended audit signal for a semantic change.
  - EXTENDED (same decision): `tests/state/fixtures/missing-contract.json`
    (ESA golden consumed by `tests/state/cli-state-golden.test.ts`) pins the
    same pre-cutover behavior. Regenerate it via its own sanctioned mechanism
    (`UPDATE_EFFECTIVE_STATE_GOLDENS=1`) and verify the field-level diff:
    only fields expressing the approved flip (blockers, phase, exit/verdict,
    next_action/guidance downstream of them) may change; any other drift is a
    regression — revert and stop. `tests/state/cli-state-golden.test.ts`
    itself stays untouched.
  - Pin `LSC-03 Execution Base` in the sprint header of
    `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`
    following the successor-pin precedent; touch nothing else there.
  - Record the before/after behavior and a migration note per the sprint DoD
    in the notes file, including the external Skill guidance surface
    (`~/.codex/skills/repo-harness/SKILL.md:23` — runtime-referenced, not
    vendored; it is NOT part of this repo diff; the repo-side authority
    becoming consistent is this package's deliverable).
- Out of scope:
  - `.ai/hooks/pre-edit-guard.sh` and every other Hook file: the Standard
    collapse disappears because State stops emitting the blocker; the Strict
    guards (`pre-edit-guard.sh:256-274`) must remain byte-identical. If any
    hook edit seems required, stop and hand back.
  - Ship-side profile awareness (`scripts/verify-sprint.sh` gate requirements,
    `standard.ship`/`strict.ship` deltas) — later rows (LSC-06..08).
  - Stop semantics (`.ai/hooks/stop-orchestrator.sh` has no Standard contract
    text; LSC-07 owns Stop changes).
  - Readiness evaluator fields, revision partition, state-version allocation
    (LSC-04..06); any second policy representation or compatibility fallback.
  - `assets/` mirrors, installer, Skill files, `docs/` beyond what the notes
    record.
- Taste constraints: the consumer reads the policy module's decision; it must
  not re-derive, copy, or specialize the matrix locally. One call site, no
  wrapper layer.

## Stop Conditions

- Stop and hand back if the change would require editing a path outside
  Allowed Paths — explicitly including any `.ai/hooks/` or `assets/` file.
- Stop if Strict fail-closed behavior would change on any surface.
- Stop if any golden diff (characterization fixture `current` block, the
  authorized in-test `standard.edit` current literal, or the ESA
  `missing-contract` golden) changes anything without a matching recorded
  `approved_target_delta`, changes any `approved_target_delta`/`TARGET_DELTAS`
  byte, or would require edits to `tests/state/cli-state-golden.test.ts` or
  any characterization test line outside the authorized literal.
- Stop if the policy-module call would need consumer-specific branches (that
  falsifies the single-authority direction).
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The cutover direction is falsified if State cannot decide `missing_contract`
from `resolve({ profile, operation: 'edit' })` alone — i.e. it needs extra
consumer context (paths, plan text, hook state) to reproduce the approved
Standard/Strict split. Cheapest proof: wire the Standard
approved-plan-no-contract case first; if it needs anything beyond the profile
and the policy cell, stop.

## Root Cause Evidence

Not applicable: this is a `code-change` semantic-cutover package, not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md` (LOOP-01, row LSC-03)
- Source sprint: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`
- Delta authority: `tests/state/fixtures/loop-semantics/characterization.json` (`standard.edit.complete-work-package-no-contract-blocks`, `strict.edit.missing-contract-blocks` cells)
- Requirement authority: `src/core/workflow/artifact-requirement-policy.ts`
- Active plan: `plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md`
- Review file: `tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md`
- Notes file: `tasks/notes/20260718-1531-lsc-03-standard-contract-semantic-cutover.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `3c9cf80a` / `codex/lsc-03-standard-contract-semantic-cutover` /
  `/Users/kito/Projects/repo-harness-loop-control-wt-lsc-03-standard-contract-semantic-cutover`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md
  - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md
  - tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md
  - tasks/notes/20260718-1531-lsc-03-standard-contract-semantic-cutover.notes.md
  - src/core/state/project-effective-state.ts
  - src/effects/state/resolve-effective-state.ts
  - tests/effective-state.test.ts
  - tests/state/project-effective-state.test.ts
  - tests/cli/state-command.test.ts
  - tests/state/fixtures/loop-semantics/characterization.json
  - tests/state/loop-semantics-characterization.test.ts
  - tests/state/fixtures/missing-contract.json
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
      purpose: cutover_surface_archaeology
    worker:
      mode: edit_within_allowed_paths
      purpose: state_consumer_cutover_and_tests
    verifier:
      mode: read_only
      purpose: exit_criteria_and_strict_failclosed_review
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
    - plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md
    - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
    - tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md
    - tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md
    - tasks/notes/20260718-1531-lsc-03-standard-contract-semantic-cutover.notes.md
  artifacts_exist:
    - tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md
    - tasks/notes/20260718-1531-lsc-03-standard-contract-semantic-cutover.notes.md
  tests_pass:
    - path: tests/effective-state.test.ts
    - path: tests/state/project-effective-state.test.ts
    - path: tests/cli/state-command.test.ts
  commands_succeed:
    - bun test tests/effective-state.test.ts tests/state/project-effective-state.test.ts tests/cli/state-command.test.ts
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
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: code_quality
      min: 8
  manual_checks:
    - "Standard approved/executing plan without separate contract: no missing_contract blocker, phase not blocked, PreEdit no longer collapses (verified through test fixtures or a disposable state resolve)"
    - "Strict missing-contract and missing-worktree states remain fail-closed; git diff shows no .ai/hooks/ or assets/ path"
    - "Unresolvable workflow profile still fails closed with missing_contract for approved/executing plans"
    - "The consumer reads resolve() output; no local copy or re-derivation of the matrix"
    - "Golden diffs are exactly delta-shaped: characterization fixture changes only the standard.edit current block; the test file changes only the authorized 866-880 current literal (TARGET_DELTAS byte-identical); missing-contract.json changes only fields expressing the approved flip; cli-state-golden.test.ts untouched; the two-round authorization decision is recorded in notes + plan"
    - "Before/after behavior and migration note recorded in notes per sprint DoD, including the external Skill guidance surface"
    - "Final diff contains only Allowed Paths"
    - "Fresh task review and independent external acceptance both pass for the frozen subject"
```

## Acceptance Notes (Human Review)

- Functional behavior: Standard stops requiring a separate contract for edit
  by default; Strict and unresolvable-profile paths block exactly as before;
  no ship/Stop surface changes.
- Edge cases: plan approved vs executing; contract present (no change);
  lite with a plan; profile resolution failure; CLI blocker suppression.
- Regression risks: silently relaxing Strict; the frozen characterization test
  pinning old current behavior; hook drift via assets mirrors; consumer
  re-deriving policy locally.

## Rollback Point

- Commit / checkpoint: `3c9cf80a`.
- Revert strategy: revert the independent LSC-03 PR; the policy module returns
  to consumer-free and Standard returns to the characterized collapse; no
  compatibility path required.
