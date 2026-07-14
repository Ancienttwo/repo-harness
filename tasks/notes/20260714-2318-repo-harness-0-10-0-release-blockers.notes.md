# Implementation Notes: repo-harness-0-10-0-release-blockers

> **Status**: Active
> **Plan**: plans/plan-20260714-2318-repo-harness-0-10-0-release-blockers.md
> **Contract**: tasks/contracts/20260714-2318-repo-harness-0-10-0-release-blockers.contract.md
> **Review**: tasks/reviews/20260714-2318-repo-harness-0-10-0-release-blockers.review.md
> **Last Updated**: 2026-07-14 23:18
> **Lifecycle**: notes

## Design Decisions

- `repo-harness update` reads the persisted install profile before any runtime
  mutation; malformed state fails closed, while an absent state alone selects
  `minimal`.
- Persisted ownership is accepted only when every removal path exactly matches
  `installProfileHostMutationPaths(env)` and its type/hash/marker fields form a
  coherent managed-surface proof.
- Coding setup preflights every grant, then prepares config with the predicted
  registry revision inside one registry lock. The old registry revision keeps
  prepared config inert; one atomic registry write activates all grants, and a
  failed registry commit restores the previous config bytes.
- OAuth request identities are direct socket plus canonical route. Live buckets
  are never evicted to admit attacker churn: 1,024 live identities is the fixed
  capacity and expiry reopens space. Dynamic clients use a 30-day TTL and a
  64-client capacity with fail-closed persisted-state loading.
- Bun coding processes are pipe-only. The unreachable PTY schema, runtime
  branch, tests, and dependency were removed together; stdin, polling, SIGINT,
  output bounds, ownership isolation, and process-tree cleanup remain.

## Deviations From Plan Or Spec

- Per the user's explicit direction, Claude review is skipped. The current
  `/check` review uses local base review plus Codex security and architecture
  specialist passes.
- npm publish, tag creation, GitHub Release creation, registry readback, and
  installed-public-runtime readback are not authorized by the branch-cleanup
  request. This slice prepares and merges the source candidate only; external
  publication remains in the release filing for a separately authorized run.
- Allowed paths were widened to
  `docs/reference-configs/chatgpt-coding-mcp.md` because removing the public PTY
  contract without correcting its authoritative guide would leave source and
  distribution inconsistent.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Trust `X-Forwarded-For` behind the current tunnel | Reject | No explicit trusted-proxy contract exists; spoofing mints rate identities. |
| Evict live rate/OAuth entries at capacity | Reject | Eviction makes attacker churn a bypass; capacity must fail closed. |
| Keep PTY fields and add another runtime | Reject | The feature has never shipped under the official Bun runtime and would add a compatibility branch. |
| Batch registry writes under one registry lock | Adopt | All grants, access modes, the authorization revision, and config activation now form one fail-closed commit boundary. |

## Residual Risks

- Direct socket identity intentionally shares an OAuth limiter bucket across
  callers behind one tunnel. Per-caller identity requires a separately approved
  trusted-proxy contract; trusting caller-supplied forwarding headers here would
  reopen spoofable rate identities.
- Public dynamic client registration can fill the fixed 64-client, 30-day
  capacity and temporarily deny new registrations. The unauthenticated DCR
  protocol provides no stronger admission identity in this scope. This is a
  bounded availability risk, not an authorization bypass; live eviction or
  unbounded storage would make attacker churn the steady-state authority.

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix regression log: `.ai/harness/runs/20260714-0.10.0-release-blockers-pre-fix.log`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
