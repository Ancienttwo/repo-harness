# Plan: Archived Acceptance CLI Finalization

> **Status**: Archived
> **Created**: 20260831-0937
> **Slug**: archived-acceptance-cli-finalization
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: codex
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: CLI end-to-end acceptance must import evidence from the selected archived authority artifact and leave its projected family freshly sealed.
> **Rollback Surface**: Revert the acceptance CLI/import wiring, archive reseal ordering, mirrored helper, tests, and this workflow package as one unit.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260831-0937-archived-acceptance-cli-finalization.contract.md`
> **Task Review**: `tasks/reviews/20260831-0937-archived-acceptance-cli-finalization.review.md`
> **Implementation Notes**: `tasks/notes/20260831-0937-archived-acceptance-cli-finalization.notes.md`

## Agentic Routing
- Selected route: execution
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260831-0937-archived-acceptance-cli-finalization.md`
- Sprint contract: `tasks/contracts/20260831-0937-archived-acceptance-cli-finalization.contract.md`
- Sprint review: `tasks/reviews/20260831-0937-archived-acceptance-cli-finalization.review.md`
- Implementation notes: `tasks/notes/20260831-0937-archived-acceptance-cli-finalization.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260831-0937-archived-acceptance-cli-finalization.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260831-0937-archived-acceptance-cli-finalization.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260831-0937-archived-acceptance-cli-finalization.md`.

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
- Contract file: `tasks/contracts/20260831-0937-archived-acceptance-cli-finalization.contract.md`
- Review file: `tasks/reviews/20260831-0937-archived-acceptance-cli-finalization.review.md`
- Implementation notes file: `tasks/notes/20260831-0937-archived-acceptance-cli-finalization.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260831-0937-archived-acceptance-cli-finalization.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260831-0937-archived-acceptance-cli-finalization.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the acceptance CLI/import wiring, archive reseal ordering, mirrored helper, tests, and this workflow package as one unit.
- **Verification boundary**: CLI end-to-end acceptance must import evidence from the selected archived authority artifact and leave its projected family freshly sealed.
- **Review/acceptance boundary**: `tasks/reviews/20260831-0937-archived-acceptance-cli-finalization.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260831-0937-archived-acceptance-cli-finalization.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260831-0937-archived-acceptance-cli-finalization.contract.md`, `tasks/reviews/20260831-0937-archived-acceptance-cli-finalization.review.md`, and `tasks/notes/20260831-0937-archived-acceptance-cli-finalization.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260831-0937-archived-acceptance-cli-finalization.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the acceptance CLI/import wiring, archive reseal ordering, mirrored helper, tests, and this workflow package as one unit.

## Captured Planning Output

## Goal
Make the official `acceptance-receipt record` CLI complete archived projected acceptance without manual intervention: attested evidence is imported from the exact selected archived contract authority, optional review projection is applied, and the archived family is sealed only after every projected byte is final.

## Success Criteria
- Archived `record --disposition user_waiver --review ...` succeeds through the public CLI and preserves the canonical live contract identity in the AcceptanceReceipt.
- The attested-evidence import reads the exact contract path selected by `--contract`, rather than incorrectly reopening the canonical live path when that live file has been archived.
- Final archive verification succeeds after review projection; no stale ArchiveProjectionReceipt remains.
- CLI E2E coverage proves ledger import, canonical receipt identity, projected review content, and reproducible archive verification.
- Source and installed-template helper remain byte-identical; all repository Required Checks pass.

## Scope
- `scripts/acceptance-receipt.ts` and its installed template mirror.
- The attested evidence import input contract only as needed to distinguish canonical receipt identity from selected authority artifact provenance.
- Acceptance/attested-import tests and workflow artifacts for this work-package.

## Non-Scope
- No automatic architecture decision-making, provider apply, alternate authority discovery, fallback resolution, legacy receipt compatibility, or change to canonical AcceptanceReceipt semantics.
- No dependency on or modification of the separate R1 provider-neutral Agent Runtime worktree.

## P1 Architecture Map
The public entrypoint is `repo-harness run acceptance-receipt`, implemented by the helper and mirrored template. It records canonical AcceptanceReceipt authority, optionally imports `human_acceptance` evidence through `src/effects/evidence/attested-import.ts`, projects a named review, and maintains ArchiveProjectionReceipt integrity for a projected archived plan/contract/review family. The selected `--contract` artifact is the authority bytes for this invocation; `receipt.contract_file` remains the canonical live identity.

## P2 Concrete Trace
Trace one archived waiver from CLI arguments through contract parsing and acceptance recording, into attested evidence import, then review projection and archive reseal. Exercise the failure path where the canonical live contract no longer exists, and verify the final receipt, ledger event, projected review, and archive seal against the exact archived artifact.

## P3 Design Decision
Keep the two identities explicit at their owning boundary: canonical receipt identity remains unchanged, while the already-validated CLI-selected contract path is passed as import provenance. Perform or repeat sealing only after the optional projection has completed. This is the smallest coherent fix because it changes no authority semantics and adds no path inference. At 10x acceptance volume the first limit remains synchronous hashing/verification, not this identity split.

## Task Breakdown
- [x] Add a CLI E2E regression that reproduces archived ledger import failure and stale post-projection seal.
- [x] Pass exact selected contract authority provenance into attested import without changing canonical receipt identity.
- [x] Finalize projection before the terminal archive seal and keep source/template helpers synchronized.
- [x] Run focused tests, Required Checks, final review, acceptance, merge, and worktree cleanup.

## Verification
- Focused Bun tests for acceptance receipt and attested evidence import.
- `cmp scripts/acceptance-receipt.ts assets/templates/helpers/acceptance-receipt.ts`.
- Repository Required Checks from `AGENTS.md`.
- Official archive acceptance verify and merge-gate workflow.

## Failure Handling
Fail closed on a missing, non-regular, mismatched, or stale selected authority artifact. Do not rediscover an archive path, substitute the canonical path, synthesize proof, or retain a successful exit when ledger import or final reseal fails.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add a CLI E2E regression that reproduces archived ledger import failure and stale post-projection seal.
- [x] Pass exact selected contract authority provenance into attested import without changing canonical receipt identity.
- [x] Finalize projection before the terminal archive seal and keep source/template helpers synchronized.
- [x] Run focused tests, Required Checks, final review, acceptance, merge, and worktree cleanup.
