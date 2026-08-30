# Implementation Notes: c4-delegated-worker-contribution-adapter

> **Status**: Active
> **Plan**: plans/plan-20260830-0509-c4-delegated-worker-contribution-adapter.md
> **Contract**: tasks/contracts/20260830-0509-c4-delegated-worker-contribution-adapter.contract.md
> **Review**: tasks/reviews/20260830-0509-c4-delegated-worker-contribution-adapter.review.md
> **Last Updated**: 2026-08-30 09:30
> **Lifecycle**: notes

## Design Decisions

- **The critical section runs one step past D5's list, and that is what makes
  the limit real.** D5 ends the bridge at `admitReadOnlyDelegation()`. A seat is
  only observable once `prepareDelegatedRun()` has written an intent, so a bridge
  that counted and then released the lock leaves a window in which the seat it
  just granted is invisible. Four concurrent requests at
  `max_parallel_readers = 3` could each observe an empty window and all four be
  admitted, and the limit would hold only when callers happened to prepare before
  the next request arrived. Counting a seat and creating it are one critical
  section, so the bridge holds the lock through both. D5's ordering is unchanged
  inside it. The nested dispatch lock is a different file and the admission lock
  is always the outer one, so the ordering is total and cannot cycle. Recorded as
  a D5 addendum in the C0 freeze record.

- **The bridge is a new file, and D7 stays true of the file it names.** The
  negative proof exists so the policy check cannot be smuggled into the existing
  admission. `tests/effects/collaboration-admission-bridge.test.ts` asserts that
  `delegated-run-store.ts` still contains none of `delegation_policy`,
  `allowed_roles` or `max_parallel_readers`, and that the bridge contains the
  last two — the proof is now a machine assertion rather than a recorded `rg`.

- **Fail closed means an unreadable run outside the window still refuses.** The
  counting pass cannot prove that a run whose envelope it could not read belongs
  to another claim, so it never quietly excludes it. One corrupt entry in the
  delegated-run pointer shard refuses every admission in every window. That is
  the strict reading of "an unreadable reader shard never degrades to an empty
  set", and it is loud rather than convenient on purpose.

- **`collaborationReaderHoldsSeat()` returns `true | false | null`, never a
  two-valued predicate.** A "not terminal" test would default a delegated-run
  state added later to "holds no seat", which is the direction that leaks seats.
  `null` is the instruction to fail closed, and
  `tests/unit/collaboration-admission.test.ts` asserts that
  `reconciliation_required` is the only member of the delegated-run state machine
  that lands there.

- **The commit rides on `WorkerResultV1.evidence_refs`.** `ref` was already a
  free printable string bounded at 2048 bytes, so
  `collaboration-contribution-commit:<commit id>` needs no protocol bump, no
  `max_turns` change and no new field. The alternative — a new field on
  `WorkerResultV1` — would have bumped `DELEGATION_PROTOCOL`, which the sprint
  forbids.

- **The commit is the sole visibility boundary because of *where* candidates
  live, not because readers filter.** Codex round 1 rejected the first shape on a
  real P1: it published candidates straight into `signals/` and `handoffs/` and
  committed afterwards, so a crash during staging left Worker records permanently
  readable by `listCoordinationSignals()` with no commit referencing them and no
  recall path in an append-only store. `listContributedSignalIds()` was a
  reader-side obligation, and this program has already had those get missed.

  Candidates now stage under `contribution-candidates/<run_ref>/{signals,handoffs}/`,
  a shard the public readers never open, and the commit promotes them by `link`.
  A reader that forgets a filter cannot leak an uncommitted record, because there
  is no filter to forget.

  **Ordering: stage -> commit -> promote.** The commit lands *before* anything it
  names is public, which makes one invariant hold at every instant including
  inside every crash window: *every publicly readable Worker record is already
  committed.* Windows: staging leaves only invisible candidates and self-heals;
  after-staging-before-commit leaves only invisible candidates and self-heals;
  mid-promotion leaves records that are public but every one of them committed,
  and self-heals; after-promotion and after-WorkerResult are complete and
  idempotent. The accepted mirror-image window is that a commit can briefly name
  a record not yet public, so a reader following `commit.signal_refs` may find one
  missing; it is transient, closes on the next collection of the same run, and is
  the honest trade — the other ordering makes *uncommitted records publicly
  visible* instead, which is the failure being removed. Full table in the
  `publishContribution()` doc comment.

- **Promotion is `link`, not a re-write.** The bytes are already fsynced under
  the candidate name, so promotion adds a name to durable data and there is no
  window where the public name exists over incomplete bytes. `EEXIST` means
  already-promoted, which is the ordinary retry outcome; the bytes are compared
  anyway, so two different records claiming one identity is a conflict rather
  than something to promote over.

- **Two independent guards on what may be promoted.** The record-store codec
  refuses any record whose own identity disagrees with the filename it was read
  from, and `assertCandidateAreaHolds()` refuses to promote when the run's
  candidate area holds anything other than exactly this contribution. The first
  catches a copied or renamed record; the second catches a *valid, correctly
  named* record that no draft staged. Both are tested at the layer they fire at.

- **A staged contribution can cite its own records; a revision cannot.**
  Reference resolution for `reply_to_signal_id` and `source_signal_ids` searches
  the public store and then this run's candidate area, so a handoff may cite the
  signals the same contribution just staged. `supersedes_*` deliberately searches
  the public store only: superseding an unpromoted candidate would revise
  something no reader has ever seen.

- **The destination is a required union, scoped to the collector path.** Direct
  `module_engineer` publications pass `{ kind: 'public' }` and keep the immediate
  visibility C1 and C3 gave them — asserted by "a direct Module Engineer
  publication keeps its immediate visibility". Only the collector passes
  `contribution_candidate`. A nullable flag would have let a call site stay silent
  about which act it is performing.

- **Convergence is structural, not procedural.** There is no resume marker and
  no "step N completed" state anywhere in the collector, because every identity
  is derived from the run rather than from the moment of writing: signal ids from
  `<run_ref>#<index>`, the handoff id from `<run_ref>#handoff`, the commit id from
  the run reference alone, and the recorded time from the process receipt's own
  `observed_at`. Re-running the whole transaction *is* the recovery path, and a
  retry recomputes byte-identical records that each store's create-once branch
  reconciles. A resume marker would have been a second authority that could
  disagree with the records it summarises.

- **No drafts shard.** D9's frozen shard list has `contribution-commits/` and no
  drafts entry. The draft is a pure function of the stdout blob the
  `WorkerResultV1` evidence refs already pin, so `commit.draft_sha256` is
  reproducible from persisted bytes. A second copy on disk would be weaker, not
  stronger: it could drift from its own preimage.

- **`CollaborationDelegationAdmissionV1` is returned, not persisted.** Same
  reason: adding an admissions shard would extend D9's frozen list for a record
  whose durable counterpart — the `DelegationAdmissionReceiptV1` — the delegation
  plane already writes.

- **No second `*_PROTOCOL` for the plane.** C1 and C3 kept the whole
  collaboration plane on `COLLABORATION_PROTOCOL`; C4 does the same, so the
  closed inclusion scan's universe does not move and
  `src/core/collaboration/common.ts` stays the single adjudicated exclusion.
  `tests/unit/collaboration-contribution.test.ts` and
  `collaboration-admission.test.ts` assert it over their own namespaces rather
  than assuming it. The adjudication, had one been minted: the contribution
  family fails C-1 outright because the collaboration plane is not one of the
  five planes C0 froze, and it fails C-2 as well — a commit does decide
  *visibility* for other agents, but visibility of advisory context is not "who
  owns work or what has been published or accepted"; it grants no Claim, moves no
  Lease generation, and C4 adds no HTTP route and no `--json` document, so C-2's
  republication limb is not reached either. It would have been a second
  `DELIBERATELY_EXCLUDED` row saying exactly what `common.ts` already says.

- **Both critical sections are named top-level functions.** `admitInsideWindow()`
  and `publishContribution()` are extracted rather than inline lock callbacks.
  The immediate reason is the architecture flow proof, which cannot follow a call
  made inside a callback (C1's recorded trap, re-hit by C3). The lasting reason
  is the same one: the edges out of those sections *are* the transaction, and
  burying them one closure deep hides what the lock is protecting.

## Deviations From Plan Or Spec

- **D9 handoff-publish lock: split, not ledgered as a permanent deviation.** C3
  shipped handoff publish on `('thread', thread_key)` while D9 freezes a
  per-handoff lock, and the comment at `record-store.ts:163` claimed compliance.
  The C3-recorded analysis was verified before splitting and holds: nothing needs
  a signal write and a handoff write to be mutually exclusive, because records
  publish through a staged write plus `link` so no reader observes a torn one,
  and handoff publish reads the signal store inside its lock only to prove cited
  signals resolve — a signal appearing mid-check can only turn a failing check
  into a passing one, and a persisted signal is immutable so it can never turn a
  passing check into a failing one. Handoff publish now takes
  `('handoff', handoff_id)` and the comment is rewritten to say what the code
  does. Ledgered in the C0 freeze record's new D9 lock table; the C3 row is
  marked resolved rather than accepted.

  A third argument was drafted here and is withdrawn as wrong, recorded so it is
  not re-derived: that the shared domain let two publishes of *one* identity
  under two `thread_key`s race into a spurious byte conflict. `thread_key` is a
  field of `WorkStateHandoffV1` and therefore part of its canonical bytes, so two
  such publishes are two different payloads under one identity, and a conflict is
  the correct frozen semantics — `tests/effects/collaboration-handoff-store.test.ts`
  asserts exactly that in "the same identity with a different payload is an
  explicit conflict". Identical bytes imply an identical `thread_key`, which took
  the same lock under the old scheme anyway, so there was no race to close. The
  split stands on the two justifications above.

- **`src/effects/engineers/delegated-run-store.ts` changed, and the digest table
  is updated with the justification C0 requires.** Two changes inside
  `collectDelegatedRunResult()`: a required `contribution_refs` input, and a
  refusal to persist a second result for a run when one with different bytes
  already exists. The first is forced by two frozen constraints meeting — the PRD
  requires `WorkerResultV1` to reference the commit, and the baseline test forbids
  a delivery-plane module from importing the collaboration plane, so the
  reference can only arrive as an input. The second is what makes "exactly once"
  a machine property: results are content-addressed, so two different results for
  one run would land at two paths and `status()` would silently return whichever
  sorted first. No wire byte moves and `FROZEN_INVENTORY_SHA256` is unaffected.
  `src/cli/commands/delegation.ts` passes `[]` explicitly at its one call site,
  naming C7 as the row that wires that path.

- **The three collaboration stores moved onto an authorization union.** C1 and C3
  took `authorization_id: string`, which only ever resolves a `module_engineer`.
  D4 lists `delegated_worker` as supported, and C4 is the row that needs it, so
  `resolveCollaborationActor()` now takes
  `{ kind: 'engineer_principal' | 'delegated_run', ... }`. A nullable second field
  would have admitted a call supplying neither. Both derivations stay server-side:
  the delegated-worker branch reads the persisted `WorkerRunRefV1` and admission
  receipt and never the Worker's output.

- **Scope declared up front, not after a refusal.** C2 and C3 both had to amend
  their contracts once the ship gate refused on architecture. This contract
  carried `.archcontext/model/`, `docs/architecture/`, `AGENTS.md`, `CLAUDE.md`,
  `tasks/lessons.md` and the AXR7 pin from the first commit, plus the
  delegated-run-store surface with its reason. Nothing under `docs/architecture/`
  was hand-edited; it is all renderer output.

## Architecture acceptance evidence

A major change: new entrypoints, a new relation, changed responsibilities and a
changed flow proof. The orchestrator approved it; it was accepted through the
internal-API route C1 recorded and C3 re-confirmed, because
`ProjectionRequestV1.acceptedChange` still has no production caller.

**Naming correction in force.** The event id is
`event.orchestrator-approval-20260830-c4-collaboration-architecture`. The approver
is the orchestrator agent, not a user; the older `user-approval-*` records are
corrected separately.

**Model changes, all forced by reality.**

| File | Change | Why |
|---|---|---|
| `capability.runtime-harness.collaboration.yaml` | six new entrypoints: `admission-bridge`, `admission-window`, `contribution-collect`, `contribution-publish`, `provider-output`, `contribution-visibility` | the capability really has these surfaces now |
| same | summary and eight responsibilities extended | the old text described a signal/handoff/adoption capability with no admission and no contribution |
| same | `actor-derivation` repointed from `resolveCollaborationActor` to `resolveModuleEngineerActor` | the union dispatch moved the principal read one call deeper, so the old selector was `selector-evidence-unmatched` |
| `flow.collaboration.publish-signal.yaml` | `derive-actor` repointed to the same symbol | same cause |
| `flow.collaboration.delegated-contribution.yaml` | new required flow, three outcomes | the capability claimed admission and contribution responsibilities with zero flow evidence |
| `relation.collaboration.delegated-runs.yaml` | new `calls` relation | six flow steps cross into `capability.runtime-harness.delegated-runs` and none was declared |

**The two refusals were diagnosis, not retries.** `classifyArchitectureMajorChange`
(`archctx.mjs:7669`) discards a valid `acceptedChange` whenever any capability is
unprovable, so the first attempt returned `human-action-required` with the
acceptance silently dropped. The cause was found by instrumenting
`compileSemanticCapabilityDiagrams()` in a throwaway `node_modules` patch (since
reverted; `shasum` re-verified against a pre-patch copy) rather than by guessing:
`p2` was `unprovable` with six `relation-binding-missing` diagnostics for the
undeclared `collaboration -> delegated-runs` edge and one
`selector-evidence-unmatched` for the moved actor derivation. Both were real model
gaps. After fixing them the compilation reported `p1 proven, p2 proven,
unboundSelectors []`.

One process detail worth keeping: `archctxd` runs as a daemon, so a patched
`archctx.mjs` does nothing until `archctx daemon stop` forces a respawn, and the
version handshake fails loudly in between.

Accepted delta, copied verbatim from `refreshSignals[0]` of the final
`architecture-projection check --json` refusal. `humanActions[].reasonCode` is
always the generic `unresolved-major-change`; the real classification is only in
the refresh signal.

```json
{
  "changeSetId": "changeset.docs-projection-bcdc8043a02a4a37",
  "eventId": "event.orchestrator-approval-20260830-c4-collaboration-architecture",
  "reasonCodes": ["entrypoint-changed", "relation-changed", "responsibility-changed", "verified-flow-proof-changed"],
  "affectedNodeIds": ["capability.runtime-harness.collaboration"]
}
```

`changeSetId` follows archctx's own derivation,
`changeset.docs-projection-<first 16 hex of the resulting projectionDigest>`; the
resulting digest was
`sha256:bcdc8043a02a4a37d9f1146e78aad6fcf0ca8e6aac0cf051d811649350e201fc`.

Invocation, through a throwaway `/tmp` script (never committed) replicating
`src/cli/commands/architecture-projection.ts` `execute()` exactly and adding only
`acceptedChange`:

```text
bun .c4-accept-projection.ts apply \
  changeset.docs-projection-bcdc8043a02a4a37 \
  event.orchestrator-approval-20260830-c4-collaboration-architecture \
  '["entrypoint-changed","relation-changed","responsibility-changed","verified-flow-proof-changed"]'
```

It returned `status: applied-reconcile-required` with `humanActions: []` — the
acceptance landing — over nine files including
`docs/architecture/modules/runtime-harness/delegated-runs.md`, which re-renders
because the new relation is inbound to it. The ordinary
`repo-harness architecture-projection apply --json` then converged the manifest
(`status: applied`, one file), and `check --json` now returns `noop` with exit 0
and zero refresh signals. The rendered module doc reports
`Proof: proven; selectors 21/21`.

Request cards were produced by the sanctioned queue path —
`architecture-queue record --file` over the eleven changed source files.

**The repo-wide coupling the gate does not cover.** `tests/architecture-projection-e2e.test.ts`
AXR7 pins the model inventory by count, so the new relation and the new flow are
a red test until the pins move: relations 39 to 40, flows 25 to 26. Neither the
contract's exit criteria nor `verify-sprint --prepare-acceptance` runs that file,
so an archcontext model change needs the architecture suite run explicitly. This
is the second consecutive row to hit it.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| End the bridge's critical section at `admitReadOnlyDelegation()`, as D5 literally says | Rejected | The seat would be invisible until `prepareDelegatedRun()` ran, so four concurrent requests could all be admitted at a limit of three. The limit has to hold under concurrency or it is not a limit |
| Carry the commit reference in `WorkerResultV1.untrusted_claims` | Rejected | Untrusted claims are Worker prose; a Host-derived commit reference is not, and putting it there would make the one untrusted field partly authoritative |
| Add a new field to `WorkerResultV1` for the commit | Rejected | Bumps `DELEGATION_PROTOCOL`, which the sprint's global invariants forbid. `evidence_refs[].ref` already accepts these bytes |
| Make `contribution_refs` optional so existing callers need no change | Rejected | An optional field lets a call site stay silent about whether its run produced a contribution. Required means every site states it, and the CLI's `[]` is a claim about C7's scope rather than a default |
| Persist the draft as its own shard | Rejected | Not on D9's frozen shard list, and weaker than the digest: the draft is reproducible from the stdout blob the result already pins, and a second copy could drift from its own preimage |
| Keep the C3 thread-domain handoff lock and ledger it as an accepted deviation | Rejected | D9 had already frozen per-handoff, and the re-verified C3 analysis showed the split was safe. A deviation ledger entry would have preserved a comment that claimed compliance it did not have |
| Simulate the three parallel readers with three in-process calls | Rejected | Three calls in one event loop cannot contend for an on-disk lock. The canary spawns three real processes and asserts three distinct pids and observed seat counts of 0, 1 and 2 |
| Use the real Codex CLI in the canary | Rejected | The row makes no claim about the model call. Everything it does claim — the lock, the run state machine, the process receipt, the persisted stdout, the seat count — runs for real against a shell shim, which is the boundary ME-2A already drew |

## Round-2 correction (Codex P1)

The first shape satisfied "converges on retry" but not "the commit is the sole
visibility boundary": the fault tests asserted the end state and never the
mid-state, which is exactly where the leak lived. The fix is structural, not a
stronger assertion — the fault suite now asserts, at **all nine** persistence
boundaries, that `listCoordinationSignals()` and `listWorkStateHandoffs()` hold
nothing uncommitted, that pre-commit crashes leave both public listings entirely
empty, that candidate residue is present on disk yet unreachable publicly and is
reused rather than rebuilt on retry, and that both foreign-entry guards fail the
store closed without promoting anything.

Boundary set changed from seven to nine: the three staging boundaries were
renamed to `*_candidate` to say what they now mark, and `after_first_promotion` /
`after_last_promotion` were added because promotion is the phase where a record
becomes publicly readable and had no boundary of its own before.

## Round-3 correction (Codex P1)

Round 2 closed the collector's own leak but left a second entry point to the
same invariant: `authorization` and `destination` were independent inputs, so a
caller holding `delegatedRunAuthorization(dispatchId)` could name
`{ kind: 'public' }` and write a Worker record straight into `signals/`,
bypassing the collector and the candidate area entirely. Reproduced before
fixing — a `delegated_worker` signal publicly listed with zero commits.

**Single enforcement point.** `authorizeCollaborationDestination(actor, destination)`
in `record-store.ts` is the only producer of an `AuthorizedCollaborationDestination`,
whose brand is a non-exported symbol, and `collaborationDestinationPaths()`
accepts nothing else. The illegal pair is therefore not policed by each store —
it cannot be expressed at the boundary, and TypeScript flagged every existing
caller the moment the signature changed, which is how the sweep was made
exhaustive rather than remembered. Rules: `module_engineer` -> `public` only;
`delegated_worker` -> its own run's candidate area only, never `public` and
never another run's.

`promoteCollaborationCandidate()` now derives its own public target from the
shard name instead of taking a destination. Promotion is the Host completing a
committed transaction, not an actor publishing, and keeping a public destination
value around for it would have left exactly the forgeable value the guard
removes. `PUBLIC_DESTINATION` is gone from the collector.

**The sibling.** `adoptWorkStateHandoff()` takes the same authorization union but
no destination, so the binding it needs is on the actor alone: a
`delegated_worker` adoption would be a publicly readable Worker record no commit
references — the same invariant, one record family over. Nothing constructs one
today, so the store now refuses it fail-closed, with the unblock path named for
whichever row (C5 succession or C6 packets) first needs Worker adoption.

## Open Questions

- Single-round contribution depth stays unmeasured; C9 observes whether
  multi-round accumulation compensates. `max_turns` was not relaxed.
- Real provider throughput at `max_parallel_readers = 3` is still open and now
  belongs to C9. C4's canary proved the admission limit under real concurrent
  processes, which is a different claim.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promoted to `tasks/lessons.md`: the AXR7 inventory-pin coupling, now hit by two
  consecutive rows, and the `archctxd` daemon staleness that makes an archctx
  diagnostic patch look like a no-op.
- Promoted to `docs/researches/`: the D9 lock and shard ledgers, the D5 addendum,
  the D7 result and the delegated-run-store digest justification all live in the
  C0 freeze record, which is the document C5 to C9 read from.
