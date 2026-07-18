# Implementation Notes: lsc-03-standard-contract-semantic-cutover

> **Status**: Active
> **Plan**: plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md
> **Contract**: tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md
> **Review**: tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md
> **Last Updated**: 2026-07-18 16:40
> **Lifecycle**: notes

## Design Decisions

- `projectEffectiveState` (`src/core/state/project-effective-state.ts`) now
  decides the `missing_contract` blocker by consulting
  `resolve({ profile, operation: 'edit' })` from
  `src/core/workflow/artifact-requirement-policy.ts`, inside the existing
  `planPath && (approved|executing) && !contractText` gate:
  `workflowProfile` (`riskResolution.ok ? riskResolution.profile : null`) is
  hoisted above the blockers block (previously computed after it) so both the
  new decision and the existing `guidance`/`workflow_profile` fields share one
  computation. When `workflowProfile` is non-null, the resolved cell's
  `separate_contract` requirement entry determines the push: `status ===
  'required'` (Strict) keeps pushing; `not_required` (Standard) or an absent
  entry (Lite has none) does not push. `workflowProfile === null` (unresolved
  risk) and a `resolve()` error result (`ok:false`, which cannot actually
  occur for a valid `WorkflowProfile` today but is handled for totality) both
  fail closed to `true`. `CEREMONY_GUIDANCE` (lines 19-23) is untouched.
  No local copy of the matrix; one call site; no branch inside the policy
  module.
- Verified the full decision matrix with a disposable pure-function script
  (not the flaky subprocess characterization) calling `projectEffectiveState`
  directly: Strict approved/executing without a contract still blocks; Standard
  approved without a contract now allows (`blockers: []`, `phase: 'approved'`,
  not `'blocked'`); Lite approved without a contract allows; an unresolvable
  profile (`riskResolution.ok: false`) still fails closed; Standard/Strict with
  a contract present is unaffected (pre-existing `!contractText` gate,
  untouched).
- `resolve-effective-state.ts` needed zero changes: `riskResolution` (the
  `WorkflowProfileResult` from `resolveWorkflowProfile`) was already threaded
  into `projectEffectiveState`'s input at the existing call site — the profile
  was already available at the decision point.
- `tests/effective-state.test.ts:248-256` ('blocks approved or executing work
  when its contract is missing') implicitly exercised Standard (its default
  fixture risk input resolves `workflow_profile: 'standard'`, per the test's
  own pre-existing comment). Re-anchored to Strict explicitly
  (`explicitOverride: 'strict'`) rather than repurposed to assert the new
  Standard-allows outcome under the old name, since the name's claim ("blocks
  ... when its contract is missing") is still exactly true of Strict and
  would be misleading applied to Standard post-cutover. Added three siblings
  immediately after it for the other three matrix corners: Standard allows,
  Lite allows (absent-entry path, not Standard's not_required-entry path),
  and unresolvable-profile fails closed.
- The `--field` suppression test (`:410-428`) relied on the old unconditional
  `missing_contract` to exercise "a blocker fires while `workflow_profile`
  itself still resolves a real value" — updated both the direct
  `resolveFixtureState` call and the CLI `spawnSync` args to pass
  `--profile strict` / `explicitOverride: 'strict'`, so the same suppression
  behavior is still genuinely exercised (`src/cli/commands/state.ts:95`'s
  `--profile <profile>` option maps 1:1 to `explicitOverride`).
- `tests/state/project-effective-state.test.ts:145-166` and
  `tests/cli/state-command.test.ts:106-123` needed no edits: the former's
  synthetic `riskResolution` is `ok: false` (unresolvable), which still
  fails closed under the new rule (unchanged expectation, confirmed by the
  unmodified test still passing); the latter constructs a fully synthetic
  `EffectiveState` with `blockers: ['missing_contract']` to test CLI
  plumbing (`resolveStateCommand`) directly, never calling
  `projectEffectiveState`/`resolveWorkflowProfile`, so it is structurally
  unaffected by this package.
- Engineering note on the "unresolvable profile" integration test: an empty
  `risk: {}` input does NOT reach `resolveWorkflowProfile`'s "signals
  unavailable" branch inside `withRepo`'s fixture, because `rmSync(CONTRACT)`
  is an uncommitted working-tree change and `resolveEffectiveStateUnlocked`'s
  review-subject git-diff scan (`buildReviewSubject` against `main`) picks up
  the deleted contract path as a non-empty raw diff regardless of the
  workflow-surface filter used for risk *counting* — that alone makes
  `capabilityCount` resolve to a defined `0` instead of `undefined`, which
  bypasses the "signals unavailable" branch entirely and resolves a
  definite `lite` profile instead of an error (confirmed by an initial failed
  test run: `workflow_profile: 'lite'`, not `null`, as first written). Used
  `PROFILE_BELOW_RISK_FLOOR` instead (`explicitOverride: 'lite'` against
  real `operationKind: 'feature'` signals that compute a Standard floor) —
  reliable, uses real signals, and is an equally valid `riskResolution.ok:
  false` case for "unresolvable profile fails closed."

## Migration Note (Sprint DoD)

- Profile: `standard`. Operation: `edit`.
- Before: any approved/executing plan without a separate `tasks/contracts/*`
  file pushed `missing_contract` into `EffectiveState.blockers`
  unconditionally, for every workflow profile. In PreEdit, this collapsed
  into `.ai/hooks/pre-edit-guard.sh`'s generic
  `[WorkflowProfileGuard] Unable to resolve a deterministic workflow profile`
  (exit 2) — CLI `state resolve`'s exit code is the guard's sole block/allow
  signal, and it treats ANY non-empty `blockers` array as "profile
  unresolved," regardless of which blocker fired.
- After: the same state now depends on `ArtifactRequirementPolicy.resolve({
  profile, operation: 'edit' }).requirements` for the `separate_contract`
  key. Standard's cell marks it `not_required` by default -> `missing_contract`
  no longer pushes -> `blockers` is empty for that reason -> PreEdit's
  `state resolve` exits 0 -> the `WorkflowProfileGuard` collapse does not
  fire, derivatively, with zero hook-file edits. Strict's cell marks it
  `required` unconditionally -> unchanged, still blocks, still collapses into
  `WorkflowProfileGuard` exactly as before. An unresolvable profile
  (`riskResolution.ok: false`, e.g. `PROFILE_BELOW_RISK_FLOOR` or "signals
  unavailable") still fails closed and pushes `missing_contract`, same as an
  unresolvable profile already failed the CLI's exit code before this
  package (via the separate `workflow_profile:<code>` blocker it also pushes).
- Migration: no compatibility path or dual authority. Any Standard
  work-package that was relying on a redundant contract file purely to avoid
  the old collapse can now drop it (and gets zero-ceremony edit as
  `CEREMONY_GUIDANCE` already promised); nothing observes the old
  unconditional behavior that needs a deprecation window, since this is a
  policy-projection change, not a stored-data schema change.

## External Skill Guidance Surface

- `~/.codex/skills/repo-harness/SKILL.md:23` is runtime-referenced by Codex,
  not vendored into this repo (per root `CLAUDE.md`: "Waza is Codex-first:
  `~/.codex/skills` is the Codex runtime source"). It is NOT part of this
  package's diff. The repo-side authority this package converges
  (`CEREMONY_GUIDANCE` text vs. actual `missing_contract` behavior) is the
  deliverable; the external Skill surface reads from the same converged
  repo-side truth at runtime and needed no separate edit here.

## Pre-Existing Flake Observation (Out of Scope)

- `lite.edit.no-plan-contract-allows` (the FIRST cell captured by
  `tests/state/loop-semantics-characterization.test.ts`) failed once in 3
  baseline runs taken BEFORE any code change in this package (`bun test
  tests/state/loop-semantics-characterization.test.ts`, unmodified worktree
  at `3c9cf80a`): `workflow_profile: null`, `verdict: 'block'`, `reason:
  'WorkflowProfileGuard'`, `exit_code: 2`, `work_package_status: 'Executing'`
  where `allow`/`lite`/`0` was expected. Two immediate re-runs (identical
  fixture setup, zero code changes in between) passed cleanly. This is
  unrelated to `missing_contract`/`separate_contract` (Lite's edit fixture
  removes the active-plan marker entirely, so this package's change to the
  `planPath && ...` gate cannot fire for it) and unrelated to any file this
  package touches. Not chased or fixed here, per instruction — recorded as a
  pre-existing, environment-sensitive flake in the characterization
  fixture/hook subprocess harness for whoever next touches that surface.

## Round 2 Authorization & Golden Regeneration (Resolved)

Both round-1 blockers were re-authorized in the contract (Scope "EXTENDED
(decision 2026-07-18, round 2)" bullets, Stop Conditions, `allowed_paths`,
`manual_checks`) and executed exactly as scoped:

- **Blocker 1 — `tests/state/loop-semantics-characterization.test.ts:866-880`**:
  edited EXACTLY the hardcoded `standard.edit` `current` literal —
  `verdict: 'block' -> 'allow'`, added `exit_code: 0`, `reason:
  'WorkflowProfileGuard' -> 'none'`, `state_blockers: ['missing_contract'] ->
  []`. `git diff` on the test file shows only these 4 lines changed (3
  modified, 1 added inside the same object); every `TARGET_DELTAS` literal
  and every other line is byte-identical (verified: `git diff
  tests/state/loop-semantics-characterization.test.ts` shows a single hunk at
  lines 866-880, nothing else in the file touched).
- **Blocker 1 regeneration**: `UPDATE_LOOP_SEMANTICS_GOLDEN=1 bun test
  tests/state/loop-semantics-characterization.test.ts` — 1 pass. JSON diff
  (`tests/state/fixtures/loop-semantics/characterization.json`), field-level:
  only `cells[standard.edit].current.{exit_code, verdict, reason,
  state_blockers, guard_tokens, structured_error}` (all direct/downstream
  readouts of the same PreEdit-guard-collapse flip) and `current.side_effects`
  (drops `.ai/harness/failures/latest.jsonl` — the guard no longer writes a
  failure log because it no longer fires). No `approved_target_delta` byte,
  no `post_esa_program_baseline`/`lsc_01_execution_base`/`esa_golden_baseline`
  byte, no other cell touched (`git diff --stat`: 1 file, 6 insertions(+), 11
  deletions(-), confirmed by grepping the diff for
  `approved_target_delta|baseline|target_delta`: no matches).
- **Blocker 2 — `tests/state/fixtures/missing-contract.json`**: regenerated
  via `UPDATE_EFFECTIVE_STATE_GOLDENS=1 bun test
  tests/state/cli-state-golden.test.ts -t "missing-contract"` (name-filtered
  to exactly that one scenario — "1 pass, 12 filtered out" — so no other
  golden in that file's 13-scenario suite was touched). Field-level diff:
  `cli_exit` (1 -> 0), `field.exit` (1 -> 0), `field.stdout` ('' -> 'standard\n',
  the previously-suppressed value now prints because blockers is empty),
  `state.phase` ('blocked' -> 'executing'), `state.next_action` ('resolve
  blockers' -> 'implement resolver'), `state.blockers` (['missing_contract']
  -> []) — exactly the approved flip and its directly-downstream fields, per
  the authorization. `tests/state/cli-state-golden.test.ts` itself: `git
  status --short` / `git diff --stat` both empty — untouched.
- **Ordering correction (not a regression)**: `characterization.json`'s
  `esa_goldens` array embeds a live cross-reference to `missing-contract.json`
  (`esaGolden()` reads that file's bytes directly: `source_sha256`,
  `cli_exit`, `blockers`, `workflow_profile`). Running Blocker 1's
  regeneration BEFORE Blocker 2 left `characterization.json` holding a stale
  snapshot of the pre-Blocker-2 `missing-contract.json`, which surfaced as a
  second failure at the final `expect(actual).toEqual(expected)` (line 940)
  showing `esa_goldens[missing-contract].{blockers, cli_exit, source_sha256}`
  out of sync. Re-ran Blocker 1's regeneration a second time (after Blocker 2
  was already in its final state); the resulting diff added exactly the
  `esa_goldens[missing-contract]` entry's 3 fields to the same, still
  delta-shaped diff (confirmed clean by the same
  `approved_target_delta|baseline|target_delta` grep, still zero matches).
  This is the same approved flip expressed through a second, cross-file
  reference — not independent drift — and both goldens are now mutually
  consistent.
- Final state: `tests/state/loop-semantics-characterization.test.ts` passes
  3/3 consecutive deterministic runs; `tests/state/cli-state-golden.test.ts`
  passes all 13 scenarios; full `bun test` is 1635 pass / 1 skip / 0 fail.

## Deviations From Plan Or Spec

- None outstanding. The three named test-file updates
  (`tests/effective-state.test.ts`; the other two needed no edits, see
  Design Decisions), the sprint header pin, both golden regenerations, and
  this notes record are complete. Round 1 left two blockers open pending
  orchestrator authorization; round 2 authorized and closed both (see Round 2
  section above).

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Pass `risk`/`policy` overrides into `resolve()` | Not passed | Contract and Falsifier both specify `resolve({ profile, operation: 'edit' })` with only those two fields; no risk/policy raise signal is available or requested at this call site |
| Hoist `workflowProfile` above `blockers` vs. compute a second local copy | Hoisted, removed the old duplicate declaration after `blockers` | One computation, matches "no local copy/re-derivation" taste constraint in spirit, avoids two divergent-looking sources of the same value |
| Repurpose `tests/effective-state.test.ts:248-256` to assert Standard-allows under its old name vs. re-anchor to Strict and add new siblings | Re-anchored to Strict, added 3 new tests | Keeps the existing test's name honest; makes all four matrix corners explicit and independently readable instead of one test silently changing what it proves |
| `risk: {}` vs. `explicitOverride: 'lite'` below a Standard floor, to exercise "unresolvable profile" in the integration-level test | `explicitOverride: 'lite'` below floor (`PROFILE_BELOW_RISK_FLOOR`) | `risk: {}` does not actually reach `ok: false` in this fixture (see Design Decisions engineering note) — confirmed by a failing first attempt, not assumed |

## Open Questions

- None outstanding. Both round-1 blockers (the hardcoded
  `tests/state/loop-semantics-characterization.test.ts:866-880` literal, and
  `tests/state/fixtures/missing-contract.json`) were authorized in round 2
  and resolved — see "Round 2 Authorization & Golden Regeneration" above.
- The `standard.edit` cell's `approved_target_delta` field
  (`{ verdict: 'allow', missing_requirements: [] }`, asserted separately at
  test line 881-884) passed unmodified throughout and was untouched by any of
  this — it is a different field from `current` and was never in question.
- Confirmed this is not a wider blast-radius problem beyond the two golden
  systems: two more files reference `missing_contract` but are outside
  `allowed_paths` (`tests/runtime-profile-enforcement.test.ts`,
  `tests/cli/prompt-guard-decision.test.ts`) — both still pass unmodified
  (`bun test` on the two: 29 pass, 0 fail), and the full suite is now 0 fail.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
