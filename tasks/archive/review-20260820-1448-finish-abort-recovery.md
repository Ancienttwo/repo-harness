> **Archived**: 2026-08-20 14:48
> **Related Plan**: plans/archive/plan-20260820-1245-finish-abort-recovery.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-1448

# Task Review: finish-abort-recovery

> **Status**: Reviewed
> **Plan**: plans/plan-20260820-1245-finish-abort-recovery.md
> **Contract**: tasks/contracts/20260820-1245-finish-abort-recovery.contract.md
> **Notes File**: tasks/notes/20260820-1245-finish-abort-recovery.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-20 14:23
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass; no actionable finding in the final diff.
- Change type: code-change
- Intended files changed: pure lease transition, Sprint CLI, source/template closeout helper, three focused test files, two architecture projections, and this work-package's plan/contract/notes/review/Todo clause.
- Actual files changed: exactly the 14 intended tracked/untracked paths; no dependency, schema, generated bundle, or unrelated Mode/no-lease behavior changed.
- Commands passed: focused 97-test suite; `bun run check:type`; complete `bun test` (2708 pass, one platform skip); helper projection/mirror; CLI help; tarball install smoke; every root required check.
- Residual risks: lease and closeout journal remain separate durable stores. The chosen lease-first abort ordering is retry-idempotent; a persistent lease write failure deliberately retains recovery ownership and fails closed.
- Reviewer action required: record the contract-frozen Claude AcceptanceReceipt; this Markdown recommendation is not that authority.
- Rollback: revert the single work-package commit; no migration or persisted schema version changed.

## Mode Evidence

- Selected route: Waza `/check` default review over the full isolated worktree diff.
- P1/P2/P3 evidence: architecture and concrete trace are frozen in `plans/plan-20260820-1245-finish-abort-recovery.md`; final review re-walked normal failure, pre-journal crash, journal crash, published reconcile, and second-agent takeover paths.
- Root cause or plan evidence: `.ai/harness/runs/finish-abort-recovery.pre-fix.log` plus the contract's four-field Root Cause Evidence.

## Verification Evidence

- Waza `/check` run: complete; safety-sink review covered shell quoting, target-ref provenance, per-task locking, canonical completion authority, destructive journal cleanup boundaries, and rollback ordering.
- Commands run: see Human Review Card and implementation notes; every contract Exit Criteria command passed.
- Manual checks: CLI usage/required options, source/template byte parity, target-ref persistence for pre-journal recovery, canonical `[x]` and landed-publication refusal, idempotent abort replay, pending revision-drift recovery, and Change Assessment selection with deterministic/runtime oracles.
- Supporting artifacts: `.ai/harness/runs/finish-abort-recovery.pre-fix.log`, `.ai/harness/checks/latest.json` after acceptance preparation.
- Implementation notes reviewed: yes; the cross-store ordering and no-revision abort decision match code and tests.
- Run snapshot: final full suite at 2026-08-20 14:22 +0800; 2708 pass, 1 skip, 0 fail.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:97216dc6da94e974f27cb593cc0b3b9594cd762e9f4a80f80297eb3d684607b2
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 92170e6de40729e6f2bf0bf740f2c3c1603b4c09
> **Verification Evidence SHA256**: sha256:1b49793e985d671fd8cdf8a3455945db4ba12cfdf66e4821e4b8249fc97980f1
> **Issued At**: 2026-08-20T06:47:37.412Z

- Summary: Read-only acceptance review of codex/finish-abort-recovery rebased onto main 92170e6d (head cd998a18+receipt projection). Same reviewed content as subject sha256:97216dc6...607b2 assessment: diff matches contract goal/scope with zero allowed-paths drift; fenced abort-completion transition verified in code; helper mirror byte-identical; targeted suites pass, tsc clean, sync checks pass; pre-fix falsifier log confirms the unfixed failure. Three P3 informational findings recorded, none blocking.
- Findings: P3: Pre-journal orphan claim written by a pre-upgrade helper (owner.json without target_ref) with a live lease token makes recover abort fail closed at scripts/contract-worktree.sh:716; operator must manually remove the claim directory. Document the manual cleanup path.; P3: finish --no-merge success path leaves the lease in completing (pre-existing behavior at scripts/contract-worktree.sh:1876, out of contract scope; unchanged by this diff).; P3: Comment enumerations of lock-reread verbs in src/core/state/types.ts:206 and src/effects/state/resolve-board.ts:27 omit abort-completion; both files are outside allowed_paths — fold into the next coordination work-package.

## Behavior Diff Notes

- Failed pre-publication finish now restores the same claim/worktree lease from `completing` to `bound` and clears its finish key.
- `recover abort` performs the same fenced transition for pre-journal and journal crash windows; a second Agent can then use the existing `steal` + `bind` flow.
- Completed/missing canonical rows and landed publication remain fail-closed; `recover reconcile` is unchanged.
- The approved no-lease completion path and contract-row Mode policy are untouched.

## Residual Risks / Follow-ups

- The remaining WP1 items in `tasks/todos.md` are unchanged: audit events, topology orphan cleanup, finish-journal reconcile, canonical-worktree dirty check, and stamped-key nulling protection.
- No new follow-up is required for this slice; the only unclosed workflow step is the independently issued AcceptanceReceipt.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Normal failure, SIGKILL recovery, and real takeover are covered end to end. |
| Product depth | 9/10 | Solves only the due residual and preserves the explicitly deferred siblings. |
| Design quality | 9/10 | One fenced mutation and one clear publication-proof owner; cross-store atomicity is handled by idempotent ordering. |
| Code quality | 9/10 | Pure transition, locked CLI, exact helper mirror, and adversarial tests; shell transaction complexity remains inherent. |

## Failing Items

- None in the reviewed implementation or final verification run.

## Retest Steps

- Re-run: `bun test tests/coordination-identity.test.ts tests/coordination-lease-store.test.ts tests/continuation-conformance.test.ts tests/contract-worktree-closeout-journal.test.ts` and `CODEX_SESSION_ID='' CODEX_THREAD_ID='' bun test` with real process/HOME/socket permissions.
- Re-check: `bun run check:type`, helper projection/mirror, root required checks, CLI help, and tarball installation smoke.

## Summary

- Pass. The former cross-Agent handoff break is closed without reopening canonical completed work or changing the disputed Mode/no-lease policy.
