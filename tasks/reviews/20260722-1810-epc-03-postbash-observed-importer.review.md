# Task Review: epc-03-postbash-observed-importer

> **Status**: Reviewed
> **Plan**: plans/plan-20260722-1810-epc-03-postbash-observed-importer.md
> **Contract**: tasks/contracts/20260722-1810-epc-03-postbash-observed-importer.contract.md
> **Notes File**: tasks/notes/20260722-1810-epc-03-postbash-observed-importer.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-22 19:35
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: new `src/effects/evidence/post-bash-importer.ts`, additive wiring in `src/cli/hook/command-observed.ts`, new `tests/evidence-post-bash-importer.test.ts`, package plan/contract/review/notes, `tasks/todos.md` projection
- Actual files changed: exactly that set — 8 paths, single commit `a56cc93b` on base `8861b40d`; no EPC-01/EPC-02 file touched; zero overlap with EPC-04's parallel-wave surface; `command-observed.ts` diff is pure addition (no existing line modified)
- Commands passed: `bun test tests/evidence-post-bash-importer.test.ts` (12 pass, red-first), `bun test tests/command-observed.test.ts` (11 pass), full `bun test` (1734 pass / 1 skip / 0 fail — worker + gatekeeper independent runs), `check:type` clean, `check-task-workflow --strict` OK, `contract-run preflight` preflight_pass, deploy-sql/task-sync/architecture-sync (advisory blocking=0) green, `inspect-project-state` no drift, `adopt --dry-run` 0 operations
- Residual risks: `UNBOUND_SENTINEL` degradation covers unresolvable repo-state fields as well as contract fields (accepted ruling; legal only for `observed`, which no gate can accept per D4); payload strings deliberately truncated below the 32-char redaction threshold — full hashes live in identity fields
- Reviewer action required: none further — gatekeeper acceptance review (fresh context, read-only) verdict PASS with all six gates verified
- Rollback: revert the single PR; one new module + additive wiring + tests; `post-bash-latest.json` writer byte-identical to base

## Mode Evidence

- Selected route: planning (captured work-package plan, code-change profile)
- P1/P2/P3 evidence: plan Captured Planning Output; design authority frozen D2–D6; EPC-01 store API and EPC-02 epoch constant consumed read-only
- Root cause or plan evidence: not a bugfix; second producer package of the frozen EPC design (parallel wave with EPC-04 under R4)

## Verification Evidence

- Waza `/check` run: gatekeeper acceptance review (fresh context, read-only) — verdict PASS
- Commands run: see Human Review Card; executed in the contract worktree at `a56cc93b`
- Manual checks: see Manual Check Evidence below
- Supporting artifacts: `.ai/harness/checks/latest.json`
- Implementation notes reviewed: yes — failure-semantics matching, unbound degradation, redaction-driven payload truncation, private-helper duplication per R4
- Run snapshot: `.ai/harness/runs/`

## Manual Check Evidence

- [x] PR diff confined to allowed_paths; no EPC-01/EPC-02 file modified; zero overlap with EPC-04 allowed_paths
  - Evidence: gatekeeper verified `git diff --name-only 8861b40d..HEAD` = 8 files all within `allowed_paths`; `src/core/evidence/*`, `epoch.ts`, `verify-producer.ts`, `event-log.ts` absent from the diff; `scripts/acceptance-receipt.ts`, `assets/templates/helpers/acceptance-receipt.ts`, `src/effects/evidence/attested-import.ts` untouched.
- [x] Observed-only ledger leaves authoritative filter empty (fixture)
  - Evidence: `tests/evidence-post-bash-importer.test.ts` observed-only fixture asserts accepted events are non-empty, all `observed`, and `filter(trust_class === "authoritative_machine")` returns `[]`; suite green (12/12), re-run independently by gatekeeper.
- [x] tasks/current.md untouched
  - Evidence: `git diff 8861b40d..HEAD -- tasks/current.md` is empty; `git status --porcelain` shows no entry for `tasks/current.md`.

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
- Findings: none

## Behavior Diff Notes

- PostBash observations now import into the evidence ledger as `observed` events after the existing `post-bash-latest.json` write (unchanged, byte-identical). Import failure surfaces through the pre-existing catch-all with identical severity. Observed events can never satisfy a machine gate (D4); the row-7 fixture proves an observed-only ledger leaves the authoritative filter empty.

## Residual Risks / Follow-ups

- Sentinel-degraded identity fields on observed events are by-design unverifiable; EPC-05's selection predicate must (and per D7 does) exclude `observed` from gate satisfaction regardless.
- EPC-04 merges after this package; wave surfaces are disjoint so no rebase conflict is expected.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Row-7 acceptance satisfied; trust boundary proven by fixture |
| Product depth | 9/10 | Failure semantics matched exactly; no new severity |
| Design quality | 9/10 | R4 private-helper duplication keeps wave disjoint |
| Code quality | 9/10 | Full suite green twice independently; red-first tests |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/evidence-post-bash-importer.test.ts`; `bun test tests/command-observed.test.ts`
- Re-check: `post-bash-latest.json` construction byte-identical to base; observed-only fixture assertion

## Summary

- EPC-03 imports PostBash observations as `observed` trust-class events with unbound-sentinel identity degradation, matching failure semantics of the existing write path, and proves with fixtures that an observed-only ledger leaves machine gates unsatisfied. Gatekeeper verdict: PASS. Ready to ship as one PR (merges before EPC-04 per backlog order).
