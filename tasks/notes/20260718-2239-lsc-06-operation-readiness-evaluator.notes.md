# Implementation Notes: lsc-06-operation-readiness-evaluator

> **Status**: Active
> **Plan**: plans/plan-20260718-2239-lsc-06-operation-readiness-evaluator.md
> **Contract**: tasks/contracts/20260718-2239-lsc-06-operation-readiness-evaluator.contract.md
> **Review**: tasks/reviews/20260718-2239-lsc-06-operation-readiness-evaluator.review.md
> **Last Updated**: 2026-07-18 23:10
> **Lifecycle**: notes

## Design Decisions

### Input shape: why `operation` is a field even though all three gates are always computed

`evaluateReadiness` always computes `allowedToEdit`, `allowedToStop`, and
`readyToShip` together from one `{profile, requirements: {edit, stop, ship},
evidence}` input -- this is required, not optional, because the falsifier
cell (`strict.stop.not-ready-to-ship-still-allows`) needs `allowedToStop` and
`readyToShip` from the *same* evaluation simultaneously (a Stop consumer
reads both off one result instead of calling the evaluator twice). `nextAction`
is the one field that cannot be a pure function of the three decisions alone:
`lite.ship.no-profile-readiness` (`readyToShip=block`) must surface
`run_targeted_verification` as `nextAction`, while
`strict.stop.not-ready-to-ship-still-allows` (`readyToShip` *also* block, same
shape) must leave `nextAction=null`. The only way to reproduce both from one
function is an explicit `operation` selector that scopes which gate's
remediation action -- if any -- becomes `nextAction`; `allowedToEdit`,
`allowedToStop`, `readyToShip`, and `requirements` are unaffected by it. This
is the one deliberate extension beyond the contract's literal input list
(`profile`, per-operation requirement decisions, evidence); it is load-bearing
for the falsifier cell, documented in the module docstring, and does not
change what `resolve()` computes.

### Per-cell derivation table

Each row derives the cell's `evaluateReadiness` output from its frozen
`approved_target_delta` (`tests/state/fixtures/loop-semantics/characterization.json`)
plus the already-frozen `ARTIFACT_REQUIREMENT_MATRIX` cell for that
profile x operation. "Missing (evidence)" is the fixture's deliberate
evidence gap that reproduces the delta's `missing_requirements`.

| Cell | Delta verdict / next_action | requirements.<op> (from resolve()) | Missing (evidence) | allowedToEdit | allowedToStop | readyToShip | nextAction |
|---|---|---|---|---|---|---|---|
| `lite.edit.no-plan-contract-allows` | allow / `edit` | safe_path, worktree_boundary, destructive_action_boundary (all required) | none | allow | allow | allow | null (next_action == operation) |
| `standard.edit.complete-work-package-no-contract-blocks` | allow / `edit` | complete_approved_work_package (required), separate_contract (not_required) | none | allow | allow | allow | null |
| `strict.edit.missing-contract-blocks` | block / `create_contract_worktree` | separate_contract, isolated_contract_worktree (both required) | separate_contract, isolated_contract_worktree | block: `required_contract_missing`, `required_worktree_missing` | allow | block (ship needs the same two keys): same two reasons | `create_contract_worktree` |
| `lite.stop.handoff-only-allows` | allow / `stop` | durable_recovery_state (required) | none | allow | allow | allow | null |
| `standard.stop.stale-review-warns-allows` | allow / `stop` | durable_recovery_state (required) | `fresh_review` marked stale in evidence (deliberately, to prove it) | allow | allow | allow -- `fresh_review` is not a key in *any* Standard cell, so a stale review cannot affect a Standard decision by construction | null |
| `strict.stop.not-ready-to-ship-still-allows` (falsifier cell) | allow / `stop`, but `missing_requirements: [fresh_review, external_acceptance, fresh_checks]` | stop: durable_recovery_state (required); ship: 6-key strict envelope | fresh_review, external_acceptance, fresh_checks (contract/worktree/candidate-revision present) | allow (contract+worktree present) | allow | block: `required_review_missing`, `required_external_acceptance_missing`, `required_checks_missing` | **null** -- `operation=stop`, and `allowedToStop=allow`, so ship's gaps never surface here |
| `lite.ship.no-profile-readiness` | block / `run_targeted_verification` | subject_bound_targeted_evidence (required) | subject_bound_targeted_evidence | allow | allow | block: `required_evidence_missing` | `run_targeted_verification` |
| `standard.ship.full-strict-envelope-required` | conditional_allow / `run_targeted_verification` | complete_approved_work_package (required), subject_bound_targeted_evidence (required), separate_contract + external_acceptance (not_required) | subject_bound_targeted_evidence | allow | allow | block: `required_evidence_missing` | `run_targeted_verification` |
| `strict.ship.full-envelope-fragmented` | block / `complete_strict_acceptance` | 6-key strict envelope | fresh_review, external_acceptance, fresh_checks | allow (contract+worktree present) | allow | block: `required_review_missing`, `required_external_acceptance_missing`, `required_checks_missing` | `complete_strict_acceptance` |

Two derivation points worth naming explicitly (not deltas, but direct,
unavoidable consequences of consuming `resolve()` per-operation rather than
re-deriving the matrix):

- `strict.edit.missing-contract-blocks`'s evidence (no contract, no isolated
  worktree) makes `readyToShip` block too, because Strict's ship cell shares
  those same two keys. This is not invented behavior -- it is what "one
  evaluator, one evidence snapshot, three projections" necessarily produces,
  and it is a positive validation that the design does not duplicate
  bookkeeping per operation.
- `strict.stop.not-ready-to-ship-still-allows` and
  `strict.ship.full-envelope-fragmented` use the *same* evidence (same
  underlying repository state); they differ only in `operation`
  (`stop` vs `ship`), which is exactly the contrast the falsifier cell exists
  to prove.

### Typed reason vocabulary (`OperationReadinessMissingReasonCode`)

The frozen deltas name exactly two reason-code strings verbatim:
`required_contract_missing` and `required_worktree_missing`
(`strict.edit.missing-contract-blocks`'s `behavior_changes`). Every other
`ArtifactRequirementKey` extends that same `required_<noun>_missing` pattern
via a total, compile-time-checked `Record<ArtifactRequirementKey, ...>`
(`REASON_FOR_KEY` in `operation-readiness.ts`) -- not a new naming scheme, the
same one applied uniformly so every key has exactly one deterministic reason.
`hard_blocker_present` is the one reason not tied to a requirement key,
covering the caller-observed "hard blocker" evidence fact named in the
contract's input list.

### Typed next-action vocabulary (`OperationReadinessNextAction`)

Closed to the three non-null `next_action` values the nine deltas actually
name: `create_contract_worktree`, `run_targeted_verification`,
`complete_strict_acceptance`. `KEY_REMEDIATION` maps only the keys a frozen
delta ties to one of those three actions (separate_contract /
isolated_contract_worktree -> `create_contract_worktree`;
subject_bound_targeted_evidence -> `run_targeted_verification`; fresh_review /
external_acceptance / fresh_checks / candidate_revision_precondition ->
`complete_strict_acceptance`, since those four keys only ever co-occur in
Strict's ship envelope). `nextActionFor()` returns the first missing key's
action in `resolve()`'s own cell order, or `null` if no missing key has a
known action (exercised by the `lite.edit` negative case: an unsatisfied
`destructive_action_boundary` blocks with a reason but leaves `nextAction`
null, rather than inventing a fourth action). This keeps the vocabulary
exactly as large as the frozen deltas require -- no speculative fourth action.

### Evidence and hard blockers

`evidence.satisfiedRequirements` is fail-closed: an absent key is NOT
satisfied (never defaulted to satisfied), matching the contract's edge case
"empty observations (fail closed, not defaulted)". `not_required` entries are
always `satisfied=true` regardless of evidence content -- they cannot block
anything, matching "unrequired review/external acceptance can never block
Stop" as a structural consequence rather than a special case.
`evidence.hardBlockers` (non-empty) forces `block` on all three gates
uniformly -- a hard blocker is a genuine safety signal (e.g. an unsafe
in-progress destructive action), not a ceremony gap, so it is deliberately
not scoped to one operation. None of the nine frozen cells exercise it; one
negative fixture case does.

## Deviations From Plan Or Spec

- None. The module's exact field names, error-code set, and helper shapes
  were not specified verbatim by the contract; they were derived from the
  frozen deltas and the existing `ArtifactRequirementPolicy` sibling module's
  own conventions (`ok`-discriminated result union, total compile-time-checked
  key maps, fail-closed unknown-input rejection).

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `nextAction` as a fixed edit>stop>ship priority over the three decisions, no `operation` input | Rejected | Cannot reproduce both `lite.ship` (`nextAction` non-null) and `strict.stop.not-ready-to-ship-still-allows` (`nextAction` null) from the same `(allow, allow, block)` triple; see falsifier discussion above. |
| `nextAction` per-operation object (`{edit, stop, ship}`) instead of one scalar | Rejected | Contract names one singular `nextAction` surface; an operation-scoped scalar reproduces every frozen cell without widening the result shape. |
| Reuse `ArtifactRequirementKey` values directly as reason codes (no separate vocabulary) | Rejected | Does not reproduce the two literal frozen strings (`required_contract_missing` != `separate_contract`, `required_worktree_missing` != `isolated_contract_worktree`). |
| Hard blockers scoped per-operation like `nextAction` | Rejected (kept universal) | No frozen cell exercises hard blockers at all, so nothing constrains the scope; a genuine safety-signal blocker is the more conservative, defensible default across all three gates. |

## Open Questions

- None. The falsifier (`strict.stop.not-ready-to-ship-still-allows`) was
  implemented first per the contract's guidance and reproduced from
  `{profile, requirements.edit/stop/ship, evidence}` alone -- no
  consumer-specific context (hook state, CLI flags, script internals) was
  needed, so the single-authority direction is not falsified.

## Remaining Work for Successors

- **LSC-07 (Stop semantics cutover)**: wire `evaluateReadiness` into
  `.ai/hooks/stop-orchestrator.sh` (or its adapter), remove the
  install-profile fallback, the mtime freshness touch, and cache-as-authority
  reads named in `strict.stop.not-ready-to-ship-still-allows`'s
  `behavior_changes` ("consume canonical state only and remove install-profile
  fallback") -- none of that is implemented here; this package only
  establishes the pure evaluator those consumers will call.
- **LSC-08 (adapter parity + docs)**: CLI/MCP/Hook/Skill parity for profile,
  operation, decision, reason, and readiness on the same fixtures; this
  package adds zero adapter surface (grep confirms no production import of
  `operation-readiness.ts` outside its own test).
- Evidence assembly (turning real repository/state observations into
  `OperationReadinessEvidence.satisfiedRequirements`/`hardBlockers`) is a
  consumer concern for LSC-07/LSC-08, not this package -- this evaluator is
  pure and takes evidence as already-observed facts.

## Advisories Closed

- **Advisory a** (`ArtifactRequirementPolicy.resolve` fail-open on unknown
  `risk`/`policy.require`): `resolve()` now rejects an unknown `risk` (not a
  `WorkflowProfile`) with `INVALID_RISK` and an unknown `policy.require` key
  (not an `ArtifactRequirementKey`) with `INVALID_POLICY_REQUIRE_KEY`, in the
  existing `{ok:false, code, message}` style. `KNOWN_REQUIREMENT_KEYS` is
  derived from `ARTIFACT_REQUIREMENT_MATRIX` itself (every key appears in at
  least one cell), not a hand-maintained duplicate list. The stale
  "No consumer imports this module yet" docstring line now names the LSC-03
  consumer (`projectEffectiveState` in `src/core/state/project-effective-state.ts`).
- **Advisory b** (no fixture for a combined risk+policy raise): two new
  positive cases in `tests/state/fixtures/loop-semantics/artifact-requirement-policy.json`
  pin `raisedBy: ["risk", "policy"]` ordering when both sources raise the same
  key (`standard.edit` with `risk=strict` and `policy.require=[separate_contract]`),
  and confirm sources stay entry-specific when they raise different keys
  (`standard.ship` with `risk=strict` raising `separate_contract` via risk
  only while `external_acceptance` is raised by both). Two more negative
  cases cover the new rejections (`INVALID_RISK`, `INVALID_POLICY_REQUIRE_KEY`).

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- `bun test tests/state/operation-readiness.test.ts tests/state/artifact-requirement-policy.test.ts`: 41 pass, 0 fail (20 + 21 tests).
- `bun test tests/state/loop-semantics-characterization.test.ts`: 1 pass, 0 fail, unmodified.
- `bun run check:type`: clean.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- None yet -- the `operation`-scoped `nextAction` design is durable repo
  knowledge for LSC-07/LSC-08 but belongs in `docs/researches/` only once a
  successor row actually consumes it; recorded here in the meantime.
