# Plan: AXR7 Consumer E2E, Adoption, and Dogfood

> **Status**: Archived
> **Created**: 20260809-0327
> **Slug**: axr7-consumer-e2e-adoption-dogfood
> **Planning Source**: arch-context-sprint
> **Orchestration Kind**: cross-repository-work-package
> **Source Ref**: arch-context:plans/sprints/20260808-1433-archctx-repo-harness-projection-runtime-integration.sprint.md#AXR7
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: packed producer and consumer, ten-document adoption fidelity, three durable dogfood cycles, and aggregated completion readiness
> **Rollback Surface**: disable the provider, restore adopted documents through receipt-bound preimages, and revert the AXR7 merge while preserving receipts and dead letters
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260808-archctx-projection-handoff.md`
> **Task Contract**: `tasks/contracts/20260809-0327-axr7-consumer-e2e-adoption-dogfood.contract.md`
> **Task Review**: `tasks/reviews/20260809-0327-axr7-consumer-e2e-adoption-dogfood.review.md`
> **Implementation Notes**: `tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.notes.md`

## Agentic Routing

- Selected route: cross-repository contract implementation
- Routing reason: AXR7 changes repo-harness model/docs/runtime readiness and requires a paired ArchContext migration helper, but final package-shaped E2E must not import either sibling checkout.
- Due diligence:
  - P1 map: ArchContext packed CLI and contracts are producer authority; repo-harness node-v2 model, ten nested documents, AXR6 projection job runtime, and `check-architecture-sync` are consumer surfaces.
  - P2 trace: reviewed model proposal -> daemon-owned ChangeSet -> adoption preview/apply -> packed provider request -> durable projection/refresh receipts -> source-event acknowledgement -> readiness aggregation.
  - P3 decision rationale: semantic declarations and generated regions keep one authority; migration helper is one-way and non-runtime; all packed E2E resolution is integrity-bound and independent of sibling source paths.

## Workflow Inventory

- Active plan: `plans/plan-20260809-0327-axr7-consumer-e2e-adoption-dogfood.md`
- Sprint contract: `tasks/contracts/20260809-0327-axr7-consumer-e2e-adoption-dogfood.contract.md`
- Sprint review: `tasks/reviews/20260809-0327-axr7-consumer-e2e-adoption-dogfood.review.md`
- Implementation notes: `tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260809-0327-axr7-consumer-e2e-adoption-dogfood.contract.md` `allowed_paths`
- Consumer baseline: repo-harness `main@99c645f3` with AXR6 archived and merged.
- Producer baseline: arch-context `main@cb2c135`; the paired AXR7 helper, Mermaid theme, and projection fixed-point fixes are committed before this consumer freezes tarball integrity.
- Concurrency rule: this plan owns one isolated repo-harness contract worktree. The paired ArchContext helper uses its own repository contract/worktree; neither may edit the other's Git state directly.
- Execution isolation: `repo-harness run plan-to-todo --plan plans/plan-20260809-0327-axr7-consumer-e2e-adoption-dogfood.md`, then `repo-harness run contract-worktree start --plan ...`.

## Approach

### Strategy

1. Add a paired, one-way ArchContext migration helper that accepts a reviewed, typed proposal and submits `create_entity`/`update_entity_fields` operations through `RuntimeDaemonClient.planUpdate/applyUpdate`; it never writes `.archcontext` directly and is excluded from the production package.
2. Freeze a repo-harness model proposal covering all ten nodes, evidence selectors, relations and flows. Apply it to the AXR7 worktree only through the paired helper, validate node-v2/relation-v1/flow-v1, and retain the ChangeSet receipt.
3. Compute a byte ledger for every marker-external region in the ten nested documents. Run one all-target adoption preview; any unprovable flow, ambiguous heading, collision or fidelity mismatch aborts before the first write.
4. Apply the approved adoption ChangeSet, emit only Mermaid source for P1/P2 (never HTML), validate every generated diagram with the pinned producer validator, visually inspect representative renders, and prove a second profile apply is byte-noop.
5. Build `archctx-contracts@0.4.0`, `archctx@0.4.0`, and repo-harness tarballs; install all of them into a clean disposable consumer with temporary `file:` pins and verified integrity. The fixture must reject sibling checkout resolution.
6. Execute clean snapshot, single-capability dirty snapshot, and multi-capability dirty snapshot cycles through the installed Stop entry. Bind projection and refresh receipts, then prove each second run is zero diff/noop.
7. Make `check-architecture-sync` aggregate projection provider/readiness, adoption/human-action, durable job/dead-letter, projection freshness and supplementary request-card state. Enable provider/apply on repo-harness with advisory gates; keep the already-selected ArchContext capability authority unchanged.

### Trade-offs

| Option | Pros | Cons | Decision |
|---|---|---|---|
| Directly edit `.archcontext` YAML | Simple | Violates ChangeSet/daemon authority and has no receipt | Reject |
| Add a general public model-write CLI | Reusable | Expands 0.4.0 public protocol beyond AXR7 need | Reject |
| One-way repo-local migration helper in ArchContext | Uses existing typed ChangeSet boundary; non-runtime | Requires paired repository commit | Use |
| Keep provider disabled until AXR8 | Every clone stays dependency-clean | Does not dogfood real advisory runtime | Reject; enable advisory and accept missing-package visibility until AXR8 exact pins |
| Infer flows from existing Markdown | Fast | Creates a second semantic parser and unproved truth | Reject |

## Detailed Design

### File Changes

| File | Action | Description |
|---|---|---|
| paired ArchContext `scripts/apply-model-proposal.ts` | add | Validate proposal, plan/apply one ChangeSet, emit metadata-only receipt |
| `.archcontext/model/nodes/*.yaml` | update via ChangeSet | Add exact entrypoint/sink selectors required by proven flows |
| `.archcontext/model/relations/*.yaml` | create via ChangeSet | Declare only reviewed cross-capability relations |
| `.archcontext/model/flows/*.yaml` | create via ChangeSet | One required or explicitly not-applicable flow per capability |
| `docs/architecture/modules/**/*.md` | adopt via ChangeSet | Replace only machine ranges; preserve P3/history/backlog/external bytes |
| `docs/architecture/.projection-manifest.json` | generate | Bind target/source/model/CodeGraph/renderer/layout digests |
| `docs/architecture/diagrams/agentic-dev-plugin-architecture.html` | delete | Retire the legacy standalone HTML diagram; Mermaid source is the only architecture diagram authoring format |
| `scripts/axr7-consumer-e2e.ts` | add | Packed three-package clean-room, fidelity ledger and three Stop cycles |
| `tests/architecture-projection-e2e.test.ts` | add | Negative and read-model coverage independent of the long host fixture |
| `scripts/check-architecture-sync.sh` plus asset projection | update | Aggregate provider, projection queue, adoption, freshness and request cards |
| `.ai/harness/policy.json` and projected defaults/docs | update | Enable `projection_provider=archctx`, `projection_apply=apply`, advisory failure/freshness gates |

### Data Flow

`reviewed proposal -> ArchContext ChangeSet plan/apply -> validated model -> adoption preview -> all-target fidelity gate -> adoption ChangeSet -> packed provider handshake -> ProjectionJob -> archctx projection -> ProjectionReceipt + ArchitectureRefreshSignalV1 -> refresh receipt -> source ack -> check-architecture-sync aggregate`.

The migration helper and E2E fixture persist only paths, ids, digests, status, timing and receipt references. They must not persist source bodies, raw diffs, full CodeGraph output, prompts or completions.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Existing prose cannot be represented without semantic loss | Medium | High | all-target preview and external-byte ledger abort before any write |
| A declared flow lacks exact CodeGraph binding | Medium | High | fail `human-action-required`; do not weaken to path/name inference |
| Adoption partially writes ten files | Low | High | one daemon-owned ChangeSet with journal rollback and preimage hashes |
| Packed fixture accidentally imports sibling source | Medium | High | filesystem deny sentinel, resolved executable/package readback and tarball integrity assertions |
| Provider enabled before registry dependency | High | Medium | advisory gates expose missing package; AXR8 immediately replaces overlay-tested contract with exact registry pins |
| Three host cycles exceed CI budget | Medium | Medium | one bounded long fixture, no sleeps/retries inside hooks, explicit 120/150 second deadlines |

## Task Contracts

- Contract file: `tasks/contracts/20260809-0327-axr7-consumer-e2e-adoption-dogfood.contract.md`
- Review file: `tasks/reviews/20260809-0327-axr7-consumer-e2e-adoption-dogfood.review.md`
- Implementation notes file: `tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.notes.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260809-0327-axr7-consumer-e2e-adoption-dogfood.contract.md --strict`

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`
- Paired producer revision and tarball integrities must be recorded in implementation notes before adoption or E2E execution.

## Promotion Gate

- **Merge/PR unit**: ten-capability model/adoption, packed consumer proof, advisory provider activation and readiness aggregation land together.
- **Rollback surface**: disable provider, restore document preimages only through adoption receipts, revert AXR7; retain operational evidence.
- **Verification boundary**: 10/10 fidelity plus three named installed-host cycles and full repository CI.
- **Review/acceptance boundary**: one typed AcceptanceReceipt over the frozen normalized subject after the paired ArchContext helper revision is fixed.
- **High-risk surface**: existing architecture prose, source selectors, ChangeSet atomicity and clean-room package resolution.
- **Why not checklist row**: it crosses two repositories, persistent model/docs, installed host runtime and completion readiness.

## Evidence Contract

- **State/progress path**: this plan, contract, notes, review, paired producer commit and Sprint AXR7 row.
- **Verification evidence**: checks JSON, run snapshot, model/adoption receipt digests, 10-file hash ledger, tarball integrities, packed resolution readback and three cycle receipts.
- **Evaluator rubric**: every acceptance-matrix row is either directly proven or explicitly failed; zero inference from absence of errors.
- **Stop condition**: all ten targets are proven before adoption; any fidelity, snapshot, selector or package-resolution mismatch stops the entire work package.
- **Rollback surface**: same as Promotion Gate; no destructive cleanup of receipts/dead letters.

## Annotations

- The Sprint originally described AXR8 as the capability-source cutover. Current main already has `context.capability_source=archcontext` and ten node-v2 records, so AXR7 preserves that single authority and AXR8 verifies/removes any remaining migration sync surface rather than repeating a cutover.
- The user-selected `architecture` output contract overrides that external skill's HTML-first template: generated architecture documentation contains Mermaid fences/source only. `mermaid` remains an authoring/review skill and `@mermaid-js/mermaid-cli@11.16.0` remains an exact dev-time validator, not a production runtime dependency or vendored skill asset.

## Task Breakdown

- [x] Land the paired ArchContext one-way model ChangeSet helper with focused rollback/path/privacy tests.
- [x] Freeze and review all ten node/relation/flow proposals with exact evidence selectors.
- [x] Apply the proposal through one ChangeSet and validate model/proof status 10/10.
- [x] Capture the ten-document external-byte ledger and pass one all-target adoption preview.
- [x] Apply adoption atomically; validate Mermaid corpus and second-run zero diff.
- [x] Implement the packed three-package cross-repo E2E with no sibling-source resolution.
- [x] Prove clean, single-capability dirty and multi-capability dirty Stop cycles with receipts and noop reruns.
- [x] Aggregate `check-architecture-sync`, enable advisory provider/apply, and cover pending/adoption/human-action states.
- [x] Run focused suites, `bun run check:ci`, contract verification and installed-host readback.
