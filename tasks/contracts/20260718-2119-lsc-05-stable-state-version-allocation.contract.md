# Task Contract: lsc-05-stable-state-version-allocation

> **Status**: Active
> **Plan**: plans/plan-20260718-2119-lsc-05-stable-state-version-allocation.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-18 21:25
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **LSC-05 Execution Base**: `origin/main@42b77aa0` (post-LSC-04 merge PR #86 plus backfill)
> **Review File**: `tasks/reviews/20260718-2119-lsc-05-stable-state-version-allocation.review.md`
> **Notes File**: `tasks/notes/20260718-2119-lsc-05-stable-state-version-allocation.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Most of the row-5 acceptance already holds at base and is pinned by tests:
version allocation happens after the stability loop, failed cache/owner
transactions consume no observable version
(`tests/state/state-effects.test.ts:218-264`, four fault paths), and
continuous source mutation exhausts the stability loop with no version-owner
file ever created (`tests/state/state-concurrency.test.ts:388-455`). The
remaining defect is a re-verification gap: nothing re-checks the sources
between `resolveStableEffectiveState`'s final confirming read
(`src/effects/state/resolve-effective-state.ts:580-594`) and
`commitStateVersionAfter`'s use of `confirmed.state_revision`
(`resolve-effective-state.ts:551-569`) — the state lock does not stop
external writers to plan/contract/policy, so a mutation landing in that
window gets a version allocated against an already-stale revision, silently.

## Goal

Close the confirm-to-commit window: re-verify the source snapshot inside the
version-allocation critical section, fail closed (no observable version, no
cache) when it no longer matches, with one bounded outer retry of the whole
stable-resolve sequence before surfacing the existing stability-exhausted
error. Prove it with a deterministic injection test. Everything already
passing stays byte-for-byte pinned.

## Scope

- In scope:
  - `src/effects/state/git-state-version-store.ts`: add a snapshot
    re-verification seam to `commitStateVersionAfter` (e.g. an optional
    `confirmSnapshot: () => boolean` in its params/effects) evaluated inside
    the version lock BEFORE computing/consuming the candidate version. On
    mismatch: throw (or return a typed failure) without touching the owner
    file or invoking `publishCache` — the existing no-observable-version
    guarantees must hold for this new failure mode exactly as for the four
    existing fault paths.
  - `src/effects/state/resolve-effective-state.ts`: pass a `confirmSnapshot`
    closure that re-collects source hashes and compares against
    `confirmed.source_hashes`; on seam failure, retry the whole
    stable-resolve + commit sequence at most once more, then throw the
    existing `'workflow authority changed repeatedly while resolving
    effective state'` error. No new error vocabulary on the public surface.
  - Tests:
    - `tests/state/state-effects.test.ts`: seam unit coverage — confirm
      mismatch leaves owner/cache bytes identical, no temp files, next
      successful call consumes exactly +1 (mirror the existing four fault
      path assertions).
    - `tests/state/state-concurrency.test.ts`: deterministic
      confirm-window test — instrumented effects mutate a source file
      precisely between the stability confirmation and the in-lock
      re-verification; assert the first attempt does not allocate, the
      bounded retry resolves against the new content, and the resulting
      version sequence has no gap; plus an exhaustion variant (mutation on
      every retry) asserting the stability error with no version-owner file.
  - Pin `LSC-05 Execution Base` in the sprint header per successor rule.
  - Notes: record that the bulk of row-5 acceptance predates this package
    (cite the pinning tests), what this package adds, and the irreducible
    residual (post-recheck, pre-write, single-lock-holder window) with why
    it is acceptable: the snapshot is confirmed inside the same lock that
    serializes allocation.
- Out of scope:
  - The stability loop's read-count/retry policy beyond the one bounded
    outer retry; any change to `state_revision` composition or the LSC-04
    revision fields; readiness (LSC-06), Stop (LSC-07), parity/docs (LSC-08).
  - The four fixtures embedding `"state_version": 1`
    (stale-dead-lock-reclaimed, live-lock-waits-for-release,
    deleted-cache-reconstruction, corrupt-cache-reconstruction) — their
    scenarios' behavior must not change; if any of them drifts, that is a
    regression, not a fixture update.
  - The frozen characterization fixture/test — must pass UNMODIFIED (no
    golden regeneration is expected this row; if it fails, STOP).
  - Hooks, assets, scripts, installer, Skill surfaces; locking primitives in
    `src/effects/locking/`; compatibility shims or dual allocation paths.
- Taste constraints: the seam is one optional callback with fail-closed
  default semantics; do not introduce a second stability loop or a new lock.

## Stop Conditions

- Stop and hand back if the change would require editing a path outside
  Allowed Paths.
- Stop if any of the four literal-version fixtures or the frozen
  characterization test fails.
- Stop if closing the window would require changing the locking primitives
  or adding a new lock file.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The seam direction is falsified if the confirm-window race cannot be
expressed deterministically through injected effects (i.e. the window is not
actually reachable from the effects surface) — that would mean the gap is
already closed and this row reduces to documentation. Cheapest proof: write
the failing injection test FIRST against base behavior; it must demonstrate
a version allocated against a stale revision before the seam exists.

## Root Cause Evidence

Not applicable: this is a `code-change` package scoped by the sprint row,
not a bugfix contract.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md` (LOOP-03:352-374, allocation rule :441-454, P0 item :1531)
- Source sprint: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md` (row 5, acceptance scenario :63-64)
- Active plan: `plans/plan-20260718-2119-lsc-05-stable-state-version-allocation.md`
- Review file: `tasks/reviews/20260718-2119-lsc-05-stable-state-version-allocation.review.md`
- Notes file: `tasks/notes/20260718-2119-lsc-05-stable-state-version-allocation.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `42b77aa0` / `codex/lsc-05-stable-state-version-allocation` /
  `/Users/kito/Projects/repo-harness-loop-control-wt-lsc-05-stable-state-version-allocation`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260718-2119-lsc-05-stable-state-version-allocation.md
  - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260718-2119-lsc-05-stable-state-version-allocation.contract.md
  - tasks/reviews/20260718-2119-lsc-05-stable-state-version-allocation.review.md
  - tasks/notes/20260718-2119-lsc-05-stable-state-version-allocation.notes.md
  - src/effects/state/git-state-version-store.ts
  - src/effects/state/resolve-effective-state.ts
  - tests/state/state-effects.test.ts
  - tests/state/state-concurrency.test.ts
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
      purpose: allocation_window_archaeology
    worker:
      mode: edit_within_allowed_paths
      purpose: confirm_snapshot_seam_and_tests
    verifier:
      mode: read_only
      purpose: exit_criteria_and_invariant_review
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
    - plans/plan-20260718-2119-lsc-05-stable-state-version-allocation.md
    - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
    - tasks/contracts/20260718-2119-lsc-05-stable-state-version-allocation.contract.md
    - tasks/reviews/20260718-2119-lsc-05-stable-state-version-allocation.review.md
    - tasks/notes/20260718-2119-lsc-05-stable-state-version-allocation.notes.md
  artifacts_exist:
    - tasks/reviews/20260718-2119-lsc-05-stable-state-version-allocation.review.md
    - tasks/notes/20260718-2119-lsc-05-stable-state-version-allocation.notes.md
  tests_pass:
    - path: tests/state/state-effects.test.ts
    - path: tests/state/state-concurrency.test.ts
  commands_succeed:
    - bun test tests/state/state-effects.test.ts tests/state/state-concurrency.test.ts tests/effective-state.test.ts tests/state/adapter-parity.test.ts tests/state/cli-state-golden.test.ts
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
    - "A pre-seam injection run demonstrates the stale-revision allocation on base behavior (falsifier evidence), captured in notes"
    - "Confirm-mismatch leaves owner and cache bytes identical, no temp files, next success is exactly +1"
    - "Deterministic confirm-window test passes; exhaustion variant throws the existing stability error with no version-owner file"
    - "Four literal-version fixtures and the frozen characterization test pass unmodified"
    - "No new lock file, no locking-primitive change, no new public error vocabulary"
    - "Final diff contains only Allowed Paths"
    - "Fresh task review and independent external acceptance both pass for the frozen subject"
```

## Acceptance Notes (Human Review)

- Functional behavior: allocation now re-confirms the snapshot inside the
  version lock; one bounded outer retry; all previously pinned guarantees
  unchanged.
- Edge cases: mutation exactly between confirm and commit; mutation on every
  retry (exhaustion); publishCache failure after a successful confirm
  (existing paths); same-revision reconstruction (owner effects still zero).
- Regression risks: accidentally loosening the four fault-path guarantees;
  double allocation via the outer retry; fixture drift in the four
  literal-version scenarios.

## Rollback Point

- Commit / checkpoint: `42b77aa0`.
- Revert strategy: revert the independent LSC-05 PR; allocation returns to
  the confirm-window behavior with all pre-existing guarantees intact; no
  persisted migration to unwind.
