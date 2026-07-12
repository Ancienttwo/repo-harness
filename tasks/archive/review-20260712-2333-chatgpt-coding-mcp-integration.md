> **Archived**: 2026-07-12 23:33
> **Related Plan**: plans/archive/plan-20260712-0301-chatgpt-coding-mcp-integration.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260712-2333

# Task Review: chatgpt-coding-mcp-integration

> **Status**: Complete
> **Plan**: plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md
> **Contract**: tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md
> **Notes File**: tasks/notes/20260712-0301-chatgpt-coding-mcp-integration.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-12 22:53
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:806dcf606e8f9b2ff02400c341a492e6c175053e8d9179fb9d2141f808de98f8
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass for archive closeout; every external P1 is remediated with focused regressions and the current gate-bound Claude review returned P2 advisories only.
- Change type: code-change
- Intended files changed: seven accepted coding MCP commits plus bounded integration workflow artifacts.
- Actual files changed: coding profile, OAuth/runtime/workspace/process/file tooling, truthful host-authority consent copy, setup/operator/research/architecture docs, focused tests, optional `node-pty`, and matching workflow evidence.
- Commands passed: refreshed-main focused MCP suites, latest-main combined BDD²/MCP suites (74 pass / 1 platform skip / 0 fail), post-consent-fix HTTP/setup suites (31 pass / 0 fail / 324 expectations), post-fault-hook coding/HTTP suites (12 pass / 0 fail / 148 expectations), cross-platform revocation HTTP suite repeated three times (21 pass / 0 fail / 303 expectations), final coding/HTTP suites after `.ignore` and intermediate-symlink hardening (13 pass / 0 fail / 158 expectations), final HTTP suite after exact-branch selection and termination-grace correction (7 pass / 0 fail / 103 expectations), frozen install, typecheck, deploy SQL order, architecture sync, task sync, strict workflow under the macOS-safe `LC_ALL=C` locale, project inspection, transactional `adopt --dry-run`, diff whitespace check, and the isolated CodeGraph file that hit the raw suite's default timeout. After integrating green main `6b51e31` and preserving PR #56/#58 authorities, strict contract verification passed all 23 criteria. GitHub CI for head `1d77cd9` passed both Test jobs and all Ubuntu, macOS, and Windows MCP matrix jobs; [post-merge `main` CI run `29187858965`](https://github.com/Ancienttwo/repo-harness/actions/runs/29187858965) passed for squash commit `e519ab13b0da44bf272d75db1b9e0d7d56991654`.
- External acceptance: pass from Claude via `claude-review` against the gate target-branch scope; the preserved ChatGPT authorization-runtime live canary remains separate product-runtime evidence.
- Residual risks: `node-pty` remains optional and PTY correctly fails closed when unavailable; strict ChatGPT Activity transcript acceptance remains separately `surface_blocked` and is not reported as `invocation_verified`.
- Reviewer action required: none; preserve the registry-lock and literal Ctrl-C P2 advisories in archived evidence.
- Rollback: revert only squash commit `e519ab13b0da44bf272d75db1b9e0d7d56991654` if required; local main and the source feature branch remain untouched.

## Mode Evidence

- Selected route: isolated integration under `repo-harness-ship` closeout rules.
- P1/P2/P3 evidence: current `origin/main` owns rollout retirement, the seven feature commits own coding behavior, and the integration branch owns only semantic reconciliation and PR delivery; the concrete replay preserved one repo-access authority and one OAuth authorization identity authority.
- Root cause or plan evidence: a branch-tree merge would restore files deleted by `refactor(mcp): retire rollout controls (#52)`, so the seven commits were replayed in order onto `origin/main@788ba60`.

## Verification Evidence

- Waza `/check` run: current manual review plus independent Claude gate completed; no P1 remains.
- Commands run: original-base focused MCP suite (97 pass / 1119 expectations); two independent original-base `bun test` passes (each 1158 pass / 1 skip / 0 fail / 11695 expectations); refreshed-main focused MCP suite (98 pass / 0 fail / 1127 expectations); latest-main combined BDD²/MCP suite (74 pass / 1 skip / 0 fail / 680 expectations); final focused MCP/registry/skill suite (90 pass / 1040 expectations); registry concurrency test repeated three additional times; final complete CI envelope (1144 pass / 1 skip / 0 fail / 11309 expectations); `bun install --frozen-lockfile`; `bun run check:type`; every current root required check; isolated-brain strict workflow; `git diff --check`; refreshed-main raw `bun test` (1121 pass / 1 skip / one default-timeout-only failure); isolated CodeGraph probe recheck passed three times after one transient `status=null`; main-`6b51e31` strict contract verification passed all 23 criteria; PR #55 head `1d77cd9` passed both Test jobs and both complete Ubuntu/macOS/Windows MCP matrix runs (`29184638103`, `29184639063`); [PR #55](https://github.com/Ancienttwo/repo-harness/pull/55) squash commit `e519ab13b0da44bf272d75db1b9e0d7d56991654` landed on `main`, whose [post-merge CI run `29187858965`](https://github.com/Ancienttwo/repo-harness/actions/runs/29187858965) passed.
- Manual checks: confirmed retired rollout files remain absent, rollout/generalRepo runtime fields are absent, coding exposes exactly five direct tools, PR #55 merge/post-merge CI evidence matches the recorded SHA, and dirty local `main` tracked-diff/status fingerprints remain unchanged through closeout.
- Supporting artifacts: integration plan, contract, notes, Claude external acceptance bound to the current fingerprint, existing ChatGPT coding MCP live-canary review, and `.ai/harness/checks/latest.json` after final verification.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/checks/latest.json`.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-12T22:32:00+08:00
> **External Completed**: 2026-07-12T22:35:00+08:00
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:806dcf606e8f9b2ff02400c341a492e6c175053e8d9179fb9d2141f808de98f8
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none
- Remediation evidence: Coding failure audit entries no longer persist free-text errors, and every registry mutation path is serialized by the same cross-process lock; the concurrency regression proves no repo or authorization revision is lost.
- P2 advisories: a killed registry writer leaves a fail-closed lock requiring manual verification/removal; a release error can mask a concurrent mutation error; `write_stdin` still treats every embedded literal `0x03` byte as Ctrl-C; and `tasks/current.md` remains a full tracked cross-worktree read model. The separate ChatGPT live-canary review still retains `surface_blocked`; this integration does not claim `invocation_verified`.
- Acceptance checklist: early reviews surfaced cleanup and move-rollback gaps, then gate-scope reviews caught misleading host-authority consent copy, an environment-variable production fault injector, Windows worktree path normalization, fail-open coding `.ignore` policy loading, absolute Windows path disclosure in consent repo labels, dangling `.ignore` symlinks, and intermediate directory symlinks that could alias denied or ignored in-workspace targets. All were remediated with focused regressions. PR #56/#58 authorities remain intact and incoming-only paths are absent from the final implementation diff. Claude re-reviewed the complete main-`6b51e31` diff with read-only tools and returned verbatim `No P1 or P2 findings.` for the final recorded fingerprint.

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
- Coding path resolution rejects every existing symlink component and reapplies deny/ignore policy to the canonical repo-relative target before read or write.
- OAuth consent repo labels use standard-library `path.basename()` and the E2E asserts the absolute local repo path is absent.
- Coding failure audit entries retain structured error codes without persisting command/stdout/stderr-derived free text; caller responses keep their existing redacted diagnostics.
- Registry registration, access-mode changes, and authorization-revision bumps share one adjacent cross-process lock around their read-modify-write boundary.

## Residual Risks / Follow-ups

- PR #55 is merged and post-merge `main` CI passed; no merge-readiness gate remains open.
- The literal ChatGPT Activity transcript limitation remains a separate acceptance-surface issue; it does not block the already verified functional authorization runtime.
- A process killed while holding the registry mutation lock requires manual stale-lock verification/removal; lock release failures can mask an earlier mutation error. Both are recorded Claude P2 advisories, not silent authorization-integrity failures.
- One earlier strict-verifier attempt reported only its encapsulated full-suite command as failed and discarded the child log. The unchanged suite then passed in the foreground and in a second strict-verifier run; this is treated as a non-reproduced test-harness transient, not omitted evidence.
- The final packaged `repo-harness run verify-sprint` wrapper also hit its 120-second outer timeout. The source `verify-contract` helper subsequently passed all 24 current criteria with no override; final `verify-sprint` evidence is produced through the same source helper path so the long full-suite command can complete.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Focused suites and the contract full-suite envelope pass; the live authorization-scoped coding sequence already passed. The contended raw refreshed-main run's sole timeout passes in isolation. |
| Security | 9/10 | Audit persistence is content-free on failures and authorization revisions are serialized; only fail-closed stale-lock availability remains advisory. |
| Product depth | 9/10 | Direct local coding is integrated without importing DevSpace runtime or reopening rollout controls. |
| Design quality | 9/10 | One policy authority and one authorization-runtime authority are preserved through a narrow replay. |
| Code quality | 9/10 | Conflicts were resolved semantically, typechecked, and covered by focused plus full regression suites. |

## Failing Items

- The environment-key deny-policy P1 is remediated: focused regression and direct reproduction deny underscore-delimited and compact secret-shaped names.
- The user-selected 24-tool authority is reflected in bridge/operator docs and frozen by an exact tool-count assertion.
- Audit-log redaction and registry lost-update P1s are remediated and independently re-reviewed. No failing item remains.

## Retest Steps

- Re-run focused MCP/registry suites, the full CI envelope, and root required checks only if product/runtime files change after this accepted checkpoint.
- Re-check that `scripts/mcp-rollout-gate.ts` remains absent and squash commit `e519ab13b0da44bf272d75db1b9e0d7d56991654` remains reachable from `main`.

## Summary

- The accepted coding MCP series now coexists with current mainline rollout retirement, PR #56's Bun baseline, and PR #58's archived BDD² authority on `main`. PR #55 is squash-merged as `e519ab13b0da44bf272d75db1b9e0d7d56991654`, post-merge CI passed, local and live evidence remain truthful, and the strict transcript classifier remains separately `surface_blocked`.
