> **Archived**: 2026-08-29 21:13
> **Related Plan**: plans/archive/plan-20260829-1853-c0-two-plane-authority-freeze.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260829-2113

# Implementation Notes: c0-two-plane-authority-freeze

> **Status**: Active
> **Plan**: plans/plan-20260829-1853-c0-two-plane-authority-freeze.md
> **Contract**: tasks/contracts/20260829-1853-c0-two-plane-authority-freeze.contract.md
> **Review**: tasks/reviews/20260829-1853-c0-two-plane-authority-freeze.review.md
> **Last Updated**: 2026-08-29 18:53
> **Lifecycle**: notes

## Design Decisions

- The frozen decisions themselves live in
  `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md` (D1-D12),
  not here. This file records only the non-obvious slice decisions.
- The baseline authority guard pins a digest over the *live exported constants*
  (protocol numbers, wire kinds, store roots), not over authority source-file
  bytes. File-byte digests are recorded in the research doc as the human baseline.
  A file-byte tripwire in the suite would go red on comment and refactor churn in
  C1-C9 and would be re-baselined reflexively, which destroys its value; a
  constant-derived digest only moves when an authority identity actually moves.
- The D7 negative proof is machine-checked by asserting that
  `src/effects/engineers/delegated-run-store.ts` contains no `delegation_policy`,
  `max_parallel_readers` or `allowed_roles`. This stays valid after C4 because the
  admission bridge is specified as a new file under `src/effects/collaboration/`
  that runs before `admitReadOnlyDelegation()` without changing it. The assertion
  is therefore also the guard against smuggling the bridge into the existing path.

## Deviations From Plan Or Spec

- The capability workstream ledger and the capability architecture module are
  deferred to C1, and the durable C0-C9 slice ledger lives in the research doc
  instead. Reason, found by running the gate rather than by reading ahead:
  `scripts/capability-resolver.ts:306,326` rejects any `.md` under
  `docs/architecture/modules/` or `tasks/workstreams/` that no declared capability
  owns, and `:285-288` rejects a capability whose prefixes do not exist. An
  archcontext node additionally needs entrypoint path+symbol anchors. None of that
  is satisfiable in a row that writes no source, so the first legal moment to
  register `capability.runtime-harness.collaboration` is C1. A hand-written module
  doc and workstream file were created first and then removed once
  `check-architecture-sync.sh` failed closed on both as orphans.
- The archived request's `Architecture Module` therefore points at
  `docs/architecture/domains/runtime-harness.md`, the architecture surface that
  currently owns the runtime-harness capability list.
  `archive-architecture-request.sh:338-358` requires `Resolved` to name an
  existing module file and to list it as a durable artifact; the domain doc is the
  honest referent while the capability has no module of its own. C1 adds the
  capability's row to that domain doc when ArchContext projects the module.
- `repo-harness run architecture-queue record --file` could not seed the request
  either: `classify_change` returns `none unrelated` for `docs/` and `tests/`
  paths and only assigns a capability for `src/` paths, so no card is produced for
  a row that touches no source. The queue's own path is `record-event`, which adds
  the queue lock, the event JSONL and the request index; this row used the helper's
  card-only subcommand `scripts/architecture-event.ts upsert-request` with an
  explicitly built event, then resolved it through
  `repo-harness run archive-architecture-request`. Card-only is sufficient here
  because the card was archived immediately and
  `bun scripts/architecture-event.ts reindex-requests --check` passes.
- The plan's last Task Breakdown item originally claimed this row refreshes
  `tasks/current.md`. It does not, deliberately: the finish lifecycle owns that
  refresh (`archive-workflow.sh:702`), so the row was reworded rather than the
  refresh performed here.
- The sprint's C0 "Expected files" lists `plans/prds/*` and `plans/sprints/*`.
  Those five program files were already produced and are out of scope for this
  row; C0 added only its own work-package plan.
- The mechanical closed scan over `src/core/**` — sweep every `*_PROTOCOL`
  export and assert the result equals `AUTHORITY_SOURCE_MODULES` union an
  explicit `DELIBERATELY_EXCLUDED` list — is deferred to C1 rather than added
  here. C0 writes no `src/`, so the scan could only find modules that were
  already adjudicated by hand in the freeze record's 「納入判據與排除清單」; the
  assertion would restate today's split against zero new samples. C1 introduces
  `src/core/collaboration/`, the first module the criterion has to classify
  without hindsight, and owns the scan plus the exclusion list it calibrates
  against. Applying the criterion honestly during the round-4 review also moved
  `src/core/state/project-board.ts` from excluded to inventoried: it is not a
  display-only read model, `collectRepoTaskOffers()`
  (`src/effects/fleet/acquire.ts:200-236`) derives every `TaskOfferV1` from its
  cards, so its bytes decide which row `fleet acquire` may claim. That is the
  thirteenth inventoried module and the reason the frozen inventory digest moved
  to `sha256:6a49057e17a921e78773f358e31b487c9402c9f828f14480ef705c5ac96fcb64`.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Pin authority source-file byte digests in the test | Rejected | Goes red on unrelated churn in C1-C9, gets re-baselined reflexively, stops meaning anything |
| Pin a digest over live exported authority constants | Chosen | Moves only on real authority identity drift; survives refactors |
| Register the archcontext capability node in C0 | Rejected | Nodes need entrypoint path+symbol anchors and existing prefixes; neither exists until C1, and `capability-resolver.ts:285-288` fails closed on a missing prefix |
| Keep a hand-written capability module + workstream file in C0 | Rejected | `capability-resolver.ts:306,326` flags both as orphans and `check-architecture-sync.sh` fails closed; verified by running it |
| Archive the request as `no-change` to dodge the module requirement | Rejected | The request is a real boundary acceptance; `no-change` would be a false status |
| Wire the feature flags into `.ai/harness/policy.json` in C0 | Rejected | C0 acceptance requires no runtime change; the flags are frozen as values in the research doc and wired in C1 |
| Add placeholder wire-union branches for `human_operator` / `native_subagent` | Rejected | D4 refuses them for P0; a placeholder branch is exactly the "add later" compatibility surface the program bans |

## Open Questions

- None blocking C1. The measurement unknowns (signal noise ratio, single-round
  contribution depth, real provider throughput at `max_parallel_readers=3`,
  long-run hotspot stability, the 60/40 split) are carried in the research doc
  with named resolution owners in C4 and C9.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
