# Plan: ChatGPT Coding MCP live canary

> **Status**: Blocked
> **Created**: 20260711-1034
> **Slug**: chatgpt-coding-mcp-live-canary
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: real ChatGPT Called tool transcript and local file/process evidence
> **Rollback Surface**: Cloudflare tunnel route, user MCP coding config, OAuth revision, ChatGPT developer-mode app, and canary worktree
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md`
> **Task Review**: `tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md`
> **Implementation Notes**: `tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md`
- Sprint contract: `tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md`
- Sprint review: `tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md`
- Implementation notes: `tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md`.

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
- Contract file: `tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md`
- Review file: `tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md`
- Implementation notes file: `tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Cloudflare tunnel route, user MCP coding config, OAuth revision, ChatGPT developer-mode app, and canary worktree
- **Verification boundary**: real ChatGPT Called tool transcript and local file/process evidence
- **Review/acceptance boundary**: `tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md`, `tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md`, and `tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Cloudflare tunnel route, user MCP coding config, OAuth revision, ChatGPT developer-mode app, and canary worktree

## Captured Planning Output

# ChatGPT Coding MCP live canary

## Summary

Run the separately authorized live canary for the completed coding profile without modifying the user's dirty `main` checkout. Reuse the existing `repo-harness-mcp` Cloudflare named tunnel and `https://mcp.repoharness.com/mcp` endpoint when live state proves they are the authoritative route. Use the feature-worktree CLI, a dedicated local canary Git repository, and the current ChatGPT developer-mode app surface.

## Architecture and trace

- P1: feature-worktree CLI and loopback coding server own local execution; user-scoped v3 config owns OAuth/profile/grants; Cloudflare named tunnel owns public ingress; ChatGPT developer-mode app owns the remote tool surface.
- P2: fresh ChatGPT chat -> public `/mcp` -> OAuth coding scope/current authorization revision -> `open_workspace` in managed worktree -> `read`/`apply_patch`/`exec_command`/`write_stdin` -> local file/process evidence -> visible `Called tool` transcript.
- P3: reuse the existing tunnel and hostname, preserve the planner installation until verified, and perform mutations only in a dedicated canary repo. Fail closed on missing credentials, ambiguous account/zone ownership, stale schema, absent browser login, or write/shell surface refusal.

## Scope

- Inspect and reuse the existing Cloudflare named tunnel, DNS hostname, launchd services, and ignored repo-harness operator config; do not disclose secrets.
- Migrate user MCP config from v2 to v3 through the feature-worktree CLI, explicitly enable `coding`, and grant `read_write` only to the dedicated canary Git repo.
- Start the coding server on loopback, make the stable tunnel route healthy, and run `mcp doctor --live` through OAuth, initialize, and exact tool schema validation.
- In the logged-in ChatGPT UI, create or refresh a developer-mode app using OAuth and the stable `/mcp` endpoint with write confirmations.
- In a fresh chat, capture real `Called tool` evidence for workspace open/read, atomic patch, a bounded long pipe process, polling, and final file readback; verify the file on disk.
- Record `invocation_verified`, or `surface_blocked` with the exact observed boundary. Restore planner state if the canary cannot coexist or fails before invocation proof.

## Out of scope

- Editing repo-harness product code, dependency files, or the user's dirty `main` checkout.
- Granting ChatGPT write access to repo-harness source or unrelated repositories.
- Adding tunnel providers, changing unrelated DNS, deleting existing apps/tunnels, or introducing launchd/systemd automation beyond the already authorized MCP/tunnel services.
- Treating model prose, setup success, or schema discovery as invocation proof.

## Verification

- Local and public health plus OAuth discovery return expected non-secret responses.
- `mcp doctor --live` reaches `config_ready -> local_ready -> tunnel_ready -> oauth_ready -> mcp_ready` and exact coding tools.
- Cloudflare tunnel/DNS readback points the stable hostname to the intended named tunnel and loopback upstream.
- ChatGPT shows a visible `Called tool` transcript for read, patch, and process interactions.
- The dedicated canary repo contains the expected patch and command-produced file; audit contains metadata without raw command/output.
- Existing `main` WIP remains byte-for-byte untouched and the original planner state is either preserved or explicitly restored.

## Rollback

Stop the coding server and tunnel replica started by this slice, downgrade the canary repo grant to `read_only`, revoke the coding authorization revision, restore the prior planner config/service/app if changed, and preserve any managed worktree for inspection.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Prove the existing named Tunnel, public endpoint, OAuth flow, and exact coding schema without changing product code.
- [x] Create and connect an isolated ChatGPT developer-mode canary App with the dedicated repo as the only read-write grant.
- [x] Run a fresh structured-App ChatGPT canary and classify the observed result without treating setup or model prose as invocation proof.
- [x] Roll back the canary App, manual server/Tunnel processes, duplicated credentials, and ignored user config while preserving main WIP.
- [ ] Obtain the complete read/patch/process transcript; retest 2 produced a real `open_workspace` call, but ChatGPT issued `read` through another MCP session, causing `WORKSPACE_NOT_FOUND`, then blocked the retry with OpenAI safety checks.

## Observed Outcome

- Classification: `surface_blocked` after a real partial invocation; the full acceptance sequence did not complete.
- Fresh non-Pro conversation: `https://chatgpt.com/c/6a51d385-ca3c-83ea-909e-a523079301f5`.
- The temporary split-DNS resolver move allowed normal public OAuth. ChatGPT connected, discovered the coding schema, and invoked `open_workspace`, creating worktree `cws_e0da6855-f199-4121-8ead-0f4a8b440a70`; its metadata-only audit proves the call was real.
- ChatGPT's next `read` used another MCP session. The server correctly returned `WORKSPACE_NOT_FOUND: workspace_id is unknown or belongs to another MCP session`; OpenAI safety then blocked the retry. No patch, command session, poll, or canary output file was created.
- Rollback completed: the disposable App was deleted, manual server and Tunnel processes stopped, prior ignored config and launchd plist bytes restored, the resolver was restored byte-for-byte, duplicated credential/backup copies were removed, and the dirty main checkout retained its original two WIP entries. The managed worktree remains as failure evidence.

## Qualification Retest

- Resumed by the user on 2026-07-11 to test the same canary on a non-Pro ChatGPT model surface without changing the endpoint, schema, grant, prompt, or product code.
