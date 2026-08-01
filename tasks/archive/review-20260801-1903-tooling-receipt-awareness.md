> **Archived**: 2026-08-01 19:03
> **Related Plan**: plans/archive/plan-20260801-1255-tooling-receipt-awareness.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260801-1903

# Task Review: tooling-receipt-awareness

> **Status**: Complete
> **Plan**: plans/plan-20260801-1255-tooling-receipt-awareness.md
> **Contract**: tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md
> **Notes File**: tasks/notes/20260801-1255-tooling-receipt-awareness.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-01 19:10
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:8a48a87d4183098e73ae4f89c74fed8f1767410bd1f5272e245d4ec977b74183
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 27c42d773c5f3b46563fdbcf69a43a49288a49c6

## Human Review Card

- Verdict: pass (gatekeeper PASS on the pre-merge diff, zero blocking findings)
- Change type: code-change
- Intended files changed: `scripts/check-agent-tooling.sh` plus its `assets/templates/helpers/` mirror, `tests/check-agent-tooling.test.ts`, and this contract's plan/contract/notes set
- Actual files changed: exactly that set (7 paths), verified against `git show e5498b86 --stat` — `assets/templates/helpers/check-agent-tooling.sh`, `scripts/check-agent-tooling.sh`, `tests/check-agent-tooling.test.ts`, `plans/plan-20260801-1255-tooling-receipt-awareness.md`, `tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md`, `tasks/notes/20260801-1255-tooling-receipt-awareness.notes.md`, `tasks/current.md`; no extras
- Commands passed: `bun test tests/check-agent-tooling.test.ts` 18 pass/0 fail; `bun test tests/cli/init-hook.test.ts` 20 pass/0 fail; `bun scripts/sync-helper-sources.ts --check`; `cmp` mirror byte-identity; `repo-harness run check-task-workflow --strict`; real-machine `bash scripts/check-agent-tooling.sh --host both --check-updates`; full `bun test` on the execution branch 2123 pass/0 fail; PR CI and post-merge main CI (run 30685622738, Test + MCP matrix, three platforms) green
- Residual risks: the `--check-updates` receipt tests hit the network unstubbed at merge time and flaked in isolated runs; fixed afterwards by #150 (`27c42d77`). `docs/reference-configs/external-tooling.md` `### Readiness` prose stayed stale at merge; corrected by #149.
- Reviewer action required: none
- Rollback: revert `e5498b86` — the drift check returns to plain packaged-source comparison with the receipt ignored (the false positive returns, no worse than before)

## Mode Evidence

- Selected route: plan -> contract -> worktree execution on `codex/tooling-receipt-awareness`, fast-worker implementation with a read-only gatekeeper review before merge.
- P1/P2/P3 evidence: `plans/plan-20260801-1255-tooling-receipt-awareness.md`; the drift classifier in `detectAgentFleetHost()` was the single pressure point, with `~/.repo-harness/agent-fleet-user-managed.json` (written by `install-agent-fleet.sh --accept-user-managed`) as the authority it failed to consult.
- Root cause or plan evidence: `scripts/check-agent-tooling.sh` compared installed agent `.md` files against packaged `agents/fleet/` source with zero receipt awareness, so an accepted customization read as permanent `drift`.

## Verification Evidence

- Waza `/check` run: gatekeeper read-only review of commit `39e038f1` (squash-merged as `e5498b86`), covering both autonomous decisions plus a full-repo consumer scan.
- Commands run: see Human Review Card.
- Manual checks: real-machine `bash scripts/check-agent-tooling.sh --host both --check-updates` and `--host claude` both surfaced the user-managed exemption line with no drift.
- Supporting artifacts: PR #148; post-merge main CI run 30685622738.
- Implementation notes reviewed: yes — `tasks/notes/20260801-1255-tooling-receipt-awareness.notes.md`.
- Run snapshot: `.ai/harness/runs/`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:8a48a87d4183098e73ae4f89c74fed8f1767410bd1f5272e245d4ec977b74183
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 27c42d773c5f3b46563fdbcf69a43a49288a49c6
> **Verification Evidence SHA256**: sha256:c9a4bf085da12f44c269b01231613eba2c014c3ac8316b87175e57860860a05c
> **Issued At**: 2026-08-01T11:03:09.779Z

- Summary: gatekeeper PASS (pre-merge review of commit 39e038f1, squash-merged to main as e5498b86, PR #148). detectAgentFleetHost()'s claude branch now consults the --accept-user-managed receipt (~/.repo-harness/agent-fleet-user-managed.json) before classifying a byte difference against the packaged agents/fleet/ source as drift: an entry whose sha256 still matches the installed file's current content reclassifies it as user-managed and excludes it from drift_agents; every other case (missing/malformed receipt, no entry for that path, hash mismatch) still resolves to drift, fail-closed. The per-host rollup update_status literal rename from synced to up-to-date was confirmed safe by a full-repo consumer scan: the sole code consumer, updateNeedsAgent() in src/cli/commands/init-hook.ts, pins update-available|outdated|stale, and the per-host agent_fleet update_status never flows into toolCheckStatus(). Omitting the installer's allowedPaths whitelist in the new loadAgentFleetUserManagedReceipt() reader was judged necessary, not a gap: a real-machine receipt legitimately carries cross-host entries, and applying the installer's fixed 12-path allow-list to a single-host --host claude invocation would misclassify the whole receipt as invalid. Fail-closed exemption semantics are backed by direct test assertions, including an authority mismatch with an otherwise-matching hash still producing zero exemptions. Verification actually run: bun test tests/check-agent-tooling.test.ts 18 pass/0 fail; bun test tests/cli/init-hook.test.ts 20 pass/0 fail; bun scripts/sync-helper-sources.ts --check projection OK; assets/templates/helpers/check-agent-tooling.sh mirror cmp IDENTICAL; repo-harness run check-task-workflow --strict OK; real-machine bash scripts/check-agent-tooling.sh --host both --check-updates and --host claude both showed the user-managed exemption line with no drift; full bun test on the execution branch: 2123 pass/0 fail. Post-merge main CI (run 30685622738), Test + MCP matrix across all three platforms, all green. This AcceptanceReceipt is recorded retroactively during the receipt-awareness-closeout task, after the change had already merged directly to main without going through contract-worktree finish/ship-worktrees; the orchestrator explicitly authorized and dictated this evidence for the record, and independently re-verified on this machine: standalone bun test 2123 pass/1 skip/0 fail, and bash scripts/verify-contract.sh --contract tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md --strict --read-only reporting 11/11 checks pass, status=Fulfilled.
- Findings: none

## Behavior Diff Notes

- Before: any byte difference between an installed agent `.md` and the packaged `agents/fleet/` source classified as `drift`, with no way to clear an intentionally accepted customization short of reverting it or re-running `--force`.
- After: a well-formed receipt entry whose sha256 still matches the installed file's current content reclassifies that file as `user-managed` and excludes it from `drift_agents`; the per-host rollup `update_status` becomes `up-to-date` and the text output prints the exemption on its own line.
- Fail-closed cases unchanged: no receipt, malformed receipt, no entry for the path, or a stale hash all still resolve to `drift`.

## Residual Risks / Follow-ups

- The `--check-updates` receipt tests were merged without stubbing `curl`, so they reached the network and flaked in isolated runs; closed by #150 (`27c42d77`).
- `### Readiness` prose in `assets/reference-configs/external-tooling.md` still described the pre-#148 behavior at merge time; closed by #149 (`048ced89`).

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/check-agent-tooling.test.ts`
- Re-check: `bash scripts/check-agent-tooling.sh --host both --check-updates` against a receipt-accepted agent file

## Summary

Receipt-aware drift classification shipped as specified, fail-closed on every non-matching case, with the `update_status` literal rename cleared by a consumer scan. Merged as `e5498b86` (PR #148); two follow-ups it left open were closed by #149 and #150. Archived here with a reproducible gate-produced pass state.
