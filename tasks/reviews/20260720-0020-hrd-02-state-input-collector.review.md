# Task Review: hrd-02-state-input-collector

> **Status**: Complete
> **Plan**: plans/plan-20260720-0020-hrd-02-state-input-collector.md
> **Contract**: tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md
> **Notes File**: tasks/notes/20260720-0020-hrd-02-state-input-collector.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-20 (Round 1, internal acceptance; external slot pending owner decision)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:d4792202318773f3a6928627b6640cb677ffa04dd561ef65970ed2684a543db5
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 44c810e62843980fdf935335d293faec8447cf40

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: one lazy memoizing once-per-event
  `StateInputCollector` in the effects layer, the thin `runHook()` entry
  wiring with SessionStart's existing single resolution routed through it,
  the collector test suite, the HRD-02 sprint base pin, and the HRD-02
  workflow envelope.
- Actual files changed: 9 files within allowed_paths — new
  `src/effects/loop/state-input-collector.ts` (100 lines) and
  `tests/state-input-collector.test.ts` (271 lines), `src/cli/hook/runtime.ts`
  (+13/−1), the one-line sprint header pin, envelope
  (plan/contract/review/notes), and a timestamp-only `tasks/todos.md` WIP
  transfer. Frozen paths (`.ai/hooks/`, `assets/hooks/`,
  `src/cli/hook/route-registry.ts`, `src/core/loop/loop-event-protocol.ts`)
  have empty diffs.
- Commands passed: falsifier first — `bun test
  tests/hook-runtime-characterization.test.ts` pass with
  `git diff b57d6323..HEAD -- tests/fixtures/loop-runtime/characterization.json`
  empty (HRD-01 golden byte-identical); combined suite 14 pass / 0 fail;
  nearest runtime coverage `tests/hook-runtime.test.ts` +
  `tests/cli/hook.test.ts` 125 pass / 0 fail / 1296 expects (gatekeeper
  re-run); `check:type`, `check:state-boundaries` (110 files),
  `check:hooks` (sha256:98540230… unchanged) all green in both the review
  session and the independent gatekeeper session.
- Residual risks: the injected resolver and getter are SessionStart-shaped;
  HRD-03 (PreEdit) and HRD-06 (Stop) will extend the interface with their
  own resolution thunks (generic type already accommodates this). The
  narrowed 4-getter interface defers policy/contract-marker/diff/capability
  getters until a real consumer forces the export decision in
  `resolve-effective-state.ts` — deliberate, per-fact reasoning in the
  notes file.
- Reviewer action required: none for the reviewed subject; ship as the
  independent HRD-02 PR against `main` from base `b57d6323`.
- Rollback: revert the independent HRD-02 PR; one effects module, one test
  file, and a 13-line entry wiring revert to the exact HRD-01 baseline; no
  migration to unwind.

## Mode Evidence

- Selected route: `Task Profile=code-change`, independent contract worktree
  `codex/hrd-02-state-input-collector` from exact execution base `b57d6323`
  (post-HRD-01 merge plus backfill).
- P1/P2/P3 evidence: the calibrated contract bounds the row to
  establish-and-thread only (no handler cutover), pins the
  laziness/memoization/no-new-parser design, and makes the HRD-01 golden
  the falsifier.
- Root cause or plan evidence: falsifier-first — SessionStart's resolution
  was routed through the collector before any other getter was built, and
  the characterization test passed on the first attempt with a clean golden.

## Verification Evidence

- Waza `/check` run: standard depth, orchestrator session 2026-07-20; scope
  on target, hard stops 0, two safe_auto advisories applied in-session
  (raw NUL byte in the test literal → `\u0000` escape so git treats the
  file as text; notes misquote of the taste constraint → corrected to the
  contract's actual line).
- Commands run: the battery above re-run in the review session
  (14 pass / 0 fail; checks green), independent gatekeeper session re-ran
  the full set including the 125-test runtime coverage.
- Supporting artifacts: `src/effects/loop/state-input-collector.ts`
  (Symbol-sentinel `once()` caches legitimate null; injection avoids the
  effects→CLI reverse import), NUL-poison construction test proving
  structural laziness.
- Implementation notes reviewed: yes — omitted-getter per-fact reasoning
  (authorities module-private to `resolve-effective-state.ts:63-237`),
  memoization mechanics, layering decision, test-design tradeoffs.
- Run snapshot: `.ai/harness/checks/latest.json` (verify-contract, this
  worktree).

## Manual Check Evidence

- [x] HRD-01 characterization golden is byte-identical to its merged state
  - Evidence: `git diff b57d6323..44c810e6 -- tests/fixtures/loop-runtime/characterization.json` returns empty, and `bun test tests/hook-runtime-characterization.test.ts` passes against the untouched golden in the review session and the gatekeeper session independently.

## External Acceptance Advice

> **External Acceptance**: waived (user standing instruction for the continuous chain run, 2026-07-20)
> **External Reviewer**: none — Codex quota remains exhausted until 2026-08-16 (verified on HRD-01, `codex exec` refused by provider usage limit); no second AI host available
> **External Source**: user waiver (actor: kito; standing in-session instruction 2026-07-20 to complete the chain with per-row honest records; precedent: `5b3a2693` and the HRD-01 one-shot waiver). Substitute internal evidence retained below: fresh-context Claude gatekeeper PASS plus merge-gate PASS and CI 8/8 on PR #95
> **External Started**: 2026-07-20
> **External Completed**: 2026-07-20 (waiver recorded; not a Codex review)
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:d4792202318773f3a6928627b6640cb677ffa04dd561ef65970ed2684a543db5
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 44c810e62843980fdf935335d293faec8447cf40
> **Benchmark Evidence SHA256**: not_applicable

- P1 blockers: none. Gatekeeper verdict PASS — falsifier survived
  (byte-identical golden), all frozen paths empty-diff, full battery re-run
  independently including the 125-test runtime coverage, collector quality
  verified in source (structural laziness, null-caching memoization, no new
  parsers, no reverse import, single construction site, single resolution).
- P2 advisories: both safe_auto items applied in-session before this card
  (NUL escape; notes quote correction); informational — interface extension
  expected at HRD-03/06 for their resolution thunks.
- Acceptance checklist: scope ✓, verification ✓, falsifier survived ✓,
  scope-narrowing adjudicated as honoring the sprint acceptance line ✓
  (mechanism demanded, not a getter census; omitted authorities verified
  module-private with no export anywhere in `src/`).

## Behavior Diff Notes

- Behavior-inert by machine proof: the HRD-01 frozen baseline
  (`tests/fixtures/loop-runtime/characterization.json`) is byte-identical
  and its test passes; SessionStart performs exactly one Effective State
  resolution (now through the memoized collector); Stop's script path is
  untouched.

## Residual Risks / Follow-ups

- HRD-03/06 interface extension (informational, above); the deferred
  getters land when the first real consumer forces the export decision.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Acceptance line fully held; falsifier passed first attempt; verified in three sessions (worker, review, gatekeeper) |
| Product depth | 8/10 | Laziness proven structurally (NUL-poison construction), null-caching covered, single-resolution invariant pinned |
| Design quality | 9/10 | Injection resolves the layering constraint cleanly; Symbol-sentinel memo; narrowing resolved on the contract's own escape branch with per-fact records |
| Code quality | 9/10 | Thin delegation only, cited mirrors of existing semantics, house-style comments |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/state-input-collector.test.ts tests/hook-runtime-characterization.test.ts tests/loop-event-protocol.test.ts && bun run check:type && bun run check:state-boundaries && bun run check:hooks`
- Re-check: `repo-harness run verify-contract --contract tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md --strict`

## Summary

- HRD-02 establishes the lazy, memoizing, once-per-event
  `StateInputCollector` at the runtime entry with SessionStart's single
  resolution routed through it, machine-proven behavior-inert against the
  HRD-01 frozen baseline. Review pass + independent gatekeeper acceptance
  PASS; external acceptance slot pending the owner's Codex-waiver decision
  at finish time. Fit to ship as the independent HRD-02 PR from base
  `b57d6323`.
