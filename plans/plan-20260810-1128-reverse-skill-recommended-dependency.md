# Plan: Reverse Skill recommended dependency

> **Status**: Review
> **Created**: 20260810-1128
> **Slug**: reverse-skill-recommended-dependency
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Explicit-only install/update, immutable upstream identity, tree-integrity readback, and unchanged default profiles must be regression-tested.
> **Rollback Surface**: Remove the catalog entry and provider-driven install projection.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260810-1128-reverse-skill-recommended-dependency.contract.md`
> **Task Review**: `tasks/reviews/20260810-1128-reverse-skill-recommended-dependency.review.md`
> **Implementation Notes**: `tasks/notes/20260810-1128-reverse-skill-recommended-dependency.notes.md`

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

- Active plan: `plans/plan-20260810-1128-reverse-skill-recommended-dependency.md`
- Sprint contract: `tasks/contracts/20260810-1128-reverse-skill-recommended-dependency.contract.md`
- Sprint review: `tasks/reviews/20260810-1128-reverse-skill-recommended-dependency.review.md`
- Implementation notes: `tasks/notes/20260810-1128-reverse-skill-recommended-dependency.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260810-1128-reverse-skill-recommended-dependency.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260810-1128-reverse-skill-recommended-dependency.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260810-1128-reverse-skill-recommended-dependency.md`.

## Approach
### Strategy
Treat `assets/skill-commands/manifest.json` as selection and integrity
authority. Keep both profiles unchanged, add one explicit install/update flag,
preserve Waza-only shared-rule handling, and prove the pinned provider through
staging-integrity and host-projection tests.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `assets/skill-commands/manifest.json` | Edit | Add an explicit-only package pinned to a commit and tree digest. |
| `src/cli/commands/init.ts` | Edit | Enumerate only profile-selected provider groups during repo init. |
| `src/cli/commands/global-runtime.ts` | Edit | Install/refresh/project selected providers and fail closed on digest drift. |
| `src/cli/index.ts` | Edit | Expose `--with-reverse-skill` for install and update. |
| `tests/` | Edit | Freeze catalog, install, refresh, and ownership behavior. |
| runtime docs | Edit | Describe the recommended dependency and bounded opt-out. |

### Code Snippets
Explicit flag -> required catalog package -> provider/host grouping -> `bunx
skills add <provider@commit> -s <selected names>` -> `.agents/skills/<name>`
full-tree SHA-256 readback -> symlink into the selected Claude/Codex host
roots. Waza additionally syncs its four shared rules after its provider command
succeeds; profile-selected paths never include Reverse Skill.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Upstream router assumes target mention is authorization | High | Agent may perform work outside real scope | Never select it from a profile; require explicit flag and document independent scope/RoE review |
| Mutable or drifted upstream content | Medium | Audited content and installed content diverge | Pin the provider commit and verify the selected tree digest before host projection |

## Task Contracts
- Contract file: `tasks/contracts/20260810-1128-reverse-skill-recommended-dependency.contract.md`
- Review file: `tasks/reviews/20260810-1128-reverse-skill-recommended-dependency.review.md`
- Implementation notes file: `tasks/notes/20260810-1128-reverse-skill-recommended-dependency.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260810-1128-reverse-skill-recommended-dependency.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260810-1128-reverse-skill-recommended-dependency.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Remove the catalog entry and provider-driven install projection.
- **Verification boundary**: Explicit-only install/update, missing-catalog and digest-mismatch failure, and unchanged profile defaults must be regression-tested.
- **Review/acceptance boundary**: `tasks/reviews/20260810-1128-reverse-skill-recommended-dependency.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260810-1128-reverse-skill-recommended-dependency.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260810-1128-reverse-skill-recommended-dependency.contract.md`, `tasks/reviews/20260810-1128-reverse-skill-recommended-dependency.review.md`, and `tasks/notes/20260810-1128-reverse-skill-recommended-dependency.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260810-1128-reverse-skill-recommended-dependency.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Remove the catalog entry and provider-driven install projection.

## Captured Planning Output

# Reverse Skill recommended dependency

## Goal
Add `reverse-skill-router` as a recommended but explicit-only external Skill for Claude and Codex, pinned to audited upstream content.

## Task Breakdown
- [x] Register `reverse-skill-router` as explicit-only with pinned provider commit and tree digest.
- [x] Add provider/host selection plus `--with-reverse-skill` install/update projection.
- [x] Fail closed when the catalog entry is missing or staged content fails integrity verification.
- [x] Document the upstream authorization conflict and independent scope-review boundary.
- [x] Add regression coverage for explicit selection, default exclusion, integrity, refresh, and ownership paths.
- [x] Run focused and repository gates.

## Invariants
- Minimal and full profile projections remain unchanged.
- `--with-reverse-skill` is the only selection route; `--no-external-skills` may be combined with it.
- Only `reverse-skill-router` is selected from the pinned upstream commit.
- Upstream target mention is never treated as authorization; runtime execution remains subject to independently verified scope and RoE.

## Verification
- bun test tests/skill-surface/catalog.test.ts tests/cli/init.test.ts tests/cli/global-runtime-init.test.ts
- bun run check:reference-configs
- bash scripts/check-architecture-sync.sh
- bash scripts/check-task-sync.sh
- repo-harness run check-task-workflow --strict

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Register `reverse-skill-router` as explicit-only with pinned provider commit and tree digest.
- [x] Add provider/host selection plus `--with-reverse-skill` install/update projection.
- [x] Fail closed when the catalog entry is missing or staged content fails integrity verification.
- [x] Document the upstream authorization conflict and independent scope-review boundary.
- [x] Add regression coverage for explicit selection, default exclusion, integrity, refresh, and ownership paths.
- [x] Run focused and repository gates.
