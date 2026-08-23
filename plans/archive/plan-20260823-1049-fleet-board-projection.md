# Plan: Cross-repo Fleet Board Projection

> **Status**: Archived
> **Created**: 20260823-1049
> **Slug**: fleet-board-projection
> **Planning Source**: codex-plan
> **Orchestration Kind**: user-approved-plan
> **Source Ref**: prd:fleet-acquire-publication-readiness#module-7
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260823-1049-fleet-board-projection.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260823-1049-fleet-board-projection.md`; after execution revert branch `codex/fleet-board-projection` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260823-1049-fleet-board-projection.contract.md`
> **Task Review**: `tasks/reviews/20260823-1049-fleet-board-projection.review.md`
> **Implementation Notes**: `tasks/notes/20260823-1049-fleet-board-projection.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: prd:fleet-acquire-publication-readiness#module-7
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260823-1049-fleet-board-projection.md`
- Sprint contract: `tasks/contracts/20260823-1049-fleet-board-projection.contract.md`
- Sprint review: `tasks/reviews/20260823-1049-fleet-board-projection.review.md`
- Implementation notes: `tasks/notes/20260823-1049-fleet-board-projection.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260823-1049-fleet-board-projection.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260823-1049-fleet-board-projection.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260823-1049-fleet-board-projection.md`.

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
- Contract file: `tasks/contracts/20260823-1049-fleet-board-projection.contract.md`
- Review file: `tasks/reviews/20260823-1049-fleet-board-projection.review.md`
- Implementation notes file: `tasks/notes/20260823-1049-fleet-board-projection.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260823-1049-fleet-board-projection.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260823-1049-fleet-board-projection.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260823-1049-fleet-board-projection.md`; after execution revert branch `codex/fleet-board-projection` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260823-1049-fleet-board-projection.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260823-1049-fleet-board-projection.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260823-1049-fleet-board-projection.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260823-1049-fleet-board-projection.contract.md`, `tasks/reviews/20260823-1049-fleet-board-projection.review.md`, and `tasks/notes/20260823-1049-fleet-board-projection.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260823-1049-fleet-board-projection.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260823-1049-fleet-board-projection.md`; after execution revert branch `codex/fleet-board-projection` or the explicitly reviewed diff.

## Captured Planning Output

## Goal and success criteria

Implement PRD v3 Module 7 as one read-only fleet projection work-package. `fleet board --json` must join every authorized repository into one deterministic snapshot with columns `available | working | in_review | ready_to_merge | done`; `fleet watch --format jsonl` must emit the same schema as non-overlapping periodic snapshots. One unreadable repository must be isolated as a typed row instead of hiding healthy repositories. Success requires stable ordering, per-repository `snapshot_consistency`, no provider/inbox/lease writes, and a 10-repository fixture completing within 10 seconds with a hard 30-second timeout.

## Start gate

- Keep this plan `Draft` and do not implement until WP3-A Task Inbox and WP3 Provider Feedback each have a final passing AcceptanceReceipt and their final commits are ancestors of the WP4 baseline. The resolution below records when that condition became true.
- At implementation start, re-read the final merged Task Inbox and Provider Feedback APIs. If an equivalent read-side summary already exists, reuse it and remove the proposed inbox extension.
- The plan may be captured before that gate; `--execute` and `plan-to-todo` are forbidden until it passes.

### Start-gate resolution (2026-08-23)

- Passed on baseline `71a7a877`: WP3 Provider Feedback and WP3-A Task Inbox are both closed by final AcceptanceReceipts, published on `main`, and present on `origin/main`.
- Final Task Inbox has no body-free summary and no message priority field. WP4 may add exactly one lock-free, body-free summary in `src/effects/fleet/task-inbox.ts`; the public result is `{ unread_count, addressed_to_current_claim, snapshot_consistency }`. `priority_counts` is removed rather than inferred.
- Registry enumeration uses `readRepoHarnessRegistrySnapshot({ adoptedOnly: false })`. A new strict read entrypoint in the owning registry effect must reject malformed authority instead of inheriting the existing empty-registry fallback used by other consumers.
- The existing synchronous readiness provider runner has no abort/timeout contract. WP4 may extend the readiness effect with one shared-parser, cancellable async observation path; it must not duplicate provider parsing or change the existing readiness authority.

## Scope

- Add a pure `FleetBoardSnapshotV1` projection and closed per-repository/card schemas.
- Collect one authorized registry snapshot and one read-only board snapshot per repository.
- Join current publication pointer/receipt, existing merge-readiness projection, pending provider-feedback offer summary, and task-inbox summary without duplicating their authority or provider logic.
- Add `fleet board --json` and `fleet watch --format jsonl`.
- Isolate repository-local failures and preserve deterministic output for all healthy repositories.
- Add unit, effect, CLI, consistency, fault-isolation, and performance acceptance tests.

## Out of scope

- MCP mirrors, UI, daemon, webhook, SSE, filesystem watchers, PTY/session wake or resume.
- Provider feedback intake, comment-body fetch, delivery mutation, task-inbox delivery mutation, lease mutation, acquisition, bind, reopen/takeover, merge, or readiness recomputation.
- Replacing the existing single-repository `todo | doing | blocked | done` board contract.
- Cross-repository locks, a new liveness authority, cached provider state, or compatibility parsers.

## P1 architecture map

- `src/core/fleet/board.ts` owns the new pure fleet schema, column classification, deterministic sorting, summary counts, and snapshot digest. It does not read the filesystem or call providers.
- `src/effects/fleet/board.ts` owns registry enumeration, bounded per-repository collection, existing projection joins, repository-local error isolation, and watch scheduling.
- `src/cli/commands/fleet.ts` owns argument parsing, JSON/JSONL rendering, exit semantics, and signal-aware watch termination.
- Existing `src/core/state/project-board.ts` and `src/effects/state/resolve-board.ts` remain the single-repository board and A/B snapshot-fence authority.
- Existing merge-readiness remains the provider/readiness authority; existing feedback projection remains the provider-feedback read authority; Task Inbox remains the message authority.
- `src/effects/repo-registry.ts` remains registry parsing authority and exposes the strict snapshot read used by WP4; the board must not add a shadow registry parser.
- `src/effects/publication/merge-readiness.ts` remains the single provider parsing/readiness authority and may expose an abortable async adapter that shares its existing validators with the synchronous path.
- Explicit dependency surface: final merged WP3-A Task Inbox and WP3 Provider Feedback. No implementation begins against worktree-only APIs.

## P2 concrete traces

### One-shot board

1. CLI parses `fleet board --json`; no implicit mutation command is accepted.
2. Collector reads one `RepoHarnessRegistrySnapshotV1` and freezes its revision and sorted authorized repository list.
3. Each repository is collected independently with a bounded worker pool. `resolveBoard()` supplies its board cards and `snapshot_consistency`.
4. For reviewing cards only, collector resolves the lease-owned `current_publication`, immutable receipt and existing merge-readiness result. It reads, but never invokes, provider-feedback intake.
5. Collector joins read-only pending-feedback and inbox summaries using exact task/publication/claim/generation keys.
6. Pure projection maps cards to the five fleet columns, sorts repositories and cards, calculates counts/digest, and emits one JSON document.
7. A repository-local read/provider error becomes one `unreadable` repository result with a typed reason; other repositories remain present. A registry-level failure fails the command non-zero because enumeration authority is unavailable.

### Watch

1. `fleet watch --format jsonl` uses the same collector and schema as one-shot board.
2. It starts a new round only after the prior round completes; rounds never overlap. Production provider observations use the readiness boundary's abortable async adapter.
3. The first snapshot is immediate. Later snapshots start on a fixed 30-second cadence measured after the prior emission.
4. Every successful round emits exactly one canonical JSON line including monotonically increasing `sequence` and a fresh `observed_at`; identical snapshots are still emitted so consumers can prove liveness without inventing agent/session liveness.
5. SIGINT/SIGTERM aborts the current provider subprocesses, writes no partial JSON line, and exits 0 after the last complete line. A round that exceeds 30 seconds is emitted with typed degraded repository results and the next round starts only after cleanup.

## P3 design decisions

- Introduce a fleet-level column type instead of modifying `BoardColumn`; the existing single-repository contract has different semantics and consumers.
- Treat the registry snapshot as enumeration authority and per-repository projections as independent observations. Cross-repository atomicity is not claimed.
- Preserve `snapshot_consistency` per repository. A fleet digest proves deterministic assembly, not a globally atomic snapshot.
- Reuse readiness and feedback read projections. Board/watch never call `gh` directly except through the existing readiness boundary and never call feedback intake.
- Add only one Task Inbox read-side extension if the final merged API lacks it: a body-free summary keyed by task and current claim/generation. Message bodies remain inaccessible to board output.
- Default to bounded concurrency `4`; this is sufficient for the 10-repository target without an unbounded provider burst. At 10x scale, provider latency/rate limits fail first; caching and daemonization remain deferred until measured.

## Public contracts

### FleetBoardSnapshotV1

- `protocol: 1`
- `kind: "fleet_board_snapshot"`
- `registry_revision: string`
- `sequence: integer >= 1`
- `observed_at: RFC3339 string`
- `snapshot_consistency: "stable" | "changed_during_read" | "degraded"`
- `repositories: FleetRepositoryBoardV1[]`, sorted by canonical repository ID
- `counts: { available, working, in_review, ready_to_merge, done, unreadable }`
- `snapshot_sha256: sha256` over canonical fields excluding `observed_at`, `sequence`, and itself

### FleetRepositoryBoardV1

- `repository_id`, `repo_root`, `access_mode: "read_only" | "read_write"`
- `status: "ok" | "unreadable"`
- `snapshot_consistency: "stable" | "changed_during_read" | "degraded"`
- `cards: FleetBoardCardV1[]`, empty only when unreadable or no tasks
- `error: null | { code: FleetBoardErrorCode, message: bounded string }`
- Never expose secrets, provider bodies, session IDs, or absolute paths outside the registry-authorized repository root.

### FleetBoardCardV1

- Identity: `repository_id`, `task_id`, `task_revision`, nullable `claim_id`, nullable `generation`.
- Classification: `column`, `attention_owner`, `execution_readiness`, `lease_state`.
- Publication: nullable `publication_id`, `head_sha`, `merge_readiness`, and closed blocker codes copied from existing readiness output.
- Feedback: `{ pending_count, no_progress, repair_actions }` from the existing read-only feedback projection; no summaries or bodies.
- Inbox: `{ unread_count, addressed_to_current_claim }` from the body-free inbox summary. Task Inbox V1 has no priority authority, so WP4 must not synthesize priority buckets.
- Provenance: repository `snapshot_consistency`; no card is usable as a mutation precondition.
- `head_sha` is `null` when there is no exact current publication; it is never inferred from a branch, worktree, or provider observation.

### Attention-owner precedence

- Reuse closed owners from existing offer, readiness, and feedback projections; unread inbox addressed to the current claim contributes `agent`.
- Overall deterministic precedence is `user > agent > external > none`, matching the existing merge-readiness projection. `no_progress` contributes `user`; an offered repair contributes `agent`.
- Repository unreadability remains a typed repository error and does not fabricate a card owner.

### Column mapping

- `done`: source board card is terminal done/cleanup-complete.
- `ready_to_merge`: lease is `reviewing`, current publication join is exact, and existing merge readiness returns `ready: true`.
- `in_review`: lease is `reviewing` with an exact current publication but readiness is not ready, including provider feedback or inbox attention.
- `working`: lease state is `reserving | bound | completing`, or the single-repository board reports active doing work.
- `available`: task is pending, unleased, and the existing offer classification is `execution_ready`.
- Unsupported, planning-required, orphaned, corrupt, or unreadable task states remain cards with `attention_owner` and blocker codes; they do not get promoted to `available`. If no five-column classification is sound, the repository becomes `degraded` and the card remains in `working` only when a real active lease proves work; otherwise it is excluded from column counts and listed under repository errors.

## Typed errors

- Fatal command errors: `fleet_registry_unavailable`, `fleet_registry_invalid`, `fleet_board_argument_invalid`, `fleet_watch_aborted_before_first_snapshot`.
- Repository-isolated errors: `repo_unreadable`, `repo_authority_invalid`, `repo_snapshot_changed`, `repo_board_unavailable`, `repo_publication_unreadable`, `repo_readiness_unavailable`, `repo_feedback_unreadable`, `repo_inbox_unreadable`, `repo_collection_timeout`.
- Unknown schema values, path escapes, symlinks on authority files, ambiguous current publications, and malformed records fail closed. No local inference or compatibility translation is allowed.
- Body-free inbox collection performs no task lock or delivery transition. It uses an A/B read fence over validated event/receipt facts, retries the whole observation once, and returns `changed_during_read` rather than patching mixed generations.

## CLI contract

- `repo-harness fleet board --json [--max-concurrency <1..16>] [--timeout-ms <1000..30000>]`
- `repo-harness fleet watch --format jsonl [--interval-ms <1000..300000>] [--max-concurrency <1..16>] [--timeout-ms <1000..30000>]`
- Board success exits 0 when registry authority is valid even if one or more repository rows are typed `unreadable`; fatal registry/schema/argument errors exit 1 or argument exit 2.
- Watch writes stdout as JSONL only. Diagnostics go to stderr. It never emits banners, progress text, or partial lines.
- No default human table is added in this slice; omitting `--json` or using a format other than `jsonl` is an argument error.

## Allowed paths

- `plans/plan-*-fleet-board-projection.md`
- `tasks/contracts/*-fleet-board-projection.contract.md`
- `tasks/reviews/*-fleet-board-projection.review.md`
- `tasks/notes/*-fleet-board-projection.notes.md`
- `tasks/current.md`
- `docs/architecture/.projection-manifest.json`
- `src/core/fleet/board.ts`
- `src/effects/fleet/board.ts`
- `src/cli/commands/fleet.ts`
- `src/effects/repo-registry.ts`
- `src/effects/publication/merge-readiness.ts`
- `src/effects/fleet/task-inbox.ts`
- `tests/unit/fleet-board.test.ts`
- `tests/effects/fleet-board.test.ts`
- `tests/cli/fleet-board.test.ts`
- `tests/cli/registry.test.ts`
- `tests/unit/merge-readiness-v1-effect.test.ts`
- `tests/unit/task-inbox-v1.test.ts`
- Existing board/readiness/inbox/feedback tests only when their public-contract fixtures must be updated

## Acceptance Script: WP4 fleet board

1. Build a fixture registry with ten authorized repositories: available, bound, reviewing-blocked, reviewing-ready, done, one changed-during-read, one unreadable, one pending-feedback, one current-claim inbox message, and one provider-unavailable readiness result.
2. Run `fleet board --json` twice over unchanged fixtures. Assert canonical repository/card ordering, identical `snapshot_sha256`, exact five-column counts, correct readiness/feedback/inbox joins, and zero byte changes to every registry, lease, receipt, feedback, delivery, reaction, and inbox artifact.
3. Mutate one repository between its A/B board reads. Assert only that repository reports `changed_during_read`/degraded while all other rows remain stable and present.
4. Make one repository authority unreadable and separately make one provider readiness call unavailable. Assert the first produces a typed `unreadable` row, the second preserves the existing readiness blocker, and neither aborts healthy repositories.
5. Run watch with a fake clock/provider for three rounds. Assert immediate first line, no overlapping collections, monotonic sequence, one complete canonical JSON object per line, stable digest for unchanged facts, and clean SIGINT after the last complete line.
6. Run the ten-repository fixture under the real collector boundary. Assert completion under 10 seconds; force one repository past 30 seconds and assert typed timeout isolation, child cleanup, and no partial JSON.
7. Run focused tests, `bun run check:type`, `bun test --timeout 60000`, all root required checks, independent gatekeeper review, Change Assessment, AcceptanceReceipt, and local closeout.

## Verification

- `bun test tests/unit/fleet-board.test.ts`
- `bun test tests/effects/fleet-board.test.ts`
- `bun test tests/cli/fleet-board.test.ts`
- Existing `tests/board-projection.test.ts` and `tests/board-snapshot-consistency.test.ts` remain green.
- `bun run check:type`
- `bun test --timeout 60000`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts init --repo . --dry-run`

## Failure and rollback

- Revert WP4 as one projection-only publication unit. Existing single-repository board, readiness, feedback intake, inbox delivery, and lifecycle remain usable.
- A fatal registry failure emits no snapshot. Repository-local failures remain explicit rows. Watch never retries by overlapping rounds and never emits a partial record.

## Task Breakdown

- [x] Verify WP3-A/WP3 final AcceptanceReceipts and ancestry; re-read their final APIs and freeze exact allowed paths.
- [x] Implement pure fleet schema, mapping, canonical digest, ordering, counts, and unit tests.
- [x] Implement body-free Task Inbox summary only if no equivalent final API exists.
- [x] Implement bounded cross-repository collector with readiness/feedback/inbox joins and repository-local isolation.
- [x] Implement `fleet board --json` and non-overlapping `fleet watch --format jsonl`.
- [ ] Run the WP4 acceptance script, performance/fault tests, full root checks, independent gate, Change Assessment, AcceptanceReceipt, and closeout.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
