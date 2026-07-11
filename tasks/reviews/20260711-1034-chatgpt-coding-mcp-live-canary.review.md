# Task Review: chatgpt-coding-mcp-live-canary

> **Status**: Complete
> **Plan**: plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md
> **Contract**: tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md
> **Notes File**: tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-11 15:23
> **Recommendation**: fail
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: 99556958f6401742c4b98e0941f82d3b2b6f53c16b42d7bcb226a8953c4cd12d
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: functional live canary passed; retain `surface_blocked` only because the strict current-UI transcript criterion did not visibly enumerate every call
- Change type: eval-only
- Intended files changed: live-canary plan/contract/notes/review only
- Actual files changed: `plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md` and the matching contract/notes/review
- Commands passed: feature-worktree typecheck and task-sync; local/public/OAuth/schema diagnostics; rollback byte comparison; process/listener and Git status checks; strict task-workflow passed after refreshing the handoff packet
- External acceptance: functional execution verified from the ChatGPT result, managed-worktree files, and metadata-only audit; literal full `Called tool` transcript remains unavailable in the current UI
- Residual risks: the Activity panel did not expose every call row, and after disposable-App deletion the conversation URL rendered empty; therefore the exact `write_stdin` poll cannot be independently distinguished from process completion even though the bounded process and final readback succeeded
- Reviewer action required: none for this blocked classifier; do not merge or mark the original coding MCP live acceptance complete
- Rollback: temporary App deleted, foreground server/Tunnel stopped, copied credentials removed, ignored user config/plists restored byte-for-byte, canary repo retained clean

## Mode Evidence

- Selected route: eval-only live canary in isolated contract worktree
- P1/P2/P3 evidence: P1 separated local runtime, ignored config, Cloudflare, OAuth, and ChatGPT App; P2 traced the live route through schema discovery to the model surface; P3 isolated the canary App/repo and stopped at the first externally controlled missing interface.
- Root cause or plan evidence: App settings had the current coding actions and OAuth connection; commit `2a9d49053acf` bound runtime ownership to the OAuth authorization, and the post-fix structured-App conversation completed read/patch/process/readback across transport sessions.

## Verification Evidence

- Waza `/check` run: manual Waza-style review recorded here; recommendation remains fail only because the literal full transcript exit criterion did not pass.
- Commands run: `bun run check:type`; `bash scripts/check-task-sync.sh`; feature-worktree `mcp doctor --live`; Cloudflare-edge health/OAuth/MCP probes; rollback `cmp`; `ps`, `lsof`, and both Git status checks. Default `repo-harness run check-task-workflow --strict` reached only an unrelated shared-brain `external-tooling.md` drift from another worktree; the same strict gate passed after copying the default vault to a temporary isolated root and reprojecting this branch's repo-authored docs there, without overwriting shared brain state.
- Manual checks: ChatGPT App settings exact coding schemas; structured App in a fresh Chat; cross-transport workspace reuse; matching patch/process files; metadata-only audit; App deletion; resolver/config restoration; process shutdown.
- Supporting artifacts: this review, matching notes, preserved managed worktree/audit, and `https://chatgpt.com/c/6a51ed4c-b6d8-83ea-904b-8b2b3debe7a7`.
- Implementation notes reviewed: yes
- Run snapshot: `.ai/harness/checks/latest.json`

## External Acceptance Advice

> **External Acceptance**: partial
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- P1 blockers: no functional blocker remains; only the current ChatGPT transcript surface omitted literal `Called tool` labels and some call rows.
- P2 advisories: the temporary resolver move solved local OAuth navigation and was restored; the isolated canary repo has no CodeGraph index, so refresh events record expected non-retryable `INDEX_UNAVAILABLE`.
- Acceptance checklist: endpoint/schema/selection/open-workspace/cross-transport read/patch/process/final readback passed; literal complete UI transcript did not.

## Behavior Diff Notes

- The prerequisite product fix in commit `2a9d49053acf` changed coding runtime ownership from transport session to OAuth authorization while preserving grant isolation and revocation cleanup.
- The live system reached App connection, action discovery, cross-transport workspace reuse, atomic patch, process completion, and exact final readback through Cloudflare/OAuth.
- The dedicated source repo remained clean. The successful managed worktree and metadata-only audit are preserved with the intended patch and process output.

## Residual Risks / Follow-ups

- Current ChatGPT Activity UI does not enumerate every tool call, and the conversation did not remain readable after the required disposable-App deletion, so the strict transcript-only classifier cannot distinguish the polling call from the otherwise verified process sequence.
- `/etc/resolver/repoharness.com` remains a host-level split-DNS false-negative source for `doctor --live`; it was temporarily moved under explicit authorization and restored byte-for-byte.
- Pre-existing launchd MCP plists remain in their exact pre-canary stopped/stale state; this eval-only slice did not repair persistence.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | The full local coding sequence completed; one point remains for literal complete current-UI transcript visibility. |
| Security | 10/10 | Dedicated repo/App, explicit coding grant, no secret output, no unrelated Cloudflare mutation, exact rollback. |
| Product depth | 8/10 | The canary reached the true model-tool boundary and produced a falsifiable classifier instead of setup-only evidence. |
| Design quality | 9/10 | Disposable App and foreground processes isolated rollback from existing user state. |
| Code quality | 10/10 | No product code changed; workflow evidence is scoped and sanitized. |

## Failing Items

- No literal complete visible `Called tool` sequence for read, patch, process, poll, and readback in the current Activity UI.
- Functional execution and the functionality score threshold now pass, but the contract's binary manual transcript criterion remains unmet.

## Retest Steps

- Re-run only when the ChatGPT surface exposes every tool row or another user-visible transcript source can prove the patch/process/poll calls without relying on model prose.
- Re-check: keep the same bounded prompt and require literal visible entries plus the already passing metadata-only audit and exact file contents before changing the classifier to `invocation_verified`.

## Summary

- The post-fix live canary safely proved Cloudflare, OAuth, App connection, exact coding schema, cross-transport workspace reuse, atomic patch, bounded process execution, and exact local readback. Direct local coding is functionally verified. The strict result remains `surface_blocked` only because the current Activity UI did not expose a literal complete `Called tool` transcript. Rollback completed and main WIP was preserved.
