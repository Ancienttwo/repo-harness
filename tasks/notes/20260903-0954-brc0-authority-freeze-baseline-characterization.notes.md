# Implementation Notes: brc0-authority-freeze-baseline-characterization

> **Plan**: `plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md`
> **Contract**: `tasks/contracts/20260903-0954-brc0-authority-freeze-baseline-characterization.contract.md`

## Deviations from the dispatched slice

### `capability.runtime-harness.publication` does not exist

The sprint Architecture Notes list `capability.runtime-harness.publication` among the existing
capabilities the campaign consumes. There is no such node in `.archcontext/model/nodes/`. Neither is
there a node whose `source.include` glob covers `src/core/publication/**`,
`src/core/state/coordination-identity.ts`, `src/effects/state/coordination-lease-store.ts` or
`scripts/acceptance-receipt.ts`. Those files are reachable only as declared *sinks* inside
`capability.runtime-harness.integration-acceptance`.

The dispatched slice asked for a protected list where every id maps to a real capability node and the
test asserts existence. Inventing a mapping for the three uncovered surfaces would have produced a
protected list that protects nothing checkable. `protected-capabilities.json` is therefore split:

- `capabilities[]` — seven real ids, each asserted to have a matching `.yaml` whose `id:` line
  agrees.
- `unmapped_surfaces[]` — three surfaces by path, each asserted to exist *and* asserted to be
  covered by no capability include glob. If a later row adds a node that covers one of them, that
  assertion fails and the list must be moved, which is the intended signal.
- `pending_capability` — the campaign's own node, asserted absent.

This is a real architecture gap, not a fixture convenience. It is written up in the research doc and
is worth its own decision before BRC3 assigns ownership.

### The architecture request was recorded through `architecture-event`, not `architecture-queue record`

`repo-harness run architecture-queue record --file <path>` derives severity and change type from
`classify_change()` in `scripts/architecture-queue.sh`. That function has no branch that yields a
non-`none` severity for a file which does not exist yet and matches no capability prefix, which is
exactly the shape of a *planned* boundary declaration (`src/core/automation/development-campaign.ts`).
Every path this branch actually touches (`tests/`, `docs/researches/`, `plans/`, `tasks/`) classifies
as `none unrelated`, so `record` prints "No architecture drift request" and writes nothing.

The event was recorded through `repo-harness run architecture-event record-event` with an explicit
`event-json` — the same writer, the same validator and the same card renderer that
`architecture-queue record_command` itself invokes at
`scripts/architecture-queue.sh:583-596`. The precedent is
`docs/architecture/requests/archive/2026/runtime-harness-provider-thread-effects.md`, which carries
`change_type: planned-boundary-change` and `boundary-accepted`, neither of which
`classify_change` can produce either.

Severity `medium` matches that precedent. It does not block:
`scripts/check-architecture-sync.sh` gates only on pending requests whose `capability_id` is in the
*changed* capability set, and `runtime-harness-development-campaign` is not, because this branch adds
no file under `src/core/automation/`. Verified: `blocking=0`.

### The boundary declaration lives in a snapshot, not in the request card

`renderRequestCard` in `scripts/architecture-event.ts` regenerates the whole card body on every
upsert and preserves only the `Detected` metadata line. Authored prose inside the card would be
silently destroyed by the next event and could break `validate-requests`. The card's own Required
Follow-up says to write a snapshot for substantial changes, so the entrypoint list, the consumed
capabilities and the dependency direction went to
`docs/architecture/snapshots/2026-09-03-development-campaign-boundary-declaration.md` with
`Status: Proposed` — it declares a boundary, it does not claim human acceptance.

## Choices worth recording

- **Digests, not stored blobs.** The freeze is thirteen sha256 values over what the production
  serializer emits for a literal subject. Storing the serialized bytes instead would put thirteen
  blobs into every review and would make "just regenerate it" the path of least resistance.
- **The whole `classifyTaskOffer` matrix is one digest.** 2 x 2 x 7 x 3 x 2 x 2 x 8 = 2688 inputs
  collapse to one value, so adding a blocker code, reordering a branch or changing an attention owner
  all fail loudly without 2688 assertions in review.
- **`heartbeat-triage` is proved twice.** A source-text audit (no `git commit`, no `gh`, no lease,
  claim, acquire or spawn verb) plus a real run in a temporary repository whose `scripts/` holds only
  the copied helper, so the sibling-helper probes take their deterministic missing-helper branch and
  the observed write set is exactly the inbox plus one run snapshot.
- **`rg` output in this repository is rewritten by the `rtk` hook.** Searching for `autoplan` returned
  matches rendered as `repo-harness-n`. Confirmation of retirement was done with plain `grep`. Any
  agent auditing literal strings here should use `grep` rather than trust the filtered output.

## Open questions for later rows

- BRC3 must decide who owns Task/Lease coordination, publication and the acceptance receipt helper in
  the archcontext model, or accept that protection for them stays path-based.
- The `unfilled` / `slot_invalid` / `issue_batch_ambiguous` vocabularies exist only in the PRD and in
  the fixtures' `expected_outcome` fields. BRC5 owns turning them into a closed type; nothing in this
  row constrains where that type lives.
