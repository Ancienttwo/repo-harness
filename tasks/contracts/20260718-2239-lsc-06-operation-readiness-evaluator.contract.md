# Task Contract: lsc-06-operation-readiness-evaluator

> **Status**: Active
> **Plan**: plans/plan-20260718-2239-lsc-06-operation-readiness-evaluator.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-18 22:45
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **LSC-06 Execution Base**: `origin/main@df3226dd` (post-LSC-05 merge PR #87 plus backfill)
> **Review File**: `tasks/reviews/20260718-2239-lsc-06-operation-readiness-evaluator.review.md`
> **Notes File**: `tasks/notes/20260718-2239-lsc-06-operation-readiness-evaluator.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Edit, Stop, and ship each compute their own readiness today (audit LOOP-02:
one `blocked` boolean conflates "unsafe to edit", "unsafe to stop", and "not
ready to ship"; Stop has independent block emitters; the ship envelope has
its own gate ordering). LSC-07 and LSC-08 will cut those consumers over —
but only if one typed readiness authority exists first. The frozen
characterization records `missing_semantic_fields` (allowedToEdit /
allowedToStop / readyToShip / requirements / nextAction) across all nine
cells; this row establishes the module those fields come from. Two LSC-02
advisories also land here: `resolve()`'s risk/policy raise inputs are
fail-open for unknown values, and no fixture covers a combined risk+policy
raise.

## Goal

Establish one pure `evaluateReadiness` returning exactly the row's five
surfaces — `allowedToEdit`, `allowedToStop`, `readyToShip`, `requirements`,
`nextAction` — whose semantics implement the frozen approved target deltas
for all nine Lite/Standard/Strict x edit/stop/ship cells, backed by 9-cell
positive/negative fixtures. Harden `ArtifactRequirementPolicy.resolve` to
reject unknown `risk`/`policy.require` values and cover the combined
risk+policy raise. No consumer is switched (LSC-07 owns Stop, LSC-08 owns
adapter parity); no adapter grows new readiness math.

## Scope

- In scope:
  - New pure module `src/core/workflow/operation-readiness.ts`:
    `evaluateReadiness(input)` consuming {profile, per-operation requirement
    decisions from `ArtifactRequirementPolicy.resolve` (edit/stop/ship), and
    observed artifact/evidence facts (contract present, isolated worktree,
    review/external-acceptance/checks freshness statuses, hard blockers)}.
    Result exposes exactly: `allowedToEdit`, `allowedToStop`, `readyToShip`
    (each a typed decision with typed reasons — e.g.
    `required_contract_missing`, `required_worktree_missing` per the frozen
    strict.edit delta), `requirements` (the per-operation requirement
    decisions with satisfied/missing status), and `nextAction` (typed, may be
    null). Semantics per the frozen deltas: allowedToStop is independent of
    readyToShip; an unrequired review/external acceptance can never block
    Stop; strict.stop reports readyToShip=false without a Stop block;
    standard.ship defaults separate_contract/external_acceptance to
    not_required with risk/policy raise; strict.ship requires the full
    six-key envelope. No fs/process/env/network; imports only from
    `./profile` and `./artifact-requirement-policy` types/functions. Unknown
    inputs rejected, not defaulted. The audit's extra fields (allowedToPlan,
    allowedToVerify) are NOT in the row acceptance — do not add them.
  - `src/core/workflow/artifact-requirement-policy.ts` (advisory a): validate
    `risk` (must be a known WorkflowProfile) and every `policy.require` key
    (must be a known ArtifactRequirementKey) with rejection results, matching
    the existing profile/operation rejection style; update the stale
    docstring line "No consumer imports this module yet" to reflect the
    LSC-03 consumer. No other behavior change.
  - Fixtures/tests:
    - New `tests/state/fixtures/loop-semantics/operation-readiness.json`
      (same `{schema, positive_cases, negative_cases}` convention as the
      LSC-02 fixture, in the `loop-semantics/` subdirectory): positive cases
      keyed to the nine characterization cell names; negative cases covering
      requirement-unsatisfied variants, the allowed-to-stop-but-not-ready-
      to-ship distinction, and invalid input rejection.
    - New `tests/state/operation-readiness.test.ts`, fixture-driven with a
      nine-cell totality guard.
    - `tests/state/fixtures/loop-semantics/artifact-requirement-policy.json`
      + `tests/state/artifact-requirement-policy.test.ts` (advisory b):
      combined risk+policy same-key raise case (pinning `raisedBy`
      ordering) and rejection cases for unknown risk / unknown policy key.
  - Pin `LSC-06 Execution Base` in the sprint header per successor rule.
  - Notes: per-cell delta -> readiness-semantics derivation table; which
    deltas remain for LSC-07 (Stop cutover: install-fallback/mtime/cache
    removal) and LSC-08 (parity); the two advisories closed here.
- Out of scope:
  - Switching ANY consumer: `projectEffectiveState`, hooks
    (pre-edit-guard/stop-orchestrator), `scripts/verify-sprint.sh`, CLI/MCP
    adapters. Zero production imports of the new module in this package.
  - New `EffectiveStateV1` fields or adapter surface changes (LSC-08).
  - Stop semantics changes (LSC-07): install-profile fallback, mtime
    freshness, cache-as-authority all stay untouched.
  - The frozen characterization fixture/test — must pass UNMODIFIED
    (`missing_semantic_fields` records describe the still-unswitched
    surfaces; establishing the module does not change them).
  - ESA goldens, hooks, assets, scripts, installer, Skill surfaces;
    compatibility shims or dual readiness authorities.
- Taste constraints: one evaluator, one literal decision path per operation;
  the evaluator consumes `resolve()` decisions — it must not re-derive the
  requirement matrix; typed reason vocabulary comes from the frozen deltas,
  not invented.

## Stop Conditions

- Stop and hand back if the change would require editing a path outside
  Allowed Paths.
- Stop if the frozen characterization test or any ESA golden fails.
- Stop if a cell's readiness semantics cannot be derived from its frozen
  `approved_target_delta` plus the requirement matrix — do not invent.
- Stop if implementing a delta would require touching a consumer surface.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The single-authority direction is falsified if any of the nine cells needs
consumer-specific context (hook state, CLI flags, script internals) beyond
{profile, requirement decisions, observed artifact/evidence facts} to
reproduce its frozen target delta. Cheapest proof: implement
strict.stop.not-ready-to-ship-still-allows first — it exercises the
allowedToStop/readyToShip split AND evidence observations; if it needs more
input than the signature provides, stop.

## Root Cause Evidence

Not applicable: this is a `code-change` establishment package, not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md` (LOOP-02:304-344, LoopEventResult:1274-1298, worked examples:1437-1483, row:1580)
- Source sprint: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md` (row 6)
- Delta authority: `tests/state/fixtures/loop-semantics/characterization.json` (all nine cells' approved_target_delta + missing_semantic_fields)
- Requirement authority: `src/core/workflow/artifact-requirement-policy.ts`
- Active plan: `plans/plan-20260718-2239-lsc-06-operation-readiness-evaluator.md`
- Review file: `tasks/reviews/20260718-2239-lsc-06-operation-readiness-evaluator.review.md`
- Notes file: `tasks/notes/20260718-2239-lsc-06-operation-readiness-evaluator.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `df3226dd` / `codex/lsc-06-operation-readiness-evaluator` /
  `/Users/kito/Projects/repo-harness-loop-control-wt-lsc-06-operation-readiness-evaluator`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260718-2239-lsc-06-operation-readiness-evaluator.md
  - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260718-2239-lsc-06-operation-readiness-evaluator.contract.md
  - tasks/reviews/20260718-2239-lsc-06-operation-readiness-evaluator.review.md
  - tasks/notes/20260718-2239-lsc-06-operation-readiness-evaluator.notes.md
  - src/core/workflow/operation-readiness.ts
  - src/core/workflow/artifact-requirement-policy.ts
  - tests/state/operation-readiness.test.ts
  - tests/state/artifact-requirement-policy.test.ts
  - tests/state/fixtures/loop-semantics/operation-readiness.json
  - tests/state/fixtures/loop-semantics/artifact-requirement-policy.json
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
      purpose: delta_and_shape_archaeology
    worker:
      mode: edit_within_allowed_paths
      purpose: pure_readiness_evaluator_and_fixtures
    verifier:
      mode: read_only
      purpose: exit_criteria_and_delta_fidelity_review
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
    - plans/plan-20260718-2239-lsc-06-operation-readiness-evaluator.md
    - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
    - tasks/contracts/20260718-2239-lsc-06-operation-readiness-evaluator.contract.md
    - tasks/reviews/20260718-2239-lsc-06-operation-readiness-evaluator.review.md
    - tasks/notes/20260718-2239-lsc-06-operation-readiness-evaluator.notes.md
    - src/core/workflow/operation-readiness.ts
    - tests/state/operation-readiness.test.ts
    - tests/state/fixtures/loop-semantics/operation-readiness.json
  artifacts_exist:
    - tasks/reviews/20260718-2239-lsc-06-operation-readiness-evaluator.review.md
    - tasks/notes/20260718-2239-lsc-06-operation-readiness-evaluator.notes.md
  tests_pass:
    - path: tests/state/operation-readiness.test.ts
    - path: tests/state/artifact-requirement-policy.test.ts
  commands_succeed:
    - bun test tests/state/operation-readiness.test.ts tests/state/artifact-requirement-policy.test.ts
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
    - "Module is pure; no production file imports operation-readiness.ts (grep shows only the module and its test)"
    - "All nine cells' readiness outputs derive from frozen deltas + the requirement matrix; typed reason vocabulary matches the deltas (required_contract_missing, required_worktree_missing, ...)"
    - "allowedToStop independent of readyToShip; unrequired review/external acceptance never blocks Stop; strict.stop shows readyToShip=false with allowedToStop=allow"
    - "resolve() now rejects unknown risk and unknown policy.require keys; combined risk+policy same-key raise pinned with raisedBy ordering"
    - "Frozen characterization fixture/test and all ESA goldens pass unmodified"
    - "Final diff contains only Allowed Paths"
    - "Fresh task review and independent external acceptance both pass for the frozen subject"
```

## Acceptance Notes (Human Review)

- Functional behavior: additive module + hardened policy validation; zero
  behavior change on any existing surface (full suite must pass with no
  golden/fixture edits outside the two policy-fixture files).
- Edge cases: stop-allowed-but-not-ready-to-ship; strict fail-closed edit
  reasons; ship requirement raising; unknown risk/policy inputs; empty
  observations (fail closed, not defaulted).
- Regression risks: evaluator re-deriving the matrix; inventing reason
  vocabulary; accidentally importing the module into a consumer;
  over-reaching into LSC-07 Stop semantics.

## Rollback Point

- Commit / checkpoint: `df3226dd`.
- Revert strategy: revert the independent LSC-06 PR; both modules return to
  prior state; no consumer depends on the evaluator, so the revert is
  behavior-inert (the resolve() validation hardening also reverts cleanly).
