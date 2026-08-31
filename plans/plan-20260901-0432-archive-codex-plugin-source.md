# Plan: Archive Codex Plugin Acceptance Source

> **Status**: Executing
> **Created**: 20260901-0432
> **Slug**: archive-codex-plugin-source
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: The historical-plan classifier must match each receipt to the source frozen in its contract policy and allow the already accepted WP2 workflow to pass sealed-terminal archival.
> **Rollback Surface**: Revert the classifier/template/test changes and restore the WP2 lifecycle/archive artifacts in one commit.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260901-0432-archive-codex-plugin-source.contract.md`
> **Task Review**: `tasks/reviews/20260901-0432-archive-codex-plugin-source.review.md`
> **Implementation Notes**: `tasks/notes/20260901-0432-archive-codex-plugin-source.notes.md`

## Agentic Routing
- Selected route: parent agent bugfix workflow
- Routing reason: The defect crosses the acceptance-evidence classifier and workflow archive boundary, so diagnosis, regression evidence, implementation, and closeout remain one reviewable unit.
- Due diligence:
  - P1 map: Protocol-2 acceptance policy and receipt projection are authoritative; `scripts/classify-historical-plans.ts` and its installed template classify terminal evidence; `archive-workflow.sh` consumes that classification before moving plan/contract/review/notes artifacts.
  - P2 trace: A Codex-host review records `external_pass/Codex/codex-plugin`; `hasRecordedAcceptanceReceipt` parses the projection; sealed-terminal evaluation combines receipt validity with `Fulfilled` contract status and `pass` recommendation; archive then moves the workflow family.
  - P3 decision rationale: Reuse the authoritative acceptance-policy parser and require the projected identity to match that policy exactly. This preserves both supported host routes without creating an unbound dual-source compatibility path.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260901-0432-archive-codex-plugin-source.md`
- Sprint contract: `tasks/contracts/20260901-0432-archive-codex-plugin-source.contract.md`
- Sprint review: `tasks/reviews/20260901-0432-archive-codex-plugin-source.review.md`
- Implementation notes: `tasks/notes/20260901-0432-archive-codex-plugin-source.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260901-0432-archive-codex-plugin-source.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260901-0432-archive-codex-plugin-source.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260901-0432-archive-codex-plugin-source.md`.

## Approach
### Strategy
Capture a failing regression guard against the unfixed classifier, bind receipt identity to the frozen acceptance policy in both runtime and install template, then promote the accepted WP2 contract to `Fulfilled` and archive its workflow family through the sealed-terminal gate.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Accept either source without consulting the contract | Preserves both host routes | Creates dual authority and accepts source-policy mismatches | Rejected |
| Replace `codex-review` with `codex-plugin` globally | Fixes Codex-host receipts | Breaks the current Claude-host protocol-2 route | Rejected after external review |
| Match the receipt to the contract policy | Preserves both supported host routes and rejects mismatches | Adds a dependency on the existing acceptance-policy authority | Selected |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `scripts/classify-historical-plans.ts` | Modify | Bind projected receipt identity to the contract's authoritative acceptance policy. |
| `assets/templates/helpers/classify-historical-plans.ts` | Modify | Keep installed helper behavior identical to the runtime helper. |
| `tests/historical-plan-classifier.test.ts` | Modify | Cover both host policies, mismatches, invalid policy, and waiver policy. |
| `tests/archive-evidence-gates.test.ts` | Modify | Exercise sealed archive evidence with the canonical source. |
| `DEBUG.md` | Add | Preserve the observation, hypothesis, experiment, and confirmed root cause. |
| `docs/architecture/` projection | Regenerate | Refresh deterministic architecture proofs after the workflow-family archive changes the repository source tree. |
| `tasks/contracts/20260901-0205-external-source-binding-wp2.contract.md` | Modify/archive | Promote the externally accepted WP2 contract to `Fulfilled`. |
| WP2 workflow family | Archive | Move the sealed terminal plan, contract, review, and notes through the archive helper. |

### Code Snippets
The external identity predicate becomes `reviewer === policy.reviewer && source === acceptancePolicySource(policy)`.

### Data Flow
`AcceptanceReceipt projection -> hasRecordedAcceptanceReceipt -> evaluateSealedTerminalEvidence -> archive-workflow.sh -> plans/archive + tasks/*/archive`.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Template and runtime helper drift | Medium | High | Edit both copies and run mirror/full tests. |
| Archive executes with incomplete evidence | Low | High | Require exact `Fulfilled + pass + typed receipt` sealed-terminal triple. |
| Source name is accepted without its matching host policy | Low | High | Parse the frozen contract policy and require an exact reviewer/source match. |
| Workflow archive changes architecture proof digests | Medium | Medium | Reconcile the exact proof-only signal against a current ready CodeGraph index and commit only provider-owned projection outputs. |

## Task Contracts
- Contract file: `tasks/contracts/20260901-0432-archive-codex-plugin-source.contract.md`
- Review file: `tasks/reviews/20260901-0432-archive-codex-plugin-source.review.md`
- Implementation notes file: `tasks/notes/20260901-0432-archive-codex-plugin-source.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260901-0432-archive-codex-plugin-source.contract.md --strict`
- Active plan rule: `.ai/harness/active-plan` is authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Classifier fix, regression evidence, and WP2 archive closeout ship together.
- **Rollback surface**: One commit restores the classifier and archived workflow family.
- **Verification boundary**: Targeted classifier/archive tests, exact sealed-terminal CLI reproduction, and repository required checks.
- **Review/acceptance boundary**: Protocol-2 Codex review using `source=codex-plugin`, followed by PR merge approval.
- **High-risk surface**: Acceptance evidence and archive eligibility are shared workflow contracts.
- **Why not checklist row**: The change alters a cross-workflow evidence gate and independently verifiable archive side effect.

## Evidence Contract

- **State/progress path**: This plan, its task contract/review/notes, and the archived WP2 workflow family.
- **Verification evidence**: Pre-fix failure artifact, targeted Bun tests, exact classifier command, strict task workflow check, and full required checks.
- **Evaluator rubric**: Both supported host policies accept only their matching receipt identity, template stays synchronized, and WP2 archives only after the sealed triple passes.
- **Stop condition**: Any required check fails or archival would touch a workflow outside WP2.
- **Rollback surface**: Classifier/template/test delta plus WP2 archive moves.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add a regression guard and capture its failure against the unfixed classifier.
- [x] Bind Codex receipt identity to the frozen acceptance policy in runtime and template helpers.
- [x] Verify the classifier, promote WP2 to `Fulfilled`, and archive its sealed workflow family.
- [x] Run required repository checks and prepare protocol-2 acceptance evidence.
