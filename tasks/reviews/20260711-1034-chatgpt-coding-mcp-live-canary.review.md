# Task Review: chatgpt-coding-mcp-live-canary

> **Status**: Complete
> **Plan**: plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md
> **Contract**: tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md
> **Notes File**: tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-11 13:29
> **Recommendation**: fail
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: 99556958f6401742c4b98e0941f82d3b2b6f53c16b42d7bcb226a8953c4cd12d
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: `surface_blocked` after a real partial invocation; do not accept as complete `invocation_verified`
- Change type: eval-only
- Intended files changed: live-canary plan/contract/notes/review only
- Actual files changed: `plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md` and the matching contract/notes/review
- Commands passed: feature-worktree typecheck and task-sync; local/public/OAuth/schema diagnostics; rollback byte comparison; process/listener and Git status checks; strict task-workflow passed after refreshing the handoff packet
- External acceptance: unavailable because the non-Pro retest created a workspace but did not preserve the MCP session for the following read
- Residual risks: ChatGPT issued sequential coding calls under different MCP sessions, so workspace- and process-session-bound multi-call flows cannot complete
- Reviewer action required: none for this blocked classifier; do not merge or mark the original coding MCP live acceptance complete
- Rollback: temporary App deleted, foreground server/Tunnel stopped, copied credentials removed, ignored user config/plists restored byte-for-byte, canary repo retained clean

## Mode Evidence

- Selected route: eval-only live canary in isolated contract worktree
- P1/P2/P3 evidence: P1 separated local runtime, ignored config, Cloudflare, OAuth, and ChatGPT App; P2 traced the live route through schema discovery to the model surface; P3 isolated the canary App/repo and stopped at the first externally controlled missing interface.
- Root cause or plan evidence: App settings had the current coding actions and OAuth connection; the non-Pro structured-App conversation created a real workspace, then its read failed because the workspace belonged to another MCP session.

## Verification Evidence

- Waza `/check` run: manual Waza-style review recorded here; recommendation remains fail because the real invocation exit criterion did not pass.
- Commands run: `bun run check:type`; `bash scripts/check-task-sync.sh`; `repo-harness run check-task-workflow --strict`; feature-worktree `mcp doctor --live`; Cloudflare-edge health/OAuth/MCP probes; rollback `cmp`; `ps`, `lsof`, and both Git status checks.
- Manual checks: ChatGPT App settings exact coding schemas; structured App mention in a fresh non-Pro Chat; real worktree/audit creation; cross-session read failure; App deletion; resolver/config restoration; process shutdown.
- Supporting artifacts: this review, matching notes, preserved managed worktree/audit, and `https://chatgpt.com/c/6a51d385-ca3c-83ea-909e-a523079301f5`.
- Implementation notes reviewed: yes
- Run snapshot: `.ai/harness/checks/latest.json`

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- P1 blockers: ChatGPT created `open_workspace` and then called `read` from another MCP session; the server correctly rejected the workspace ID and OpenAI safety blocked the retry.
- P2 advisories: temporary split-DNS removal solved local OAuth navigation and was fully restored; it is no longer the canary's first failing boundary.
- Acceptance checklist: endpoint/schema/selection/open-workspace passed; read/patch/process/poll/readback did not complete.

## Behavior Diff Notes

- No repo-harness product behavior changed. This slice only exercised the already implemented coding profile against live Cloudflare/OAuth/ChatGPT surfaces.
- The live system reached App connection, action discovery, and a real `open_workspace` invocation. The first failing boundary is ChatGPT's next tool call using a different MCP session than the workspace owner.
- The dedicated source repo was restored clean. The managed worktree and metadata-only audit are preserved; no source patch or process ran.

## Residual Risks / Follow-ups

- The product needs a design decision for ChatGPT sequential tool calls that do not preserve `Mcp-Session-Id`; any change must retain token/repo authorization and process-session isolation.
- `/etc/resolver/repoharness.com` remains a host-level split-DNS false-negative source for `doctor --live`; it was temporarily moved under explicit authorization and restored byte-for-byte.
- Pre-existing launchd MCP plists remain in their exact pre-canary stopped/stale state; this eval-only slice did not repair persistence.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 6/10 | Endpoint, OAuth, schema, selection, and open-workspace passed; cross-session read blocked the required multi-tool sequence. |
| Security | 10/10 | Dedicated repo/App, explicit coding grant, no secret output, no unrelated Cloudflare mutation, exact rollback. |
| Product depth | 8/10 | The canary reached the true model-tool boundary and produced a falsifiable classifier instead of setup-only evidence. |
| Design quality | 9/10 | Disposable App and foreground processes isolated rollback from existing user state. |
| Code quality | 10/10 | No product code changed; workflow evidence is scoped and sanitized. |

## Failing Items

- No complete visible `Called tool` sequence for read, patch, process, poll, and readback.
- `open_workspace` created a real worktree/audit, but `read` failed with cross-session `WORKSPACE_NOT_FOUND`; no patch file or process output exists.
- Contract manual acceptance and functionality score threshold therefore remain unmet.

## Retest Steps

- Re-run only after resolving the workspace/process ownership contract for ChatGPT calls that arrive under different MCP sessions, then submit the same bounded five-tool sequence.
- Re-check: require visible tool entries, server-side metadata-only audit, and exact file contents before changing the classifier to `invocation_verified`.

## Summary

- The live canary safely proved Cloudflare, OAuth, App connection, exact coding schema, and a real `open_workspace` call. It then exposed a concrete incompatibility: ChatGPT's next tool call used another MCP session, so `read` failed closed. The correct outcome remains `surface_blocked`, not product acceptance. Rollback completed and main WIP was preserved.
