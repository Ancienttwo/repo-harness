# Plan: Archive Acceptance Authority Canonicalization

> **Status**: Executing
> **Created**: 20260831-0345
> **Slug**: archive-acceptance-authority
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Archive pointer integrity, AcceptanceReceipt identity preservation, and historical re-verification
> **Rollback Surface**: archive workflow output and receipt authority normalization
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260831-0345-archive-acceptance-authority.contract.md`
> **Task Review**: `tasks/reviews/20260831-0345-archive-acceptance-authority.review.md`
> **Implementation Notes**: `tasks/notes/20260831-0345-archive-acceptance-authority.notes.md`

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

- Active plan: `plans/plan-20260831-0345-archive-acceptance-authority.md`
- Sprint contract: `tasks/contracts/20260831-0345-archive-acceptance-authority.contract.md`
- Sprint review: `tasks/reviews/20260831-0345-archive-acceptance-authority.review.md`
- Implementation notes: `tasks/notes/20260831-0345-archive-acceptance-authority.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260831-0345-archive-acceptance-authority.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260831-0345-archive-acceptance-authority.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260831-0345-archive-acceptance-authority.md`.

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
- Contract file: `tasks/contracts/20260831-0345-archive-acceptance-authority.contract.md`
- Review file: `tasks/reviews/20260831-0345-archive-acceptance-authority.review.md`
- Implementation notes file: `tasks/notes/20260831-0345-archive-acceptance-authority.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260831-0345-archive-acceptance-authority.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260831-0345-archive-acceptance-authority.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: archive workflow output and receipt authority normalization
- **Verification boundary**: Archive pointer integrity, AcceptanceReceipt identity preservation, and historical re-verification
- **Review/acceptance boundary**: `tasks/reviews/20260831-0345-archive-acceptance-authority.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260831-0345-archive-acceptance-authority.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260831-0345-archive-acceptance-authority.contract.md`, `tasks/reviews/20260831-0345-archive-acceptance-authority.review.md`, and `tasks/notes/20260831-0345-archive-acceptance-authority.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260831-0345-archive-acceptance-authority.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: archive workflow output and receipt authority normalization

## Captured Planning Output

## Goal

Make archived workflow artifacts self-consistent without invalidating a previously recorded AcceptanceReceipt, then use that formal path to unblock the architecture-projection acceptance branch.

## Decisions

- `scripts/archive-workflow.sh` remains the sole archive mutation authority.
- Every archived plan/contract/review/notes/todo artifact receives one strict versioned archive envelope carrying the exact live-to-archive path projection for the artifact family.
- The archive transaction rewrites only exact paths from that projection; it does not infer missing artifacts or search by slug.
- `scripts/acceptance-receipt.ts` validates the projection shape and reverse-normalizes only those exact rewritten paths before hashing. Existing strict envelopes without a projection remain readable as historical protocol-1 archive output.
- Malformed, duplicate, cross-family, or non-repository projection entries fail closed.
- No automatic semantic acceptance, provider action, or broad historical content rewrite is introduced.

## P1 Architecture Map

- Write boundary: `scripts/archive-workflow.sh` plus its packaged copy.
- Identity boundary: `scripts/acceptance-receipt.ts` plus its packaged copy.
- Verification boundary: `tests/helper-scripts.test.ts`, `tests/acceptance-receipt.test.ts`, archive gate tests, and root Required Checks.
- Workflow authority: this plan, its contract/review/notes, `tasks/todos.md`, and `tasks/current.md`.

## P2 Concrete Trace

An active plan declares contract/review/notes paths. `archive-workflow.sh` resolves those exact files, precomputes collision-safe destinations, writes a versioned projection, replaces the exact live paths in every artifact body, and moves the family transactionally. Later `verifyAcceptance()` resolves the archived contract/plan, parses the same projection, reverses only the declared destination paths, normalizes lifecycle headers, and compares the original authority fingerprints. A malformed projection stops before receipt validation.

## P3 Decision Rationale

The current five-line envelope preserves bytes but leaves pointers dangling. Blind pointer rewriting breaks receipt identity. A versioned exact projection is the smallest cross-boundary contract that lets readers distinguish an authorized lifecycle rewrite from a semantic edit. At 10x archive volume, receipt resolution still scans tracked archives as today; the first scaling limit remains that existing scan, not the projection parser.

## Task Breakdown

- [x] Capture and activate the exact work-package contract.
- [x] Implement transactional exact path projection and pointer rewriting in source/template archive helpers.
- [x] Implement fail-closed AcceptanceReceipt reverse normalization in source/template helpers.
- [x] Add positive identity, dangling-pointer, malformed-map, collision and historical-envelope regression coverage.
- [ ] Synchronize workflow artifacts, close the deferred Todo, and run all Required Checks plus final review/acceptance.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture and activate the exact work-package contract.
- [x] Implement transactional exact path projection and pointer rewriting in source/template archive helpers.
- [x] Implement fail-closed AcceptanceReceipt reverse normalization in source/template helpers.
- [x] Add positive identity, dangling-pointer, malformed-map, collision and historical-envelope regression coverage.
- [ ] Synchronize workflow artifacts, close the deferred Todo, and run all Required Checks plus final review/acceptance.
