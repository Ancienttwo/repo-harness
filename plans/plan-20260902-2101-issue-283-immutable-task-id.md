# Plan: Persist immutable Sprint task IDs

> **Status**: Executing
> **Created**: 20260902-2101
> **Slug**: issue-283-immutable-task-id
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: github:Ancienttwo/repo-harness#283
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260902-2101-issue-283-immutable-task-id.md`; after execution revert branch `codex/issue-283-immutable-task-id` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md`
> **Task Review**: `tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md`
> **Implementation Notes**: `tasks/notes/20260902-2101-issue-283-immutable-task-id.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: github:Ancienttwo/repo-harness#283
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260902-2101-issue-283-immutable-task-id.md`
- Sprint contract: `tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md`
- Sprint review: `tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md`
- Implementation notes: `tasks/notes/20260902-2101-issue-283-immutable-task-id.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260902-2101-issue-283-immutable-task-id.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260902-2101-issue-283-immutable-task-id.md`.

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
- Contract file: `tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md`
- Review file: `tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md`
- Implementation notes file: `tasks/notes/20260902-2101-issue-283-immutable-task-id.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260902-2101-issue-283-immutable-task-id.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260902-2101-issue-283-immutable-task-id.md`; after execution revert branch `codex/issue-283-immutable-task-id` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260902-2101-issue-283-immutable-task-id.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md`, `tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md`, and `tasks/notes/20260902-2101-issue-283-immutable-task-id.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260902-2101-issue-283-immutable-task-id.md`; after execution revert branch `codex/issue-283-immutable-task-id` or the explicitly reviewed diff.

## Captured Planning Output

## Goal and success criteria
Resolve GitHub issue #283: persist an immutable Task ID column in the canonical Sprint schema so Task text edits keep identity stable while still changing `task_revision`. Success: identity/revision property tests (rename, reorder, Mode/Acceptance/Status edits), Work Graph join by persisted ID, fail-closed duplicate/missing/malformed IDs, a one-shot migration with byte-bound receipt that preserves every pre-migration v1 ID and refuses live-lease Sprints, and full required checks passing.

## Scope
- Canonical Sprint schema v2 row shape `| ID | Task | Mode | Acceptance | Status |`; `ID` is a persisted safe identifier. Migration populates each row with its current 64-hex v1 derived `task_id`.
- `src/core/state/coordination-identity.ts`: `task_id = validated persisted ID`; `task_revision = digest(protocol-v2 domain + task_id + exact Task text + Mode + Acceptance)`. Do NOT bump `COORDINATION_PROTOCOL=1` (it participates in existing digest domains); introduce a separate schema/record version.
- Work Graph carrier (`WorkPackageDefinitionV1.task_ref`) joins by `task_id`; `task_ref` may remain only as a derived display projection, never the join key.
- One-shot migration command (CLI helper) that: reads one canonical Sprint, derives v1 IDs, refuses duplicates/malformed rows/ambiguous Work Graph mappings, refuses while any affected row has a live non-released Lease, writes ID column + same-commit Work Graph references deterministically, re-reads and proves each migrated ID equals the v1 derived ID, emits a migration receipt binding old/new Sprint bytes, old/new Work Graph bytes and target commit.
- v1 parser keeps a stated removal release and an explicit compatibility owner recorded in `tasks/todos.md`; archived v1 Sprints stay read-only and cannot be reactivated without migration.
- Migrate the repo's own active/relevant sprint files under `plans/sprints/` if they are consumed by live code paths, using the new command; otherwise document read-only status.
- Update all consumers (CLI, Fleet, Engineer scheduling, messages, external-source bindings, board projections) to the same canonical ID; update spec/architecture docs and sprint-contract reference docs.

## Non-scope
- No external task-ID registry or mutable database; no ID derived from row number, slug, or normalized title; no indefinite dual-read fallback; no silent Lease steal/release. Do not touch dispatch fencing (#278) or dependency-authority resolution (#284), which run in parallel worktrees.

## P1 Architecture map
Task identity authority: `src/core/state/coordination-identity.ts` (`deriveTaskId`, `deriveTaskRevision`, lease records). Sprint parsing: sprint-backlog helpers and `src/core/sprint*`/`src/effects/sprint*` readers. Work Graph: `src/core/engineers/*` (`WorkPackageDefinitionV1`), scheduling in `src/effects/engineers/scheduling.ts`. Consumers: Fleet board, Engineer offers/acquire, task messages, external-source bindings, operator board projections. Migration lives as a CLI command under `src/cli/commands/` with an effect under `src/effects/`.

## P2 Concrete trace
Sprint row bytes → parser → `deriveTaskId(protocol, repo identity, sprint path, Task text)` → `task_revision` → Offer/Lease/claim/message subject keys → Work Graph `task_ref` join → Engineer offer. After: row `ID` cell → validated → `task_id`; revision digest includes Task text so a title edit stales offers/leases while identity survives. Pressure point: every digest-domain consumer must move together and stale pre-edit offers/leases must fail on revision, not on identity.

## P3 Decision rationale
Display text and identity are two data and must not share one field. Populating the ID column with the existing v1 derived digest preserves every known identity value (no alias invention). Fail-closed migration with byte-bound receipt keeps canonical Sprint as the sole identity authority. At 10x sprint count the first pressure is migration receipts per sprint; one-shot command with explicit removal release bounds the dual-parser window.

## Task Breakdown
- [ ] #1 Add failing property tests for identity/revision semantics (rename keeps id + changes revision; reorder keeps both; Mode/Acceptance change revision; Status-only keeps revision; duplicate/missing/malformed ID fail closed).
- [ ] #2 Implement Sprint schema v2 parsing/validation and the v2 identity/revision derivation in `coordination-identity.ts` without changing `COORDINATION_PROTOCOL`.
- [ ] #3 Move Work Graph carrier and all consumers (CLI, Fleet, Engineer scheduling, messages, external-source bindings, board projections) to join by persisted `task_id`; add continuity fixtures for messages and external-source references and a stale-offer/lease-after-title-edit test.
- [ ] #4 Implement the one-shot migration command with live-lease refusal, deterministic Sprint + Work Graph rewrite, re-read proof, and byte-bound migration receipt; add golden tests.
- [ ] #5 Migrate repo-local sprint files that live code paths consume; record v1 parser owner and removal trigger in `tasks/todos.md`; update `docs/spec.md`, sprint-contract reference docs, and architecture module docs.
- [ ] #6 Run focused tests, `bun run check:type`, `repo-harness run check-state-boundaries`, root required checks, and record acceptance evidence.

## Verification
bun test --timeout 60000; bun run check:type; repo-harness run check-state-boundaries; bash scripts/check-deploy-sql-order.sh; bash scripts/check-architecture-sync.sh; bash scripts/check-task-sync.sh; repo-harness run check-task-workflow --strict; bun scripts/inspect-project-state.ts --repo . --format text; bun src/cli/index.ts init --repo . --dry-run.

## Annotations

Deviation from the issue's *recommended* row shape is recorded in
`tasks/notes/20260902-2101-issue-283-immutable-task-id.notes.md`: schema v2 adds
the `ID` column to the repo's real six-cell backlog grammar rather than dropping
the `#` index and `Plan` cells, which `scripts/sprint-backlog.sh` owns.

## Task Breakdown
- [x] #1 Add failing property tests for identity/revision semantics (rename keeps id + changes revision; reorder keeps both; Mode/Acceptance change revision; Status-only keeps revision; duplicate/missing/malformed ID fail closed).
- [x] #2 Implement Sprint schema v2 parsing/validation and the v2 identity/revision derivation in `coordination-identity.ts` without changing `COORDINATION_PROTOCOL`.
- [x] #3 Move Work Graph carrier and all consumers (CLI, Fleet, Engineer scheduling, messages, external-source bindings, board projections) to join by persisted `task_id`; add continuity fixtures for messages and external-source references and a stale-offer/lease-after-title-edit test.
- [x] #4 Implement the one-shot migration command with live-lease refusal, deterministic Sprint + Work Graph rewrite, re-read proof, and byte-bound migration receipt; add golden tests.
- [x] #5 Migrate repo-local sprint files that live code paths consume; record v1 parser owner and removal trigger in `tasks/todos.md`; update `docs/spec.md`, sprint-contract reference docs, and architecture module docs.
- [x] #6 Run focused tests, `bun run check:type`, `repo-harness run check-state-boundaries`, root required checks, and record acceptance evidence.
