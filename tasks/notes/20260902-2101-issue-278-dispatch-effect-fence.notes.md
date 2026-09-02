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
- `tests/unit/collaboration-authority-baseline.test.ts`'s C1 closed inclusion
  scan asserted that no delivery-plane module mentions `collaboration/` at all,
  which is the C6 pre-step decision stated as a test. Issue #278 overturns that
  decision, and no honest implementation of "the dispatch effect enforces the
  fence" can avoid the edge: the check reads collaboration records, so the
  delegation store must reference the collaboration plane whatever the file
  layout. The scan is amended to admit exactly one file, one imported symbol and
  one mention, so a second delivery-plane collaboration dependency — the risk
  Child PRD A drew the rule against — still fails it. This is an architecture
  boundary change and needs the same approval as the projection candidate below.

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

- `docs/architecture/modules/runtime-harness/{collaboration,delegated-runs}.md`
  were not hand-edited. They are outputs of the architecture projection, which
  lists them in its own file set, so the model files are the only authored
  surface and the docs follow from an accepted apply.
- Task breakdown row #4 is closed for the model and the ledger, and open for the
  projection: the entrypoint, relation and responsibility edits make the
  projection return `human-action-required` with reason codes
  `entrypoint-changed`, `relation-changed`, `responsibility-changed` and
  `verified-flow-proof-changed`. Resolving that needs
  `architecture-projection accept --signal-id <id> --approval-reference <event-id>`,
  and the approval identity is a human/orchestrator decision this contract does
  not own. `tasks/todos.md` already records that a previous round mis-attributed
  an agent decision to a user approval id; minting another one here would repeat
  that.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Fence inside `dispatchDelegatedRun()` (import cycle) | Chosen | One call, no unfenced entry, no collaboration semantics pushed into the delegation plane |
| Fenced wrapper in a third module | Rejected | The raw effect would stay exported, which is what issue #278 forbids |
| Split the binding readers out and move the fence down into the store | Rejected | ~250 lines moved across three files and collaboration knowledge inside the delegation store, to remove a cycle that is safe by construction |
| Fence after the launch-claim/state short-circuits | Rejected | Would change the CLI's existing refusal behaviour for an already-claimed collaboration run |
| Leave the C1 scan intact and keep the fence a pre-step | Rejected | Contradicts the change issue #278 asks for; the gap it names stays open |
| Bounded one-file, one-symbol exception in the C1 scan | Chosen | The only shape that admits the ordered edge while still failing on any other delivery-plane collaboration dependency |

## Open Questions

- Is the bounded D1 exception the accepted resolution of the conflict between
  issue #278 and the C1 closed inclusion scan, or should the fence stay a
  pre-step? The alternatives are: keep the scan and reject #278's requirement
  that the raw effect be unreachable; move `dispatchDelegatedRun()` out of
  `src/effects/engineers/` into a plane that may depend on both; or accept the
  one-edge exception as recorded here.
- Which approval event identity should
  `architecture-projection accept --approval-reference` carry for this change,
  and does it need a `docs/architecture/snapshots/` record like the
  2026-08-30 acceptance? The candidate is bound to the exact HEAD and worktree
  digest, so it must be accepted from the final committed state of this branch.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
