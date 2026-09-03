# Plan: Sprint task: BRC0 — Authority freeze 与 baseline characterization

> **Status**: Executing
> **Created**: 20260903-0954
> **Slug**: brc0-authority-freeze-baseline-characterization
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC0 — Authority freeze 与 baseline characterization
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260903-0954-brc0-authority-freeze-baseline-characterization.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md`; after execution revert branch `codex/brc0-authority-freeze-baseline-characterization` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260903-0954-brc0-authority-freeze-baseline-characterization.contract.md`
> **Task Review**: `tasks/reviews/20260903-0954-brc0-authority-freeze-baseline-characterization.review.md`
> **Implementation Notes**: `tasks/notes/20260903-0954-brc0-authority-freeze-baseline-characterization.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Sprint row 1 is a contract-mode work package; the $think expansion for it is recorded inline below.
- Source ref: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC0 — Authority freeze 与 baseline characterization
- Due diligence:
  - P1 map: `## Planning Expansion` -> `### P1 map`.
  - P2 trace: `## Planning Expansion` -> `### P2 trace`.
  - P3 decision rationale: `## Planning Expansion` -> `### P3 decision rationale`.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md`
- Sprint contract: `tasks/contracts/20260903-0954-brc0-authority-freeze-baseline-characterization.contract.md`
- Sprint review: `tasks/reviews/20260903-0954-brc0-authority-freeze-baseline-characterization.review.md`
- Implementation notes: `tasks/notes/20260903-0954-brc0-authority-freeze-baseline-characterization.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260903-0954-brc0-authority-freeze-baseline-characterization.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md`.

## Approach
### Strategy
Characterize before extending. This row adds tests, fixtures, documentation and one architecture
request, and changes zero lines of `src/`. The freeze is only useful if it is a falsifier: every
assertion either pins exact production bytes or pins an absence the campaign design depends on.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Freeze by digest over production serializers | A moved byte fails loudly and names the authority | The digest carries no diff, so the failure needs investigation | Use |
| Freeze by copying serialized bytes into fixtures | Failure shows the diff directly | Thirteen large blobs in review, and a copied blob invites regeneration | Reject |
| Skip the freeze and rely on existing unit tests | No new files | Existing tests assert behavior per module, not that the campaign's four authorities are jointly unchanged | Reject |

## Detailed Design

### File Changes

| File | Action | Description |
|------|--------|-------------|
| `tests/characterization/repair-campaign-authority-freeze.test.ts` | Add | The freeze: canonical bytes for four authorities plus every negative fact the campaign design depends on |
| `tests/fixtures/repair-campaign/authority-freeze-baseline.json` | Add | Thirteen frozen digests and the production function that produced each |
| `tests/fixtures/repair-campaign/protected-capabilities.json` | Add | Protected capability ids, unmapped protected surfaces, and the still-absent campaign capability |
| `tests/fixtures/repair-campaign/batch-*.json` | Add | Six provider partial-success batches built from real `ProviderIssueObservationV1` values |
| `docs/researches/20260903-repair-campaign-authority-freeze.md` | Add | Authority map, hop-by-hop trace, permission table, protected list, fixture index |
| `docs/architecture/requests/runtime-harness-development-campaign.md` | Add (generated) | `planned-boundary-change` drift request for the new capability |
| `docs/architecture/snapshots/2026-09-03-development-campaign-boundary-declaration.md` | Add | Authored boundary declaration: entrypoints, consumed capabilities, dependency direction |
| `docs/architecture/index.md` | Modify (generated) | Pending-request index entry |
| `src/**` | None | This row changes zero source behavior |

### Data Flow

See the P2 trace above and the expanded diagram in
`docs/researches/20260903-repair-campaign-authority-freeze.md`.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A frozen digest is "repaired" by re-deriving it instead of investigating | Medium | High: the freeze silently stops protecting anything | `authority-freeze-baseline.json` states the rule inline, and the test file header repeats it |
| A later row assumes `capability.runtime-harness.publication` exists because the sprint names it | Medium | Medium: protection maps to a node that is not there | The protected fixture records it as an unmapped surface and the test asserts no include glob covers it |
| The pending architecture request blocks a strict gate | Low | Medium | Severity `medium` on a capability that is not in the changed set; `check-architecture-sync.sh` reports `blocking=0` |

## Task Contracts
- Contract file: `tasks/contracts/20260903-0954-brc0-authority-freeze-baseline-characterization.contract.md`
- Review file: `tasks/reviews/20260903-0954-brc0-authority-freeze-baseline-characterization.review.md`
- Implementation notes file: `tasks/notes/20260903-0954-brc0-authority-freeze-baseline-characterization.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260903-0954-brc0-authority-freeze-baseline-characterization.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md`; after execution revert branch `codex/brc0-authority-freeze-baseline-characterization` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260903-0954-brc0-authority-freeze-baseline-characterization.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260903-0954-brc0-authority-freeze-baseline-characterization.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260903-0954-brc0-authority-freeze-baseline-characterization.contract.md`, `tasks/reviews/20260903-0954-brc0-authority-freeze-baseline-characterization.review.md`, and `tasks/notes/20260903-0954-brc0-authority-freeze-baseline-characterization.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260903-0954-brc0-authority-freeze-baseline-characterization.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md`; after execution revert branch `codex/brc0-authority-freeze-baseline-characterization` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: BRC0 — Authority freeze 与 baseline characterization

## Context

- Sprint: `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`
- Backlog row: 1
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `BRC0 — Authority freeze 与 baseline characterization` so that the acceptance line holds: 源码行为零变化，Task/Lease/Acceptance/Publication bytes 逐字节不变；绘出 Issue→Task→Plan→Lease→PR→Merge 数据流并冻结 GPT Pro 与本地 Agent 权限表；负向 fixture 证明 Issue 不是 Task、prompt 不是 Claim；证明 heartbeat-triage 仍只读、旧 autoplan 已退役、External Source binding 不创建 Task、campaign capability 默认不存在；冻结 protected capabilities 清单与 provider partial-success fixtures；architecture request 完整

## Planning Expansion

Completed. The `$think` pass for this row ran against the sprint file, the Source PRD
(Product Direction hard constraints, Module 1-4, Data Model, Non-goals) and
`docs/researches/20260902-gpt-pro-connector-readback-probe.md`. Its output is the file-level
breakdown below; no further expansion pass is required before execution.

### P1 map

Four authorities must be frozen and none of them may change:

- Task identity: `src/core/state/coordination-identity.ts` (`deriveTaskId`, `deriveTaskRevision`,
  `projectCanonicalTasks`) over `src/core/state/sprint-backlog-rows.ts#backlogRows`.
- Lease: `buildLeaseOwnerRecord` / `bindLeaseRecord` / `serializeLeaseOwnerRecord` in the same file,
  read back through `src/effects/state/coordination-lease-store.ts#readLease`.
- Acceptance: `scripts/acceptance-receipt.ts#renderAcceptanceProjection` plus
  `src/core/integration/product-acceptance.ts#canonicalAcceptanceMatrixBytes`.
- Publication: `src/core/publication/publication-receipt.ts` (`canonicalPublicationReceiptBytes`,
  `derivePublicationId`, `encodePublicationMarker`).

The campaign's inbound edge is `src/core/external-sources/{issue-observation,projection,binding}.ts`;
the acquisition chain it will consume is `src/effects/fleet/acquire.ts` with
`src/core/fleet/task-offer.ts#classifyTaskOffer` as the planning-completion signal.

### P2 trace

Issue -> `buildProviderIssueObservation` -> `buildExternalSourceProjection` -> [gap: adoption, row 8]
-> canonical Sprint row -> `deriveTaskId`/`deriveTaskRevision` -> plan+contract proof ->
`classifyTaskOffer` -> Work Graph offer -> `acquireFleetTask` -> `LeaseOwnerRecord` ->
fresh worktree + ClaimToken -> `WorkEnvelopeV1` -> `PublicationReceiptV1` -> `MergeReadinessV1` ->
human merge -> `AcceptanceReceipt` -> [gap: closure + cleanup, row 13].

Pressure point: `src/core/external-sources/binding.ts:118` requires `task_id`, `task_revision`,
`sprint_path`, `plan_path` and `contract_path` as inputs and validates `task_id` against
`/^[0-9a-f]{64}$/`. Binding consumes a Task; it has no branch that could mint one. That is the
single strongest falsifier for "an Issue is not a Task" and it is asserted in both directions.

### P3 decision rationale

Two decisions were forced during the pass and both are recorded in
`tasks/notes/20260903-0954-brc0-authority-freeze-baseline-characterization.notes.md`:

1. Three protected surfaces (Task/Lease coordination, publication, the acceptance receipt helper)
   are owned by **no** archcontext capability include glob. The sprint's Architecture Notes name
   `capability.runtime-harness.publication`, which does not exist. Rather than invent a mapping,
   `protected-capabilities.json` splits into `capabilities` (ids asserted to exist) and
   `unmapped_surfaces` (paths asserted to exist and asserted to still be uncovered).
2. `architecture-queue record --file` derives severity from `classify_change`, which has no branch
   for declaring a boundary whose entrypoints do not exist yet. The event was recorded through
   `repo-harness run architecture-event record-event`, the same writer `architecture-queue` itself
   calls, following the `planned-boundary-change` precedent in
   `docs/architecture/requests/archive/2026/runtime-harness-provider-thread-effects.md`. The
   generated card is regenerated on every upsert, so the authored boundary declaration lives in a
   snapshot instead of inside the card.

## Task Breakdown

- [x] Freeze Task authority bytes: `projectCanonicalTasks` over a literal three-row sprint,
      `deriveTaskId`/`deriveTaskRevision` agreement, and `taskOfferRevision`, in
      `tests/characterization/repair-campaign-authority-freeze.test.ts`.
- [x] Freeze the whole closed `classifyTaskOffer` input matrix (access mode x row status x seven
      lease states x three modes x two consistencies x plan present/absent x eight plan failures)
      as one digest.
- [x] Freeze Lease authority bytes for `reserving` and `bound`, and assert
      `parseLeaseOwnerRecord(serializeLeaseOwnerRecord(record))` round-trips.
- [x] Freeze Acceptance authority bytes: `canonicalAcceptanceMatrixBytes` plus `matrix_sha256`, and
      `renderAcceptanceProjection` over a literal `AcceptanceReceipt`.
- [x] Freeze Publication authority bytes: canonical receipt bytes, `publication_id` and the encoded
      marker.
- [x] Freeze the external-source observation bytes as the campaign's inbound edge.
- [x] Write the thirteen frozen digests plus their producing function into
      `tests/fixtures/repair-campaign/authority-freeze-baseline.json`.
- [x] Build six provider partial-success fixtures in `tests/fixtures/repair-campaign/` using real
      `ProviderIssueObservationV1` values (complete-10, partial-7-of-10, duplicate-slot,
      invalid-metadata, missing-marker, source-drift) with the three-field PRD marker and no hash.
- [x] Assert every fixture observation parses through `validateProviderIssueObservation`; assert no
      reconciliation logic is implemented here.
- [x] Negative fixture: a full ten-slot batch projects to zero Task, zero sprint row and zero lease;
      `buildExternalSourceBindingReceipt` succeeds with the canonical `task_id` and throws with
      `issue-<number>`.
- [x] Negative fixture: a dispatch prompt reaches no coordination input -- `classifyTaskOffer` with
      extra prompt fields is identical, and `parseLeaseOwnerRecord` rejects a prompt-derived
      `task_id` and any extra field.
- [x] Prove `heartbeat-triage` is still discovery-only: source-text audit for mutation, provider and
      dispatch verbs, plus a real run in a temporary repository asserting the write set is exactly
      `.ai/harness/triage/inbox.md` and one run snapshot, a clean `git status`, and an empty lease
      inventory.
- [x] Prove `repo-harness-autoplan` is retired: `retiredPackages` entry with null replacement, no
      helper id, no `RUN_HELP_GROUPS` entry, no `scripts/autoplan.*`.
- [x] Prove the campaign capability is absent: no `development_campaign` policy key, no
      `development-campaign` archcontext node, no `src/core/automation/`, `src/effects/automation/`
      or `src/cli/commands/campaign.ts`; and snapshot `external_sources.mode = "off"`.
- [x] Freeze `tests/fixtures/repair-campaign/protected-capabilities.json` and assert every listed
      capability id resolves to a real `.archcontext/model/nodes/*.yaml`, every unmapped surface path
      exists and is still covered by no include glob, and the campaign node is still absent.
- [x] Record the architecture drift request for
      `capability.runtime-harness.development-campaign` and author the boundary declaration in
      `docs/architecture/snapshots/2026-09-03-development-campaign-boundary-declaration.md`.
- [x] Write `docs/researches/20260903-repair-campaign-authority-freeze.md` with the hop-by-hop data
      flow, the GPT Pro / local Agent permission table, the protected list and the fixture index.
- [x] Verify: `bun test tests/characterization --timeout 60000`, `bun run check:type`,
      `git diff origin/main...HEAD --stat -- src` empty, `verify-contract --strict`,
      `check-task-workflow --strict`, `check-task-sync.sh`, `check-architecture-sync.sh`.
