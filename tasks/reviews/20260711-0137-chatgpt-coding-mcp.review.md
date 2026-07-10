# Task Review: chatgpt-coding-mcp

> **Status**: Done
> **Plan**: plans/plan-20260711-0137-chatgpt-coding-mcp.md
> **Contract**: tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md
> **Notes File**: tasks/notes/20260711-0137-chatgpt-coding-mcp.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-11 04:02 +0800
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:95fc0bf802f57b5aec150a5aca35f60467a48520a1feba75dce42ea9fe1a937b
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: MCP policy/config/OAuth/HTTP/setup, coding workspace/file/process modules, registry/access administration, CLI commands, architecture/setup/skill/research docs, dependency lock, tests, and workflow closeout artifacts.
- Actual files changed: 43 implementation paths in the reviewed fingerprint; the ignored `_ref/devspace` checkout is pinned separately and the review file is excluded from freshness.
- Commands passed: focused MCP suites, `bun run check:type`, full `bun test`, CLI help/readback, package tarball install smoke, and the repository required checks listed below.
- External acceptance: unavailable; manual override recorded below because live Cloudflare/ChatGPT state requires separate user authorization and the architecture reviewer exhausted its runtime quota.
- Residual risks: Bun 1.3.x cannot safely drive `node-pty@1.1.0`, so explicit PTY requests return `PTY_UNAVAILABLE`; real ChatGPT `Called tool` transcript remains `live_canary_pending_authorization`.
- Reviewer action required: none before local worktree finish; separate explicit authorization is required before any live canary.
- Rollback: stop the coding server, downgrade grants to `read_only`, disable coding setup so authorization revision changes, terminate sessions, preserve unmerged managed worktrees, and revert the reviewed diff.

## Mode Evidence

- Selected route: Waza `/check` Deep review with security and architecture specialist routing plus an adversarial pass.
- P1 map: the public boundary is ChatGPT -> named tunnel -> loopback Streamable HTTP MCP -> OAuth coding scope/revision -> per-MCP-session workspace/process managers. The ignored user registry owns repo grants; worktrees own source isolation; audit and CodeGraph own mutation/process evidence.
- P2 trace: coding setup records a user-scoped v3 config and explicit grant; DCR/PKCE issues a one-hour access token plus rotating refresh token; `initialize` creates a unique MCP runtime; `open_workspace` resolves a stable `repo_id`; file tools canonicalize and preflight; process tools bind owner/workspace/session; completion invalidates and refreshes the index; DELETE/revision change/shutdown terminate the process tree.
- P3 decision: keep all legacy profiles unchanged and add one default-off profile. Reuse registry, audit, CodeGraph, and worktree invariants; fail closed for auth/path/scope/PTY boundaries; preserve the explicit local-user shell trust model instead of presenting allowed roots as a sandbox.
- Root cause or plan evidence: approved captured plan plus pinned `Waishnav/devspace@6ccefbf6213c56056a98ff52d7bdb27c081d13b9` comparison in `docs/researches/20260711-devspace-chatgpt-local-control.md`.

## Verification Evidence

- Waza `/check` run: Deep local review completed. Security specialist findings were independently reproduced and fixed; architecture specialist was unavailable after runtime quota exhaustion, so architecture acceptance used P1/P2/P3 trace, typecheck, schema regressions, full suite, package smoke, and required checks.
- Commands run:
  - `git status --short --branch -uall`
  - `git diff --check`
  - `bun run check:type`
  - `bun test tests/cli/mcp-oauth.test.ts tests/cli/mcp-http.test.ts tests/cli/mcp-coding-tools.test.ts tests/cli/mcp-process-sessions.test.ts tests/cli/mcp-policy.test.ts tests/cli/mcp-setup.test.ts` -> 57 pass, 0 fail
  - `bun test` -> 1129 pass, 1 Windows-only skip, 0 fail, 11573 assertions
  - `bun run src/cli/index.ts mcp --help`
  - `bun run src/cli/index.ts mcp access --help`
  - `bun run src/cli/index.ts mcp workspaces --help`
  - `bun run src/cli/index.ts mcp doctor --help`
  - `npm pack --json --pack-destination /tmp/repo-harness-coding-pack`
  - `bash scripts/check-tarball-install-smoke.sh`
  - `bash scripts/check-deploy-sql-order.sh`
  - `bash scripts/check-architecture-sync.sh`
  - `bash scripts/check-task-sync.sh`
  - `repo-harness run check-task-workflow --strict`
  - `bun scripts/inspect-project-state.ts --repo . --format text`
  - `bash scripts/migrate-project-template.sh --repo . --dry-run`
- Manual checks:
  - `_ref/devspace` is ignored, clean, detached, and exactly at the pinned commit.
  - Coding HTTP rejects bearer/url-token auth; missing `repo-harness.coding` is not silently upgraded.
  - Root instruction symlinks do not return external content; coding CodeGraph does not run a granted repo's local executable or inherit MCP/OAuth/Codex/Claude secrets.
  - No raw command/stdout/stderr is written to coding audit; process completion remains auditable after grant revocation.
  - `open_workspace` public metadata does not return the local repo root. Live external systems were not changed.
- Supporting artifacts: implementation notes, DevSpace research, runtime-harness architecture module, coding operator guide, local HTTP E2E tests, and `.ai/harness/checks/latest.json`.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/checks/latest.json`.

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**: security specialist completed; architecture specialist unavailable
> **External Source**: read-only subagent review
> **External Started**: 2026-07-11 03:35 +0800
> **External Completed**: 2026-07-11 03:52 +0800

- P1 blockers: two were found and closed: root instruction symlink escape and trusted-repo CodeGraph binary/env/error leakage. Coding HTTP non-OAuth startup was also closed during the main adversarial pass.
- P2 advisories: automatic coding-scope upgrade, revocation-time audit loss, and common credential-file read gaps were fixed. Bun PTY support remains explicitly unavailable rather than silently degraded.
- Acceptance checklist: local OAuth -> initialize -> exact tools/list -> worktree -> read -> atomic patch -> short/long process -> write_stdin -> revision downgrade/cleanup passes. The real ChatGPT tool transcript is intentionally not claimed.
- Manual Override: the approved contract explicitly separates implementation acceptance from live Cloudflare/ChatGPT canary authorization. Focused security regressions, full repository tests, package install smoke, and all required local checks cover this implementation slice; external live acceptance remains `live_canary_pending_authorization`.

## Behavior Diff Notes

- Adds one default-off `coding` profile with exactly five direct tools; planner, executor, and orchestrator schemas remain unchanged.
- Adds user-scoped explicit repo access modes and authorization revisioning, one-hour coding access tokens, 30-day rotating refresh, Host/CORS/redirect hardening, and OAuth-only coding HTTP.
- Adds managed worktree/checkout workspaces, canonical read/atomic patch, instruction discovery, local list/cleanup, bounded process sessions, scrubbed env, secret-free audit, and CodeGraph invalidation/refresh/dead-letter evidence.
- Adds layered `doctor --live`, current ChatGPT developer-mode mapping, Cloudflare named-tunnel guide, provider comparison, architecture documentation, and pinned DevSpace research without a DevSpace runtime dependency.

## Residual Risks / Follow-ups

- `node-pty@1.1.0` hangs under Bun 1.3.x callback execution in this environment. The implementation returns `PTY_UNAVAILABLE`; pipe mode and the injected PTY contract are covered, and a Node runtime smoke proved the dependency itself works.
- Only a real fresh ChatGPT conversation showing `Called tool` can become `invocation_verified`. Until separately authorized, the external state is `live_canary_pending_authorization`, not a product acceptance pass.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Local OAuth/MCP coding loop, downgrade cleanup, worktree/patch/process behavior, and exact schemas pass focused and full tests. |
| Product depth | 9/10 | Setup, access administration, diagnostics, operator guidance, lifecycle cleanup, and rollback are delivered as one coherent profile. |
| Design quality | 8/10 | Strong profile/revision/path/session boundaries; the intentional local-user shell trust model is explicit. Bun PTY compatibility is the bounded gap. |
| Code quality | 8/10 | Typed modules, atomic file operations, bounded process manager, redacted evidence, and regression coverage; the sidecar remains a substantial high-risk surface. |

## Failing Items

- None in the implementation boundary.

## Retest Steps

- Re-run: `bun test`
- Re-check: `repo-harness run verify-contract --contract tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md --strict`
- Live only after authorization: `repo-harness mcp doctor --live`, then verify read, patch, long process, file persistence, and a real ChatGPT `Called tool` transcript.

## Summary

- Recommendation: pass for local implementation and isolated-worktree finish. All confirmed security findings are fixed with regression coverage; the external Cloudflare/ChatGPT canary remains separately authorization-gated.
