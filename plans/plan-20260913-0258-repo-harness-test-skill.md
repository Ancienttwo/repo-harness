# Plan: Ship the repo-harness-test skill as the testing policy router

> **Status**: Executing
> **Created**: 20260913-0258
> **Slug**: repo-harness-test-skill
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260913-0258-repo-harness-test-skill.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260913-0258-repo-harness-test-skill.md`; after execution revert branch `codex/repo-harness-test-skill` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260913-0258-repo-harness-test-skill.contract.md`
> **Task Review**: `tasks/reviews/20260913-0258-repo-harness-test-skill.review.md`
> **Implementation Notes**: `tasks/notes/20260913-0258-repo-harness-test-skill.notes.md`

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

- Active plan: `plans/plan-20260913-0258-repo-harness-test-skill.md`
- Sprint contract: `tasks/contracts/20260913-0258-repo-harness-test-skill.contract.md`
- Sprint review: `tasks/reviews/20260913-0258-repo-harness-test-skill.review.md`
- Implementation notes: `tasks/notes/20260913-0258-repo-harness-test-skill.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260913-0258-repo-harness-test-skill.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260913-0258-repo-harness-test-skill.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260913-0258-repo-harness-test-skill.md`.

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
- Contract file: `tasks/contracts/20260913-0258-repo-harness-test-skill.contract.md`
- Review file: `tasks/reviews/20260913-0258-repo-harness-test-skill.review.md`
- Implementation notes file: `tasks/notes/20260913-0258-repo-harness-test-skill.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260913-0258-repo-harness-test-skill.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260913-0258-repo-harness-test-skill.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260913-0258-repo-harness-test-skill.md`; after execution revert branch `codex/repo-harness-test-skill` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260913-0258-repo-harness-test-skill.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260913-0258-repo-harness-test-skill.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260913-0258-repo-harness-test-skill.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260913-0258-repo-harness-test-skill.contract.md`, `tasks/reviews/20260913-0258-repo-harness-test-skill.review.md`, and `tasks/notes/20260913-0258-repo-harness-test-skill.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260913-0258-repo-harness-test-skill.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260913-0258-repo-harness-test-skill.md`; after execution revert branch `codex/repo-harness-test-skill` or the explicitly reviewed diff.

## Captured Planning Output

# Ship the repo-harness-test skill as the testing policy router

## P1 Map
- Skill packages live under `assets/skills/<name>/` with `SKILL.md` plus `references/`.
- The single shipping registration point is `assets/skill-commands/manifest.json` (`version: 2`, `packages[]`
  plus `expectedProjections`). `src/core/skill-surface/catalog.ts` parses it; `src/cli/commands/init.ts`,
  `src/cli/installer/install-profile.ts`, `scripts/skill-surface-select.ts`,
  `scripts/sync-codex-installed-copies.sh` and `scripts/run-skill-routing-eval.ts` all read the parsed
  catalog. There is no second list to add.
- `computeFacadesForProfile` (catalog.ts) only projects `kind: "facade"` packages whose `profiles` include
  the install profile, so a shipped, profile-projected skill must be a facade.
- Prose policy authority for testing is `docs/reference-configs/sprint-contracts.md`
  `## Testing Policy and Artifact Standards` (authoring source `assets/reference-configs/sprint-contracts.md`).

## P2 Trace
- `repo-harness init` -> `install-profile.ts` -> `parseSkillSurfaceCatalog(manifest)` -> facade projection into
  `~/.claude/skills/<name>` and `~/.codex/skills/<name>` for every profile listing the package.
- Several tests pin the shipped surface as an exact set derived from that one manifest: they are the drift
  checks between the manifest and the declared surface, and each gains the new package name.

## P3 Decide
- The skill is a router only: it names four entrypoints and links their references. It restates no policy;
  `sprint-contracts.md` stays the single prose authority. The references carry executable technique and
  repo-specific tooling that the policy deliberately does not own.
- `profiles: ["full"]`, `component: "verifier"`: the testing surface belongs to the verification component,
  which the minimal profile does not install. This also keeps the minimal discovery matrix untouched.
- No new authority, no second policy, no runtime validator.

## Task Breakdown
- [ ] Author `assets/skills/repo-harness-test/SKILL.md` (<= 2048 bytes) plus four references.
- [ ] Register the package in `assets/skill-commands/manifest.json` and its `expectedProjections`.
- [ ] Add the package name to the manifest-derived surface inventories in
      `tests/skill-surface/catalog.test.ts`, `tests/skill-surface/canonical-packages.test.ts`,
      `tests/action-command-skills.test.ts`, `tests/skill-routing-eval.test.ts`.
- [ ] Add one routing row to `assets/reference-configs/agentic-development-flow.md` and sync the projection.
- [ ] Run the verification plan.

## Verification Plan
- `bun test tests/skill-surface tests/action-command-skills.test.ts tests/skill-routing-eval.test.ts tests/readme-dx.test.ts tests/install-profiles.test.ts tests/installed-copy-sync.test.ts`
- `bun run check:type`, `check:hooks`, `check:helpers`, `check:reference-configs`
- `bash scripts/check-architecture-sync.sh`, `bash scripts/check-task-workflow.sh --strict`
- `REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh`
- `bun src/cli/index.ts init --repo . --dry-run`

## Rollback
Revert branch `codex/repo-harness-test-skill`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Author `assets/skills/repo-harness-test/SKILL.md` (<= 2048 bytes) plus four references.
- [ ] Register the package in `assets/skill-commands/manifest.json` and its `expectedProjections`.
- [ ] Add the package name to the manifest-derived surface inventories in
- [ ] Add one routing row to `assets/reference-configs/agentic-development-flow.md` and sync the projection.
- [ ] Run the verification plan.
