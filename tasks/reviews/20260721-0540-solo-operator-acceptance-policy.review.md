# Task Review: solo-operator-acceptance-policy

> **Status**: Fulfilled
> **Plan**: plans/plan-20260721-0540-solo-operator-acceptance-policy.md
> **Contract**: tasks/contracts/20260721-0540-solo-operator-acceptance-policy.contract.md
> **Notes File**: tasks/notes/20260721-0540-solo-operator-acceptance-policy.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-21 06:20
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:86d58a245427badea399077810ebfc4c78a1624d98b5db5e2f9849dc204827f8
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 5e10ce8177e832978ad2bd42b49e5ed74e58342c

## Human Review Card

- Verdict: pass — independent fresh-context gatekeeper (opus route, held to a
  higher-than-usual bar since this changes the acceptance-gating mechanism
  itself) returned PASS with zero blocking findings, having directly tested
  the boolean-strictness fix with live `jq` rather than trusting the notes'
  claim.
- Change type: code-change
- Intended files changed: `.ai/harness/policy.json` schema addition;
  `assets/hooks/lib/workflow-state.sh` (+ `.ai/hooks/` projection); the
  review template's three new solo fields; a TS boolean validator; the
  9(+1 bonus)-fixture test matrix.
- Actual files changed: 11 paths — the 10 explicitly allowlisted, plus
  `.ai/hooks/.projection.json` (the deterministic digest `sync:hooks`
  regenerates; gatekeeper independently confirmed it's correct, not stale,
  via `bun run check:hooks`). No file outside this set.
- Commands passed: targeted 30/0 fail; full `bun test` 1798 pass / 1 skip /
  0 fail (135 files, 683s — the previously-known unrelated
  `state-concurrency.test.ts` flake did not reproduce this run); `check:type`,
  `check:hooks`, `check:state-boundaries` all clean; `check-architecture-sync`,
  `check-task-sync`, `check-deploy-sql-order`, `check-task-workflow --strict`,
  `adopt --dry-run` all clean (gatekeeper's own independent run).
- Residual risks: enabling `solo_operator: true` makes the solo and
  cross-vendor paths mutually exclusive — a real cross-vendor
  (Codex-reviewing-Claude or vice versa) review would ALSO need to adopt the
  `solo-operator-adversarial-review` source marker to pass once solo mode is
  on, which is not how it should be used; the policy `rule` string documents
  "do not enable when both CLIs are available" but this is not code-enforced
  (by design — policy files in this repo only type/path-validate, per
  `resolve-effective-state.ts`'s existing convention). Ships with
  `solo_operator: false` — this repo does not turn itself on by merging this
  PR.
- Reviewer action required: none remaining — see Failing Items.
- Rollback: revert the single commit; the policy schema addition, the
  function branch, the template fields, and the validator restore as one
  unit. No review file has ever carried the solo fields before this ships,
  so there is zero migration surface.

## Mode Evidence

- Selected route: independent Opus `deep-reasoner` design pass -> isolated
  contract worktree -> orchestrator implementation -> independent
  fresh-context `gatekeeper` (opus route) acceptance gate.
- P1/P2/P3 evidence: the contract/notes trace the full authority map (which
  functions own which behavior), the exact control-flow insertion point
  (inside `workflow_external_acceptance_status()`, not
  `_expected_reviewer()`), and every real caller of the changed function
  (five call sites, independently re-verified by both the orchestrator's own
  `grep` and the gatekeeper's own `rg` sweep — zero duplicate gate logic
  found in either sweep).
- Root cause or plan evidence: not applicable (code-change, not a bugfix).

## Verification Evidence

- Waza `/check` run: not run directly; the independent `gatekeeper` dispatch
  is the equivalent deep review for this repo's own workflow (matches the
  established pattern used for HRD-05/06/07 this session).
- Commands run (orchestrator, this session, real output):
  - `bun test tests/workflow-state-lib.test.ts` -> 30 pass / 0 fail / 274
    expect() calls.
  - `bun run check:type` -> clean (tsc --noEmit, 0 errors).
  - `bun run check:hooks` -> `[hooks] projection OK: 17 files
    (sha256:4c33ed7b9f27016a9ae54ff36e24bb442d7ef54dc60876d00a5086f5c93a3333)`.
  - `bun run check:state-boundaries` -> `OK: 114 TypeScript files checked`.
  - Full `bun test` -> `1798 pass / 1 skip / 0 fail, 15158 expect() calls,
    135 files, 683.38s`.
  - `diff -q assets/hooks/lib/workflow-state.sh .ai/hooks/lib/workflow-state.sh`
    -> identical.
  - Manual `jq` verification of the strict-boolean read (string `"true"` ->
    `false`; real boolean `true` -> `true`; absent/`"yes"`/`null`/`1` ->
    `false`), matching the notes' claimed fix.
- Manual checks: see Manual Check Evidence below.
- Supporting artifacts: `tests/workflow-state-lib.test.ts` fixtures
  1-9 + 8b; `tasks/notes/20260721-0540-solo-operator-acceptance-policy.notes.md`
  (records the mid-implementation deviation: the design's original TS-only
  mitigation for the boolean-strictness gap was insufficient on its own,
  since the TS validator and the bash acceptance check are different code
  paths — fixed with a dedicated bash-layer type-aware jq read instead).
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/checks/latest.json`.

## Manual Check Evidence

- [x] Fixture 1 (no flag, same-vendor review) still fails exactly as pre-change main — zero regression on the cross-vendor path
  - Evidence: `tests/workflow-state-lib.test.ts` "solo_operator fixture 1"
    asserts exact stdout `fail\tClaude\tclaude-review\tExternal reviewer is
    Claude; expected Codex.\n` with no `.ai/harness/policy.json` present at
    all. Independent gatekeeper additionally diffed the `else` branch
    against the pre-change function body and confirmed the comparisons,
    printf format strings, and control flow are textually identical
    (only +2 leading spaces of indentation).
- [x] Fixture 2 (flag on, ordinary claude-review/codex-review source) still fails — cannot satisfy solo mode by reusing a normal template
  - Evidence: "solo_operator fixture 2" asserts stdout contains "External
    source is claude-review; expected solo-operator-adversarial-review
    under solo_operator mode."
- [x] Fixture 3 (flag on, valid solo markers, stale subject hash) still fails — freshness binding not weakened
  - Evidence: "solo_operator fixture 3" writes a deliberately wrong subject
    hash with otherwise-valid solo markers; asserts stdout contains "is
    stale for current review subject".
- [x] Fixture 4 (flag on, solo source, wrong/missing acknowledgement) fails
  - Evidence: "solo_operator fixture 4" tests both a missing and a
    mismatched acknowledgement string; both assert stdout contains "Solo
    Operator Acknowledgement is missing or does not match".
- [x] Fixture 5 (flag on, solo source, Reviewer Session Identity == Implementer Session Identity or either missing) fails
  - Evidence: "solo_operator fixture 5" tests both the identical-identity
    and the missing-identity case; both assert stdout contains
    "Reviewer/Implementer Session Identity is missing or identical".
- [x] Fixture 6 (flag on, full valid solo review) passes under both HOOK_HOST=claude and HOOK_HOST=codex
  - Evidence: "solo_operator fixture 6" asserts the exact stdout
    `pass\tClaude\tsolo-operator-adversarial-review\tExternal acceptance
    passed.\n` under both host values. Independent gatekeeper separately
    confirmed the function's exit-code convention is always 0 regardless of
    pass/fail (verdict lives in stdout text), so this stdout-content
    assertion — not just status — is the real proof.
- [x] Fixture 7 (flag on, valid solo review, P1 blockers present) still fails — P1 gate not bypassed
  - Evidence: "solo_operator fixture 7" asserts stdout contains "External
    acceptance has P1 blockers".
- [x] Fixture 8 (malformed flag value, e.g. the string yes) treated as off — same-vendor review rejected
  - Evidence: two fixtures cover this — "fixture 8" (JSON string `"true"`,
    the genuinely subtle case a naive `jq -r` read cannot distinguish from a
    real boolean) asserts the cross-vendor path's exact pass stdout;
    "fixture 8b" (arbitrary malformed string `"yes"`) asserts the
    cross-vendor rejection message. Both independently re-verified by the
    gatekeeper with live `jq` invocations, not just trusted from the test
    file.
- [x] Fixture 9 (flag off, review carries solo-operator-adversarial-review source) fails — solo marker cannot sneak through when the flag is off
  - Evidence: "solo_operator fixture 9" asserts stdout contains "External
    source is solo-operator-adversarial-review; expected codex-review."

## External Acceptance Advice

> **External Acceptance**: waived (this row's own subject cannot self-certify
> under the very mechanism it introduces — using solo_operator to accept its
> own PR would be circular; canonical cross-vendor acceptance is unavailable
> per the pre-existing solo-operator gap this PR closes for all FUTURE
> subjects)
> **External Reviewer**: none (canonical) — Codex quota exhausted per
> standing chain record this session; this PR's own subject predates the
> mechanism it adds, so it cannot use solo mode on itself either
> **External Source**: user waiver (actor: kito; standing chain instruction
> reconfirmed this session for the broader HRD chain, extended here by the
> orchestrator's own request for this infrastructure change; precedent:
> HRD-01 through HRD-07, all waived with substitute internal evidence)
> **External Started**: 2026-07-21
> **External Completed**: 2026-07-21 — substitute evidence: one independent
> fresh-context `gatekeeper` (opus route) round held to an explicitly higher
> bar than ordinary feature PRs (adversarial stance stated up front given
> this changes the acceptance-gating mechanism itself), which directly
> re-ran the boolean-strictness fix with live `jq` rather than trusting the
> notes, diffed the cross-vendor path against pre-change `main` line by
> line, read (not just ran) four of the ten test fixtures to confirm each
> assertion matches its name, and independently re-swept all five real
> callers for duplicate gate logic.
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:86d58a245427badea399077810ebfc4c78a1624d98b5db5e2f9849dc204827f8
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 5e10ce8177e832978ad2bd42b49e5ed74e58342c
> **Benchmark Evidence SHA256**: not-applicable

- P1 blockers: none. The independent gatekeeper found no blocking findings
  across all eight verification items in its brief.
- P2 advisories: two low/medium observations from the gatekeeper, both
  process (not code) — (1) this review file was still an unfilled template
  stub at the time of its review, expected pre-gate, now filled in this
  pass; (2) enabling solo mode makes solo/cross-vendor mutually exclusive by
  design, documented in the policy `rule` string, not code-enforced.
- Acceptance checklist: cross-vendor path byte-identical when off (verified
  line-by-line against pre-change `main`) ✓; solo path fail-closed behind
  three non-reusable markers ✓; every pre-existing binding (P1, rubric,
  subject-hash freshness, target, benchmark) unconditional in both modes,
  confirmed by reading the post-branch code directly ✓; boolean-strictness
  fix verified with live `jq`, not trusted from prose ✓; five real callers
  swept twice (orchestrator + gatekeeper), zero duplicate logic ✓; hooks
  projection byte-identical ✓; full suite green ✓.

## Behavior Diff Notes

- `workflow_external_acceptance_status()` gains one `if solo_operator ==
  true / else` branch immediately after the `acceptance_lc != pass` guard,
  replacing the two unconditional reviewer/source equality checks. The
  `else` branch is those same two checks, unchanged. Every check after the
  branch (P1, rubric v2, subject-hash freshness, target revision, benchmark
  evidence) is untouched and unconditional.
- `.ai/harness/policy.json` gains one new top-level `external_acceptance`
  object; every other key is untouched. Ships with `solo_operator: false`.
- New `workflow_policy_get_strict_boolean()` helper (type-aware jq read) is
  additive; no existing caller of `workflow_policy_get` is touched or
  affected.
- `validateWorkflowPolicy` gains one new `policyBoolean()` call; the new
  `policyBoolean()` helper is additive, following the exact convention of
  the existing `policyString`/`policyPath` helpers.

## Residual Risks / Follow-ups

- `tasks/todos.md`'s solo-operator row closure is a deliberate separate
  main-branch commit after this merges (matching the established HRD
  closeout pattern), not part of this branch.
- The `.claude/templates/review.template.md` copy (a different, already-stale
  legacy mirror of `assets/templates/review.template.md`, confirmed
  pre-existing drift unrelated to this change) does not carry the three new
  solo fields — out of this contract's scope; not touched.
- Enabling `solo_operator: true` on this repo itself, if ever desired, is a
  separate, deliberate future decision — this PR only builds the mechanism
  and ships it off.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All 10 test fixtures independently re-verified; cross-vendor regression path proven byte-identical; boolean-strictness fix proven with live jq. |
| Product depth | 9/10 | Closes a real, twice-encountered (HRD-07, this session) user-facing friction source without weakening any existing binding. |
| Design quality | 9/10 | Single-function branch, mutually-exclusive marker design, honest about attestation-vs-proof limits for session identity, defense-in-depth (bash + TS) for the boolean gap. |
| Code quality | 9/10 | Clean diff, matches existing helper conventions (`policyString`/`policyPath`/`policyBoolean`), no speculative flexibility (literals are bash constants, not policy-configurable). |

## Failing Items

- None remaining.

## Retest Steps

- Re-run: `bun test tests/workflow-state-lib.test.ts`, full `bun test`.
- Re-check: `bun run check:type && bun run check:hooks && bun run check:state-boundaries`, `diff -q assets/hooks/lib/workflow-state.sh .ai/hooks/lib/workflow-state.sh`.

## Summary

- Independent verdict PASS (fresh-context gatekeeper, opus route, held to a
  higher bar than ordinary feature work since this changes the
  acceptance-gating mechanism itself): the `solo_operator` policy flag is
  fail-closed by default, cannot be satisfied by reusing the existing
  cross-vendor template, does not weaken any pre-existing binding, and its
  boolean-strictness edge case is genuinely fixed (verified with live `jq`
  by an independent reviewer, not just trusted from notes). This row's own
  subject predates the mechanism it introduces and cannot self-certify
  under it; external acceptance is waived per the same standing chain
  pattern used for HRD-01 through HRD-07, with the independent gatekeeper
  round as substitute evidence. Merge remains a separate, explicit boundary.
