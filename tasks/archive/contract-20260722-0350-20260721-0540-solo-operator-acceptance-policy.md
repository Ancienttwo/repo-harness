# Task Contract: solo-operator-acceptance-policy

> **Status**: Fulfilled
> **Plan**: plans/plan-20260721-0540-solo-operator-acceptance-policy.md
> **Task Profile**: code-change
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-21 05:40
> **Execution Base**: `origin/main@5e10ce8177e832978ad2bd42b49e5ed74e58342c`
> **Review File**: `tasks/reviews/20260721-0540-solo-operator-acceptance-policy.review.md`
> **Notes File**: `tasks/notes/20260721-0540-solo-operator-acceptance-policy.notes.md`

## Why

`tasks/todos.md` records a confirmed, repeated defect: `workflow_external_acceptance_expected_reviewer()`
(`.ai/hooks/lib/workflow-state.sh:1465-1483`) always demands the OPPOSITE
vendor from whoever is running the check (host=claude → wants Codex;
host=codex → wants Claude), so a solo operator with only one vendor's CLI
can never satisfy canonical `external_acceptance` regardless of review
quality. Every HRD row this sprint has waived it (HRD-01 through HRD-07),
and HRD-07 specifically hit this wall from BOTH sides of a two-agent
session (Claude orchestrator + Codex, working the same PR), producing
repeated, user-visible authorization friction the user explicitly asked to
have root-caused. If this ships wrong: either it becomes a silent bypass
(the todos row's own explicit warning) that lets any self-cert satisfy
acceptance, or it stays purely cosmetic and the friction recurs on HRD-08/09
and every future contract in this repo.

## Goal

Add a fail-closed, opt-in `external_acceptance.solo_operator` policy flag
that changes ONLY `workflow_external_acceptance_status()`'s reviewer/source
equality branch: when true, accept a same-vendor review IF AND ONLY IF it
carries a distinct `External Source: solo-operator-adversarial-review`
marker (mutually exclusive with the existing `claude-review`/`codex-review`
values — a lazy self-cert reusing the normal template cannot satisfy it),
a fixed `Solo Operator Acknowledgement` literal, and non-empty, non-equal
`Reviewer Session Identity` / `Implementer Session Identity` fields
(explicitly documented as procedural attestation, not cryptographic proof).
Every other check in the function — subject-hash freshness against
`workflow_current_review_subject_json()`, target-revision binding,
P1-blocker gate, rubric-v2 requirement, benchmark-evidence requirement —
runs unconditionally in both modes, unchanged. Absent, `false`, or a
malformed value for the flag must produce IDENTICAL behavior to today
(cross-vendor path only) — this is the primary regression this contract
must prove did not happen.

## Scope

- In scope:
  - `.ai/harness/policy.json`: new top-level `external_acceptance: { solo_operator: false, rule: "<caveat text>" }` object. Default `false`. The `rule` string must state (a) what solo mode requires, (b) that every existing binding stays enforced, (c) do not enable when both CLIs are available (documentation, not enforcement — policy files in this repo do not self-enforce conditional applicability beyond type/path validation).
  - `assets/hooks/lib/workflow-state.sh`'s `workflow_external_acceptance_status()`: read `.external_acceptance.solo_operator` via the existing `workflow_policy_get` helper; branch the reviewer/source equality checks (today at the two comparisons following the `acceptance_lc != pass` guard) into cross-vendor (unchanged) vs. solo (new, per Goal) — do NOT touch `workflow_external_acceptance_expected_reviewer()` or `workflow_external_acceptance_source_for_reviewer()`; sync the change to `.ai/hooks/lib/workflow-state.sh` via `bun run sync:hooks` in the same package.
  - `assets/templates/review.template.md`: add the three new solo-mode fields to the `## External Acceptance Advice` section as blank/pending placeholders, documented as solo-mode-only.
  - `src/effects/state/resolve-effective-state.ts`'s `validateWorkflowPolicy`: add a boolean-strictness check for `external_acceptance.solo_operator` (present-and-non-boolean throws, matching the existing eager-validation pattern for other policy fields) — closes the confirmed gap where a quoted JSON string `"true"` would otherwise also activate solo mode via `jq -r`'s unquoting.
  - `tests/workflow-state-lib.test.ts`: the 9-fixture matrix in Exit Criteria below.
  - `tasks/todos.md`: mark the "No supported path for solo operators" row resolved once this ships, with a pointer to this contract (this file is NOT in Allowed Paths for code edits, but IS the deferred-goal ledger this row directly closes — update via a separate, unscoped main-branch commit after merge, matching the established pattern from HRD-05/06/07 closeout, not through this branch).
- Out of scope:
  - `.github/workflows/ci.yml` (push+pull_request double-trigger) and any merge-gate wrapper timeout value — explicitly owned by a separate, concurrently-running Codex work-package on the same repo; touching either here would collide.
  - Any change to `workflow_external_acceptance_expected_reviewer()`'s return value, `workflow_external_acceptance_source_for_reviewer()`'s mapping, or the subject-hash computation in `src/effects/review/diff-fingerprint.ts` — all three stay byte-identical.
  - A machine-verifiable (non-attested) proof of reviewer/implementer session independence — investigated and rejected this session as infeasible without a much larger build (a signed reviewer receipt written through a hook under the reviewer's own env run-id); the existing merge-gate SHA-bound receipt already provides the closest real machine-verified boundary at the ship step.
  - Any change to `scripts/ship-worktrees.sh`, `scripts/verify-sprint.sh`, `scripts/contract-worktree.sh`, `scripts/archive-workflow.sh`, or `.ai/hooks/prompt-guard.sh` — all five already call `workflow_external_acceptance_status()`/`_pass()` without duplicating its logic, so the one-function change covers them; do not edit these callers.
- Taste constraints: the two new literal marker strings (`solo-operator-adversarial-review`, the acknowledgement text) are bash constants, not policy-configurable — no speculative flexibility. No compatibility shim; the flag is the whole mechanism.

## Stop Conditions

- Stop if a caller of `workflow_external_acceptance_status()`/`_pass()` is found outside the five enumerated in Out of scope with its own duplicate reviewer/source comparison logic — the single-function-change design would then be incomplete and needs a design revision, not a silent second edit site.
- Stop if the flag being absent/false/malformed produces ANY behavioral difference from pre-change `main` on the cross-vendor path — this is the core regression bar.
- Stop if satisfying solo mode turns out to be possible without authoring all three new fields (i.e., any accidental default or fallback that lets a normal `claude-review`/`codex-review` template pass under solo mode without the new markers).
- Stop after three fail → fix → reverify rounds for the same issue.

## Falsifier

A `.ai/harness/policy.json` with `external_acceptance.solo_operator` absent (or explicitly `false`, or a malformed value like `"yes"`) that still allows a same-vendor review to pass `workflow_external_acceptance_status()` falsifies this contract — cheapest proof point: fixture 1 in Exit Criteria (no-flag, same-vendor review, `HOOK_HOST=claude`, `External Reviewer: Claude` → must return `fail`, unchanged from current `main` behavior).

## Root Cause Evidence

Not applicable: `code-change` policy/mechanism addition, not a bugfix.

## Workflow Inventory

- Deferred-goal ledger: `tasks/todos.md` (the row this closes)
- Review file: `tasks/reviews/20260721-0540-solo-operator-acceptance-policy.review.md`
- Notes file: `tasks/notes/20260721-0540-solo-operator-acceptance-policy.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Base/branch/WT: `5e10ce8177e832978ad2bd42b49e5ed74e58342c` /
  `codex/solo-operator-acceptance-policy` /
  `/Users/kito/Projects/repo-harness-wt-solo-operator-acceptance-policy`
- Design source: independent Opus design-review pass this session (verified against real source: `scripts/ship-worktrees.sh:373`, `scripts/verify-sprint.sh:579`, `scripts/contract-worktree.sh:731-732`, `scripts/archive-workflow.sh:105,129`, `.ai/hooks/prompt-guard.sh:915-916,1283,1290` all confirmed calling `workflow_external_acceptance_status`/`_pass`/`_expected_reviewer`/`_expected_source` with no duplicate logic; single `.ai/harness/policy.json`, no `assets/` mirror, confirmed by direct `find`).
- CLI note: `bun src/cli/index.ts` / `bun test` only.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260721-0540-solo-operator-acceptance-policy.md
  - tasks/contracts/20260721-0540-solo-operator-acceptance-policy.contract.md
  - tasks/reviews/20260721-0540-solo-operator-acceptance-policy.review.md
  - tasks/notes/20260721-0540-solo-operator-acceptance-policy.notes.md
  - .ai/harness/policy.json
  - assets/hooks/lib/workflow-state.sh
  - .ai/hooks/lib/workflow-state.sh
  - assets/templates/review.template.md
  - src/effects/state/resolve-effective-state.ts
  - tests/workflow-state-lib.test.ts
```

## Evidence Requirements

```yaml
evidence_requirements:
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
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_contain:
    - path: .ai/harness/policy.json
      pattern: "solo_operator"
    - path: assets/hooks/lib/workflow-state.sh
      pattern: "solo-operator-adversarial-review"
    - path: .ai/hooks/lib/workflow-state.sh
      pattern: "solo-operator-adversarial-review"
  tests_pass:
    - path: tests/workflow-state-lib.test.ts
  commands_succeed:
    - diff -q assets/hooks/lib/workflow-state.sh .ai/hooks/lib/workflow-state.sh
    - bun run check:hooks
    - bun run check:type
    - bun run check:state-boundaries
  qa_scores:
    - dimension: functionality
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
    - "Fixture 1 (no flag, same-vendor review) still fails exactly as pre-change main — zero regression on the cross-vendor path"
    - "Fixture 2 (flag on, ordinary claude-review/codex-review source) still fails — cannot satisfy solo mode by reusing a normal template"
    - "Fixture 3 (flag on, valid solo markers, stale subject hash) still fails — freshness binding not weakened"
    - "Fixture 4 (flag on, solo source, wrong/missing acknowledgement) fails"
    - "Fixture 5 (flag on, solo source, Reviewer Session Identity == Implementer Session Identity or either missing) fails"
    - "Fixture 6 (flag on, full valid solo review) passes under both HOOK_HOST=claude and HOOK_HOST=codex"
    - "Fixture 7 (flag on, valid solo review, P1 blockers present) still fails — P1 gate not bypassed"
    - "Fixture 8 (malformed flag value, e.g. the string yes) treated as off — same-vendor review rejected"
    - "Fixture 9 (flag off, review carries solo-operator-adversarial-review source) fails — solo marker cannot sneak through when the flag is off"
```

## Acceptance Notes (Human Review)

- Functional behavior: solo mode is opt-in, fail-closed by default, and adds a structurally distinct acceptance path that cannot be satisfied by reusing the existing cross-vendor template.
- Edge cases: malformed policy value; flag on but P1 present; flag on but subject stale; flag off but solo markers present anyway; both HOOK_HOST values under solo mode.
- Regression risks: the cross-vendor path must be provably untouched (fixture 1); any caller with independent reviewer/source comparison logic missed during the enumeration would bypass this fix entirely for that call site.

## Rollback Point

- Commit / checkpoint: execution base `5e10ce8177e832978ad2bd42b49e5ed74e58342c`.
- Revert strategy: revert the single PR; `workflow_external_acceptance_status()`, the policy schema addition, the template fields, and the validator restore as one unit. No data migration — no review file has ever carried the solo fields before this ships.
