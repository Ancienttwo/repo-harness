# Plan: ME-4B Interface Change Request

> **Status**: Executing
> **Created**: 20260826-1617
> **Slug**: me4b-interface-change-request
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: `plans/prds/20260824-1653-interface-change-request.prd.md`
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Exact actor/CAS lifecycle plus tracked Work Graph materialization proof
> **Rollback Surface**: ME-4B core/store/CLI/capability projection and the narrow exported Work Package validator
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260824-persistent-module-engineer-organization.md`
> **Task Contract**: `tasks/contracts/20260826-1617-me4b-interface-change-request.contract.md`
> **Task Review**: `tasks/reviews/20260826-1617-me4b-interface-change-request.review.md`
> **Implementation Notes**: `tasks/notes/20260826-1617-me4b-interface-change-request.notes.md`

## Objective

Deliver ME-4B as a closed cross-capability decision authority. A current source Engineer may propose and submit; Human authority accepts/rejects; a current target Engineer may start and close implementation only after exact tracked Sprint/Work Graph materialization; Human alone records integration. Messages, architecture events, code changes and green checks never infer transitions.

## P1 Architecture Map

- `src/core/engineers/interface-change.ts` owns closed request, actor, event/current and immutable planning-projection schemas.
- `src/effects/engineers/interface-change-store.ts` owns git-common immutable storage, per-request locking/CAS, current Binding validation, tracked Git materialization proof and deterministic reverse lookup.
- `src/core/engineers/scheduling.ts` remains Work Package schema authority and exports only its existing exact `WorkPackageDefinitionV1` validator/canonical revision operation.
- `src/cli/mcp/engineer-tools.ts` exposes only the Human-approved Engineer transitions (`propose`, `submit`, `cancel`, `materialize`, `implemented`) and derives principal identity from the existing OAuth authorization carrier. `src/cli/commands/interface-change.ts` exposes Human-only `accept|reject|cancel|integrated` plus read/lookup.
- ME-1C messages and ArchContext events remain downstream notification/projection surfaces. The ME-4B store does not call either as semantic authority.

## P2 Concrete Trace

1. Resolve the requesting Engineer from an authorization carrier and revalidate its exact active Binding against the source capability.
2. Under the request lock, persist the canonical request and `propose` event, then publish current revision 1.
3. The same current source Engineer submits under `expected_current_digest`; stale competitors fail.
4. Human accepts with one `InterfaceWorkPackageProjectionV1` containing the target Sprint path, expected current Work Graph revision and exact proposed `WorkPackageDefinitionV1`; only immutable projection bytes are written.
5. The existing planning/Git workflow separately changes the tracked Sprint/Work Graph.
6. A current target Engineer supplies the exact commit. The store reads the tracked Sprint and sibling carrier at that commit, projects it through ME-1A, and advances only if the exact repository/Work Package revision matches the accepted projection.
7. Target Engineer records immutable implementation evidence; Human separately records integration evidence.

## P3 Decision Rationale

- Preserve one authority per datum: request/event/current owns interface decisions; tracked Sprint/Work Graph owns schedulable work; ArchContext owns architecture projection; Git/Acceptance remain unchanged.
- Do not add `source_ref` to `WorkPackageDefinitionV1`; that would rewrite delivered ME-1A wire semantics. Reverse linkage is a deterministic index over accepted projection and materialization events.
- Do not auto-edit planning files on acceptance. The explicit planning transaction is the Human review boundary and prevents an accepted request from becoming code/task authority.
- At 10x request volume, per-request locks and content-addressed objects scale independently; the first pressure point is reverse-index scanning, which can later receive a rebuildable index without changing semantic records.

## File Changes

| File | Action | Description |
|---|---|---|
| `plans/prds/20260824-1653-interface-change-request.prd.md` | Modify | Freeze Approved schema, actor matrix and projection authority |
| `docs/researches/20260824-persistent-module-engineer-organization.md` | Modify | Record ME-4B authority closure |
| `src/core/engineers/interface-change.ts` | Add | Closed canonical schemas and transition matrix |
| `src/effects/engineers/interface-change-store.ts` | Add | Immutable store, CAS, Binding and Git materialization validation |
| `src/core/engineers/scheduling.ts` | Modify | Export the existing exact Work Package validator/revision calculation |
| `src/cli/mcp/engineer-tools.ts` | Modify | Authenticated Engineer-only mutation surface with current Binding fences |
| `src/cli/commands/interface-change.ts` | Add | Human-only transition plus read/lookup surface |
| `src/cli/index.ts` | Modify | Register command |
| `tests/unit/me4b-interface-change-request.test.ts` | Add | Schema, race, actor, materialization and closure tests |
| `tests/cli/interface-change.test.ts` | Add | CLI validation and notification non-authority tests |
| `tests/cli/mcp-http.test.ts` | Modify | Pin the authenticated HTTP MCP tool inventory including the two restricted ME-4B tools |
| `.archcontext/model/nodes/capability.runtime-harness.interface-change.yaml` | Add | Capability authority |
| `.archcontext/model/nodes/component.interface-change.primary.yaml` | Add | Store component projection |
| `.archcontext/model/nodes/capability.runtime-harness.mcp-sidecar.yaml` | Modify | Declare the authenticated MCP-to-ME-4B effect relation |
| `.archcontext/model/relations/relation.interface-change.*.yaml` | Add | Declare store, Binding and ME-1A scheduling dependencies |
| `.archcontext/model/relations/relation.mcp-sidecar.interface-change.yaml` | Add | Declare the restricted authenticated MCP mutation edge |
| `.archcontext/model/flows/flow.interface-change.transition.yaml` | Add | Prove Binding-fenced transition and exact Git materialization flow |
| `docs/architecture/modules/runtime-harness/interface-change.md` | Add/project | Human entrypoint generated from ArchContext |
| `docs/architecture/domains/runtime-harness.md` | Project | Regenerate runtime-harness capability index |
| `AGENTS.md`, `CLAUDE.md` | Project | Sync the selected interface-change architecture contract block |
| workflow artifacts | Add/project | Contract, review, notes and workstream state |

## Invariants

- No direct Task, Lease, Sprint, Work Graph, Publication, Acceptance, architecture-event or code mutation.
- No Provider runtime, daemon, generic Worker Host, query loop, fallback or message-body parser.
- Engineer mutations require exact current Binding; Human acceptance/integration cannot be self-claimed by an Engineer.
- The restricted Engineer MCP surface is the sole Engineer mutation entrypoint; authorization IDs never enter semantic records or CLI arguments.
- `materialize` reads exact tracked Git bytes and reuses ME-1A projection; working-tree bytes are never authority.
- Retried idempotency keys name identical operation bytes; stale revision races yield exactly one winner.

## Task Breakdown

- [x] Freeze and approve ME-4B architecture, actor matrix and planning-projection boundary.
- [x] Implement closed core schemas and transition matrix.
- [x] Implement immutable store, current CAS, Binding validation, exact Git materialization and reverse lookup.
- [x] Add bounded CLI and focused tests.
- [x] Add ArchContext capability/module projection and obtain Architecture Acceptance if the gate requests it.
- [ ] Run focused tests, typecheck, root required checks, full suite and independent acceptance/merge gates.

## Verification Boundary

Focused tests must prove: exact-key rejection; two stale transitions yield one winner; request/current crash recovery; source/target/Human actor separation; messages cannot transition; acceptance writes no tracked planning bytes; pre-materialization refusal; exact commit materialization; separate implementation/integration evidence; reverse lookup; unchanged Task/Lease/Publication/Acceptance bytes. Final subject must pass typecheck, full `bun test --timeout 60000`, root required checks, architecture sync and Protocol-2 acceptance.

## Task Contracts

- Contract file: `tasks/contracts/20260826-1617-me4b-interface-change-request.contract.md`
- Review file: `tasks/reviews/20260826-1617-me4b-interface-change-request.review.md`
- Implementation notes: `tasks/notes/20260826-1617-me4b-interface-change-request.notes.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260826-1617-me4b-interface-change-request.contract.md --strict`

## Evidence Contract

- **State/progress path**: this plan's `## Task Breakdown`, the generated Contract/review/notes artifacts and the ME-4B capability workstream.
- **Verification evidence**: `.ai/harness/checks/latest.json`, focused unit/CLI tests, typecheck, root required checks and exact Git materialization fixtures.
- **Evaluator rubric**: the task review must record pass for closed schema, actor matrix, stale CAS, planning non-mutation, exact materialization and separate integration authority.
- **Stop condition**: every task item is complete, architecture sync is non-blocking, strict contract verification passes and an exact-subject AcceptanceReceipt is valid.
- **Rollback surface**: ME-4B core/store/CLI/tests/capability projection plus the narrow scheduling validator export.

## Promotion Gate

- **Merge/PR unit**: the complete ME-4B request authority and its exact planning-materialization verifier are one independently reviewable unit.
- **Rollback surface**: ME-4B core/store/CLI/tests/capability projection plus the narrow scheduling validator export.
- **Verification boundary**: actor/CAS lifecycle and exact tracked Work Graph materialization proof.
- **Review/acceptance boundary**: `tasks/reviews/20260826-1617-me4b-interface-change-request.review.md` plus an exact-subject Protocol-2 AcceptanceReceipt.
- **High-risk surface**: cross-capability authority and canonical planning linkage; any direct planning mutation or ME-1A wire change fails scope.
- **Why not checklist row**: the slice creates a new human-decision authority with its own rollback and acceptance boundary.

## Rollback Surface

Revert the ME-4B core/store/CLI/tests/capability projection plus the narrow scheduling validator export as one unit. Immutable git-common request evidence may remain unread history; no tracked planning or product-authority migration exists.

## Out of Scope

Direct planning-file edits, automatic code mutation/merge, generic payload/state extension, changing ME-1A Work Package bytes, Provider runtime, writable delegation, ME-2B writer grants, Publication/Acceptance mutation and architecture-event authority.
