# Plan: Publication Receipt V1

> **Status**: Archived
> **Created**: 20260822-1222
> **Slug**: publication-receipt
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: codex
> **Source Ref**: plans/prds/20260822-0405-fleet-acquire-publication-readiness.prd.md#wp0-a
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Receipt-specific PRD Acceptance Script 2 assertions
> **Rollback Surface**: Additive receipt cache, PR marker, CLI and ship integration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260822-1222-publication-receipt.contract.md`
> **Task Review**: `tasks/reviews/20260822-1222-publication-receipt.review.md`
> **Implementation Notes**: `tasks/notes/20260822-1222-publication-receipt.notes.md`

## Agentic Routing
- Selected route: implementation
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: plans/prds/20260822-0405-fleet-acquire-publication-readiness.prd.md#wp0-a
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260822-1222-publication-receipt.md`
- Sprint contract: `tasks/contracts/20260822-1222-publication-receipt.contract.md`
- Sprint review: `tasks/reviews/20260822-1222-publication-receipt.review.md`
- Implementation notes: `tasks/notes/20260822-1222-publication-receipt.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260822-1222-publication-receipt.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260822-1222-publication-receipt.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260822-1222-publication-receipt.md`.

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
- Contract file: `tasks/contracts/20260822-1222-publication-receipt.contract.md`
- Review file: `tasks/reviews/20260822-1222-publication-receipt.review.md`
- Implementation notes file: `tasks/notes/20260822-1222-publication-receipt.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260822-1222-publication-receipt.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260822-1222-publication-receipt.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Additive receipt cache, PR marker, CLI and ship integration
- **Verification boundary**: Receipt-specific PRD Acceptance Script 2 assertions
- **Review/acceptance boundary**: `tasks/reviews/20260822-1222-publication-receipt.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260822-1222-publication-receipt.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260822-1222-publication-receipt.contract.md`, `tasks/reviews/20260822-1222-publication-receipt.review.md`, and `tasks/notes/20260822-1222-publication-receipt.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260822-1222-publication-receipt.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Additive receipt cache, PR marker, CLI and ship integration

## Captured Planning Output

## Goal

Implement WP0-A from `plans/prds/20260822-0405-fleet-acquire-publication-readiness.prd.md`: an immutable `PublicationReceiptV1` with deterministic identity, a full canonical PR-body marker, a rebuild command, typed partial-publication failure, and upgraded ship-journal publication evidence.

## Success Criteria

- A pure canonical receipt model validates all frozen creation-time fields and derives `publication_id = sha256(protocol + provider_repo_id + task_id + claim_id + generation + head_sha)` without changing `COORDINATION_PROTOCOL`.
- The local cache lives under the git common directory and atomic writes are idempotent for the same canonical receipt while conflicting payloads fail closed.
- PR create/adoption reads live provider repo/PR/head facts, proves the existing publication identity, writes the local receipt, and embeds one bounded full-payload marker in the PR body.
- Deleting the local cache and invoking the receipt rebuild surface recreates a field-equivalent receipt only after live provider head and local evidence digests revalidate; marker data alone never authorizes a lease mutation.
- A PR that exists while receipt or marker persistence fails exits non-zero with typed `publication_incomplete` and leaves the ship journal recoverable; claim/generation mismatch exits typed `publication_claim_mismatch`.
- `pr_observed` journal evidence records provider repo ID, PR number, publication ID, and receipt digest rather than only a commit SHA; crash retry converges on the same publication ID.
- Focused tests cover deterministic identity, marker round-trip/replacement, cache rebuild, existing-PR adoption, forced partial failure, mismatch refusal, and journal replay/reconcile.

## Scope

- Add the core publication receipt/marker contract and effectful cache/provider orchestration following the existing `src/core` / `src/effects` split.
- Add the minimal CLI/helper surface needed for receipt rebuild and ship integration.
- Update both authoritative and packaged `ship-worktrees.sh` projections through the repository's established sync mechanism.
- Add focused unit and fixture tests, plus workflow/task artifacts required by the repository contract.

## Non-Scope

- Lease Protocol 2, `reviewing`, current-publication pointers, reopen/takeover/abandon, or any lease mutation.
- Publication recovery/reconcile beyond preserving and replaying the existing ship journal's recoverable publication phase.
- Readiness, fleet offers/acquire, feedback, board/UI, MCP mirroring, daemon behavior, remote publication refs, or auto-merge.
- Compatibility aliases, inferred identities, lossy markers, semantic fallbacks, or changes to `COORDINATION_PROTOCOL`.

## P1 Architecture Map

- Entry: `scripts/ship-worktrees.sh` linked-PR and explicit ship-journal reconcile paths.
- Core authority inputs: canonical sprint/lease identity already bound to the active contract worktree; local verification and merge-seal evidence; live GitHub repo/PR facts obtained through `gh`.
- New pure boundary: receipt canonicalization, validation, deterministic digest, marker encode/decode.
- New effects boundary: git-common-dir receipt cache, provider observation/update, rebuild verification.
- Outputs: immutable local receipt cache, full PR marker, enriched `pr_observed` journal payload. The lease remains untouched in this package.

## P2 Concrete Trace

1. The existing ship path finishes verification, seals the candidate, pushes the exact head, then creates or finds the PR.
2. Publication orchestration obtains provider repo ID, PR number/URL/head and combines them with the existing task/claim/generation, target/base/tree, review subject, verification, and merge-seal evidence.
3. The pure model validates the payload and derives the deterministic publication ID and receipt digest.
4. Effects atomically write the git-common-dir cache and replace/embed the single canonical marker in the PR body.
5. Only after both durable carriers agree does the ship journal append enriched `pr_observed`; any persistence failure reports `publication_incomplete`, stays in-progress, and is replayable by explicit ship-journal reconcile.
6. Rebuild reads the marker as untrusted input, re-fetches live provider facts, recomputes local evidence digests, validates equality, and atomically restores the same cache document.

## P3 Decision Rationale

- Keep receipt semantics in TypeScript and shell as orchestration only: this preserves typed validation and testability while matching the repository's core/effects split.
- Use one canonical stable-JSON byte representation for receipt digest and marker payload so cache, marker, journal, and rebuild cannot drift.
- Treat the PR marker as durable transport but never authority; all rebuild and adoption paths must revalidate external and local facts.
- Extend the current journal phase payload coherently instead of adding a second recovery log. At 10x publication volume, provider calls are the first scaling pressure; the deterministic local cache remains O(1) per publication.

## Task Breakdown

- [x] Define and test `PublicationReceiptV1`, canonical serialization/digest, deterministic publication ID, strict validation, and marker codec.
- [x] Implement atomic git-common-dir receipt storage, provider observation/marker update, rebuild, and typed errors.
- [x] Integrate the publication orchestration with normal ship and ship-journal reconcile; enrich `pr_observed` evidence and preserve explicit recovery.
- [x] Add focused fixture acceptance coverage for receipt/marker/rebuild/convergence, create-intent crash recovery, provider/worktree fencing, and partial failures; sync packaged helper projections.
- [ ] Run focused tests, root required checks, dry-run adoption parity, and strict workflow checks; record review evidence and close the package only if all gates pass.

## Verification Boundary

The package is independently accepted when the receipt-specific portion of PRD Acceptance Script 2 passes: live-head equality, complete marker, field-equivalent rebuild after cache deletion, and crash-retry identity convergence, plus forced receipt/marker failure and journal replay assertions.

## Rollback and Failure Handling

All product writes are additive/rebuildable: the local receipt cache may be deleted, and the PR marker may be restored from the previous PR body. The ship journal remains the sole recovery surface. Rollback removes the new command/model/effects integration and restores the previous helper projection; it never rewrites lease identity or task digests.

## Fragile Assumption

The active worktree exposes sufficient authoritative task/claim/generation and evidence paths at ship time. If any required field is unavailable, implementation must fail closed with a typed incomplete-publication error rather than infer it.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Define and test `PublicationReceiptV1`, canonical serialization/digest, deterministic publication ID, strict validation, and marker codec.
- [x] Implement atomic git-common-dir receipt storage, provider observation/marker update, rebuild, and typed errors.
- [x] Integrate the publication orchestration with normal ship and ship-journal reconcile; enrich `pr_observed` evidence and preserve explicit recovery.
- [x] Add focused fixture acceptance coverage for receipt/marker/rebuild/convergence, create-intent crash recovery, provider/worktree fencing, and partial failures; sync packaged helper projections.
- [ ] Run focused tests, root required checks, dry-run adoption parity, and strict workflow checks; record review evidence and close the package only if all gates pass.
