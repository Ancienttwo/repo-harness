# Plan: Cross-restart OAuth refresh regression test (issue #161)

> **Status**: Archived
> **Created**: 20260806-2319
> **Slug**: issue-161-oauth-restart-regression
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: bun test tests/cli/mcp-oauth.test.ts; full bun test
> **Rollback Surface**: Revert the single test addition in tests/cli/mcp-oauth.test.ts
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260806-2319-issue-161-oauth-restart-regression.contract.md`
> **Task Review**: `tasks/reviews/20260806-2319-issue-161-oauth-restart-regression.review.md`
> **Implementation Notes**: `tasks/notes/20260806-2319-issue-161-oauth-restart-regression.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260806-2319-issue-161-oauth-restart-regression.md`
- Sprint contract: `tasks/contracts/20260806-2319-issue-161-oauth-restart-regression.contract.md`
- Sprint review: `tasks/reviews/20260806-2319-issue-161-oauth-restart-regression.review.md`
- Implementation notes: `tasks/notes/20260806-2319-issue-161-oauth-restart-regression.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260806-2319-issue-161-oauth-restart-regression.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260806-2319-issue-161-oauth-restart-regression.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260806-2319-issue-161-oauth-restart-regression.md`.

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
- Contract file: `tasks/contracts/20260806-2319-issue-161-oauth-restart-regression.contract.md`
- Review file: `tasks/reviews/20260806-2319-issue-161-oauth-restart-regression.review.md`
- Implementation notes file: `tasks/notes/20260806-2319-issue-161-oauth-restart-regression.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260806-2319-issue-161-oauth-restart-regression.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260806-2319-issue-161-oauth-restart-regression.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single test addition in tests/cli/mcp-oauth.test.ts
- **Verification boundary**: bun test tests/cli/mcp-oauth.test.ts; full bun test
- **Review/acceptance boundary**: `tasks/reviews/20260806-2319-issue-161-oauth-restart-regression.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260806-2319-issue-161-oauth-restart-regression.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260806-2319-issue-161-oauth-restart-regression.contract.md`, `tasks/reviews/20260806-2319-issue-161-oauth-restart-regression.review.md`, and `tasks/notes/20260806-2319-issue-161-oauth-restart-regression.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260806-2319-issue-161-oauth-restart-regression.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single test addition in tests/cli/mcp-oauth.test.ts

## Captured Planning Output

## Goal

Add one regression test covering GitHub issue #161's verified scenario: MCP OAuth dynamic client registration and refresh token state must survive a server restart.

## Background

Issue #161 reported invalid_client / invalid_grant after local OAuth server restarts (in another tool). repo-harness's `McpOAuthTokenStore` (src/cli/mcp/oauth.ts) persists clients/access/refresh tokens to `mcp.oauth-tokens.json` and `McpHttpTransport` calls `tokenStore.load()` on startup (src/cli/mcp/transports/http.ts:571). A runtime probe confirmed the cross-restart refresh exchange works, but no committed test covers it: tests/cli/mcp-http.test.ts only covers client reload; tests/cli/mcp-oauth.test.ts tests are single-store.

## Scope

- `tests/cli/mcp-oauth.test.ts`: add exactly one test case `dynamic client and refresh token survive server restart (issue #161)` inside the existing `mcp oauth provider` describe block, matching existing style (mkdtempSync + try/finally rmSync, reuse redirectRecorder helper).
- Scenario: store A registers a dynamic client, completes authorize + exchangeAuthorizationCode with `repo-harness offline_access` scopes; a fresh store B on the same path calls load(); assert getClient finds the client, exchangeRefreshToken with the old refresh token succeeds with rotated tokens, verifyAccessToken passes on the new access token, and reusing the old refresh token rejects with InvalidGrantError.
- No production code changes. No other files.

## Verification

- `bun test tests/cli/mcp-oauth.test.ts` green including the new case.
- Full `bun test` green.

## Rollback

Revert the single test addition.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Cross-restart OAuth refresh regression test (issue #161)
