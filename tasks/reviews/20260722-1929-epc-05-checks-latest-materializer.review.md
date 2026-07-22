# Task Review: epc-05-checks-latest-materializer

> **Status**: Reviewed
> **Plan**: plans/plan-20260722-1929-epc-05-checks-latest-materializer.md
> **Contract**: tasks/contracts/20260722-1929-epc-05-checks-latest-materializer.contract.md
> **Notes File**: tasks/notes/20260722-1929-epc-05-checks-latest-materializer.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-22 22:20
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: new `src/effects/evidence/checks-materializer.ts`; typed-field redaction exemption in `src/core/evidence/redaction.ts`; verify-producer runTrace blob payload; emit wrapper flags; verify-sprint.sh cutover (+ helper mirror); workflow-state.sh `{}` bootstrap deletion (canonical + projection + digest); mutation-observed continuous-verification redirect; three test suites (new materializer suite; event-store redaction coverage; characterization updates); package plan/contract/review/notes; `tasks/todos.md` projection
- Actual files changed: exactly that set — 19 paths, single amended commit `3ceca8db` on base `82215336`; consumers (`acceptance-receipt.ts`, `prompt-handler.ts`, `merge-gate.ts`, `verify-contract.sh`) absent from the diff; EPC-01 store/fold (except the authorized redaction refinement), post-bash-importer, attested-import untouched; both mirrors byte-identical
- Commands passed: new suites 46 pass (red-first, incl. the double-prefix regression reproduced red on revert); full `bun test` 1779 pass / 1 skip / 0 fail (worker + gatekeeper independent runs); `check:type` clean; `check-task-workflow --strict` OK; `contract-run preflight` preflight_pass; deploy-sql/task-sync/architecture-sync (advisory blocking=0) green; `inspect-project-state` no drift; `adopt --dry-run` 0 operations
- Residual risks: `branch` and absolute `worktree` fields remain entropy-redacted (verified inert — the receipt fingerprint gates on neither); guarded only-if-absent `{}` seeds in `plan-to-todo.sh`/`ensure-task-workflow.sh` remain non-ledger first-writers for fresh repos (fail-closed content, carried to EPC-09); downstream adopters lack the ledger tooling until the next release, so `checks/latest` is structurally unavailable there post-cutover (accepted Program intermediate state, EPC-09 release-notes obligation); globally installed repo-harness 0.10.1 still carries the pre-cutover `cp` on this machine — in-worktree acceptance must use `bash scripts/verify-sprint.sh` until the release ships
- Reviewer action required: none further — round-1 gatekeeper FAIL (redaction mangling CRITICAL + fixture-blindness HIGH) remediated per orchestrator ruling (typed-field exemption at construction boundary); round-2 gatekeeper re-gate verdict PASS with live dogfood readback
- Rollback: revert the single PR — restores direct authoring (cp + bootstrap + mutation-observed target) and removes materializer/redaction refinement; consumers never changed

## Mode Evidence

- Selected route: planning (captured work-package plan, code-change profile)
- P1/P2/P3 evidence: plan Captured Planning Output; design authority frozen D4/D6/D7/D8; D6 pattern refinement within letter (pattern unpinned, recorded at EPC-01 acceptance)
- Root cause or plan evidence: cutover package; the round-1 CRITICAL root cause (entropy pattern lacking hash/path typing) live-reproduced via event `evt-01KY4YMNNF0BFAPHV968AX04J6` before the fix

## Verification Evidence

- Waza `/check` run: two gatekeeper reviews (fresh context, read-only): round-1 FAIL with findings; round-2 PASS after remediation
- Commands run: see Human Review Card; executed in the contract worktree at `3ceca8db`
- Manual checks: see Manual Check Evidence below
- Supporting artifacts: `.ai/harness/checks/latest.json` (materialized, D8 provenance); `.ai/harness/evidence/events/log.jsonl`; run snapshots
- Implementation notes reviewed: yes — full ruling history, reader trace, characterization assertion inventory, residuals
- Run snapshot: `.ai/harness/runs/`

## Manual Check Evidence

- [x] No direct authoring path for checks/latest remains (cp and {} bootstrap deleted; no-independent-authoring test green)
  - Evidence: both verify-sprint `cp` sites deleted (script + helper mirror byte-identical); `printf "{}\n"` bootstrap removed from `.ai/hooks/lib/workflow-state.sh` and canonical `assets/hooks/lib/workflow-state.sh` with projection digest regenerated; Stop-time continuous verification redirected to `.ai/harness/checks/contract-verify.latest.json`; gatekeeper's independent repo-wide writer sweep found no writer outside the materializer and its single call site; the no-independent-authoring test and the mutation-observed behavioral test are green.
- [x] Package's own acceptance evidence carries D8 provenance whose source_event_ids resolve to accepted ledger events
  - Evidence: round-2 gatekeeper live dogfood (`bash scripts/verify-sprint.sh --prepare-acceptance` in the worktree): materialized `checks/latest.json` has `review_subject_sha256` single-prefixed and byte-equal to `provenance.subject_hash`; `provenance.source_event_ids` resolve to `authoritative_machine` ledger events with matching `subject_hash` and `authority_commit == HEAD`; `run_file`/`contract.file`/`active_plan`/`allowed_paths` byte-intact under the 47-char slug.
- [x] tasks/current.md untouched
  - Evidence: `git diff 82215336..HEAD -- tasks/current.md` is empty; `git status --porcelain` shows no entry for `tasks/current.md`.

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

- `checks/latest.json` is now a deterministic materialization of the evidence ledger (D7 selection, D8 provenance); the three direct authoring paths are gone; continuous contract verification writes to its own telemetry file; the D6 redaction gains whole-value declared-hash and safe-repo-relative-path exemptions (denylist unconditional, free text unchanged). Consumer-facing schema preserved; prompt-handler and acceptance-receipt suites unchanged and green.

## Residual Risks / Follow-ups

- EPC-09 carry-forward: guarded `{}` seeds; downstream structural unavailability of checks/latest until release; global 0.10.1 legacy writer on this machine.
- EPC-07/08 consume the materializer patterns; supersedes emission still unexercised by producers.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | First authority cutover complete; three paths closed; live dogfood clean |
| Product depth | 9/10 | Round-1 CRITICAL found by required dogfood, fixed at construction boundary |
| Design quality | 9/10 | Typed exemption preserves deny-by-construction and denylist |
| Code quality | 9/10 | 1779 green twice independently; genuine red-first regressions |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/evidence-checks-materializer.test.ts tests/evidence-event-store.test.ts`; `bash scripts/verify-sprint.sh --prepare-acceptance` (worktree script)
- Re-check: materialized provenance resolves to ledger events; writer sweep clean

## Summary

- EPC-05 completes the Program's first authority cutover: `checks/latest` is materialized only from the ledger via the frozen D7 predicate with D8 provenance, all three direct authoring paths are deleted/closed same-package, and the round-1 CRITICAL (entropy redaction mangling run traces) is fixed with a typed-field exemption at the construction boundary — proven by red-first regressions and live dogfood readback. Round-2 gatekeeper verdict: PASS. Ready to ship as one PR.
