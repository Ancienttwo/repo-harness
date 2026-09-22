# Plan: AKN-03b Windows principal fixture identity

> **Status**: Executing
> **Created**: 20260922-1548
> **Slug**: akn03b-windows-identity
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Current Windows mapped Engineer HTTP assertion
> **Rollback Surface**: Diagnostic and fixture-only E2E changes on PR437
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-1548-akn03b-windows-identity.contract.md`
> **Task Review**: `tasks/reviews/20260922-1548-akn03b-windows-identity.review.md`
> **Implementation Notes**: `tasks/notes/20260922-1548-akn03b-windows-identity.notes.md`

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

- Active plan: `plans/plan-20260922-1548-akn03b-windows-identity.md`
- Sprint contract: `tasks/contracts/20260922-1548-akn03b-windows-identity.contract.md`
- Sprint review: `tasks/reviews/20260922-1548-akn03b-windows-identity.review.md`
- Implementation notes: `tasks/notes/20260922-1548-akn03b-windows-identity.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-1548-akn03b-windows-identity.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-1548-akn03b-windows-identity.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-1548-akn03b-windows-identity.md`.

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
- Contract file: `tasks/contracts/20260922-1548-akn03b-windows-identity.contract.md`
- Review file: `tasks/reviews/20260922-1548-akn03b-windows-identity.review.md`
- Implementation notes file: `tasks/notes/20260922-1548-akn03b-windows-identity.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-1548-akn03b-windows-identity.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-1548-akn03b-windows-identity.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Diagnostic and fixture-only E2E changes on PR437
- **Verification boundary**: Current Windows mapped Engineer HTTP assertion
- **Review/acceptance boundary**: `tasks/reviews/20260922-1548-akn03b-windows-identity.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-1548-akn03b-windows-identity.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-1548-akn03b-windows-identity.contract.md`, `tasks/reviews/20260922-1548-akn03b-windows-identity.review.md`, and `tasks/notes/20260922-1548-akn03b-windows-identity.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-1548-akn03b-windows-identity.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Diagnostic and fixture-only E2E changes on PR437

## Captured Planning Output

P1: The current PR #437 Windows MCP job returns engineer_principal_unmapped at the successful mapped-status assertion. The protected resolver returns this only when its repository/authorization lookup finds no mapping. Parent fixture hashes its realpath root; the server uses git root then realpath. Principal home is inherited through a spawned Bun process.
P2: Trace the same issued token and fixture root through the parent store, server-equivalent repo resolver, a fresh child process, and HTTP. Preserve the real mapped success, session isolation and authorization rejection assertions. The two Windows attempts at head769c065c failed; no guess about path or filesystem visibility is a confirmed cause.
P3: Add narrow non-secret identity assertions to the existing E2E fixture to distinguish repo-id, registry-root and child visibility. Publish this diagnostic candidate to the existing PR for Windows evidence. Fix only a confirmed fixture mismatch, retain the production principal authority and filesystem durability policy. If the source owner is product-wide canonicalization, stop rather than expanding this verification package.
Allowed implementation paths: tests/cli/mcp-http.test.ts, docs/researches/20260922-task-reply-protocol.md and this package's plan/contract/review/notes. Root integrity checks, focused existing HTTP test and installed-package smoke are the Verification Plan. Windows CI at the diagnostic head is a required artifact, not a local pass. No main merge, global installation, Host admission, Campaign or real canary.
- [ ] Diagnose the parent and child principal mapping identities on Windows using the existing E2E.
- [ ] Correct only the proven fixture cause, with the failing run retained as regression evidence.
- [ ] Freeze source, verify focused and repository checks, and record exact acceptance without replacing earlier receipts.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Diagnose the parent and child principal mapping identities on Windows using the existing E2E.
- [ ] Correct only the proven fixture cause, with the failing run retained as regression evidence.
- [ ] Freeze source, verify focused and repository checks, and record exact acceptance without replacing earlier receipts.
