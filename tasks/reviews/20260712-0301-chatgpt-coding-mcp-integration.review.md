# Task Review: chatgpt-coding-mcp-integration

> **Status**: Complete
> **Plan**: plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md
> **Contract**: tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md
> **Notes File**: tasks/notes/20260712-0301-chatgpt-coding-mcp-integration.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-12 05:11
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:6418aaa54a7962a4a38ae48ee338cafd1996bc381ee1a6f4aab8f975c7103348
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass; the accepted coding MCP series is reconciled with current main without reviving retired rollout authority.
- Change type: code-change
- Intended files changed: seven accepted coding MCP commits plus bounded integration workflow artifacts.
- Actual files changed: coding profile, OAuth/runtime/workspace/process/file tooling, setup/operator/research/architecture docs, focused tests, optional `node-pty`, and matching workflow evidence.
- Commands passed: focused MCP suites, frozen install, typecheck, full `bun test`, deploy SQL order, architecture sync, task sync, strict workflow, project inspection, self-migration dry-run, and diff whitespace check.
- External acceptance: pass from Claude via `claude-review` against the exact current fingerprint; the preserved ChatGPT authorization-runtime live canary remains separate product-runtime evidence.
- Residual risks: `node-pty` remains optional and PTY correctly fails closed when unavailable; the draft PR still needs human merge review against the moving main branch.
- Reviewer action required: review the draft PR; do not merge automatically.
- Rollback: close the draft PR and delete only `codex/chatgpt-coding-mcp-integration`; local main and the source feature branch remain untouched.

## Mode Evidence

- Selected route: isolated integration under `repo-harness-ship` closeout rules.
- P1/P2/P3 evidence: current `origin/main` owns rollout retirement, the seven feature commits own coding behavior, and the integration branch owns only semantic reconciliation and PR delivery; the concrete replay preserved one repo-access authority and one OAuth authorization identity authority.
- Root cause or plan evidence: a branch-tree merge would restore files deleted by `refactor(mcp): retire rollout controls (#52)`, so the seven commits were replayed in order onto `origin/main@788ba60`.

## Verification Evidence

- Waza `/check` run: manual Waza-style diff, authority, security, and regression review completed; no P1/P2 findings remain.
- Commands run: focused MCP suite (97 pass / 1119 expectations); `bun install --frozen-lockfile`; `bun run check:type`; two independent `bun test` passes (each 1158 pass / 1 skip / 0 fail / 11695 expectations); every root required check; isolated-brain strict workflow; `git diff --check`; strict contract verification (23/23 pass, `Fulfilled`); post-review remediation typecheck and focused coding/HTTP tests (12 pass / 143 expectations).
- Manual checks: confirmed retired rollout files remain absent, rollout/generalRepo runtime fields are absent, coding exposes exactly five direct tools, and local main preflight hashes are checked again before push.
- Supporting artifacts: integration plan, contract, notes, Claude external acceptance bound to the current fingerprint, existing ChatGPT coding MCP live-canary review, and `.ai/harness/checks/latest.json` after final verification.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/checks/latest.json`.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-12T05:10:00+08:00
> **External Completed**: 2026-07-12T05:10:51+08:00
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:6418aaa54a7962a4a38ae48ee338cafd1996bc381ee1a6f4aab8f975c7103348
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none
- P2 advisories: none from the final Claude re-review. The separate ChatGPT live-canary review still retains `surface_blocked` for its stricter literal `Called tool` transcript classifier; this integration does not claim `invocation_verified`.
- Acceptance checklist: two initial full-diff read-tool reviews timed out without a final transcript and were rejected as evidence; a complete no-tools review surfaced actionable cleanup and move-rollback gaps; those were remediated and tested; Claude then re-reviewed the complete current diff and returned verbatim `No P1 or P2 findings.` for the final recorded fingerprint, including the CI-envelope contract update.

## Behavior Diff Notes

- Current mainline rollout retirement remains authoritative: no rollout gate file, candidate flags, environment rollout reads, or fallback reader-policy branch was restored.
- `coding` remains an explicit default-off profile with exact direct tools `open_workspace`, `read`, `apply_patch`, `exec_command`, and `write_stdin`.
- Repo registry `accessMode` remains the only repo grant authority, while OAuth authorization id owns bounded runtime continuity and revocation cleanup.
- Current Bun engine requirements remain unchanged; `node-pty@^1.1.0` is the sole optional dependency addition and TTY requests fail with `PTY_UNAVAILABLE` when it cannot load.
- Move rollback now has a dedicated injected mid-commit failure regression; background authorization cleanup catches rejected shutdown, reports only a sanitized error class, and has a race-idempotency regression.

## Residual Risks / Follow-ups

- Human merge review must re-check the draft PR if `main` advances before merge.
- The literal ChatGPT Activity transcript limitation remains a separate acceptance-surface issue; it does not block the already verified functional authorization runtime.
- One earlier strict-verifier attempt reported only its encapsulated full-suite command as failed and discarded the child log. The unchanged suite then passed in the foreground and in a second strict-verifier run; this is treated as a non-reproduced test-harness transient, not omitted evidence.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Focused and full suites pass; the live authorization-scoped coding sequence already passed. |
| Security | 10/10 | Explicit grant, revision-bound OAuth, host/path/secret defenses, cross-grant isolation, and cleanup boundaries remain intact. |
| Product depth | 9/10 | Direct local coding is integrated without importing DevSpace runtime or reopening rollout controls. |
| Design quality | 9/10 | One policy authority and one authorization-runtime authority are preserved through a narrow replay. |
| Code quality | 9/10 | Conflicts were resolved semantically, typechecked, and covered by focused plus full regression suites. |

## Failing Items

- None for the integration contract.

## Retest Steps

- Re-run focused MCP suites, `bun test`, and root required checks after any conflict resolution caused by a newer main tip.
- Re-check that `scripts/mcp-rollout-gate.ts` remains absent and the draft PR targets `main` from the integration branch.

## Summary

- The seven accepted coding MCP commits now coexist with current mainline rollout retirement on an isolated branch. Local and live evidence remain truthful, all current verification gates pass, and the integration is ready for draft PR review.
