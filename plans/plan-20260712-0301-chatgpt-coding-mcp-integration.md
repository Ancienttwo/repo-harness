# Plan: ChatGPT Coding MCP integration onto current main

> **Status**: Executing
> **Created**: 20260712-0301
> **Slug**: chatgpt-coding-mcp-integration
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Seven-commit replay onto the rollout-retirement base, merge refresh onto current origin/main, focused and full required checks, and draft PR diff
> **Rollback Surface**: Isolated integration branch/worktree and draft PR only; local main and source feature branch remain untouched
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md`
> **Task Review**: `tasks/reviews/20260712-0301-chatgpt-coding-mcp-integration.review.md`
> **Implementation Notes**: `tasks/notes/20260712-0301-chatgpt-coding-mcp-integration.notes.md`

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

- Active plan: `plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md`
- Sprint contract: `tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md`
- Sprint review: `tasks/reviews/20260712-0301-chatgpt-coding-mcp-integration.review.md`
- Implementation notes: `tasks/notes/20260712-0301-chatgpt-coding-mcp-integration.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md`.

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
- Contract file: `tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md`
- Review file: `tasks/reviews/20260712-0301-chatgpt-coding-mcp-integration.review.md`
- Implementation notes file: `tasks/notes/20260712-0301-chatgpt-coding-mcp-integration.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Isolated integration branch/worktree and draft PR only; local main and source feature branch remain untouched
- **Verification boundary**: Seven-commit replay onto current origin/main, focused and full required checks, and draft PR diff
- **Review/acceptance boundary**: `tasks/reviews/20260712-0301-chatgpt-coding-mcp-integration.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md`, `tasks/reviews/20260712-0301-chatgpt-coding-mcp-integration.review.md`, and `tasks/notes/20260712-0301-chatgpt-coding-mcp-integration.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260712-0301-chatgpt-coding-mcp-integration.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Isolated integration branch/worktree and draft PR only; local main and source feature branch remain untouched

## Captured Planning Output

# ChatGPT Coding MCP integration onto current main

## Summary

Integrate the already verified `codex/chatgpt-coding-mcp` commit series onto the current `origin/main` adoption-cutover authority in an isolated worktree. Do not merge the stale branch tree wholesale: replay only the seven feature commits so the retired rollout-control files and current mainline policy remain retired. Preserve local `/Users/kito/Projects/repo-harness` WIP byte-for-byte and do not update its `main` checkout.

## Architecture and trace

- P1: `origin/main` owns rollout retirement plus the transactional TypeScript adoption cutover; the seven feature commits own the coding profile, OAuth authorization-scoped runtime, tests, operator docs, and live acceptance artifacts; the isolated integration branch owns conflict resolution and PR delivery.
- P2: `origin/main@788ba60` -> cherry-pick `0b80ef4`, `47cbe50`, `2f3405d`, `443f3ea`, `2a9d490`, `c3a77d1`, `f3b546d` in order -> resolve conflicts by retaining rollout retirement -> merge refreshed `origin/main@8e160323` so transactional adoption stays authoritative -> regenerate `tasks/current.md` and handoff projections -> verify -> push integration branch -> open draft PR to `main`.
- P3: cherry-pick the feature commits rather than merge the feature branch because the branch base predates `refactor(mcp): retire rollout controls (#52)`; a tree merge would resurrect deleted rollout code and stale archive state. No compatibility fallback, dual policy authority, or new abstraction is permitted.

## Scope

- Replay only the seven named feature commits.
- Merge the subsequently advanced `origin/main@8e160323` without changing its transactional adoption authority; regenerate derived projections after the merge.
- Resolve overlapping MCP policy/setup/server/tool/type paths so current mainline rollout retirement remains authoritative and the coding profile remains explicit, default-off, revision-bound, and worktree-first.
- Merge `package.json` by preserving the current Bun engine floor and adding only the already-reviewed optional `node-pty` dependency; regenerate/validate `bun.lock` deterministically.
- Preserve current main versions for removed rollout controls and any unrelated adoption/agent-fleet behavior.
- Preserve the coding MCP implementation, authorization-runtime fix, focused tests, research/operator docs, and live-canary workflow evidence.
- Regenerate derived `tasks/current.md` and handoff state from the integrated branch instead of choosing either stale side.
- Run focused MCP suites, full `bun test`, typecheck, all current root required checks including transactional `adopt --dry-run`, strict contract/workflow verification, and package/install smoke proportionate to the dependency/installer diff.
- Push `codex/chatgpt-coding-mcp-integration` and create one draft PR against `main` only after all gates pass.

## Out of scope

- Updating, stashing, committing, or cleaning the dirty local `main` checkout.
- Reintroducing `scripts/mcp-rollout-gate.ts`, rollout flags, candidate-disabled policy, or other surfaces retired by current `origin/main`.
- Changing the coding MCP public contract beyond conflict resolution required to preserve the already accepted behavior.
- Merging the PR, publishing a release, modifying Cloudflare/ChatGPT Apps, or deleting preserved canary worktrees.

## Verification

- The integration diff versus `origin/main` contains the intended coding MCP surface and contains no resurrection of retired rollout-control files or flags.
- Focused OAuth/HTTP/policy/setup/coding/process tests pass, followed by full `bun test` and every root required check.
- Authorization-runtime contract remains Fulfilled with review and External Acceptance pass; the separate literal-transcript live-canary classifier remains unchanged.
- Local main retains exactly `M tasks/current.md` and `?? plans/plan-20260711-0115-think-plan-011459.md` with their pre-integration SHA-256 values.
- Draft PR targets `main` from `codex/chatgpt-coding-mcp-integration`.

## Rollback

Delete the isolated integration worktree/branch before push, or close the draft PR and delete the remote integration branch after push. Do not alter the source feature branch, local main, or preserved canary worktrees.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture the integration contract and preflight the seven-commit replay against current `origin/main`.
- [x] Cherry-pick the seven commits in order and resolve conflicts without reviving retired rollout authority.
- [x] Regenerate workflow projections and complete focused plus full verification.
- [ ] Record review/notes, push the integration branch, and create a draft PR against `main`.
