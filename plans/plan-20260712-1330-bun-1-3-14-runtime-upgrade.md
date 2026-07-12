# Plan: Upgrade repository Bun baseline to 1.3.14

> **Status**: Executing
> **Created**: 20260712-1330
> **Slug**: bun-1-3-14-runtime-upgrade
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Bun 1.3.14 full-suite and cross-platform CI behavior
> **Rollback Surface**: revert this PR to restore the 1.3.10 CI pin and prior buffered output behavior
> **Task Profile**: code-change
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260712-1330-bun-1-3-14-runtime-upgrade.contract.md`
> **Task Review**: `tasks/reviews/20260712-1330-bun-1-3-14-runtime-upgrade.review.md`
> **Implementation Notes**: `tasks/notes/20260712-1330-bun-1-3-14-runtime-upgrade.notes.md`

## Agentic Routing
- Selected route: direct bounded runtime upgrade
- Routing reason: one CI baseline plus one cross-runtime output invariant; no independent research workstream required
- Due diligence:
  - P1 map: `.github/workflows/ci.yml` owns hosted Bun selection; `scripts/architecture-event.ts` and its template own generated architecture JSON; `src/cli/hook-entry.ts` and hook runtime own hook stdout/stderr delivery.
  - P2 trace: Bun 1.3.14 executes `architecture-event event-json`; buffered stdout followed by immediate `process.exit` emits 512 bytes, the shell adapter passes invalid JSON to `upsert-request`, and architecture/hook tests fail.
  - P3 decision rationale: pin hosted CI to 1.3.14 and make only exit-adjacent output synchronous; preserve CLI contracts, schemas, and package compatibility floor.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md`
- Sprint contract: `tasks/contracts/20260712-1330-bun-1-3-14-runtime-upgrade.contract.md`
- Sprint review: `tasks/reviews/20260712-1330-bun-1-3-14-runtime-upgrade.review.md`
- Implementation notes: `tasks/notes/20260712-1330-bun-1-3-14-runtime-upgrade.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260712-1330-bun-1-3-14-runtime-upgrade.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md`.

## Approach
### Strategy
Upgrade both hosted Bun setup points to 1.3.14, synchronize the documented current
runtime truth, and replace exit-adjacent buffered writes with synchronous descriptor
writes so all bytes are committed before process termination.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Keep 1.3.10 | No runtime migration | Leaves repository behind current stable Bun | Reject |
| Pin 1.3.14 only | Small diff | Known JSON and hook output truncation | Reject |
| Pin 1.3.14 plus synchronous exit-boundary writes | Current stable CI with deterministic output | Touches runtime plumbing | Choose |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/ci.yml` | Update | Pin test and MCP matrix to Bun 1.3.14. |
| `scripts/architecture-event.ts` | Update | Synchronously emit complete JSON before exit. |
| `assets/templates/helpers/architecture-event.ts` | Update | Keep downstream helper projection byte-aligned. |
| `src/cli/hook-entry.ts` | Update | Synchronously emit hook CLI result streams before exit. |
| `src/cli/hook/runtime.ts` | Update | Preserve hook child output synchronously across the parent exit boundary. |
| `src/cli/index.ts` | Update | Apply the same invariant to full-CLI hidden hook commands. |
| `docs/researches/repo-harness 钩子时延与 LLM 提供商限流归因研究报告.md` | Update | Record the current CI Bun pin. |

### Code Snippets
No public API or schema changes.

### Data Flow
command result -> synchronous fd 1/fd 2 write -> process exit -> complete caller payload.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Output truncation persists on 1.3.14 | Medium | High | Direct byte-count repro plus architecture/hook/full-suite tests. |
| Helper source/template drift | Medium | Medium | `sync-helper-sources --check`. |
| Cross-platform MCP regression | Low | High | Keep existing macOS/Linux/Windows matrix on the same exact pin. |

## Task Contracts
- Contract file: `tasks/contracts/20260712-1330-bun-1-3-14-runtime-upgrade.contract.md`
- Review file: `tasks/reviews/20260712-1330-bun-1-3-14-runtime-upgrade.review.md`
- Implementation notes file: `tasks/notes/20260712-1330-bun-1-3-14-runtime-upgrade.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260712-1330-bun-1-3-14-runtime-upgrade.contract.md --strict`
- Active plan rule: `.ai/harness/active-plan` is authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Bun pin and output-flush compatibility form one independently reviewable PR.
- **Rollback surface**: revert the PR; no state or data migration exists.
- **Verification boundary**: full 1.3.14 suite, helper projection, typecheck, repository required checks, and hosted matrix.
- **Review/acceptance boundary**: PR CI must pass on Ubuntu plus the macOS/Linux/Windows MCP matrix.
- **High-risk surface**: hook protocol output completeness at process termination.
- **Why not checklist row**: `verification_boundary` — changing the CI runtime and hook transport requires an independently reversible PR.

## Evidence Contract

- **State/progress path**: this plan and its contract/review/notes bundle.
- **Verification evidence**: direct 527-byte JSON proof, focused architecture/hook tests, typecheck, full Bun 1.3.14 suite, helper projection, and PR checks.
- **Evaluator rubric**: exact CI pin, complete output, no public contract drift, no compatibility fallback.
- **Stop condition**: stop if 1.3.14 still truncates output, full tests regress, or cross-platform matrix fails.
- **Rollback surface**: revert the PR; there are no persisted runtime migrations.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Reproduce Bun 1.3.14 exit-boundary output truncation.
- [x] Pin hosted CI and MCP matrix to Bun 1.3.14.
- [x] Make architecture and hook exit-boundary output synchronous.
- [x] Synchronize helper template and runtime research current truth.
- [x] Pass focused regression tests, typecheck, and the 1.3.14 full suite.
- [ ] Project workflow artifacts, run repository checks, commit, push, and open the upgrade PR.
