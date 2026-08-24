# Plan: Operator authority acceptance rebind

> **Status**: Executing
> **Created**: 20260824-1252
> **Slug**: operator-authority-acceptance-rebind
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: security_boundary
> **Verification Boundary**: Fresh final-subject verification, typed external acceptance, and exact installed merge seal.
> **Rollback Surface**: Revert the authority-pin commit and this bounded workflow package before PR readiness.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260824-1252-operator-authority-acceptance-rebind.contract.md`
> **Task Review**: `tasks/reviews/20260824-1252-operator-authority-acceptance-rebind.review.md`
> **Implementation Notes**: `tasks/notes/20260824-1252-operator-authority-acceptance-rebind.notes.md`

## Agentic Routing
- Selected route: parent-security-review
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260824-1252-operator-authority-acceptance-rebind.md`
- Sprint contract: `tasks/contracts/20260824-1252-operator-authority-acceptance-rebind.contract.md`
- Sprint review: `tasks/reviews/20260824-1252-operator-authority-acceptance-rebind.review.md`
- Implementation notes: `tasks/notes/20260824-1252-operator-authority-acceptance-rebind.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260824-1252-operator-authority-acceptance-rebind.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260824-1252-operator-authority-acceptance-rebind.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260824-1252-operator-authority-acceptance-rebind.md`.

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
- Contract file: `tasks/contracts/20260824-1252-operator-authority-acceptance-rebind.contract.md`
- Review file: `tasks/reviews/20260824-1252-operator-authority-acceptance-rebind.review.md`
- Implementation notes file: `tasks/notes/20260824-1252-operator-authority-acceptance-rebind.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260824-1252-operator-authority-acceptance-rebind.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260824-1252-operator-authority-acceptance-rebind.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the authority-pin commit and this bounded workflow package before PR readiness.
- **Verification boundary**: Fresh final-subject verification, typed external acceptance, and exact installed merge seal.
- **Review/acceptance boundary**: `tasks/reviews/20260824-1252-operator-authority-acceptance-rebind.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: security_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260824-1252-operator-authority-acceptance-rebind.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260824-1252-operator-authority-acceptance-rebind.contract.md`, `tasks/reviews/20260824-1252-operator-authority-acceptance-rebind.review.md`, and `tasks/notes/20260824-1252-operator-authority-acceptance-rebind.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260824-1252-operator-authority-acceptance-rebind.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the authority-pin commit and this bounded workflow package before PR readiness.

## Captured Planning Output

> **Task Profile**: bugfix

## Outcome

Re-accept the exact PR #218 candidate after closing the loopback HTTP authority gap. The candidate is merge-ready only when hostile Host and Origin requests fail before Fleet collection, normal same-authority requests still succeed, the full repository verification remains green, a fresh typed AcceptanceReceipt binds the final normalized subject, and the installed host merge gate seals the exact base/head/diff.

## P1 Architecture Map

- Boundary: `src/effects/operator/server.ts` owns the localhost HTTP trust boundary; `src/core/operator/fleet-snapshot.ts` owns the browser-safe projection; the React client is presentation-only.
- Entrypoints: `repo-harness operator serve`, then Node HTTP request dispatch in `startOperatorServer`.
- Authorities: the bound loopback socket owns the accepted HTTP authority; Fleet remains the only task/status data authority; the typed AcceptanceReceipt and installed merge gate own local merge evidence.
- Reviewed candidate: the entire normalized PR diff against policy `review_base`, with the security correction isolated to server, focused tests, and the durable lesson.
- Out of scope: remote serving, auth/RBAC, mutation routes, UI redesign, provider merge, and compatibility aliases such as `localhost` for an IP-bound server.

## P2 Concrete Trace

1. A request reaches the loopback listener.
2. The server derives the exact authority from configured loopback address plus `request.socket.localPort`.
3. Missing or mismatched `Host` fails 421; a supplied non-matching `Origin` fails 403.
4. Only an accepted request reaches route dispatch and Fleet collection; `/api/v1/fleet/snapshot` remains read-only and single-flight.
5. Final candidate verification runs from the active contract, emits current Change Assessment evidence, records Codex `external_pass`, and the installed merge gate seals base SHA, head SHA, binary diff fingerprint, receipt bytes, and helper bytes.

## P3 Decision Rationale

- Loopback binding restricts the TCP destination but does not establish the browser-visible HTTP authority, so exact Host and Origin pinning is the smallest coherent control against DNS rebinding.
- The check runs before any collector call to preserve the invariant that rejected browser authority cannot trigger local observation work.
- Exact IP authority intentionally fails closed; no aliases or compatibility fallbacks are added.
- At 10x request volume, Fleet/provider observation remains the first bottleneck; this correction adds constant-time header checks and does not change that scaling boundary.

## Verification

- Focused regression: `bun test tests/cli/operator-serve.test.ts tests/unit/operator-fleet-snapshot.test.ts tests/effects/fleet-board.test.ts tests/operator-web/operator-ui.test.tsx tests/operator-web/operator-interactions.test.tsx`
- Typecheck: `bun run check:type`
- Full suite: `bun test --timeout 60000`
- Required repository checks from root `AGENTS.md`.
- Runtime readback must show hostile Host 421, hostile Origin 403, valid request 200, and exactly one collector call.
- Remote PR checks must all be successful on the exact final head.
- Final evidence: fresh AcceptanceReceipt plus `repo-harness run merge-gate run --base origin/main` and immediate verify.

## Task Breakdown

- [x] Prove the pre-fix DNS-rebinding authority gap.
- [x] Pin exact Host and supplied Origin before route dispatch.
- [x] Add hostile-authority regression coverage and durable lesson.
- [x] Run focused, full, required, runtime, and remote verification.
- [x] Prepare the exact final-subject verification contract and independent PASS review; acceptance, seal generation, and PR readiness are the delivery gate sequence.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Prove the pre-fix DNS-rebinding authority gap.
- [x] Pin exact Host and supplied Origin before route dispatch.
- [x] Add hostile-authority regression coverage and durable lesson.
- [x] Run focused, full, required, runtime, and remote verification.
- [x] Prepare the exact final-subject verification contract and independent PASS review; acceptance, seal generation, and PR readiness are the delivery gate sequence.
