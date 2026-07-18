# Task Review: lsc-07-stop-semantics-cutover

> **Status**: Complete
> **Plan**: plans/plan-20260718-2350-lsc-07-stop-semantics-cutover.md
> **Contract**: tasks/contracts/20260718-2350-lsc-07-stop-semantics-cutover.contract.md
> **Notes File**: tasks/notes/20260718-2350-lsc-07-stop-semantics-cutover.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-19 (Round 1, Claude gatekeeper substitution for external acceptance)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:2946d4a294a3793becf55b86ba7cd825c84b7b88ec89816c60770661174f0592
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 574c5c66f31fb012a9e0ac5ac6ad3391838822a6

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: the additive `readiness` projection (types +
  projector), the Stop hook cutover with all three crutches removed (hook +
  assets mirror + projection manifest via the sanctioned sync), hook-runtime
  re-pins plus two new regression tests, authorized delta-shaped golden
  regenerations, sprint base pin, and the LSC-07 envelope.
- Actual files changed: 23 modified + 4 untracked, all within allowed_paths;
  `scripts/check-task-workflow.sh`, `hook-input.sh`, `pre-edit-guard.sh`,
  `operation-readiness.ts`, and `src/cli` all untouched; hook mirrors
  cmp-identical.
- Commands passed: targeted 7-file suite 170 pass / 0 fail; characterization
  test repeatedly deterministic; check:type; full clean-PATH `bun test`
  1669 pass / 1 skip / 0 fail (independently re-run by the gatekeeper, not
  taken from the executor); strict workflow check; deploy-sql / task-sync /
  architecture-sync; adopt --dry-run; git diff --check; cmp mirrors;
  crutch-absence greps; independent Claude gatekeeper acceptance (PASS).
- Residual risks: (1) ambient-PATH contamination — this machine's stale
  global repo-harness v0.10.0 at ~/.bun/bin answers the fallback chain for 5
  `tests/cli/hook.test.ts` fixtures (outside allowed_paths), locally skewing
  Stop-delegation tests; PATH-isolated runs pass 54/54 and CI is
  deterministic (hook-runtime pins REPO_HARNESS_CLI). Operational follow-up:
  refresh the global binary; test-hygiene follow-up: pin
  REPO_HARNESS_CLI/PATH in those fixtures (routed to LSC-08/todos). (2) A
  resolver emitting a SCALAR `readiness` value would abort the hook under
  `set -e` (exit 1, non-block, orthogonal gates skipped that run) — no known
  producer of that shape; hardening guard routed as a follow-up. (3) The
  characterization stop cells' `missing_semantic_fields` remain listed —
  honest instrument output (the probe checks top-level keys; readiness is
  nested) — LSC-08 closes the adapter surface.
- Reviewer action required: none for the reviewed subject; ship as the
  independent LSC-07 PR against `main` from base `574c5c66`.
- Rollback: revert the independent LSC-07 PR; Stop returns to the
  characterized crutch behavior; no persisted migration to unwind.

## Mode Evidence

- Selected route: `Task Profile=code-change`, independent contract worktree
  `codex/lsc-07-stop-semantics-cutover` from exact execution base
  `574c5c66` (post-LSC-06 merge plus backfill).
- P1/P2/P3 evidence: the calibrated contract names the three crutches with
  line evidence, classifies every Stop decision point (readiness vs
  orthogonal), pins the minimal wiring (additive field over the existing
  --field surface, zero new routes), and pre-authorizes the delta-shaped
  golden updates.
- Root cause or plan evidence: falsifier-first — the Lite early-exit tests
  passed through the canonical route on first try after the cutover; two
  real bugs caught during implementation (set -e swallowing the readiness
  block call; --operation choice rejecting standard overrides) are
  documented in notes.

## Verification Evidence

- Waza `/check` run: superseded by the read-only Claude gatekeeper pass
  recorded under External Acceptance Advice.
- Commands run: full Exit Criteria surface listed on the Human Review Card,
  all exit 0 in this worktree at the reviewed subject.
- Manual checks: gatekeeper verified crutch absence by grep (zero
  install-state.json / raw effective.json hits; touch -r only in a
  comment); one memoized CLI invocation per Stop run; fail direction on
  resolver absence (stderr note, nothing invented, no block) and on
  stale-binary output lacking `readiness` (null-safe jq, behavior skipped);
  readyToShip=false report-not-block proven by test and wiring read; the
  mtime replacement judged a genuine content write (resume Generated line
  reissued after the handoff append), not a crutch in disguise; golden
  diffs hunk-audited (three stop cells + esa_goldens hashes only; flat
  goldens additive; TARGET_DELTAS byte-identical); orthogonal gates'
  regions and tests unchanged.
- Supporting artifacts: migration note (fallback removal, fail direction,
  write reordering), residual characterization with controlled PATH
  reproduction, LSC-08 remainder in notes.
- Implementation notes reviewed: yes.
- Run snapshot: clean-PATH full-suite output retained in session task log
  (1669 pass / 1 skip / 0 fail).

## External Acceptance Advice

> **External Acceptance**: pass (Round 1, Claude gatekeeper substitution — mechanical `workflow_external_acceptance_pass` still fails closed regardless, per the pre-existing base-gate defect)
> **External Reviewer**: Claude
> **External Source**: claude-gatekeeper (continuation of the documented 2026-07-18 exception: the repo's normal host-aware Codex requirement cannot be met because the Codex CLI is quota-limited until 2026-08-16; see the `tasks/todos.md` solo-operator row)
> **External Started**: 2026-07-19
> **External Completed**: 2026-07-19
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:2946d4a294a3793becf55b86ba7cd825c84b7b88ec89816c60770661174f0592
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 574c5c66f31fb012a9e0ac5ac6ad3391838822a6
> **Benchmark Evidence SHA256**: unavailable-by-defect (fingerprint lookup returns empty despite existing `evals/harness/reports/profile-comparison.*` evidence; pre-existing base-gate defect tracked in `tasks/todos.md`, unrelated to this subject)

- P1 blockers: none.
- P2 advisories: 2, recorded under Residual risks — the ambient stale-binary
  contamination (environment, with a test-hygiene follow-up) and the
  scalar-readiness set -e hardening guard.
- Acceptance checklist: crutch absence, single-invocation memoization, both
  fail directions, report-not-block semantics, orthogonal gate immutability,
  mtime replacement judgment, golden hunk audit, projection purity,
  containment — all independently verified; full clean-PATH suite re-run by
  the gatekeeper itself.

## Behavior Diff Notes

- Stop now derives profile and readiness from one canonical resolver
  invocation; install-state fallback and raw cache reads are gone (one-shot
  behavior change: machines relying on the fallback see no profile instead
  of an inferred one — fail-safe direction); readyToShip=false is reported,
  never blocking; the resume packet's Generated line is now truthful after
  minimal-change appends. EffectiveStateV1 gains the additive `readiness`
  field; all existing fields byte-identical.

## Residual Risks / Follow-ups

- Refresh this machine's global repo-harness binary (v0.10.0 predates the
  readiness surface); pin REPO_HARNESS_CLI/PATH in the five
  tests/cli/hook.test.ts fixtures (LSC-08 or todos).
- Scalar-readiness set -e guard (safe hardening, no known producer).
- LSC-08 closes adapter parity and the nested-readiness surface.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Three crutches removed, readiness consumed with correct fail directions, stop/ship distinction visible at the hook level. |
| Product depth | 9/10 | Stop stops being a second application kernel: one canonical authority feeds it, and the fallback class of self-deception is deleted. |
| Design quality | 9/10 | Memoized single invocation, null-safe parsing for version skew, additive-only state surface, orthogonal gates untouched. |
| Code quality | 8/10 | Falsifier-first with two real bugs caught; the scalar-readiness guard and fixture PATH-pinning remain as clean follow-ups. |
