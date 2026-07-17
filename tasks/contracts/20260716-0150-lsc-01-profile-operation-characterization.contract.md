# Task Contract: lsc-01-profile-operation-characterization

> **Status**: Active
> **Plan**: plans/plan-20260716-0150-lsc-01-profile-operation-characterization.md
> **Task Profile**: eval-only
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-16 02:23
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d`
> **LSC-01 Execution Base**: `origin/main@be3e93ce72c812a33045a15c4d97452c59fa3fbb`
> **Review File**: `tasks/reviews/20260716-0150-lsc-01-profile-operation-characterization.review.md`
> **Notes File**: `tasks/notes/20260716-0150-lsc-01-profile-operation-characterization.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

LSC will deliberately change artifact and readiness semantics. Without a
separate, immutable current-behavior package, later acceptance would compare
against a moving baseline and could silently mix ESA characterization with
semantic implementation. This contract freezes that baseline while preserving
ESA, LSC, HRD, EPC, and SSD as independent delivery boundaries.

## Goal

Deliver one focused characterization test and one JSON fixture that freeze
exactly nine Lite/Standard/Strict × edit/stop/ship current-behavior cells,
including verdict, reason, exit semantics, ordering, and observable side
effects, alongside only the target deltas already approved in the Harness Loop
audit. Reuse ESA fixture/golden inputs and change no production behavior.

## Scope

- In scope:
  - Reuse `tests/state/effective-state-fixture.ts` and read the ESA goldens
    `idle-inspect`, `missing-contract`, `executing-fresh-evidence`, and
    `explicit-strict-without-path-signals`.
  - Exercise the current PreEdit, Stop, and verify/ship gates only in
    disposable repositories, dry-run surfaces, or read-only source inventory.
  - Add exactly nine uniquely named cells with current verdict, reason, exit
    behavior, ordering, side effects, and inert approved target-delta data.
  - Pin the LSC-01 execution base and closeout evidence in canonical Sprint A.
- Out of scope:
  - Every production path, including `src/`, `.ai/hooks/`, `assets/hooks/`,
    `scripts/`, installer/profile/policy files, and Skill surfaces.
  - LSC-02..08, ArtifactRequirementPolicy, readiness fields/evaluator, Stop
    cleanup, revision changes, Loop Kernel, HRD, EPC, Checkpoint, and SSD.
  - Compatibility, fallback, dual authority, semantic fallback, silent
    migration, network ship actions, or any future-semantics implementation.
- Taste constraints: The fixture is explicit characterization data. Exclude raw
  nondeterministic transport fields instead of normalizing them; never rewrite
  a captured verdict, blocker/reason, required artifact, exit code, operation
  order, or observable write set.

## P1: Architecture Map

- Profile authority is `src/core/workflow/profile.ts`; Effective State authority
  is `src/core/state/` plus `src/effects/state/resolve-effective-state.ts`.
  These production modules are read-only inputs.
- ESA input lineage is `tests/state/effective-state-fixture.ts` and the four
  named JSON goldens under `tests/state/fixtures/`; none may be edited.
- Edit entrypoint is `.ai/hooks/pre-edit-guard.sh`, which resolves Effective
  State, contract scope, plan status, then Strict contract/worktree gates.
- Stop entrypoint is `.ai/hooks/stop-orchestrator.sh`; it reads the Effective
  State cache, currently retains install-profile fallback, refreshes recovery
  state, and conditionally evaluates review/orchestration gates.
- Ship runtime probe is `scripts/verify-sprint.sh`; the read-only envelope
  inventory spans `scripts/ship-worktrees.sh`, `scripts/verify-sprint.sh`, and
  `scripts/contract-worktree.sh`. A disposable negative probe must fail before
  any push, merge, commit, or PR side effect.
- This package owns only the exact workflow/test/eval files in Allowed Paths.

## P2: Concrete Trace

Create a disposable ESA fixture, reference the corresponding byte-bound ESA
golden lineage, select the explicit profile, invoke one current operation
boundary, capture a deterministic semantic projection plus the repository-wide
before/after file set (excluding only fixture-local `.git/` and disposable
`.home/` transport cache), and compare the result with the JSON golden. Raw
nondeterministic transport fields are excluded, not normalized. Edit errors
surface through Effective State blockers and PreEdit guard JSON; Stop may warn
while exiting zero; ship must fail through the missing contract or structured
verify-sprint gate before any network or Git mutation. Ordering is derived from
current source markers, while runtime gate requirements come from structured
checks output. The operation result and its approved target delta remain
separate records.

## P3: Design Decision

Use one test and one matrix fixture because they have one current consumer and
one rollback boundary. Do not create a helper abstraction or future evaluator.
This is the smallest package that preserves the cross-operation divergence and
gives LSC-02..08 an auditable before/after acceptance surface. At 10x matrix
size, subprocess and disposable-repository setup time fail first; that cost is
accepted for nine cells and must not be optimized by adding production runtime
or a shadow evaluator in this package.

## Stop Conditions

- Stop if any required edit falls outside Allowed Paths or another writer owns
  one of those paths.
- Stop if a production/config/Hook/Skill path would need modification.
- Stop if a semantic field would need normalization, synthesis, or fallback.
- Stop if a target delta is not explicitly supported by the source audit and
  canonical Sprint A.
- Stop rather than run a push, merge, PR, release, or other network ship action
  from a disposable fixture.
- Stop if the exact execution base is not an ancestor of this branch or the
  current package absorbs root/user WIP.
- Stop after three fail → fix → reverify rounds for the same issue.

## Falsifier

The direction is falsified if the nine current operation paths cannot be
observed deterministically from the pinned base without editing production
code, or if the approved target deltas cannot be distinguished from future
policy implementation. The cheapest proof is the focused test on one Standard
edit cell before expanding to all nine.

## Root Cause Evidence

Not applicable: this is an `eval-only` characterization package, not a bugfix.

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md`
- Source sprint: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`
- Active plan: `plans/plan-20260716-0150-lsc-01-profile-operation-characterization.md`
- Review: `tasks/reviews/20260716-0150-lsc-01-profile-operation-characterization.review.md`
- Notes: `tasks/notes/20260716-0150-lsc-01-profile-operation-characterization.notes.md`
- Checks: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `be3e93ce72c812a33045a15c4d97452c59fa3fbb` /
  `codex/lsc-01-profile-operation-characterization` /
  `/Users/kito/Projects/repo-harness-loop-control-wt-lsc-01-profile-operation-characterization`

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260716-0150-lsc-01-profile-operation-characterization.md
  - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260716-0150-lsc-01-profile-operation-characterization.contract.md
  - tasks/reviews/20260716-0150-lsc-01-profile-operation-characterization.review.md
  - tasks/notes/20260716-0150-lsc-01-profile-operation-characterization.notes.md
  - tests/state/loop-semantics-characterization.test.ts
  - tests/state/fixtures/loop-semantics/characterization.json
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
      purpose: current_path_archaeology
    worker:
      mode: edit_within_allowed_paths
      purpose: eval_fixture_and_test_only
    verifier:
      mode: read_only
      purpose: current_behavior_and_scope_review
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
    - plans/plan-20260716-0150-lsc-01-profile-operation-characterization.md
    - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
    - tasks/contracts/20260716-0150-lsc-01-profile-operation-characterization.contract.md
    - tasks/reviews/20260716-0150-lsc-01-profile-operation-characterization.review.md
    - tasks/notes/20260716-0150-lsc-01-profile-operation-characterization.notes.md
    - tests/state/loop-semantics-characterization.test.ts
    - tests/state/fixtures/loop-semantics/characterization.json
  artifacts_exist:
    - tasks/reviews/20260716-0150-lsc-01-profile-operation-characterization.review.md
    - tasks/notes/20260716-0150-lsc-01-profile-operation-characterization.notes.md
  tests_pass:
    - path: tests/state/loop-semantics-characterization.test.ts
  commands_succeed:
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
    - "Exactly nine unique Lite/Standard/Strict x edit/stop/ship cells are present"
    - "Current verdict, reason, exit semantics, ordering, and side effects match the pinned production paths"
    - "Raw nondeterministic transport fields are excluded; selected semantic values are not normalized"
    - "Approved target deltas are inert data and implement no future semantics"
    - "Final diff contains only Allowed Paths and no production/config/Hook/Skill path"
    - "Fresh task review and independent external acceptance both pass for the frozen subject"
```

## Acceptance Notes (Human Review)

- Functional behavior: freeze current behavior; no operation result may change.
- Edge cases: Standard missing-contract collapse, Strict fail-closed edit, stale
  review warning on Stop, Stop-versus-ship distinction, and profile-blind ship.
- Regression risks: over-normalization, accidentally executing ship mutations,
  or turning target-delta data into a second semantic authority.

## Rollback Point

- Commit / checkpoint: `be3e93ce72c812a33045a15c4d97452c59fa3fbb`.
- Revert strategy: revert the independent LSC-01 PR; production behavior is
  untouched and no compatibility path is required.
