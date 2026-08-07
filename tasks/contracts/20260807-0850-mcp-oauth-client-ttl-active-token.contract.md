# Task Contract: mcp-oauth-client-ttl-active-token

> **Status**: Active
> **Plan**: plans/plan-20260807-0850-mcp-oauth-client-ttl-active-token.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-07 08:50
> **Review File**: `tasks/reviews/20260807-0850-mcp-oauth-client-ttl-active-token.review.md`
> **Notes File**: `tasks/notes/20260807-0850-mcp-oauth-client-ttl-active-token.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

GitHub issue #161: dynamic MCP OAuth clients expire on an absolute 30-day TTL while refresh tokens slide (rotation resets 30 days each use). Actively used ChatGPT connectors hit day 30, the client record is cleaned, refresh exchange fails with invalid_client, and the user is forced through periodic re-authorization. The reporter downgraded to read-only url-token mode because of this. If skipped, every OAuth connector breaks monthly regardless of activity.

## Goal

A client whose absolute TTL has elapsed is exempt from cleanup while it still holds active tokens, in both `cleanupExpiredClients()` and the `load()` client filter, using one shared predicate. Active means: an unexpired access token with `info.clientId === clientId`, or an unexpired refresh token whose `accessToken` maps to such a record. Zombie state (expired access + expired refresh lingering from lazy cleanup) must not keep a client alive. Malformed `client_id_issued_at` stays unconditionally deleted (data integrity, not TTL). Net effect: spam registrations still cleaned at 30 days, active users never re-authorize, idle >30 days breaks the whole chain uniformly.

## Scope

- In scope: `src/cli/mcp/oauth.ts` (`McpOAuthTokenStore` cleanup/load predicates only), `tests/cli/mcp-oauth.test.ts` regression cases.
- Out of scope: TTL default values, `registerClient` capacity logic, `createMcpOAuthProvider` behavior, persistence schema changes (no `last_used_at`), unrelated refactors.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a spam-registered client (never completed authorization) survives past 30 days under the new predicate, the exemption is too broad and the direction is wrong. Cheapest proof point: the "expired client with no tokens is deleted" test case.

## Root Cause Evidence

- root_cause: `src/cli/mcp/oauth.ts:86` — `cleanupExpiredClients()` deletes any client where `client_id_issued_at + dynamicClientTtlSeconds <= now`, ignoring live refresh-token state, so an actively refreshing client is removed at day 30 and subsequent refresh exchanges fail with invalid_client.
- repro: register a client, complete authorization to obtain a refresh token, advance the injected clock past 30 days, call `getClient()` / `exchangeRefreshToken()` — the client is gone and the exchange throws although the refresh token is still valid.
- regression_guard: tests/cli/mcp-oauth.test.ts
- pre_fix_failure_artifact: .ai/harness/checks/pre-fix-mcp-oauth-client-ttl.log

## Workflow Inventory

- Source plan: `plans/plan-20260807-0850-mcp-oauth-client-ttl-active-token.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260807-0850-mcp-oauth-client-ttl-active-token.review.md`
- Notes file: `tasks/notes/20260807-0850-mcp-oauth-client-ttl-active-token.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260807-0850-mcp-oauth-client-ttl-active-token.contract.md
  - tasks/reviews/20260807-0850-mcp-oauth-client-ttl-active-token.review.md
  - tasks/notes/20260807-0850-mcp-oauth-client-ttl-active-token.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/checks/
  - src/cli/mcp/oauth.ts
  - tests/cli/
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260807-0850-mcp-oauth-client-ttl-active-token.notes.md
  tests_pass:
    - path: tests/cli/mcp-oauth.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
