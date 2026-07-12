# Task Review: chatgpt-coding-mcp-integration

> **Status**: Complete
> **Plan**: plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md
> **Contract**: tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md
> **Notes File**: tasks/notes/20260712-0301-chatgpt-coding-mcp-integration.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-12 14:43
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:040eda715c0014c4c8d29a4dfc562e5c8cdd882c533b2779248fe22c984eee9f
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass; the accepted coding MCP series is reconciled with latest main without reviving retired rollout/migration authority or modifying the independent BDD² evaluation foundation.
- Change type: code-change
- Intended files changed: seven accepted coding MCP commits plus bounded integration workflow artifacts.
- Actual files changed: coding profile, OAuth/runtime/workspace/process/file tooling, truthful host-authority consent copy, setup/operator/research/architecture docs, focused tests, optional `node-pty`, and matching workflow evidence.
- Commands passed: refreshed-main focused MCP suites, latest-main combined BDD²/MCP suites (74 pass / 1 platform skip / 0 fail), post-consent-fix HTTP/setup suites (31 pass / 0 fail / 324 expectations), post-fault-hook coding/HTTP suites (12 pass / 0 fail / 148 expectations), cross-platform revocation HTTP suite repeated three times (21 pass / 0 fail / 303 expectations), final coding/HTTP suites after `.ignore` hardening and dangling-symlink remediation (13 pass / 0 fail / 155 expectations), final HTTP suite after exact-branch selection and termination-grace correction (7 pass / 0 fail / 103 expectations), frozen install, typecheck, deploy SQL order, architecture sync, task sync, strict workflow under the macOS-safe `LC_ALL=C` locale, project inspection, transactional `adopt --dry-run`, diff whitespace check, and the isolated CodeGraph file that hit the raw suite's default timeout. GitHub CI for pre-merge head `29f5ea5` passed both Test jobs and all Ubuntu, macOS, and Windows MCP matrix jobs; current main `02079da` is integrated and requires a fresh PR-head run after push.
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
- Commands run: original-base focused MCP suite (97 pass / 1119 expectations); two independent original-base `bun test` passes (each 1158 pass / 1 skip / 0 fail / 11695 expectations); refreshed-main focused MCP suite (98 pass / 0 fail / 1127 expectations); latest-main combined BDD²/MCP suite (74 pass / 1 skip / 0 fail / 680 expectations); `bun install --frozen-lockfile`; `bun run check:type`; every current root required check; isolated-brain strict workflow; `git diff --check`; refreshed-main raw `bun test` (1121 pass / 1 skip / one default-timeout-only failure); isolated timed-out file recheck (2 pass / 0 fail / 13 expectations); latest-main strict contract verification passed all 23 criteria using the complete 180-second CI envelope; PR #55 head `29f5ea5` passed both Test jobs and both complete Ubuntu/macOS/Windows MCP matrix runs (`29181916810`, `29181917950`).
- Manual checks: confirmed retired rollout files remain absent, rollout/generalRepo runtime fields are absent, coding exposes exactly five direct tools, and local main preflight hashes are checked again before push.
- Supporting artifacts: integration plan, contract, notes, Claude external acceptance bound to the current fingerprint, existing ChatGPT coding MCP live-canary review, and `.ai/harness/checks/latest.json` after final verification.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/checks/latest.json`.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-12T14:39:00+08:00
> **External Completed**: 2026-07-12T14:43:00+08:00
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:040eda715c0014c4c8d29a4dfc562e5c8cdd882c533b2779248fe22c984eee9f
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none
- P2 advisories: none from the final Claude re-review against latest main. The separate ChatGPT live-canary review still retains `surface_blocked` for its stricter literal `Called tool` transcript classifier; this integration does not claim `invocation_verified`.
- Acceptance checklist: early reviews surfaced cleanup and move-rollback gaps, then gate-scope reviews caught misleading host-authority consent copy, an environment-variable production fault injector, Windows worktree path normalization, fail-open coding `.ignore` policy loading, absolute Windows path disclosure in consent repo labels, and a dangling `.ignore` symlink that `existsSync()` misclassified as absent. All were remediated with focused regressions. After current main was merged and the dangling-symlink fix landed, Claude re-reviewed the complete diff with read-only tools and returned verbatim `No P1 or P2 findings.` for the final recorded fingerprint.

## Behavior Diff Notes

- Current mainline rollout retirement remains authoritative: no rollout gate file, candidate flags, environment rollout reads, or fallback reader-policy branch was restored.
- `coding` remains an explicit default-off profile with exact direct tools `open_workspace`, `read`, `apply_patch`, `exec_command`, and `write_stdin`.
- Repo registry `accessMode` remains the only repo grant authority, while OAuth authorization id owns bounded runtime continuity and revocation cleanup.
- Current Bun engine requirements remain unchanged; `node-pty@^1.1.0` is the sole optional dependency addition and TTY requests fail with `PTY_UNAVAILABLE` when it cannot load.
- Move rollback now has a dedicated injected mid-commit failure regression; background authorization cleanup catches rejected shutdown, reports only a sanitized error class, and has a race-idempotency regression.
- OAuth consent now states that repo grants select openable workspaces but arbitrary shell can reach anything the local OS user can access, including outside granted repos; HTTP E2E locks that disclosure.
- Patch rollback fault injection is now an internal in-memory test hook absent from server construction; no production environment variable can trigger it.
- Authorization-revocation E2E now proves the exact opened worktree's background heartbeat stops instead of requiring POSIX signal-trap semantics unavailable under Windows `taskkill /T`; the stability assertion waits beyond the process manager's documented force-kill grace.
- Existing coding `.ignore` policy must be a readable regular file; directory, valid-target symlink, dangling symlink, or read failure returns `IGNORE_POLICY_UNAVAILABLE` rather than allowing file access.
- OAuth consent repo labels use standard-library `path.basename()` and the E2E asserts the absolute local repo path is absent.

## Residual Risks / Follow-ups

- Human merge review must re-check the draft PR if `main` advances before merge.
- The pre-merge product head is green, including both independent Windows MCP matrix jobs. The current-main merge plus dangling-symlink fix must receive the same fresh GitHub matrix before merge readiness is declared.
- The literal ChatGPT Activity transcript limitation remains a separate acceptance-surface issue; it does not block the already verified functional authorization runtime.
- One earlier strict-verifier attempt reported only its encapsulated full-suite command as failed and discarded the child log. The unchanged suite then passed in the foreground and in a second strict-verifier run; this is treated as a non-reproduced test-harness transient, not omitted evidence.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Focused suites and the contract full-suite envelope pass; the live authorization-scoped coding sequence already passed. The contended raw refreshed-main run's sole timeout passes in isolation. |
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

- The accepted coding MCP series now coexists with current mainline rollout retirement on an isolated branch. Local and live evidence remain truthful, current main is integrated, and external review has no P1/P2; final merge readiness is conditional only on the fresh GitHub CI run triggered by pushing this head.
