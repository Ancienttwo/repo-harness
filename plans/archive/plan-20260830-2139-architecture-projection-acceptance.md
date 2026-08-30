> **Archived**: 2026-08-31 02:14
> **Related Plan**: plans/archive/plan-20260830-2139-architecture-projection-acceptance.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260831-0214
> **Archive Projection V1**: `plans/plan-20260830-2139-architecture-projection-acceptance.md` => `plans/archive/plan-20260830-2139-architecture-projection-acceptance.md`
> **Archive Projection V1**: `tasks/contracts/20260830-2139-architecture-projection-acceptance.contract.md` => `tasks/archive/contract-20260831-0214-architecture-projection-acceptance.md`
> **Archive Projection V1**: `tasks/reviews/20260830-2139-architecture-projection-acceptance.review.md` => `tasks/archive/review-20260831-0214-architecture-projection-acceptance.md`
> **Archive Projection V1**: `tasks/notes/20260830-2139-architecture-projection-acceptance.notes.md` => `tasks/archive/notes-20260831-0214-architecture-projection-acceptance.md`

# Plan: Architecture Projection Acceptance Verb

> **Status**: Archived
> **Created**: 20260830-2139
> **Slug**: architecture-projection-acceptance
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: delegated-work-package
> **Source Ref**: todo:tasks/todos.md#architecture-projection-acceptance
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused architecture projection acceptance tests plus all root Required Checks and final Waza check review.
> **Rollback Surface**: Revert the CLI command, architecture acceptance store/orchestrator wiring, gate projection, tests, and workflow artifacts as one branch unit.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260831-0214-architecture-projection-acceptance.md`
> **Task Review**: `tasks/archive/review-20260831-0214-architecture-projection-acceptance.md`
> **Implementation Notes**: `tasks/archive/notes-20260831-0214-architecture-projection-acceptance.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: todo:tasks/todos.md#architecture-projection-acceptance
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260830-2139-architecture-projection-acceptance.md`
- Sprint contract: `tasks/archive/contract-20260831-0214-architecture-projection-acceptance.md`
- Sprint review: `tasks/archive/review-20260831-0214-architecture-projection-acceptance.md`
- Implementation notes: `tasks/archive/notes-20260831-0214-architecture-projection-acceptance.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260831-0214-architecture-projection-acceptance.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260830-2139-architecture-projection-acceptance.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260830-2139-architecture-projection-acceptance.md`.

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
- Contract file: `tasks/archive/contract-20260831-0214-architecture-projection-acceptance.md`
- Review file: `tasks/archive/review-20260831-0214-architecture-projection-acceptance.md`
- Implementation notes file: `tasks/archive/notes-20260831-0214-architecture-projection-acceptance.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260831-0214-architecture-projection-acceptance.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260830-2139-architecture-projection-acceptance.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the CLI command, architecture acceptance store/orchestrator wiring, gate projection, tests, and workflow artifacts as one branch unit.
- **Verification boundary**: Focused architecture projection acceptance tests plus all root Required Checks and final Waza check review.
- **Review/acceptance boundary**: `tasks/archive/review-20260831-0214-architecture-projection-acceptance.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260830-2139-architecture-projection-acceptance.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260831-0214-architecture-projection-acceptance.md`, `tasks/archive/review-20260831-0214-architecture-projection-acceptance.md`, and `tasks/archive/notes-20260831-0214-architecture-projection-acceptance.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260831-0214-architecture-projection-acceptance.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the CLI command, architecture acceptance store/orchestrator wiring, gate projection, tests, and workflow artifacts as one branch unit.

## Captured Planning Output

## Goal and success criteria
Add a manual `repo-harness architecture-projection accept` verb that turns one currently persisted unresolved-major refresh signal into an exact accepted-change request only when an explicit approval reference is supplied. Success requires durable, reproducible receipt evidence and strict architecture-gate recognition.

The approved closeout extension adds a separate `architecture-projection reconcile`
verb for proof-only candidates that a current deterministic projection proves are
obsolete. Reconciliation is not acceptance: it runs in check mode without an
accepted change, requires ready CodeGraph evidence and a clean `noop`, and persists
a content-bound reconciliation receipt before the strict gate stops counting the
candidate.

## Scope
- Persist the exact unresolved-major candidate emitted by direct CLI apply and the durable automatic drain, including its request/result identity and changed paths.
- Add `accept --signal-id <sha256> --approval-reference <event-id> --json`.
- Derive the ArchContext change-set identity from the candidate signal's resulting projection digest; preserve the supplied approval reference exactly as `eventId`; copy reason codes and affected node ids exactly from the signal.
- Refuse if repository/workspace/head/worktree identity no longer matches the signal, if the candidate is malformed, or if a pre-existing receipt does not match the requested approval identity.
- Run the accepted apply using the candidate request surface, consume refresh actions, and atomically persist a content-bound acceptance receipt. An identical retry returns the same receipt.
- Add `reconcile --signal-id <sha256> --json` for candidates whose exact reason set is
  `verified-flow-proof-changed`; bind the receipt to the candidate and current proof
  snapshot, and reject unavailable or unresolved proof without provider apply.
- Serialize candidate resolution so acceptance and reconciliation cannot both
  execute, and project an automatic-drain reconciliation into its terminal job receipt.
- Update the strict architecture projection gate to count unresolved candidates without a matching valid acceptance receipt and keep source/template mirrors synchronized.
- Remove the fulfilled Todo row and synchronize current workflow state.

## Non-goals
- No automatic architecture acceptance or semantic decision-making.
- No inferred reasons, nodes, approval actors, or compatibility aliases.
- No changes to the separate R1 provider-neutral Agent Runtime worktree.
- No historical rewrite of prior C1/C3 architecture acceptance records in this slice.
- No reconciliation of semantic reason codes and no conversion of human approval into flow-proof evidence.

## P1 architecture map
- CLI entry: `src/cli/commands/architecture-projection.ts`.
- Protocol authority: `src/core/architecture/projection.ts` and ArchContext contracts.
- Provider boundary: `src/effects/architecture/archctx-provider.ts`.
- Durable drain/job authority: `src/effects/architecture/projection-orchestrator.ts` and `projection-jobs.ts` under `.ai/harness/architecture-projection/`.
- Gate: `scripts/check-architecture-sync.sh` plus its packaged template mirror.
- Tests: architecture projection provider/orchestration tests and a focused acceptance-store/CLI test surface.
- Out of scope: collaboration runtime and R1 Agent Runtime worktree.

## P2 concrete trace
1. A source change reaches CLI apply or the Stop-time durable drain.
2. ArchContext returns a validated `ProjectionResultV1` with a `human-action-required` refresh signal.
3. The harness records an immutable candidate before returning/refusing the automatic drain.
4. An operator supplies the exact signal id and an external approval reference to `accept`.
5. The acceptance effect reads the candidate, validates signal/request/result identity and freshness against `captureArchitectureProjectionSnapshot`, derives the accepted change without operator-provided semantic fields, then calls the same provider apply boundary.
6. Only applied/noop with no unresolved signal proceeds to canonical refresh consumption and an atomic receipt.
7. The architecture gate considers the candidate resolved only when its receipt validates exact signal, approval, reason/node, provider receipt, and digest bindings.
8. For a proof-only obsolete candidate, `reconcile` captures the current snapshot,
   runs the provider in `check` mode without `acceptedChange`, requires CodeGraph-ready
   input/output snapshots plus an empty `noop`, and writes a distinct reconciliation
   receipt. The gate recognizes only a valid receipt of one resolution kind.

## P3 decision rationale
The refresh signal is the provider authority for the semantic delta; the CLI must not recreate it from flags. The approval reference is external identity, so the CLI preserves it instead of minting a misleading `event.user-approval-*` id. A content-addressed candidate plus atomic receipt is the smallest coherent bridge between the existing provider protocol and strict gate. At 10x scale the first limit is linear directory scanning in the shell gate, acceptable for rare manual major changes; no new index is justified.

## Public surface
`repo-harness architecture-projection accept --signal-id <sha256:...> --approval-reference <event-id> --json`.

`repo-harness architecture-projection reconcile --signal-id <sha256:...> --json`.

## Tests and verification
- Approval-reference identity is exact in the accepted request and receipt.
- Reasons and node ids are copied exactly from the candidate signal and cannot be substituted.
- Any stale repository/workspace/head/worktree snapshot refuses before provider execution.
- Repeating the same accepted command returns byte-identical receipt evidence and gate resolution is reproducible.
- Reconciliation refuses semantic candidates, unavailable CodeGraph
  proof, non-noop results, human actions, refresh signals, affected nodes, files, or
  apply receipts. An identical retry returns byte-identical evidence.
- Run focused tests, `bun test --timeout 60000`, every command in root `Required Checks`, and final Waza `/check` review.

## Failure and rollback
All invalid/missing/stale/mismatched states fail closed before semantic apply. Provider or refresh failure writes no acceptance receipt. Rollback is the branch diff as one unit; ignored runtime evidence is not product authority.

## Task Breakdown
- [x] Capture and activate the acceptance work-package contract.
- [x] Implement candidate persistence, manual accept command, exact binding/freshness checks, receipt and gate consumption.
- [x] Add focused regression coverage for the four required acceptance properties.
- [x] Synchronize Todo/current/architecture documentation and packaged mirrors.
- [x] Implement proof-only reconciliation receipt, CLI and strict-gate consumption.
- [x] Add focused reconciliation fail-closed and reproducibility coverage.
- [x] Run focused and repository-required verification, then complete Waza check review.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture and activate the acceptance work-package contract.
- [x] Implement candidate persistence, manual accept command, exact binding/freshness checks, receipt and gate consumption.
- [x] Add focused regression coverage for the four required acceptance properties.
- [x] Synchronize Todo/current/architecture documentation and packaged mirrors.
- [x] Implement proof-only reconciliation receipt, CLI and strict-gate consumption.
- [x] Add focused reconciliation fail-closed and reproducibility coverage.
- [x] Run focused and repository-required verification, then complete Waza check review.
