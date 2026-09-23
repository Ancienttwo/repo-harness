> **Archived**: 2026-09-23 03:19
> **Related Plan**: plans/archive/plan-20260922-0534-akn04-automation-summary.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260923-0319
> **Archive Projection V1**: `plans/plan-20260922-0534-akn04-automation-summary.md` => `plans/archive/plan-20260922-0534-akn04-automation-summary.md`
> **Archive Projection V1**: `tasks/notes/20260922-0534-akn04-automation-summary.notes.md` => `tasks/archive/notes-20260923-0319-akn04-automation-summary.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0534-akn04-automation-summary.contract.md` => `tasks/archive/contract-20260923-0319-akn04-automation-summary.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0534-akn04-automation-summary.review.md` => `tasks/archive/review-20260923-0319-akn04-automation-summary.md`

# Plan: AKN-04d2: observe original automation authorities

> **Status**: Archived
> **Created**: 20260922-0534
> **Slug**: akn04-automation-summary
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: docs/researches/20260921-agent-first-kanban-implementation-roadmap.md
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Original automation record identity and side-effect-free scoped observation
> **Rollback Surface**: Remove automation summary and transport revision without stored migration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260923-0319-akn04-automation-summary.md`
> **Task Review**: `tasks/archive/review-20260923-0319-akn04-automation-summary.md`
> **Implementation Notes**: `tasks/archive/notes-20260923-0319-akn04-automation-summary.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: docs/researches/20260921-agent-first-kanban-implementation-roadmap.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260922-0534-akn04-automation-summary.md`
- Sprint contract: `tasks/archive/contract-20260923-0319-akn04-automation-summary.md`
- Sprint review: `tasks/archive/review-20260923-0319-akn04-automation-summary.md`
- Implementation notes: `tasks/archive/notes-20260923-0319-akn04-automation-summary.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260923-0319-akn04-automation-summary.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260922-0534-akn04-automation-summary.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260922-0534-akn04-automation-summary.md`.

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
- Contract file: `tasks/archive/contract-20260923-0319-akn04-automation-summary.md`
- Review file: `tasks/archive/review-20260923-0319-akn04-automation-summary.md`
- Implementation notes file: `tasks/archive/notes-20260923-0319-akn04-automation-summary.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260923-0319-akn04-automation-summary.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260922-0534-akn04-automation-summary.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Remove automation summary and transport revision without stored migration
- **Verification boundary**: Original automation record identity and side-effect-free scoped observation
- **Review/acceptance boundary**: `tasks/archive/review-20260923-0319-akn04-automation-summary.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260922-0534-akn04-automation-summary.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260923-0319-akn04-automation-summary.md`, `tasks/archive/review-20260923-0319-akn04-automation-summary.md`, and `tasks/archive/notes-20260923-0319-akn04-automation-summary.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260923-0319-akn04-automation-summary.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Remove automation summary and transport revision without stored migration

## Captured Planning Output

## Goal
Complete AKN-04d2 repository automation observation using original stored authorities in the existing scoped snapshot. No GET starts, resumes, reconciles, repairs, notifies, acquires or ACKs work.

## Design and P1/P2/P3
P1: controller-store owns run/current/head event; grant-store owns original ProgramAuthorization; budget-store owns folded budget projection; development-campaign-store owns Campaign events; campaign-step owns exact receipt validator. Fleet registry and process lifecycle remain d1 owners.
P2: scoped collector reads strict registry target -> existing Fleet -> selected repository automation readers -> exact registry recheck -> IPC -> server projection -> browser decoder. Four independent source collections (grants, budgets, controllers, campaigns), plus policy and native execution observation, preserve known/missing/unavailable. Controller head is joined against run/current digests and reread; Campaign status reread and exact grants/intent identities joined. Per-source failure exposes portable unavailable with no raw error/path. No source can label a controller state as native execution. Grant expiry and scope are original record facts, not present authorization. Budget metrics/owner/stop refusal come from existing projection without arithmetic recomputation.
P3: all reads occur in d1's process-group/Windows Job slot and deadline, preserving the shared global cap and cancellation/exit boundary. Source count bound64 and response automation bound512KiB refuse oversized observations; deadline already includes queue wait. Source readers remain read-only, including crash projection folding; no store lock helper. At10x history the process deadline or source limit marks unavailability, never synthetic zero budgets or running state. No cache, watcher, persistence, service, dependency or credential added.

Public repository envelope advances protocol1->2 and requires automation summary protocol1. Fleet5/Operator6 unchanged. Start IPC protocol1->2; successful process result includes nullable automation (required null for global, exact selected identity for repository); all package consumers/fixtures switch, no old shape fallback. Preserve epoch/generation. Browser has strict closed decoding for public fields; effects allowlist explicitly, drop raw evidence strings, filesystem paths, Chrome profile, principal credentials and free-text blocker/outcome diagnostics. Keep original typed operation/action and evidence digests; lack of typed reason is unavailable, not parsed from text. Controller source attention owner remains native none/user/operator; budget attention is original projection; no guessed owner translation.

Summary: repository_id, consistency observed, observed_at; policy observed current registered worktree mode with policy value digest; grants collection records id/digest/target ref+revision/work packages/contract scope/expiry/merge mode; budgets collection original metrics/state/current ledger/stop digest and typed refusal/owner; controllers collection run/current/event/budget refs, exact revision/state/operation/time/task/claim/dispatch/runtime-effect refs, original source attention; campaigns collection exact definition/grant/current/event refs plus per-group last receipt action/outcome/time/digest and nullable next_check_at. Discover campaigns through original grants and stored intents, require exact grant definition binding. No global last-decision sort across unrelated authorities; decisions remain bound to each controller/Campaign/group. Native execution/turn refs are unavailable when no native admission authority exists.

Reuse campaign-step receipt parser as exported readCampaignStepReceipts with exact repo/campaign/group/intent input, replacing private call sites, no alternate parser or lock. Add optional env parameter to readAutomationBudgetBoardSlice and thread it to original status reader. No provider/execute functions from GET. New effects suite permitted because repository automation source/join/no-mutation is an independent authority boundary with no existing owner; existing budget/controller/Campaign tests protect owner helpers.

More than8 files: new core/operator/automation-summary.ts and effects/operator/automation-summary.ts; core/operator/repository-snapshot.ts; effects/operator/{fleet-collector-process,server}.ts; operator-web/repository-snapshot.ts; effects/automation/{budget-store,campaign-step}.ts; new tests/effects/operator-automation-summary.test.ts; existing budget/campaign/collector/server/browser suites; docs/researches/20260922-operator-automation-summary.md; own workflow files and deterministic architecture manifest. No UI redesign, runtime install, main merge, new write route or native execution claim.

Verification: real records preserve original refs/metrics/expiry; exact cross-repository/target/digest mismatches fail closed; missing/malformed/oversized stores isolated; current changes cannot form mixed head proof; source reads leave filesystem bytes and lock inventory unchanged; authentic Campaign step reader rejects bad digest without writing; env propagation; scoped HTTP protocol/IPC/browser old-shape rejection and no-store; d1 admission regressions retained. Register targeted tests/type/browser and9 required integrity commands in sole contract Verification Plan. Canonical architecture proof/index authorization remains separate, followed by one independent semantic acceptance and stage PR. Rollback removes summary observation and protocol together, no stored migration.

## Task Breakdown
- [x] Implement strict automation observation DTO and original-authority read effect.
- [x] Integrate versioned scoped IPC/HTTP/browser payload and original read helpers.
- [x] Verify real record joins, read-only behavior and lifecycle; record durable findings.
- [ ] Freeze architecture/canonical evidence, obtain one acceptance and submit stage PR.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

