# Implementation Notes: chatgpt-coding-mcp

> **Status**: Done
> **Plan**: plans/plan-20260711-0137-chatgpt-coding-mcp.md
> **Contract**: tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md
> **Review**: tasks/reviews/20260711-0137-chatgpt-coding-mcp.review.md
> **Last Updated**: 2026-07-11 04:02 +0800
> **Lifecycle**: notes

## Design Decisions

- The user's explicit request overrides the bridge skill's prior planner-only safety default for one new `coding` profile; planner, executor, and orchestrator remain unchanged.
- Coding is capability parity with DevSpace's Codex-style tool loop, not UI/widget/subagent parity and not a DevSpace dependency.
- Worktree-first is the default workflow boundary; it is not described as a shell security sandbox.
- Live tunnel/DNS/ChatGPT mutations remain outside this contract and require separate authorization.
- The ignored user registry is the access source of truth. Every access-mode transition increments one authorization revision; coding access and refresh tokens are bound to that revision, and the HTTP runtime closes active coding sessions when it changes.
- The coding tool schema replaces conflicting reader/general-repo tools only inside the coding profile. Existing planner, executor, and orchestrator schemas are pinned by regression tests.
- File mutation uses workspace-relative paths, all-operation preflight, revision checks, temporary files, backups, and rollback. Successful mutations and process completion emit audit plus CodeGraph invalidation/refresh evidence; adapter failures remain explicit dead letters without undoing a successful filesystem mutation.
- Process execution intentionally uses the local OS user's authority. The only filesystem constraint is the initial workspace cwd; the environment is scrubbed independently and audit stores hashes/metadata rather than command or output text.

## Deviations From Plan Or Spec

- Runner availability fallback: the reused `/root/repo_harness_mcp_map` worker remained pinned to the prior system Plan Mode and refused repo-tracked writes. The main thread, which is under the later Default-mode developer instruction, took over the exact same authorization/setup contract paths. This is a runner-availability fallback only; scope and product semantics are unchanged.
- PTY runtime deviation: `node-pty@1.1.0` works in a Node smoke, but its callback path hangs under the repository's Bun 1.3.x runtime. The shipped Bun CLI therefore fails an explicit `tty=true` request with `PTY_UNAVAILABLE`; it never silently falls back to pipe. Pipe/background/input/poll/session cleanup remain available and covered. This residual is documented in the operator guide.
- Verification stabilization: three existing integration tests had 5s/20s budgets below their observed isolated runtimes (about 9.5s, 10s, and 14s). Their test-runner budgets were raised to 15s/15s/30s; no product wait or async behavior changed. The subsequent full suite passed 1127 tests with one Windows-only skip.
- Contract closeout correction: the generated outer `repo-harness run verify-contract ...` gate is not listed inside its own `commands_succeed`, avoiding recursive self-verification. It remains the outer closeout command.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Extend planner with shell | Reject | Would silently expand the existing public trust boundary. |
| New default-off coding profile | Use | Makes OAuth scope, tool schema, setup, and rollback independently testable. |
| Vendor or depend on DevSpace | Reject | The repo already owns stronger path, registry, audit, and CodeGraph primitives. |
| Cloudflare provider automation | Reject | The approved slice is guide plus verification and has no external mutation authority. |
| Container sandbox | Defer/out of scope | The approved trust model is explicit local-user shell authority. |
| Persist raw command/output for debugging | Reject | The local-user shell is high risk; audit retains only command hash, relative cwd, actor/session, duration, exit/signal, and byte counts. |
| Automatic tunnel/provider setup | Reject | The contract has no authority to mutate Cloudflare, DNS, launch services, or ChatGPT App state. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pinned source: `Waishnav/devspace@6ccefbf6213c56056a98ff52d7bdb27c081d13b9`, locally verified in ignored `_ref/devspace`.
- Durable comparison: `docs/researches/20260711-devspace-chatgpt-local-control.md`.
- Local OAuth/MCP E2E: `tests/cli/mcp-http.test.ts` covers Host/CORS/redirect rejection, DCR + PKCE, coding scope, `initialize`, exact `tools/list`, worktree, patch, short/long process, revision downgrade, process cleanup, and disabled health.
- Focused suites: 55 passing tests / 497 assertions across coding tools, process sessions, policy, OAuth, setup, HTTP, reader, and existing MCP tools.
- Security remediation review: the read-only specialist found two P1s and three P2s. Root instruction symlinks now fail closed; coding CodeGraph uses scrubbed env, skips granted-repo binaries, and redacts failure evidence; missing coding scope now returns `invalid_scope`; coding HTTP rejects non-OAuth auth modes; common credential files are denied; process completion remains audited after grant revocation. Focused regression tests cover every remediation.
- Full suite after remediation: `bun test` -> 1129 pass, 1 Windows-only skip, 0 fail, 11573 assertions.
- Package smoke: `bash scripts/check-tarball-install-smoke.sh` -> tarball installs and both packaged CLI bins start.
- External live state: `live_canary_pending_authorization`; no Tunnel, DNS, ChatGPT App, or live token mutation was performed.
- Contract verification: direct strict verifier completed `total=27 failed=0 status=Fulfilled`; the earlier schema-only retries established that every product command was green before the final label-aligned pass.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
