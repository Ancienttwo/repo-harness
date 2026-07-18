# Task Review: lsc-05-stable-state-version-allocation

> **Status**: Complete
> **Plan**: plans/plan-20260718-2119-lsc-05-stable-state-version-allocation.md
> **Contract**: tasks/contracts/20260718-2119-lsc-05-stable-state-version-allocation.contract.md
> **Notes File**: tasks/notes/20260718-2119-lsc-05-stable-state-version-allocation.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-18 (Round 1, Claude gatekeeper substitution for external acceptance)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:df757d5fff184c62af2573cac28e7a9fcc0212757f841e4d5d945b7d5e7929ff
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 42b77aa0730763e180918118b164c5adbb7a990b

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: the confirmSnapshot seam in the version store, the
  resolver closure with one bounded retry, two test files (falsifier-first
  deterministic confirm-window coverage), sprint base pin, and the LSC-05
  envelope.
- Actual files changed: exactly the contract's allowed_paths (2 src + 2 test
  + sprint header + envelope; todos timestamp bump). src/effects/locking/ and
  all fixtures empty diffs.
- Commands passed: state-effects + state-concurrency 35 pass / 0 fail
  (concurrency file rerun twice more by the gatekeeper: 11 pass each);
  characterization + adapter-parity + cli-state-golden 30 pass; check:type;
  full `bun test` 1643 pass / 1 skip / 0 fail; strict workflow check;
  git diff --check; independent Claude gatekeeper acceptance (PASS, zero
  blocking findings).
- Residual risks: the irreducible residual is the post-recheck, pre-write
  span inside the version lock — acceptable because the snapshot is
  confirmed under the same lock that serializes allocation, so no concurrent
  resolver can interleave; only a sub-lock-span external mutation could
  still race, and it is caught on the next resolve. No fixture, golden, or
  characterization drift.
- Reviewer action required: none for the reviewed subject; ship as the
  independent LSC-05 PR against `main` from base `42b77aa0`.
- Rollback: revert the independent LSC-05 PR; allocation returns to the
  confirm-window behavior with all previously pinned guarantees intact; no
  persisted migration to unwind.

## Mode Evidence

- Selected route: `Task Profile=code-change`, independent contract worktree
  `codex/lsc-05-stable-state-version-allocation` from exact execution base
  `42b77aa0` (post-LSC-04 merge plus backfill).
- P1/P2/P3 evidence: the calibrated contract records that most of the row-5
  acceptance predated this package (with the pinning tests cited), scopes the
  work to the confirm-to-commit window, and mandates falsifier-first
  evidence.
- Root cause or plan evidence: base-behavior falsifier run captured before
  implementation — the same-revision fast path silently reused version 1 and
  published a cache carrying stale source_hashes; exhaustion variant returned
  a fully populated stale state instead of throwing.

## Verification Evidence

- Waza `/check` run: superseded by the read-only Claude gatekeeper pass
  recorded under External Acceptance Advice.
- Commands run: full Exit Criteria surface listed on the Human Review Card,
  all exit 0 in this worktree at the reviewed subject.
- Manual checks: gatekeeper verified the seam is the first critical-section
  statement inside the existing version lock (no new lock, no new public
  error vocabulary — StateVersionConfirmMismatchError never escapes the
  resolver); judged the injection technique deterministic (pre-held lock
  with live-pid owner + detached mutator; degradation analysis: a slow host
  loses window coverage, not correctness); confirmed no double allocation
  (+1 exactly, one cache temp write, one publish); confirmed the four
  fault-path assertions untouched.
- Supporting artifacts: falsifier base-run capture in the session scratchpad
  and excerpted in the notes; tradeoff table for the lock release/reacquire
  cycle in the exhaustion test.
- Implementation notes reviewed: yes.
- Run snapshot: full-suite output retained in session task log (1643 pass /
  1 skip / 0 fail).

## External Acceptance Advice

> **External Acceptance**: pass (Round 1, Claude gatekeeper substitution — mechanical `workflow_external_acceptance_pass` still fails closed regardless, per the pre-existing base-gate defect)
> **External Reviewer**: Claude
> **External Source**: claude-gatekeeper (continuation of the documented 2026-07-18 exception: the repo's normal host-aware Codex requirement cannot be met because the Codex CLI is quota-limited until 2026-08-16; see the `tasks/todos.md` solo-operator row)
> **External Started**: 2026-07-18
> **External Completed**: 2026-07-18
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:df757d5fff184c62af2573cac28e7a9fcc0212757f841e4d5d945b7d5e7929ff
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 42b77aa0730763e180918118b164c5adbb7a990b
> **Benchmark Evidence SHA256**: unavailable-by-defect (fingerprint lookup returns empty despite existing `evals/harness/reports/profile-comparison.*` evidence; pre-existing base-gate defect tracked in `tasks/todos.md`, unrelated to this subject)

- P1 blockers: none.
- P2 advisories: none. One neutral observation (todos timestamp-only bump).
- Acceptance checklist: seam placement verified in-lock and first;
  fail-closed observability identical to the four existing fault paths;
  falsifier evidence assessed genuine; retry boundedness and no-gap version
  sequence verified; containment verified.

## Behavior Diff Notes

- Allocation now re-confirms the source snapshot inside the version lock; a
  mutation in the former blind window triggers one bounded full retry, then
  the existing stability error. No observable-version or cache changes in
  any failure mode. All previously pinned guarantees byte-identical.

## Residual Risks / Follow-ups

- None new. LSC-02 advisories remain routed to LSC-06; base-gate defects
  remain tracked in `tasks/todos.md`.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | The last blind window in allocation closed, proven falsifier-first on base and deterministic post-fix. |
| Product depth | 8/10 | Small surface, but it completes the row-5 guarantee the audit demanded: no version without a confirmed stable snapshot. |
| Design quality | 9/10 | One optional callback inside the existing lock; error vocabulary unchanged; no second loop, no new lock. |
| Code quality | 9/10 | Falsifier-first workflow, OS-lock-timed deterministic tests with degradation analysis, additive-only test diffs. |
