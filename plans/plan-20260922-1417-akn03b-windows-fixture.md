# Plan: AKN-03b Windows HTTP fixture correction

> **Status**: Executing
> **Created**: 20260922-1417
> **Slug**: akn03b-windows-fixture
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Windows MCP HTTP fixture and unchanged authenticated transport assertions
> **Rollback Surface**: One fixture-only correction to PR 437
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-1417-akn03b-windows-fixture.contract.md`
> **Task Review**: `tasks/reviews/20260922-1417-akn03b-windows-fixture.review.md`
> **Implementation Notes**: `tasks/notes/20260922-1417-akn03b-windows-fixture.notes.md`

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

- Active plan: `plans/plan-20260922-1417-akn03b-windows-fixture.md`
- Sprint contract: `tasks/contracts/20260922-1417-akn03b-windows-fixture.contract.md`
- Sprint review: `tasks/reviews/20260922-1417-akn03b-windows-fixture.review.md`
- Implementation notes: `tasks/notes/20260922-1417-akn03b-windows-fixture.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-1417-akn03b-windows-fixture.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-1417-akn03b-windows-fixture.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-1417-akn03b-windows-fixture.md`.

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
- Contract file: `tasks/contracts/20260922-1417-akn03b-windows-fixture.contract.md`
- Review file: `tasks/reviews/20260922-1417-akn03b-windows-fixture.review.md`
- Implementation notes file: `tasks/notes/20260922-1417-akn03b-windows-fixture.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-1417-akn03b-windows-fixture.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-1417-akn03b-windows-fixture.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: One fixture-only correction to PR 437
- **Verification boundary**: Windows MCP HTTP fixture and unchanged authenticated transport assertions
- **Review/acceptance boundary**: `tasks/reviews/20260922-1417-akn03b-windows-fixture.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-1417-akn03b-windows-fixture.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-1417-akn03b-windows-fixture.contract.md`, `tasks/reviews/20260922-1417-akn03b-windows-fixture.review.md`, and `tasks/notes/20260922-1417-akn03b-windows-fixture.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-1417-akn03b-windows-fixture.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: One fixture-only correction to PR 437

## Captured Planning Output

## Goal

Repair the AKN-03b Windows MCP HTTP fixture failure on PR #437 without weakening production Binding or principal-store durability. Update that PR after current verification and one semantic acceptance.

## Scope

Only tests/cli/mcp-http.test.ts, the existing Task reply research document, generated architecture manifest and this package workflow artifacts. Reuse the current isolated codex/akn03-protected-replies worktree. No production behavior changes, merge, runtime installation or new indexing scope.

## P1 / P2 / P3

The real Windows job 106634890098 in run 35693364932 fails at tests/cli/mcp-http.test.ts:1107 -> bindEngineer -> withEngineerLock -> ensureSafeDirectory -> fsyncDirectory with EPERM. The HTTP test verifies OAuth request identity and closed tools, not writer durability. Seed canonical Binding event/current and principal mapping bytes with their existing validated core constructors, then exercise the unchanged production HTTP/reader path. Keep the fsync writers unchanged. At scale fixture setup cost is bounded; no production performance change is claimed.

## Task Breakdown

- [ ] Replace only the HTTP fixture writer setup and retain all existing authenticated HTTP assertions.
- [ ] Run focused HTTP/type and required integrity checks, obtain one semantic acceptance, update PR #437 and inspect Windows CI.

## Verification

Existing tests/cli/mcp-http.test.ts is the regression guard; hosted Windows failure is the pre-fix evidence. Run it locally and require the actual Windows job to pass before calling Windows acceptance complete. No full suite and no platform skip.

## Rollback

Revert this fixture-only correction as one commit; prior source semantics and durable records remain untouched.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Replace only the HTTP fixture writer setup and retain all existing authenticated HTTP assertions.
- [ ] Run focused HTTP/type and required integrity checks, obtain one semantic acceptance, update PR #437 and inspect Windows CI.
