# Plan: 修复 checks/latest 的 genesis worktree authority

> **Status**: Executing
> **Created**: 20260723-2258
> **Slug**: evidence-ledger-genesis-authority
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: PostBash-first genesis regression, focused evidence materializer tests, typecheck, strict contract verification, and verify-sprint must pass.
> **Rollback Surface**: Revert the isolated codex/evidence-ledger-genesis-authority worktree diff; no evidence schema or ledger migration is introduced.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260723-2258-evidence-ledger-genesis-authority.contract.md`
> **Task Review**: `tasks/reviews/20260723-2258-evidence-ledger-genesis-authority.review.md`
> **Implementation Notes**: `tasks/notes/20260723-2258-evidence-ledger-genesis-authority.notes.md`

## Agentic Routing
- Selected route: bug-hunt
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260723-2258-evidence-ledger-genesis-authority.md`
- Sprint contract: `tasks/contracts/20260723-2258-evidence-ledger-genesis-authority.contract.md`
- Sprint review: `tasks/reviews/20260723-2258-evidence-ledger-genesis-authority.review.md`
- Implementation notes: `tasks/notes/20260723-2258-evidence-ledger-genesis-authority.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260723-2258-evidence-ledger-genesis-authority.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260723-2258-evidence-ledger-genesis-authority.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260723-2258-evidence-ledger-genesis-authority.md`.

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
| `src/effects/evidence/checks-materializer.ts` | Modify | Use immutable genesis as worktree identity authority |
| `tests/evidence-checks-materializer.test.ts` | Modify | Cover PostBash-first genesis and exact contract identity |
| `tests/evidence-projection-drift.test.ts` | Modify | Supply explicit genesis identity to the direct caller |
| `scripts/archive-workflow.sh` | Modify | Keep prediction receipt validation bound to the exact source repository |
| `assets/templates/helpers/archive-workflow.sh` | Modify | Preserve source/template helper parity |
| `tests/archive-evidence-gates.test.ts` | Modify | Assert prediction validates acceptance from source, not scratch |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260723-2258-evidence-ledger-genesis-authority.contract.md`
- Review file: `tasks/reviews/20260723-2258-evidence-ledger-genesis-authority.review.md`
- Implementation notes file: `tasks/notes/20260723-2258-evidence-ledger-genesis-authority.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260723-2258-evidence-ledger-genesis-authority.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260723-2258-evidence-ledger-genesis-authority.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the isolated codex/evidence-ledger-genesis-authority worktree diff; no evidence schema or ledger migration is introduced.
- **Verification boundary**: PostBash-first genesis regression, focused evidence materializer tests, typecheck, strict contract verification, and verify-sprint must pass.
- **Review/acceptance boundary**: `tasks/reviews/20260723-2258-evidence-ledger-genesis-authority.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260723-2258-evidence-ledger-genesis-authority.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260723-2258-evidence-ledger-genesis-authority.contract.md`, `tasks/reviews/20260723-2258-evidence-ledger-genesis-authority.review.md`, and `tasks/notes/20260723-2258-evidence-ledger-genesis-authority.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260723-2258-evidence-ledger-genesis-authority.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the isolated codex/evidence-ledger-genesis-authority worktree diff; no evidence schema or ledger migration is introduced.

## Captured Planning Output

## P1 Architecture Map
- Immutable `.ai/harness/evidence/genesis.json` is the worktree identity authority.
- PostBash may create genesis without an active contract and therefore uses the workspace-root hash.
- Verify evidence producers append authoritative events using the already-established genesis identity.
- `checks-materializer.ts` is the sole writer of `.ai/harness/checks/latest.json`; it must project accepted ledger events for the active contract and subject.
- Scope is limited to `src/effects/evidence/checks-materializer.ts`,
  `tests/evidence-checks-materializer.test.ts`,
  `tests/evidence-projection-drift.test.ts`, and generated workflow artifacts.
  The projection-drift fixture is an existing direct caller whose typed input
  must name the genesis identity explicitly. Event schema, producers, existing
  ledgers, and recovery views are out of scope.

## P2 Concrete Trace
1. PostBash wins genesis and records `worktree_id=ws-<hash>`.
2. Verify producer asks for the contract slug but `appendGenesisRecord` returns the immutable existing genesis.
3. The verify event is correctly stamped with that returned `ws-<hash>`.
4. `writeChecksLatest` reads genesis plus accepted events but currently discards genesis.
5. `buildChecksLatestProjection` re-derives a contract slug and rejects the valid event, producing `status=unsatisfied`.

## P3 Design Decision
- Pass the accepted genesis identity into the pure projection builder and use it as the only worktree filter authority.
- Preserve active-contract isolation by matching both existing exact identities:
  `subject_identity.contract_hash` for bytes and `run_trace.contract.file` for
  the repo-relative path. The path check prevents byte-identical copied
  contracts from sharing evidence.
- Fail closed when the disk-writing materializer has no accepted genesis.
- Do not change event schemas, rewrite ledgers, add dual-format reads, or synthesize fallback identities.
- At 10x scale the first pressure point remains full accepted-event replay; this bounded correctness fix does not introduce another scan or authority.

## Closeout Blocker Addendum

### P1 Architecture Map
- `contract-worktree finish` verifies the candidate receipt in the linked
  worktree, then asks `archive-workflow --predict-manifest` to simulate the
  deterministic lifecycle diff in an isolated scratch clone.
- AcceptanceReceipt authority is intentionally keyed by the canonical absolute
  repository root under `~/.repo-harness/gates/`.
- The scratch clone owns predicted mutations only; it is not a new review or
  acceptance subject.

### P2 Concrete Trace
1. `finish` verifies the valid source-worktree receipt.
2. `predict_archive_manifest` clones the candidate to a random temp path.
3. The recursive Completed archive gate runs with scratch as `PWD`.
4. `acceptance-receipt.ts` hashes that scratch root and looks for a receipt
   which cannot exist, so every real path-bound prediction fails closed.
5. The fixture missed this because its `.acceptance-pass` stub is tracked and
   therefore copied into the scratch clone.

### P3 Design Decision
- Verify checks, AcceptanceReceipt, and architecture freshness in the predictor
  parent while `PWD` is the exact source repository.
- Require a clean source and scratch with identical candidate HEAD, review
  target, local origin binding, and runtime evidence bytes before mutation.
- Run the shared lifecycle mutation directly in the same process through a
  private `preverified` branch that cannot be selected by CLI, environment
  variable, or scratch marker; keep the ordinary CLI fixed to `required`.
- Project Active to Fulfilled through the same helper in both real and predicted
  archives so manifest bytes remain deterministic.
- Do not mint, copy, rewrite, or relax AcceptanceReceipt data, and do not add a
  fallback root.

## Acceptance Criteria
- A RED regression reproduces PostBash-first genesis plus a valid authoritative verify event and demonstrates the pre-fix unsatisfied projection.
- The same fixture passes after the fix and reports the genesis `worktree_id` in provenance.
- An event for a byte-identical contract at another path in the same worktree is
  excluded by the existing exact contract hash-and-path pair.
- Missing genesis makes `writeChecksLatest` fail closed before writing.
- Existing producer-materializer end-to-end tests remain green.
- Focused tests, typecheck, strict contract verification, and verify-sprint pass.

## Task Breakdown
- [x] Add deterministic PostBash-first genesis regression coverage.
- [x] Make genesis the sole worktree identity authority in checks materialization.
- [x] Enforce active-contract isolation with the existing exact contract hash
  and contract-path pair.
- [x] Verify focused and workflow gates and record review and receipt.
- [x] Repair the path-bound AcceptanceReceipt authority used by archive
  manifest prediction, then close the worktree.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add deterministic PostBash-first genesis regression coverage.
- [x] Make genesis the sole worktree identity authority in checks materialization.
- [x] Enforce active-contract isolation with the existing exact contract hash
  and contract-path pair.
- [x] Verify focused and workflow gates and record review and receipt.
- [x] Repair the path-bound AcceptanceReceipt authority used by archive
  manifest prediction, then close the worktree.
