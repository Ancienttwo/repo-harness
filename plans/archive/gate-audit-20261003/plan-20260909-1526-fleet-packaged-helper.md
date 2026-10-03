# Plan: Provision fleet worktrees through packaged helpers

> **Status**: Approved
> **Created**: 20260909-1526
> **Slug**: fleet-packaged-helper
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Real package-only CLI acquisition and required CI
> **Rollback Surface**: Revert fleet helper dispatch and its focused regression
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260909-1526-fleet-packaged-helper.contract.md`
> **Task Review**: `tasks/reviews/20260909-1526-fleet-packaged-helper.review.md`
> **Implementation Notes**: `tasks/notes/20260909-1526-fleet-packaged-helper.notes.md`

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

- Active plan: `plans/plan-20260909-1526-fleet-packaged-helper.md`
- Sprint contract: `tasks/contracts/20260909-1526-fleet-packaged-helper.contract.md`
- Sprint review: `tasks/reviews/20260909-1526-fleet-packaged-helper.review.md`
- Implementation notes: `tasks/notes/20260909-1526-fleet-packaged-helper.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260909-1526-fleet-packaged-helper.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260909-1526-fleet-packaged-helper.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260909-1526-fleet-packaged-helper.md`.

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
- Contract file: `tasks/contracts/20260909-1526-fleet-packaged-helper.contract.md`
- Review file: `tasks/reviews/20260909-1526-fleet-packaged-helper.review.md`
- Implementation notes file: `tasks/notes/20260909-1526-fleet-packaged-helper.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260909-1526-fleet-packaged-helper.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260909-1526-fleet-packaged-helper.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert fleet helper dispatch and its focused regression
- **Verification boundary**: Real package-only CLI acquisition and required CI
- **Review/acceptance boundary**: `tasks/reviews/20260909-1526-fleet-packaged-helper.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260909-1526-fleet-packaged-helper.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260909-1526-fleet-packaged-helper.contract.md`, `tasks/reviews/20260909-1526-fleet-packaged-helper.review.md`, and `tasks/notes/20260909-1526-fleet-packaged-helper.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260909-1526-fleet-packaged-helper.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert fleet helper dispatch and its focused regression

## Captured Planning Output

P1: Fleet acquisition owns claim, worktree provision, bind, projection and work-envelope publication. Default provision/project incorrectly assume downstream scripts/ helpers, while current adoption uses the packaged helper runtime. Scope is src/effects/fleet/acquire.ts and the real CLI acquisition regression. Keep the existing runtime resolver as sole helper authority.
P2: An admitted campaign task reaches acquireNextScheduledEngineerTask -> fleet acquire -> defaultStart, which execs nonexistent target/scripts/contract-worktree.sh. The real canary failed before worker acquisition; the package-only CLI fixture reproduces exit1. defaultProject has the same obsolete path assumption for plan-to-todo.
P3: Use existing runHelper with trustedPackage=true for both mutations, retaining exact arguments, cwd, output bounds and error compensation. No repository-script or source-override fallback. No admission, grant, budget, Docker or Oracle changes. Move the existing runner and platform utility into effects/runtime so both CLI and fleet consume one implementation without a reverse dependency. Update direct imports and its existing capability source path; retain no re-export shim. At larger fleet scale subprocess provisioning remains the existing serialized transaction cost.
Root Cause Evidence: real canary acquisition failure plus /tmp/brc-packaged-helper-pre-fix.log; guard tests/cli/fleet-offer-acquire.test.ts package-helper-only case. Post-fix real worktree, bound lease/token and repeated-acquire rejection pass.
Verification: focused fleet CLI/effect/concurrency/state-boundary tests, TypeScript, six repository-integrity checks. No full local suite; existing CI remains mandatory. Freeze candidate once, record exact evidence, open PR, merge after CI succeeds. This fixes the single directly blocking discovery; preserve the interrupted canary's authority and failure evidence separately.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Provision fleet worktrees through packaged helpers
