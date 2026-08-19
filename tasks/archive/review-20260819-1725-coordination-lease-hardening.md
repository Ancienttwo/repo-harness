> **Archived**: 2026-08-19 17:25
> **Related Plan**: plans/archive/plan-20260819-1519-coordination-lease-hardening.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260819-1725

# Task Review: coordination-lease-hardening

> **Status**: Complete
> **Plan**: plans/plan-20260819-1519-coordination-lease-hardening.md
> **Contract**: tasks/contracts/20260819-1519-coordination-lease-hardening.contract.md
> **Notes File**: tasks/notes/20260819-1519-coordination-lease-hardening.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-19 15:22
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:035d52a63101c410fedbca4edfbb936b354e975af44c20ed9491508b7a2166a9
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 8d8b683583a450a54a9629a99ed56edec0cbb64c

## Human Review Card

- Verdict: PASS
- Change type: code-change
- Intended files changed: contract allowed_paths (amended after T6 to name `scripts/contract-worktree.sh` and its template mirror)
- Actual files changed: 17 files, +1524 -64; every path inside the amended allowed_paths, no extras
- Commands passed: `bun test` (2628 pass / 1 skip / 0 fail), `bun run check:type` (exit 0), `cmp scripts/sprint-backlog.sh assets/templates/helpers/sprint-backlog.sh` (exit 0), `cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh` (exit 0), targeted four-file suite (119 pass / 0 fail)
- Residual risks: two P3 findings on the receipt, both non-blocking and both bounded by work explicitly out of scope here
- Reviewer action required: none
- Rollback: single synthesized publication commit on `main`, one revert; the empty-lease-store precondition means no on-disk lease state depends on the new schema

## Mode Evidence

- Selected route: gatekeeper acceptance review of the delivered contract worktree, then the orchestrator's explicit ship order
- P1/P2/P3 evidence: P1 the coordination plane splits pure identity (`src/core/state/coordination-identity.ts`), effects (`src/effects/state/`), CLI verbs (`src/cli/commands/sprint.ts`) and the two shell helpers with byte-identical template mirrors; P2 traced contract finish end to end - resolve claim token, ownership gate before base freeze, acceptance receipt, base freeze, closeout key derivation, journal-key stamp, journal open, verification, publication, post-publication reconcile; P3 the gate deliberately precedes base freeze so a displaced agent stops before a verification pass it may not publish, which is why the journal key is stamped by a second re-entrant `bound -> completing` call rather than folded into the gate
- Root cause or plan evidence: the four HIGH conformance deviations recorded in `docs/researches/20260819-GPT-kanban.md` and the three fail-closed clauses in its revised section 14

## Verification Evidence

- Waza `/check` run: `repo-harness run verify-sprint --prepare-acceptance` - total=13 failed=0 status=Fulfilled
- Commands run: `bun test` 2628 pass / 1 skip / 0 fail (572.75s); `bun run check:type` exit 0; both helper mirror `cmp` exit 0; targeted suite `tests/coordination-identity.test.ts tests/coordination-lease-store.test.ts tests/sprint-claim-concurrency.test.ts tests/sprint-backlog.test.ts` 119 pass / 0 fail / 770 expect() - all re-run on the rebased tree
- Manual checks: zero-lease precondition confirmed (`<git-common-dir>/repo-harness/coordination/` absent, protocol stays 1, no migration); no residual reference to `sprint_lease_release_after_publication`; owner-record serialization is two-space-indented JSON, matching the shell field reader; `task_id` derivation excludes `task_revision`, so the inline gate cannot be bypassed by row drift
- Supporting artifacts: `.ai/harness/checks/latest.json`, `.ai/harness/runs/run-20260819T170659-87258-20260819-1519-coordination-lease-hardening.json`
- Implementation notes reviewed: yes - `tasks/notes/20260819-1519-coordination-lease-hardening.notes.md`, including the T7 amendment and the recorded spec deviation
- Run snapshot: `.ai/harness/runs/run-20260819T170659-87258-20260819-1519-coordination-lease-hardening.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:035d52a63101c410fedbca4edfbb936b354e975af44c20ed9491508b7a2166a9
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 8d8b683583a450a54a9629a99ed56edec0cbb64c
> **Verification Evidence SHA256**: sha256:e1999c35f40adfcab9054e5989695e141a52454180f09e510ff5258b1f350536
> **Issued At**: 2026-08-19T09:22:53.487Z

- Summary: Gatekeeper acceptance review: VERDICT PASS. Scope on-target (17 files, +1524 -64), every path inside the amended allowed_paths, no extras. All four HIGH spec deviations closed and falsification-pinned: inline complete-task lease gate (scripts/sprint-backlog.sh:515,702), completing refuses steal and release (coordination-identity.ts:553,512), owner record generation/target_ref/finish_transaction_key written, validated and parse-rejected when absent (coordination-identity.ts:286,335), claim/steal legacy fail-closed plus typed GitBinaryUnavailableError (coordination-cutover.ts:57,296), and recordCutoverInstalled moved after runAdoptionApply (init.ts:690). Zero-lease precondition verified: coordination/ absent, protocol stays 1, no migration. Verified in-session on the rebased tree: targeted suite 119 pass/0 fail, bun run check:type exit 0, both helper mirror cmp exit 0, full bun test 2628 pass/1 skip/0 fail.
- Findings: P3: begin-completion without --finish-transaction-key overwrites an existing key with null (sprint.ts:430); harmless today because the field has no consumer and the closeout key is deterministically re-derivable, but must be handled when reconcile starts reading it; P3: reconcile still does not complete the finish journal (spec 9.3); explicitly out of scope for this contract and recorded in the notes deviations section

## Behavior Diff Notes

- A tree that does not hold the owning claim token can no longer flip a claimed sprint row to `[x]`; a clone with no lease store completes inline rows exactly as before.
- `completing` now refuses both `steal` and `release`; post-publication cleanup goes through `reconcile --expected-claim-id`, which clears the lease only on `cleared_completed_lease` and otherwise warns without failing a landed publication.
- Owner records carry `generation`, `target_ref`, and `finish_transaction_key`; `begin-completion` and `reconcile` fail closed when their `--target-ref` disagrees with the ref the claim was taken against.
- `sprint claim` and `sprint steal` refuse on a clone still carrying retired in-flight markers without the v1 protocol marker; a missing `git` binary is a typed error instead of a silently skipped gate.
- The cutover marker is recorded only after the adoption apply succeeds, so a failed init leaves the one-shot gate armed.

## Residual Risks / Follow-ups

- P3: `begin-completion` without `--finish-transaction-key` overwrites an existing key with null (`src/cli/commands/sprint.ts:430`). Harmless today - the field has no consumer and the closeout key is deterministically re-derivable - but it must be handled when `reconcile` starts reading it.
- P3: `reconcile` still does not complete the finish journal (spec section 9.3), explicitly out of scope here and recorded in the notes deviations section.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | n/a | This gate returns PASS/FAIL against the contract, not a score. Every Exit Criteria command passed; each closed deviation has a falsification test |
| Product depth | n/a | Scope held to the four HIGH deviations plus the two call sites this change itself stranded; deferred items stay in `tasks/todos.md` |
| Design quality | n/a | Pure/effects split preserved; the ownership gate keeps its position before base freeze; `reconcile --expected-claim-id` only narrows |
| Code quality | n/a | Helper mirrors byte-identical; no new dependency, no compatibility fallback, no unknown identifier introduced by the diff |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test`, `bun run check:type`, and both helper mirror `cmp` commands
- Re-check: the zero-lease precondition under `<git-common-dir>/repo-harness/coordination/` before any further schema change; once a live lease exists, the same change becomes a protocol bump with a migration

## Summary

- Accepted. The four HIGH conformance deviations against `docs/researches/20260819-GPT-kanban.md` are closed inside the migration-free window, each pinned by a falsification test that asserts behavior rather than implementation shape, with the full required verification green on the rebased tree.
