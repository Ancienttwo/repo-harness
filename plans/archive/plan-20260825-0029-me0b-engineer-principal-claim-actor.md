# Plan: ME-0B Engineer Principal and Claim Actor

> **Status**: Archived
> **Created**: 20260825-0029
> **Slug**: me0b-engineer-principal-claim-actor
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Authenticated carrier, exact tool inventory, stale principal replay, receipt/live Lease parity, own-Claim compensation, and full repository checks
> **Rollback Surface**: Revert the isolated Engineer MCP profile, principal mapping, receipt, acquire wrapper, tests, architecture, and workflow artifacts without changing existing Task/Lease/Fleet data
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260825-0029-me0b-engineer-principal-claim-actor.contract.md`
> **Task Review**: `tasks/reviews/20260825-0029-me0b-engineer-principal-claim-actor.review.md`
> **Implementation Notes**: `tasks/notes/20260825-0029-me0b-engineer-principal-claim-actor.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md`
- Sprint contract: `tasks/contracts/20260825-0029-me0b-engineer-principal-claim-actor.contract.md`
- Sprint review: `tasks/reviews/20260825-0029-me0b-engineer-principal-claim-actor.review.md`
- Implementation notes: `tasks/notes/20260825-0029-me0b-engineer-principal-claim-actor.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260825-0029-me0b-engineer-principal-claim-actor.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md`.

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
- Contract file: `tasks/contracts/20260825-0029-me0b-engineer-principal-claim-actor.contract.md`
- Review file: `tasks/reviews/20260825-0029-me0b-engineer-principal-claim-actor.review.md`
- Implementation notes file: `tasks/notes/20260825-0029-me0b-engineer-principal-claim-actor.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260825-0029-me0b-engineer-principal-claim-actor.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the isolated Engineer MCP profile, principal mapping, receipt, acquire wrapper, tests, architecture, and workflow artifacts without changing existing Task/Lease/Fleet data
- **Verification boundary**: Authenticated carrier, exact tool inventory, stale principal replay, receipt/live Lease parity, own-Claim compensation, and full repository checks
- **Review/acceptance boundary**: `tasks/reviews/20260825-0029-me0b-engineer-principal-claim-actor.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260825-0029-me0b-engineer-principal-claim-actor.contract.md`, `tasks/reviews/20260825-0029-me0b-engineer-principal-claim-actor.review.md`, and `tasks/notes/20260825-0029-me0b-engineer-principal-claim-actor.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260825-0029-me0b-engineer-principal-claim-actor.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the isolated Engineer MCP profile, principal mapping, receipt, acquire wrapper, tests, architecture, and workflow artifacts without changing existing Task/Lease/Fleet data

## Captured Planning Output

## Goal

Implement the Approved ME-0B slice: a restricted OAuth-only Engineer MCP profile, server-derived `EngineerPrincipalV1`, operator-managed principal mapping fenced to the live ME-0A Binding, immutable `ClaimActorReceiptV1`, and engineer-scoped acquire that reuses the existing Fleet/Lease/WorkEnvelope path and compensates only its own Claim when receipt persistence fails.

## Success Criteria

- `engineer` is a closed MCP profile requiring OAuth scope `repo-harness.engineer`; its exact public tool inventory contains no shell, workspace coder, reader/writer, agent runner, generic Fleet mutation, operator Binding mutation, Publication or Acceptance mutation.
- OAuth grants for `engineer` receive a server-minted UUID `authorizationId`; refresh preserves it, a second grant differs, revocation/revision invalidates it, and an authorization cannot reuse another authorization's MCP session.
- `EngineerPrincipalMappingV1` and `EngineerPrincipalV1` use exact-key validation and canonical digests. Mapping bytes live in user-level repo-harness state with mode 0600, lock + atomic rename, and never contain bearer tokens.
- The authenticated HTTP boundary supplies the verified authorization subject to Engineer tools. Payload `engineer_id`, binding ID/generation/contract revision, MCP session ID and Provider Thread ID are fences/observations only and cannot select a principal.
- Every principal resolution revalidates the exact current ME-0A Binding; revoked mappings, retired/replaced Binding generations, contract revision changes, repository mismatch and payload mismatch fail before any Fleet mutation.
- `ClaimActorReceiptV1` binds exact WorkEnvelope task/repo/authorization/worktree/branch/unit fields, claim ID/generation, Engineer/Binding/contract identity and canonical WorkEnvelope digest. Live read rejects any Lease/WorkEnvelope mismatch.
- Engineer acquire calls the existing `acquireFleetTask`. Receipt failure releases only the returned claim ID after exact live claim/generation readback; it never touches a foreign/replaced Claim and reports an explicit rollback failure if compensation fails.
- Generic `fleet_acquire` behavior and Lease/Task/Publication/Acceptance schemas remain byte-for-byte unchanged.

## Scope

- Extend MCP profile/policy/OAuth/HTTP setup surfaces with an OAuth-only `engineer` profile and scope, without creating a coding runtime.
- Add pure principal/mapping/receipt schemas and canonical digest builders under `src/core/engineers/`.
- Add server-owned principal mapping storage under user-level repo-harness state, using the existing home authority derived from `repoHarnessRegisteredReposPath`.
- Add principal derivation + live Binding revalidation and immutable ClaimActorReceipt storage under `src/effects/engineers/`.
- Add an `acquireEngineerTask` wrapper that reuses Fleet acquire and exact own-claim release semantics.
- Add restricted Engineer MCP tools plus local operator CLI mapping list/enroll/revoke/status commands.
- Update Engineer Bindings/MCP ArchContext relations, module docs and durable workstream evidence.
- Add focused schema/store/auth mismatch/replay/acquire fault/E2E tool inventory tests.

## Non-scope

- No Codex App Server or Claude Provider adapter, Thread authentication, Session lifecycle, Worker Host or remote access.
- No Work Package Graph/EngineerOffer, scheduling, messaging, delegation, writer grant, verified context, handoff, interface request or Human Board.
- No Task, Lease, WorkEnvelope, Publication or Acceptance schema change; no second Lease and no task identity field derived from Engineer/Provider data.
- No generic CLI engineer acquire; engineer-scoped mutation exists only behind verified restricted MCP auth.
- No bearer token CLI parameter/output, shared credential across Bindings, automatic credential injection or heuristic mapping.
- No worktree deletion on receipt failure; a provisioned residual is reported and remains recoverable.

## P1 · Architecture Map

- `src/cli/mcp/oauth.ts` is the credential mint/verify/refresh/revoke authority. Generalize authorization-scoped behavior from coding-only to `coding|engineer`, with distinct required scopes.
- `src/cli/mcp/transports/http.ts` is the authenticated request boundary. Bind both coding and engineer MCP sessions to exact `authorizationId`; only coding allocates an open-shell runtime. Pass the verified subject directly into the Engineer tool context.
- `src/cli/mcp/policy.ts`, `types.ts`, `server.ts`, `tools.ts` and setup/auth config own profile selection and public tool inventory. Engineer capability flags remain all false; its tools are selected by exact profile, not by a broad capability that could expose other mutation families.
- `src/core/engineers/principal-claim.ts` owns closed protocol values and canonical digests only.
- `src/effects/engineers/principal-store.ts` owns user-level mapping state; `principal.ts` owns mapping + current Binding join; `claim-actor-store.ts` owns immutable receipts; `acquire.ts` owns the receipt/compensation effect composition.
- `src/effects/engineers/binding-store.ts` remains the live Binding authority. No mapping can bypass its current/event validation.
- `src/effects/fleet/acquire.ts`, coordination Lease store/commands and WorkEnvelope remain existing authorities and are called, not copied.
- `src/cli/commands/engineer.ts` exposes local operator enrollment/read/revoke only. `src/cli/mcp/engineer-tools.ts` is the only engineer-scoped mutation adapter.
- The existing `runtime-harness-engineer-bindings` and `runtime-harness-mcp-sidecar` capabilities own their respective prefixes; explicit relation/flow records document the authenticated MCP → principal → Binding → Fleet → receipt path.

Scale signal: the affected MCP boundary spans policy, config, OAuth, HTTP transport and tool dispatch; the Fleet acquire path is roughly 700 lines and already contains complete rollback semantics. ME-0B adds a wrapper and separate provenance receipt instead of modifying the Lease state machine.

## P2 · Concrete Trace

Operator first completes an Engineer OAuth grant. The server token endpoint mints `authorizationId`; local operator `engineer principal enroll` lists an unbound authorization from the token store and writes one mapping fenced to repository ID plus exact current Binding ID/generation/contract revision. No token value crosses the CLI surface.

An authenticated MCP initialize request is verified by the OAuth provider. HTTP stores the exact `authorizationId` on the transport, rejects session reuse by a different authorization, and constructs an Engineer tool context containing that verified subject. `engineer_acquire` accepts task/offer/binding fields only as optimistic fences. Principal resolution loads the mapping, revalidates canonical mapping bytes, loads the current ME-0A Binding, and requires exact repository/engineer/binding/generation/contract equality plus active states. It returns a frozen principal; missing/revoked/stale/mismatched state stops here.

`acquireEngineerTask` calls `acquireFleetTask` with the principal's non-authoritative audit session label and the caller's offer fences. Fleet revalidates registry/offer, claims under the existing task lock, provisions/binds the worktree, writes the Claim token, projects the plan, and returns the exact final-verified WorkEnvelope. ME-0B canonicalizes that envelope, builds an immutable ClaimActorReceipt, writes it create-if-absent and fsyncs the file plus directory. Live read joins receipt to current Lease and rejects mismatch.

If receipt persistence throws, ME-0B re-reads the Lease and requires the returned claim ID and generation. It invokes the existing owned-claim release with that claim ID. A stolen/replaced Claim cannot be released because claim ID is the Lease ownership token; a release failure becomes typed `rollback_failed`. The created worktree is retained as a recoverable residual. Generic Fleet acquire never enters this receipt path.

Async boundary: OAuth/HTTP is request-async; mapping, Binding, Fleet and receipt effects are synchronous local state transitions. Revocation invalidates token verification first; mapping cleanup is idempotent and cannot extend authority because live Binding revalidation remains mandatory.

## P3 · Design Decision

Use OAuth authorization identity, not Provider Thread or hook session identity. The canary proves it is server-minted, refresh-stable, revocable and transport-bound. Reusing the coding profile would defeat the boundary because it exposes arbitrary shell access to the same user-level state, so Engineer must be a distinct no-shell profile even though both reuse OAuth mechanics.

Keep principal mapping in user-level server state rather than Git/worktree state. The mapping is transport authorization configuration, while the Git-common-dir Binding remains the repository-scoped current-role authority. The mandatory join on every command prevents dual authority: mapping selects a candidate principal; current Binding decides whether it is still valid.

Keep ClaimActorReceipt separate from Lease. Lease answers who currently owns task execution; receipt answers which authenticated Engineer principal caused this exact Claim. Extending Lease would entangle generic Fleet callers and change task identity semantics. A receipt wrapper is the smallest coherent change that adds provenance and failure compensation without altering Fleet's canonical state machine.

At 10× P0 scale, the single user-level mapping lock and linear lookup fail first. With two canary Engineers and one active Claim each, that is acceptable; do not add a database, cache, daemon or background reconciler without measured contention or multi-host requirements.

## Closed Protocol Decisions

- Carrier is exactly `mcp_oauth`; `auth_subject` is verified `authorizationId`.
- Engineer OAuth scope is exactly `repo-harness.engineer`; coding scope does not imply Engineer authority and Engineer scope does not imply coding authority.
- Engineer MCP has an exact allowlist of Engineer tools; generic tool builders do not infer it from reader/executor/coding capabilities.
- Mapping store path is a deterministic sibling of the registered-repo authority under repo-harness user state. Mapping records are per authorization and repository; duplicate active assignment is rejected.
- Operator enrollment accepts authorization ID plus exact Binding fences, never an access/refresh token.
- Provider and Provider Thread remain nullable observation fields on the principal/receipt and never participate in auth subject derivation.
- WorkEnvelope digest covers the complete canonical envelope including Claim token and plan proof.
- Receipt identity is derived from repository ID + task ID + claim ID; same identity/same bytes is idempotent, same identity/different bytes is corruption.
- Receipt write precedes success response. A failure after Fleet success compensates only the exact returned claim.
- A mapping revoke does not retire a Binding or release a Claim; those authorities remain independent.

## Candidate File Changes

- `src/core/engineers/principal-claim.ts` — schemas, validation, canonicalization and digests.
- `src/effects/engineers/principal-store.ts` — user-level mapping lock/store.
- `src/effects/engineers/principal.ts` — verified subject + mapping + live Binding resolution.
- `src/effects/engineers/claim-actor-store.ts` — immutable receipt publication/readback.
- `src/effects/engineers/acquire.ts` — Fleet acquire composition and receipt-failure compensation.
- `src/cli/mcp/engineer-tools.ts` — exact Engineer MCP definitions/dispatch.
- `src/cli/mcp/{types,policy,oauth,server,tools,transports/http}.ts` and setup/auth surfaces — profile/scope/auth subject plumbing.
- `src/cli/commands/engineer.ts` — operator principal mapping surfaces only.
- ArchContext relation/flow/module/workstream artifacts for the cross-capability path.
- Focused unit/effect/CLI/MCP HTTP tests; existing OAuth/HTTP/Fleet suites amended only where the closed profile changes their exhaustive expectations.

## Verification

- Focused principal schema/store/Binding replay/receipt/acquire compensation tests.
- Focused MCP policy/OAuth/HTTP E2E tests including exact tool inventory and cross-authorization hijack refusal.
- Existing Engineer Binding, Fleet acquire, coordination Lease, MCP OAuth and MCP HTTP suites.
- `bun run check:type`
- `bun test --timeout 60000`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts init --repo . --dry-run`
- Independent acceptance review on the exact final subject before merge.

## Task Breakdown

- [x] Freeze exact schemas, profile/scope/tool inventory, allowed paths and architecture relations.
- [x] Implement restricted Engineer OAuth profile plus principal mapping/enrollment/revocation.
- [x] Implement principal resolution and stale/mismatch replay matrix.
- [x] Implement ClaimActorReceipt store, engineer acquire wrapper and own-Claim compensation.
- [ ] Add MCP Engineer tools/E2E evidence, run full verification and independent acceptance, then close the contract worktree.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze exact schemas, profile/scope/tool inventory, allowed paths and architecture relations.
- [x] Implement restricted Engineer OAuth profile plus principal mapping/enrollment/revocation.
- [x] Implement principal resolution and stale/mismatch replay matrix.
- [x] Implement ClaimActorReceipt store, engineer acquire wrapper and own-Claim compensation.
- [ ] Add MCP Engineer tools/E2E evidence, run full verification and independent acceptance, then close the contract worktree.
