# Task Review: chatgpt-coding-mcp-authorization-runtime

> **Status**: Complete
> **Plan**: plans/plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md
> **Contract**: tasks/contracts/20260711-1343-chatgpt-coding-mcp-authorization-runtime.contract.md
> **Notes File**: tasks/notes/20260711-1343-chatgpt-coding-mcp-authorization-runtime.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-11 20:58
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:1b9a1f7c2b1ad1d6b756ba765f492a924bdfcd581387b943c82d76e4ad9e5955
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass; the live canary's first product blocker is fixed without weakening grant isolation
- Change type: bugfix
- Intended files changed: OAuth, MCP server/HTTP transport, focused tests, and matching workflow artifacts
- Actual files changed: OAuth/server/HTTP runtime, ownership error text, focused tests, architecture/operator/research docs, and matching workflow artifacts
- Commands passed: focused MCP suites, typecheck, full `bun test`, SQL order, architecture sync, task sync, strict workflow, project inspection, and self-migration dry-run
- External acceptance: pass from the separately authorized post-fix ChatGPT/Cloudflare live canary
- Residual risks: the current ChatGPT Activity UI does not provide a durable literal transcript for every call; prior coding tokens must reauthorize because legacy tokens intentionally lack the new grant id
- Reviewer action required: none for the implementation slice
- Rollback: revert to `443f3ea`

## Mode Evidence

- Selected route: repo-harness-repair
- P1/P2/P3 evidence: transport sessions remain HTTP concerns; authorization identity is OAuth truth; workspace/process runtime is authorization-scoped and bounded by revocation/revision/idle/shutdown cleanup.
- Root cause or plan evidence: live ChatGPT audit plus the pre-fix local regression artifact and the same new-session-per-call E2E.

## Verification Evidence

- Waza `/check` run: manual Waza-style diff/security review completed; recommendation pass
- Commands run: `bun run check:type`; focused MCP suites; `bun test`; all required repository checks listed in the contract
- Manual checks: verified another OAuth grant cannot use the workspace, process, or transport id; verified refresh preserves authorization id and legacy tokens fail closed
- Supporting artifacts: `.ai/harness/runs/pre-fix-20260711-1343-chatgpt-coding-auth-runtime.log`
- Implementation notes reviewed: yes
- Run snapshot: `.ai/harness/checks/latest.json`

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: ChatGPT developer-mode live canary
> **External Source**: tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md
> **External Started**: 2026-07-11T07:15:23.429Z
> **External Completed**: 2026-07-11T07:16:05.280Z

- P1 blockers: none; the post-fix live sequence reused one OAuth authorization across fresh MCP transports and completed workspace read, patch, process execution, and final readback.
- P2 advisories: the separate live-canary contract keeps its stricter literal-transcript classifier blocked because the current ChatGPT UI omitted some call rows and became empty after disposable-App deletion. That evidence-surface limitation does not falsify the authorization-runtime behavior proven by correlated local audit and exact file output.
- Acceptance checklist: same-grant cross-transport continuity passed live; cross-grant isolation, refresh preservation, revoke cleanup, and legacy-token rejection passed focused regression tests; rollback restored all external state.

## Behavior Diff Notes

- Each coding authorization-code exchange receives a random local `authorizationId`; refresh rotation preserves it.
- HTTP initializes one shared coding runtime per authorization while keeping each Streamable HTTP transport separately bound to the same id.
- Transport DELETE no longer destroys a multi-call coding flow. Authorization revoke/revision/grant change, coding disable, idle expiry, process timeout, and server shutdown remain cleanup boundaries.
- Planner OAuth/profile behavior and coding tool schemas are unchanged.

## Residual Risks / Follow-ups

- Authorization-runtime external acceptance is complete. The separate live-canary contract still requires a durable literal `Called tool` transcript before changing its stricter classifier from `surface_blocked` to `invocation_verified`.
- Runtime cleanup is asynchronous but idempotent; process-manager shutdown remains the final fail-closed process-tree boundary.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Same-grant open/read/patch/run/poll works across fresh transports. |
| Security | 10/10 | Distinct grants cannot reuse workspace, process, or transport ids; stale/legacy tokens fail closed. |
| Product depth | 9/10 | Fixes the real ChatGPT behavior at the OAuth/runtime boundary without introducing DevSpace runtime. |
| Design quality | 9/10 | One authorization identity owns one bounded runtime; cleanup events are explicit and documented. |
| Code quality | 9/10 | Focused and full suites pass; lifecycle factoring stays within existing MCP modules. |

## Failing Items

- None for the implementation contract.

## Retest Steps

- No authorization-runtime retest remains. If ChatGPT later exposes a durable complete tool transcript, re-run only the separate live-canary classifier using the same bounded prompt.

## Summary

- The authorization-scoped runtime fixes ChatGPT's new-transport-per-call behavior and preserves the stricter repo-harness isolation model. Local, repository, and post-fix live functional acceptance all pass. The remaining `surface_blocked` label belongs only to the separate transcript-visibility contract.
