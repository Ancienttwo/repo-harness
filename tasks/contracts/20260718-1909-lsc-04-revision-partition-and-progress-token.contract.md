# Task Contract: lsc-04-revision-partition-and-progress-token

> **Status**: Active
> **Plan**: plans/plan-20260718-1909-lsc-04-revision-partition-and-progress-token.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-18 19:15
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **LSC-04 Execution Base**: `origin/main@a6f6516a` (post-LSC-03 merge PR #85 plus backfill)
> **Review File**: `tasks/reviews/20260718-1909-lsc-04-revision-partition-and-progress-token.review.md`
> **Notes File**: `tasks/notes/20260718-1909-lsc-04-revision-partition-and-progress-token.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Today one `state_revision` hashes authority, subject, evidence, AND
projection files together (`src/effects/state/resolve-effective-state.ts:453-473`),
so a handoff/resume/current-snapshot rewrite alone advances `state_version`,
and the circuit breaker — keyed on `stateVersion`
(`src/cli/hook/circuit-breaker.ts:74-80`, fed from the cache's
`.state_version` at `.ai/hooks/hook-input.sh:596`) — treats projection churn
as progress and re-permits repeat-fix loops (audit LOOP-03/LOOP-08, both
High). Meanwhile `authorityRevision` conflates the review-subject fingerprint
into authority and excludes policy/capabilities. Until the revisions are
partitioned and a progress token exists, every no-progress detector in the
loop rides on a signal that projection rendering can move.

## Goal

Partition the revision space into four typed, separately computed revisions
(authority, subject, evidence, projection), define one `progress_token`
computed from real-progress inputs only, expose all five as additive
`EffectiveStateV1` fields, and cut the circuit breaker over to consuming the
progress token instead of `stateVersion` — so that projection-only rendering
changes neither `authority_revision`, `progress_token`, nor no-progress
detection. `state_version` allocation timing is untouched (LSC-05 owns it).

## Scope

- In scope:
  - `src/effects/state/resolve-effective-state.ts` (and
    `src/effects/state/collect-state-inputs.ts` if source bucketing needs it):
    compute four revisions from the already-collected source hashes:
    - `authority_revision`: active-plan/active-worktree markers, plan,
      contract, policy (`.ai/harness/policy.json`), capability registry
      (`.ai/context/capabilities.json`), active-sprint marker+file, task
      identity. The review-subject fingerprint MOVES OUT of authority (it is
      the subject). One-shot migration note: previously recorded handoff
      "Source State Revision" values go stale once at cutover; no
      compatibility shim.
    - `subject_revision`: the review-subject fingerprint surface
      (`review_subject_sha256` / `target_rev` from the diff-fingerprint
      machinery).
    - `evidence_revision`: checks (`.ai/harness/checks/latest.json`) and the
      review file content, bound to the subject.
    - `projection_revision`: handoff, resume, current-snapshot.
    - `state_revision`/`state_version`: keep existing all-source semantics and
      allocation timing byte-for-byte (LSC-05 owns allocation).
  - `src/core/state/types.ts` + `src/core/state/project-effective-state.ts`:
    additive `EffectiveStateV1` fields `authority_revision`,
    `subject_revision`, `evidence_revision`, `projection_revision`,
    `progress_token` (all strings). The projector stays pure: it receives the
    four revisions as inputs and computes `progress_token` as a content hash
    over exactly the audit's recipe
    (`plans/sprints/20260715-harness-loop-audit-and-optimization.md:834-844`):
    `{subject_revision, completed-task markers derived from the plan text,
    evidence_revision, hard blocker set, allowed_paths coverage}`. No time,
    PID, or projection input may feed it.
  - `src/cli/hook/circuit-breaker.ts`: replace `stateVersion` with
    `progressToken` as the progress discriminator in `CircuitAttempt` and
    `keyFor`; a missing/empty `progressToken` fails closed (key stays stable,
    repeats accumulate, breaker trips sooner — never looser). `fingerprint`
    and the rest of the key fields stay. The fuller LOOP-08 redesign
    (actionClass, oscillation detection, blockerSetHash key) is OUT of scope.
  - `.ai/hooks/hook-input.sh` (`hook_circuit_record`, line ~596): source
    `.progress_token` from the effective-state cache instead of
    `.state_version`, passing it as `progressToken`; mirror the same change
    into `assets/hooks/hook-input.sh` (product source parity). No other hook
    file changes; the five call sites' fingerprints stay as-is.
  - Tests: update `tests/harness-circuit-breakers.test.ts` (stateVersion-reset
    assertions become progress-token semantics; add: projection-only churn
    does NOT reset repeat_count; progress-token change DOES),
    `tests/effective-state.test.ts` (authority scope assertions at :377-431
    and :721-754 re-pinned: policy/registry changes now advance
    `authority_revision`; handoff/resume rewrites advance ONLY
    `projection_revision` and `state_revision`, never authority or
    progress_token), `tests/state/project-effective-state.test.ts`,
    `tests/state/adapter-parity.test.ts` (extend `MCP_COMPACT_FIELDS` /
    `AUTHORITY_FIELDS` / dynamic-hash key sets), `tests/state/cli-state-golden.test.ts`
    dynamic-key set, `tests/cli/state-command.test.ts` and
    `tests/harness-context-budget.test.ts` fixture literals, and
    `tests/hook-runtime.test.ts` only if it pins `hook_circuit_record`
    sourcing.
  - AUTHORIZED UPFRONT: regenerate the ESA state goldens
    (`tests/state/fixtures/*.json`, the flat scenario files) via
    `UPDATE_EFFECTIVE_STATE_GOLDENS=1` so they gain the new
    `sha256:<dynamic:...>` placeholder fields. Verify the diff: only NEW
    field/placeholder lines (and dynamic-hash normalization) may appear; any
    changed pre-existing semantic value (verdict, phase, blockers, exit) is a
    regression — revert and stop.
  - The frozen characterization test must show ZERO semantic drift (no cell
    verdict/reason/exit/blocker/delta change — this row changes no
    edit/stop/ship behavior). AUTHORIZED (decision 2026-07-18, round 2): the
    fixture's `esa_goldens` entries embed content hashes of the ESA golden
    files, so the authorized additive golden regeneration legitimately moves
    exactly those `source_sha256` cross-reference values. Regenerate the
    characterization JSON via `UPDATE_LOOP_SEMANTICS_GOLDEN=1` and verify the
    diff contains ONLY `esa_goldens` hash/cross-reference fields — any cell
    `current` semantic field or `approved_target_delta` byte change is a
    regression: revert and stop. The characterization test file itself stays
    untouched.
  - AUTHORIZED (same decision): editing `assets/hooks/hook-input.sh` makes
    the hook-source projection manifest digest stale; refresh it with the
    sanctioned `bun scripts/sync-hook-sources.ts --write` so
    `tests/hook-source-projection.test.ts` passes. Only
    `.ai/hooks/.projection.json` may change from that command.
  - Pin `LSC-04 Execution Base` in the sprint header per successor rule.
  - Notes: migration note per sprint DoD (authority recomposition one-shot
    staleness; circuit sourcing cutover; fail-closed empty-token rule),
    LOOP-08 remainder explicitly deferred.
- Out of scope:
  - `state_version` allocation timing, stable-snapshot gating, retry
    publication semantics (LSC-05).
  - Readiness evaluator (LSC-06), Stop semantics (LSC-07), adapter parity
    docs row (LSC-08).
  - actionClass/oscillation/blockerSetHash breaker redesign (LOOP-08
    remainder), any rename of existing public fields, routes, tools, or CLI
    commands; `state_revision` semantics.
  - Every hook file except `hook-input.sh` and its assets mirror; installer,
    Skill surfaces, `scripts/`.
  - Compatibility shims, dual revision authorities, fallback token sources.
- Taste constraints: one computation site per revision; the projector must
  not re-hash what effects already hashed — it composes provided hashes. The
  progress token is one deterministic content hash, not a struct.

## Stop Conditions

- Stop and hand back if the change would require editing a path outside
  Allowed Paths.
- Stop if the regenerated characterization fixture changes anything beyond
  `esa_goldens` hash/cross-reference fields, or if hook-source sync touches
  any file other than `.ai/hooks/.projection.json`.
- Stop if any regenerated ESA golden changes a pre-existing semantic value.
- Stop if `state_version` allocation code would need modification.
- Stop if the progress token cannot be computed without projection inputs.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The partition direction is falsified if any consumer needs a revision that
mixes buckets (e.g. freshness that requires authority+projection in one
hash) — that would mean the four-way split is the wrong cut. Cheapest proof:
implement the revision computation and re-pin the two effective-state tests
(:377-431, :721-754) first; if their assertions cannot be expressed against
single-bucket revisions, stop.

## Root Cause Evidence

Not applicable: this is a `code-change` semantic-cutover package, not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md` (LOOP-03:348-454, LOOP-08:798-885)
- Source sprint: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md` (row 4)
- Active plan: `plans/plan-20260718-1909-lsc-04-revision-partition-and-progress-token.md`
- Review file: `tasks/reviews/20260718-1909-lsc-04-revision-partition-and-progress-token.review.md`
- Notes file: `tasks/notes/20260718-1909-lsc-04-revision-partition-and-progress-token.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `a6f6516a` / `codex/lsc-04-revision-partition-and-progress-token` /
  `/Users/kito/Projects/repo-harness-loop-control-wt-lsc-04-revision-partition-and-progress-token`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260718-1909-lsc-04-revision-partition-and-progress-token.md
  - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260718-1909-lsc-04-revision-partition-and-progress-token.contract.md
  - tasks/reviews/20260718-1909-lsc-04-revision-partition-and-progress-token.review.md
  - tasks/notes/20260718-1909-lsc-04-revision-partition-and-progress-token.notes.md
  - src/core/state/types.ts
  - src/core/state/project-effective-state.ts
  - src/effects/state/resolve-effective-state.ts
  - src/effects/state/collect-state-inputs.ts
  - src/cli/hook/circuit-breaker.ts
  - .ai/hooks/hook-input.sh
  - assets/hooks/hook-input.sh
  - tests/harness-circuit-breakers.test.ts
  - tests/effective-state.test.ts
  - tests/state/project-effective-state.test.ts
  - tests/state/adapter-parity.test.ts
  - tests/state/cli-state-golden.test.ts
  - tests/cli/state-command.test.ts
  - tests/harness-context-budget.test.ts
  - tests/hook-runtime.test.ts
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
  - tests/state/fixtures/loop-semantics/characterization.json
  - .ai/hooks/.projection.json
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
      purpose: revision_surface_archaeology
    worker:
      mode: edit_within_allowed_paths
      purpose: revision_partition_and_breaker_cutover
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
    - plans/plan-20260718-1909-lsc-04-revision-partition-and-progress-token.md
    - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
    - tasks/contracts/20260718-1909-lsc-04-revision-partition-and-progress-token.contract.md
    - tasks/reviews/20260718-1909-lsc-04-revision-partition-and-progress-token.review.md
    - tasks/notes/20260718-1909-lsc-04-revision-partition-and-progress-token.notes.md
  artifacts_exist:
    - tasks/reviews/20260718-1909-lsc-04-revision-partition-and-progress-token.review.md
    - tasks/notes/20260718-1909-lsc-04-revision-partition-and-progress-token.notes.md
  tests_pass:
    - path: tests/harness-circuit-breakers.test.ts
    - path: tests/effective-state.test.ts
    - path: tests/state/adapter-parity.test.ts
    - path: tests/state/cli-state-golden.test.ts
  commands_succeed:
    - bun test tests/harness-circuit-breakers.test.ts tests/effective-state.test.ts tests/state/adapter-parity.test.ts tests/state/cli-state-golden.test.ts tests/state/project-effective-state.test.ts tests/cli/state-command.test.ts tests/harness-context-budget.test.ts tests/hook-runtime.test.ts
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
    - cmp .ai/hooks/hook-input.sh assets/hooks/hook-input.sh
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: code_quality
      min: 8
  manual_checks:
    - "Projection-only invariant test exists and passes: rewriting handoff/resume/current-snapshot changes projection_revision and state_revision only — authority_revision, subject_revision, evidence_revision, progress_token all unchanged, and circuit repeat_count does not reset"
    - "Progress token inputs are exactly the audit recipe; no projection, time, or PID input feeds it"
    - "Circuit breaker fails closed on missing/empty progressToken (never looser)"
    - "authority_revision includes policy/capabilities/sprint and excludes the review-subject fingerprint; one-shot handoff staleness recorded as migration note"
    - "state_version allocation code byte-identical to base"
    - "ESA golden diffs contain only additive new-field/placeholder lines; no pre-existing semantic value changed"
    - "Characterization diff contains only esa_goldens hash/cross-reference fields; all cell semantics and approved_target_delta bytes unchanged; test file untouched; .projection.json refreshed only via sync-hook-sources"
    - ".ai/hooks/hook-input.sh and assets/hooks/hook-input.sh identical (cmp) and no other hook file changed"
    - "Final diff contains only Allowed Paths"
    - "Fresh task review and independent external acceptance both pass for the frozen subject"
```

## Acceptance Notes (Human Review)

- Functional behavior: five additive state fields; breaker consumes progress
  token; projection churn no longer resets repeat counts; everything else
  behaviorally identical.
- Edge cases: empty/missing progress token (fail closed); stale pre-cutover
  handoff recorded revisions (one-shot staleness); policy/capability edits
  now moving authority; plan task-checkbox flips moving the progress token.
- Regression risks: accidentally changing state_version allocation; a golden
  regeneration hiding a semantic drift; hook mirror divergence; the token
  accidentally including projection hashes.

## Rollback Point

- Commit / checkpoint: `a6f6516a`.
- Revert strategy: revert the independent LSC-04 PR; circuit keys return to
  stateVersion sourcing and the additive fields disappear; no persisted
  migration to unwind (state_version store untouched).
