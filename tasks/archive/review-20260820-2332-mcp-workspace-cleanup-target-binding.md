> **Archived**: 2026-08-20 23:32
> **Related Plan**: plans/archive/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-2332

# Task Review: mcp-workspace-cleanup-target-binding

> **Status**: Pending
> **Plan**: plans/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md
> **Contract**: tasks/contracts/20260820-2054-mcp-workspace-cleanup-target-binding.contract.md
> **Notes File**: tasks/notes/20260820-2054-mcp-workspace-cleanup-target-binding.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-20 22:51
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: local implementation and safety review pass; AcceptanceReceipt pending.
- Change type: bugfix.
- Intended files changed: managed MCP workspace open/cleanup contracts, CLI cleanup target input, focused tests, and workflow artifacts.
- Actual files changed: `src/cli/mcp/coding-workspaces.ts`, `src/cli/mcp/coding-tools.ts`, `src/cli/commands/mcp.ts`, `tests/cli/mcp-coding-tools.test.ts`, and the active plan/contract/review/notes/todo surfaces.
- Commands passed: 15 focused tests; TypeScript; 2,742 full-suite passes with one platform skip; deploy, architecture, task, workflow, inspector, adoption dry-run, CLI help, contract verifier, and package-content checks.
- Residual risks: merge classification still invokes packaged Bash, so native Windows cleanup fails closed as `MERGE_CHECK_UNAVAILABLE` until the separately scoped platform contract is fixed.
- Reviewer action required: issue the contract-frozen Claude semantic acceptance; external diff transmission is authorized in the current thread.
- Rollback: revert target persistence/resolution, merge classification, atomic ref deletion, CLI option, and focused tests as one unit; legacy rows were never rewritten.

## Mode Evidence

- Selected route: approved P1 bugfix work-package in isolated contract worktree; Waza `/check` Deep-equivalent review performed locally.
- P1/P2/P3 evidence: the plan maps MCP coding tool -> workspace manager -> persisted state -> cleanup CLI -> Git/ref deletion; traces creation and cleanup end to end; records why `baseRef/baseSha` and integration target remain separate authorities.
- Root cause or plan evidence: pre-fix regression proves cleanup-time source `HEAD` could authorize deletion while the intended `main` target lacked the workspace branch.

## Verification Evidence

- Waza `/check` run: Deep local pass, including security, architecture, destructive-sink, and four-angle adversarial review. No P1/P2 implementation finding remains.
- Commands run: `bun test tests/cli/mcp-coding-tools.test.ts --timeout 60000`; `CODEX_SESSION_ID= bun test --timeout 60000`; `bun run check:type`; all root required checks; `bash scripts/verify-contract.sh ... --strict`; CLI help; `bun pm pack --dry-run`.
- Manual checks: wrong source `HEAD` retains branch/worktree/state; direct and squash merge permit cleanup; detached managed creation and legacy target absence fail closed; unmanaged detached checkout remains available; concurrent ref movement retains branch/state; tarball contains `scripts/worktree-merge-lib.sh`.
- Supporting artifacts: `.ai/harness/runs/mcp-workspace-cleanup-target-binding/pre-fix-regression.txt`; `/tmp/mcp-target-contract.json` (local runtime report).
- Implementation notes reviewed: yes.
- Run snapshot: 2,742 pass / 1 Windows-only skip / 0 fail across 201 files; 21,042 expectations; 719.93 seconds. Strict contract verifier: 25/25 pass in 709.87 seconds.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:70dfcdb99fa75d68f8c9ff03a196ed2e9eb5d924c5294f71b5665d1de366d56f
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: f2da30f8a161d2d4892d60fc6165acde8b77547d
> **Verification Evidence SHA256**: sha256:97cdb698080422939e91f004e06eab57d2e57d5d02a1ae7eb4cc95b5341bfb9b
> **Issued At**: 2026-08-20T15:25:09.939Z

- Summary: External Claude semantic review passed with six P2 advisories and no P0/P1 findings.
- Findings: P2: Bound integration target refs cannot be overridden if the recorded target is deleted; cleanup fails closed and requires operator ref repair.; P2: Any atomic update-ref transaction failure is surfaced as WORKSPACE_REFS_CHANGED, so non-race Git failures share the ref-change diagnostic.; P2: When the workspace root is already absent, cleanup skips git worktree remove and may leave stale administrative worktree metadata.; P2: checkout mode silently discards an explicitly supplied integration_target_ref instead of rejecting the incompatible input.; P2: The concurrent-ref regression exercises the exported atomic helper directly instead of the complete cleanup path.; P2: The MCP schema description says integration_target_ref defaults to HEAD, but the schema omits an explicit default field.

## Behavior Diff Notes

- Managed worktree creation now resolves the cleanup authority to one canonical local/remote branch ref; symbolic `HEAD` is frozen to its branch, while detached `HEAD`, tags, and commit IDs are rejected as cleanup authorities.
- Cleanup snapshots the workspace branch and recorded target commits, classifies only those immutable commits through the shared direct/squash merge authority, and rejects unmerged or unavailable classifications before mutation.
- After worktree removal, one `git update-ref --stdin` transaction verifies the target still names the classified commit and deletes only the classified branch commit. Ref movement retains the branch and state row.
- Existing state rows without a stable target require explicit CLI `--target`; a target cannot override a new bound record. Unmanaged checkout mode records no cleanup target and retains its previous detached-HEAD behavior.

## Safety Sink Review

- Validation boundary: user/MCP target input is passed as an argv element, resolved to exactly one canonical `refs/heads/*` or `refs/remotes/*` ref, and never interpolated into a shell command.
- Deletion authority: dirty worktrees, missing/malformed targets, unmerged commits, invalid helper output, and moving refs all fail closed before branch deletion; exact commit/ref values feed the atomic ref transaction.
- Partial failure: if the ref transaction fails after worktree removal, branch and state survive and the error names the ref-change condition. If the final state write fails after proven branch deletion, the stale row is visible for operator repair; this pre-existing cross-store atomicity limit does not lose unmerged commits.
- Rollback/retry: no state migration occurs; legacy rows remain untouched until an explicit target succeeds.

## Release Gate 2.0

| Surface | Evidence |
|---|---|
| Review base | Isolated branch `codex/mcp-workspace-cleanup-target-binding` from recorded base `5613f6bd`; current release version 0.16.0. |
| Worktree state | All modified/untracked files enumerated; primary checkout's pre-existing projection-manifest edit remains outside this worktree. |
| Remote state | Not checked; no push/publish/release action is in this slice. |
| Version fields | n/a; bugfix is not being released in this task. |
| Distribution lane | Local source/contract worktree only. |
| Runtime dependencies | Reuses existing packaged Bash helper; no new dependency. Native Windows remains fail-closed and out of scope. |
| Generated artifacts | Hook bundle rebuilt by package dry-run; no source projection drift detected. |
| Package/archive contents | `bun pm pack --dry-run` includes `scripts/worktree-merge-lib.sh` and updated MCP TypeScript sources. |
| Installed runtime | CLI help and source entrypoint exercised; no global installation performed. |
| Release assets | n/a. |
| Registry/appcast | n/a. |
| CI status | Local full suite and strict contract verifier pass; remote CI not started. |
| Issue/PR state | No remote issue/PR mutation authorized or performed. |

## Residual Risks / Follow-ups

- Native Windows cannot execute the Bash merge authority; cleanup fails closed without deleting data. This is the separate Windows platform-contract P1 already identified by the issue analysis.
- Persisted workspace state and Git refs are separate stores. A failure after a proven atomic ref deletion can leave a stale visible state row, but cannot authorize deletion of unmerged work.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Wrong-HEAD, direct, squash, legacy, detached, and moving-ref cases are covered. |
| Product depth | 9/10 | Operator-visible target and explicit legacy path are present; Windows portability remains separate. |
| Design quality | 9/10 | One merge authority and an atomic ref transaction protect the destructive invariant. |
| Code quality | 9/10 | Focused regression plus full repository and contract verification pass. |

## Failing Items

- None in implementation or local verification. Workflow closeout remains gated only on the contract-required semantic AcceptanceReceipt.

## Retest Steps

- Re-run: `bun test tests/cli/mcp-coding-tools.test.ts --timeout 60000` after any semantic edit.
- Re-check: `CODEX_SESSION_ID= bun test --timeout 60000`, root required checks, and strict contract verification if production/test semantics change.

## Summary

- Pass locally. Cleanup no longer consults incidental source `HEAD`; it deletes only after the persisted target proves direct or squash absorption, and atomic ref verification prevents a concurrent target/branch move from widening the deletion decision.
