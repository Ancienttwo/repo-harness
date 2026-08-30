# Implementation Notes: c5-taskfreeze-succession-integration

> **Status**: Active
> **Plan**: plans/plan-20260830-0858-c5-taskfreeze-succession-integration.md
> **Contract**: tasks/contracts/20260830-0858-c5-taskfreeze-succession-integration.contract.md
> **Review**: tasks/reviews/20260830-0858-c5-taskfreeze-succession-integration.review.md
> **Last Updated**: 2026-08-30 08:58
> **Lifecycle**: notes

## Design Decisions

- **Derive on write, prove on read, one derivation.** `boundTaskExecutionContext()`
  is the single *derivation* of the `bound_task` branch — used by the publish path
  and again by the read-time comparison. It is not the only place the branch can
  be constructed: `publishWorkStateHandoff()` still accepts a caller-supplied
  `execution_context` with shape-only validation, and C5's own negative tests
  build such records directly. That is exactly why the read-time proof exists.
  `publishBoundTaskSuccessionHandoff()` has no `execution_context` parameter, so
  the mismatched record is unexpressible on the supported path;
  `resolveBoundTaskSuccession()` re-derives from the receipt and compares
  canonical bytes, so a record from any other route is still refused. Comparing
  against the derivation rather than a hand-listed field set means a seventh
  field added to the branch is covered without anyone remembering to extend a
  list.

- **The gate reads the Claim, never the adoption.** `HandoffAdoptionReceiptV1` is
  non-exclusive by identity — many adopters, all valid — so consulting it to
  decide who may write would make a non-exclusive record the basis of an
  exclusive right. `assertSuccessorExecutionAuthority()` reads
  `listLiveClaimActorReceiptsForEngineer()` and nothing else, and its refusal
  names `sprint release / fleet takeover / fleet acquire` explicitly.

- **A newer lease generation passes; an older one does not.** Requiring the
  frozen `claim_id` would make takeover permanently fail the check, because a
  steal mints a new claim and bumps the generation — the supported path would be
  the refused one. The result reports `continues_frozen_claim` so the successor
  can tell that the frozen state describes a previous holder's worktree rather
  than its own.

- **`verifyTaskFreeze()` rather than a digest comparison for the freeze-first
  gate.** `observed_at` is inside `receipt_sha256`, so re-inspecting identical
  state yields a different digest and a digest equality check would reject every
  honest freeze. `taskFreezeReceiptChangedFields()`, which `verifyTaskFreeze()`
  already wraps, compares the observed fields and excludes the timestamp. That is
  what makes "the receipt binds the actual worktree state" checked rather than
  claimed.

- **The task id for a receipt lookup comes from the live Claim.** A digest plus a
  caller-supplied task id would read a receipt out of a different task's
  directory and validate cleanly. `assertBoundTaskFrozenForSuccession()` resolves
  the Engineer's single live Claim first and refuses ambiguity rather than
  picking one.

- **No architecture model change.** With `.archcontext/model/` untouched,
  `architecture-projection check --json` planned two renderer outputs for a
  source size-bucket move (`10-20` to `20-50` files) and returned no
  `unresolved-major-change` and no refresh signal. Declaring
  `entrypoint.collaboration.succession` with sinks into
  `src/effects/engineers/task-freeze-store.ts` would classify as
  `entrypoint-changed` plus `relation-changed` and require the internal-API
  acceptance route C1, C3 and C4 recorded as tool debt. Deferred as a separate
  architecture slice on the same terms C2 deferred its own, and recorded in the
  workstream so the deferral is visible rather than implied.

- **The delegated_worker adoption refusal stays closed.** `adoption-store.ts`
  names "C5 succession or C6 packets" as the row that unblocks it. C5 is not that
  row: unblocking needs a decision about how a Worker adoption receipt becomes
  visible, and the receipt identity binds `context_packet_sha256`, which only the
  C6 store reader produces. C5's read-only succession path completes with a
  `module_engineer` adoption — the Host is the actor that delivers a packet — so
  nothing this row owes is blocked by it.

## Deviations From Plan Or Spec

- The plan's Task Breakdown listed "declare the succession surface on the
  capability node, accept the change if the projection classifies it major".
  The projection classified it minor, so nothing was declared and no acceptance
  event was minted. `.archcontext/model/` and
  `tests/architecture-projection-e2e.test.ts` were declared in `allowed_paths`
  up front and went unused; that is the intended direction for a scope
  declaration to be wrong in.

- Source landed in one commit and the renderer output in the next, rather than
  together. `repo-harness architecture-projection apply --json` needs the source
  tree it projects, and its first invocation reported
  `expected snapshot mismatch after projection: worktreeDigest` because writing
  the two output files changes the worktree digest it had just pinned; a second
  invocation returned `status: noop` and `check --json` returns `noop` at exit 0.
  Both commits are on the same branch and the same review subject.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Accept an `execution_context` on the publish call and validate it | Rejected | A smaller diff that leaves the illegal record expressible. Deriving it removes the failure mode instead of detecting it |
| Put the cross-check in `src/core/collaboration/` next to the union it validates | Rejected | It needs a delivery-plane reader, and importing the freeze store into the schema layer inverts the direction D1 froze |
| Gate the *read* of a handoff on holding the Claim | Rejected | Knowledge is not access-controlled; adoption is non-exclusive and reading a handoff is not a write. The gate belongs on the write path only |
| Require the successor's `claim_id` to equal the frozen one | Rejected | Takeover mints a new claim, so the supported path would always fail. Generation ordering is the real constraint |
| Extend `tests/helpers/collaboration-store-fixture.ts` with a bound-task option | Rejected | C1-C4 all build repositories from it; a new optional branch there is a change to four passing suites for one row's benefit. The succession fixture composes it instead |
| Reuse `collaboration-delegation-fixture.ts`'s stubbed ClaimActorReceipt | Rejected | It persists no Lease and no receipt, so `inspectBoundTask()` could not run and none of the Git observation C5 claims to bind would happen |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
