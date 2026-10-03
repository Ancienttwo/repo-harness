# Plan: Controlled replacement of a stopped never-adopted successor campaign

> **Status**: Approved
> **Created**: 20260909-1909
> **Slug**: campaign-successor-replacement
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Model-free resume/adoption/transition regression plus Required CI before any real continuation
> **Rollback Surface**: Revert the replacement artifact, resolver, eligibility check, prepare-resume CLI and start_group guard in one PR
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260909-1909-campaign-successor-replacement.contract.md`
> **Task Review**: `tasks/reviews/20260909-1909-campaign-successor-replacement.review.md`
> **Implementation Notes**: `tasks/notes/20260909-1909-campaign-successor-replacement.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260909-1909-campaign-successor-replacement.md`
- Sprint contract: `tasks/contracts/20260909-1909-campaign-successor-replacement.contract.md`
- Sprint review: `tasks/reviews/20260909-1909-campaign-successor-replacement.review.md`
- Implementation notes: `tasks/notes/20260909-1909-campaign-successor-replacement.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260909-1909-campaign-successor-replacement.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260909-1909-campaign-successor-replacement.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260909-1909-campaign-successor-replacement.md`.

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
- Contract file: `tasks/contracts/20260909-1909-campaign-successor-replacement.contract.md`
- Review file: `tasks/reviews/20260909-1909-campaign-successor-replacement.review.md`
- Implementation notes file: `tasks/notes/20260909-1909-campaign-successor-replacement.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260909-1909-campaign-successor-replacement.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260909-1909-campaign-successor-replacement.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the replacement artifact, resolver, eligibility check, prepare-resume CLI and start_group guard in one PR
- **Verification boundary**: Model-free resume/adoption/transition regression plus Required CI before any real continuation
- **Review/acceptance boundary**: `tasks/reviews/20260909-1909-campaign-successor-replacement.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260909-1909-campaign-successor-replacement.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260909-1909-campaign-successor-replacement.contract.md`, `tasks/reviews/20260909-1909-campaign-successor-replacement.review.md`, and `tasks/notes/20260909-1909-campaign-successor-replacement.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260909-1909-campaign-successor-replacement.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the replacement artifact, resolver, eligibility check, prepare-resume CLI and start_group guard in one PR

## Captured Planning Output

P1: Resume/continuation authority lives in src/effects/automation/campaign-authoring-resume.ts (validateAdoptedResumeSource, bindAdoptedResume, assertResumedAdoption), gpt-pro-issue-authoring.ts (resumeAuthoringAction, previous_marker at :254, bind at :285 before provider dispatch at :204), issue-batch-store.ts (immutable artifacts + group lock), campaign-fresh-audit.ts requireCampaignGroupTransition (start_group excluded today at :114), development-campaign-store.ts appendLocked (:311 guard seam after CAS, before writes), budget-store.ts (one run per campaign id). Adopt publishes a candidate ref only; the human merge moves the target tip.
P2: A new successor resuming from a predecessor whose continuation is already bound to a stopped, never-adopted successor fails at campaign-authoring-resume.ts:56 -> issue-batch-store.ts:64 issue_batch_conflict after intent.json and resume-source.json were already written for the new campaign id. previous_marker is rendered from the resume source, so resuming from delivery demands the stale delivery marker although remote #177/#178 carry the packaged-delivery marker. Field state: packaged-delivery stopped from group_running, 3 provider calls, no adoption/publication, open=[], active_step null.
P3: Add a typed superseded-<intent> replacement artifact on the predecessor (history preserved, continuation never rewritten), one resolveEffectiveContinuation used by both binder and adoption checker, a zero-write canonical-store eligibility check (assertReplaceableStoppedSuccessor) invoked inside resumeAuthoringAction before any write or dispatch, an evidence-bounded previous_markers set carrying the last confirmed remote modification separately from Issue identity, a `campaign prepare-resume` CLI that emits the resume request from canonical stores, and a start_group guard in requireCampaignGroupTransition that rejects gpt_pro groups lacking adoption+publication with state unchanged. Full design: /tmp/brc-successor/design.md; owner contract: /tmp/brc-successor/owner-spec.md.
Acceptance: model-free regression covering real failure shape -> replacement -> adoption; rejection boundary; atomicity/retry; ordering and ledger; existing resume rejections stay green; repository-integrity checks; Required / CI on the final candidate. No real model call to validate the patch.

## Annotations

None; the captured planning output plus the linked design and owner contract are decision-complete.

## Task Breakdown
- [ ] Execute captured plan: Controlled replacement of a stopped never-adopted successor campaign
