# Implementation Notes: mcp-oauth-client-ttl-active-token

> **Status**: Active
> **Plan**: plans/plan-20260807-0850-mcp-oauth-client-ttl-active-token.md
> **Contract**: tasks/contracts/20260807-0850-mcp-oauth-client-ttl-active-token.contract.md
> **Review**: tasks/reviews/20260807-0850-mcp-oauth-client-ttl-active-token.review.md
> **Last Updated**: 2026-08-07 08:50
> **Lifecycle**: notes

## Design Decisions

- Malformed `client_id_issued_at` (non-integer, `<= 0`, or in the future) stays an unconditional delete and is **not** eligible for the active-token exemption. It is a data-integrity check, not a TTL expiry, so an attacker-supplied or corrupt timestamp must never be kept alive by holding a token. Only the genuine `issuedAt + dynamicClientTtlSeconds <= now` branch consults token activity.
- Both cleanup sites share one predicate, `McpOAuthTokenStore.isRemovableClient(clientId, client, now)`. `cleanupExpiredClients()` applies it to `this.clients`; `load()` applies it to the freshly parsed client map. `load()` populates `this.accessTokens` / `this.refreshTokens` before the client filter runs, so the helper reads consistent state in both paths and the two sites cannot drift apart.
- Activity is derived from in-memory token state only. No new persisted field (no `last_used_at`): a valid refresh token already *is* the sliding proof of use, since `exchangeRefreshToken` rotates it to `now + refreshTokenTtlSeconds` on every call.
- Zombie guard: a refresh token only counts when it is itself unexpired **and** resolves to an access-token record owned by that client. Expired access tokens linger in the map by design (`load()` deliberately keeps an expired access token when a refresh token targets it), so counting mere presence would make every dead client immortal.

## Deviations From Plan Or Spec

- The worktree had no `node_modules`; ran `bun install --frozen-lockfile` (local, lockfile-pinned) before the pre-fix capture. The first capture attempt failed on a missing module rather than on the assertion, so the artifact was re-captured after install and now records a real assertion failure.
- No commit was made, per the dispatch.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Persist `last_used_at` and slide the client TTL on use | Rejected | Adds a persisted field and a second source of truth for liveness; the refresh token already carries sliding expiry |
| Exempt any client that appears in a refresh-token record | Rejected | Immortalizes dead clients, since expired access tokens are retained in the map on purpose |
| Extend the client TTL default beyond 30 days | Rejected | Moves the cliff instead of removing it, and the TTL default is out of scope |
| Derive liveness from unexpired access token OR unexpired refresh token resolving to a client-owned access token | Chosen | Keeps garbage-registration pressure intact while covering the real continuous-use path |

## Open Questions

- None.

## Evidence Links

- Pre-fix RED artifact: `.ai/harness/checks/pre-fix-mcp-oauth-client-ttl.log` (`PRE_FIX_EXIT=1`, 4 pass / 2 fail)
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
