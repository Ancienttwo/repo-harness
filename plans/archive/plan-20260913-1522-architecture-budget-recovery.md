> **Archived**: 2026-09-14 10:34
> **Related Plan**: plans/archive/plan-20260913-1522-architecture-budget-recovery.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260914-1034
> **Archive Projection V1**: `plans/plan-20260913-1522-architecture-budget-recovery.md` => `plans/archive/plan-20260913-1522-architecture-budget-recovery.md`
> **Archive Projection V1**: `tasks/notes/20260913-1522-architecture-budget-recovery.notes.md` => `tasks/archive/notes-20260914-1034-architecture-budget-recovery.md`
> **Archive Projection V1**: `tasks/contracts/20260913-1522-architecture-budget-recovery.contract.md` => `tasks/archive/contract-20260914-1034-architecture-budget-recovery.md`
> **Archive Projection V1**: `tasks/reviews/20260913-1522-architecture-budget-recovery.review.md` => `tasks/archive/review-20260914-1034-architecture-budget-recovery.md`

# Plan: Restore architecture work budgets and resumable delivery

> **Status**: Archived
> **Created**: 20260913-1522
> **Slug**: architecture-budget-recovery
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Clock regressions plus frozen real-provider backlog and recommendation readback
> **Rollback Surface**: Revert the isolated timing-policy patch; preserve queue receipts and runtime configuration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260914-1034-architecture-budget-recovery.md`
> **Task Review**: `tasks/archive/review-20260914-1034-architecture-budget-recovery.md`
> **Implementation Notes**: `tasks/archive/notes-20260914-1034-architecture-budget-recovery.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260913-1522-architecture-budget-recovery.md`
- Sprint contract: `tasks/archive/contract-20260914-1034-architecture-budget-recovery.md`
- Sprint review: `tasks/archive/review-20260914-1034-architecture-budget-recovery.md`
- Implementation notes: `tasks/archive/notes-20260914-1034-architecture-budget-recovery.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260914-1034-architecture-budget-recovery.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260913-1522-architecture-budget-recovery.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260913-1522-architecture-budget-recovery.md`.

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
- Contract file: `tasks/archive/contract-20260914-1034-architecture-budget-recovery.md`
- Review file: `tasks/archive/review-20260914-1034-architecture-budget-recovery.md`
- Implementation notes file: `tasks/archive/notes-20260914-1034-architecture-budget-recovery.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260914-1034-architecture-budget-recovery.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260913-1522-architecture-budget-recovery.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the isolated timing-policy patch; preserve queue receipts and runtime configuration
- **Verification boundary**: Clock regressions plus frozen real-provider backlog and recommendation readback
- **Review/acceptance boundary**: `tasks/archive/review-20260914-1034-architecture-budget-recovery.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260913-1522-architecture-budget-recovery.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260914-1034-architecture-budget-recovery.md`, `tasks/archive/review-20260914-1034-architecture-budget-recovery.md`, and `tasks/archive/notes-20260914-1034-architecture-budget-recovery.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260914-1034-architecture-budget-recovery.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the isolated timing-policy patch; preserve queue receipts and runtime configuration

## Captured Planning Output

## Goal and approved boundary
Restore bounded automatic architecture projection and measured refactor observation on the installed runtime. The user approved the prior audit's budget-and-resumption slice. The initial audit sought a valid recommendation/no-action readback. After observing proof_required, the user approved delivery of the bounded scheduling/timeout and unmapped-context repairs while keeping code-fact/model completion outside this package. Acceptance requires consumed pending work, bounded and truthful recommendation readback (including proof_required), no automatic refactor, and no fabricated architecture authority.

## P1 Map
The user-level managed Stop.default adapter allows 150 seconds. src/cli/hook/stop-handler.ts currently supplies one 20-second deadline to projection, journal work and recommendation observation. The global architecture policy owns a separate provider timeout (120 seconds here). Projection jobs/receipts/cursor own at-least-once resume. src/effects/refactor/recommendations.ts performs a package-local deterministic scan followed by recommendation lifecycle readback within a 10-second deadline. ArchContext remains semantic authority.

## P2 Trace and root cause
A 224-path drift batch enters Stop -> drainArchitectureProjectionJobs -> provider -> refresh receipts -> cursor acknowledgement. The host deadline expires before this chain completes, retaining a pending job with host-budget and no acknowledgement. At finishWithRecommendations, less than 10 seconds remain, so observation is deferred. The standalone recommendation command also times out because scan and book readback together exceed 10 seconds. Live baseline: projection check 23.6 seconds/planned, recommendation readback 10.79 seconds/unavailable. A subsequent 30-second observation reached 16.55 seconds before detecting concurrent worktree drift, so frozen-repository validation is required.

## P3 Decision
Keep the existing managed 150-second host timeout, original queue/receipt/cursor machinery, explicit operator drain and 20-second entry-anchored journal budget. Add one shared pure timing policy consumed by the installer and runtime: 140-second Stop work deadline, 30-second recommendation allowance, and an architecture deadline at 110 seconds (the provider's configured shorter limit still applies). Recommendation observation uses the lesser of its 30-second allowance and the remaining caller deadline; defer only when no caller time remains, and make budget deferral visible. Reserve the existing host's final 10 seconds for output/host overhead. Preserve cooldown, deduplication, evidence gates and explicit user approval for any refactor. No new process, background daemon, queue authority, provider setting or compatibility path.

Tradeoff: Stop may spend more time on real pending architecture work, but remains bounded under the already installed host limit. At 10x repository size the first failure is the bounded provider attempt; pending job and cursor remain intact for the existing explicit drain, never false success. Only one directly blocking out-of-scope defect may be handled if a frozen live canary proves it (the previously isolated synthetic-root capability request fix); a second is a hard stop.

## Scope and files
src/core/hook-work-budget.ts; src/cli/installer/managed-entries.ts; src/cli/hook/stop-handler.ts; src/effects/refactor/recommendations.ts; existing tests/stop-handler.test.ts, tests/unit/refactor-recommendations.test.ts and tests/architecture-projection-orchestration.test.ts; docs/spec.md; docs/researches/20260913-architecture-budget-recovery.md; tasks/lessons.md and this task's plan/contract/notes/review. Generated architecture outputs are written only by the provider during verification. Preserve unrelated main WIP and other worktrees. Do not publish an npm release or start paid/model traffic.

## Verification and delivery
Create a contract worktree; prove regression failures with the old source and injected clocks, then implement. Verify explicit deadlines, 23.6-second projection followed by >10-second observation, exhausted budget visibility, unchanged journal budget and queue cursor on retry, bounded scan/lifecycle reading, cooldown and no automatic refactoring. Run only the focused existing tests, typecheck, and root Required Checks. Build the hook bundle and run a frozen disposable real-repository canary through the candidate entrypoint; preserve and consume a copy of the observed pending queue before touching the live source queue. Then perform bounded authorized live recovery using the validated candidate, with exact before/after queue and document evidence. No hosted-CI or installed-global claim without actual readback. Finish the task through the repository's check/contract-worktree boundary; installation/publication is distinct from local evidence.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze the contract, isolate the worktree and capture failing budget regression evidence.
- [x] Implement shared bounded deadlines and visible recommendation deferral; preserve all resume and observation invariants.
- [x] Run focused checks and a frozen real-provider canary; resolve at most one proven directly blocking defect.
- [ ] Complete source delivery and cleanup under the owner-approved scope amendment below; retain runtime acceptance gaps as deferred work.

## Current delivery boundary

Budget code and focused verification are complete. End-to-end acceptance remains incomplete: live drain returned idle with one pending job, and recommendations returned proof_required. See docs/researches/20260913-architecture-budget-recovery.md for ownership and evidence. No commit, merge, global install or AcceptanceReceipt has been produced.

## Approved continuation: pending drain ordering

The user approved the bounded repo-harness pending-drain fix after the ownership report. Add `src/effects/architecture/projection-orchestrator.ts` to this existing work-package; do not start another parallel authority. This approval supersedes the earlier stop for this issue only. Recommendation model/code-fact completeness remains outside scope.

P1: Stop and explicit drain share `drainArchitectureProjectionJobs`; the jobs module owns locked claiming and durable retries/receipts. P2: a projection-owned current event reaches the eligible-empty early return before a previously queued source job can be claimed. P3: let empty eligible input suppress enqueue without suppressing the existing locked claim; preserve no-work acknowledgement, failures, source identities and provider boundaries. At 10x backlog the existing one-job-per-drain budget still bounds progress; no new loop or daemon.

- [x] Prove the owned-only pending starvation and failed-attempt acknowledgement regression on the unfixed source.
- [x] Repair claim ordering, run focused and required checks, and inspect the changed boundary.
- [x] Validate a copied live job before authorized live drain; record exact queue and receipt readback.

## Owner scope amendment — 2026-09-13

The owner explicitly approved: “合并现有代码，保留运行时缺口”. This delivery accepts the existing bounded timing implementation and the independently verified unmapped-event repair into main, then removes their worktrees. Live queue completion and complete recommendation proof are deferred, not passed or waived as successful runtime outcomes. The canonical budget checks remain required; include the unmapped command and cascade regressions in the final candidate checks. No release, global installation, provider change or further runtime repair is included.

## Continuation result

Pending drain ordering is repaired and the observed live job completed with an applied receipt; queue pending/running/dead-letter are all zero. See the research report for canonical-check failures and successful isolated followups. The queue delta remains uncommitted; broader semantic acceptance, global installation and recommendation proof completeness remain open.

## Approved local delivery

The user approved merge acceptance and machine-local installation after the queue recovery report. The publication scope is the existing combined budget, confirmed-unmapped and pending-drain repair. Recommendation model/code-fact completeness stays deferred, as explicitly reported before approval. No npm publish, tag or remote push is part of this approval. Preserve main's existing generated document/archive changes; do not use a dirty-target bypass.

## Blocking review correction

Official codex-plugin semantic review found loss of unattempted journal effects when the retained 20-second journal ceiling expired after projection. The directly blocking correction retains such events for the next pass in `src/cli/hook/mutation-observed.ts`; existing Stop regression cases prove pre-fix failure and fresh-budget recovery. This preserves the planned journal ceiling and existing attempted-failure semantics. Merge and installation remain pending explicit owner acceptance after fresh verification; the work-package's one semantic review was consumed by the reject.
