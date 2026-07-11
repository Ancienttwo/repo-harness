# Task Review: chatgpt-coding-mcp-live-canary

> **Status**: Complete
> **Plan**: plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md
> **Contract**: tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md
> **Notes File**: tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-11 11:04
> **Recommendation**: fail
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: 99556958f6401742c4b98e0941f82d3b2b6f53c16b42d7bcb226a8953c4cd12d
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: `surface_blocked`; do not accept as `invocation_verified`
- Change type: eval-only
- Intended files changed: live-canary plan/contract/notes/review only
- Actual files changed: `plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md` and the matching contract/notes/review
- Commands passed: feature-worktree typecheck and task-sync; local/public/OAuth/schema diagnostics; rollback byte comparison; process/listener and Git status checks; strict task-workflow passed after refreshing the handoff packet
- External acceptance: unavailable because the selected ChatGPT Pro conversation had no App `api_tool` surface
- Residual risks: another eligible ChatGPT model/account surface is still required for the real read/patch/process transcript; the host split-DNS override still makes local public-origin doctor probing fail
- Reviewer action required: none for this blocked classifier; do not merge or mark the original coding MCP live acceptance complete
- Rollback: temporary App deleted, foreground server/Tunnel stopped, copied credentials removed, ignored user config/plists restored byte-for-byte, canary repo retained clean

## Mode Evidence

- Selected route: eval-only live canary in isolated contract worktree
- P1/P2/P3 evidence: P1 separated local runtime, ignored config, Cloudflare, OAuth, and ChatGPT App; P2 traced the live route through schema discovery to the model surface; P3 isolated the canary App/repo and stopped at the first externally controlled missing interface.
- Root cause or plan evidence: App settings had the current five coding actions and OAuth connection, while the fresh structured-App conversation explicitly lacked `api_tool` and generated no server request.

## Verification Evidence

- Waza `/check` run: manual Waza-style review recorded here; recommendation remains fail because the real invocation exit criterion did not pass.
- Commands run: `bun run check:type`; `bash scripts/check-task-sync.sh`; `repo-harness run check-task-workflow --strict`; feature-worktree `mcp doctor --live`; Cloudflare-edge health/OAuth/MCP probes; rollback `cmp`; `ps`, `lsof`, and both Git status checks.
- Manual checks: ChatGPT App settings exact coding schemas; structured App mention in a fresh normal Chat; final `surface_blocked` response; App deletion and process shutdown.
- Supporting artifacts: this review, matching notes, and the preserved ChatGPT conversation.
- Implementation notes reviewed: yes
- Run snapshot: `.ai/harness/checks/latest.json`

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- P1 blockers: ChatGPT Pro did not expose the connected developer-mode App's `api_tool` interface in the fresh conversation, so no `Called tool` transcript exists.
- P2 advisories: local split-DNS affects `doctor` public-origin probing but did not affect ChatGPT cloud OAuth/App discovery; keep these diagnoses separate.
- Acceptance checklist: endpoint/schema/selection passed; invocation/read/patch/process/poll/readback did not run.

## Behavior Diff Notes

- No repo-harness product behavior changed. This slice only exercised the already implemented coding profile against live Cloudflare/OAuth/ChatGPT surfaces.
- The live system reached App connection and exact action discovery. The first failing boundary is the selected conversation runtime, which declined to expose `api_tool` despite the structured App selection.
- Because there was no tool call, the dedicated repo stayed clean and no process session or audit mutation was created.

## Residual Risks / Follow-ups

- A fresh chat on a ChatGPT model/account surface known to support developer-mode App actions is still needed to obtain `invocation_verified`.
- `/etc/resolver/repoharness.com` remains a host-level split-DNS false-negative source for `doctor --live`; it was intentionally not changed.
- Pre-existing launchd MCP plists remain in their exact pre-canary stopped/stale state; this eval-only slice did not repair persistence.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 6/10 | Endpoint, OAuth, schema, and selection passed; the required real tool invocation did not. |
| Security | 10/10 | Dedicated repo/App, explicit coding grant, no secret output, no unrelated Cloudflare mutation, exact rollback. |
| Product depth | 8/10 | The canary reached the true model-tool boundary and produced a falsifiable classifier instead of setup-only evidence. |
| Design quality | 9/10 | Disposable App and foreground processes isolated rollback from existing user state. |
| Code quality | 10/10 | No product code changed; workflow evidence is scoped and sanitized. |

## Failing Items

- No visible `Called tool` event for `open_workspace` or any other coding action.
- No ChatGPT-created worktree, patch file, long process, poll, readback, or matching audit evidence.
- Contract manual acceptance and functionality score threshold therefore remain unmet.

## Retest Steps

- Re-run: connect a disposable coding App on a ChatGPT model/account surface that exposes developer-mode App actions, select it structurally in a fresh normal Chat, and submit the same bounded five-tool sequence.
- Re-check: require visible `Called tool` entries plus server-side request evidence and exact file contents before changing the classifier to `invocation_verified`.

## Summary

- The live canary safely proved Cloudflare, OAuth, App connection, and exact coding schema, but the selected ChatGPT Pro conversation did not expose the App's `api_tool` runtime. The correct outcome is `surface_blocked`, not product acceptance. Rollback completed and main WIP was preserved.
