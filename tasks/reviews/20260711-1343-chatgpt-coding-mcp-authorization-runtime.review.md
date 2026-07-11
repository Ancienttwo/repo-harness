# Task Review: chatgpt-coding-mcp-authorization-runtime

> **Status**: Complete
> **Plan**: plans/plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md
> **Contract**: tasks/contracts/20260711-1343-chatgpt-coding-mcp-authorization-runtime.contract.md
> **Notes File**: tasks/notes/20260711-1343-chatgpt-coding-mcp-authorization-runtime.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-11 14:18
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
- External acceptance: unavailable in this implementation slice
- Residual risks: final ChatGPT/Cloudflare invocation acceptance has not yet been rerun against this commit; prior coding tokens must reauthorize because legacy tokens intentionally lack the new grant id
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

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- P1 blockers: none in the implementation; live retest is excluded from this contract.
- P2 advisories: a post-fix live canary remains the final external acceptance surface.
- Acceptance checklist: local ChatGPT-style continuity and cross-grant isolation pass; live state remains untouched.

## Behavior Diff Notes

- Each coding authorization-code exchange receives a random local `authorizationId`; refresh rotation preserves it.
- HTTP initializes one shared coding runtime per authorization while keeping each Streamable HTTP transport separately bound to the same id.
- Transport DELETE no longer destroys a multi-call coding flow. Authorization revoke/revision/grant change, coding disable, idle expiry, process timeout, and server shutdown remain cleanup boundaries.
- Planner OAuth/profile behavior and coding tool schemas are unchanged.

## Residual Risks / Follow-ups

- A real ChatGPT canary is still required to change the external classifier from `surface_blocked` to `invocation_verified`.
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

- Re-run the bounded live canary with fresh OAuth authorization and a fresh ChatGPT chat.
- Re-check visible `Called tool` entries plus local patch/process/file evidence before changing the external classifier.

## Summary

- The authorization-scoped runtime fixes ChatGPT's new-transport-per-call behavior and preserves the stricter repo-harness isolation model. All local and repository gates pass; external live acceptance remains a separate authorized slice.
