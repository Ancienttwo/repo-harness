> **Archived**: 2026-09-22 02:24
> **Related Plan**: plans/archive/plan-20260922-0151-akn03-reply-inventory.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260922-0224
> **Archive Projection V1**: `plans/plan-20260922-0151-akn03-reply-inventory.md` => `plans/archive/plan-20260922-0151-akn03-reply-inventory.md`
> **Archive Projection V1**: `tasks/notes/20260922-0151-akn03-reply-inventory.notes.md` => `tasks/archive/notes-20260922-0224-akn03-reply-inventory.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0151-akn03-reply-inventory.contract.md` => `tasks/archive/contract-20260922-0224-akn03-reply-inventory.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0151-akn03-reply-inventory.review.md` => `tasks/archive/review-20260922-0224-akn03-reply-inventory.md`

# Plan: AKN-03a: close reply protocol inventory integration gap

> **Status**: Archived
> **Created**: 20260922-0151
> **Slug**: akn03-reply-inventory
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: https://github.com/Ancienttwo/repo-harness/pull/435
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Existing closed protocol scan plus reply regression and repository integrity
> **Rollback Surface**: Revert explicit test inventory and documentation only
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260922-0224-akn03-reply-inventory.md`
> **Task Review**: `tasks/archive/review-20260922-0224-akn03-reply-inventory.md`
> **Implementation Notes**: `tasks/archive/notes-20260922-0224-akn03-reply-inventory.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: https://github.com/Ancienttwo/repo-harness/pull/435
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260922-0151-akn03-reply-inventory.md`
- Sprint contract: `tasks/archive/contract-20260922-0224-akn03-reply-inventory.md`
- Sprint review: `tasks/archive/review-20260922-0224-akn03-reply-inventory.md`
- Implementation notes: `tasks/archive/notes-20260922-0224-akn03-reply-inventory.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260922-0224-akn03-reply-inventory.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260922-0151-akn03-reply-inventory.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260922-0151-akn03-reply-inventory.md`.

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
- Contract file: `tasks/archive/contract-20260922-0224-akn03-reply-inventory.md`
- Review file: `tasks/archive/review-20260922-0224-akn03-reply-inventory.md`
- Implementation notes file: `tasks/archive/notes-20260922-0224-akn03-reply-inventory.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260922-0224-akn03-reply-inventory.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260922-0151-akn03-reply-inventory.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert explicit test inventory and documentation only
- **Verification boundary**: Existing closed protocol scan plus reply regression and repository integrity
- **Review/acceptance boundary**: `tasks/archive/review-20260922-0224-akn03-reply-inventory.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260922-0151-akn03-reply-inventory.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260922-0224-akn03-reply-inventory.md`, `tasks/archive/review-20260922-0224-akn03-reply-inventory.md`, and `tasks/archive/notes-20260922-0224-akn03-reply-inventory.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260922-0224-akn03-reply-inventory.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert explicit test inventory and documentation only

## Captured Planning Output

## Scope and evidence
Repair PR #435's observed C1 closed inclusion failure. Hosted run 35632845018 and a local run of tests/unit/collaboration-authority-baseline.test.ts both report 18 passes / 1 failure because src/core/fleet/task-reply.ts has no adjudicated entry. The reply implementation has already passed its independent review; this follow-up covers the missing integration guard and final whole-branch verification.

## P1 — Map
The existing collaboration-authority-baseline test dynamically imports src/core modules and compares every *_PROTOCOL owner against AUTHORITY_SOURCE_MODULES plus DELIBERATELY_EXCLUDED. The C0 freeze document owns the inclusion criterion and post-freeze adjudication. Both clauses must hold to enter the five-plane delivery authority inventory. Existing TaskInbox message protocols are communication, not work ownership or acceptance.

## P2 — Trace
Adding TASK_REPLY_PROTOCOL makes the new module appear in protocolOwningModules; the closed equality fails before any runtime integration. task-reply only validates snapshots and message integrity and has no production consumer. Its intent/commit do not create Task, Claim, Lease, Publication, Acceptance or Delegation facts. A complete chain remains structural, not authenticated or accepted work.

## P3 — Decision
Record task-reply as excluded under C-1 (messaging/reply provenance plane) and C-2 (pure structural records do not decide ownership/publication/acceptance and currently have no production consumers). Add matching rationale to the post-freeze additions table, preserving historical counts and frozen inventory digest. Do not weaken the scan or change production protocol. Include the existing closed-scan test in final verification alongside the already covered reply/message tests. Existing checks apply; no new test file or full local suite. At 10x modules this existing scan remains linear; this edit adds one explicit classification only.

## File changes
- tests/unit/collaboration-authority-baseline.test.ts: one adjudicated exclusion, keeping closed inclusion assertion.
- docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md: corresponding post-freeze row.
- docs/researches/20260922-task-reply-protocol.md: document the existing authority boundary and guard.
- Own workflow artifacts and generated architecture projection manifest.

## Task Breakdown
- [x] Register matching closed-scan adjudication and durable rationale without changing the frozen authority digest.
- [x] Verify the existing failing scan, reply/message tests and required repository checks; review the changed semantic subject.


## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Register matching closed-scan adjudication and durable rationale without changing the frozen authority digest.
- [x] Verify the existing failing scan, reply/message tests and required repository checks; review the changed semantic subject.

