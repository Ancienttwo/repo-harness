> **Archived**: 2026-09-04 04:16
> **Related Plan**: plans/archive/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260904-0416
> **Archive Projection V1**: `plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md` => `plans/archive/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md`
> **Archive Projection V1**: `tasks/notes/20260903-0954-brc0-authority-freeze-baseline-characterization.notes.md` => `tasks/archive/notes-20260904-0416-brc0-authority-freeze-baseline-characterization.md`
> **Archive Projection V1**: `tasks/contracts/20260903-0954-brc0-authority-freeze-baseline-characterization.contract.md` => `tasks/archive/contract-20260904-0416-brc0-authority-freeze-baseline-characterization.md`
> **Archive Projection V1**: `tasks/reviews/20260903-0954-brc0-authority-freeze-baseline-characterization.review.md` => `tasks/archive/review-20260904-0416-brc0-authority-freeze-baseline-characterization.md`

# Implementation Notes: brc0-authority-freeze-baseline-characterization

> **Plan**: `plans/archive/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md`
> **Contract**: `tasks/archive/contract-20260904-0416-brc0-authority-freeze-baseline-characterization.md`

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
- **The whole `classifyTaskOffer` matrix is one digest.** 2 x 2 x 7 x 3 x 2 x 2 x 8 x 2 = 5376 inputs
  collapse to one value, so adding a blocker code, reordering a branch or changing an attention owner
  all fail loudly without 5376 assertions in review.
- **`heartbeat-triage` is proved twice.** A source-text audit (no `git commit`, no `gh`, no lease,
  claim, acquire or spawn verb) plus a real run of the helper in place, from the repository's own
  `scripts/`, against a temporary repository. Running it in place is deliberate: the sibling probes
  it shells out to are then the real `check-task-workflow.sh --strict` and `sprint-backlog.sh next`,
  so their transitive writes land inside the observed fixture and are covered by the same write-set
  assertion. The test also asserts the workflow probe reported `fail` rather than the missing-helper
  `warning`, which is how it proves the transitive path actually ran.
- **`rg` output in this repository is rewritten by the `rtk` hook.** Searching for `autoplan` returned
  matches rendered as `repo-harness-n`. Confirmation of retirement was done with plain `grep`. Any
  agent auditing literal strings here should use `grep` rather than trust the filtered output.

## Open questions for later rows

- BRC3 must decide who owns Task/Lease coordination, publication and the acceptance receipt helper in
  the archcontext model, or accept that protection for them stays path-based.
- The `unfilled` / `slot_invalid` / `issue_batch_ambiguous` vocabularies exist only in the PRD and in
  the fixtures' `expected_outcome` fields. BRC5 owns turning them into a closed type; nothing in this
  row constrains where that type lives.

## Codex review round 1: REJECT, and the four structural repairs

The first external review returned `VERDICT: REJECT` with four P1 findings and three P2 findings.
All seven were valid. Nothing was waived; each was repaired at the level the finding named.

1. **Mislabeled byte provenance.** The Task projection and the offer matrix were digested with the
   test's own `JSON.stringify`, while the baseline claimed the production function as the serializer.
   `projectCanonicalTasks` and `classifyTaskOffer` return objects and own no byte contract. Both
   digests now go through `canonicalJson` (`src/core/fleet/board.ts:279`), the repository's canonical
   serializer, and the baseline's `source` field names the subject producer and the byte function
   separately. The two digests were re-derived because the byte function changed, not because a test
   was failing.

2. **The binding negative test proved shape, not authority.** `binding.ts` validates `task_id`
   against `/^[0-9a-f]{64}$/` and nothing else, so any well-formed digest passes it. The original
   claim -- that minting a Task from an Issue would require changing `binding.ts` -- was wrong. The
   real authority is `lookupCanonicalTask`, which resolves only against rows the canonical sprint
   contains. A new test derives a well-formed digest from an Issue title, shows it resolves to no
   backlog row, and shows every real canonical task id does resolve. The research doc's pressure-point
   section was rewritten to state the enforceable claim instead of the weak one.

3. **The prompt test was vacuous.** It asserted that a string was non-empty and then observed an
   untouched repository. It now drives the real `acquireFleetTask` with an empty registry snapshot
   and every side-effecting dependency (`claim`, `bind`, `release`, `start`, `writeToken`, `project`)
   replaced by a spy that throws if reached. `collectFleetOffers` and the selection rule stay real.
   The prompt enters through `assertion`, which is its only reachable channel; the result is
   `offer_stale` with the assertion and `no_eligible_task` without it, and no spy is ever called.

4. **The heartbeat test bypassed the transitive path.** Copying the helper into a scripts directory
   with no siblings forced the missing-helper branch, so the real `check-task-workflow.sh --strict`
   never ran. See the entry above for the repair.

5. **The matrix was not actually closed.** `canonical_available` was pinned to `true`, leaving the
   `canonical_unavailable` branch (`src/core/fleet/task-offer.ts:192`) outside the freeze. Both values
   are now in the matrix: 2688 inputs became 5376, and the test asserts that count.

6. **`.projection-manifest.json` was outside Allowed Paths.** The automatic archctx projection that
   `verify-sprint --prepare-acceptance` runs rewrites it. It is now declared in both the contract's
   `allowed_paths` and the plan's file-changes table rather than arriving as undeclared drift.

7. **`slot_unresolved` was an invented outcome code.** PRD Module 4 names `slot_invalid` for
   malformed metadata and `issue_slot_unexpected` for an undeclared slot, but nothing for a body with
   no marker at all. `batch-missing-marker.json` now states no `expected_outcome`; it records
   `expected_marker_present: false` plus a note that naming this case belongs to BRC5. The
   every-fixture test additionally asserts that any `expected_outcome` present in any fixture is a
   term the PRD already defines, so this row cannot leak vocabulary into later rows.

## Codex review round 2: REJECT, and the four repairs

Round 2 accepted five of the seven round-1 repairs as structural and rejected two as incomplete,
plus two new findings. All four were repaired.

1. **The prompt test was still decided by an empty world.** With `repos: []` the offer document was
   necessarily empty, so the throwing spies were unreachable for a reason that had nothing to do with
   the prompt. The test now injects a registry with one writable repository and a real
   execution-ready `TaskOfferV1` built through the production `classifyTaskOffer`, `taskOfferRevision`
   and `freezeTaskOffer`. A control case with no assertion runs the real selection and revalidation
   and *does* reach the `claim` spy, which is what makes the two negatives meaningful: a
   prompt-derived `task_id` and a prompt-declared `repo_id` both return `offer_stale` with no spy
   reached, while the canonical path reaches the first ownership mutation.

2. **The heartbeat sprint probe was never exercised, and forcing it would have leaked.** The fixture
   has no `.ai/harness/sprint/active-sprint`, so only `check-task-workflow.sh --strict` ran
   transitively. Adding the marker would not have fixed the claim: `scripts/sprint-backlog.sh:20`
   resolves its repository root from `BASH_SOURCE` unless `REPO_HARNESS_TARGET_REPO_ROOT` is set, and
   `heartbeat-triage` sets neither, so that branch reads the helper's own repository rather than
   `--repo`. Rather than paper over it, the gap is now frozen: a test asserts the helper's resolution
   rule, asserts `heartbeat-triage` sets no target-root override, and asserts the probe is read-only
   (`next`). The research doc's containment claim was narrowed to the workflow probe. Owning the fix
   belongs to the heartbeat capability.

3. **The three-field marker was documented but not executable-frozen.** The observation validator
   treats `body` as an opaque string, so a fourth `base_sha` field with regenerated digests would have
   passed every assertion. A new test parses the marker out of every fixture body, asserts the key
   list is exactly `[campaign_id, group, slot]`, and asserts no value looks like a digest. Falsified
   by hand: adding `base_sha=<40 hex>` and rebuilding the observation makes it fail.

4. **The boundary declaration misrouted Publication.** It claimed the campaign reaches Task, Lease and
   Publication "only through" `acquireFleetTask`. Publication is created by
   `scripts/ship-worktrees.sh` through the publication CLI, on a separate downstream path the campaign
   does not enter; it observes the result through `MergeReadinessV1`. The snapshot and the research
   doc's flow diagram now say so.

The matrix count in the round-1 section above was also corrected from 2688 to 5376.

## Codex review round 3: REJECT, and the five repairs

Round 3 confirmed every round-2 repair as structural and raised five new findings, all valid.

1. **The projection manifest and the verification evidence lagged the final commit.** Both were
   generated before the round-2 fix commit, so the declared artifact and the recorded evidence
   described an older subject. Closed by regenerating the projection and re-running
   `verify-sprint --prepare-acceptance` after the last content commit, and by committing the
   manifest so the tree and its provenance agree. A manifest-only commit does not retrigger the
   projection -- `sourceTreeDigest` is unchanged by it -- so this converges rather than chasing HEAD.

2. **`incomplete` was a batch-level outcome the PRD never defines.** PRD Module 4 assigns states per
   slot (`complete`, `missing`, `issue_batch_ambiguous`, `slot_invalid`, `issue_slot_unexpected`,
   `issue_source_drift`, `unfilled`); `incomplete` appears only in the sprint row. Worse, the test
   carried a hand-written allowlist, so it authorized its own fixtures. Both are gone: every fixture
   now carries `expected_slot_states`, one PRD term per declared slot, and the test reads the PRD
   file and asserts each state appears there verbatim. Falsified by hand: setting a slot to
   `incomplete` fails.

3. **Marker presence was a floor, not a freeze.** `seen >= 20` meant several markers could be deleted
   and the suite would stay green. Each fixture now declares `expected_marked_issue_ids` and
   `expected_unmarked_issue_ids`, and the test asserts both sets exactly. Falsified by hand: deleting
   a marker and regenerating the observation digests fails.

4. **The research doc and the plan still described the round-1 prompt test.** They claimed the
   no-assertion path returns `no_eligible_task` with no spy reached. The current control run reaches
   the `claim` spy on purpose -- that is what proves the negatives are not vacuous. Both documents now
   state the actual design.

5. **The boundary snapshot conflated architecture existence with activation.** It read as if the
   capability stays absent after BRC3 lands the node. Corrected: the node's existence is an
   architecture fact, `development_campaign.mode = off` is the runtime fact, and landing the node
   grants no activation.
