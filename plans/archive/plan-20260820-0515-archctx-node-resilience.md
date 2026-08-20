# Plan: Archctx node-resolution resilience: shared trusted-candidate scan for scrubbed gates

> **Status**: Archived
> **Created**: 20260820-0515
> **Slug**: archctx-node-resilience
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: check-architecture-sync.sh runs inside this contract's own bounded-verifier gate — the exact scrubbed configuration that has failed since 0.15.3 — plus unit fixtures for nvm fallback and fail-closed exhaustion
> **Rollback Surface**: Additive fallback tier plus one module move; one publication commit, one revert; REPO_HARNESS_NODE_BIN environments see zero behavior change
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-0515-archctx-node-resilience.contract.md`
> **Task Review**: `tasks/reviews/20260820-0515-archctx-node-resilience.review.md`
> **Implementation Notes**: `tasks/notes/20260820-0515-archctx-node-resilience.notes.md`

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

- Active plan: `plans/plan-20260820-0515-archctx-node-resilience.md`
- Sprint contract: `tasks/contracts/20260820-0515-archctx-node-resilience.contract.md`
- Sprint review: `tasks/reviews/20260820-0515-archctx-node-resilience.review.md`
- Implementation notes: `tasks/notes/20260820-0515-archctx-node-resilience.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-0515-archctx-node-resilience.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-0515-archctx-node-resilience.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-0515-archctx-node-resilience.md`.

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
- Contract file: `tasks/contracts/20260820-0515-archctx-node-resilience.contract.md`
- Review file: `tasks/reviews/20260820-0515-archctx-node-resilience.review.md`
- Implementation notes file: `tasks/notes/20260820-0515-archctx-node-resilience.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-0515-archctx-node-resilience.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-0515-archctx-node-resilience.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Additive fallback tier plus one module move; one publication commit, one revert; REPO_HARNESS_NODE_BIN environments see zero behavior change
- **Verification boundary**: check-architecture-sync.sh runs inside this contract's own bounded-verifier gate — the exact scrubbed configuration that has failed since 0.15.3 — plus unit fixtures for nvm fallback and fail-closed exhaustion
- **Review/acceptance boundary**: `tasks/reviews/20260820-0515-archctx-node-resilience.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-0515-archctx-node-resilience.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-0515-archctx-node-resilience.contract.md`, `tasks/reviews/20260820-0515-archctx-node-resilience.review.md`, and `tasks/notes/20260820-0515-archctx-node-resilience.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-0515-archctx-node-resilience.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Additive fallback tier plus one module move; one publication commit, one revert; REPO_HARNESS_NODE_BIN environments see zero behavior change

## Captured Planning Output

## Goal

Close the environment-resilience gap that has taxed every release since 0.15.3: `resolveCompatibleNodeRuntime()` in `src/effects/architecture/archctx-provider.ts` falls back to a PATH-only scan after the bounded verifier's `scrubHarnessEnv()` strips `REPO_HARNESS_NODE_BIN` (whole-prefix by design), so any gate reaching the architecture projection — directly (`check-architecture-sync.sh`) or transitively (`check:ci` / `check:release` via `check-ci.sh`) — fails closed on machines whose Node >=24 <26 lives only in nvm. `helper-runner.ts`'s `trustedNodeCandidates()` already scans nvm correctly; the provider must reuse that scan as one shared authority.

Ledger authority: the `tasks/todos.md` row "Archctx node-runtime resolution resilience" (trigger repeatedly met: two consecutive release contracts carried bypass annotations; gatekeeper P2 twice).

## Preconditions

- Main @ `089f9dbe` (0.16.0 shipped); installed global runtime 0.16.0.
- One source of truth: the candidate scan MOVES to a shared module — no copy, no second scanner. `bun scripts/check-state-boundaries.ts` (run via `bun run check:type`? no — it runs inside check:release; invoke directly) decides the legal home: `src/cli/runtime/helper-runner.ts` (cli layer) cannot be imported from `src/effects/` if the boundary rules forbid it, so the scan most likely moves to a shared effects/runtime module with both consumers importing it. Verify the boundary rules before choosing the path; do not suppress the checker.

## Task Breakdown

- [x] T1 Extract the trusted node-candidate scan from `src/cli/runtime/helper-runner.ts` into a shared module (placement decided by the state-boundary rules; suggested `src/effects/runtime/node-candidates.ts`); `helper-runner.ts` imports it back with byte-identical behavior (its existing tests are the guard). No semantic change to candidate ordering or version filtering.
- [x] T2 `resolveCompatibleNodeRuntime()` in `src/effects/architecture/archctx-provider.ts` gains the shared scan as its fallback tier: resolution order becomes `env.REPO_HARNESS_NODE_BIN` (explicit authority, existing) → PATH scan (existing) → shared trusted candidates (new). The `ARCHCONTEXT_NODE_RANGE` version check applies to every tier; if nothing compatible exists anywhere, the existing fail-closed error stands with its message extended to mention the scanned candidate sources.
- [x] T3 Tests: (a) unit — with `REPO_HARNESS_NODE_BIN` absent and a PATH lacking compatible node, a fixture nvm layout resolves through the shared scan; (b) unit — nothing compatible anywhere still fails closed with the informative error; (c) regression — `helper-runner`'s existing resolution behavior unchanged (its current tests must stay green); (d) the decisive end-to-end lives in the contract's own gate: `bash scripts/check-architecture-sync.sh` sits in this contract's `commands_succeed`, so `verify-sprint --prepare-acceptance` runs it INSIDE the bounded verifier — the exact configuration that has failed on this machine since 0.15.3. It passing under the scrub is the proof that closes the ledger row.
- [x] T4 Closeout: delete the "Archctx node-runtime resolution resilience" row from `tasks/todos.md`; notes record the shared-module placement decision and the boundary-checker evidence.

## Non-goals

No change to `scrubHarnessEnv()` (whole-prefix strip stays by design); no change to `ARCHCONTEXT_NODE_RANGE`; no archctx version bump; no release in this slice (the fix rides the next scheduled one); no touching `scripts/*.sh` or templates.

## Verification

- Targeted: `bun test tests/architecture-projection-orchestration.test.ts` plus the suites covering `helper-runner` and the new shared module (locate by grep).
- The contract's sandboxed gate itself: `bash scripts/check-architecture-sync.sh` in `commands_succeed` (see T3d).
- Full required checks: `bun test`, `bun run check:type`, `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, `bun src/cli/index.ts init --repo . --dry-run`, `bun scripts/check-state-boundaries.ts`.
- Helper mirrors as negative control: both `cmp` pairs (no shell changes).

## Rollback

Additive fallback tier plus one module move; one publication commit, one revert. The explicit `REPO_HARNESS_NODE_BIN` tier stays first, so environments that set it see zero behavior change; only previously-failing scrubbed environments gain a resolution path.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] T1 Extract the trusted node-candidate scan from `src/cli/runtime/helper-runner.ts` into a shared module (placement decided by the state-boundary rules; suggested `src/effects/runtime/node-candidates.ts`); `helper-runner.ts` imports it back with byte-identical behavior (its existing tests are the guard). No semantic change to candidate ordering or version filtering.
- [x] T2 `resolveCompatibleNodeRuntime()` in `src/effects/architecture/archctx-provider.ts` gains the shared scan as its fallback tier: resolution order becomes `env.REPO_HARNESS_NODE_BIN` (explicit authority, existing) → PATH scan (existing) → shared trusted candidates (new). The `ARCHCONTEXT_NODE_RANGE` version check applies to every tier; if nothing compatible exists anywhere, the existing fail-closed error stands with its message extended to mention the scanned candidate sources.
- [x] T3 Tests: (a) unit — with `REPO_HARNESS_NODE_BIN` absent and a PATH lacking compatible node, a fixture nvm layout resolves through the shared scan; (b) unit — nothing compatible anywhere still fails closed with the informative error; (c) regression — `helper-runner`'s existing resolution behavior unchanged (its current tests must stay green); (d) the decisive end-to-end lives in the contract's own gate: `bash scripts/check-architecture-sync.sh` sits in this contract's `commands_succeed`, so `verify-sprint --prepare-acceptance` runs it INSIDE the bounded verifier — the exact configuration that has failed on this machine since 0.15.3. It passing under the scrub is the proof that closes the ledger row.
- [x] T4 Closeout: delete the "Archctx node-runtime resolution resilience" row from `tasks/todos.md`; notes record the shared-module placement decision and the boundary-checker evidence.
