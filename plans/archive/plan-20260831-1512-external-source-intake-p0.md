# Plan: External Source Intake P0

> **Status**: Archived
> **Created**: 20260831-1512
> **Slug**: external-source-intake-p0
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: parent-agent
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: architecture_boundary
> **Verification Boundary**: Focused external-source protocol/store/effect/CLI/authority tests plus all repository Required Checks and exact plan contract verification.
> **Rollback Surface**: Revert the single external-source-intake P0 branch/PR; preserve any inert Git-common-dir observation evidence without readers.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260831-1512-external-source-intake-p0.contract.md`
> **Task Review**: `tasks/reviews/20260831-1512-external-source-intake-p0.review.md`
> **Implementation Notes**: `tasks/notes/20260831-1512-external-source-intake-p0.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260831-1512-external-source-intake-p0.md`
- Sprint contract: `tasks/contracts/20260831-1512-external-source-intake-p0.contract.md`
- Sprint review: `tasks/reviews/20260831-1512-external-source-intake-p0.review.md`
- Implementation notes: `tasks/notes/20260831-1512-external-source-intake-p0.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260831-1512-external-source-intake-p0.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260831-1512-external-source-intake-p0.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260831-1512-external-source-intake-p0.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260831-1512-external-source-intake-p0.contract.md`
- Review file: `tasks/reviews/20260831-1512-external-source-intake-p0.review.md`
- Implementation notes file: `tasks/notes/20260831-1512-external-source-intake-p0.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260831-1512-external-source-intake-p0.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260831-1512-external-source-intake-p0.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single external-source-intake P0 branch/PR; preserve any inert Git-common-dir observation evidence without readers.
- **Verification boundary**: Focused external-source protocol/store/effect/CLI/authority tests plus all repository Required Checks and exact plan contract verification.
- **Review/acceptance boundary**: `tasks/reviews/20260831-1512-external-source-intake-p0.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: architecture_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260831-1512-external-source-intake-p0.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260831-1512-external-source-intake-p0.contract.md`, `tasks/reviews/20260831-1512-external-source-intake-p0.review.md`, and `tasks/notes/20260831-1512-external-source-intake-p0.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260831-1512-external-source-intake-p0.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single external-source-intake P0 branch/PR; preserve any inert Git-common-dir observation evidence without readers.

## Captured Planning Output

# External Source Intake P0

## Thesis

Hypothesis: repo-harness should add a provider-neutral, append-only evidence plane in front of canonical planning, not a provider-backed backlog or a shortcut into Fleet execution. The first proof is a manual GitHub one-shot refresh that records immutable issue observations and a complete refresh receipt, then exposes a read-only projection while proving Task, Lease, WorkEnvelope, priority, and runtime authority remain byte-identical.

## Confidence

- Confidence: high.
- Residual uncertainty: GitHub pagination and rate-limit behavior must be proven against bounded fixtures; the work-package fails closed if a complete refresh cannot distinguish provider failure from a healthy empty result.

## P1: Architecture Map

- Existing canonical execution authority remains unchanged:
  `canonical sprint row -> plan/contract proof -> TaskOffer -> fleet acquire -> Claim/Lease -> WorkEnvelope -> Agent Runtime -> Publication/Review`.
- `src/core/fleet/task-offer.ts` remains the sole `execution_ready` classifier; external observations never import or call it.
- `src/effects/state/coordination-lease-store.ts` and the existing per-task lock remain the sole ownership/election authority; external intake never writes `repo-harness/coordination/v1`.
- `src/core/collaboration` remains an authenticated human/Engineer collaboration plane. Provider pollers are not valid collaboration actors and external observations do not become `CoordinationSignalV1`.
- Add a new capability boundary `runtime-harness.external-source-intake` with implementation roots under:
  - `src/core/external-sources/`
  - `src/effects/external-sources/`
  - `src/cli/commands/external-source.ts`
  - focused tests under `tests/unit/`, `tests/effects/`, and `tests/cli/`.
- Persist immutable records under the repository Git common directory at `repo-harness/external-sources/v1/`; do not mix them with collaboration or coordination stores.
- GitHub is the only P0 adapter. Contracts and storage are provider-neutral, but P0 adds no speculative GitLab branch, alias, compatibility reader, or fallback.

## P2: Concrete Trace

```text
repo-harness external-source refresh --repo <registered-repo-id>
  -> strict registry read and read_write/read_only observation (no mutation authority inferred)
  -> strict tracked `.ai/harness/policy.json#external_sources` read
  -> mode must be manual and GitHub adapter explicitly enabled
  -> resolve exact GitHub repository identity through `gh`
  -> bounded page-by-page issue fetch
  -> exclude pull requests
  -> normalize immutable repository/issue provider IDs plus display ref
  -> evaluate deterministic label/assignee policy
  -> validate complete observation and comments completeness
  -> create-once ProviderIssueObservationV1 records keyed by content revision
  -> create one immutable ExternalSourceRefreshReceiptV1 for the attempt
  -> derive ExternalSourceProjectionV1 from persisted records
  -> render JSON/text through read-only CLI
```

Provider and local failures are explicit outcomes. HTTP/auth/rate-limit failure, pagination limit, response/body limit, invalid provider shape, or torn repository identity produces an unavailable/incomplete refresh receipt and a non-zero command; it never projects a healthy empty set and never preserves execution through best effort output.

## P3: Design Decision

### Non-negotiable invariants

1. Provider data is evidence, never Task, Contract, acceptance, priority, Claim, Lease, or execution authority.
2. One provider snapshot has one deterministic `source_revision`; repeated observation of identical bytes is idempotent.
3. A refresh attempt has its own immutable receipt so empty, failed, incomplete, and complete observations cannot collapse into one state.
4. Raw issue title/body/labels/assignees are untrusted data. P0 does not render them into an Agent prompt or workflow contract.
5. Repository and issue provider IDs are durable identity; `owner/repo#number` is display-only.
6. `Source Ref` stays reserved for the exact canonical sprint-row proof and is not overloaded with provider provenance.

### Why this shape

- Reusing `CoordinationSignalV1` would forge a provider actor into a closed authenticated actor vocabulary and turn collaboration into a second scheduler.
- Direct Issue-to-TaskOffer or Issue-to-acquire would bypass approved plan/contract and lease fencing.
- A mutable `seen/processing/done` table would create external workflow authority and lose the source version used by planning.
- A candidate-only projection without immutable observations cannot prove drift, truncation, provider failure, or what an Agent/human actually adopted later.

### 10x pressure

The first failure is provider pagination/rate-limit/response buffering, not Lease concurrency. P0 therefore requires explicit maximum pages, issues, per-body bytes, total payload bytes, and command deadline. Exceeding any limit records an incomplete/unavailable attempt and stops. Append-only store scan cost is deliberately left for a later reconstructable index only after measurement; no mutable cache is authorized now.

## Public Contracts

### `ProviderIssueObservationV1`

Required facts:

- protocol/kind;
- registered repository ID;
- provider and host;
- immutable provider repository ID and issue ID;
- display ref and URL;
- observed/provider-updated timestamps when provider supplies them;
- normalized open/closed state, title, body, labels, assignees;
- explicit comments policy (`omitted` in P0);
- policy revision and deterministic eligibility result/reasons;
- source revision, observation digest, and canonical JSON validation.

No field may be named `execution_ready`, `priority`, `claim`, `lease`, or `task_state`.

### `ExternalSourceRefreshReceiptV1`

Required facts:

- protocol/kind, registered repository and provider identity;
- policy revision;
- started/completed timestamps;
- outcome: `complete | incomplete | unavailable`;
- page/issue counts and enforced limits;
- exact observed source revisions for a complete run;
- typed failure class for incomplete/unavailable runs;
- receipt digest and create-once identity.

### `ExternalSourceProjectionV1`

Projection only from persisted receipts/observations. It exposes latest attempt, latest complete refresh, latest observation per provider issue identity, policy match/reasons, and source drift. It does not expose binding/adoption state in P0 and does not become a Fleet card.

### Policy

Add strict `.ai/harness/policy.json#external_sources` parsing with default `off`. P0 accepts only version 1, mode `off | manual`, an explicitly enabled GitHub adapter, one closed selection mode, and bounded fetch limits. Label scans require deterministic non-empty `labels_all` plus optional `assignees_any`; explicitly reviewed one-shot batches use sorted unique `issue_numbers` and resolve only those Issue endpoints. Unknown enum values, mixed/invalid selectors, unbounded limits, an empty label rule, or an exact batch larger than `max_issues` fail closed. There is no inferred legacy shape.

### CLI

- `repo-harness external-source refresh --repo <registered-repo-id> --format text|json`
- `repo-harness external-source list --repo <registered-repo-id> --format text|json`

Both resolve repositories through the strict registry. `list` is pure/read-only and performs no provider request. P0 adds no MCP mutation/read tool, background scheduler, UI, or webhook.

## File Plan

- Add `src/core/external-sources/issue-observation.ts`: closed schemas, validators, canonical bytes/digests, typed failures.
- Add `src/core/external-sources/projection.ts`: pure latest-complete/latest-attempt projection.
- Add `src/effects/external-sources/policy.ts`: strict tracked policy reader.
- Add `src/effects/external-sources/store.ts`: Git-common-dir create-once observation and refresh receipt store with safe paths/locks.
- Add `src/effects/external-sources/github.ts`: bounded `gh` adapter and provider shape normalization.
- Add `src/effects/external-sources/refresh.ts`: one-shot orchestration, completeness receipt, projection collection.
- Add `src/cli/commands/external-source.ts` and register it in `src/cli/index.ts`.
- Update initialization/template policy assets and workflow-contract/config documentation only where required to expose the strict key.
- Add `.archcontext` capability node/component plus architecture module, diagram/projection, and workstream artifacts required by architecture gates.
- Add focused unit/effect/CLI/authority tests. Modify existing Fleet/Lease/collaboration production files only if a negative authority test requires an import-free assertion; no behavior change is authorized there.

## Acceptance Scenarios

1. Identical snapshot refreshed twice yields the same `source_revision`, one observation payload, and two attempt receipts without duplicate content.
2. Body, label, assignee, provider state, or provider updated timestamp change produces a new revision; prior observations remain readable.
3. PR objects returned by GitHub's issues surface are excluded deterministically.
4. 403/auth failure, 429/rate limit, network failure, invalid JSON, pagination overflow, body/total-byte overflow, and torn repository identity return non-zero and produce typed incomplete/unavailable receipts; no healthy empty projection is published.
5. A complete zero-Issue refresh is distinguishable from every failure case.
6. Issue content containing prompt injection remains inert JSON data and is never placed into system/task prompts, contract fields, allowed paths, acceptance criteria, collaboration context, or Agent Runtime effects.
7. Repository rename/transfer retains identity through immutable provider IDs while display ref changes create a new observation revision.
8. Comments are not fetched and every observation states `comments_policy: omitted`.
9. Refresh and list leave canonical sprint bytes, TaskOffer/Fleet projection, Claim/Lease records, WorkEnvelope records, collaboration records, and Agent Runtime effects byte-identical.
10. Concurrent identical refresh writes reconcile idempotently; conflicting bytes at one content identity fail closed.
11. An exact Issue-number batch containing unlabeled and unassigned Issues is complete only when every selected Issue resolves; it performs no repository-wide Issue scan and never infers local dispatch state from GitHub metadata.

## Verification

Focused:

- protocol/schema/digest unit tests;
- store idempotence, unsafe path, symlink, conflict, and concurrency tests;
- GitHub fixture tests for pagination, PR filtering, identity drift, 403, 429, invalid JSON, and limits;
- CLI refresh/list JSON and text tests;
- policy parser/template drift tests;
- authority-baseline test proving no writes under coordination/collaboration/Task/Lease/WorkEnvelope/Agent Runtime stores.

Repository gates:

```bash
bun test --timeout 60000
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

## Rollback and Failure Handling

- Rollback is one PR/revert unit: remove the new capability, CLI, policy/template projection, immutable store readers/writers, tests, and workflow artifacts.
- Existing records under Git common-dir are inert after rollback because no existing authority reads them; rollback does not delete user evidence.
- No migration, compatibility reader, alias, or automatic cleanup is authorized.
- Provider credentials remain owned by `gh`; no token is persisted by repo-harness.

## Deferred Work

- WP2: authenticated `ExternalSourceBindingReceiptV1`, exact canonical-task revalidation, one-to-many/many-to-one provenance, source-drift attention, and the only `[ExternalSourceUntrusted]` renderer.
- WP3: Operator read-only presentation outside Fleet cards/priority.
- WP4: timed refresh with single-flight, cadence, backoff, deadline, ETag, and cancellation.
- Separate future work packages: GitLab adapter and any GitHub comment/label/assign/close effect with exact provider receipt.

## First Proof Point

A fixture GitHub runner returns two pages containing an eligible Issue, an ineligible Issue, one PR-shaped item, a prompt-injection body, one subsequent content change, and a 429 attempt. A live read-only proof resolves `Ancienttwo/repo-harness#231-#240` as one exact batch without pagination. Together they prove deterministic observation revisions, explicit complete/unavailable receipts, exact-batch completeness, correct projection, and byte identity of all existing Task/Lease/WorkEnvelope/collaboration/runtime authorities.

## Falsifier

If bounded GitHub observation cannot provide stable immutable repository/issue identity or cannot distinguish a complete empty result from provider failure/incomplete pagination, stop the adapter design and fall back to explicit signed-file or single-Issue import. Do not add fuzzy matching, best-effort current state, or mutable cache semantics.

## Task Breakdown

- [x] Register the external-source-intake architecture capability and freeze protocol/authority boundaries.
- [x] Implement strict external-source policy, immutable observation/refresh contracts, and Git-common-dir store.
- [x] Implement bounded GitHub one-shot refresh and pure external-source projection.
- [x] Implement and register read-only `external-source refresh/list` CLI surfaces.
- [x] Add focused fixtures, concurrency/authority tests, templates/docs/workstream sync, and run all required checks.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
