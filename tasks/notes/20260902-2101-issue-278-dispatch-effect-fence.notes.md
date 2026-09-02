# Implementation Notes: issue-278-dispatch-effect-fence

> **Status**: Active
> **Plan**: plans/plan-20260902-2101-issue-278-dispatch-effect-fence.md
> **Contract**: tasks/contracts/20260902-2101-issue-278-dispatch-effect-fence.contract.md
> **Review**: tasks/reviews/20260902-2101-issue-278-dispatch-effect-fence.review.md
> **Last Updated**: 2026-09-02 21:01
> **Lifecycle**: notes

## Design Decisions

- The fence is the first statement inside `withDispatchLock()`, not a wrapper
  around `dispatchDelegatedRun()`. Issue #278 allows a wrapper only if the raw
  effect stops being callable outside its module, and the raw body cannot leave
  `delegated-run-store.ts` without exporting a dozen private store helpers, so
  composing inside the exported function is the only shape that leaves no
  unfenced entry.
- Placing it under the lock is a strict improvement over the pre-step it
  replaces: C7 read the run and its binding outside the lock and
  `dispatchDelegatedRun()` then re-read them under it, so a binding could be
  replaced between the two reads. The fence now decides on the same locked view
  the host action is taken from.
- It runs before the launch-claim and `intent_persisted` short-circuits, which
  is exactly where the CLI pre-step sat in the call order. A collaboration run
  whose binding went stale therefore still refuses instead of reporting
  reconciliation, which is the behaviour the CLI already had; moving the fence
  below those branches would have quietly changed it.
- `delegated-run-store.ts` now imports `collaboration/context-delivery.ts`,
  which already imports this module's readers. The cycle resolves because every
  edge in both directions is a function declaration called at run time and
  neither module reads the other during evaluation. The alternative — splitting
  the binding/packet readers into a third module and moving `readLiveRun()`,
  `fenceSubject()` and the refusal class down into the delegation store — moves
  about 250 lines and puts collaboration semantics inside the delegation plane
  to buy an acyclic graph. A comment at the import states the constraint the
  cycle depends on.
- The C1 closed inclusion scan in
  `tests/unit/collaboration-authority-baseline.test.ts` stated the C6 pre-step
  decision as a test: no delivery-plane module may mention `collaboration/` at
  all. Issue #278 replaces that decision, so the scan's absolute form is
  replaced with its bounded form rather than worked around. The check reads
  collaboration records, so the delegation store must reference the
  collaboration plane whatever the file layout; there is no implementation of
  "the dispatch effect enforces the fence" that leaves the old assertion true.
  The amended scan admits exactly one file, one imported symbol and one mention,
  and still fails on any second delivery-plane collaboration dependency — the
  risk Child PRD A drew the rule against. This is an accepted architecture
  design change, decided against the published issue #278 spec and the
  deferred-goal row it fulfils, and it is recorded in the same round as the
  architecture acceptance below. It is not a test relaxation to make a build
  pass: the narrowed rule is the new invariant, and widening the exception fails
  the same test.

- Fence executions are counted with `mock.module()` inside a spawned `bun`
  worker, following `tests/cli/registry.test.ts`. The real fence is captured
  before the mock is installed, because Bun updates the live bindings of modules
  that already imported it — including the namespace object the worker holds —
  and a wrapper reading the fence back through that namespace recurses forever.
- Provider calls are counted from the launch-claim store rather than from the
  Codex shim. The capability receipt pins the shim's bytes, so the fixture
  cannot instrument it after recording the capability, and one persisted launch
  claim is exactly what permits one host action.

## Deviations From Plan Or Spec

- `docs/architecture/**` was never hand-edited. Those files are projection
  outputs, so the model files are the only authored surface and the docs come
  from the accepted apply.
- The architecture acceptance needed two commands rather than one. The accepted
  apply (`architecture-projection accept --signal-id
  sha256:258b86d3173c936db109a97e7c9813f96684de2f19454d3f935dd3ceeaede37a
  --approval-reference
  event.orchestrator-approval-20260902-issue-278-dispatch-effect-fence`) wrote
  all nine projection files, and then returned `applied-reconcile-required`:
  writing them changed the worktree digest the accepted snapshot named, so the
  provider deferred refresh delivery and no acceptance receipt was persisted.
  The semantic delta itself was resolved by that apply — the next
  `architecture-projection check` returned no `refreshSignals` and no
  `humanActions` — so the regenerated docs were committed and an ordinary
  `apply` restamped `.projection-manifest.json`, after which `check` is `noop`.
  The candidate left behind is bound to the pre-apply head, so it can be neither
  accepted (`refresh signal is stale`) nor reconciled (reconciliation admits an
  exact `verified-flow-proof-changed` reason set only); it was removed from the
  ignored acceptance store once `check` proved the change it described was
  already applied. A copy is at `/tmp/278-stale-candidate.json` for the review
  round. The durable record of the approval identity is this note plus the
  committed projection output, not a receipt.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Fence inside `dispatchDelegatedRun()` (import cycle) | Chosen | One call, no unfenced entry, no collaboration semantics pushed into the delegation plane |
| Fenced wrapper in a third module | Rejected | The raw effect would stay exported, which is what issue #278 forbids |
| Split the binding readers out and move the fence down into the store | Rejected | ~250 lines moved across three files and collaboration knowledge inside the delegation store, to remove a cycle that is safe by construction |
| Fence after the launch-claim/state short-circuits | Rejected | Would change the CLI's existing refusal behaviour for an already-claimed collaboration run |
| Leave the C1 scan intact and keep the fence a pre-step | Rejected | Contradicts the change issue #278 asks for; the gap it names stays open |
| Bounded one-file, one-symbol exception in the C1 scan | Chosen | The only shape that admits the ordered edge while still failing on any other delivery-plane collaboration dependency |
| `event.user-approval-*` for the architecture acceptance | Rejected | An orchestrator decided it; the ledger already records one round that attributed an agent decision to a user approval id |

## Open Questions

- None. The two boundary questions this slice raised are decided: the bounded D1
  exception is the accepted resolution, and the architecture projection was
  accepted under
  `event.orchestrator-approval-20260902-issue-278-dispatch-effect-fence`, an
  orchestrator identity rather than the `event.user-approval-*` shape the
  deferred-goal ledger records as a past mis-attribution.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
