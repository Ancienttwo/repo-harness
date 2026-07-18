# Implementation Notes: lsc-02-artifact-requirement-policy

> **Status**: Active
> **Plan**: plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md
> **Contract**: tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md
> **Review**: tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md
> **Last Updated**: 2026-07-18 14:05
> **Lifecycle**: notes

## Design Decisions

### Cell -> target_delta derivation

Each matrix cell's requirement-entry set is exactly the frozen
`target_delta.requirements` array for that cell (the field that names what
is positively required), never `missing_requirements` (a per-captured-
scenario observation of what happened to be unmet, owned by the future
LSC-06 readiness evaluator, not by this policy module). Every entry starts
`defaultStatus: 'required'` unless the cell's `behavior_changes` text names
it as becoming not_required by default (see raise-key table below).

| Matrix cell | Source `target_delta` record (`characterization.json`) | `requirements` -> entries |
|---|---|---|
| `lite.edit` | `lite.edit.no-plan-contract-allows` | `safe_path`, `worktree_boundary`, `destructive_action_boundary` -> all `required` |
| `lite.stop` | `lite.stop.handoff-only-allows` | `durable_recovery_state` -> `required` |
| `lite.ship` | `lite.ship.no-profile-readiness` | `subject_bound_targeted_evidence` -> `required` |
| `standard.edit` | `standard.edit.complete-work-package-no-contract-blocks` | `complete_approved_work_package` -> `required`; `behavior_changes` ("separate_contract becomes not_required by default") adds `separate_contract` -> `not_required` |
| `standard.stop` | `standard.stop.stale-review-warns-allows` | `durable_recovery_state` -> `required` |
| `standard.ship` | `standard.ship.full-strict-envelope-required` | `complete_approved_work_package`, `subject_bound_targeted_evidence` -> `required`; `behavior_changes` ("separate_contract and external_acceptance become not_required by default") adds `separate_contract`, `external_acceptance` -> `not_required` |
| `strict.edit` | `strict.edit.missing-contract-blocks` | `separate_contract`, `isolated_contract_worktree` -> both `required` |
| `strict.stop` | `strict.stop.not-ready-to-ship-still-allows` | `durable_recovery_state` -> `required` |
| `strict.ship` | `strict.ship.full-envelope-fragmented` | `separate_contract`, `isolated_contract_worktree`, `fresh_review`, `external_acceptance`, `fresh_checks`, `candidate_revision_precondition` -> all `required` (the fail-closed full envelope; strict rows carry no raise concept because they are already maximal) |

The 12-member `ArtifactRequirementKey` union is the exact union of every key
appearing in any of the nine `requirements` arrays above; no key was added
that is absent from all nine records.

### Raise-key derivation (risk/policy can promote a not_required entry)

Only two cells carry a `not_required` entry, and both are named explicitly
by the contract's "Key facts" and by the corresponding `behavior_changes`
text -- no other cell's `behavior_changes` was read as implying a raisable
key:

| Cell | Key | `behavior_changes` source text |
|---|---|---|
| `standard.edit` | `separate_contract` | "separate_contract becomes not_required by default" |
| `standard.ship` | `separate_contract` | "separate_contract and external_acceptance become not_required by default" |
| `standard.ship` | `external_acceptance` | "separate_contract and external_acceptance become not_required by default" |

The raise rule itself (risk outranking profile on the lite<standard<strict
scale, or an explicit `policy.require` naming the key) is generic and
consumer-free, satisfying the contract's falsifier: encoding
`standard.edit`/`standard.ship` needed no consumer context, so the
single-matrix-plus-one-raise-rule direction is not falsified.

### Scope decisions not literally spelled out by a single sentence

- **`resolve()` signature has 4 named params, not 5.** The audit's raw
  pseudocode (`plans/sprints/20260715-harness-loop-audit-and-optimization.md:227-233`)
  and the plan's un-calibrated "Captured Planning Output" section both show
  `{ profile, operation, risk, taskKind, policy }`. The calibrated contract's
  own Scope bullet and the plan's calibrated Detailed Design/File Changes
  table both instead write `resolve({ profile, operation, risk, policy })`
  -- `taskKind` is absent from both authoritative (calibrated) sources, and
  no target_delta record varies by task kind. Implemented the 4-param form
  per the calibrated contract; adding an unused `taskKind` parameter not
  backed by any frozen delta would have been exactly the kind of invented,
  unrequested surface the contract's EXECUTION_BOUNDARY forbids.
- **No `isolated_contract_worktree` entry added for Standard.** The audit's
  own pre-freeze recommendation table (lines 238-242) lists Standard's
  Worktree column as "按风险/策略" (risk/policy-dependent), which could be
  read as implying a raisable worktree key at Standard. Neither
  `standard.edit` nor `standard.ship`'s frozen `target_delta` record
  mentions `isolated_contract_worktree` anywhere (not in `requirements`,
  `missing_requirements`, or `behavior_changes`) -- LSC-01's freeze evidently
  did not carry that audit gesture into a concrete per-cell delta. Contract
  language treats the nine frozen deltas as the primary "derive 1:1 from"
  authority and the audit matrix as a secondary permitted-vocabulary check,
  not a mandate to backfill every pre-freeze recommendation; left out to
  avoid inventing a cell/key the frozen data does not instantiate.
- **No `ArtifactRequirementPolicy.resolve(...)` namespace export.** The
  audit's pseudocode shows a namespace-qualified call, but the contract's
  own Scope bullet writes the accessor as plain `resolve({...})`. Exported a
  single top-level `resolve` function (plus the matrix constant and its
  supporting types); did not add a second `ArtifactRequirementPolicy`
  wrapper object, since EXECUTION_BOUNDARY names "exports" explicitly among
  forbidden unrequested extras and a namespace re-export would be exactly
  that with no behavior it adds.
- **`risk` is typed `WorkflowProfile`, not a new enum.** Reuses the imported
  type directly (satisfies "imports only types from `./profile`" with zero
  new risk vocabulary) and gives a generic, rank-based raise rule
  (`risk` outranks `profile`) with no consumer-specific branching.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Model each cell's entries from `target_delta.requirements` only | Use | `requirements` is the field naming what is positively required by policy; `missing_requirements` is a per-scenario observation that belongs to the future LSC-06 readiness evaluator, not this pure policy matrix |
| Add `isolated_contract_worktree` as a not_required/raisable entry for Standard (per the audit's pre-freeze "按风险/策略" worktree gesture) | Reject | No frozen `target_delta` record for `standard.edit`/`standard.ship` names it in any field; adding it would invent a key value the LSC-01 freeze did not instantiate |
| 5-param `resolve({ profile, operation, risk, taskKind, policy })` matching the audit's raw pseudocode | Reject | The calibrated contract's Scope bullet and the plan's calibrated Detailed Design table both omit `taskKind`; no target_delta varies by task kind, so an unused parameter would be invented surface |
| Export both `resolve(...)` and an `ArtifactRequirementPolicy` namespace wrapper | Reject | EXECUTION_BOUNDARY names "exports" explicitly among forbidden unrequested extras; the wrapper adds no behavior over the plain function |

## Open Questions

- None. The two scope narrowings above (4-param signature, no Standard
  worktree key) are resolved by the calibrated contract's own literal text
  and the absence of supporting frozen data, respectively; flagged here for
  the review pass rather than left as unresolved ambiguity.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
