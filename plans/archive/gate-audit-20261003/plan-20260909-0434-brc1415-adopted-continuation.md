# Plan: BRC14 BRC15 adopted Issue continuation

> **Status**: Executing
> **Created**: 20260909-0434
> **Slug**: brc1415-adopted-continuation
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260909-0434-brc1415-adopted-continuation.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260909-0434-brc1415-adopted-continuation.md`; after execution revert branch `codex/brc1415-adopted-continuation` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260909-0434-brc1415-adopted-continuation.contract.md`
> **Task Review**: `tasks/reviews/20260909-0434-brc1415-adopted-continuation.review.md`
> **Implementation Notes**: `tasks/notes/20260909-0434-brc1415-adopted-continuation.notes.md`

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

- Active plan: `plans/plan-20260909-0434-brc1415-adopted-continuation.md`
- Sprint contract: `tasks/contracts/20260909-0434-brc1415-adopted-continuation.contract.md`
- Sprint review: `tasks/reviews/20260909-0434-brc1415-adopted-continuation.review.md`
- Implementation notes: `tasks/notes/20260909-0434-brc1415-adopted-continuation.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260909-0434-brc1415-adopted-continuation.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260909-0434-brc1415-adopted-continuation.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260909-0434-brc1415-adopted-continuation.md`.

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
- Contract file: `tasks/contracts/20260909-0434-brc1415-adopted-continuation.contract.md`
- Review file: `tasks/reviews/20260909-0434-brc1415-adopted-continuation.review.md`
- Implementation notes file: `tasks/notes/20260909-0434-brc1415-adopted-continuation.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260909-0434-brc1415-adopted-continuation.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260909-0434-brc1415-adopted-continuation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260909-0434-brc1415-adopted-continuation.md`; after execution revert branch `codex/brc1415-adopted-continuation` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260909-0434-brc1415-adopted-continuation.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260909-0434-brc1415-adopted-continuation.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260909-0434-brc1415-adopted-continuation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260909-0434-brc1415-adopted-continuation.contract.md`, `tasks/reviews/20260909-0434-brc1415-adopted-continuation.review.md`, and `tasks/notes/20260909-0434-brc1415-adopted-continuation.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260909-0434-brc1415-adopted-continuation.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260909-0434-brc1415-adopted-continuation.md`; after execution revert branch `codex/brc1415-adopted-continuation` or the explicitly reviewed diff.

## Captured Planning Output

## Approved implementation
User approved the next slice after PR371: continue the existing adopted two Issues under new authorization; preserve the stopped predecessor and do not recreate the batch.

P1: gpt-pro-issue-authoring owns resume-from and verified source sessions; issue-batch-store owns immutable intents/adoption artifacts; budget-store folds consumed/open usage; publication binds canonical immutable manifests. Planning/acquisition/runtime continue to use their existing campaign/intent authority.
P2: new authorized campaign -> active protection/revision preflight -> resume-from source validation -> fresh authoring for exact old Issue IDs -> canonical observation/challenge/adoption -> existing planning/acquire/delivery. Current source guard rejects any publication and requires budget_exhausted despite campaign stopped being terminal.
P3: extend only the existing resume-from entry for a stopped adopted predecessor with zero acquisitions and no outstanding reservations/controller step. Validate old adoption with the actual builder, exact published manifest/ancestry and exact slot/Issue identities. Bind one successor immutably before provider dispatch, reuse on identical retry, reject conflicting successor. Source sessions and grants are not rewritten or relabeled. New evidence and normal challenge/adoption remain mandatory.

No new CLI, schema fallback, runner, service, dependency or budget authority. New named immutable continuation artifact is owned by issue-batch-store and exists solely to prevent concurrent successors. Do not resume an acquired/unknown/active predecessor. Do not change Oracle, Docker supervision, off defaults, merge mode or old negative outcomes.

Implementation surfaces: gpt-pro-issue-authoring.ts, issue-batch-store.ts, focused authoring/adoption regression tests and owning documentation/workflow artifacts. Reuse publication validation where available rather than inventing provider semantics.

Verification: genuine store/fake provider happy path from published stopped source through fresh authoring and actual adoption; reject active source, acquisitions, pending usage, tampered publication, mismatched Issue IDs, wrong scope and conflicting successor before calls. Preserve existing pre-adoption resume regression. Typecheck plus six root required integrity checks; no local full suite. Freeze source for independent check and final acceptance, required remote CI, PR/merge/readback.

Rollback: revert source before any live continuation; after a continuation record exists preserve it and all old artifacts, never release it to replay a possibly sent request. At10x records this remains a bounded two-slot/maximum10-slot operation; Git manifest reads and budget folding retain existing costs.

Real follow-through after source acceptance: freeze target protection configuration, source/Oracle/profile/image/deadline and new finite budget including revision, authoring, challenge, reads, worker/verifier/cleanup and one fresh audit. Revalidate only Issues177/178, no new batch or local authored Issue bodies. At least one real delivery then same group-end audit is required for BRC14/15. Unknown responses reconcile original key; no automatic new campaign or budget extensions. Old stopped grants remain stopped.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: BRC14 BRC15 adopted Issue continuation
