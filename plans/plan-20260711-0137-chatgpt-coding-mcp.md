# Plan: ChatGPT 云端直控本地 Coding MCP

> **Status**: Executing
> **Created**: 20260711-0137
> **Slug**: chatgpt-coding-mcp
> **Planning Source**: waza-think
> **Orchestration Kind**: waza-think
> **Source Ref**: think 你来写一个详细的方案
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260711-0137-chatgpt-coding-mcp.md`; after execution revert branch `codex/chatgpt-coding-mcp` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md`
> **Task Review**: `tasks/reviews/20260711-0137-chatgpt-coding-mcp.review.md`
> **Implementation Notes**: `tasks/notes/20260711-0137-chatgpt-coding-mcp.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: think 你来写一个详细的方案
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260711-0137-chatgpt-coding-mcp.md`
- Sprint contract: `tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md`
- Sprint review: `tasks/reviews/20260711-0137-chatgpt-coding-mcp.review.md`
- Implementation notes: `tasks/notes/20260711-0137-chatgpt-coding-mcp.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260711-0137-chatgpt-coding-mcp.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260711-0137-chatgpt-coding-mcp.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md`
- Review file: `tasks/reviews/20260711-0137-chatgpt-coding-mcp.review.md`
- Implementation notes file: `tasks/notes/20260711-0137-chatgpt-coding-mcp.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260711-0137-chatgpt-coding-mcp.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260711-0137-chatgpt-coding-mcp.md`; after execution revert branch `codex/chatgpt-coding-mcp` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260711-0137-chatgpt-coding-mcp.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260711-0137-chatgpt-coding-mcp.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md`, `tasks/reviews/20260711-0137-chatgpt-coding-mcp.review.md`, and `tasks/notes/20260711-0137-chatgpt-coding-mcp.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260711-0137-chatgpt-coding-mcp.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260711-0137-chatgpt-coding-mcp.md`; after execution revert branch `codex/chatgpt-coding-mcp` or the explicitly reviewed diff.

## Captured Planning Output

# ChatGPT 云端直控本地 Coding MCP

## Summary

- P1 Architecture: add an explicit, default-off coding MCP profile on top of the existing OAuth + Streamable HTTP MCP + tunnel stack; planner, executor, and orchestrator remain unchanged.
- P2 Trace: ChatGPT -> stable Cloudflare tunnel -> localhost:8765/mcp -> OAuth coding scope -> open_workspace -> local files or Bash/PTY tools -> MCP result.
- P3 Decision: provide DevSpace-style direct coding using repo-harness path, revision, CodeGraph, audit, and worktree boundaries; DevSpace is reference-only, not a runtime dependency.

## Public Interfaces

- Add MCP profile coding as a planner superset with profile-specific open_workspace, read, apply_patch, exec_command, and write_stdin schemas.
- Add setup: repo-harness mcp setup chatgpt --scope user --profile coding --grant-read-write <repo> --endpoint https://host/mcp. Missing explicit grant fails closed.
- Add access admin: repo-harness mcp access set --repo <path> --mode read_only|read_write.
- Add local worktree admin: repo-harness mcp workspaces list|cleanup.
- Add repo-harness mcp doctor --live.
- Upgrade ignored MCP local config to v3 while continuing to read v1/v2 and migrating only through setup.

## Implementation

1. Capture and reference
   - Clone Waishnav/devspace into ignored _ref/devspace and pin the research to commit 6ccefbf6213c56056a98ff52d7bdb27c081d13b9.
   - Add a durable research comparison covering tunnel, OAuth, workspace, file, process-session, and security differences.
   - Do not modify or vendor DevSpace and do not make it a runtime dependency.

2. Authorization and public ingress
   - Keep coding default-off and require at least one explicit read_write registry grant.
   - Bind coding OAuth tokens to repo-harness.coding scope plus current authorization revision; planner tokens cannot invoke coding tools.
   - Use 1-hour coding access tokens and 30-day rotating refresh tokens; revoke older authorization revisions on access downgrade.
   - Derive public origin and Host allowlist from the stored /mcp endpoint, bind localhost, forbid wildcard CORS in coding, and restrict OAuth redirects to exact registered URIs under configured hosts, defaulting to chatgpt.com and loopback.
   - Show the local-user shell risk and authorized repo list on the approval page.
   - Annotate mutating tools as destructive and exec_command as open-world.

3. Coding workspace and file tools
   - open_workspace accepts repo_id, mode=worktree|checkout, and base_ref; default mode is worktree and default base_ref is HEAD.
   - Managed worktrees use codex/mcp-<repo>-<session> branches and persist metadata under ~/.repo-harness. Return dirty-source status and applicable AGENTS/CLAUDE instructions without returning the local absolute repo root.
   - read and apply_patch accept only workspace-relative paths. Reads honor .ignore and secret deny rules. Writes additionally deny .git, .env, key material, _ops, _ref, absolute paths, traversal, and symlink escapes.
   - apply_patch preflights every add/update/delete/move and revision, then applies the set atomically. Return diff, mutation ids, and CodeGraph index state.
   - Successful file mutation reuses existing invalidation, audit, refresh, and dead-letter contracts.
   - Dirty or unmerged worktrees are preserved and local cleanup refuses them. No remote cleanup tool is exposed.

4. Process sessions
   - exec_command supports pipe and PTY execution, relative working directory, up to 30 seconds initial yield, and bounded output.
   - write_stdin supports polling, input, terminal resize, and Ctrl-C.
   - Bind sessions to one MCP auth/session and workspace. Allow 4 concurrent processes, 30-minute runtime, 4 MiB output ring, and 15-minute completed retention.
   - Kill the process tree on timeout, MCP DELETE/expiry, or server shutdown. Reject cross-session access.
   - Run arbitrary Bash with local-user authority. Constrain only the initial cwd; document that this is not a filesystem sandbox.
   - Inherit only a small documented OS environment allowlist. Additional variables require ignored local configuration, while MCP, tunnel, OAuth, Codex, and Claude secrets are always rejected.
   - node-pty is the only new optional dependency; tty requests fail with PTY_UNAVAILABLE when it is missing.
   - On process completion, emit repo-wide CodeGraph invalidation and serialize refresh. Audit only hashes and bounded metadata, never raw command, stdout, or stderr.

5. Setup, Cloudflare, and diagnostics
   - Document local origin, tunnel upstream, public origin without /mcp, and Connector endpoint with /mcp as four distinct values.
   - Use OAuth, Scan/Refresh Tools, and write confirmations in ChatGPT.
   - Make stable Cloudflare named tunnel the primary path and quick tunnels smoke-only. Include a short ngrok/Pinggy/Tailscale comparison without provider automation.
   - doctor --live reports config_ready, local_ready, tunnel_ready, oauth_ready, and mcp_ready and probes public TLS/Host, OAuth discovery/DCR/PKCE/token, initialize, and the exact coding tools schema without printing credentials.
   - Only a real ChatGPT Called tool event is invocation_verified. A model/account refusal is surface_blocked.

## Tests and Acceptance

- Cover unchanged legacy profile schemas; v1/v2-to-v3 migration; no implicit read-write grant; profile-bound tokens; Host/CORS/redirect denial; token rotation and revocation.
- Cover worktree default, explicit checkout, dirty source, symlink/traversal/secret paths, revision conflicts, atomic multi-file patches, and cleanup refusal.
- Cover short and long commands, pipe/PTY/input/resize/Ctrl-C, timeouts, truncation, concurrency, cross-session denial, cleanup, environment scrubbing, and secret-free audit.
- Cover CodeGraph invalidation/refresh/dead-letter and concurrent mutation/refresh.
- Run local OAuth -> initialize -> tools/list -> worktree -> patch -> command E2E using a temporary Git repo and local reverse proxy.
- Run focused MCP tests, bun test, and all root required checks.
- Live Cloudflare/ChatGPT canary requires separate external authorization. Without it, stop at live_canary_pending_authorization and do not mutate tunnel, DNS, or ChatGPT App state.

## Assumptions and Boundaries

- Arbitrary Bash/PTY has the local OS user's authority; allowed roots are not a shell sandbox.
- Worktree-first is the default; checkout is explicit.
- Cloudflare is guide-and-verification only; no automated tunnel, DNS, launchd, or systemd mutation.
- Widgets, subagents, container sandboxing, DevSpace runtime dependency, and multi-provider tunnel automation are out of scope.
- Rollback stops coding, revokes coding tokens, restores read_only and rollout flags, kills sessions, and preserves unmerged worktrees.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Card 1 — Freeze reference and contracts: clone the pinned ignored DevSpace reference, add durable research, make the task contract self-sufficient, and verify the cheapest profile/OAuth feasibility tests.
- [x] Card 2 — Authorization and setup: implement the coding profile/config v3, access administration, profile-bound OAuth, ingress hardening, setup migration, and default-off regression tests.
- [x] Card 3 — Workspace and file tools: implement managed worktree lifecycle, instruction loading, canonical read/atomic patch tools, CodeGraph mutation integration, and focused tests.
- [x] Card 4 — Process tools: implement bounded pipe/PTY sessions, write_stdin, cleanup, environment/audit controls, index invalidation, and focused tests.
- [x] Card 5 — Diagnostics and documentation: implement doctor --live, Cloudflare/ChatGPT mapping, setup/skill/architecture sync, and local E2E evidence.
- [x] Card 6 — Closeout: run all required checks, complete review/notes/current/handoff, record live_canary_pending_authorization, and finish the isolated worktree without mutating live external state.
