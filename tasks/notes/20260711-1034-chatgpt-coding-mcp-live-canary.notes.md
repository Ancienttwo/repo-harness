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
> **Last Updated**: 2026-07-11 15:23
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

## Qualification Retest 2

- User resumed the blocked contract with `go on`.
- Hold all controllable inputs constant and change only the ChatGPT model surface from Pro to a non-Pro option exposed by the current account.
- Recreate a disposable developer-mode App, run the exact same five-tool prompt, and apply the same `invocation_verified` versus `surface_blocked` classifier.
- OAuth popup diagnosis proved the local macOS resolver override `/etc/resolver/repoharness.com` sent the public hostname to `192.168.50.1`, which returned no address while public DoH returned the Cloudflare edge addresses. The user explicitly authorized a temporary resolver move/restore for this canary at 2026-07-11 13:16 +0800.
- The resolver was backed up, temporarily moved with administrator authorization, and public DNS/health passed. It was restored byte-for-byte during rollback.
- Browser-controlled navigation supplied the public origin as an `Origin` header and correctly hit `origin_not_allowed`; the production allowlist was not weakened. Authorization instead POSTed the authoritative OAuth parameters from the fresh ChatGPT URL with `Origin: https://chatgpt.com`, then opened the exact ChatGPT callback.
- OAuth completed and the App showed `Connected`. The non-Pro fresh Chat invoked `open_workspace`, creating `cws_e0da6855-f199-4121-8ead-0f4a8b440a70` and a metadata-only audit record at `2026-07-11T05:25:18.165Z`.
- The next `read` call was made under another MCP session and the source-repo audit recorded `WORKSPACE_NOT_FOUND` at `2026-07-11T05:25:29.051Z`. ChatGPT then reported that OpenAI safety blocked its retry. No write or shell action ran.
- This proves the Cloudflare/OAuth/App/tool boundary is real, but also proves the current ChatGPT multi-call behavior is incompatible with workspace IDs bound to a single MCP session. Product behavior was not changed in this eval-only contract.

## Post-authorization-runtime canary

- Commit `2a9d49053acf` replaced transport-session workspace/process ownership with opaque OAuth-authorization ownership while preserving authorization-revision revocation, repo-grant isolation, transport hijack rejection, idle cleanup, and shutdown cleanup.
- Disposable App `kito-mcp-coding-canary-auth-runtime` connected to `https://mcp.repoharness.com/mcp`, discovered the exact 24 actions, and was configured to allow read actions while retaining confirmations for destructive actions.
- Fresh conversation `https://chatgpt.com/c/6a51ed4c-b6d8-83ea-904b-8b2b3debe7a7` completed the bounded canary against `repo_ead1bdeb70dca348`. The new managed worktree is `cws_155e096c-f7ee-4dfe-90d9-3d7aca50db4c` on `codex/mcp-repo-851e1dd3`.
- The preserved worktree proves the exact final effects: `docs/spec.md` ends with `canary-auth-runtime-ok`, and `canary/process.txt` contains exactly `process-auth-runtime-ok`. Their SHA-256 values are `dcdc87d6d67799c6b66a72bc296443a24719ac291e53bc8f6eaf64d05ac091e6` and `6b4bf83675e7312e7ad902e3756a812a3f97f0889b6940bed93eec4debc60724`.
- Audit records successful `open_workspace`, `read`, `apply_patch`, `exec_command` with exit 0 and 17 output bytes, and both final reads. It contains no raw command, stdout, or stderr. `write_stdin` polling is not a standalone audit event by design; the current ChatGPT Activity UI also omitted the literal poll row, so the strict transcript classifier cannot independently attest that one call.
- Both mutation-triggered CodeGraph refreshes recorded non-retryable `INDEX_UNAVAILABLE` because the dedicated canary repo intentionally has no CodeGraph index. This is expected dead-letter behavior, not a coding mutation failure.
- The expanded ChatGPT Activity panel visibly showed the structured App, `open_workspace` input, subsequent `read` input, and exact final response, but no literal `Called tool` labels and no complete enumeration of the patch/process/poll rows. After the disposable App was deleted, reopening the conversation URL rendered an empty conversation, so that transient UI cannot serve as durable acceptance evidence. Functional live execution is verified; the plan's stricter UI-only classifier remains `surface_blocked`.
- Rollback deleted the disposable App, stopped the foreground server/Tunnel, removed generated credentials/runtime state, restored ignored config and launchd plists from the exact pre-canary snapshot, restored `/etc/resolver/repoharness.com` to SHA-256 `e37d88018df438ebc571cf1a12fcefbe96ff9bcb82932bd8ec560fd84dd58f0b`, returned both old labels to `spawn scheduled` with `EX_CONFIG`, kept the canary source repo clean, and preserved both managed worktrees. `registered-repos.json` was rewritten once after its first restore; after all canary processes were stopped it was restored again and remained byte-identical across a delayed comparison. Main WIP remained `M tasks/current.md` plus `?? plans/plan-20260711-0115-think-plan-011459.md`.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Fresh ChatGPT canary: `https://chatgpt.com/c/6a51ed4c-b6d8-83ea-904b-8b2b3debe7a7`

## Sanitized Live Evidence

| Layer | Result | Evidence |
|------|--------|----------|
| Local coding server | pass | Loopback health, OAuth, initialize, and exact tools schema completed on the feature-worktree CLI. |
| Cloudflare | pass with host-only diagnostic caveat | Named tunnel/DNS/remote ingress matched; Cloudflare edge returned health and OAuth metadata while unauthenticated `/mcp` returned 401. |
| OAuth/App schema | pass | DCR + PKCE + coding scope completed; ChatGPT settings showed the five coding tools with current schemas and security annotations. |
| ChatGPT invocation | functional pass, strict transcript blocked | Structured-App chat completed the requested local coding sequence; the current Activity panel omitted literal `Called tool` labels and some call rows. |
| File/process proof | pass with poll-visibility caveat | Patch and command output match the final response and metadata-only audit; the UI and audit do not independently enumerate the `write_stdin` poll. |
| Rollback | pass | Disposable App deleted; manual server/Tunnel stopped; prior ignored config/plists and resolver matched backup bytes before temporary copies were removed. |
| Main WIP | preserved | `/Users/kito/Projects/repo-harness` remained on `main` with `M tasks/current.md` and `?? plans/plan-20260711-0115-think-plan-011459.md`. |

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
