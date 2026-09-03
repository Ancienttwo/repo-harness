# Repair Campaign Authority Freeze

> **Status**: Frozen
> **Created**: 2026-09-03
> **Baseline**: `main@1022e100`
> **Sprint**: `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md` row 1 (BRC0)
> **Source PRD**: `plans/prds/20260902-2238-gpt-pro-seeded-repair-campaign.prd.md`
> **Probe**: `docs/researches/20260902-gpt-pro-connector-readback-probe.md`
> **Freeze test**: `tests/characterization/repair-campaign-authority-freeze.test.ts`
> **Frozen digests**: `tests/fixtures/repair-campaign/authority-freeze-baseline.json`
> **Architecture request**: `docs/architecture/requests/runtime-harness-development-campaign.md`
> **Boundary declaration**: `docs/architecture/snapshots/2026-09-03-development-campaign-boundary-declaration.md`

The GPT Pro-seeded repair campaign adds one narrow inbound channel to a repository
that already owns every authority the channel eventually feeds. This document is
the frozen picture of those authorities before the campaign exists: which module
owns each hop, where the external boundary sits, and which facts every later
sprint row is allowed to assume.

## P1: Authority map

| Authority | Owning module | Canonical byte function |
|---|---|---|
| Task identity | `src/core/state/coordination-identity.ts` | `deriveTaskId`, `deriveTaskRevision`, `projectCanonicalTasks` |
| Backlog row grammar | `src/core/state/sprint-backlog-rows.ts` | `backlogRows` (mirrors `scripts/sprint-backlog.sh`) |
| Offer projection | `src/core/fleet/task-offer.ts` | `classifyTaskOffer`, `taskOfferRevision` |
| Lease ownership | `src/core/state/coordination-identity.ts` + `src/effects/state/coordination-lease-store.ts` | `buildLeaseOwnerRecord`, `serializeLeaseOwnerRecord`, `parseLeaseOwnerRecord`, `readLease` |
| Claim provenance | `src/core/engineers/principal-claim.ts` | `canonicalClaimActorReceiptBytes`, `workEnvelopeSha256` |
| Acquisition chain | `src/effects/fleet/acquire.ts` | `collectFleetOffers`, `acquireFleetTask` |
| Work Graph / scheduling | `src/core/engineers/scheduling.ts`, `src/effects/engineers/scheduling-acquire.ts` | `EngineerOfferV1` projection |
| Publication | `src/core/publication/publication-receipt.ts`, `src/effects/publication/publication-receipt.ts` | `canonicalPublicationReceiptBytes`, `derivePublicationId`, `encodePublicationMarker` |
| Merge readiness | `src/core/publication/merge-readiness.ts` | `projectMergeReadiness` (`MergeReadinessV1`) |
| Acceptance | `scripts/acceptance-receipt.ts`, `src/core/integration/product-acceptance.ts` | `renderAcceptanceProjection`, `canonicalAcceptanceMatrixBytes` |
| External source intake | `src/core/external-sources/issue-observation.ts`, `projection.ts`, `binding.ts` | `buildProviderIssueObservation`, `buildExternalSourceProjection`, `buildExternalSourceBindingReceipt` |

`tests/characterization/repair-campaign-authority-freeze.test.ts` pins the exact
bytes each of these emits for a literal subject. A moved digest means an
authority changed; re-deriving it is never the correct repair.

## P2: Issue to Merge, hop by hop

```text
GitHub Issue (external, untrusted)
  │  src/effects/external-sources/github.ts + refresh.ts + policy.ts
  ▼
ProviderIssueObservationV1                    src/core/external-sources/issue-observation.ts
  │  buildProviderIssueObservation → source_revision + observation_sha256
  ▼
ExternalSourceProjectionV1                    src/core/external-sources/projection.ts
  │  latest observation per issue + source_drift flag; no Task field exists here
  ▼
[ GAP — sprint row 8 (BRC6) ]  Repair adoption + atomic materialization
  │  no module owns this hop today
  ▼
Canonical Sprint row                          plans/sprints/*.sprint.md, read by
  │  src/core/state/sprint-backlog-rows.ts#backlogRows
  ▼
Task identity                                 src/core/state/coordination-identity.ts
  │  deriveTaskId(repoIdentity, sprintPath, taskCell)
  │  deriveTaskRevision(taskId, modeCell, acceptanceCell)
  ▼
Plan + Contract proof                         scripts/capture-plan.sh → plans/plan-*.md,
  │                                           tasks/contracts/*.contract.md
  ▼
TaskOfferV1                                   src/core/fleet/task-offer.ts#classifyTaskOffer
  │  planning_required → execution_ready is the only completion signal the
  │  campaign controller may observe (PRD Module 6)
  ▼
Work Graph / EngineerOffer                    src/core/engineers/scheduling.ts
  │  src/effects/engineers/scheduling-acquire.ts
  ▼
Claim                                         src/effects/fleet/acquire.ts#acquireFleetTask
  │  → deps.claim(...) under src/effects/state/coordination-sprint.ts
  ▼
LeaseOwnerRecord (reserving → bound)          src/core/state/coordination-identity.ts
  │  persisted by src/effects/state/coordination-lease-store.ts
  │  under <git-common-dir>/repo-harness/coordination/v1/leases/<task_id>/owner.json
  ▼
Fresh worktree + ClaimToken                   scripts/contract-worktree.sh,
  │                                           src/effects/state/coordination-claim-token.ts
  ▼
WorkEnvelopeV1                                src/effects/fleet/acquire.ts
  │  the only artifact a Worker may treat as task ownership
  ▼
PublicationReceiptV1 / PR                     created by scripts/ship-worktrees.sh
  │                                           through the publication CLI over
  │                                           src/core/publication/publication-receipt.ts and
  │                                           src/effects/publication/publication-receipt.ts;
  │                                           this is a separate path from the acquire chain
  ▼
MergeReadinessV1                              src/core/publication/merge-readiness.ts
  ▼
Human merge (Phase A)                         no merge controller exists; scripts/merge-gate.ts
  │                                           is advisory review, not an executor
  ▼
AcceptanceReceipt                             scripts/acceptance-receipt.ts
  ▼
[ GAP — sprint row 13 (BRC13) ]  Issue closure + branch/worktree cleanup
```

Two hops in this chain do not exist at the baseline, and that is the point of the
freeze: the campaign supplies exactly those two and nothing else. Every other hop
is consumed unchanged.

### The exact pressure point

`buildExternalSourceBindingReceipt` (`src/core/external-sources/binding.ts:118`)
takes `task_id`, `task_revision`, `sprint_path`, `plan_path` and `contract_path`
as **required inputs**. It has no branch on which it could mint a Task: every
identity field is supplied by the caller. But it is a schema boundary, not the
identity authority — it validates `task_id` against `/^[0-9a-f]{64}$/` and
nothing more, so any well-formed digest passes it, including one a campaign
derived from an Issue number.

The authority that rejects an invented identity is
`lookupCanonicalTask` (`src/core/state/coordination-identity.ts:143`), which
resolves a `task_id` only against rows the canonical sprint actually contains,
and `revalidateOffer` in `src/effects/fleet/acquire.ts`, which re-reads canonical
before any claim. The freeze test asserts all three facts: binding with the real
canonical `task_id` succeeds, binding with `issue-<number>` throws on shape, and
a well-formed digest derived from an Issue title resolves to no backlog row while
every real canonical task id does.

Naming this precisely matters for the campaign design. "The binding cannot mint a
Task" is true but weak; the enforceable statement is "an identity that no
canonical backlog row produced resolves to nothing, at lookup and again at
acquisition."

## P3: Why the boundary is where it is

The repository already separates *demand* from *identity*. External Source intake
owns untrusted provider bytes and refuses to interpret them
(`renderExternalSourceUntrustedContext` in `binding.ts` exists precisely to
label them). Canonical Sprint owns Task identity through a domain-separated
digest whose preimage is `[domain, protocol, repoIdentity, sprintPath, taskCell]`
— nothing provider-derived enters it. The lease store owns availability and
fences on `claim_id` plus `generation`.

The campaign's temptation is to short-circuit this: treat the Issue number as
the task key, treat the GPT Pro dispatch prompt as the assignment, and treat the
model's "I created 10 issues" as the observation. All three would collapse a
three-authority separation into one unverified external claim. The design
decision frozen here is that the campaign is a *router*: it may create Sprint
rows and Work Graph edges through the existing materialization boundary, and it
may close Issues after a human merge, but it owns no identity, no availability
and no verdict.

The smallest coherent change is therefore a new capability that consumes four
existing capabilities and rewrites none of them. That is what the architecture
request declares.

## GPT Pro and local Agent permission table

Frozen from PRD Product Direction hard constraints and Module 1–4. Anything not
listed as allowed is forbidden; absent capability is not permission.

| Actor | Allowed | Forbidden |
|---|---|---|
| GPT Pro Issue Author | Read the exact pinned `base_main_sha`; create Issues in the target repository; edit its own Issue once when the local side names that Issue for `slot_invalid` repair | Change code; create branches; open PRs; merge; close Issues; change labels, milestones or assignees; write a per-Issue Plan; decide slot assignment outside the body marker |
| Fresh GPT Pro Main Auditor | Read the exact `final_main_sha` in a **new** session; answer the local deterministic challenges; return one disposition | Reuse the authoring session; create or modify Issues; reopen Issues; expand follow-ups into a new group; be trusted on a self-reported Connector call |
| Local Campaign Controller | Persist `IssueBatchIntentV1` before opening a browser; read the provider snapshot; reconcile slots; adopt into canonical Sprint and Work Graph atomically; emit planning and dispatch jobs; close Issues after a verified merge; clean up branches and worktrees | Create Issues (no local `issue-create` fallback); rewrite an Issue body; do the per-Issue planning itself; claim a Task; execute code; merge; relax policy from a candidate branch; treat a browser timeout as success |
| `local_parent_host` agent (Claude or Codex) | Run `/hunt` for `bugfix` and characterize for `test_gap` in its own session; land the plan with `repo-harness run capture-plan`; spawn Workers from the dispatch prompt | Report planning completion back to the controller as authority — the controller observes `planning_required → execution_ready` through `src/core/fleet/task-offer.ts` instead |
| Worker (Claude or Codex) | Consume a real `WorkEnvelopeV1` produced by `src/effects/fleet/acquire.ts`; work inside the bound worktree; open a PR | Infer task ownership from a prompt; take a second Task under the same capability concurrency key; merge |
| Human Campaign Owner | Authorize the campaign; execute every merge in Phase A; grant waivers | — |

Two negative facts hold this table up, and both are asserted in the freeze test:

- An Issue observation carries no Task field on any code path, and an identity
  derived from one resolves to no canonical backlog row.
- A dispatch prompt reaches no coordination input. `ClassifyTaskOfferInput` has
  no prompt channel, and `parseLeaseOwnerRecord` rejects both a prompt-derived
  `task_id` and any extra field. The decisive test drives the real
  `acquireFleetTask` against a registry holding one writable repository and one
  genuinely execution-ready `TaskOfferV1`, with every side-effecting dependency
  replaced by a throwing spy. A control run with no assertion travels the whole
  canonical path — selection, authorization, revalidation — and **does** reach
  the `claim` spy, which is what makes the negatives meaningful. A
  prompt-derived `task_id` and a prompt-declared `repo_id` both return
  `offer_stale` at the selection boundary with no spy reached, so no claim,
  worktree, lease binding or claim token is created.

## Protected capabilities

`tests/fixtures/repair-campaign/protected-capabilities.json` is the frozen list.
A campaign may open an Issue and author a Plan against a protected surface, but
it must never route that surface into automated planning, acquisition,
execution, publication or closure. A hit is a hard stop, never a warning.

Seven surfaces map to real `.archcontext/model/nodes/` capability ids:
integration-acceptance, contract-assets, external-source-intake, collaboration,
engineer-scheduling, engineer-bindings and hook-adapters.

Three protected surfaces map to **no** capability include glob today, and the
fixture records them by path instead of pretending a node exists:

- Task and Lease coordination (`src/core/state/coordination-identity.ts`,
  `sprint-backlog-rows.ts`, `src/effects/state/coordination-lease-store.ts`)
- Publication (`src/core/publication/publication-receipt.ts`,
  `merge-readiness.ts`, `publication-lifecycle.ts`)
- The acceptance receipt helper (`scripts/acceptance-receipt.ts`)

The sprint's Architecture Notes name `capability.runtime-harness.publication` as
an existing capability. It does not exist; those paths are reachable only as
sinks inside `capability.runtime-harness.integration-acceptance`. The freeze
test asserts the absence, so a later row cannot quietly assume the node is
there.

## Fixtures

`tests/fixtures/repair-campaign/` holds one baseline document and six provider
batches. Every observation in every batch is a real `ProviderIssueObservationV1`
with a correctly derived `source_revision` and `observation_sha256`, so the
fixtures pass `validateProviderIssueObservation` unchanged.

Each batch carries `expected_slot_states`, one PRD term per declared slot,
instead of a batch-level verdict. The test reads the allowed vocabulary out of
the PRD file itself and asserts each state appears there verbatim, so this row
cannot authorize a term the PRD does not define and cannot leak one into BRC5.
`expected_marked_issue_ids` and `expected_unmarked_issue_ids` freeze marker
presence exactly, so deleting a marker fails even when the observation digests
are regenerated.

| Fixture | Purpose |
|---|---|
| `authority-freeze-baseline.json` | The thirteen frozen digests and the production function that produced each one |
| `protected-capabilities.json` | The protected list, the unmapped surfaces, and the still-absent campaign capability |
| `batch-complete-10.json` | Ten unique valid slots; every slot resolves `complete` |
| `batch-partial-7-of-10.json` | Slots 01–07 `complete`, 08/09/10 `missing`; follow-up must name only the three |
| `batch-duplicate-slot.json` | Two issues on slot 03; that slot is `issue_batch_ambiguous` and must never auto-close one of the pair |
| `batch-invalid-metadata.json` | Marker present but `group=one` and `slot=4`; slot 04 is `slot_invalid`, allowing one targeted edit repair before degrading to `unfilled` |
| `batch-missing-marker.json` | Title prefix present, body marker absent; the issue attaches to no slot, so slots 03–10 stay `missing`. This proves the title is not slot authority |
| `batch-source-drift.json` | Same issue observed twice with different bodies; slot 06 is `issue_source_drift` and `buildExternalSourceProjection` already reports it |

The marker format is exactly the three PRD fields and carries no hash:

```html
<!-- repo-harness-campaign:v1
campaign_id=<campaign-id>
group=1
slot=01
-->
```

Reconciliation logic is deliberately absent from this row. The fixtures are the
frozen inputs sprint row 7 (BRC5) must satisfy; only the intake parse is
exercised here.

## Frozen negative facts

- `heartbeat-triage` is discovery-only. `scripts/heartbeat-triage.sh` runs three
  read probes (`check-task-workflow.sh --strict`, `sprint-backlog.sh next`,
  a pending-request scan) and writes exactly `.ai/harness/triage/inbox.md` plus
  one run snapshot under `.ai/harness/runs/`. The freeze test runs the helper
  **in place**, from the repository's own `scripts/`, against a temporary
  repository, so the sibling probes it shells out to are the real ones and any
  transitive write lands inside the observed fixture. The test asserts the write
  set, that the `check-task-workflow.sh --strict` probe reported `fail` rather
  than the missing-helper `warning` (proving it actually executed inside the
  fixture), a clean `git status` and an empty lease inventory. The source text
  contains no git mutation, no `gh` call, no lease or claim verb and no spawn.

  One containment gap is frozen rather than claimed away: the sprint probe is
  only reached when `.ai/harness/sprint/active-sprint` exists, and
  `scripts/sprint-backlog.sh` derives its own repository root from
  `BASH_SOURCE` unless `REPO_HARNESS_TARGET_REPO_ROOT` is set.
  `heartbeat-triage` sets neither, so on that branch the probe reads the
  helper's repository rather than the one named by `--repo`. The probe is
  read-only (`sprint-backlog.sh next`), so this is a scoping defect and not a
  write leak, but it means "every transitive write lands inside `--repo`" is
  true only for the workflow probe. The freeze test asserts both the resolution
  rule and the absence of a target-root override, so this cannot change
  silently. Owning it belongs to the heartbeat capability, not to this row.
- `repo-harness-autoplan` is retired with no successor
  (`assets/skill-commands/manifest.json` `retiredPackages`, `replacement: null`).
  No helper id, no `RUN_HELP_GROUPS` entry and no `scripts/autoplan.*` exists.
- The campaign capability does not exist: no `development_campaign` key in
  `.ai/harness/policy.json`, no `development-campaign` archcontext node, and no
  `src/core/automation/`, `src/effects/automation/` or
  `src/cli/commands/campaign.ts`.
- `external_sources.mode` is `"off"`, which is the hard precondition PRD Module 2
  requires the campaign to check before any Issue observation is legal.

## 2026-09-03 re-baseline: #283

Five frozen digests moved — `task.canonical_projection`, both lease records,
`publication.receipt_bytes` and `publication.marker` — because #283 replaced the
derived `task_id` with a persisted `ID` column and gave `task_revision` a new
preimage (the exact Task cell plus a `protocol-v2` domain); the freeze fixture
now persists the same ids its rows derived under schema 1, so `task_id` itself is
unchanged and `task.offer_revision`, the classification matrix, the acceptance
digests, `publication.publication_id` and the external-source digests all stayed
put, which is the proof that only task revision semantics moved. This is
intentional and is the point of the change rather than drift in an authority:
identity now survives a Task title edit, so a rename no longer orphans a Lease,
a claim-scoped message, a Work Graph mapping or an external-source binding, and
every negative proof in the freeze — an Issue is not a Task, a prompt is not a
Claim, `heartbeat-triage` stays read-only, `repo-harness-autoplan` stays retired,
the campaign capability stays absent — is unchanged byte for byte. The campaign
owner accepted this re-baseline under four conditions, recorded in
`tasks/notes/20260902-2101-issue-283-immutable-task-id.notes.md`, and the
migration receipt binding the campaign sprint's old and new bytes is
`plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.schema-migration.v1.json`.
