# Task Review: hrd-07-circuit-oscillation-and-shared-lock

> **Status**: External Acceptance Waived
> **Plan**: plans/plan-20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.md
> **Contract**: tasks/contracts/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.contract.md
> **Notes File**: tasks/notes/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-21 04:23
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:d8af4d0d3d3ca0499292852ea5aec0d735c2ea1b5ab1f5506413b6576f54d939
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 3776fb7dc2ddb5cd2602e45a37ee0f64c319856b

## Human Review Card

- Verdict: pass for the frozen implementation subject. A fresh-context
  gatekeeper found two blocking/advisory issues in the first pass, then
  independently verified both bounded corrections and returned PASS with
  zero remaining hard stop.
- Change type: code-change
- Intended files changed: breaker state/detector authority, shared directory
  lock option forwarding, the breaker fixture suite, and the bounded HRD-07
  workflow artifacts.
- Actual files changed: the eight normalized subject paths reported by
  `review-subject` after contract fulfillment and sprint/current projection,
  plus this excluded review record. Target overlap is zero; every path is
  inside the contract allowlist.
- Commands passed: the 22-case breaker suite; live caller/characterization
  suites; shared-lock/state-effects regressions; typecheck; diff hygiene; all
  root checks; and the full repository suite with 1787 pass, 1 skip, 0 fail.
- Residual risks: a live caller that reuses one `kind + guard` for unrelated
  blockers under an unchanged authoritative progress token would cause a
  false positive. The enumerated callers do not exhibit that shape. An old
  file-shaped lock intentionally requires operator cleanup after owner checks.
- Reviewer action required: reconfirm the one-shot waiver for the final
  normalized subject. The 03:56 waiver was exact for pre-closeout subject
  `sha256:b478d3265f13...`; deterministic contract/sprint/current projections
  moved the normalized subject to `sha256:d8af4d0d3d3c...` without changing
  product source. The owner explicitly authorized publishing the PR and merging
  at 2026-07-21 04:23 +0800, but that terminal-action authorization does not
  fabricate or replace final-subject external acceptance evidence.
- Rollback: revert the single HRD-07 PR to
  `3776fb7dc2ddb5cd2602e45a37ee0f64c319856b`; after proving no live owner,
  an operator may clear only the ignored breaker state/lock.

## Mode Evidence

- Selected route: user-invoked `$think` -> decision-complete work-package ->
  isolated contract worktree -> bounded worker implementation -> independent
  architecture/security gate and re-gate.
- P1/P2/P3 evidence: the plan and notes identify the breaker, progress token,
  and shared lock authorities; trace caller attempt through validation, locked
  state RMW, classification, decision, and owned-token release; and freeze one
  bounded stream per kind with the LSC-04 token as the sole reset authority.
- Root cause or plan evidence: this is a planned hardening slice. The protocol-1
  full rendering key allowed unchanged blockers to escape by alternating or
  cosmetically changing actions, while the bespoke file lock duplicated the
  shared lock primitive.

## Verification Evidence

- Waza `/check` run: equivalent fresh-context gatekeeper review completed.
  First verdict FAIL identified a fail-open malformed/unknown state reset and
  duplicated `CircuitKind` authority. Both were corrected; the same gatekeeper
  re-derived the fixes from source and returned PASS.
- Commands run:
  - `bun test tests/harness-circuit-breakers.test.ts` -> 22 pass, 0 fail,
    146 assertions.
  - `bun test tests/mutation-guard.test.ts tests/cli/hook.test.ts tests/hook-runtime-characterization.test.ts` -> pass.
  - `bun test tests/state/state-effects.test.ts` -> 24 pass, 0 fail.
  - Shared-lock-focused closeout fixtures -> 4 pass, 0 fail.
  - `bun run check:type` and `git diff --check` -> pass.
  - Deploy SQL order, architecture sync, task sync, strict task workflow,
    project-state inspection, and adoption dry-run -> pass.
  - Final elevated `bun test` after code freeze -> 1787 pass, 1 skip, 0 fail,
    15031 assertions across 135 files in 705.07 seconds.
- Manual checks: see the exact contract checklist below.
- Supporting artifacts: breaker protocol-2 fixtures, real child-process
  contention fixtures, plan, contract, and implementation notes.
- Implementation notes reviewed: yes; cutover effects, fail-closed correction,
  no-reclaim boundary, and full-suite evidence are recorded.
- Run snapshot: the final full-suite process exited 0. The earlier sandboxed
  attempt was superseded after code freeze and is not acceptance evidence.

## Manual Check Evidence

- [x] Exact repeat, A-B-A, and superficial churn trip only under unchanged progress
  - Evidence: the 22-case breaker suite covers exact/render-churn increments,
    immediate A-B-A trip, A-B-C and A-A-B negatives, and token-bound history.
- [x] Changed progress token resets count and bounded action history to one
  - Evidence: the progress-reset fixture asserts `repeat_count === 1`; the
    following observation behaves as a fresh one-entry history.
- [x] Shared breaker lock preserves concurrent counts and never reclaims stale/live owners
  - Evidence: the real 12-process fixture preserves all increments; separate
    stale and live directory-owner fixtures both remain present and fail closed
    after the breaker's bounded two-second wait.
- [x] Evaluator review recommends pass for the normalized current subject
  - Evidence: this record recommends pass for
    `sha256:d8af4d0d3d3ca0499292852ea5aec0d735c2ea1b5ab1f5506413b6576f54d939`;
    the independent re-gate returned PASS with zero hard stop.

## External Acceptance Advice

> **External Acceptance**: waived (pre-closeout subject only; stale after deterministic contract, sprint, and current-status projection)
> **External Reviewer**: none; Claude was not reached
> **External Source**: user waiver for sha256:b478d3265f13fe2969e80371ed668f064b755947f5fd749cc5b1111fda3609f0 (actor: kito; explicit in-session sentence at 2026-07-21 03:56 +0800; merge explicitly excluded)
> **External Started**: 2026-07-21 03:37 +0800
> **External Completed**: 2026-07-21 03:56 +0800 (waiver recorded after transfer was blocked)
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:b478d3265f13fe2969e80371ed668f064b755947f5fd749cc5b1111fda3609f0
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 3776fb7dc2ddb5cd2602e45a37ee0f64c319856b
> **Benchmark Evidence SHA256**: not-applicable

- P1 blockers: none in the internal implementation review. No external P1/P2
  verdict exists because the transfer was rejected before Claude ran; the owner
  explicitly waived that unavailable gate for this subject. The initial
  malformed-state fail-open finding is fixed and covered by preservation
  fixtures for malformed protocol 2 and unknown/future protocols.
- P2 advisories: the one-shot protocol-1 counter reset and old file-lock
  operator cleanup are deliberate cutover effects, not compatibility paths.
  The authorized external-review route is unavailable under current tenant
  policy and must not be bypassed.
- Acceptance checklist: the prior one-shot waiver remains bound to the external
  section's pre-closeout subject. Internal evidence covers detector
  classification, fail-closed state parsing, and no-reclaim/shared-lock
  behavior; no private diff was transmitted. A fresh waiver must bind the top
  final subject before PR closeout, and neither waiver authorizes merge.

## Behavior Diff Notes

- Protocol 2 replaces a full-rendering-key counter with one bounded stream per
  circuit kind. Stable `kind + guard` blocker identity catches exact repeats,
  superficial render churn, and unchanged-progress A-B-A oscillation.
- A changed opaque LSC-04 progress token is the only reset. No caller fields,
  string heuristics, or semantic fallback were added.
- Breaker serialization now uses the shared directory-lock primitive with a
  breaker-specific two-second wait and stale-owner reclaim disabled; other
  consumers keep the five-second default.
- Only a missing state file or structurally valid protocol-1 envelope starts a
  fresh epoch. Malformed, unreadable, or future protocol state throws and is
  preserved rather than reopening retries.

## Residual Risks / Follow-ups

- Canonical external acceptance remains unavailable: tenant policy blocked the
  authorized send before Claude ran. The owner recorded a one-shot waiver for
  the pre-closeout subject; deterministic workflow projections moved the final
  subject, so a fresh exact-subject waiver is required before PR closeout. No
  waiver is represented as an external verdict or merge authorization.
- Merge is not authorized. Sprint row 7 and derived status remain incomplete
  until acceptance and PR/merge closeout boundaries are satisfied.
- The detector assumes the current callers use `guard` as a stable blocker
  class within each `kind`; any live falsifier requires a caller-owned blocker
  identifier, not local parsing.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Exact, churn, A-B-A, negative, reset, fail-closed state, and 12-process lock behavior are directly covered. |
| Product depth | 9/10 | Closes both known no-progress bypasses while consuming the existing progress authority and preserving the public decision contract. |
| Design quality | 9/10 | One bounded stream per kind, two hashes with distinct authority, bounded history, and one shared lock primitive avoid dual semantics. |
| code_quality | 9/10 | Single derived kind authority, strict protocol parsing, token-owned lock release, focused adversarial fixtures, and a clean full suite. |

## Failing Items

- No implementation finding remains. The pre-closeout waiver is stale against
  the final normalized subject; merge remains a separate unauthorized boundary.

## Retest Steps

- Re-run: `bun test tests/harness-circuit-breakers.test.ts` and the live caller
  regression command recorded above.
- Re-check: `bun run check:type`, `git diff --check`, strict task workflow, and
  normalized `review-subject` against `main`.

## Summary

- Internal verdict PASS for subject
  `sha256:d8af4d0d3d3ca0499292852ea5aec0d735c2ea1b5ab1f5506413b6576f54d939`:
  HRD-07 detects exact retry, cosmetic churn, and A-B-A without inventing a
  progress heuristic; malformed/future state remains fail closed; shared-lock
  serialization and no-reclaim semantics are proven. The user-authorized Claude
  transfer was blocked by tenant policy before execution. The owner's first
  waiver is preserved against its exact pre-closeout subject; final-subject
  waiver reconfirmation and merge authorization remain separate boundaries.
