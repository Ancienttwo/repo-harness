# Plan: Validate architecture projection profile independently of ownership registry

> **Status**: Executing
> **Created**: 20260926-0007
> **Slug**: archctx-projection-profile
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260926-0007-archctx-projection-profile.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260926-0007-archctx-projection-profile.md`; after execution revert branch `codex/archctx-projection-profile` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260926-0007-archctx-projection-profile.contract.md`
> **Task Review**: `tasks/reviews/20260926-0007-archctx-projection-profile.review.md`
> **Implementation Notes**: `tasks/notes/20260926-0007-archctx-projection-profile.notes.md`

## Agentic Routing

Owner continuation (2026-09-26): create the CodeGraph index only in this worktree and complete normal acceptance for the consumer. Preserve architecture writer ownership; include only the resulting daemon-generated manifest in the scope. Resolve the previous proof-unavailable candidate through the supported proof-only reconciliation command. Do not fabricate semantic acceptance or weaken verification.

- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260926-0007-archctx-projection-profile.md`
- Sprint contract: `tasks/contracts/20260926-0007-archctx-projection-profile.contract.md`
- Sprint review: `tasks/reviews/20260926-0007-archctx-projection-profile.review.md`
- Implementation notes: `tasks/notes/20260926-0007-archctx-projection-profile.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260926-0007-archctx-projection-profile.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260926-0007-archctx-projection-profile.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260926-0007-archctx-projection-profile.md`.

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
- Contract file: `tasks/contracts/20260926-0007-archctx-projection-profile.contract.md`
- Review file: `tasks/reviews/20260926-0007-archctx-projection-profile.review.md`
- Implementation notes file: `tasks/notes/20260926-0007-archctx-projection-profile.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260926-0007-archctx-projection-profile.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260926-0007-archctx-projection-profile.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260926-0007-archctx-projection-profile.md`; after execution revert branch `codex/archctx-projection-profile` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260926-0007-archctx-projection-profile.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260926-0007-archctx-projection-profile.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260926-0007-archctx-projection-profile.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260926-0007-archctx-projection-profile.contract.md`, `tasks/reviews/20260926-0007-archctx-projection-profile.review.md`, and `tasks/notes/20260926-0007-archctx-projection-profile.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260926-0007-archctx-projection-profile.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260926-0007-archctx-projection-profile.md`; after execution revert branch `codex/archctx-projection-profile` or the explicitly reviewed diff.

## Captured Planning Output

# Projection profile validation for ArchContext issue 225

User approved ArchContext #225 contract alignment and controlled migration. This counterpart work-package is isolated from repo-harness main and other active worktrees. No release, global installation, merge or unrelated ownership-registry change is authorized.

## P1 map
The projection provider determines target paths for snapshots, orchestration and result authority. ArchContext owns repo-harness/v1 projection layout. The ownership registry has a different, deliberately restricted prefix language and metadata contract.

## P2 trace
verify-sprint prepare-acceptance -> automatic architecture projection -> captureArchitectureProjectionSnapshot -> architectureAgentContextTargets -> capabilityRegistryFromArchcontextNodes fails before provider execution on a valid projection-profile node with generic include/exclude globs. The caller needs explicit AGENTS/CLAUDE targets, not path ownership.

## P3 decision
Validate the projection profile directly: YAML object/schema, capability identity, explicit canonical repo-relative AGENTS/CLAUDE targets and containment. Retain all fail-closed target boundaries. Do not interpret source patterns, require ownership metadata, or change the registry resolver. Include every capability target the producer renders, including non-active nodes. At 10x nodes existing snapshot walking dominates. No extra subprocess or cache.

## Scope
Parent owns src/effects/architecture/archctx-provider.ts, existing tests/architecture-projection-provider.test.ts and this work-package workflow artifacts. No subagent writes. Preserve concurrent WIP.

## Task Breakdown
- [x] Capture failing focused regressions on unchanged provider.
- [x] Fix projection target validation without changing ownership registry.
- [x] Run focused provider/orchestration tests, typecheck and required repository integrity checks once.
- [x] Validate paired ArchContext candidate; record installed-runtime release boundary and current evidence.

## Validation
Pinned Bun 1.4.0 with task-scoped TMPDIR. Existing architecture-projection provider/orchestration tests, typecheck, hooks/helpers/reference-configs, deploy SQL, architecture sync, task sync, strict task workflow, state inspection and init dry-run. No broad benchmark/full-suite/release gate rerun.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture failing focused regressions on unchanged provider.
- [x] Fix projection target validation without changing ownership registry.
- [x] Run focused provider/orchestration tests, typecheck and required repository integrity checks once.
- [x] Validate paired ArchContext candidate; record installed-runtime release boundary and current evidence.


## Local verification and adoption boundary

Local counterpart correction is verified: 72 provider/orchestration tests, 389 assertions, typecheck and all required integrity checks pass. Task-sync first requested its exact substantive digest, then passed after the canonical note was bound. The independent read-only consumer security review found no introduced/worsened issue. A real ArchContext fresh initialized model configured through daemon ChangeSet produces the same targets in producer and consumer while retaining nested globs/exclusions and omitting unrelated metadata.

This is not installed-runtime or whole-plan acceptance. ArchContext live migration rolled back on its existing ADR write allowlist; its root AGENTS/CLAUDE write guard also conflicts with explicit profile targets. No dependency bump, release, global installation, remote publication or merge occurred. Preserve this isolated counterpart for the follow-up writer-contract slice and final paired acceptance.

## Approved CI repair continuation

Owner approved diagnosing and fixing the two campaign-closeout CI failures. P1: closeout tests materialize a cached historical campaign repository; the adoption builder owns Git initialization, while fixtureTemplate owns byte-for-byte snapshot and restore. P2: createAdoptionRepository -> historicalPlanningFixture commits/merge -> fixtureTemplate.capture cpSync -> Git removes objects/maintenance.lock while cpSync enumerates it (hosted ENOENT). P3 hypothesis: disable automatic Git maintenance in this disposable repository before its first commit, preserving all snapshot bytes and closeout semantics. Prove child-process admission with Git trace before applying the fix. At higher fixture concurrency an unquiesced background writer increases copy races. No copy retries, lock-file filtering, or product changes.

- [x] Prove the automatic-maintenance writer with a failing regression and positive trace control.
- [x] Configure the adoption fixture before Git mutations and run the full existing closeout test file.
- [x] Record evidence and prepare the bounded CI repair for the existing PR.
- [ ] Confirm hosted CI and refresh formal acceptance for the new subject.
