> **Archived**: 2026-09-05 14:53
> **Related Plan**: plans/archive/plan-20260905-0342-review-boundary-repairs.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-1453
> **Archive Projection V1**: `plans/plan-20260905-0342-review-boundary-repairs.md` => `plans/archive/plan-20260905-0342-review-boundary-repairs.md`
> **Archive Projection V1**: `tasks/notes/20260905-0342-review-boundary-repairs.notes.md` => `tasks/archive/notes-20260905-1453-review-boundary-repairs.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0342-review-boundary-repairs.contract.md` => `tasks/archive/contract-20260905-1453-review-boundary-repairs.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0342-review-boundary-repairs.review.md` => `tasks/archive/review-20260905-1453-review-boundary-repairs.md`

# Plan: Repair review authority boundaries and hook completion

> **Status**: Archived
> **Created**: 20260905-0342
> **Slug**: review-boundary-repairs
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-1453-review-boundary-repairs.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260905-0342-review-boundary-repairs.md`; after execution revert branch `codex/review-boundary-repairs` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-1453-review-boundary-repairs.md`
> **Task Review**: `tasks/archive/review-20260905-1453-review-boundary-repairs.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-1453-review-boundary-repairs.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260905-0342-review-boundary-repairs.md`
- Sprint contract: `tasks/archive/contract-20260905-1453-review-boundary-repairs.md`
- Sprint review: `tasks/archive/review-20260905-1453-review-boundary-repairs.md`
- Implementation notes: `tasks/archive/notes-20260905-1453-review-boundary-repairs.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-1453-review-boundary-repairs.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-0342-review-boundary-repairs.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-0342-review-boundary-repairs.md`.

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
- Contract file: `tasks/archive/contract-20260905-1453-review-boundary-repairs.md`
- Review file: `tasks/archive/review-20260905-1453-review-boundary-repairs.md`
- Implementation notes file: `tasks/archive/notes-20260905-1453-review-boundary-repairs.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-1453-review-boundary-repairs.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-0342-review-boundary-repairs.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260905-0342-review-boundary-repairs.md`; after execution revert branch `codex/review-boundary-repairs` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-1453-review-boundary-repairs.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260905-1453-review-boundary-repairs.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-0342-review-boundary-repairs.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-1453-review-boundary-repairs.md`, `tasks/archive/review-20260905-1453-review-boundary-repairs.md`, and `tasks/archive/notes-20260905-1453-review-boundary-repairs.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-1453-review-boundary-repairs.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260905-0342-review-boundary-repairs.md`; after execution revert branch `codex/review-boundary-repairs` or the explicitly reviewed diff.

## Captured Planning Output

# Review boundary repairs and bounded hook completion

## Goal
Repair the seven review findings verified against main a95f41e3 and diagnose/fix the user-observed post-answer `Working ... Running hook` stall. The user authorized parallel deep-worker/fast-worker implementation, additional verified related findings, and plan capture. Integration baseline is main 41f52197; unrelated agent-fleet edits and BRC4 WIP are excluded.

## P1: Architecture and ownership
CLI adapters feed core protocol validators and effect stores. ArchContext alone owns refactor assessment/scale/recommendation meaning; repo-harness owns authorization, task/claim identity, execution, evidence and Git publication. Controller acquisition and dispatch use distinct journals; WorkDemand spans a journal and canonical Git ref; Campaign binds immutable authorization to a moving target. Host Stop completion spans the installed hook adapter, hook route, journal drain, projection jobs and supervised children.

## P2: Traces and proven pressures
- Controller: acquire-next -> WorkEnvelope/attempt context -> caller-selected dispatch -> usage/outcome. The acquired and dispatched identities are not joined.
- Refactor: provider accepted recommendation -> caller-authored Program -> materialize -> candidate/merge -> final-main verify -> Board. Full provider semantics are dropped at the Program boundary; Board incorrectly equates each merge commit with final main.
- WorkDemand: accepted projection -> Sprint/WorkGraph commit -> ref CAS -> in-memory receipt. A process loss after CAS leaves no replayable receipt.
- Campaign: stored authorization -> current target equality -> every append/read. Expected post-merge movement prevents later phases; CLI-generated timestamps change immutable start identity on retry.
- Sprint: each file independently validates task IDs, while shared Lease/message storage keys by task ID across files.
- Hook: capture installed adapter/config, live process ancestry and recent hook timing evidence before selecting a fix. Preserve a bounded host completion path and durable retry authority.

## P3: Decisions
Preserve one source of truth, fail-closed validation, exact identity, existing append-only journals and Git CAS. Add no dependencies, semantic fallback, parallel authority registry, new automation platform, or feature activation. Reuse existing store/receipt patterns. Test the composition boundaries and fault windows, not only isolated validators. At ten times the task volume, unrelated dispatch attribution, multiple sequential merges, crash replay and unbounded hook work fail before ordinary function throughput.

## Parallel ownership
1. deep-worker/refactor: src/core/refactor/**, src/effects/refactor/**, src/cli/commands/refactor.ts and focused refactor tests. Bind complete authoritative recommendation payload to immutable Program semantics; compare final-main measurement separately from per-PR merge ancestry.
2. deep-worker/execution: src/effects/automation/controller-run.ts, relevant delegated-run read-only join exports, src/effects/engineers/work-demand-materialization.ts, work-demand-store.ts, work-demand CLI materialize block and focused tests. Join dispatch with acquisition before any host action; persist/recover exact WorkDemand publication.
3. fast-worker/campaign: src/cli/commands/campaign.ts, src/core/automation/development-campaign.ts, src/effects/automation/development-campaign-store.ts and focused campaign tests. Separate authority/policy baseline from verified current target, preserve read-only inspection and terminal reconciliation, and make CLI start replay stable.
4. Parent: hook diagnosis, task identity uniqueness integration, generated mirrors, documentation, plan/contract progress, final verification and review. May assign subsequent bounded tasks to freed workers. Workers must report red/green evidence and may not commit, ship, change shared workflow files or overwrite others' work.

## Acceptance criteria
- An admitted dispatch with a different task, claim generation or Engineer Binding never launches or records success under the acquired task.
- Provider payload/Program scale, route, affected nodes or reasons mismatch cannot bypass architecture/activation gates. Subsequent execution consumes the same immutable semantic identity.
- Two sequential PR merges and a later final-main commit can resolve valid refactor evidence; unrelated/non-ancestor merges and stale measurement are rejected.
- WorkDemand replay after ref CAS returns the same exact receipt and completes its existing lifecycle without a second ref mutation; unrelated target movement is rejected.
- Campaign can inspect and record legitimate stop/reconciliation after expiry or target movement, but cannot acquire fresh authority. Post-merge continuation requires exact verified owned-head evidence, not merely a caller string or ancestry alone.
- Repeating campaign start with the same key and omitted timestamp returns the original request; conflicting explicit identity is rejected.
- Duplicate task IDs across live canonical sprint carriers fail before shared Lease/subject use and are detected by strict checks; archived completed artifacts do not create false positives.
- Hook root cause is backed by runtime evidence or a deterministic process fixture. If a fix is possible locally, a regression proves bounded completion, correct child cleanup and no loss of authoritative pending work. Do not claim the observed UI stall fixed from source-only evidence.

## Scope limits
No real Campaign execution, provider writes, npm release, external messages, automatic activation, deletion of dirty worktrees, or changes to the ongoing agent-fleet/BRC4 work. Installed hook refresh is limited to the verified fix and existing managed installation route if needed to make the user's active runtime consume it; no disabling required gates to hide the stall.

## Verification
Workers first run regression tests against baseline, then focused tests against their changes. Parent reviews the combined diff and runs bun run check:type; bun test --timeout 60000; bash scripts/check-deploy-sql-order.sh; bash scripts/check-architecture-sync.sh; bash scripts/check-task-sync.sh; bash scripts/check-task-workflow.sh --strict; bun scripts/inspect-project-state.ts --repo . --format text; bun src/cli/index.ts init --repo . --dry-run; helper/hook mirror checks where affected. Verify installed hook timing separately from source tests. Record existing environment failures honestly, never weaken gates.

## Rollback
Work in codex/review-boundary-repairs, isolated from dirty main. Each lane is a bounded revertable change; no production data migration is planned. Retain durable receipts when publication has already happened. Do not revert or move unrelated changes. Final delivery includes actual verification and explicit remaining runtime/acceptance limitations.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

- User-added scope: repair root and generated AGENTS.md/CLAUDE.md verification policy so small changes select focused checks; full verification remains required for high-risk/cross-module/runtime changes. Update the packaged check instruction that previously ran every listed command unconditionally.
- Review-added safety: execution binding must consume the verifier's stored receipt and exact verified PR head. Board identity includes measured HEAD and rejects bindings not reachable from it.
- Campaign disposition: read/terminal operations are repaired; automatic continuation after merge remains fail-closed because no typed Campaign-to-owned-publication proof exists. Do not create an unchecked head-override protocol in this work-package.
- Hook disposition: local Stop budget, resumable pending state and child cleanup address bounded completion. Archctx 0.5.6 generic openSession digest still traverses nested worktrees before its projection-specific digest profile; no supported consumer exclusion exists. No third-party package patch or dependency upgrade is included.
- Non-blocking Refactor provenance gap: accepted Recommendation payload fields are authoritative; providerStage and routeReasonCodes have no provider readback authority and do not control execution route/activation.

## Task Breakdown
- [x] Repair and prove acquisition-to-dispatch exact identity.
- [x] Bind Refactor Program execution semantics to accepted provider Recommendation payloads.
- [x] Repair final-main versus per-PR merge binding and immutable Board head identity.
- [x] Bind execution receipts to the verifier store and exact verified PR head.
- [x] Make WorkDemand CAS publication replay recoverable.
- [x] Repair Campaign inspection/terminal authority handling; retain fail-closed post-merge execution pending typed ownership proof.
- [x] Make Campaign start CLI idempotent with default timestamp.
- [x] Enforce task ID uniqueness across live Sprint carriers and proposed materialization.
- [x] Repair root/bootstrap/Claude/Codex/check-command verification selection; prove generated output and line budgets.
- [ ] Diagnose and repair post-answer Running hook stall with runtime evidence.
- [ ] Synchronize current documentation and generated mirrors affected by these repairs.
- [ ] Complete independent review, required verification and coherent handoff.

## Approved publication-blocking repair

The owner approved repairing the three effect-to-CLI imports and renewing acceptance on 2026-09-05. The authoring effect now requires caller-supplied binding/consult/followup capabilities; the CLI composes the real browser adapters. The effect retains all validation and persist-first ordering, and returns the original browser result without a shape translator. No browser module move, new dependency, feature or compatibility fallback is authorized. Add `bun run check:state-boundaries` to the final contract checks so full unit tests cannot hide this CI failure.
