> **Archived**: 2026-09-26 00:59
> **Related Plan**: plans/archive/plan-20260924-0402-architecture-accept-recovery.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260926-0059
> **Archive Projection V1**: `plans/plan-20260924-0402-architecture-accept-recovery.md` => `plans/archive/plan-20260924-0402-architecture-accept-recovery.md`
> **Archive Projection V1**: `tasks/notes/20260924-0402-architecture-accept-recovery.notes.md` => `tasks/archive/notes-20260926-0059-architecture-accept-recovery.md`
> **Archive Projection V1**: `tasks/contracts/20260924-0402-architecture-accept-recovery.contract.md` => `tasks/archive/contract-20260926-0059-architecture-accept-recovery.md`
> **Archive Projection V1**: `tasks/reviews/20260924-0402-architecture-accept-recovery.review.md` => `tasks/archive/review-20260926-0059-architecture-accept-recovery.md`

# Plan: Recover interrupted architecture acceptance

> **Status**: Archived
> **Created**: 20260924-0402
> **Slug**: architecture-accept-recovery
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Interrupted committed projection and exact approval recovery
> **Rollback Surface**: Revert isolated recovery source change; retain all original provider and consumer receipts
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260926-0059-architecture-accept-recovery.md`
> **Task Review**: `tasks/archive/review-20260926-0059-architecture-accept-recovery.md`
> **Implementation Notes**: `tasks/archive/notes-20260926-0059-architecture-accept-recovery.md`

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

- Active plan: `plans/archive/plan-20260924-0402-architecture-accept-recovery.md`
- Sprint contract: `tasks/archive/contract-20260926-0059-architecture-accept-recovery.md`
- Sprint review: `tasks/archive/review-20260926-0059-architecture-accept-recovery.md`
- Implementation notes: `tasks/archive/notes-20260926-0059-architecture-accept-recovery.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260926-0059-architecture-accept-recovery.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260924-0402-architecture-accept-recovery.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260924-0402-architecture-accept-recovery.md`.

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
- Contract file: `tasks/archive/contract-20260926-0059-architecture-accept-recovery.md`
- Review file: `tasks/archive/review-20260926-0059-architecture-accept-recovery.md`
- Implementation notes file: `tasks/archive/notes-20260926-0059-architecture-accept-recovery.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260926-0059-architecture-accept-recovery.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260924-0402-architecture-accept-recovery.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert isolated recovery source change; retain all original provider and consumer receipts
- **Verification boundary**: Interrupted committed projection and exact approval recovery
- **Review/acceptance boundary**: `tasks/archive/review-20260926-0059-architecture-accept-recovery.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260924-0402-architecture-accept-recovery.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260926-0059-architecture-accept-recovery.md`, `tasks/archive/review-20260926-0059-architecture-accept-recovery.md`, and `tasks/archive/notes-20260926-0059-architecture-accept-recovery.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260926-0059-architecture-accept-recovery.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert isolated recovery source change; retain all original provider and consumer receipts

## Captured Planning Output

## Goal and scope

Restore architecture acceptance after the provider has committed projection output but the consumer refresh or acceptance receipt publication failed. This is a separate bugfix work-package required to unblock AKN-03c. Preserve the existing human approval identity and all exact repository/workspace/HEAD/worktree, accepted-change and owned-output checks.

## P1 / P2 / P3

- P1: `projection-acceptance.ts` owns candidate/approval acceptance and repo-harness receipt publication; `archctx-provider.ts` owns the package-local provider CLI and validated result; `refresh-consumer.ts` owns idempotent refresh actions. ArchContext owns committed projection receipts; repo-harness must consume its public recovery protocol rather than read or manufacture provider internal state.
- P2: accepted candidate -> provider apply -> committed generated docs + provider receipt -> refresh consumer -> repo acceptance receipt. A refresh exception leaves the first committed effect durable, but a retry unconditionally calls apply and is refused by the provider. Reproduce this boundary before source edits.
- P3: provide an explicit recovery path on the existing accept operation, using the public provider recovery protocol. Keep normal apply and recovery distinct and observable, never switch by matching arbitrary error text, never create a second receipt authority. Recovery must replay the original refresh delivery and complete the existing receipt path under its existing lock. Reject changed approval, stale candidate, mismatched recovery result or modified provider-owned output. Exact provider signatures and result constraints will be frozen from the read-only protocol audit before implementation. At 10x retries, locking and idempotent receipt/refresh consumption must still prevent duplicate effects.

## Ownership and files

- Isolated worktree: `/Users/ancienttwo/Projects/repo-harness-wt-architecture-accept-recovery`, branch `codex/architecture-accept-recovery`, base `80fb3339fc2c96355d9696663d528e3485b91a97`.
- Parent owns scope, protocol decision, workflow artifacts and acceptance integration. Diagnosis agent owns regression additions in existing `tests/unit/architecture-projection-acceptance.test.ts` and ignored `.ai/harness/runs/accept-recovery/`. Research agent is read-only.
- Production scope: `src/core/architecture/projection.ts`, `src/effects/architecture/archctx-provider.ts`, `src/effects/architecture/projection-acceptance.ts`, `src/cli/commands/architecture-projection.ts` only as required by the public recovery contract.
- Tests: existing acceptance/provider and CLI architecture projection tests; no new benchmark authority or full-suite requirement.
- Documentation: owning external-tooling reference and its asset projection, plus this slice's plan/contract/review/notes. Keep tasks in sync through those canonical artifacts.
- Non-goals: no global install, no shared daemon replacement, no H0 bypass, no manual receipt construction, no editing stale candidates, no live AKN-03c source or approval changes, no unrelated provider/adoption redesign.

## Verification and acceptance

The missing regression is apply success followed by refresh failure, then explicit recovery with the same approval completing exactly one consumer receipt and replaying the original refresh signals. Existing idempotency tests only retry after the consumer receipt already exists. Extend the owning acceptance test at the provider seam and add actual CLI/provider protocol coverage where it differs. Capture pre-fix nonzero failure in `.ai/harness/runs/accept-recovery/pre-fix.log`. Target tests should take under two minutes; no full suite absent a concrete uncovered boundary.

Run changed-boundary tests, type check and all nine root integrity commands. Use the contract's Verification Plan as executable authority, preserve required canonical acceptance, and report any remaining runtime recovery blocker separately. The user-provided existing approval reference may only be reused for its exact existing candidate; no new approval events or waivers are minted.

### Proposed execution items

- [x] Prove root cause and record a failing regression on main80.
- [x] Freeze the public recovery protocol and implement explicit accept recovery with unchanged approval and snapshot checks.
- [x] Verify recovery success, repeat recovery, altered approval and stale/corrupt evidence rejection; run required integrity checks.
- [ ] Publish archctx/archctx-contracts 0.5.11, pin dependencies, complete canonical acceptance and publish the isolated fix for review. Original AKN-03c recovery remains a separate runtime operation after release integration.
- [x] Prepare repo-harness 0.19.3 package/skill/template metadata, README stamps, changelog and release checklist.
- [ ] Freeze the installed registry dependency graph and execute the complete 0.19.3 release verification and canonical acceptance.
- [ ] Publish repo-harness 0.19.3 using Web Auth and verify the published artifact and installed runtime.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Prove root cause and record a failing regression on main80.
- [x] Freeze the public recovery protocol and implement explicit accept recovery with unchanged approval and snapshot checks.
- [x] Verify recovery success, repeat recovery, altered approval and stale/corrupt evidence rejection; run required integrity checks.
- [ ] Publish archctx/archctx-contracts 0.5.11, pin dependencies, complete canonical acceptance and publish the isolated fix for review. Original AKN-03c recovery remains a separate runtime operation after release integration.
- [x] Prepare repo-harness 0.19.3 package/skill/template metadata, README stamps, changelog and release checklist.
- [ ] Freeze the installed registry dependency graph and execute the complete 0.19.3 release verification and canonical acceptance.
- [ ] Publish repo-harness 0.19.3 using Web Auth and verify the published artifact and installed runtime.

## Protocol audit decision — implementation boundary

The public archctx 0.5.10 recovery interface cannot return already-delivered original signals, and its already-delivered branch reuses an old proof without validating the current fixed point. A pending result journal alone fixes only failures after the consumer received the result; it does not cover commit-before-response and cannot recover the existing AKN-03c receipt. Do not implement an incomplete recovery wrapper.

The complete prerequisite is a versioned, read-only public archctx receipt inspection operation: bind repository/workspace and exact acceptedChange; retrieve the provider-owned original receipt/result/signals; recompute current fixed-point proof on every read; never consume delivery state. The consumer then records intent before provider invocation, records the original result before refresh, and uses existing per-action refresh checkpoints before final acceptance publication. Normal apply and explicit recover stay observably distinct.

The user explicitly approved the two-repository source repair on 2026-09-24. Upstream worktree: /Users/ancienttwo/Projects/arch-context-wt-projection-receipt-readback, branch codex/projection-receipt-readback, base c946ea5. Root owns upstream code because that repository restricts subagents to proposals. The downstream worker owns the production/test paths in this contract. Publish, shared daemon replacement and global installation remain separate boundaries; source tests are not a release.

## Frozen readback interface

- Public CLI: `archctx projection readback --request-json <ProjectionRequestV1>`, exact accepted apply request, feature `projection-apply-readback-v1`.
- Result: `archcontext.projection-apply-readback-result/v1` with requestId, requestDigest, full original immutable receipt, current {snapshot, resultingDigests, ownedOutputDigest, fixedPointDigest}, and readbackDigest over all preceding fields.
- The provider looks up by exact repository/workspace/acceptedChange, verifies original request binding and current fixed point under its writer boundary, returns the original result/signals without consuming delivery state. The consumer verifies all hashes and identity before refresh.
- Explicit `accept --recover` rescues an orphan without local intent; a normal accept retry with durable pending intent uses readback, never repeats semantic apply or infers recovery from an error string.

## Approved publication and dependency integration

On 2026-09-24 the user approved publication of new archctx/archctx-contracts packages, exact repo-harness pins, and formal acceptance. Dependency integration includes package.json/bun.lock, both architecture and refactor exact provider-version constants, and existing version-admission fixtures. Global configuration and the shared live daemon remain unchanged. Integrate the two new origin/main fleet-fixture commits before freezing final acceptance evidence.

The release integration worktree was fast-forwarded without conflicts to `origin/main` `2c00d4da5d0d769223791791c01ae6b501ab2c5f` before final verification. The two mainline fleet fixture commits have no overlapping changed files. Active policy producers, self-host policy and AXR fixtures track the same exact version as both consumers; helper assets are generated from scripts.

On 2026-09-25 the release branch was rebased without conflicts onto `origin/main` `7afcbc46d0b623442e98a92ca42d093619576e64` (PR #450: harness simplification plan revision, sprint-backlog selector SIGPIPE repair and a Windows timing-independent task-activity test). The PR #450 files do not overlap this contract's changed files; the Verification Plan diff base moves to the new integration base.

### Approved repo-harness 0.19.3 publication

The user additionally approved preparing and publishing repo-harness 0.19.3 after upstream integration. Include the product/skill/template version fields, README release stamps, changelog and release checklist in the same final canonical subject. Publish using the user-selected npm Web Auth session only. Run the existing full release gate once on the frozen candidate, require the final PR CI, and run the published-registry readback. Global installation, persistent shell configuration and the shared daemon remain separate operations.
