> **Archived**: 2026-08-20 16:03
> **Related Plan**: plans/archive/plan-20260818-1636-codegraph-explicit-optin.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-1603

# Task Review: codegraph-explicit-optin

> **Status**: Reviewed
> **Plan**: plans/plan-20260818-1636-codegraph-explicit-optin.md
> **Contract**: tasks/contracts/20260818-1636-codegraph-explicit-optin.contract.md
> **Notes File**: tasks/notes/20260818-1636-codegraph-explicit-optin.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-18 18:40
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: src/cli/installer/install-profile.ts, .ai/harness/policy.json, tests/install-profiles.test.ts, docs/reference-configs/install-profiles.md, docs/CHANGELOG.md, plus plan/contract/notes/review workflow artifacts and tasks/todos.md ledger restamp
- Actual files changed: identical to intended (gatekeeper mapped every hunk to the contract scope; no out-of-scope edits)
- Commands passed: bun test (2522 pass / 0 fail), bun test tests/install-profiles.test.ts (31 pass), tsc --noEmit clean, bun src/cli/index.ts init --repo . --dry-run (0 operations), repo-harness run verify-contract --strict (total=9 failed=0 Fulfilled), check-task-workflow --strict OK, check-architecture-sync blocking=0, check-task-sync synchronized
- Residual risks: downstream repos >=2000 tracked files on minimal profile without explicit opt-in lose automatic codegraph enablement (intended semantic change, CHANGELOG noted); direction tension with draft PR #195 (codegraph-mandatory-runtime) needs a human merge-order decision
- Reviewer action required: none beyond PR review
- Rollback: single revert of commit 1c09fb1a; no data or migration surface

## Mode Evidence

- Selected route: plan -> contract worktree -> fast-worker implementation -> gatekeeper PASS
- P1/P2/P3 evidence: integration surface mapped by explorer (four mechanisms: adapter spawn, config writer, hook nudge, per-worktree init); falsifier check ran before edit (rg profileEnablesCodegraph: only two src/cli/index.ts call sites + tests)
- Root cause or plan evidence: plans/plan-20260818-1636-codegraph-explicit-optin.md (doc-vs-code contract divergence, not a bugfix profile)

## Verification Evidence

- Waza `/check` run: gatekeeper review (VERDICT: PASS) with hunk-to-scope mapping and hard-stop sweep
- Commands run: see Human Review Card; verify-sprint --prepare-acceptance total=9 failed=0 Fulfilled
- Manual checks: profileEnablesCodegraph probed for self-host minimal/full -> true and /tmp minimal -> false; large-repo test asserts a real 2100-file git index before the negative assertion
- Supporting artifacts: .ai/harness/checks/latest.json (status pass), run snapshot below
- Implementation notes reviewed: tasks/notes/20260818-1636-codegraph-explicit-optin.notes.md
- Run snapshot: .ai/harness/runs/run-20260818T182350-44616-20260818-1636-codegraph-explicit-optin.json

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:766e08c90fcfcc34f522e37aa981ff6a3657d0a33ffd0e212dcd1c05bfa9e2b2
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 5cdfe9c2c52deb81fdb76eb42587586825eb1a49
> **Verification Evidence SHA256**: sha256:a5478add5752d647bd09ba8fa0f742ef3718055dd8864e88b997918ca4553466
> **Issued At**: 2026-08-18T10:55:08.855Z

- Summary: Gatekeeper PASS: size heuristic removed, enablement purely explicit opt-in; scope maps hunk-for-hunk to contract; bun test 2522 pass, tsc clean, verify-contract Fulfilled 9/9
- Findings: none

## Behavior Diff Notes

- Enablement semantics: implicit size-based auto-enable removed; only `full` profile or explicit `tooling.codegraph.enabled: true` enables codegraph. Policy read/parse failure fails closed to disabled.
- Self-host behavior unchanged (explicit opt-in added to this repo's policy.json before the heuristic was removed).

## Residual Risks / Follow-ups

- Merge-order decision needed against draft PR #195 (codegraph-mandatory-runtime), which pushes enablement in the opposite direction.
- One-time flake noted in tasks/notes (install-profiles CLI dry-run test failed once while node_modules was missing); not reproducible after install, unrelated to this change.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Three enablement semantics covered by tests incl. real 2100-file negative case |
| Product depth | 8/10 | Closes doc-vs-code contract divergence; CHANGELOG names the downstream semantic change |
| Design quality | 9/10 | Fail-closed, heuristic removed rather than documented; smallest coherent change |
| Code quality | 9/10 | Net -4 lines in product code; dead import removed; no new abstraction |

## Failing Items

- none

## Retest Steps

- Re-run: bun test tests/install-profiles.test.ts && bun run check:type
- Re-check: bun src/cli/index.ts init --repo . --dry-run

## Summary

- Codegraph enablement is now purely explicit opt-in; gatekeeper PASS with full verification evidence; ship as PR #202.
