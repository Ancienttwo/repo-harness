# Implementation Notes: chatgpt-coding-mcp-live-canary

## Initial decisions

- User explicitly authorized Cloudflare named tunnel and ChatGPT developer-mode app mutations while requiring the dirty main checkout to remain untouched.
- Reuse the existing `repo-harness-mcp` tunnel, `mcp.repoharness.com` hostname, `kito-mcp` app identity, and launchd labels only after live readback proves ownership and routing.
- Use a dedicated `~/.repo-harness/live-canary/repo` Git repository for all ChatGPT writes and commands. Do not grant repo-harness source write access.
- Run the feature-worktree CLI directly because the PATH-visible published CLI predates the coding profile.
- Canary acceptance uses supported pipe sessions. Bun PTY behavior remains an already documented product boundary, not a canary blocker.
- Only a visible ChatGPT `Called tool` transcript counts as `invocation_verified`; otherwise record `surface_blocked`.

## External state discipline

- Never print passphrases, OAuth tokens, tunnel credentials, cookies, or raw launchd environment values.
- Before mutation, record only non-secret hashes/metadata for user config and launchd plists so rollback can restore exact bytes locally.
- Do not create a second tunnel, hostname, persistence layer, or product wrapper unless the existing route is proven unusable and the contract is explicitly revised.

> **Status**: Blocked
> **Plan**: plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md
> **Contract**: tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md
> **Review**: tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md
> **Last Updated**: 2026-07-11 11:04
> **Lifecycle**: notes

## Design Decisions

- Reused Cloudflare named tunnel `repo-harness-mcp` and `mcp.repoharness.com`; no tunnel, DNS, or remote ingress mutation was needed.
- Used a separate App, `kito-mcp-coding-canary`, instead of mutating the existing `kito-mcp` App. This made rollback independent and left the existing App untouched.
- Kept the feature-worktree coding server as an ephemeral foreground process. The pre-existing launchd plists were already stale/stopped; repairing them would have expanded this eval-only canary into persistence/product repair.
- Worked around the host-only split-DNS failure for OAuth authorization by using the configured loopback redirect origin. The public ChatGPT-to-Cloudflare path remained on the stable HTTPS origin.
- Selected the App through the structured ChatGPT composer result, not by leaving `@name` as plain text. The resulting conversation still had no `api_tool` surface, which is a valid `surface_blocked` classifier rather than invocation evidence.

## Deviations From Plan Or Spec

- The existing stable Tunnel and DNS already matched the intended named tunnel and loopback upstream, so no Cloudflare mutation was performed.
- The existing `kito-mcp` App was not reused because it was already in a disconnected/reconnect state and mutating it would have made rollback ambiguous. A disposable developer-mode App was created and later deleted.
- The live `mcp doctor --live` aggregate did not report `tunnel_ready` solely because the local macOS resolver override timed out. Cloudflare-edge requests using the authoritative edge address verified the public route independently.
- The requested file/process sequence was not attempted locally after ChatGPT returned `surface_blocked`; fabricating the side effects would not satisfy the real `Called tool` contract.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Repair launchd before canary | Reject | Exact pre-canary state was stopped/stale; foreground processes were sufficient and easier to roll back. |
| Mutate the existing ChatGPT App | Reject | A disposable App isolated schema/OAuth testing from the user's existing connector. |
| Treat App settings schema as invocation proof | Reject | The contract requires a visible `Called tool` event and matching server/file evidence. |
| Retry by changing product code or model routing | Reject | The current blocker is the ChatGPT conversation tool surface, outside this eval-only contract. |

## Open Questions

- Which ChatGPT account/model surface will expose developer-mode App `api_tool` calls in a fresh normal Chat after the App is connected? The current Pro surface did not.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Fresh ChatGPT canary: `https://chatgpt.com/c/6a51b1c4-22a0-83ea-b3fb-2ec13308e691`

## Sanitized Live Evidence

| Layer | Result | Evidence |
|------|--------|----------|
| Local coding server | pass | Loopback health, OAuth, initialize, and exact tools schema completed on the feature-worktree CLI. |
| Cloudflare | pass with host-only diagnostic caveat | Named tunnel/DNS/remote ingress matched; Cloudflare edge returned health and OAuth metadata while unauthenticated `/mcp` returned 401. |
| OAuth/App schema | pass | DCR + PKCE + coding scope completed; ChatGPT settings showed the five coding tools with current schemas and security annotations. |
| ChatGPT invocation | `surface_blocked` | Structured-App fresh chat stated the connected App and `api_tool` were unavailable; no `Called tool` transcript and no server request occurred. |
| File/process proof | not run | No ChatGPT tool call meant no workspace, patch, command session, or output file existed. |
| Rollback | pass | Disposable App deleted; manual server/Tunnel stopped; prior ignored config/plists matched backup bytes before temporary secret copies were removed. |
| Main WIP | preserved | `/Users/kito/Projects/repo-harness` remained on `main` with `M tasks/current.md` and `?? plans/plan-20260711-0115-think-plan-011459.md`. |

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
