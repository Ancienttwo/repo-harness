# Plan: MCP OAuth: exempt clients with active tokens from TTL cleanup

> **Status**: Executing
> **Created**: 20260807-0850
> **Slug**: mcp-oauth-client-ttl-active-token
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: github-issue-161
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: bun test full suite plus repo required checks
> **Rollback Surface**: single commit on src/cli/mcp/oauth.ts + tests/cli/mcp-oauth.test.ts
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260807-0850-mcp-oauth-client-ttl-active-token.contract.md`
> **Task Review**: `tasks/reviews/20260807-0850-mcp-oauth-client-ttl-active-token.review.md`
> **Implementation Notes**: `tasks/notes/20260807-0850-mcp-oauth-client-ttl-active-token.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: github-issue-161
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260807-0850-mcp-oauth-client-ttl-active-token.md`
- Sprint contract: `tasks/contracts/20260807-0850-mcp-oauth-client-ttl-active-token.contract.md`
- Sprint review: `tasks/reviews/20260807-0850-mcp-oauth-client-ttl-active-token.review.md`
- Implementation notes: `tasks/notes/20260807-0850-mcp-oauth-client-ttl-active-token.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260807-0850-mcp-oauth-client-ttl-active-token.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260807-0850-mcp-oauth-client-ttl-active-token.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260807-0850-mcp-oauth-client-ttl-active-token.md`.

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
- Contract file: `tasks/contracts/20260807-0850-mcp-oauth-client-ttl-active-token.contract.md`
- Review file: `tasks/reviews/20260807-0850-mcp-oauth-client-ttl-active-token.review.md`
- Implementation notes file: `tasks/notes/20260807-0850-mcp-oauth-client-ttl-active-token.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260807-0850-mcp-oauth-client-ttl-active-token.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260807-0850-mcp-oauth-client-ttl-active-token.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single commit on src/cli/mcp/oauth.ts + tests/cli/mcp-oauth.test.ts
- **Verification boundary**: bun test full suite plus repo required checks
- **Review/acceptance boundary**: `tasks/reviews/20260807-0850-mcp-oauth-client-ttl-active-token.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260807-0850-mcp-oauth-client-ttl-active-token.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260807-0850-mcp-oauth-client-ttl-active-token.contract.md`, `tasks/reviews/20260807-0850-mcp-oauth-client-ttl-active-token.review.md`, and `tasks/notes/20260807-0850-mcp-oauth-client-ttl-active-token.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260807-0850-mcp-oauth-client-ttl-active-token.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single commit on src/cli/mcp/oauth.ts + tests/cli/mcp-oauth.test.ts

## Captured Planning Output

# MCP OAuth: exempt clients with active tokens from TTL cleanup

## Problem (GitHub issue #161)

MCP OAuth dynamic clients expire on an absolute 30-day TTL (`client_id_issued_at + dynamicClientTtlSeconds`, `src/cli/mcp/oauth.ts:67,86`), while refresh tokens slide (each `exchangeRefreshToken` rotation resets a fresh 30-day window, `src/cli/mcp/oauth.ts:354-387`). An actively used ChatGPT connector therefore hits day 30, the client record is cleaned up, the still-valid refresh token exchange fails with `invalid_client`, and the user is forced through periodic re-authorization. Reporter has downgraded to read-only url-token mode because of this.

## Decision

Do NOT enlarge the TTL number. Change the cleanup predicate instead: a client whose absolute TTL has elapsed is exempt from deletion while it still has active tokens. Client liveness is derived from existing token state (single source of truth; no new persisted field such as `last_used_at`).

Active token definition (anti-zombie, security boundary):
- an access token record with `info.clientId === clientId` that is unexpired (`!info.expiresAt || info.expiresAt > now`), OR
- an unexpired refresh token (`record.expiresAt === undefined || record.expiresAt > now`) whose `accessToken` maps to an access-token record with `info.clientId === clientId`.

Zombie state (expired access token + expired refresh token lingering only due to lazy cleanup) must NOT keep a client alive.

Malformed `client_id_issued_at` (non-integer, `<= 0`, future) remains unconditionally deleted — that branch is data integrity, not TTL, and gets no exemption.

Effects:
- Spam registrations (never completed authorization) are still cleaned at 30 days; `maxDynamicClients` cap unchanged.
- Active users never re-authorize: rotating refresh tokens keep the client alive.
- Idle > 30 days: refresh token expires first, client follows — the whole chain uniformly means "30 days idle breaks the authorization".

## Task Breakdown

- [x] Add a single shared expiry predicate (private helper) in `McpOAuthTokenStore` and use it from both `cleanupExpiredClients()` (src/cli/mcp/oauth.ts:81-92) and the client filter loop in `load()` (src/cli/mcp/oauth.ts:107-120).
- [x] Tests in `tests/cli/mcp-oauth.test.ts` (reuse existing clock-injection style): (1) client past 30 days with active refresh token is kept and `exchangeRefreshToken` succeeds; (2) client past 30 days with no tokens is deleted; (3) zombie tokens do not keep the client; (4) `load()` path applies the same exemption.
- [x] Full `bun test` green plus repo required checks.

## Out of scope

TTL default values, `registerClient` capacity logic, `createMcpOAuthProvider` behavior, any persistence schema change, unrelated refactors.

## Verification

`bun test` (full suite) and the repo required checks (`check-task-sync`, `check-task-workflow --strict`, `init --repo . --dry-run`).

## Rollback

Single commit touching `src/cli/mcp/oauth.ts` + `tests/cli/mcp-oauth.test.ts`; revert restores the absolute-TTL behavior.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add a single shared expiry predicate (private helper) in `McpOAuthTokenStore` and use it from both `cleanupExpiredClients()` (src/cli/mcp/oauth.ts:81-92) and the client filter loop in `load()` (src/cli/mcp/oauth.ts:107-120).
- [x] Tests in `tests/cli/mcp-oauth.test.ts` (reuse existing clock-injection style): (1) client past 30 days with active refresh token is kept and `exchangeRefreshToken` succeeds; (2) client past 30 days with no tokens is deleted; (3) zombie tokens do not keep the client; (4) `load()` path applies the same exemption.
- [x] Full `bun test` green plus repo required checks.
